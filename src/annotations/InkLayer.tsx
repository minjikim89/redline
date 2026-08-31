import { useEffect, useRef, useState } from 'react';
import type { Annotation, AnnotationKind, Pt, Target } from '../deck/types';
import { decimate, toPath, centroid, nearestPoint, resolveTargets, leaderPath } from './ink';
import * as store from './store';

const KINDS: { k: AnnotationKind; label: string }[] = [
  { k: 'fix', label: 'Fix' }, { k: 'research', label: 'Research' },
  { k: 'visualize', label: 'Visualize' }, { k: 'explain', label: 'Explain' },
];

interface Draft { stroke: Pt[]; targets: Target[]; labelAt: Pt }

export type Mode = 'draw' | 'move';

interface Drag { id: string; part: 'label' | 'stroke'; from: Pt; dx: number; dy: number }

export function InkLayer({ slideId, mode, canvasRef, slideRef, annotations, selected, onDone }: {
  slideId: string;
  mode: Mode;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  slideRef: React.RefObject<HTMLDivElement | null>;
  annotations: Annotation[];
  selected: string | null;
  onDone: () => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [live, setLive] = useState<Pt[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [kind, setKind] = useState<AnnotationKind>('fix');
  const [body, setBody] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDraft(null); setLive(null); store.select(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const canvasPt = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent) => {
    if (draft || mode === 'move') return;
    store.select(null);
    drawing.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setLive([canvasPt(e)]);
  };
  const move = (e: React.PointerEvent) => {
    if (drag) {
      const p = canvasPt(e);
      setDrag(d => (d ? { ...d, dx: p.x - d.from.x, dy: p.y - d.from.y } : d));
      return;
    }
    if (!drawing.current) return;
    setLive(s => (s ? [...s, canvasPt(e)] : s));
  };

  const startDrag = (e: React.PointerEvent, id: string, part: 'label' | 'stroke') => {
    if (mode !== 'move') return false;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ id, part, from: canvasPt(e), dx: 0, dy: 0 });
    return true;
  };

  const endDrag = () => {
    if (!drag) return;
    const cRect = canvasRef.current!.getBoundingClientRect();
    const sRect = slideRef.current!.getBoundingClientRect();
    if (Math.abs(drag.dx) > 1 || Math.abs(drag.dy) > 1) {
      store.moveAnnotation(drag.id, drag.part === 'label'
        ? { label: { x: drag.dx / cRect.width, y: drag.dy / cRect.height } }
        : { stroke: { x: drag.dx / sRect.width, y: drag.dy / sRect.height } });
    }
    setDrag(null);
    onDone();
  };

  const finish = () => {
    if (drag) { endDrag(); return; }
    drawing.current = false;
    const pts = decimate(live ?? []);
    setLive(null);
    if (pts.length < 4) return;                      // a tap is not a mark

    const canvas = canvasRef.current!, slide = slideRef.current!;
    const cRect = canvas.getBoundingClientRect(), sRect = slide.getBoundingClientRect();
    const off = { x: sRect.left - cRect.left, y: sRect.top - cRect.top };
    const targets = resolveTargets(pts.map(p => ({ x: p.x - off.x, y: p.y - off.y })), slide);

    const c = centroid(pts);
    // park the note in the nearer margin, outside the artboard, pointing in
    const onLeft = c.x < cRect.width / 2;
    setDraft({
      stroke: pts, targets,
      labelAt: {
        x: onLeft ? -196 : cRect.width + 18,
        y: Math.max(-40, Math.min(cRect.height - 40, c.y - 30)),
      },
    });
    setBody('');
  };

  const commit = () => {
    if (!draft || !body.trim()) return;
    const slide = slideRef.current!, canvas = canvasRef.current!;
    const cRect = canvas.getBoundingClientRect(), sRect = slide.getBoundingClientRect();
    const off = { x: sRect.left - cRect.left, y: sRect.top - cRect.top };
    store.addAnnotation({
      slideId, kind, body: body.trim(), targets: draft.targets,
      stroke: draft.stroke.map(p => ({
        x: (p.x - off.x) / sRect.width, y: (p.y - off.y) / sRect.height,
      })),
      labelAt: { x: draft.labelAt.x / cRect.width, y: draft.labelAt.y / cRect.height },
    });
    setDraft(null); setBody(''); onDone();
  };

  const cRect = canvasRef.current?.getBoundingClientRect();
  const sRect = slideRef.current?.getBoundingClientRect();
  const off = cRect && sRect
    ? { x: sRect.left - cRect.left, y: sRect.top - cRect.top, w: sRect.width, h: sRect.height }
    : null;

  const geom = (a: Annotation) => {
    const d = drag?.id === a.id ? drag : null;
    const sd = d?.part === 'stroke' ? d : null;
    const ld = d?.part === 'label' ? d : null;
    const pts = a.stroke.map(p => ({
      x: p.x * off!.w + off!.x + (sd?.dx ?? 0),
      y: p.y * off!.h + off!.y + (sd?.dy ?? 0),
    }));
    const lab = {
      x: a.labelAt.x * cRect!.width + (ld?.dx ?? 0),
      y: a.labelAt.y * cRect!.height + (ld?.dy ?? 0),
    };
    return { pts, lab, anchor: { x: lab.x + 84, y: lab.y + 22 } };
  };

  return (
    <>
      <svg className={`ink mode-${mode}${drag ? ' dragging' : ''}`}
        onPointerDown={down} onPointerMove={move}
        onPointerUp={finish} onPointerLeave={finish}>
        <defs>
          <filter id="rough" x="-12%" y="-12%" width="124%" height="124%">
            <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>

        {off && cRect && annotations.map(a => {
          const { pts, anchor } = geom(a);
          const on = selected === a.id || hover === a.id;
          return (
            <g key={a.id}
              className={`mark k-${a.kind}${a.status === 'resolved' ? ' done' : ''}${on ? ' on' : ''}`}>
              <path className="lead" d={leaderPath(anchor, nearestPoint(pts, anchor))} />
              <path className="stroke" d={toPath(pts)} />
              {/* fat invisible path so the thin ink is actually clickable */}
              <path className="hit" d={toPath(pts)}
                onPointerDown={e => {
                  if (startDrag(e, a.id, 'stroke')) return;
                  e.stopPropagation(); store.select(a.id);
                }}
                onPointerEnter={() => setHover(a.id)}
                onPointerLeave={() => setHover(h => (h === a.id ? null : h))} />
            </g>
          );
        })}

        {live && live.length > 1 && (
          <path className={`stroke live k-${kind}`} d={toPath(decimate(live))} />
        )}
        {draft && <path className={`stroke k-${kind}`} d={toPath(draft.stroke)} />}
      </svg>

      {cRect && annotations.map(a => {
        const { lab } = geom(a);
        const on = selected === a.id;
        return (
          <div key={a.id}
            className={`scribble k-${a.kind}${a.status === 'resolved' ? ' done' : ''}${on ? ' on' : ''}`}
            style={{ left: lab.x, top: lab.y }}
            onPointerDown={e => {
              if (startDrag(e, a.id, 'label')) return;
              e.stopPropagation(); store.select(on ? null : a.id);
            }}
            onPointerEnter={() => setHover(a.id)}
            onPointerLeave={() => setHover(h => (h === a.id ? null : h))}>
            <span className="scribble-kind">{a.kind}</span>
            {a.body}
            {a.replies.map(r => (
              <span key={r.id} className="scribble-reply">↳ {r.body}</span>
            ))}
            {on && (
              <div className="mark-acts" onPointerDown={e => e.stopPropagation()}>
                {a.status === 'open'
                  ? <button onClick={() => { store.resolveAnnotation(a.id); store.select(null); }}>✓ resolve</button>
                  : <button onClick={() => store.reopenAnnotation(a.id)}>↺ reopen</button>}
                <button className="danger"
                  onClick={() => { store.removeAnnotation(a.id); store.select(null); }}>✕ delete</button>
              </div>
            )}
          </div>
        );
      })}

      {draft && (
        <div className="scribble-edit" style={{ left: draft.labelAt.x, top: draft.labelAt.y }}>
          <div className="se-kinds">
            {KINDS.map(k => (
              <button key={k.k} className={kind === k.k ? `se-k on k-${k.k}` : 'se-k'}
                onClick={() => setKind(k.k)}>{k.label}</button>
            ))}
          </div>
          <textarea autoFocus value={body} placeholder="write it like you'd write it in the margin…"
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
            }} />
          <div className="se-hit-row">
            {draft.targets.length
              ? <span className="se-hit">on {draft.targets.map(t => t.label).slice(0, 2).join(', ')}</span>
              : <span className="se-hit dim">nothing under the mark</span>}
          </div>
          <div className="se-foot">
            <button className="se-redo" onClick={() => setDraft(null)}>redraw</button>
            <span className="se-key"><kbd>esc</kbd> cancel · <kbd>↵</kbd> pin</span>
          </div>
        </div>
      )}
    </>
  );
}
