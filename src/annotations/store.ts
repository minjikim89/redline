import type { Annotation, AnnotationKind, Author, Conflict, Deck, Pt, Reply, Slide, Target } from '../deck/types';
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
  /**
   * Where the agent may write. 'noted' = only slides carrying an open note —
   * the person's marks are the work order, and everything else is off the
   * table. 'all' opens the whole deck. The person owns this switch.
   */
  scope: 'noted' | 'all';
  /** The last region a TOOL wrote to — the page lights it up for a beat. */
  touch?: { seq: number; slideId: string; root: string };
  /**
   * Whether a deck is on screen. Before the person opens one, the review
   * tools are not registered — an agent must not edit a deck nobody is
   * looking at. The entry screen flips this.
   */
  opened: boolean;
  /** A batch tool is landing changes slide by slide; the person can stop it. */
  sweep: null | { tool: string; startedAt: number };
};

/** Who made a change. Tools pass 'agent'; everything the person does is 'human'. */
export type Editor = 'human' | 'agent';

// `?blank=1` opens an unmarked deck; the default shows the review already in progress.
// `?fresh=1` ignores any saved session without deleting it — the e2e harness and
// a person who wants the seeded demo back both need a load that starts clean.
const q = typeof location !== 'undefined'
  ? new URLSearchParams(location.search) : new URLSearchParams();
const blank = q.has('blank');
const fresh = q.has('fresh');

/* ---------- persistence ---------- *
 * The session survives a reload. Without this, every agent edit and every note
 * evaporated the moment the tab refreshed — an agent literally watched its own
 * chart change disappear and reported "the deck session had reset".
 */
const KEY = 'redline.session.v1';

function loadSaved(): { deck: Deck; annotations: Annotation[]; scope?: 'noted' | 'all' } | null {
  if (blank || fresh || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v?.v !== 1 || !Array.isArray(v.deck?.slides) || !v.deck.slides.length
      || !Array.isArray(v.annotations)) return null;
    return { deck: v.deck, annotations: v.annotations, scope: v.scope };
  } catch { return null; }
}

const saved = loadSaved();
/** Whether this session picked up where a previous one left off. */
export const restoredFromSave = saved !== null;

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  if (typeof localStorage === 'undefined') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        v: 1, deck: state.deck, annotations: state.annotations, scope: state.scope,
      }));
    } catch { /* quota or private mode — the session just won't survive reload */ }
  }, 250);
}

// `?deck=1`, `?slide=n` and `?replay=1` deep-link straight onto the deck.
const openedAtLoad = q.has('deck') || q.has('slide') || q.has('replay');

