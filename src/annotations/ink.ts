/**
 * Freehand ink, and how a hand-drawn mark becomes a stable anchor.
 *
 * A person circles whatever they want. We keep the stroke for looks, but we
 * ALSO resolve what sits under it to model element ids. The ink is the feel;
 * the resolved ids are the anchor, so a note survives the reflow that happens
 * the moment the agent fixes something.
 */

export interface Pt { x: number; y: number }

/** Drop points closer than `min` px apart. Freehand input is far too dense. */
export function decimate(pts: Pt[], min = 2.5): Pt[] {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (Math.hypot(p.x - q.x, p.y - q.y) >= min) out.push(p);
  }
  const last = pts[pts.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** Quadratic curves through midpoints — the standard smooth-freehand trick. */
export function toPath(pts: Pt[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`;
  }
  const n = pts.length - 1;
  return d + ` L ${pts[n].x} ${pts[n].y}`;
}

export function bbox(pts: Pt[]) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function centroid(pts: Pt[]): Pt {
  const s = pts.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  return { x: s.x / pts.length, y: s.y / pts.length };
}

/** Even-odd ray cast. Used so a lasso counts what it encloses, not just overlaps. */
function inside(pt: Pt, poly: Pt[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y)
      && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y || 1e-9) + a.x) hit = !hit;
  }
  return hit;
}

export interface Resolved { elementId: string; label: string; score: number }

/**
 * What did that mark land on? Scores every annotatable region by how much of it
 * the stroke encloses or crosses, then keeps the tightest meaningful hits.
 */
export function resolveTargets(
  stroke: Pt[],            // page-space px
  slideEl: HTMLElement,
): Resolved[] {
  const box = bbox(stroke);
  const nodes = Array.from(slideEl.querySelectorAll<HTMLElement>('[data-el-id]'));
  const host = slideEl.getBoundingClientRect();
  const out: Resolved[] = [];

  for (const n of nodes) {
    const r = n.getBoundingClientRect();
    const rect = { x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height };

    // overlap of the stroke's bbox with this region
    const ox = Math.max(0, Math.min(box.x + box.w, rect.x + rect.w) - Math.max(box.x, rect.x));
    const oy = Math.max(0, Math.min(box.y + box.h, rect.y + rect.h) - Math.max(box.y, rect.y));
    const overlap = ox * oy;
    if (!overlap) continue;

    // corners of the region that the lasso actually encloses
    const corners = [
      { x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y },
      { x: rect.x, y: rect.y + rect.h }, { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
    ].filter(c => inside(c, stroke)).length;

    const area = rect.w * rect.h || 1;
    // Favour tight hits: a small region fully enclosed beats a big one clipped.
    const score = (overlap / area) * 0.6 + (corners / 5) * 0.4;
    if (score < 0.12) continue;

    out.push({
      elementId: n.dataset.elId!,
      label: n.dataset.elLabel ?? n.dataset.elId!,
      score: +score.toFixed(3),
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}

/** Point on the stroke nearest `from` — where a leader should actually land. */
export function nearestPoint(stroke: Pt[], from: Pt): Pt {
  let best = stroke[0], d = Infinity;
  for (const p of stroke) {
    const dd = (p.x - from.x) ** 2 + (p.y - from.y) ** 2;
    if (dd < d) { d = dd; best = p; }
  }
  // back off a few px so the line stops just short of the ink
  const len = Math.hypot(best.x - from.x, best.y - from.y) || 1;
  return { x: best.x - ((best.x - from.x) / len) * 7, y: best.y - ((best.y - from.y) / len) * 7 };
}

/** Curved leader from the note in the margin to the mark on the slide. */
export function leaderPath(from: Pt, to: Pt): string {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // bow the curve perpendicular to the run, so it reads as drawn, not routed
  const bow = Math.min(len * 0.22, 64);
  const cx = (from.x + to.x) / 2 - (dy / len) * bow;
  const cy = (from.y + to.y) / 2 + (dx / len) * bow;
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}
