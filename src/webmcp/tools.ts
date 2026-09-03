import { registry } from '../deck/registry';
import * as store from '../annotations/store';
import { validate } from './validate';

/**
 * WebMCP surface.
 *
 * Four commitments, each traceable to Chrome's WebMCP guidance:
 *
 * 1. NO GENERAL-PURPOSE WRITE TOOL. Every writer takes a typed, enumerated
 *    argument. An `update(slideId, props: object)` escape hatch would win every
 *    routing decision and collapse the rest of this surface into string editing.
 *    ("Be careful not to create overlapping tools." — best-practices)
 *
 * 2. TOOLS FOLLOW THE PAGE. Nothing is registered until a deck is on screen —
 *    before that, one tool exists, and it opens a deck. Three more exist only
 *    while a note of the matching kind is open, and are unregistered via
 *    AbortController when it closes. A person, by marking up the deck, authors
 *    the agent's toolset.
 *    ("Register tools when they're useful in a certain page state, then
 *     unregister when the tool is no longer usable." — best-practices)
 *
 * 3. UNTRUSTED OUTPUT IS LABELLED. Anything that hands back human free text or
 *    agent-fetched external data carries `untrustedContentHint`.
 *    ("If a tool returns user-generated content (UGC) or externally sourced
 *     data, consider adding the untrustedContentHint." — secure-tools)
 *
 * 4. INPUT IS VALIDATED IN CODE. The browser does not check arguments against
 *    `inputSchema` (spec issue #92), so every call is validated here before it
 *    can touch the deck, and a bad call comes back with the schema's own words.
 *    ("Validate strictly in code, loosely in schema." — best-practices)
 */

type Exec = (input: any, opts?: { signal?: AbortSignal }) => Promise<any>;
type Reg = {
  name: string; title: string; description: string;
  inputSchema: any; annotations?: any; execute: Exec;
};

/** Chrome documents a 1.5K character budget per tool output. */
const OUTPUT_BUDGET = 1500;

const READ_UNTRUSTED = { readOnlyHint: true, untrustedContentHint: true };

const ok = (o: object) => ({ ok: true, ...o });

/**
 * Errors carry what the agent needs to succeed on the next attempt. A bare
 * message is a dead end. ("Add descriptive errors to your function code to
 * allow the model to self-correct and retry with new, valid parameters.")
 */
type Code =
  | 'NOT_FOUND' | 'INVALID_INPUT' | 'NOT_APPLICABLE' | 'CANCELLED'
  | 'OUT_OF_SCOPE' | 'STALE_READ' | 'NO_DECK' | 'ERROR';
const fail = (code: Code, message: string, recovery: object = {}, retrySafe = true) =>
  ({ ok: false, error: { code, message, ...recovery }, retrySafe });

/** Keep a list inside the output budget rather than letting it be truncated blind. */
function fit<T>(items: T[], render: (t: T) => any) {
  const out: any[] = [];
  let size = 0;
  for (const it of items) {
    const r = render(it);
    const cost = JSON.stringify(r).length + 1;
    if (size + cost > OUTPUT_BUDGET - 120) break;
    out.push(r); size += cost;
  }
  return { items: out, omitted: items.length - out.length };
}

const slideIds = () => store.getState().deck.slides.map(s => s.id);
const openIds = () => store.openAnnotations().map(a => a.id);

/**
 * The person's marks are the work order. While the scope switch says 'noted'
 * and at least one note is open, a write that targets an unmarked slide is
 * refused — this is what stops a well-meaning sweep from "fixing" nine slides
 * nobody asked about. The person can widen the scope on the page at any time.
 */
const outOfScope = (slideId: string) => {
  const st = store.getState();
  if (st.scope !== 'noted') return null;
  const noted = store.notedSlideIds();
  if (!noted.length || noted.includes(slideId)) return null;
  return fail('OUT_OF_SCOPE',
    `The person has scoped edits to the slides they marked, and "${slideId}" carries no open note.`,
    {
      notedSlideIds: noted,
      hint: 'Work the noted slides. If this edit is needed anyway, say so on a note and let the person widen the scope switch next to the queue.',
    });
};

