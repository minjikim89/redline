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
  '#3B82F6', // blue
  '#f4a259', // orange
  '#06d6a0', // teal
  '#a78bfa', // violet
  '#fbbf24', // amber
  '#f472b6', // pink
  '#0f766e', // deep teal
  '#1e40af', // deep blue
  '#94a3b8', // slate
];
