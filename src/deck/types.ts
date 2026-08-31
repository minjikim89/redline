/** The deck model. Agents edit THIS, never HTML. */

export type SlideType =
  | 'title' | 'bigNumber' | 'composition' | 'timeSeries' | 'comparison' | 'flywheel';

/** Chart forms a composition slide can take. This enum is the agent's vocabulary. */
export type ChartForm = 'pie' | 'bar' | 'column';

export interface Theme {
  primary: string; accent: string; warn: string;
  ink: string; muted: string; surface: string; line: string;
}

export interface Slide {
  id: string;
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

export interface Annotation {
  id: string;
  /** Anchored to the MODEL, not to x/y. Survives every re-layout. */
  slideId: string;
  elementId: string;
  kind: AnnotationKind;
  body: string;
  status: AnnotationStatus;
  author: Author;
  replies: Reply[];
  at: string;
}
