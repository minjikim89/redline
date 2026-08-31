import type { SlideType } from './types';
import * as S from './slides';

export interface SlideDef {
  label: string;
  component: React.ComponentType<any>;
  elements: string[];
  /** JSON Schema for the props an agent may set. This is the agent's vocabulary. */
  propSchema: Record<string, any>;
}

const str = (max = 400) => ({ type: 'string', maxLength: max });
const rows = {
  type: 'array', minItems: 1, maxItems: 12,
  items: {
    type: 'object',
    properties: { label: str(60), value: { type: 'number' }, strong: { type: 'boolean' },
    color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' } },
    required: ['label', 'value'], additionalProperties: false,
  },
};

export const registry: Record<SlideType, SlideDef> = {
  cover: {
    label: 'Cover',
    component: S.CoverSlide,
    elements: ['kicker', 'title', 'subtitle', 'meta'],
    propSchema: { eyebrow: str(80), title: str(120), subtitle: str(300) },
  },
  hero: {
    label: 'One headline figure, full bleed',
    component: S.HeroSlide,
    elements: ['kicker', 'value', 'body', 'source'],
    propSchema: {
      eyebrow: str(120), figure: str(24), tail: str(24),
      body: str(400), footnote: str(160), source: str(200),
    },
  },
  cards: {
    label: 'A row of framed points',
    component: S.CardsSlide,
    elements: ['kicker', 'title', 'body', 'footnote'],
    propSchema: {
      kicker: str(60), title: str(200), footnote: str(400),
      cards: {
        type: 'array', minItems: 2, maxItems: 4,
        items: {
          type: 'object',
          properties: { index: str(30), head: str(80), body: str(300) },
          required: ['index', 'head', 'body'], additionalProperties: false,
        },
      },
    },
  },
  barsPair: {
    label: 'Two ranked bar groups side by side',
    component: S.BarsPairSlide,
    elements: ['kicker', 'title', 'body', 'source'],
    propSchema: {
      kicker: str(60), title: str(200), source: str(300), asOf: str(40),
      left: {
        type: 'object',
        properties: { caption: str(160), unit: str(12), note: str(400), rows },
        required: ['caption', 'rows'],
      },
      right: {
        type: 'object',
        properties: { caption: str(160), unit: str(12), note: str(400), rows },
        required: ['caption', 'rows'],
      },
    },
  },
  flow: {
    label: 'Sequential steps with a supporting chart',
    component: S.FlowSlide,
    elements: ['kicker', 'title', 'body', 'chart', 'source'],
    propSchema: {
      kicker: str(60), title: str(200), source: str(300), asOf: str(40),
      steps: {
        type: 'array', minItems: 2, maxItems: 3,
        items: {
          type: 'object',
          properties: { head: str(40), body: str(240) },
          required: ['head', 'body'], additionalProperties: false,
        },
      },
    },
  },
  figures: {
    label: 'Several standalone figures',
    component: S.FiguresSlide,
    elements: ['kicker', 'title', 'chart', 'footnote'],
    propSchema: {
      kicker: str(60), title: str(200),
      chartForm: {
        type: 'string', enum: ['cards', 'column', 'pie'],
        description:
          'How to draw these figures. Use "pie" only when the values are parts of one '
          + 'whole. Use "cards" or "column" for figures that stand on their own.',
      },
    },
  },
  panels: {
    label: 'Two panels of reported metrics',
    component: S.PanelsSlide,
    elements: ['kicker', 'title', 'body', 'source'],
    propSchema: {
      kicker: str(60), title: str(200), source: str(300), asOf: str(40),
      panels: {
        type: 'array', minItems: 1, maxItems: 2,
        items: {
          type: 'object',
          properties: {
            heading: str(80), note: str(400), dark: { type: 'boolean' },
            metrics: {
              type: 'array', maxItems: 6,
              items: {
                type: 'object',
                properties: { value: str(20), label: str(60), emphasis: { type: 'boolean' } },
                required: ['value', 'label'], additionalProperties: false,
              },
            },
          },
          required: ['heading', 'metrics'],
        },
      },
    },
  },
  timeline: {
    label: 'Dated inflection points',
    component: S.TimelineSlide,
    elements: ['kicker', 'title', 'body', 'source'],
    propSchema: {
      kicker: str(60), title: str(200), source: str(300),
      events: {
        type: 'array', minItems: 2, maxItems: 8,
        items: {
          type: 'object',
          properties: { year: str(12), text: str(240), late: { type: 'boolean' } },
          required: ['year', 'text'], additionalProperties: false,
        },
      },
    },
  },
  refs: {
    label: 'References and notes',
    component: S.RefsSlide,
    elements: ['kicker', 'title', 'body', 'source'],
    propSchema: {
      kicker: str(60), title: str(200), source: str(300),
      groups: {
        type: 'array', maxItems: 10,
        items: {
          type: 'object',
          properties: { topic: str(60), text: str(400) },
          required: ['topic', 'text'], additionalProperties: false,
        },
      },
    },
  },
};

export const slideTypes = Object.keys(registry) as SlideType[];
