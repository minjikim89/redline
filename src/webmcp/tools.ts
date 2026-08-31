import { registry } from '../deck/registry';
import * as store from '../annotations/store';

/**
 * WebMCP surface.
 *
 * Three commitments, each traceable to Chrome's WebMCP guidance:
 *
 * 1. NO GENERAL-PURPOSE WRITE TOOL. Every writer takes a typed, enumerated
 *    argument. An `update(slideId, props: object)` escape hatch would win every
 *    routing decision and collapse the rest of this surface into string editing.
 *    ("Be careful not to create overlapping tools." — best-practices)
 *
 * 2. TOOLS FOLLOW THE QUEUE. Three tools exist only while a note of the matching
 *    kind is open, and are unregistered via AbortController when it closes. A
 *    person, by marking up the deck, authors the agent's toolset.
 *    ("Register tools when they're useful in a certain page state, then
 *     unregister when the tool is no longer usable." — best-practices)
 *
 * 3. UNTRUSTED OUTPUT IS LABELLED. Anything that hands back human free text or
 *    agent-fetched external data carries `untrustedContentHint`.
 *    ("If a tool returns user-generated content (UGC) or externally sourced
 *     data, consider adding the untrustedContentHint." — secure-tools)
 */

type Exec = (input: any, opts?: { signal?: AbortSignal }) => Promise<any>;
type Reg = {
  name: string; title: string; description: string;
  inputSchema: any; annotations?: any; execute: Exec;
};

/** Chrome documents a 1.5K character budget per tool output. */
const OUTPUT_BUDGET = 1500;

const READ = { readOnlyHint: true };
const READ_UNTRUSTED = { readOnlyHint: true, untrustedContentHint: true };

const ok = (o: object) => ({ ok: true, ...o });

/**
 * Errors carry what the agent needs to succeed on the next attempt. A bare
 * message is a dead end. ("Add descriptive errors to your function code to
 * allow the model to self-correct and retry with new, valid parameters.")
 */
const fail = (
  code: 'NOT_FOUND' | 'INVALID_INPUT' | 'NOT_APPLICABLE' | 'CANCELLED',
  message: string,
  recovery: object = {},
  retrySafe = true,
) => ({ ok: false, error: { code, message, ...recovery }, retrySafe });

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

export function webmcpSupported() {
  return typeof document !== 'undefined'
    && typeof (document as any).modelContext?.registerTool === 'function';
}
const mc = () => (document as any).modelContext;

/* ------------------------------------------------------------------ *
 * Always registered
 * ------------------------------------------------------------------ */

const TEXT_FIELDS = ['title', 'kicker', 'caption', 'subtitle', 'byline', 'source'] as const;

