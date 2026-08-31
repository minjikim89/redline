import type { Theme } from './types';

/**
 * Lifted verbatim from the authored deck. These are not "inspired by" values —
 * the artboard renders at the size it was designed at (1920×1080) and is scaled
 * to fit, so every measurement below is the one the author chose.
 */
export const defaultTheme: Theme = {
  primary: '#FF00C8',
  accent:  '#9000FF',
  warn:    '#00A5C8',
  ink:     '#0B0B12',
  muted:   '#565C6E',
  surface: '#FFFFFF',
  line:    '#E4E8ED',
};

/** Accent rotation used for stage/section marks. */
export const series = ['#FF00C8', '#9000FF', '#00A5C8', '#0B0B12'];

export const ARTBOARD = { w: 1920, h: 1080 };
