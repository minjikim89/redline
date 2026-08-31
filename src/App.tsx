import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { registry } from './deck/registry';
import { SlideScope } from './deck/El';
import * as store from './annotations/store';
import { registerAll, syncConditionalTools, webmcpSupported } from './webmcp/tools';
import type { AnnotationKind } from './deck/types';

const KINDS: { k: AnnotationKind; label: string; hint: string }[] = [
  { k: 'fix',       label: 'Fix',       hint: 'Change this' },
  { k: 'research',  label: 'Research',  hint: 'Verify or find a number' },
  { k: 'visualize', label: 'Visualize', hint: 'Wrong chart for this data' },
  { k: 'explain',   label: 'Explain',   hint: 'Why is it like this?' },
];

export default function App() {
  const s = useSyncExternalStore(store.subscribe, store.getState);
  const [current, setCurrent] = useState(0);
  const [draft, setDraft] = useState<{ slideId: string; elementId: string } | null>(null);
  const [kind, setKind] = useState<AnnotationKind>('fix');
  const [body, setBody] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [supported, setSupported] = useState<boolean | null>(null);

  const slide = s.deck.slides[current];
  const Comp = registry[slide.type].component;

  useEffect(() => {
    registerAll().then(r => { setSupported(r.supported); setTools(r.tools); });
  }, []);

  // Open notes drive which tools exist. Re-sync whenever the queue changes.
  useEffect(() => {
    syncConditionalTools().then(async () => {
      if (!webmcpSupported()) return;
      const t = await (document as any).modelContext.getTools();
      setTools(t.map((x: any) => x.name));
    });
  }, [s.annotations]);

  const perSlide = useMemo(() => {
    const m = new Map<string, number>();
    s.annotations.filter(a => a.status === 'open')
      .forEach(a => m.set(a.slideId, (m.get(a.slideId) ?? 0) + 1));
    return m;
  }, [s.annotations]);

  const onCanvasClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('[data-el-id]') as HTMLElement | null;
    if (!el) return;
    setDraft({ slideId: el.dataset.slideId!, elementId: el.dataset.elId! });
    setBody(''); setKind('fix');
  };

  const commit = () => {
    if (!draft || !body.trim()) return;
    store.addAnnotation({ ...draft, kind, body: body.trim() });
    setDraft(null); setBody('');
  };

  const openNotes = s.annotations.filter(a => a.status === 'open');
  const doneNotes = s.annotations.filter(a => a.status === 'resolved');

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <strong>Redline</strong>
          <span>{s.deck.title}</span>
        </div>
        <ol className="thumbs">
          {s.deck.slides.map((sl, i) => (
            <li key={sl.id}>
              <button className={i === current ? 'thumb on' : 'thumb'} onClick={() => setCurrent(i)}>
                <span className="tn">{i + 1}</span>
                <span className="tt">{sl.props.title ?? sl.props.caption ?? 'Cover'}</span>
                {perSlide.get(sl.id) && <span className="tp">{perSlide.get(sl.id)}</span>}
              </button>
            </li>
          ))}
        </ol>
        <div className={`mcp ${supported === false ? 'off' : supported ? 'on' : ''}`}>
          <div className="mcp-h">
            {supported === null ? 'Checking WebMCP…'
              : supported ? `WebMCP live · ${tools.length} tools` : 'WebMCP unavailable'}
          </div>
          {supported && <div className="mcp-l">{tools.join(' · ')}</div>}
          {supported === false && (
            <div className="mcp-l">Enable chrome://flags/#enable-webmcp-testing, or open in the ChatGPT app browser.</div>
          )}
        </div>
      </aside>

      <main className="stage">
        <div className="canvas" onClick={onCanvasClick}>
          <SlideScope value={slide.id}>
            <div className="slide">
              <Comp {...slide.props} />
              {openNotes.filter(a => a.slideId === slide.id).map((a, i) => (
                <Pin key={a.id} n={i + 1} elementId={a.elementId} kind={a.kind} />
              ))}
            </div>
          </SlideScope>
        </div>
        <p className="hint">Click any region of the slide to pin a note.</p>
      </main>

      <aside className="panel">
        {draft ? (
          <div className="composer">
            <div className="anchor">
              pinned to <code>{draft.slideId}</code> · <code>{draft.elementId}</code>
            </div>
            <div className="kinds">
              {KINDS.map(k => (
                <button key={k.k} title={k.hint}
                  className={kind === k.k ? `kind on k-${k.k}` : `kind k-${k.k}`}
                  onClick={() => setKind(k.k)}>{k.label}</button>
              ))}
            </div>
            <textarea autoFocus value={body} placeholder={KINDS.find(k => k.k === kind)!.hint}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit(); }} />
            <div className="row">
              <button className="ghost" onClick={() => setDraft(null)}>Cancel</button>
              <button className="solid" disabled={!body.trim()} onClick={commit}>Pin note</button>
            </div>
          </div>
        ) : (
          <div className="panel-h">
            <h3>Notes</h3>
            <span>{openNotes.length} open</span>
          </div>
        )}

        <div className="notes">
          {openNotes.length === 0 && !draft && <p className="empty">No open notes yet.</p>}
          {openNotes.map(a => (
            <Note key={a.id} a={a} onGo={() =>
              setCurrent(s.deck.slides.findIndex(x => x.id === a.slideId))} />
          ))}
          {doneNotes.length > 0 && <div className="sep">Resolved</div>}
          {doneNotes.map(a => <Note key={a.id} a={a} done onGo={() =>
            setCurrent(s.deck.slides.findIndex(x => x.id === a.slideId))} />)}
        </div>
      </aside>
    </div>
  );
}

function Pin({ n, elementId, kind }: { n: number; elementId: string; kind: AnnotationKind }) {
  const [box, setBox] = useState<DOMRect | null>(null);
  useEffect(() => {
    const host = document.querySelector(`[data-el-id="${elementId}"]`) as HTMLElement | null;
    const canvas = document.querySelector('.slide') as HTMLElement | null;
    if (!host || !canvas) return;
    const h = host.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    setBox(new DOMRect(h.left - c.left, h.top - c.top, h.width, h.height));
  }, [elementId, n]);
  if (!box) return null;
  return (
    <>
      <div className={`pin-box k-${kind}`}
        style={{ left: box.x, top: box.y, width: box.width, height: box.height }} />
      <div className={`pin k-${kind}`} style={{ left: box.x - 11, top: box.y - 11 }}>{n}</div>
    </>
  );
}

function Note({ a, done, onGo }: { a: any; done?: boolean; onGo: () => void }) {
  return (
    <div className={`note${done ? ' done' : ''}`}>
      <div className="note-h">
        <span className={`tag k-${a.kind}`}>{a.kind}</span>
        <button className="link" onClick={onGo}>{a.slideId} · {a.elementId}</button>
        {!done && <button className="x" title="Delete"
          onClick={() => store.removeAnnotation(a.id)}>×</button>}
      </div>
      <p className="note-b">{a.body}</p>
      {a.replies.map((r: any) => (
        <div key={r.id} className="reply">
          <span className="who">{r.author}</span>{r.body}
        </div>
      ))}
    </div>
  );
}