let state: State = saved
  ? { deck: saved.deck, annotations: saved.annotations, selected: null, calls: [],
      scope: saved.scope ?? 'noted', opened: openedAtLoad, sweep: null }
  : {
      deck: sampleDeck,
      annotations: blank ? [] : seedAnnotations.map(a => ({ ...a })),
      selected: null,
      calls: [],
      scope: 'noted',
      opened: openedAtLoad,
      sweep: null,
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

/* ---------- revisions ---------- *
 * The claim this product makes is that a hand edit is visible to the agent
 * at once. The half of that claim that is easy to forget is the race: the
 * agent reads a slide, the person retypes the headline, the agent writes its
 * fix — and silently overwrites the person. Every slide carries a revision
 * counter that ticks on any change, from either side; `read_slide` records
 * the revision the agent saw, and a writer that arrives after the person has
 * moved the slide on is refused with what changed in between.
 *
 * Revisions live outside the undo history on purpose: an undo IS a change
 * from the agent's point of view, so it must tick the counter too.
 */
export interface Change { rev: number; by: Editor; fields: string[]; at: number }
const revs = new Map<string, number>();
const changes = new Map<string, Change[]>();
const lastAgentRead = new Map<string, number>();

export const revisionOf = (slideId: string) => revs.get(slideId) ?? 0;

/** The agent read this slide at its current revision. */
export function noteAgentRead(slideId: string) {
  lastAgentRead.set(slideId, revisionOf(slideId));
}

/** What moved on a slide since the agent last read it — or null if nothing did. */
export function staleness(slideId: string) {
  const seen = lastAgentRead.get(slideId);
  if (seen === undefined) return null;                 // never read: nothing to be stale against
  const now = revisionOf(slideId);
  if (now <= seen) return null;
  return {
    readRev: seen, currentRev: now,
    changedSince: (changes.get(slideId) ?? []).filter(c => c.rev > seen)
      .map(c => ({ by: c.by, fields: c.fields })),
  };
}

const changedFields = (a: Slide, b: Slide) => {
  const keys = new Set([...Object.keys(a.props ?? {}), ...Object.keys(b.props ?? {})]);
  const out = [...keys].filter(k => a.props?.[k] !== b.props?.[k]);
  if (a.tone !== b.tone) out.push('tone');
  if (a.conflict !== b.conflict) out.push('conflict');
  return out;
};

/** Tick revisions for every slide that differs between two states. */
function bump(prev: State, next: State, by: Editor) {
  if (prev.deck === next.deck) return;
  const before = new Map(prev.deck.slides.map(s => [s.id, s]));
  for (const s of next.deck.slides) {
    const was = before.get(s.id);
    if (was === s) continue;
    const fields = was ? changedFields(was, s) : ['*'];
    if (was && !fields.length) continue;
    const rev = revisionOf(s.id) + 1;
    revs.set(s.id, rev);
    const log = changes.get(s.id) ?? [];
    log.push({ rev, by, fields, at: Date.now() });
    changes.set(s.id, log.slice(-20));
    // A slide the agent just wrote is, by definition, one it has seen.
    if (by === 'agent' && lastAgentRead.has(s.id)) lastAgentRead.set(s.id, rev);
  }
}

const set = (next: Partial<State>, by: Editor = 'human') => {
  past.push(state);
  if (past.length > LIMIT) past.shift();
  future.length = 0;
  const prev = state;
  state = { ...state, ...next };
  bump(prev, state, by);
  persist();
  emit();
};

export function undo() {
  const prev = past.pop();
  if (!prev) return;
  future.push(state);
  const was = state;
  state = { ...prev, opened: state.opened, sweep: state.sweep };
  bump(was, state, 'human');
  persist();
  emit();
}

export function redo() {
  const next = future.pop();
  if (!next) return;
  past.push(state);
  const was = state;
  state = { ...next, opened: state.opened, sweep: state.sweep };
  bump(was, state, 'human');
  persist();
  emit();
}

/* ---------- the entry screen, and the person's stop button ---------- */

export function setOpened(opened: boolean) {
  if (state.opened === opened) return;
  state = { ...state, opened };
  emit();
}

let sweepCtl: AbortController | null = null;

/** A batch tool starts landing changes. Returns the signal the person can pull. */
export function beginSweep(tool: string) {
  sweepCtl?.abort();
  sweepCtl = new AbortController();
  state = { ...state, sweep: { tool, startedAt: Date.now() } };
  emit();
  return sweepCtl.signal;
}

export function endSweep() {
  sweepCtl = null;
  if (!state.sweep) return;
  state = { ...state, sweep: null };
  emit();
}

/** The person pressed stop. The running tool sees its signal abort. */
export function stopSweep() {
  sweepCtl?.abort(new DOMException('Stopped by the person watching', 'AbortError'));
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
  set({ deck: { ...state.deck, slides } }, 'agent');
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

/** Set a value at a dotted path, e.g. "title" or "cards.0.head". */
/** Swap the whole deck, e.g. after an import. Clears notes, which belonged to the old one. */
export function loadDeck(deck: Deck) {
  past.length = 0; future.length = 0;
  revs.clear(); changes.clear(); lastAgentRead.clear();
  state = { deck, annotations: [], selected: null, calls: [], scope: state.scope,
    opened: state.opened, sweep: null };
  persist();
  emit();
}

export function setTone(slideId: string, tone: 'light' | 'white' | 'dark' | 'accent') {
  const slides = state.deck.slides.map(x => x.id === slideId ? { ...x, tone } : x);
  set({ deck: { ...state.deck, slides } });
}

export function setByPath(slideId: string, path: string, value: unknown, by: Editor = 'human') {
  const slide = getSlide(slideId);
  if (!slide) return null;
  const keys = path.split('.');
  const clone = (v: any): any =>
    Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? { ...v } : v;
  const props = clone(slide.props);
  let node: any = props;
  for (let i = 0; i < keys.length - 1; i++) {
    node[keys[i]] = clone(node[keys[i]] ?? {});
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
  const slides = state.deck.slides.map(x => x.id === slideId ? { ...x, props } : x);
  set({ deck: { ...state.deck, slides } }, by);
  return getSlide(slideId);
}

export function updateSlideProps(slideId: string, patch: Record<string, unknown>, by: Editor = 'human') {
  const slides = state.deck.slides.map(s =>
    s.id === slideId ? { ...s, props: { ...s.props, ...patch } } : s);
  set({ deck: { ...state.deck, slides } }, by);
  return getSlide(slideId);
}

/* ---------- annotations ---------- */

export function addAnnotation(a: {
  slideId: string; targets: Target[]; stroke: Pt[]; labelAt: Pt;
  kind: AnnotationKind; body: string; author?: Author; anchorAt?: Pt;
}): Annotation {
  const ann: Annotation = {
    id: uid('ann'), slideId: a.slideId, targets: a.targets, stroke: a.stroke,
    anchorAt: a.anchorAt, labelAt: a.labelAt, kind: a.kind,
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

/**
 * Reposition a mark. One history entry per drag, committed on pointer-up —
 * the re-aimed targets ride in the SAME entry, or a single undo would peel
 * the anchor off while leaving the stroke where it was dragged to.
 */
export function moveAnnotation(
  id: string,
  d: { label?: Pt; stroke?: Pt },
  aim?: { targets: Target[]; anchorAt?: Pt },
) {
  set({
    annotations: state.annotations.map(a => a.id !== id ? a : {
      ...a,
      labelAt: d.label ? { x: a.labelAt.x + d.label.x, y: a.labelAt.y + d.label.y } : a.labelAt,
      stroke: d.stroke
        ? a.stroke.map(p => ({ x: p.x + d.stroke!.x, y: p.y + d.stroke!.y }))
        : a.stroke,
      ...(aim && { targets: aim.targets, anchorAt: aim.anchorAt }),
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

/* Tool writes announce where they landed, so the page can light the region up.
   Transient like selection: never in history, never persisted. */
let touchSeq = 0;
export function markTouch(slideId: string, root: string) {
  state = { ...state, touch: { seq: ++touchSeq, slideId, root } };
  emit();
}

/** The slides the person has marked — the agent's work order. */
export function notedSlideIds(): string[] {
  return [...new Set(openAnnotations().map(a => a.slideId))];
}

/** Where the agent may write. Transient UI in feel, but it is policy — persist it. */
export function setScope(scope: 'noted' | 'all') {
  state = { ...state, scope };
  persist();
  emit();
}

/**
 * A note is the author's to change after it is pinned. Body and kind only —
 * the stroke is redrawn, not edited, and status has its own verbs.
 */
export function updateAnnotation(id: string, patch: {
  body?: string; kind?: AnnotationKind; targets?: Target[]; anchorAt?: Pt;
}) {
  set({
    annotations: state.annotations.map(a =>
      a.id === id ? { ...a, ...patch } : a),
  });
  return state.annotations.find(a => a.id === id) ?? null;
}

export function reopenAnnotation(id: string) {
  set({
    annotations: state.annotations.map(a =>
      a.id === id ? { ...a, status: 'open' as const } : a),
  });
}

/**
 * A full snapshot and its restore — the scripted pass runs on the sample deck,
 * and whatever the person actually had comes back the moment it ends. Losing an
 * imported deck to a demo button is the worst trade a review surface can make.
 */
export function snapshot(): State {
  return JSON.parse(JSON.stringify({ ...state, calls: [] }));
}

export function restore(snap: State) {
  past.length = 0; future.length = 0;
  state = { ...snap, selected: null, opened: state.opened, sweep: null };
  persist();
  emit();
}

/** Put the deck and the queue back to how the page opened. */
export function reset() {
  past.length = 0; future.length = 0;
  revs.clear(); changes.clear(); lastAgentRead.clear();
  state = {
    deck: sampleDeck, annotations: seedAnnotations.map(a => ({ ...a })),
    selected: null, calls: [], scope: 'noted', opened: state.opened, sweep: null,
  };
  persist();
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
