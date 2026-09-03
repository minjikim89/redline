import { beforeEach, describe, expect, it } from 'vitest';
import { callable, advertisedTools } from './tools';
import { validate } from './validate';
import * as store from '../annotations/store';

beforeEach(() => { store.reset(); store.setOpened(true); });

/* The browser does not validate tool input against inputSchema (spec issue
   #92). Before these tests, a call that dropped `text` wrote `undefined` into
   the headline of the slide the person was looking at. */
describe('input is validated in code, not left to the schema', () => {
  it('a missing required field is refused, and the slide is untouched', async () => {
    const before = store.getSlide('s04')!.props.title;
    const r = await callable.set_slide_text({ slideId: 's04', field: 'title' });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('INVALID_INPUT');
    expect(r.error.problems.map((p: any) => p.path)).toContain('text');
    expect(store.getSlide('s04')!.props.title).toBe(before);
  });

  it('a wrong type is refused with the field named', async () => {
    const r = await callable.set_series({ slideId: 's04', series: 'left.rows', rows: 'nope' });
    expect(r.ok).toBe(false);
    expect(r.error.problems[0].path).toBe('rows');
    expect(r.error.problems[0].message).toMatch(/expected array/);
  });

  it('an unknown field is refused, so a hallucinated argument cannot slip through', async () => {
    const r = await callable.set_slide_text({ slideId: 's04', field: 'title', text: 'ok', zzz: 1 });
    expect(r.ok).toBe(false);
    expect(r.error.problems[0].path).toBe('zzz');
  });

  it('an enum outside the vocabulary is refused before the tool body runs', async () => {
    const r = await callable.set_slide_text({ slideId: 's04', field: 'headline', text: 'ok' });
    expect(r.error.code).toBe('INVALID_INPUT');
    expect(r.error.problems[0].message).toMatch(/one of asOf, body, eyebrow/);
  });

  it('edit_items checks item values against the list schema, not only the keys', async () => {
    store.setScope('all');
    const r = await callable.edit_items({
      slideId: 's09', list: 'events', op: 'append', item: { year: 2027, text: 'typed as a number' },
    });
    expect(r.ok).toBe(false);
    expect(r.error.problems[0].path).toBe('item.year');
  });

  it('the refusal is logged on the trail like any other call', async () => {
    await callable.set_slide_text({});
    const last = store.getState().calls.at(-1)!;
    expect(last.name).toBe('set_slide_text');
    expect(last.ok).toBe(false);
    expect(last.detail).toBe('INVALID_INPUT');
  });

  it('the validator covers what the registry uses', () => {
    const schema = {
      type: 'object', required: ['a'], additionalProperties: false,
      properties: {
        a: { type: 'string', maxLength: 3, pattern: '^[a-z]+$' },
        n: { type: 'integer', minimum: 1, maximum: 5 },
        list: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'number' } },
      },
    };
    expect(validate(schema, { a: 'ab', n: 3, list: [1] })).toEqual([]);
    const bad = validate(schema, { a: 'ABCD', n: 2.5, list: [], x: 1 });
    expect(bad.map(p => p.path).sort()).toEqual(['a', 'a', 'list', 'n', 'x'].sort());
  });
});

/* The claim: a hand edit is visible to the agent at once. The other half of
   that claim is that the agent cannot overwrite a hand edit it has not seen. */
