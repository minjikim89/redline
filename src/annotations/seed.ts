import type { Annotation, AnnotationKind, Pt } from '../deck/types';

/**
 * The deck opens already marked up. A blank canvas makes a reviewer guess what
 * the product is; a marked one shows it in three seconds — and gives a
 * connecting agent a real queue to work immediately.
 *
 * Each seed corresponds to one flaw planted in sampleDeck.ts.
 */

/** A wobbly ellipse, so seeded marks look drawn rather than generated. */
function ring(cx: number, cy: number, rx: number, ry: number, seed = 1): Pt[] {
  const pts: Pt[] = [];
  const n = 46;
  // start and end slightly past each other, the way a hand-drawn circle overshoots
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2.12 - 0.5;
    const wob = 1 + Math.sin(t * 2.3 + seed) * 0.062 + Math.sin(t * 5.7 + seed * 2) * 0.034;
    pts.push({ x: cx + Math.cos(t) * rx * wob, y: cy + Math.sin(t) * ry * wob });
  }
  return pts;
}

const mk = (
  id: string, slideId: string, kind: AnnotationKind, body: string,
  stroke: Pt[], labelAt: Pt, targets: { elementId: string; label: string }[],
): Annotation => ({
  id, slideId, kind, body, stroke, labelAt, targets,
  status: 'open', author: 'human', replies: [], at: new Date().toISOString(),
});

export const seedAnnotations: Annotation[] = [
  // [FLAW 1] nine-category pie
  mk('seed_pie', 's6', 'visualize',
    "nine slices — nobody can read this. what shape does this data actually want?",
    ring(0.36, 0.58, 0.215, 0.375, 1.7),
    { x: 0.012, y: 0.40 },
    [{ elementId: 'chart', label: 'the chart' }]),

  // [FLAW 2] stale figure, no source
  mk('seed_stale', 's8', 'research',
    "this is 2024 and there's no source. find the current number and cite it.",
    ring(0.50, 0.55, 0.235, 0.20, 3.3),
    { x: 0.845, y: 0.30 },
    [{ elementId: 'value', label: 'the headline figure' }]),

  // [FLAW 3] source lines don't agree
  mk('seed_src', 's7', 'fix',
    "source lines are formatted three different ways across the chart slides. pick one.",
    ring(0.16, 0.89, 0.155, 0.055, 5.1),
    { x: 0.845, y: 0.70 },
    [{ elementId: 'source', label: 'source line' }]),
];