/**
 * The person moved this slide on after the agent read it. Writing now would
 * overwrite their hand — the exact failure this product exists to prevent.
 * The refusal carries what changed, so one re-read is enough to continue.
 */
const stale = (slideId: string) => {
  const s = store.staleness(slideId);
  if (!s) return null;
  return fail('STALE_READ',
    `"${slideId}" changed after you read it (rev ${s.readRev} → ${s.currentRev}). Read it again before writing.`,
    { ...s, hint: 'Call read_slide, then retry against the current values.' });
};

/**
 * The page-enforced guards. Both are on in the product; the guardrail eval
 * (scripts/guardrail-eval.mts) turns them off for its control arm so the
 * difference they make can be measured rather than asserted.
 */
export const guards = { scope: true, stale: true };

/** Every point writer runs the same three gates, in this order. */
const gate = (slideId: string) => {
  const s = store.getSlide(slideId);
  if (!s) return { slide: null, refused: fail('NOT_FOUND', `No slide "${slideId}".`, { knownSlideIds: slideIds() }) };
  return { slide: s, refused: (guards.scope ? outOfScope(slideId) : null) ?? (guards.stale ? stale(slideId) : null) };
};

export function webmcpSupported() {
  return typeof document !== 'undefined'
    && typeof document.modelContext?.registerTool === 'function';
}

/* ------------------------------------------------------------------ *
 * Before a deck is open: one tool, and it opens a deck
 * ------------------------------------------------------------------ */

const entryTools: Reg[] = [
  {
    name: 'open_deck',
    title: 'Open a deck',
    description:
      'No deck is on screen yet, so there is nothing to review. Opens the sample briefing '
      + '(12 slides, already marked up) or continues the session saved in this browser. The '
      + 'review tools appear once a deck is open.',
    inputSchema: {
      type: 'object',
      properties: { which: { type: 'string', enum: ['sample', 'saved'] } },
      required: ['which'], additionalProperties: false,
    },
    execute: async ({ which }: any) => {
      if (which === 'saved' && !store.restoredFromSave)
        return fail('NOT_FOUND', 'There is no saved session in this browser.', { available: ['sample'] });
      if (which === 'sample' && (store.restoredFromSave || store.getState().deck.id !== 'screen-to-cart'))
        store.reset();
      store.setOpened(true);
      return ok({ opened: which, deck: store.getState().deck.title, slides: store.getState().deck.slides.length,
        next: 'The review tools are registered now. Start with list_open_annotations.' });
    },
  },
];

/* ------------------------------------------------------------------ *
 * Always registered while a deck is open
 * ------------------------------------------------------------------ */

/**
 * Every top-level free-text prop any slide type declares. Derived from the
 * registry so the enum the agent sees can never drift from what a slide can
 * actually hold; `chartForm` and other enums are excluded — they have tools.
 */
const TEXT_FIELDS = [...new Set(Object.values(registry).flatMap(d =>
  Object.entries<any>(d.propSchema)
    .filter(([, v]) => v?.type === 'string' && !v.enum)
    .map(([k]) => k)))].sort();

/** What the person can do to bring a conditional tool into existence. */
const HOW_TO_OPEN: Record<string, string> = {
  visualize: 'circle a chart and mark the note visualize',
  research: 'circle a figure and mark the note research',
  fix: 'circle the text and mark the note fix',
};

