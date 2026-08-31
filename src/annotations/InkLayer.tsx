import { useRef, useState } from 'react';
import type { AnnotationKind, Pt, Target } from '../deck/types';
import { decimate, toPath, centroid, nearestPoint, resolveTargets, leaderPath } from './ink';
import * as store from './store';

const KINDS: { k: AnnotationKind; label: string }[] = [
  { k: 'fix', label: 'Fix' }, { k: 'research', label: 'Research' },
  { k: 'visualize', label: 'Visualize' }, { k: 'explain', label: 'Explain' },
];

interface Draft { stroke: Pt[]; targets: Target[]; labelAt: Pt }

/**
 * You mark the deck the way you'd mark paper: circle it, then write in the
 * margin. The stroke is captured over the whole canvas, so notes live in the
 * whitespace and point inward.
 */
export function InkLayer({ slideId, canvasRef, slideRef, annotations, onDone }: {
  slideId: string;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  slideRef: React.RefObject<HTMLDivElement | null>;
  annotations: any[];
  onDone: () => void;
}) {
  const [live, setLive] = useState<Pt[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [kind, setKind] = useState<AnnotationKind>('fix');
  const [body, setBody] = useState('');
  const drawing = useRef(false);

  const canvasPt = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent) => {
    if (draft) return;
    drawing.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setLive([canvasPt(e)]);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    setLive(s => (s ? [...s, canvasPt(e)] : s));
  };
  const up = () => {
    drawing.current = false;
    const pts = decimate(live ?? []);
    setLive(null);
    if (pts.length < 4) return;                       // ignore taps

    const canvas = canvasRef.current!, slide = slideRef.current!;
    const cRect = canvas.getBoundingClientRect(), sRect = slide.getBoundingClientRect();
    const off = { x: sRect.left - cRect.left, y: sRect.top - cRect.top };

    // resolve in slide space
    const inSlide = pts.map(p => ({ x: p.x - off.x, y: p.y - off.y }));
    const targets = resolveTargets(inSlide, slide);

    const c = centroid(pts);
    // put the note in whichever margin is roomier
    const right = c.x < cRect.width / 2;
    setDraft({
      stroke: pts,
      targets,
      labelAt: { x: right ? Math.min(cRect.width - 210, c.x + 150) : Math.max(14, c.x - 260), y: c.y - 26 },
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
      // normalize: stroke to the slide box, label to the canvas box
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

  return (
    <>
      <svg className="ink" onPointerDown={down} onPointerMove={move}
        onPointerUp={up} onPointerLeave={up}>
        <defs>
          {/* a little wobble, so strokes read as drawn rather than plotted */}
          <filter id="rough" x="-12%" y="-12%" width="124%" height="124%">
            <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        {/* committed marks */}
        {off && annotations.map((a) => {
          const pts = a.stroke.map((p: Pt) => ({ x: p.x * off.w + off.x, y: p.y * off.h + off.y }));
          const lab = cRect
            ? { x: a.labelAt.x * cRect.width, y: a.labelAt.y * cRect.height }
            : centroid(pts);
          const anchor = { x: lab.x + 84, y: lab.y + 22 };
          const tip = nearestPoint(pts, anchor);
          return (
            <g key={a.id} className={`mark k-${a.kind}${a.status === 'resolved' ? ' done' : ''}`}>
              <path className="lead" d={leaderPath(anchor, tip)} />
              <path className="stroke" d={toPath(pts)} />
            </g>
          );
        })}
        {/* stroke in progress */}
        {live && live.length > 1 && (
          <path className={`stroke live k-${kind}`} d={toPath(decimate(live))} />
        )}
        {draft && <path className={`stroke k-${kind}`} d={toPath(draft.stroke)} />}
      </svg>

      {/* committed note text, sitting in the margin */}
      {cRect && annotations.map((a) => (
        <div key={a.id}
          className={`scribble k-${a.kind}${a.status === 'resolved' ? ' done' : ''}`}
          style={{ left: a.labelAt.x * cRect.width, top: a.labelAt.y * cRect.height }}>
          <span className="scribble-kind">{a.kind}</span>
          {a.body}
          {a.replies.map((r: any) => (
            <span key={r.id} className="scribble-reply">↳ {r.body}</span>
          ))}
        </div>
      ))}

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
              if (e.key === 'Escape') setDraft(null);
            }} />
          <div className="se-foot">
            {draft.targets.length
              ? <span className="se-hit">on {draft.targets.map(t => t.label).slice(0, 2).join(', ')}</span>
              : <span className="se-hit dim">nothing under the mark</span>}
            <span className="se-key">↵ to pin</span>
          </div>
        </div>
      )}
    </>
  );
}
