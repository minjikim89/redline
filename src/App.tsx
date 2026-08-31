import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { registry } from './deck/registry';
import { SlideScope } from './deck/El';
import { InkLayer } from './annotations/InkLayer';
import * as store from './annotations/store';
import { registerAll, syncConditionalTools, webmcpSupported } from './webmcp/tools';

export default function App() {
  const s = useSyncExternalStore(store.subscribe, store.getState);
  // deep link: ?slide=6 — used for demo cuts and for screenshot checks
  const [current, setCurrent] = useState(() => {
    const n = Number(new URLSearchParams(location.search).get('slide'));
    return Number.isFinite(n) && n > 0 ? n - 1 : 0;
  });
  const [tools, setTools] = useState<string[]>([]);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [tick, setTick] = useState(0);          // re-measure marks after layout changes
  const canvasRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);

  const slide = s.deck.slides[current];
  const Comp = registry[slide.type].component;

  useEffect(() => { registerAll().then(r => { setSupported(r.supported); setTools(r.tools); }); }, []);

  // Open notes decide which tools exist, so re-sync whenever the queue moves.
  useEffect(() => {
    syncConditionalTools().then(async () => {
      if (!webmcpSupported()) return;
      const t = await (document as any).modelContext.getTools();
      setTools(t.map((x: any) => x.name));
    });
  }, [s.annotations]);

  // The agent's own fix reflows the slide. Marks re-anchor off the model, so
  // just nudge a re-render once the new layout has settled.
  useEffect(() => {
    const id = requestAnimationFrame(() => setTick(t => t + 1));
    return () => cancelAnimationFrame(id);
  }, [s.deck, current]);

  useEffect(() => {
    const on = () => setTick(t => t + 1);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const perSlide = useMemo(() => {
    const m = new Map<string, number>();
    s.annotations.filter(a => a.status === 'open')
      .forEach(a => m.set(a.slideId, (m.get(a.slideId) ?? 0) + 1));
    return m;
  }, [s.annotations]);

  const marks = s.annotations.filter(a => a.slideId === slide.id);
  const openCount = s.annotations.filter(a => a.status === 'open').length;

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

        <div className="queue">
          <span className="q-n">{openCount}</span>
          <span className="q-l">{openCount === 1 ? 'note open' : 'notes open'}</span>
          {openCount > 0 && (
            <button className="q-x" onClick={() => s.annotations
              .filter(a => a.status === 'open').forEach(a => store.removeAnnotation(a.id))}>
              clear
            </button>
          )}
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
        <div className="canvas" ref={canvasRef} data-tick={tick}>
          <SlideScope value={slide.id}>
            <div className="slide" ref={slideRef}>
              <Comp {...slide.props} />
            </div>
          </SlideScope>

          <InkLayer
            slideId={slide.id}
            canvasRef={canvasRef}
            slideRef={slideRef}
            annotations={marks}
            onDone={() => setTick(t => t + 1)}
          />
        </div>

        <p className="hint">
          Circle anything on the slide, then write in the margin. The mark resolves to
          what's under it, so your agent knows exactly what you meant.
        </p>
      </main>
    </div>
  );
}