const baseTools: Reg[] = [
  {
    name: 'list_slides',
    title: 'List slides',
    description: 'The deck outline: every slide id, its type, and its headline. Start here.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    // headlines are authored human text
    annotations: READ_UNTRUSTED,
    execute: async () => {
      const { items, omitted } = fit(store.getState().deck.slides, s => ({
        id: s.id, type: s.type,
        head: String(s.props.title ?? s.props.caption ?? 'cover').slice(0, 60),
      }));
      const st = store.getState();
      const kinds = new Set<string>(store.openKinds());
      // Tools that are NOT registered right now, with the reason and the way
      // back. An agent that cannot find set_chart_form should ask the person
      // for a visualize note, not hunt for the tool (spec issue #262).
      const unavailableTools = Object.entries(conditionalTools)
        .filter(([kind]) => !kinds.has(kind))
        .map(([kind, t]) => ({ name: t.name, because: `no ${kind} note is open`, how: HOW_TO_OPEN[kind] }));
      return ok({
        deck: st.deck.title, slides: items, omitted,
        // The person's standing instruction, stated up front rather than
        // discovered through a refusal three calls in. Kept terse — this
        // response lives inside the documented output budget.
        editableSlides: st.scope === 'noted' && store.notedSlideIds().length
          ? store.notedSlideIds() : 'all',
        ...(unavailableTools.length && { unavailableTools }),
      });
    },
  },
  {
    name: 'read_slide',
    title: 'Read a slide',
    description:
      'One slide in full: its type, current prop values, the ids of regions that can carry '
      + 'a note, and its revision. Read before writing — a write after the person has '
      + 'changed the slide is refused until you read it again.',
    inputSchema: {
      type: 'object',
      properties: { slideId: { type: 'string', description: 'An id from list_slides.' } },
      required: ['slideId'], additionalProperties: false,
    },
    // props may hold figures an agent fetched earlier via attach_research
    annotations: READ_UNTRUSTED,
    execute: async ({ slideId }: any) => {
      const s = store.getSlide(slideId);
      if (!s) return fail('NOT_FOUND', `No slide "${slideId}".`, { knownSlideIds: slideIds() });
      store.noteAgentRead(slideId);
      const full = {
        slideId: s.id, type: s.type, rev: store.revisionOf(slideId), props: s.props,
        annotatableElements: registry[s.type].elements,
        series: registry[s.type].series ?? [],
      };
      if (JSON.stringify(full).length <= OUTPUT_BUDGET) return ok(full);
      // An imported deck can carry more than the budget holds. Trim the long
      // lists and say so, rather than letting the agent's client cut it blind.
      const props: Record<string, unknown> = {};
      const trimmed: string[] = [];
      for (const [k, v] of Object.entries(s.props)) {
        if (Array.isArray(v) && v.length > 3) { props[k] = v.slice(0, 3); trimmed.push(`${k} (${v.length} items, 3 shown)`); }
        else if (typeof v === 'string' && v.length > 200) { props[k] = v.slice(0, 200) + '…'; trimmed.push(k); }
        else props[k] = v;
      }
      return ok({ ...full, props, trimmed });
    },
  },
  {
    name: 'list_open_annotations',
    title: 'List open notes',
    description:
      'The review queue: every unresolved note a person marked on the deck, with the slide and '
      + 'region each is anchored to, and the thread of replies on it. The queue changes while '
      + 'you work — a person can add notes or answer yours at any time — so re-read it after '
      + 'each note rather than trusting an earlier copy. A note whose last word is yours is '
      + 'waiting on them; leave it open.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    // note bodies are human free text
    annotations: READ_UNTRUSTED,
    execute: async () => {
      const { items, omitted } = fit(store.openAnnotations(), a => ({
        id: a.id, kind: a.kind, note: a.body.slice(0, 180),
        slideId: a.slideId,
        marked: a.targets.map(t => t.label).slice(0, 2),
        ...(a.replies.length && {
          thread: a.replies.slice(-4).map(r => `${r.author}: ${r.body.slice(0, 140)}`),
          waitingOn: a.replies[a.replies.length - 1].author === 'agent' ? 'them' : 'you',
        }),
      }));
      return ok({
        open: items, omitted,
        scope: store.getState().scope,
        note: 'Re-read this after each change; it can grow.',
      });
    },
  },
  {
    name: 'set_slide_text',
    title: 'Rewrite one text field',
    description:
      'Replace the text of one named region on one slide. Reach for this when a single '
      + 'passage is wrong. When the same field needs the same treatment on several slides, '
      + 'unify_across_slides does it in one call and lets the person stop it partway.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        field: { type: 'string', enum: TEXT_FIELDS },
        text: { type: 'string', maxLength: 400 },
      },
      required: ['slideId', 'field', 'text'], additionalProperties: false,
    },
    execute: async ({ slideId, field, text }: any) => {
      const { slide: s, refused } = gate(slideId);
      if (!s) return refused;
      if (refused) return refused;
      if (!(field in registry[s.type].propSchema))
        return fail('NOT_APPLICABLE', `A ${s.type} slide has no "${field}".`,
          { fieldsOnThisSlide: Object.keys(registry[s.type].propSchema) });
      store.updateSlideProps(slideId, { [field]: text }, 'agent');
      store.markTouch(slideId, field);
      return ok({ slideId, field, text, rev: store.revisionOf(slideId) });
    },
  },
  {
    name: 'set_series',
    title: 'Replace the values a chart draws',
    description:
      'Swap the labelled values in one of a slide\'s series. read_slide lists the series a '
      + 'slide has; pass the one you mean. Order is kept exactly as given.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        series: { type: 'string', description: 'A series name from read_slide, e.g. "left.rows".' },
        rows: {
          type: 'array', minItems: 1, maxItems: 24,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', maxLength: 60 },
              value: { type: 'number' },
              strong: { type: 'boolean', description: 'Mark the row the slide is about.' },
            },
            required: ['label', 'value'], additionalProperties: false,
          },
        },
      },
      required: ['slideId', 'series', 'rows'], additionalProperties: false,
    },
    execute: async ({ slideId, series, rows }: any) => {
      const { slide: s, refused } = gate(slideId);
      if (!s) return refused;
      if (refused) return refused;
      const available = registry[s.type].series ?? [];
      if (!available.length)
        return fail('NOT_APPLICABLE', `A ${s.type} slide draws no series.`,
          { slidesWithSeries: store.getState().deck.slides
              .filter(x => (registry[x.type].series ?? []).length).map(x => x.id) });
      if (!available.includes(series))
        return fail('INVALID_INPUT', `"${series}" is not a series on this slide.`,
          { seriesOnThisSlide: available });
      store.setByPath(slideId, series, rows, 'agent');
      store.markTouch(slideId, series.split('.')[0]);
      return ok({ slideId, series, rows: rows.length, rev: store.revisionOf(slideId) });
    },
  },
  {
    name: 'edit_items',
    title: 'Add, remove, replace or move one list item',
    description:
      'Structural editing of a slide\'s list — its cards, steps, items, events, panels or '
      + 'groups. One operation per call: append an item, remove the item at an index, replace '
      + 'it, or move it. When a note says a block should go, remove it — do not rewrite every '
      + 'other block around it. read_slide shows each list and its current items.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        list: {
          type: 'string',
          description: 'The list prop to edit, e.g. "cards", "steps", "items", "events", "panels", "groups".',
        },
        op: { type: 'string', enum: ['append', 'remove', 'replace', 'move'] },
        index: { type: 'integer', minimum: 0, description: 'Which item, for remove / replace / move.' },
        to: { type: 'integer', minimum: 0, description: 'Destination index, for move.' },
        item: { type: 'object', description: 'The item to append or to replace with, shaped as read_slide shows.' },
      },
      required: ['slideId', 'list', 'op'], additionalProperties: false,
    },
    execute: async ({ slideId, list, op, index, to, item }: any) => {
      const { slide: s, refused } = gate(slideId);
      if (!s) return refused;
      if (refused) return refused;

      const schema = registry[s.type].propSchema[list];
      const editableLists = Object.entries<any>(registry[s.type].propSchema)
        .filter(([, v]) => v?.type === 'array' && v.items?.properties)
        .map(([k]) => k);
      if (!schema || schema.type !== 'array' || !schema.items?.properties)
        return fail('NOT_APPLICABLE', `A ${s.type} slide has no editable list "${list}".`,
          { listsOnThisSlide: editableLists });

      const rows: any[] = Array.isArray(s.props[list]) ? [...s.props[list]] : [];
      const max = schema.maxItems ?? 24;
      const min = schema.minItems ?? 0;
      const bad = (msg: string, extra: object = {}) => fail('INVALID_INPUT', msg, extra);

      if (op === 'append' || op === 'replace') {
        if (!item || typeof item !== 'object') return bad('Pass the item to write.');
        const allowed = Object.keys(schema.items.properties);
        const unknown = Object.keys(item).filter(k => !allowed.includes(k));
        if (unknown.length)
          return bad(`Unknown key(s) ${unknown.join(', ')} on this item.`, { allowedKeys: allowed });
        const missing = (schema.items.required ?? []).filter((k: string) => !(k in item));
        if (missing.length)
          return bad(`The item is missing ${missing.join(', ')}.`, { requiredKeys: schema.items.required });
        // The list's own item schema is the law for values too, not only keys.
        const problems = validate(schema.items, item, 'item');
        if (problems.length)
          return bad('The item does not fit this list\'s schema.', { problems, itemSchema: schema.items });
      }

      if (op === 'append') {
        if (rows.length >= max) return bad(`This list holds at most ${max} items.`);
        rows.push(item);
      } else {
        if (typeof index !== 'number' || index < 0 || index >= rows.length)
          return bad(`"index" must be 0..${rows.length - 1}.`, { count: rows.length });
        if (op === 'remove') {
          if (rows.length <= min) return bad(`This list needs at least ${min} item(s).`);
          rows.splice(index, 1);
        } else if (op === 'replace') {
          rows[index] = item;
        } else if (op === 'move') {
          if (typeof to !== 'number' || to < 0 || to >= rows.length)
            return bad(`"to" must be 0..${rows.length - 1}.`, { count: rows.length });
          const [m] = rows.splice(index, 1);
          rows.splice(to, 0, m);
        }
      }

      store.setByPath(slideId, list, rows, 'agent');
      store.markTouch(slideId, list);
      return ok({ slideId, list, op, count: rows.length, rev: store.revisionOf(slideId) });
    },
  },
  {
    name: 'reply_to_annotation',
    title: 'Reply on a note',
    description:
      'Write back on the note, pinned where it sits. Say what you changed and why, or what '
      + 'you need before you can act.',
    inputSchema: {
      type: 'object',
      properties: {
        annotationId: { type: 'string' },
        body: { type: 'string', maxLength: 400 },
      },
      required: ['annotationId', 'body'], additionalProperties: false,
    },
    execute: async ({ annotationId, body }: any) => {
      const a = store.replyToAnnotation(annotationId, body, 'agent');
      if (!a) return fail('NOT_FOUND', `No note "${annotationId}".`, { openNoteIds: openIds() });
      return ok({ annotationId, replies: a.replies.length });
    },
  },
  {
    name: 'resolve_annotation',
    title: 'Resolve a note',
    description: 'Close a note once the change it asked for is in the deck.',
    inputSchema: {
      type: 'object',
      properties: { annotationId: { type: 'string' } },
      required: ['annotationId'], additionalProperties: false,
    },
    execute: async ({ annotationId }: any) => {
      const a = store.resolveAnnotation(annotationId);
      if (!a) return fail('NOT_FOUND', `No note "${annotationId}".`, { openNoteIds: openIds() });
      return ok({ annotationId, status: a.status });
    },
  },
];

