/** The deck model. Agents edit THIS, never HTML. */

export type SlideType =
  | 'cover' | 'hero' | 'cards' | 'barsPair' | 'flow'
  | 'figures' | 'panels' | 'timeline' | 'refs';

/** Chart forms a composition slide can take. This enum is the agent's vocabulary. */
export type ChartForm = 'cards' | 'column' | 'pie';

export interface Theme {
  primary: string; accent: string; warn: string;
  ink: string; muted: string; surface: string; line: string;
}

export interface Slide {
  id: string;
  /** Surface treatment, carried over from the authored deck. */
  tone?: 'light' | 'white' | 'dark' | 'accent';
  type: SlideType;
  /** Shape is governed by the type's schema in the registry. */
  props: Record<string, any>;
}

export interface Deck {
  id: string;
  title: string;
  theme: Theme;
  slides: Slide[];
}

/** A point in a series. */
export interface Datum { label: string; value: number }

/* ---------- Annotations: the spine of the product ---------- */

export type AnnotationKind = 'fix' | 'research' | 'visualize' | 'explain';
export type AnnotationStatus = 'open' | 'resolved';
export type Author = 'human' | 'agent';

export interface Reply {
  id: string;
  author: Author;
  body: string;
  at: string;
}

export interface Pt { x: number; y: number }

/** What a hand-drawn mark landed on, once resolved to the model. */
export interface Target { elementId: string; label: string }

export interface Annotation {
  id: string;
  slideId: string;
  /**
   * The mark is free-form, but the ANCHOR is these resolved model targets.
   * That is what lets a note survive the reflow the agent's own fix causes.
   */
  targets: Target[];
  /** The stroke itself, normalized to the slide box so it scales with zoom. */
  stroke: Pt[];
  /** Where the note text sits, normalized to the canvas (may fall outside 0..1). */
  labelAt: Pt;
  kind: AnnotationKind;
  body: string;
  status: AnnotationStatus;
  author: Author;
  replies: Reply[];
  at: string;
}
