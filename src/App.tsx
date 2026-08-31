import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { registry } from './deck/registry';
import { EditCtx } from './deck/slideKit';
import { Inspector } from './deck/Inspector';
import { clampSlideIndex, slideIndexFromQuery } from './deck/nav';
import { Start } from './Start';
import { exportHtml } from './deck/exportHtml';
import { ARTBOARD } from './deck/theme';
import { InkLayer, type Mode } from './annotations/InkLayer';
import * as store from './annotations/store';
import { registerAll, syncConditionalTools, webmcpSupported } from './webmcp/tools';
import { buildScript, runScript } from './annotations/replay';

/** Outlines the region an agent flagged, inside the artboard so it scales with it. */
function ConflictRing({ elementId }: { elementId: string }) {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const slide = document.querySelector('.slide') as HTMLElement | null;
    const host = slide?.querySelector(`[data-el-id="${elementId}"]`) as HTMLElement | null;
    if (!slide || !host) return;
    const s = slide.getBoundingClientRect(), h = host.getBoundingClientRect();
    const k = ARTBOARD.w / s.width;                       // undo the artboard scale
    setBox({ x: (h.left - s.left) * k, y: (h.top - s.top) * k, w: h.width * k, h: h.height * k });
  }, [elementId]);
  if (!box) return null;
  return <div className="cf-ring" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />;
}