/* ------------------------------------------------------------------ *
 * Conditional — registered only while a note of that kind is open
 * ------------------------------------------------------------------ */

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const onAbort = () => { clearTimeout(t); rej(signal?.reason); };
  const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); res(); }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});

const conditionalTools: Record<string, Reg> = {
  visualize: {
    name: 'set_chart_form',
    title: 'Re-form a chart',
    description:
      'Change the visual form a slide uses to draw its data. "pie" only holds when the values '
      + 'are parts of one whole. "column" reads magnitude across a few categories. "cards" '
      + 'gives each figure its own frame with its context. Say which one the data wants and why.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        chartForm: { type: 'string', enum: ['cards', 'column', 'pie'] },
        rationale: { type: 'string', maxLength: 220, description: 'One line on why this form fits.' },
      },
      required: ['slideId', 'chartForm'], additionalProperties: false,
    },
    execute: async ({ slideId, chartForm, rationale }: any) => {
      const { slide: s, refused } = gate(slideId);
      if (!s) return refused;
      if (refused) return refused;
      if (!('chartForm' in registry[s.type].propSchema))
        return fail('NOT_APPLICABLE', `A ${s.type} slide has no chart form.`,
          { slidesWithChartForm: store.getState().deck.slides
              .filter(x => 'chartForm' in registry[x.type].propSchema).map(x => x.id) });
      const allowed: string[] = registry[s.type].propSchema.chartForm?.enum ?? [];
      if (!allowed.includes(chartForm))
        return fail('INVALID_INPUT', `"${chartForm}" is not a form this slide can take.`,
          { allowedForms: allowed });
      const before = s.props.chartForm;
      store.updateSlideProps(slideId, { chartForm }, 'agent');
      store.markTouch(slideId, 'chart');
      return ok({ slideId, before, after: chartForm, items: s.props.items?.length, rationale,
        rev: store.revisionOf(slideId) });
    },
  },

  research: {
    name: 'attach_research',
    title: 'Attach a sourced figure',
    description:
      'Write a figure you verified onto the slide a note is pinned to, together with where '
      + 'it came from and the period it covers. Provenance travels with the number.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        value: { type: 'string', maxLength: 40, description: 'The figure as it should read.' },
        unit: { type: 'string', maxLength: 12 },
        source: { type: 'string', maxLength: 200, description: 'Publisher and dataset.' },
        asOf: { type: 'string', maxLength: 40, description: 'Period covered, e.g. "2026 Q2".' },
        contradicts: {
          type: 'object',
          description:
            'Set this when the figure you just verified undercuts something the slide still '
            + 'asserts — a headline, a caption, a framing. Raising it flags the claim for the '
            + 'author. Do not rewrite the claim yourself.',
          properties: {
            elementId: { type: 'string', description: 'The region carrying the claim, from read_slide.' },
            claim: { type: 'string', maxLength: 200, description: 'The claim as it currently reads.' },
            why: { type: 'string', maxLength: 300, description: 'What the new figure shows instead.' },
          },
          required: ['elementId', 'claim', 'why'],
          additionalProperties: false,
        },
      },
      required: ['slideId', 'source', 'asOf'], additionalProperties: false,
    },
    // hands back data the agent fetched from outside this page
    annotations: { untrustedContentHint: true },
    execute: async ({ slideId, value, unit, source, asOf, contradicts }: any) => {
      const { slide: s, refused } = gate(slideId);
      if (!s) return refused;
      if (refused) return refused;
      // Check the conflict target BEFORE writing anything, so a bad region id
      // never leaves the slide half-updated.
      if (contradicts) {
        const regions = registry[s.type].elements;
        if (!regions.includes(contradicts.elementId))
          return fail('INVALID_INPUT',
            `"${contradicts.elementId}" is not a region on this slide.`,
            { regionsOnThisSlide: regions });
      }
      const patch: Record<string, unknown> = { source, asOf };
      if (value !== undefined) patch.value = value;
      if (unit !== undefined) patch.unit = unit;
      store.updateSlideProps(slideId, patch, 'agent');
      store.markTouch(slideId, 'source');

      let raised = false;
      if (contradicts) {
        store.raiseConflict(slideId, contradicts);
        raised = true;
      }
      return ok({
        slideId, wrote: Object.keys(patch), conflictRaised: raised, rev: store.revisionOf(slideId),
        ...(raised && { note: 'Flagged for the author. The claim was not rewritten.' }),
      });
    },
  },

  fix: {
    name: 'unify_across_slides',
    title: 'Apply one value across slides',
    description:
      'Make one convention consistent across a deck: sets the same text field on several '
      + 'slides in one call, applied in sequence so the person watching can stop it partway. '
      + 'This is the tool for "these are formatted three different ways, pick one". Use '
      + '"{value}" in the template to keep each slide\'s existing text and wrap it. This '
      + 'sweep may cross the noted scope because the person watches it land slide by slide — '
      + 'sweep only what the note actually asks for.',
    inputSchema: {
      type: 'object',
      properties: {
        field: { type: 'string', enum: TEXT_FIELDS },
        slideIds: { type: 'array', minItems: 1, maxItems: 24, items: { type: 'string' } },
        template: {
          type: 'string', maxLength: 240,
          description: 'The value to write. "{value}" keeps each slide\'s existing text.',
        },
      },
      required: ['field', 'slideIds', 'template'], additionalProperties: false,
    },
    /**
     * Long-running and cancellable from BOTH sides. The agent's host can abort
     * `opts.signal`; the person has a stop button on the page that aborts the
     * store's sweep signal. Either one ends the sweep between slides. Only the
     * page-side stop can be reported back to the agent: when the caller aborts,
     * the spec discards the tool's own resolution, so that report lands on the
     * on-page trail instead.
     */
    execute: async ({ field, slideIds: ids, template }: any, opts) => {
      const applied: string[] = [];
      const skipped: { id: string; why: string }[] = [];
      const page = store.beginSweep('unify_across_slides');
      const signal = opts?.signal ? AbortSignal.any([opts.signal, page]) : page;
      try {
        for (const id of ids) {
          if (signal.aborted) throw signal.reason;
          const s = store.getSlide(id);
          if (!s) { skipped.push({ id, why: 'no such slide' }); continue; }
          if (!(field in registry[s.type].propSchema)) {
            skipped.push({ id, why: `a ${s.type} slide has no "${field}"` }); continue;
          }
          if (guards.stale && store.staleness(id)) {
            skipped.push({ id, why: 'changed since you read it — read_slide again' }); continue;
          }
          const next = template.replace('{value}', String(s.props[field] ?? ''));
          store.updateSlideProps(id, { [field]: next }, 'agent');
          store.markTouch(id, field);
          applied.push(id);
          await sleep(320, signal);       // visible, and interruptible
        }
      } catch (e) {
        const remaining = ids.filter((i: string) => !applied.includes(i));
        if (signal.aborted) {
          return fail('CANCELLED',
            page.aborted ? 'Stopped partway by the person watching.' : 'Stopped partway by the caller.',
            { applied, remaining, stoppedBy: page.aborted ? 'person' : 'agent' }, false);
        }
        return fail('ERROR', e instanceof Error ? e.message : String(e), { applied, remaining }, false);
      } finally {
        store.endSweep();
      }
      return ok({ field, applied, skipped });
    },
  },
};

