import { beforeEach, describe, expect, it } from 'vitest';
import { callable } from './tools';
import * as store from '../annotations/store';

beforeEach(() => store.reset());

const noteOf = (kind: string) => store.openAnnotations().find(a => a.kind === kind)!;

describe('read tools', () => {
  it('list_slides stays inside the documented 1.5K output budget', async () => {
    const r = await callable.list_slides({});
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r).length).toBeLessThanOrEqual(1500);
  });

  it('read_slide returns live props and the regions a note can anchor to', async () => {
    const r = await callable.read_slide({ slideId: 's06' });
    expect(r.ok).toBe(true);
    expect(r.annotatableElements).toContain('title');
  });

  /* The claim the product rests on: a hand edit is visible to the agent at once. */
  it('read_slide reflects an edit a person just made by hand', async () => {
    store.setByPath('s08', 'title', 'Typed by a human a second ago');
    const r = await callable.read_slide({ slideId: 's08' });
    expect(r.props.title).toBe('Typed by a human a second ago');
  });

  it('list_open_annotations carries the anchor and the thread', async () => {
    const a = noteOf('fix');
    store.replyToAnnotation(a.id, 'done', 'agent');
    const r = await callable.list_open_annotations({});
    const row = r.open.find((x: any) => x.id === a.id);
    expect(row.slideId).toBe(a.slideId);
    expect(row.marked.length).toBeGreaterThan(0);
    expect(row.waitingOn).toBe('them');
  });

  it('says the person is owed a reply when they spoke last', async () => {
    const a = noteOf('fix');
    store.replyToAnnotation(a.id, 'done', 'agent');
    store.replyToAnnotation(a.id, 'not quite', 'human');
    const r = await callable.list_open_annotations({});
    expect(r.open.find((x: any) => x.id === a.id).waitingOn).toBe('you');
  });
});

describe('write tools stay narrow', () => {
  it('set_slide_text writes one named field', async () => {
    const r = await callable.set_slide_text({ slideId: 's06', field: 'title', text: 'Rewritten' });
    expect(r.ok).toBe(true);
    expect(store.getSlide('s06')!.props.title).toBe('Rewritten');
  });

  it('refuses a field the slide type does not have, and says which it does', async () => {
    const r = await callable.set_slide_text({ slideId: 's06', field: 'byline', text: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('NOT_APPLICABLE');
    expect(r.error.fieldsOnThisSlide).toBeInstanceOf(Array);
  });

  it('an unknown slide comes back with the ids that do exist', async () => {
    const r = await callable.read_slide({ slideId: 's99' });
    expect(r.error.code).toBe('NOT_FOUND');
    expect(r.error.knownSlideIds).toContain('s06');
  });

  it('set_series replaces a named series', async () => {
    const r = await callable.set_series({
      slideId: 's04', series: 'left.rows',
      rows: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }],
    });
    expect(r.ok).toBe(true);
    expect(store.getSlide('s04')!.props.left.rows).toHaveLength(2);
  });

  it('set_series names the series that do exist when given a wrong one', async () => {
    const r = await callable.set_series({
      slideId: 's04', series: 'middle.rows', rows: [{ label: 'A', value: 1 }],
    });
    expect(r.ok).toBe(false);
    expect(r.error.seriesOnThisSlide).toEqual(['left.rows', 'right.rows']);
  });

  it('set_series tells you which slides do carry a series', async () => {
    store.setScope('all');    // s01 carries no note; this test is about series discovery
    const r = await callable.set_series({ slideId: 's01', series: 'x', rows: [{ label: 'A', value: 1 }] });
    expect(r.ok).toBe(false);
    expect(r.error.slidesWithSeries.length).toBeGreaterThan(0);
  });

  it('read_slide advertises the series so the agent can address them', async () => {
    const r = await callable.read_slide({ slideId: 's04' });
    expect(r.series).toEqual(['left.rows', 'right.rows']);
  });
});

describe('the chart form enum cannot drift from the renderer', () => {
  it('accepts a form the slide can actually draw', async () => {
    const r = await callable.set_chart_form({ slideId: 's06', chartForm: 'cards' });
    expect(r.ok).toBe(true);
    expect(store.getSlide('s06')!.props.chartForm).toBe('cards');
  });

  it('rejects a form the renderer does not know, and lists the real ones', async () => {
    const r = await callable.set_chart_form({ slideId: 's06', chartForm: 'bar' });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('INVALID_INPUT');
    expect(r.error.allowedForms).toEqual(['cards', 'column', 'pie']);
  });

  it('refuses a slide with no chart at all', async () => {
    store.setScope('all');    // s01 carries no note; this test is about applicability
    const r = await callable.set_chart_form({ slideId: 's01', chartForm: 'cards' });
    expect(r.error.code).toBe('NOT_APPLICABLE');
  });
});

describe('attach_research', () => {
  it('writes provenance alongside the figure', async () => {
    const r = await callable.attach_research({
      slideId: 's08', source: 'HYBE FY2025 (DART)', asOf: 'FY2025',
    });
    expect(r.ok).toBe(true);
    expect(store.getSlide('s08')!.props.source).toBe('HYBE FY2025 (DART)');
  });

  it('raises a conflict without rewriting the claim', async () => {
    const before = store.getSlide('s08')!.props.title;
    const r = await callable.attach_research({
      slideId: 's08', source: 'x', asOf: 'FY2025',
      contradicts: { elementId: 'title', claim: before, why: 'the loss was a 2024 number' },
    });
    expect(r.conflictRaised).toBe(true);
    expect(store.getSlide('s08')!.props.title).toBe(before);
    expect(store.getSlide('s08')!.conflict?.why).toMatch(/2024/);
  });

  it('rejects a conflict pointed at a region that is not on the slide', async () => {
    const r = await callable.attach_research({
      slideId: 's08', source: 'x', asOf: 'y',
      contradicts: { elementId: 'nonsense', claim: 'a', why: 'b' },
    });
    expect(r.ok).toBe(false);
    expect(r.error.regionsOnThisSlide).toContain('title');
    expect(r.error.wroteFigureAnyway).toBe(true);
  });
});

