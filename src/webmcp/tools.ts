import { registry } from '../deck/registry';
import * as store from '../annotations/store';

type Reg = { name: string; title?: string; description: string;
             inputSchema?: any; annotations?: any; execute: (i: any, o?: any) => Promise<any> };

const RO = { readOnlyHint: true };
const ok = (o: object) => ({ ok: true, ...o });
const err = (message: string, extra: object = {}) => ({ ok: false, error: message, ...extra });

export function webmcpSupported() {
  return typeof document !== 'undefined'
    && typeof (document as any).modelContext?.registerTool === 'function';
}

const mc = () => (document as any).modelContext;

/* ------------------------------------------------------------------ *
 * Always-on tools
 * ------------------------------------------------------------------ */

const baseTools: Reg[] = [
  {
    name: 'list_slides',
    title: 'List slides',
    description: 'Outline of the deck: every slide id, its type, and its headline. Start here.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: RO,
    execute: async () => ok({
      deckTitle: store.getState().deck.title,
      slides: store.getState().deck.slides.map(s => ({
        slideId: s.id, type: s.type, typeLabel: registry[s.type].label,
        headline: s.props.title ?? s.props.caption ?? '(cover)',
      })),
    }),
  },
  {
    name: 'read_slide',
    title: 'Read a slide',
    description:
      'Full current state of one slide: its type, every prop value, the schema of props you '
      + 'may set, and the ids of regions that can carry an annotation.',
    inputSchema: {
      type: 'object',
      properties: { slideId: { type: 'string' } },
      required: ['slideId'], additionalProperties: false,
    },
    annotations: RO,
    execute: async ({ slideId }: any) => {
      const s = store.getSlide(slideId);
      if (!s) return err(`No slide "${slideId}".`, { known: store.getState().deck.slides.map(x => x.id) });
      const def = registry[s.type];
      return ok({ slideId: s.id, type: s.type, props: s.props,
                  settableProps: def.propSchema, annotatableElements: def.elements });
    },
  },
  {
    name: 'list_open_annotations',
    title: 'List open annotations',
    description:
      'The work queue. Every unresolved note a person pinned to the deck, with the exact '
      + 'slide and region it is anchored to. Work these one at a time, then resolve each.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: RO,
    execute: async () => ok({
      open: store.openAnnotations().map(a => ({
        annotationId: a.id, kind: a.kind, note: a.body,
        anchor: { slideId: a.slideId, elementId: a.elementId },
        replies: a.replies.length,
      })),
    }),
  },
  {
    name: 'update_slide_props',
    title: 'Update slide content',
    description:
      'Set one or more props on a slide. Read the slide first to see which props it accepts. '
      + 'Only keys in that schema are applied.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        props: { type: 'object', description: 'Partial prop patch matching the slide type schema.' },
      },
      required: ['slideId', 'props'], additionalProperties: false,
    },
    execute: async ({ slideId, props }: any) => {
      const s = store.getSlide(slideId);
      if (!s) return err(`No slide "${slideId}".`);
      const allowed = Object.keys(registry[s.type].propSchema);
      const rejected = Object.keys(props ?? {}).filter(k => !allowed.includes(k));
      const patch = Object.fromEntries(
        Object.entries(props ?? {}).filter(([k]) => allowed.includes(k)));
      if (!Object.keys(patch).length) return err('No settable props in patch.', { allowed });
      const next = store.updateSlideProps(slideId, patch);
      return ok({ applied: Object.keys(patch), rejected, props: next?.props });
    },
  },
  {
    name: 'reply_to_annotation',
    title: 'Reply to an annotation',
    description:
      'Write back on the note, pinned in the same place. Use this to explain what you changed '
      + 'and why, or to say what you need before you can act.',
    inputSchema: {
      type: 'object',
      properties: { annotationId: { type: 'string' }, body: { type: 'string' } },
      required: ['annotationId', 'body'], additionalProperties: false,
    },
    execute: async ({ annotationId, body }: any) => {
      const a = store.replyToAnnotation(annotationId, body, 'agent');
      return a ? ok({ annotationId, replies: a.replies.length }) : err('Unknown annotation.');
    },
  },
  {
    name: 'resolve_annotation',
    title: 'Resolve an annotation',
    description: 'Mark a note done, once the change it asked for is actually in the deck.',
    inputSchema: {
      type: 'object',
      properties: { annotationId: { type: 'string' } },
      required: ['annotationId'], additionalProperties: false,
    },
    execute: async ({ annotationId }: any) => {
      const a = store.resolveAnnotation(annotationId);
      return a ? ok({ annotationId, status: a.status }) : err('Unknown annotation.');
    },
  },
];