/* ------------------------------------------------------------------ *
 * Validation, tracing, and the callable surface
 * ------------------------------------------------------------------ */

/**
 * Wrap every execute: validate the input against the tool's own schema first,
 * then run, then record the call on the on-page trail. Both the browser's
 * calls and the scripted replay go through this, so what a judge sees the
 * page do and what an agent gets back are the same thing.
 */
/**
 * Tools whose execute is in flight. Unregistering a tool while it runs kills
 * its pending execution in Chrome before 153 (the caller sees UnknownError),
 * so the sync below leaves a running tool registered and catches up once it
 * has returned. `open_deck` is the case that hits this: its own success is
 * what removes it.
 */
const executing = new Map<string, number>();

function traced(t: Reg): Exec {
  return async (input, opts) => {
    executing.set(t.name, (executing.get(t.name) ?? 0) + 1);
    let r: any;
    try {
      const problems = validate(t.inputSchema, input ?? {});
      r = problems.length
        ? fail('INVALID_INPUT', `The call does not match ${t.name}'s input schema.`,
            { problems, inputSchema: t.inputSchema })
        : await t.execute(input ?? {}, opts);
    } finally {
      const n = (executing.get(t.name) ?? 1) - 1;
      if (n <= 0) executing.delete(t.name); else executing.set(t.name, n);
      // Let the result reach the caller before any re-sync can unregister us.
      setTimeout(() => { syncTools().catch(() => { /* reported in the UI */ }); }, 0);
    }
    const detail = r?.ok === false
      ? String(r.error?.code ?? 'error')
      : Object.entries(input ?? {}).slice(0, 2)
          .map(([k, v]) => `${k}=${String(Array.isArray(v) ? `${v.length} items` : v).slice(0, 22)}`)
          .join(' ');
    store.logCall(t.name, r?.ok !== false, detail);
    return r;
  };
}