const baseTools: Reg[] = [
  {
    name: 'list_slides',
    title: 'List slides',
    description: 'The deck outline: every slide id, its type, and its headline. Start here.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ,
    execute: async () => {
      const { items, omitted } = fit(store.getState().deck.slides, s => ({
        id: s.id, type: s.type,
        head: String(s.props.title ?? s.props.caption ?? 'cover').slice(0, 60),
      }));
      return ok({ deck: store.getState().deck.title, slides: items, omitted });
    },
  },
  {
    name: 'read_slide',
    title: 'Read a slide',
    description:
      'One slide in full: its type, current prop values, and the ids of regions that can '
      + 'carry a note. Read before writing.',
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
      return ok({
        slideId: s.id, type: s.type, props: s.props,
        annotatableElements: registry[s.type].elements,
      });
    },
  },
  {
    name: 'list_open_annotations',
    title: 'List open notes',
    description:
      'The review queue: every unresolved note a person marked on the deck, with the slide '
      + 'and region each one is anchored to. Work them one at a time and resolve each when done.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    // note bodies are human free text
    annotations: READ_UNTRUSTED,
    execute: async () => {
      const { items, omitted } = fit(store.openAnnotations(), a => ({
        id: a.id, kind: a.kind, note: a.body.slice(0, 180),
        slideId: a.slideId,
        marked: a.targets.map(t => t.label).slice(0, 2),
      }));
      return ok({ open: items, omitted });
    },
  },
  {
    name: 'set_slide_text',
    title: 'Rewrite one text field',
    description:
      'Replace the text of a single named region on a slide. Each call touches one field.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        field: { type: 'string', enum: TEXT_FIELDS as unknown as string[] },
        text: { type: 'string', maxLength: 400 },
      },
      required: ['slideId', 'field', 'text'], additionalProperties: false,
    },
    execute: async ({ slideId, field, text }: any) => {
      const s = store.getSlide(slideId);
      if (!s) return fail('NOT_FOUND', `No slide "${slideId}".`, { knownSlideIds: slideIds() });
      if (!(field in registry[s.type].propSchema))
        return fail('NOT_APPLICABLE', `A ${s.type} slide has no "${field}".`,
          { fieldsOnThisSlide: Object.keys(registry[s.type].propSchema) });
      store.updateSlideProps(slideId, { [field]: text });
      return ok({ slideId, field, text });
    },
  },
  {
    name: 'set_chart_data',
    title: 'Replace a chart series',
    description: 'Swap the labelled values a chart draws. Order is preserved as given.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        data: {
          type: 'array', minItems: 1, maxItems: 24,
          items: {
            type: 'object',
            properties: { label: { type: 'string', maxLength: 40 }, value: { type: 'number' } },
            required: ['label', 'value'], additionalProperties: false,
          },
        },
        unit: { type: 'string', maxLength: 12 },
      },
      required: ['slideId', 'data'], additionalProperties: false,
    },
    execute: async ({ slideId, data, unit }: any) => {
      const s = store.getSlide(slideId);
      if (!s) return fail('NOT_FOUND', `No slide "${slideId}".`, { knownSlideIds: slideIds() });
      if (!('data' in registry[s.type].propSchema))
        return fail('NOT_APPLICABLE', `A ${s.type} slide draws no series.`,
          { slidesWithSeries: store.getState().deck.slides
              .filter(x => 'data' in registry[x.type].propSchema).map(x => x.id) });
      store.updateSlideProps(slideId, unit === undefined ? { data } : { data, unit });
      return ok({ slideId, points: data.length });
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
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(signal.reason); }, { once: true });
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
      const s = store.getSlide(slideId);
      if (!s) return fail('NOT_FOUND', `No slide "${slideId}".`, { knownSlideIds: slideIds() });
      if (!('chartForm' in registry[s.type].propSchema))
        return fail('NOT_APPLICABLE', `A ${s.type} slide has no chart form.`,
          { slidesWithChartForm: store.getState().deck.slides
              .filter(x => 'chartForm' in registry[x.type].propSchema).map(x => x.id) });
      const allowed: string[] = registry[s.type].propSchema.chartForm?.enum ?? [];
      if (!allowed.includes(chartForm))
        return fail('INVALID_INPUT', `"${chartForm}" is not a form this slide can take.`,
          { allowedForms: allowed });
      const before = s.props.chartForm;
      store.updateSlideProps(slideId, { chartForm });
      return ok({ slideId, before, after: chartForm, items: s.props.items?.length, rationale });
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
      },
      required: ['slideId', 'source', 'asOf'], additionalProperties: false,
    },
    // hands back data the agent fetched from outside this page
    annotations: { untrustedContentHint: true },
    execute: async ({ slideId, value, unit, source, asOf }: any) => {
      const s = store.getSlide(slideId);
      if (!s) return fail('NOT_FOUND', `No slide "${slideId}".`, { knownSlideIds: slideIds() });
      const patch: Record<string, unknown> = { source, asOf };
      if (value !== undefined) patch.value = value;
      if (unit !== undefined) patch.unit = unit;
      store.updateSlideProps(slideId, patch);
      return ok({ slideId, wrote: Object.keys(patch) });
    },
  },

  fix: {
    name: 'unify_across_slides',
    title: 'Apply one value across slides',
    description:
      'Set the same text field to one agreed value on several slides at once, applied in '
      + 'sequence so the person watching can stop it partway. Use it to make a convention '
      + 'consistent across a deck.',
    inputSchema: {
      type: 'object',
      properties: {
        field: { type: 'string', enum: TEXT_FIELDS as unknown as string[] },
        slideIds: { type: 'array', minItems: 1, maxItems: 24, items: { type: 'string' } },
        template: {
          type: 'string', maxLength: 240,
          description: 'The value to write. "{value}" keeps each slide\'s existing text.',
        },
      },
      required: ['field', 'slideIds', 'template'], additionalProperties: false,
    },
    // Long-running and cancellable: the person can stop it mid-sweep.
    execute: async ({ field, slideIds: ids, template }: any, opts) => {
      const applied: string[] = [];
      const skipped: { id: string; why: string }[] = [];
      try {
        for (const id of ids) {
          opts?.signal?.throwIfAborted?.();
          const s = store.getSlide(id);
          if (!s) { skipped.push({ id, why: 'no such slide' }); continue; }
          if (!(field in registry[s.type].propSchema)) {
            skipped.push({ id, why: `a ${s.type} slide has no "${field}"` }); continue;
          }
          const next = template.replace('{value}', String(s.props[field] ?? ''));
          store.updateSlideProps(id, { [field]: next });
          applied.push(id);
          await sleep(320, opts?.signal);       // visible, and interruptible
        }
      } catch {
        return fail('CANCELLED', 'Stopped partway by the person watching.',
          { applied, remaining: ids.filter((i: string) => !applied.includes(i)) },
          false);
      }
      return ok({ field, applied, skipped });
    },
  },
};

