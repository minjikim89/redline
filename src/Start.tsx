import { useEffect, useRef, useState } from 'react';
import { importHtml, type ImportReport } from './deck/importHtml';
import * as store from './annotations/store';

/**
 * The way in. Redline does not generate decks — plenty of tools do that well.
 * It takes one that already exists and makes it something a person and an agent
 * can work on together, so the entry point is a handover, not a blank page.
 */
export function Start({ onEnter }: { onEnter: () => void }) {
  const [over, setOver] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A previous session was picked up from localStorage. Offer to continue it —
  // reopening the sample over someone's half-finished review is data loss.
  const restored = store.restoredFromSave ? store.getState() : null;
  const restoredOpen = restored
    ? restored.annotations.filter(a => a.status === 'open').length : 0;

  /** Same path as a dropped file — handy for a demo, and it proves the parser. */
  const takeUrl = async (url: string, name: string) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Could not fetch ${name}`);
      setReport(importHtml(await r.text(), name));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally { setBusy(false); }
  };

  const take = async (file: File) => {
    setError(null);
    if (!/\.(html?|dc\.html)$/i.test(file.name)) {
      setError(`${file.name} is not an HTML file.`); return;
    }
    try {
      const r = importHtml(await file.text(), file.name);
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  // ?import=<url> runs the same parser, so an import can be linked to directly
  const auto = useRef(false);
  useEffect(() => {
    const u = new URLSearchParams(location.search).get('import');
    if (!u || auto.current) return;
    auto.current = true;
    takeUrl(u, u.split('/').pop() ?? 'deck.html');
  }, []);

  return (
    <div className="start">
      <div className="start-card">
        <header>
          <strong>Redline</strong>
          <p>A deck you and your agent both have hands in.</p>
        </header>

        {restored ? (
          <>
            <button className="st-primary" onClick={onEnter}>
              Continue where you left off
              <em>{restored.deck.title} · {restored.deck.slides.length} slides
                {restoredOpen > 0 && ` · ${restoredOpen} note${restoredOpen === 1 ? '' : 's'} open`}</em>
            </button>
            <button className="st-second" onClick={() => { store.reset(); onEnter(); }}>
              Start over with the sample briefing
              <em>From Screen to Cart · 12 slides, already marked up</em>
            </button>
          </>
        ) : (
          <button className="st-primary" onClick={onEnter}>
            Open the sample briefing
            <em>From Screen to Cart · 12 slides, already marked up</em>
          </button>
        )}

        <div className="st-or"><span>or bring your own</span></div>

        <label
          className={over ? 'st-drop over' : 'st-drop'}
          onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) take(f); }}
        >
          {/* Not `hidden`: a hidden input takes no focus, which left the only
              way to bring your own deck behind a mouse. */}
          <input type="file" accept=".html,.htm" className="st-file"
            aria-label="Choose an exported HTML deck"
            onChange={e => { const f = e.target.files?.[0]; if (f) take(f); }} />
          <span className="st-drop-t">Drop an exported HTML deck</span>
          <span className="st-drop-s">
            Sections become typed slides. Anything it isn't sure about stays as prose.
          </span>
        </label>

        <button className="st-try" disabled={busy}
          onClick={() => takeUrl(`${import.meta.env.BASE_URL}exported-deck-sample.html`, 'Q3 Infrastructure Review.html')}>
          {busy ? 'reading…' : 'no file handy? try one'}
        </button>

        {error && <p className="st-err">{error}</p>}

        {report && (
          <div className={report.fatal ? 'st-report bad' : 'st-report'}>
            <div className="st-r-h">
              <strong>{report.fatal ? 'Could not read that as a deck' : report.deck.title}</strong>
              {!report.fatal && <span>{report.sections} sections read</span>}
            </div>
            {report.fatal ? (
              <p className="st-r-fatal">{report.fatal}</p>
            ) : (
              <>
                {report.lossless && (
                  <p className="st-r-exact">
                    ✓ This file carries its own Redline model — restored exactly,
                    nothing re-guessed from markup.
                  </p>
                )}
                <ul className="st-r-types">
                  {Object.entries(report.recognised).map(([t, n]) => (
                    <li key={t}><b>{n}</b> {({
                      cover: 'cover', hero: 'headline figure', cards: 'card row',
                      barsPair: 'paired bars', flow: 'flow', figures: 'figures',
                      panels: 'metric panels', timeline: 'timeline', refs: 'references',
                    } as Record<string, string>)[t] ?? t}</li>
                  ))}
                </ul>
                {report.warnings.length > 0 && (
                  <ul className="st-r-warn">
                    {report.warnings.slice(0, 3).map(w => <li key={w}>{w}</li>)}
                  </ul>
                )}
                <button className="st-go" onClick={() => { store.loadDeck(report.deck); onEnter(); }}>
                  Open it →
                </button>
              </>
            )}
          </div>
        )}

        <p className="st-foot">
          Redline doesn't generate slides. It's what happens after — where the model
          normally goes blind the moment you fix something by hand.
        </p>
        <p className="st-env">
          Agent-ready in the ChatGPT desktop browser with <b>GPT-5.6 Sol or Terra</b> (Luna
          has WebMCP off), or in Chrome 149+ with <code>chrome://flags/#enable-webmcp-testing</code>.
        </p>
      </div>
    </div>
  );
}