/** The same tool bodies, callable locally — the scripted replay and the tests use these. */
export const callable: Record<string, Exec> = Object.fromEntries(
  [...entryTools, ...baseTools, ...Object.values(conditionalTools)].map(t => [t.name, traced(t)]),
);

/** Every tool's contract, for an agent client outside the browser (the eval harness). */
export const toolSchemas = () => [...entryTools, ...baseTools, ...Object.values(conditionalTools)]
  .map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations }));

/** The surface as it would register — for showing what exists even with no agent attached. */
export const advertisedTools = {
  entry: entryTools.map(t => t.name),
  base: baseTools.map(t => t.name),
  conditional: Object.entries(conditionalTools).map(([kind, t]) => ({ kind, name: t.name })),
};

/* ------------------------------------------------------------------ *
 * Registration
 * ------------------------------------------------------------------ */

/**
 * Every registration is owned by an AbortController. Aborting it is the only
 * way the spec offers to unregister, and aborting before re-registering is
 * what makes StrictMode's double invoke and HMR safe — swallowing a
 * duplicate-name error instead would leave the FIRST registration live and
 * the new one silently dropped.
 */
const live = new Map<string, AbortController>();

async function register(t: Reg) {
  live.get(t.name)?.abort();
  const ac = new AbortController();
  live.set(t.name, ac);
  await document.modelContext!.registerTool(
    {
      name: t.name, title: t.title, description: t.description,
      inputSchema: t.inputSchema, annotations: t.annotations,
      execute: (input: any, opts: any) => traced(t)(input, opts),
    },
    { signal: ac.signal },
  );
}

