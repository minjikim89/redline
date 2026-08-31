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
  // s07 — the pie spends 61.5% of its area on "All others"
  mk('seed_pie', 's07', 'visualize',
    "most of this pie is 'all others'. the comparison i care about is korea vs france.",
    ring(0.36, 0.58, 0.215, 0.375, 1.7),
    { x: 0.012, y: 0.40 },
    [{ elementId: 'chart', label: 'the chart' }]),

  // s08 — one panel is a year behind the other
  mk('seed_stale', 's08', 'research',
    "the hybe panel is 2024 but dearu is q4 2025. get the current hybe figures.",
    ring(0.74, 0.55, 0.21, 0.24, 3.3),
    { x: 0.845, y: 0.28 },
    [{ elementId: 'panel.1', label: 'panel: Commerce · HYBE platform segment (2024)' }]),

  // s04 — source lines are written three different ways across the deck
  mk('seed_src', 's04', 'fix',
    "source lines don't match across slides 4, 7 and 8. pick one format.",
    ring(0.30, 0.90, 0.28, 0.05, 5.1),
    { x: 0.845, y: 0.72 },
    [{ elementId: 'source', label: 'source line' }]),
];
