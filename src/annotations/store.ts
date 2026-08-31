import type { Annotation, AnnotationKind, Author, Conflict, Deck, Pt, Reply, Target } from '../deck/types';
import { sampleDeck } from '../deck/sampleDeck';
import { seedAnnotations } from './seed';

/**
 * External store. Tools mutate it from outside React's tree, so we keep state
 * here and subscribe via useSyncExternalStore rather than lifting into a component.
 */
export interface CallRecord { id: number; name: string; ok: boolean; detail: string; at: number }

type State = {
  deck: Deck; annotations: Annotation[]; selected: string | null;
  /** A visible trail of what the agent actually invoked. */
  calls: CallRecord[];
};

// `?blank=1` opens an unmarked deck; the default shows the review already in progress.
const blank = typeof location !== 'undefined'
  && new URLSearchParams(location.search).has('blank');

let state: State = {
  deck: sampleDeck,
  annotations: blank ? [] : seedAnnotations.map(a => ({ ...a })),
  selected: null,
  calls: [],
};
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(l => l());
export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getState = () => state;

/* ---------- history ---------- *
 * Snapshot-based. A review surface where you cannot take a mark back is not
 * a review surface. Every mutation below goes through `set`, so undo is total.
 */
const past: State[] = [];
const future: State[] = [];
const LIMIT = 60;

const set = (next: Partial<State>) => {
  past.push(state);
  if (past.length > LIMIT) past.shift();
  future.length = 0;
  state = { ...state, ...next };
  emit();
};

export function undo() {
  const prev = past.pop();
  if (!prev) return;
  future.push(state);
  state = prev;
  emit();
}

export function redo() {
  const next = future.pop();
  if (!next) return;
  past.push(state);
  state = next;
  emit();
}

export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const now = () => new Date().toISOString();

/* ---------- deck ---------- */

/**
 * An agent may flag that a figure it just verified undercuts a claim still on
 * the slide. It does NOT rewrite the claim — a headline is an argument, and
 * changing one is the author's call.
 */
export function raiseConflict(slideId: string, c: Omit<Conflict, 'raisedBy' | 'at'>) {
  const slides = state.deck.slides.map(s => s.id === slideId
    ? { ...s, conflict: { ...c, raisedBy: 'agent' as const, at: now() } } : s);
  set({ deck: { ...state.deck, slides } });
  return getSlide(slideId);
}

export function clearConflict(slideId: string) {
  const slides = state.deck.slides.map(s =>
    s.id === slideId ? { ...s, conflict: undefined } : s);
  set({ deck: { ...state.deck, slides } });
}

export function getSlide(slideId: string) {
  return state.deck.slides.find(s => s.id === slideId) ?? null;
}

export function updateSlideProps(slideId: string, patch: Record<string, unknown>) {
  const slides = state.deck.slides.map(s =>
    s.id === slideId ? { ...s, props: { ...s.props, ...patch } } : s);
  set({ deck: { ...state.deck, slides } });
  return getSlide(slideId);
}

/* ---------- annotations ---------- */

export function addAnnotation(a: {
  slideId: string; targets: Target[]; stroke: Pt[]; labelAt: Pt;
  kind: AnnotationKind; body: string; author?: Author;
}): Annotation {
  const ann: Annotation = {
    id: uid('ann'), slideId: a.slideId, targets: a.targets, stroke: a.stroke,
    labelAt: a.labelAt, kind: a.kind,
    body: a.body, status: 'open', author: a.author ?? 'human', replies: [], at: now(),
  };
  set({ annotations: [...state.annotations, ann] });
  return ann;
}

export function openAnnotations() {
  return state.annotations.filter(a => a.status === 'open');
}

export function openKinds(): AnnotationKind[] {
  return [...new Set(openAnnotations().map(a => a.kind))];
}

export function replyToAnnotation(id: string, body: string, author: Author = 'agent') {
  const reply: Reply = { id: uid('rep'), author, body, at: now() };
  set({
    annotations: state.annotations.map(a =>
      a.id === id ? { ...a, replies: [...a.replies, reply] } : a),
  });
  return state.annotations.find(a => a.id === id) ?? null;
}

export function resolveAnnotation(id: string) {
  set({
    annotations: state.annotations.map(a =>
      a.id === id ? { ...a, status: 'resolved' as const } : a),
  });
  return state.annotations.find(a => a.id === id) ?? null;
}

/** Reposition a mark. One history entry per drag, committed on pointer-up. */
export function moveAnnotation(id: string, d: { label?: Pt; stroke?: Pt }) {
  set({
    annotations: state.annotations.map(a => a.id !== id ? a : {
      ...a,
      labelAt: d.label ? { x: a.labelAt.x + d.label.x, y: a.labelAt.y + d.label.y } : a.labelAt,
      stroke: d.stroke
        ? a.stroke.map(p => ({ x: p.x + d.stroke!.x, y: p.y + d.stroke!.y }))
        : a.stroke,
    }),
  });
}

export function removeAnnotation(id: string) {
  set({ annotations: state.annotations.filter(a => a.id !== id) });
}

/** Selection is transient UI, not an edit — keep it out of the undo stack. */
export const select = (id: string | null) => {
  state = { ...state, selected: id };
  emit();
};

export function reopenAnnotation(id: string) {
  set({
    annotations: state.annotations.map(a =>
      a.id === id ? { ...a, status: 'open' as const } : a),
  });
}

/** Put the deck and the queue back to how the page opened. */
export function reset() {
  past.length = 0; future.length = 0;
  state = {
    deck: sampleDeck, annotations: seedAnnotations.map(a => ({ ...a })),
    selected: null, calls: [],
  };
  emit();
}

/** Tool traffic is invisible by nature; this makes it legible on the page. */
let callSeq = 0;
export function logCall(name: string, ok: boolean, detail: string) {
  const rec: CallRecord = { id: ++callSeq, name, ok, detail, at: Date.now() };
  state = { ...state, calls: [...state.calls, rec].slice(-40) };
  emit();
}

export function clearOpen() {
  set({ annotations: state.annotations.filter(a => a.status !== 'open') });
}
