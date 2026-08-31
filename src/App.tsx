import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { registry } from './deck/registry';
import { ARTBOARD } from './deck/theme';
import { InkLayer, type Mode } from './annotations/InkLayer';
import * as store from './annotations/store';
import { registerAll, syncConditionalTools, webmcpSupported } from './webmcp/tools';

export default function App() {
  const s = useSyncExternalStore(store.subscribe, store.getState);
  const [current, setCurrent] = useState(() => {
    const n = Number(new URLSearchParams(location.search).get('slide'));
    return Number.isFinite(n) && n > 0 ? n - 1 : 0;
  });
  const [mode, setMode] = useState<Mode>('draw');
  const [tools, setTools] = useState<string[]>([]);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [scale, setScale] = useState(0.5);
  const [tick, setTick] = useState(0);

  const fitRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);

  const slide = s.deck.slides[Math.min(current, s.deck.slides.length - 1)];
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
      setScale(next > 0 ? next : 0.5);
      setTick(t => t + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { registerAll().then(r => { setSupported(r.supported); setTools(r.tools); }); }, []);

  useEffect(() => {
    syncConditionalTools().then(async () => {
      if (!webmcpSupported()) return;
      const t = await (document as any).modelContext.getTools();
      setTools(t.map((x: any) => x.name));
    });
  }, [s.annotations]);

  // A fix reflows the slide; marks re-anchor off the model, so re-measure after paint.
  useEffect(() => {
    const id = requestAnimationFrame(() => setTick(t => t + 1));
    return () => cancelAnimationFrame(id);
  }, [s.deck, current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === 'TEXTAREA' || el?.tagName === 'INPUT') return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault(); e.shiftKey ? store.redo() : store.undo();
      }
      if (mod) return;
      if (e.key === 'v' || e.key === 'V') setMode('move');
      if (e.key === 'p' || e.key === 'P') setMode('draw');
      if (e.key === 'ArrowRight') setCurrent(c => Math.min(c + 1, s.deck.slides.length - 1));
      if (e.key === 'ArrowLeft') setCurrent(c => Math.max(c - 1, 0));
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

  const marks = s.annotations.filter(a => a.slideId === slide.id);
  const openCount = s.annotations.filter(a => a.status === 'open').length;
  const W = ARTBOARD.w * scale, H = ARTBOARD.h * scale;

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
              <Comp {...slide.props} tone={slide.tone} />
            </div>
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

        <div className="toolbar">
          <div className="modes">
            <button className={mode === 'draw' ? 'on' : ''} onClick={() => setMode('draw')}
              title="Draw (P)">✎ draw</button>
            <button className={mode === 'move' ? 'on' : ''} onClick={() => setMode('move')}
              title="Move (V)">✥ move</button>
          </div>
          <span className="tb-sep" />
          <button disabled={!store.canUndo()} onClick={() => store.undo()} title="Undo ⌘Z">↶ undo</button>
          <button disabled={!store.canRedo()} onClick={() => store.redo()} title="Redo ⇧⌘Z">↷ redo</button>
          <span className="tb-sep" />
          <span className="tb-hint">
            {mode === 'draw'
              ? 'Circle anything on the slide, then write in the margin.'
              : 'Drag a mark or a note to reposition it. Press P to draw again.'}
          </span>
        </div>
      </main>
    </div>
  );
}