export default function App() {
  const s = useSyncExternalStore(store.subscribe, store.getState);
  const [current, setCurrent] = useState(() => slideIndexFromQuery(location.search));
  const [mode, setMode] = useState<Mode>('edit');
  const [tools, setTools] = useState<string[]>([]);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [fit, setFit] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  const [insp, setInsp] = useState(false);
  const [entered, setEntered] = useState(
    () => new URLSearchParams(location.search).has('deck')
      || new URLSearchParams(location.search).has('replay')
      || new URLSearchParams(location.search).has('slide'),
  );
  const [tick, setTick] = useState(0);
  const [saying, setSaying] = useState<string | null>(null);
  const replayCtl = useRef<AbortController | null>(null);

  const fitRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);

  // `?slide=` is hand-editable and a stale index survives a deck swap, so the
  // index is clamped everywhere it is read — the rail and the artboard must
  // never disagree about which slide is up.
  const idx = clampSlideIndex(current, s.deck.slides.length);
  const slide = s.deck.slides[idx];
  const Comp = registry[slide.type].component;

  /* The artboard renders at its authored 1920×1080 and is scaled to fit, so the
     author's own measurements survive at any viewport. Marks measure off the
     rendered rect, so they follow the scale for free. */
  useLayoutEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      const next = Math.min(width / ARTBOARD.w, height / ARTBOARD.h);
      setFit(next > 0 ? next : 0.5);
      setTick(t => t + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [insp]);

  const scale = fit * zoom;
  const zoomBy = (d: number) => setZoom(z => Math.min(3, Math.max(0.4, +(z + d).toFixed(2))));

  // ⌘/ctrl + wheel zooms, the way every canvas does
  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      e.preventDefault();
      zoomBy(e.deltaY > 0 ? -0.08 : 0.08);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // main.tsx already registered; this only reads back what is live.
  useEffect(() => { registerAll().then(r => { setSupported(r.supported); setTools(r.tools); }); }, []);

  // ?replay=1 starts the pass on load — used for recording and for checks.
  // The guard lives inside the timer, so StrictMode's mount/cleanup/mount
  // cycle cannot cancel the only scheduled start.
  const toggleReplayRef = useRef<(() => void) | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('replay')) return;
    const t = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      toggleReplayRef.current?.();
    }, 700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    syncConditionalTools().then(async () => {
      if (!webmcpSupported()) return;
      const t = await (document as any).modelContext.getTools();
      setTools(t.map((x: any) => x.name));
    });
  }, [s.annotations]);

  // A fix reflows the slide; marks re-anchor off the model, so re-measure after
  // paint. `scale` is in here too: marks are laid out from the rects read during
  // render, which are still the PREVIOUS layout when the scale itself changed —
  // without a pass after the commit every zoom and every resize leaves the ink
  // one step behind its element.
  useEffect(() => {
    const id = requestAnimationFrame(() => setTick(t => t + 1));
    return () => cancelAnimationFrame(id);
  }, [s.deck, idx, scale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === 'TEXTAREA' || el?.tagName === 'INPUT') return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault(); e.shiftKey ? store.redo() : store.undo();
      }
      if (mod) return;
      if (e.key === 'e' || e.key === 'E') setMode('edit');
      if (e.key === 'i' || e.key === 'I') setInsp(v => !v);
      if (e.key === '=' || e.key === '+') zoomBy(0.1);
      if (e.key === '-' || e.key === '_') zoomBy(-0.1);
      if (e.key === '0') setZoom(1);
      if (e.key === 'v' || e.key === 'V') setMode('move');
      if (e.key === 'p' || e.key === 'P') setMode('draw');
      if (e.key === 'ArrowRight') setCurrent(c => clampSlideIndex(c + 1, s.deck.slides.length));
      if (e.key === 'ArrowLeft') setCurrent(c => clampSlideIndex(c - 1, s.deck.slides.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.deck.slides.length]);

  const perSlide = useMemo(() => {
    const m = new Map<string, number>();
    s.annotations.filter(a => a.status === 'open')
      .forEach(a => m.set(a.slideId, (m.get(a.slideId) ?? 0) + 1));
    return m;
  }, [s.annotations]);

  const replaying = saying !== null;

  /* A visitor without an agent still needs to see the loop close. This runs the
     real tool implementations in the order an agent calls them — scripted, and
     labelled as such, but not faked. */
  const toggleReplay = async () => {
    if (replayCtl.current) { replayCtl.current.abort(); replayCtl.current = null; setSaying(null); return; }
    store.reset();
    const ac = new AbortController();
    replayCtl.current = ac;
    const steps = buildScript();
    try {
      await runScript(steps, (_i, st) => {
        setSaying(st.say);
        if (st.slideId) {
          const at = store.getState().deck.slides.findIndex(x => x.id === st.slideId);
          if (at >= 0) setCurrent(at);
        }
      }, ac.signal);
    } catch { /* stopped */ }
    if (replayCtl.current === ac) { replayCtl.current = null; setSaying(null); }
  };

  toggleReplayRef.current = toggleReplay;

  const marks = s.annotations.filter(a => a.slideId === slide.id);
  const openCount = s.annotations.filter(a => a.status === 'open').length;
  const W = ARTBOARD.w * scale, H = ARTBOARD.h * scale;

  if (!entered) return <Start onEnter={() => setEntered(true)} />;

  return (
    <div className={insp ? 'app with-insp' : 'app'}>
      <aside className="rail">
        <div className="brand">
          <strong>Redline</strong>
          <span>{s.deck.title}</span>
        </div>
        <ol className="thumbs">
          {s.deck.slides.map((sl, i) => (
            <li key={sl.id}>
              <button className={i === idx ? 'thumb on' : 'thumb'} onClick={() => setCurrent(i)}>
                <span className="tn">{i + 1}</span>
                <span className="tt">{sl.props.title ?? sl.props.eyebrow ?? 'Cover'}</span>
                {perSlide.get(sl.id) && <span className="tp">{perSlide.get(sl.id)}</span>}
              </button>
            </li>
          ))}
        </ol>
        <div className="queue">
          <span className="q-n">{openCount}</span>
          <span className="q-l">{openCount === 1 ? 'note open' : 'notes open'}</span>
          {openCount > 0 && <button className="q-x" onClick={() => store.clearOpen()}>clear</button>}
        </div>
        {s.calls.length > 0 && (
          <div className="trail">
            <div className="trail-h">tool calls</div>
            <ol>
              {s.calls.slice(-7).reverse().map(c => (
                <li key={c.id} className={c.ok ? '' : 'bad'}>
                  <code>{c.name}</code>
                  <span>{c.detail}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className={`mcp ${supported === false ? 'off' : supported ? 'on' : ''}`}>
          <div className="mcp-h">
            {supported === null ? 'Checking WebMCP…'
              : supported ? `WebMCP live · ${tools.length} tools` : 'WebMCP unavailable'}
          </div>
          {supported && <div className="mcp-l">{tools.join(' · ')}</div>}
          {supported === false && (
            <div className="mcp-l">
              Enable chrome://flags/#enable-webmcp-testing, or open in the ChatGPT app browser.
            </div>
          )}
        </div>
      </aside>

      <main className="stage">
        <div className="fit" ref={fitRef}>
          <div className="canvas" ref={canvasRef} style={{ width: W, height: H }} data-tick={tick}>
            <div className="slide" ref={slideRef} data-tone={slide.tone ?? 'light'}
              style={{ transform: `scale(${scale})` }}>
              <EditCtx.Provider value={{ slideId: slide.id, editing: mode === 'edit' }}>
                <Comp {...slide.props} tone={slide.tone} />
              </EditCtx.Provider>
              {slide.conflict && <ConflictRing elementId={slide.conflict.elementId} />}
            </div>
            {mode === 'edit' && 'chartForm' in registry[slide.type].propSchema && (
              <div className="formpick">
                <span>chart</span>
                {(registry[slide.type].propSchema.chartForm.enum as string[]).map(f => (
                  <button key={f} className={slide.props.chartForm === f ? 'on' : ''}
                    onClick={() => store.setByPath(slide.id, 'chartForm', f)}>{f}</button>
                ))}
              </div>
            )}
            <InkLayer
              slideId={slide.id}
              mode={mode}
              canvasRef={canvasRef}
              slideRef={slideRef}
              annotations={marks}
              selected={s.selected}
              onDone={() => setTick(t => t + 1)}
            />
          </div>
        </div>

        {/* The banner is chrome about the slide, not part of the artboard. It sits
            in the stage's own column so the fit gives it room — parked under the
            canvas it landed on top of the toolbar, and its two buttons with it. */}
        {slide.conflict && (
          <div className="conflict">
            <div className="cf-h">
              <span className="cf-tag">agent flagged a claim</span>
              <span className="cf-src">from the figure it just verified</span>
            </div>
            <p className="cf-claim">“{slide.conflict.claim}”</p>
            <p className="cf-why">{slide.conflict.why}</p>
            <div className="cf-acts">
              <button className="cf-keep" onClick={() => store.clearConflict(slide.id)}>
                keep the claim
              </button>
              <button className="cf-edit" onClick={() => {
                const next = prompt('Rewrite the claim:', String(slide.props.title ?? ''));
                if (next) store.updateSlideProps(slide.id, { title: next });
                store.clearConflict(slide.id);
              }}>rewrite it</button>
            </div>
          </div>
        )}

        <div className="toolbar">
          <div className="modes">
            <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}
              title="Edit text (E)">✚ edit</button>
            <button className={mode === 'draw' ? 'on' : ''} onClick={() => setMode('draw')}
              title="Draw a note (P)">✎ note</button>
            <button className={mode === 'move' ? 'on' : ''} onClick={() => setMode('move')}
              title="Move marks (V)">✥ move</button>
          </div>
          <span className="tb-sep" />
          <button disabled={!store.canUndo()} onClick={() => store.undo()} title="Undo ⌘Z">↶ undo</button>
          <button disabled={!store.canRedo()} onClick={() => store.redo()} title="Redo ⇧⌘Z">↷ redo</button>
          <span className="tb-sep" />
          <div className="zoom">
            <button onClick={() => zoomBy(-0.1)} title="Zoom out (−)">−</button>
            <button className="z-n" onClick={() => setZoom(1)} title="Reset (0)">
              {Math.round(scale * 100)}%
            </button>
            <button onClick={() => zoomBy(0.1)} title="Zoom in (+)">+</button>
          </div>
          <button className={insp ? 'insp-t on' : 'insp-t'} onClick={() => setInsp(v => !v)}
            title="Properties (I)">⚙ props</button>
          <button onClick={() => {
            const blob = new Blob([exportHtml(s.deck)], { type: 'text/html' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${s.deck.title.replace(/[^\w\s-]/g, '').trim() || 'deck'}.html`;
            a.click();
            URL.revokeObjectURL(a.href);
          }} title="Export the deck as standalone HTML">↓ export</button>
          <span className="tb-sep" />
          <button className={replaying ? 'replay on' : 'replay'} onClick={toggleReplay}>
            {replaying ? '■ stop' : '▶ watch a pass'}
          </button>
          <span className="tb-sep" />
          <span className={replaying ? 'tb-hint saying' : 'tb-hint'}>
            {replaying
              ? `${saying} · scripted, running the real tools`
              : mode === 'edit'
                ? 'Click any text to rewrite it. ⚙ props opens the rest of the slide.'
                : mode === 'draw'
                  ? 'Circle anything on the slide, then write in the margin.'
                  : 'Drag a mark or a note to reposition it.'}
          </span>
        </div>
      </main>

      {insp && <Inspector slide={slide} />}
    </div>
  );
}