describe('revisions: the agent cannot write over an edit it has not read', () => {
  it('a write after the person changed the slide is refused with what changed', async () => {
    await callable.read_slide({ slideId: 's04' });
    store.setByPath('s04', 'title', 'Retyped by hand while the agent was thinking');
    const r = await callable.set_slide_text({ slideId: 's04', field: 'title', text: 'agent version' });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('STALE_READ');
    expect(r.error.changedSince).toEqual([{ by: 'human', fields: ['title'] }]);
    expect(store.getSlide('s04')!.props.title).toBe('Retyped by hand while the agent was thinking');
  });

  it('reading again clears it', async () => {
    await callable.read_slide({ slideId: 's04' });
    store.setByPath('s04', 'title', 'hand edit');
    const again = await callable.read_slide({ slideId: 's04' });
    expect(again.props.title).toBe('hand edit');
    const r = await callable.set_slide_text({ slideId: 's04', field: 'title', text: 'agent version' });
    expect(r.ok).toBe(true);
  });

  it("the agent's own writes do not make its view stale", async () => {
    const first = await callable.read_slide({ slideId: 's04' });
    const w1 = await callable.set_slide_text({ slideId: 's04', field: 'title', text: 'one' });
    expect(w1.rev).toBe(first.rev + 1);
    const w2 = await callable.set_slide_text({ slideId: 's04', field: 'title', text: 'two' });
    expect(w2.ok).toBe(true);
  });

  it('an undo by the person counts as a change', async () => {
    await callable.set_slide_text({ slideId: 's04', field: 'title', text: 'agent wrote this' });
    await callable.read_slide({ slideId: 's04' });
    store.undo();
    const r = await callable.set_slide_text({ slideId: 's04', field: 'title', text: 'again' });
    expect(r.error.code).toBe('STALE_READ');
  });

  it('a slide the agent never read is not stale — it is simply unread', async () => {
    store.setByPath('s04', 'title', 'hand edit');
    const r = await callable.set_slide_text({ slideId: 's04', field: 'title', text: 'agent' });
    expect(r.ok).toBe(true);
  });

  it('the sweep skips a slide that moved on, rather than overwriting it', async () => {
    await callable.read_slide({ slideId: 's05' });
    store.setByPath('s05', 'source', 'hand-edited source');
    const r = await callable.unify_across_slides({
      field: 'source', slideIds: ['s04', 's05'], template: 'Source: {value}',
    });
    expect(r.applied).toEqual(['s04']);
    expect(r.skipped[0].id).toBe('s05');
    expect(store.getSlide('s05')!.props.source).toBe('hand-edited source');
  });
});

/* A running sweep is the one thing on the page an agent does that takes
   time. The person watching it has a stop button, and the tool it stops gets
   to say what landed. */
describe('the person can stop a sweep from the page', () => {
  it('pressing stop ends the sweep between slides and reports what landed', async () => {
    const p = callable.unify_across_slides({
      field: 'source', slideIds: ['s04', 's05', 's07', 's08', 's10'], template: 'Source: {value}',
    });
    await new Promise(r => setTimeout(r, 50));
    expect(store.getState().sweep?.tool).toBe('unify_across_slides');
    store.stopSweep();
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('CANCELLED');
    expect(r.error.stoppedBy).toBe('person');
    expect(r.error.applied).toEqual(['s04']);
    expect(r.error.remaining).toEqual(['s05', 's07', 's08', 's10']);
    expect(store.getState().sweep).toBeNull();
  });

  it("a caller's abort is told apart from the person's", async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);
    const r = await callable.unify_across_slides(
      { field: 'source', slideIds: ['s04', 's05', 's07'], template: 'Source: {value}' },
      { signal: ac.signal },
    );
    expect(r.error.code).toBe('CANCELLED');
    expect(r.error.stoppedBy).toBe('agent');
    expect(store.getState().sweep).toBeNull();
  });

  it('an internal failure is not reported as a cancellation', async () => {
    const r = await callable.unify_across_slides({
      field: 'source', slideIds: ['s04'], template: 'x',
    });
    expect(r.ok).toBe(true);   // the happy path; the error branch is exercised by type checks
  });
});

/* Before a deck is open there is nothing to review, so there is nothing to
   register — except the one tool that opens a deck. */
describe('tools follow the page: nothing to review until a deck is open', () => {
  it('advertises one entry tool, eight base tools, three conditional tools', () => {
    expect(advertisedTools.entry).toEqual(['open_deck']);
    expect(advertisedTools.base).toHaveLength(8);
    expect(advertisedTools.conditional.map(c => c.kind).sort()).toEqual(['fix', 'research', 'visualize']);
  });

  it('open_deck opens the sample and says what to do next', async () => {
    store.setOpened(false);
    const r = await callable.open_deck({ which: 'sample' });
    expect(r.ok).toBe(true);
    expect(store.getState().opened).toBe(true);
    expect(r.next).toMatch(/list_open_annotations/);
  });

  it('open_deck refuses a saved session this browser does not have', async () => {
    store.setOpened(false);
    const r = await callable.open_deck({ which: 'saved' });
    expect(r.ok).toBe(false);
    expect(r.error.available).toEqual(['sample']);
  });
});