/* ------------------------------------------------------------------ *
 * Conditional tools — registered only while a matching note is open.
 * A person, by pinning a note, authors the agent's toolset in real time.
 * ------------------------------------------------------------------ */

const conditionalTools: Record<string, Reg> = {
  visualize: {
    name: 'set_chart_form',
    title: 'Re-form a chart',
    description:
      'Change how a slide draws its data. Pick from the allowed forms only. '
      + 'A pie is only readable for 2-4 parts of a whole; past that use a sorted bar.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        chartForm: { type: 'string', enum: ['pie', 'bar', 'column'] },
        rationale: { type: 'string', description: 'One line on why this form fits the data.' },
      },
      required: ['slideId', 'chartForm'], additionalProperties: false,
    },
    execute: async ({ slideId, chartForm, rationale }: any) => {
      const s = store.getSlide(slideId);
      if (!s) return err(`No slide "${slideId}".`);
      if (!('chartForm' in registry[s.type].propSchema))
        return err(`Slide type "${s.type}" has no chart form.`);
      const before = s.props.chartForm;
      store.updateSlideProps(slideId, { chartForm });
      return ok({ slideId, before, after: chartForm, categories: s.props.data?.length, rationale });
    },
  },
  research: {
    name: 'attach_research',
    title: 'Attach a researched figure',
    description:
      'Write a verified figure and its source onto the slide the note is pinned to. '
      + 'Always include where the number came from and what period it covers.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        value: { type: 'string', description: 'The figure, as it should read on the slide.' },
        unit: { type: 'string' },
        source: { type: 'string', description: 'Publisher and dataset.' },
        asOf: { type: 'string', description: 'Period the figure covers, e.g. "2026 Q2".' },
      },
      required: ['slideId', 'source', 'asOf'], additionalProperties: false,
    },
    execute: async ({ slideId, value, unit, source, asOf }: any) => {
      const s = store.getSlide(slideId);
      if (!s) return err(`No slide "${slideId}".`);
      const patch: Record<string, unknown> = { source, asOf };
      if (value !== undefined) patch.value = value;
      if (unit !== undefined) patch.unit = unit;
      const next = store.updateSlideProps(slideId, patch);
      return ok({ slideId, props: next?.props });
    },
  },
};

/* ------------------------------------------------------------------ *
 * Registration + dynamic sync
 * ------------------------------------------------------------------ */

const live = new Map<string, AbortController>();

async function register(t: Reg, signal?: AbortSignal) {
  await mc().registerTool(
    { name: t.name, title: t.title, description: t.description,
      inputSchema: t.inputSchema, annotations: t.annotations,
      execute: async (input: any) => t.execute(input) },
    signal ? { signal } : undefined,
  );
}

/** Add/remove conditional tools so the toolset always matches the open queue. */
export async function syncConditionalTools() {
  if (!webmcpSupported()) return;
  const kinds = new Set(store.openKinds());

  for (const [kind, tool] of Object.entries(conditionalTools)) {
    const isLive = live.has(kind);
    if (kinds.has(kind as any) && !isLive) {
      const ac = new AbortController();
      live.set(kind, ac);
      try { await register(tool, ac.signal); }
      catch { live.delete(kind); }
    } else if (!kinds.has(kind as any) && isLive) {
      live.get(kind)!.abort();
      live.delete(kind);
    }
  }
}

export async function registerAll() {
  if (!webmcpSupported()) return { supported: false, tools: [] as string[] };
  for (const t of baseTools) {
    try { await register(t); } catch { /* already registered on HMR */ }
  }
  await syncConditionalTools();
  const tools = await mc().getTools();
  return { supported: true, tools: tools.map((t: any) => t.name) };
}
