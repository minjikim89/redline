import type { Theme } from './types';

/** Carried over from _ideas/ppt-creator-tool so decks look like Minji's decks. */
export const defaultTheme: Theme = {
  primary: '#3B82F6',
  accent:  '#06d6a0',
  warn:    '#f4a259',
  ink:     '#0d1b4a',
  muted:   '#5b6785',
  surface: '#ffffff',
  line:    '#e3e7f0',
};

/** Categorical ramp for charts. Ordered so adjacent slices stay distinguishable. */
export const series = [
  '#3B82F6', '#06d6a0', '#67e8f9', '#f4a259', '#a78bfa',
  '#f472b6', '#34d399', '#fbbf24', '#94a3b8',
];
