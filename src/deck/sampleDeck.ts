import type { Deck } from './types';
import { defaultTheme } from './theme';

/**
 * DEMO DECK — "From Screen to Cart".
 *
 * ⚠️ ALL FIGURES BELOW ARE PLACEHOLDERS. Replace with researched values before
 * publishing. They are shaped correctly (category counts, magnitudes, trend
 * direction) so the layout and the demo hold, but they are not real data.
 *
 * Three flaws are PLANTED ON PURPOSE. They are what the agent fixes on camera:
 *   [FLAW 1] s6  — 9-category pie chart      → agent re-forms to sorted bar
 *   [FLAW 2] s8  — stale 2024 figure, no src → agent researches and attaches
 *   [FLAW 3] s4/s7/s10 — inconsistent units and source lines → agent unifies
 */
export const sampleDeck: Deck = {
  id: 'screen-to-cart',
  title: 'From Screen to Cart',
  theme: defaultTheme,
  slides: [
    { id: 's1', type: 'title', props: {
      title: 'From Screen to Cart',
      subtitle: 'How Korean content became a global product engine',
      byline: 'Strategy brief · 2026',
    }},

    { id: 's2', type: 'bigNumber', props: {
      kicker: 'The shift',
      value: '4.2', unit: '×',
      caption: 'Growth in Korean consumer-goods exports to markets where Korean content ranks top-10',
      source: 'Source: [pending]',
    }},

    { id: 's3', type: 'flywheel', props: {
      kicker: 'The mechanism',
      title: 'Content earns attention. Attention moves product. Product funds content.',
      stages: ['Content', 'Attention', 'Search', 'Purchase', 'Reinvest'],
      source: 'Source: [pending]',
    }},

    // [FLAW 3a] unit written as a word, source line formatted differently from s7/s10
    { id: 's4', type: 'timeSeries', props: {
      kicker: 'Stage 1',
      title: 'Korean-language titles in global streaming top charts',
      data: [
        { label: '2019', value: 12 }, { label: '2020', value: 21 },
        { label: '2021', value: 38 }, { label: '2022', value: 46 },
        { label: '2023', value: 57 }, { label: '2024', value: 71 },
        { label: '2025', value: 88 },
      ],
      unit: ' titles',
      source: 'Streaming chart data · [pending]',
    }},

    { id: 's5', type: 'timeSeries', props: {
      kicker: 'Stage 2',
      title: 'Search interest converts to purchase intent within 6 weeks of a release',
      data: [
        { label: 'W0', value: 100 }, { label: 'W2', value: 168 },
        { label: 'W4', value: 141 }, { label: 'W6', value: 127 },
        { label: 'W8', value: 118 },
      ],
      unit: ' idx',
      source: 'Source: [pending]',
    }},

    // [FLAW 1] Nine categories rendered as a pie. This is the hero fix.
    { id: 's6', type: 'composition', props: {
      kicker: 'Stage 3',
      title: 'Where the money actually lands: exports by category',
      chartForm: 'pie',
      data: [
        { label: 'Cosmetics',        value: 102 },
        { label: 'Processed food',   value: 88 },
        { label: 'Music & merch',    value: 61 },
        { label: 'Apparel',          value: 47 },
        { label: 'Home & living',    value: 33 },
        { label: 'Health supplements', value: 29 },
        { label: 'Small appliances', value: 24 },
        { label: 'Stationery',       value: 16 },
        { label: 'Other',            value: 41 },
      ],
      unit: 'B USD',
      source: 'Source: [pending]',
      asOf: '2025',
    }},

    // [FLAW 3b] different unit convention, different source phrasing
    { id: 's7', type: 'comparison', props: {
      kicker: 'Deep dive',
      title: 'Share of US cosmetics imports by origin',
      data: [
        { label: 'Korea', value: 24.1 }, { label: 'France', value: 21.6 },
        { label: 'Canada', value: 11.2 }, { label: 'Japan', value: 8.4 },
        { label: 'Italy', value: 6.9 },
      ],
      unit: '%',
      source: 'Trade data, 2025 · [pending]',
      asOf: '2025',
    }},

    // [FLAW 2] stale year, no source at all
    { id: 's8', type: 'bigNumber', props: {
      kicker: 'Platform layer',
      value: '1.9', unit: 'B USD',
      caption: 'Gross merchandise value across Korean fandom commerce platforms',
      source: '',
      asOf: '2024',
    }},

    { id: 's9', type: 'timeSeries', props: {
      kicker: 'Inflection points',
      title: 'Content exports and goods exports moved together, not sequentially',
      data: [
        { label: '2018', value: 31 }, { label: '2020', value: 44 },
        { label: '2022', value: 68 }, { label: '2024', value: 92 },
        { label: '2026', value: 118 },
      ],
      unit: ' idx',
      source: 'Source: [pending]',
    }},

    // [FLAW 3c] third variant of unit + source styling
    { id: 's10', type: 'comparison', props: {
      kicker: 'Benchmark',
      title: 'Content-to-goods conversion: Korea vs Japan',
      data: [
        { label: 'Korea (K-content)', value: 3.4 },
        { label: 'Japan (anime IP)',  value: 2.1 },
      ],
      unit: ' x',
      source: 'est. · [pending]',
    }},
  ],
};