describe('unify_across_slides', () => {
  it('applies one convention across several slides', async () => {
    const r = await callable.unify_across_slides({
      field: 'source', slideIds: ['s04', 's05'], template: 'Source: {value}',
    });
    expect(r.ok).toBe(true);
    expect(r.applied).toEqual(['s04', 's05']);
    expect(store.getSlide('s04')!.props.source.startsWith('Source: ')).toBe(true);
  });

  it('skips slides that cannot take the field and says why', async () => {
    const r = await callable.unify_across_slides({
      field: 'source', slideIds: ['s04', 's03'], template: 'Source: {value}',
    });
    expect(r.applied).toContain('s04');
    expect(r.skipped.concat(r.applied.map((id: string) => ({ id }))).length).toBe(2);
  });

  it('stops partway when the person cancels, and reports what landed', async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 400);
    const r = await callable.unify_across_slides(
      { field: 'source', slideIds: ['s04', 's05', 's07', 's08', 's10'], template: 'Source: {value}' },
      { signal: ac.signal },
    );
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('CANCELLED');
    expect(r.retrySafe).toBe(false);
    expect(r.error.applied.length).toBeGreaterThan(0);
    expect(r.error.remaining.length).toBeGreaterThan(0);
  });
});

describe('closing the loop', () => {
  it('resolve takes the note off the queue', async () => {
    const a = noteOf('visualize');
    await callable.resolve_annotation({ annotationId: a.id });
    expect(store.openAnnotations().find(x => x.id === a.id)).toBeUndefined();
  });

  it('an unknown note id comes back with the ones that are open', async () => {
    const r = await callable.resolve_annotation({ annotationId: 'nope' });
    expect(r.error.openNoteIds.length).toBeGreaterThan(0);
  });

  it('every call lands in the on-page trail', async () => {
    const before = store.getState().calls.length;
    await callable.list_slides({});
    await callable.read_slide({ slideId: 's99' });
    const calls = store.getState().calls.slice(before);
    expect(calls.map(c => c.name)).toEqual(['list_slides', 'read_slide']);
    expect(calls[1].ok).toBe(false);
  });
});


describe('the noted scope: marks are the work order', () => {
  it('refuses a point write on a slide nobody marked', async () => {
    const r = await callable.set_slide_text({ slideId: 's02', field: 'title', text: 'X' });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('OUT_OF_SCOPE');
    expect(r.error.notedSlideIds).toContain('s04');
  });

  it('allows the same write once the person widens the scope', async () => {
    store.setScope('all');
    const r = await callable.set_slide_text({ slideId: 's02', field: 'body', text: 'Widened.' });
    expect(r.ok).toBe(true);
  });

  it('allows writes anywhere when no notes are open', async () => {
    for (const a of store.openAnnotations()) store.resolveAnnotation(a.id);
    const r = await callable.set_slide_text({ slideId: 's02', field: 'body', text: 'Queue is empty.' });
    expect(r.ok).toBe(true);
  });
});

describe('edit_items: structural editing', () => {
  beforeEach(() => store.setScope('all'));

  it('removes one card without touching the rest', async () => {
    const before = store.getSlide('s03')!.props.cards.map((c: any) => c.head);
    const r = await callable.edit_items({ slideId: 's03', list: 'cards', op: 'remove', index: 1 });
    expect(r.ok).toBe(true);
    const after = store.getSlide('s03')!.props.cards.map((c: any) => c.head);
    expect(after).toEqual([before[0], before[2], before[3]]);
  });

  it('appends a well-formed item and refuses a malformed one', async () => {
    const bad = await callable.edit_items({
      slideId: 's03', list: 'cards', op: 'append', item: { headline: 'wrong key' },
    });
    expect(bad.ok).toBe(false);
    expect(bad.error.allowedKeys).toContain('head');

    const full = await callable.edit_items({
      slideId: 's03', list: 'cards', op: 'append',
      item: { index: '05', head: 'New block', body: 'Added by the agent.' },
    });
    expect(full.ok).toBe(false);          // cards holds at most 4 — the schema is the law

    const good = await callable.edit_items({
      slideId: 's09', list: 'events', op: 'append',
      item: { year: '2027', text: 'Added by the agent.' },
    });
    expect(good.ok).toBe(true);
    expect(store.getSlide('s09')!.props.events).toHaveLength(7);
  });

  it('moves an item and reports the list it cannot find', async () => {
    const r = await callable.edit_items({ slideId: 's03', list: 'cards', op: 'move', index: 0, to: 2 });
    expect(r.ok).toBe(true);
    const missing = await callable.edit_items({ slideId: 's03', list: 'nope', op: 'remove', index: 0 });
    expect(missing.ok).toBe(false);
    expect(missing.error.listsOnThisSlide).toEqual(['cards']);
  });

  it('respects minItems: a list cannot be emptied', async () => {
    const s6 = store.getSlide('s06')!;
    const n = s6.props.items.length;
    for (let i = n - 1; i >= 1; i--) {
      await callable.edit_items({ slideId: 's06', list: 'items', op: 'remove', index: i });
    }
    const last = await callable.edit_items({ slideId: 's06', list: 'items', op: 'remove', index: 0 });
    expect(last.ok).toBe(false);
    expect(store.getSlide('s06')!.props.items).toHaveLength(1);
  });
});
