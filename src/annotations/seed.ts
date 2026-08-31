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
  // s06 — a pie asserts a whole these three export lines do not form
  mk('seed_pie', 's06', 'visualize',
    "these aren't parts of one whole. a pie implies a total that doesn't mean anything.",
    ring(0.335, 0.545, 0.115, 0.235, 1.7),
    { x: -0.148, y: 0.28 },
    [{ elementId: 'chart', label: 'the export figures' }]),

  // s08 — one panel is a year behind the other
  mk('seed_stale', 's08', 'research',
    "hybe is 2024, dearu is q4 2025. get the current hybe numbers with a source.",
    ring(0.748, 0.545, 0.175, 0.215, 3.3),
    { x: 1.012, y: 0.28 },
    [{ elementId: 'panel.1', label: 'panel: Commerce · HYBE platform segment (2024)' }]),

  // s04 — three different source conventions across the deck
  mk('seed_src', 's04', 'fix',
    "source lines are written three ways across slides 4, 5 and 7. pick one.",
    ring(0.26, 0.945, 0.245, 0.035, 5.1),
    { x: 1.012, y: 0.72 },
    [{ elementId: 'source', label: 'source line' }]),
];