/**
 * The same tool bodies, callable locally. Used by the scripted replay so a
 * visitor without an agent still sees the loop run — through the real
 * implementations, not a mock of them.
 */
export const callable: Record<string, Exec> = Object.fromEntries(
  [...baseTools, ...Object.values(conditionalTools)].map(t => [t.name, t.execute]),
);

/* ------------------------------------------------------------------ *
 * Registration
 * ------------------------------------------------------------------ */

/**
 * Every registration is owned by an AbortController, including the permanent
 * ones. Aborting before re-registering is what makes StrictMode's double
 * invoke and HMR safe — swallowing a duplicate-name error instead would leave
 * the FIRST registration live and the new one silently dropped.
 */
const baseCtl = new Map<string, AbortController>();
const condCtl = new Map<string, AbortController>();

async function register(t: Reg, signal: AbortSignal) {
  await mc().registerTool(
    {
      name: t.name, title: t.title, description: t.description,
      inputSchema: t.inputSchema, annotations: t.annotations,
      execute: (input: any, opts: any) => t.execute(input, opts),
    },
    { signal },
  );
}

/** Keep the conditional set in step with the open queue. */
export async function syncConditionalTools() {
  if (!webmcpSupported()) return;
  const kinds = new Set<string>(store.openKinds());

  for (const [kind, tool] of Object.entries(conditionalTools)) {
    const live = condCtl.get(kind);
    if (kinds.has(kind) && !live) {
      const ac = new AbortController();
      condCtl.set(kind, ac);
      try { await register(tool, ac.signal); } catch { condCtl.delete(kind); }
    } else if (!kinds.has(kind) && live) {
      live.abort();
      condCtl.delete(kind);
    }
  }
}

export async function registerAll() {
  if (!webmcpSupported()) return { supported: false, tools: [] as string[] };

  for (const t of baseTools) {
    baseCtl.get(t.name)?.abort();          // idempotent across StrictMode / HMR
    const ac = new AbortController();
    baseCtl.set(t.name, ac);
    await register(t, ac.signal);
  }
  await syncConditionalTools();

  const tools = await mc().getTools();
  return { supported: true, tools: tools.map((t: any) => t.name) };
}
