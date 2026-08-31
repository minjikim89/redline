import type { SlideType } from './types';
import * as S from './slides';

export interface SlideDef {
  label: string;
  component: React.ComponentType<any>;
  /** Annotatable regions this slide exposes. */
  elements: string[];
  /** JSON Schema for the props an agent is allowed to set. Feeds tool inputSchema. */
  propSchema: Record<string, any>;
}

const datumArray = {
  type: 'array',
  items: {
    type: 'object',
    properties: { label: { type: 'string' }, value: { type: 'number' } },
    required: ['label', 'value'], additionalProperties: false,
  },
};

/**
 * The registry IS the agent's vocabulary. A tool can only pick a slide type
 * from these keys and can only set props described here, so it cannot
 * invent a layout or hand back malformed markup.
 */
export const registry: Record<SlideType, SlideDef> = {
  title: {
    label: 'Cover',
    component: S.TitleSlide,
    elements: ['title', 'subtitle', 'byline'],
    propSchema: { title: { type: 'string' }, subtitle: { type: 'string' }, byline: { type: 'string' } },
  },
  bigNumber: {
    label: 'Single headline figure',
    component: S.BigNumberSlide,
    elements: ['kicker', 'title', 'value', 'source'],
    propSchema: {
      kicker: { type: 'string' }, value: { type: 'string' }, unit: { type: 'string' },
      caption: { type: 'string' }, source: { type: 'string' },
    },
  },
  composition: {
    label: 'Share / breakdown across categories',
    component: S.CompositionSlide,
    elements: ['kicker', 'title', 'chart', 'source'],
    propSchema: {
      kicker: { type: 'string' }, title: { type: 'string' },
      chartForm: {
        type: 'string', enum: ['pie', 'bar', 'column'],
        description: 'Visual form. Use "bar" for many categories; "pie" only for 2-4 parts of a whole.',
      },
      data: datumArray, unit: { type: 'string' },
      source: { type: 'string' }, asOf: { type: 'string' },
    },
  },
  timeSeries: {
    label: 'Change over time',
    component: S.TimeSeriesSlide,
    elements: ['kicker', 'title', 'chart', 'source'],
    propSchema: {
      kicker: { type: 'string' }, title: { type: 'string' }, data: datumArray,
      unit: { type: 'string' }, source: { type: 'string' }, asOf: { type: 'string' },
    },
  },
  comparison: {
    label: 'Ranked comparison between entities',
    component: S.ComparisonSlide,
    elements: ['kicker', 'title', 'chart', 'source'],
    propSchema: {
      kicker: { type: 'string' }, title: { type: 'string' }, data: datumArray,
      unit: { type: 'string' }, source: { type: 'string' }, asOf: { type: 'string' },
    },
  },
  flywheel: {
    label: 'Cyclical process',
    component: S.FlywheelSlide,
    elements: ['kicker', 'title', 'chart', 'source'],
    propSchema: {
      kicker: { type: 'string' }, title: { type: 'string' },
      stages: { type: 'array', items: { type: 'string' } }, source: { type: 'string' },
    },
  },
};

export const slideTypes = Object.keys(registry) as SlideType[];
