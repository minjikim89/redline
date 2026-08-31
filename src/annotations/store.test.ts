import { beforeEach, describe, expect, it } from 'vitest';
import * as store from './store';

const seedNote = () => store.addAnnotation({
  slideId: 's06', kind: 'fix', body: 'tighten this',
  targets: [{ elementId: 'title', label: 'slide headline' }],
  stroke: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
  labelAt: { x: -0.15, y: 0.3 },
});

beforeEach(() => store.reset());

describe('deck edits', () => {
  it('writes a top-level prop', () => {
    store.setByPath('s06', 'title', 'New title');
    expect(store.getSlide('s06')!.props.title).toBe('New title');
  });

  it('writes through a dotted path into an array', () => {
    store.setByPath('s04', 'left.rows.0.label', 'Renamed');
    expect(store.getSlide('s04')!.props.left.rows[0].label).toBe('Renamed');
  });

  it('does not mutate the previous state object', () => {
    const before = store.getSlide('s06')!.props;
    store.setByPath('s06', 'title', 'Changed');
    expect(before.title).not.toBe('Changed');
  });

  it('ignores a write to a slide that does not exist', () => {
    expect(() => store.setByPath('nope', 'title', 'x')).not.toThrow();
    expect(store.setByPath('nope', 'title', 'x')).toBeNull();
  });

  it('creates missing intermediate objects rather than throwing', () => {
    store.setByPath('s06', 'deeply.nested.value', 7);
    expect(store.getSlide('s06')!.props.deeply.nested.value).toBe(7);
  });
});

describe('history', () => {
  it('undoes and redoes an edit', () => {
    const original = store.getSlide('s06')!.props.title;
    store.setByPath('s06', 'title', 'Changed');
    store.undo();
    expect(store.getSlide('s06')!.props.title).toBe(original);
    store.redo();
    expect(store.getSlide('s06')!.props.title).toBe('Changed');
  });

  it('has nothing to undo on a fresh deck', () => {
    expect(store.canUndo()).toBe(false);
    expect(() => store.undo()).not.toThrow();
  });

  it('drops the redo stack once a new edit lands', () => {
    store.setByPath('s06', 'title', 'A');
    store.undo();
    expect(store.canRedo()).toBe(true);
    store.setByPath('s06', 'title', 'B');
    expect(store.canRedo()).toBe(false);
  });

  it('undoes a deletion, not just a text change', () => {
    const a = seedNote();
    store.removeAnnotation(a.id);
    expect(store.openAnnotations().find(x => x.id === a.id)).toBeUndefined();
    store.undo();
    expect(store.openAnnotations().find(x => x.id === a.id)).toBeDefined();
  });

  it('keeps selection out of the undo stack', () => {
    const a = seedNote();
    const depth = store.canUndo();
    store.select(a.id);
    store.undo();
    expect(store.getState().annotations.find(x => x.id === a.id)).toBeUndefined();
    expect(depth).toBe(true);
  });
});

describe('the note queue', () => {
  it('drives which conditional tools should exist', () => {
    store.reset();
    expect(new Set(store.openKinds())).toEqual(new Set(['visualize', 'research', 'fix']));
  });

  it('drops a kind from the queue once its last note resolves', () => {
    const fixes = store.openAnnotations().filter(a => a.kind === 'fix');
    fixes.forEach(a => store.resolveAnnotation(a.id));
    expect(store.openKinds()).not.toContain('fix');
  });

  it('threads replies from both sides in order', () => {
    const a = seedNote();
    store.replyToAnnotation(a.id, 'changed it', 'agent');
    store.replyToAnnotation(a.id, 'no, revert', 'human');
    const t = store.getState().annotations.find(x => x.id === a.id)!;
    expect(t.replies.map(r => r.author)).toEqual(['agent', 'human']);
  });

  it('reopens a resolved note', () => {
    const a = seedNote();
    store.resolveAnnotation(a.id);
    expect(store.openAnnotations().find(x => x.id === a.id)).toBeUndefined();
    store.reopenAnnotation(a.id);
    expect(store.openAnnotations().find(x => x.id === a.id)).toBeDefined();
  });

  it('clearOpen leaves resolved notes alone', () => {
    const a = seedNote();
    store.resolveAnnotation(a.id);
    store.clearOpen();
    expect(store.getState().annotations.some(x => x.id === a.id)).toBe(true);
    expect(store.openAnnotations()).toHaveLength(0);
  });

  it('replying to a note that is gone does not throw', () => {
    expect(() => store.replyToAnnotation('missing', 'hello')).not.toThrow();
    expect(store.replyToAnnotation('missing', 'hello')).toBeNull();
  });
});

describe('conflicts', () => {
  it('raises and clears a flag without touching the claim', () => {
    const before = store.getSlide('s08')!.props.title;
    store.raiseConflict('s08', { elementId: 'title', claim: before, why: 'newer filing' });
    expect(store.getSlide('s08')!.conflict?.raisedBy).toBe('agent');
    expect(store.getSlide('s08')!.props.title).toBe(before);   // never auto-rewritten
    store.clearConflict('s08');
    expect(store.getSlide('s08')!.conflict).toBeUndefined();
  });
});

describe('notifications', () => {
  it('tells subscribers about a change and stops after unsubscribe', () => {
    let hits = 0;
    const off = store.subscribe(() => { hits++; });
    store.setByPath('s06', 'title', 'x');
    expect(hits).toBe(1);
    off();
    store.setByPath('s06', 'title', 'y');
    expect(hits).toBe(1);
  });

  it('returns a stable snapshot between changes', () => {
    const a = store.getState();
    expect(store.getState()).toBe(a);
    store.setByPath('s06', 'title', 'z');
    expect(store.getState()).not.toBe(a);
  });
});