function unregister(name: string) {
  live.get(name)?.abort();
  live.delete(name);
}

/** The set that should be registered for the page as it is right now. */
function wanted(): Reg[] {
  const st = store.getState();
  if (!st.opened) return entryTools;
  const kinds = new Set<string>(store.openKinds());
  return [...baseTools, ...Object.entries(conditionalTools).filter(([k]) => kinds.has(k)).map(([, t]) => t)];
}

let syncing: Promise<void> | null = null;

/**
 * Bring the registered set in step with the page: the entry tool before a
 * deck is open, the review set once it is, the conditional three while a note
 * of their kind is open. Serialised, so two store updates in a row cannot
 * interleave their registrations.
 */
export function syncTools(): Promise<void> {
  if (!webmcpSupported()) return Promise.resolve();
  const run = async () => {
    const want = wanted();
    const names = new Set(want.map(t => t.name));
    for (const name of [...live.keys()])
      if (!names.has(name) && !executing.has(name)) unregister(name);
    for (const t of want) if (!live.has(t.name)) await register(t);
  };
  syncing = (syncing ?? Promise.resolve()).then(run, run);
  return syncing;
}

/** Names of the tools the browser currently exposes for this page. */
export async function liveTools(): Promise<string[]> {
  if (!webmcpSupported()) return [];
  const tools = await document.modelContext!.getTools();
  return tools.map(t => t.name);
}

/** First registration, before first paint, plus the store subscription that keeps it in step. */
export async function registerAll() {
  if (!webmcpSupported()) return { supported: false, tools: [] as string[] };
  await syncTools();
  return { supported: true, tools: await liveTools() };
}
