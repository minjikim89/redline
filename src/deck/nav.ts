/**
 * Which slide is on screen.
 *
 * `?slide=N` is a link anyone can hand-edit, so the index it produces is
 * treated as untrusted input: a fraction, a huge number or a negative has to
 * land on a real slide rather than on `slides[undefined]`.
 */

/** 1-based `?slide=N` → a 0-based index, or 0 when it says nothing usable. */
export function slideIndexFromQuery(search: string): number {
  const raw = new URLSearchParams(search).get('slide');
  if (raw === null) return 0;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n - 1 : 0;
}

/** Pull any index back inside a deck of `count` slides. */
export function clampSlideIndex(i: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(i)) return 0;
  return Math.min(Math.max(Math.floor(i), 0), count - 1);
}
