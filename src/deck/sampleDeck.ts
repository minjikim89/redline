import type { Deck } from './types';
import { defaultTheme } from './theme';

/**
 * "From Screen to Cart" — ported from the authored canvas deck.
 * Figures and sources are the real ones carried over from that deck.
 *
 * NOTE ON THE DEMO: nothing here is a planted flaw. The three things the agent
 * fixes on camera are genuine editorial problems that already existed:
 *   s07 — a pie whose largest slice is "All others" (61.5%), so the chart
 *         spends most of its area on the category nobody is asking about
 *   s08 — the HYBE panel reports 2024 while the DearU panel reports Q4 2025
 *   s04/s07/s08 — source lines are written three different ways
 */
export const sampleDeck: Deck = {
  id: 'screen-to-cart',
  title: 'From Screen to Cart',
  theme: defaultTheme,
  slides: [
    { id: 's01', type: 'title', props: {
      title: 'How Korean Content Became a Global Product Engine',
      subtitle: 'Not a fandom story. An export story. The path from streaming reach to consumer-goods revenue.',
      byline: 'Export & commerce briefing · FY2024–2025 reported figures',
    }},

    { id: 's02', type: 'bigNumber', props: {
      kicker: 'The number',
      value: '$202M', unit: '',
      caption: 'Follows every $100M increase in Hallyu exports, in related consumer goods — IT devices $105M, cosmetics $73M, apparel $17M, food $15M',
      source: 'Source: Hallyu industry export spillover estimates',
      asOf: '2025',
    }},

    { id: 's03', type: 'flywheel', props: {
      kicker: 'Framework',
      title: 'The speed of the loop is set by stage 2, not stage 1. Reach has already plateaued.',
      stages: ['Reach', 'Conversion', 'Product', 'Reinvestment'],
      source: 'Source: composed from the stage evidence on slides 4–8',
    }},

    { id: 's04', type: 'comparison', props: {
      kicker: 'Stage 1 · Reach',
      title: 'Streaming hours: second in volume, flat in share',
      data: [
        { label: 'United States', value: 59.6 },
        { label: 'South Korea', value: 12.1 },
        { label: 'Japan', value: 8.4 },
      ],
      unit: 'B hrs',
      // deliberately phrased unlike s07 and s08 — this is one of the real inconsistencies
      source: 'Omdia · Digital i (2026); Ampere Analysis (2025). Panel methods differ.',
      asOf: 'Apr 2025 – Mar 2026',
    }},

    { id: 's05', type: 'timeSeries', props: {
      kicker: 'Stage 2 · Conversion',
      title: "Conversion proxy: Korea's share of US cosmetics imports",
      data: [
        { label: '2022', value: 10.6 },
        { label: '2023', value: 14.3 },
        { label: '2024', value: 18.7 },
      ],
      unit: '%',
      source: 'Source: USITC data processed by KITA; Ministry of Food and Drug Safety',
      asOf: '2024',
    }},

    { id: 's06', type: 'comparison', props: {
      kicker: 'Stage 3 · Product',
      title: 'Export mix: three axes peaking together',
      data: [
        { label: 'Content exports', value: 14.9 },
        { label: 'K-Food+ exports', value: 13.6 },
        { label: 'Cosmetics exports', value: 11.4 },
      ],
      unit: 'B USD',
      source: 'Source: MFDS; MAFRA; Ministry of Culture, Sports and Tourism',
      asOf: '2025',
    }},

    // The pie here is genuinely the wrong form: 61.5% of the area is "All others".
    { id: 's07', type: 'composition', props: {
      kicker: 'Deep dive · K-beauty',
      title: 'Share of US cosmetics imports, 2024',
      chartForm: 'pie',
      data: [
        { label: 'All others', value: 61.5 },
        { label: 'Korea', value: 22.2 },
        { label: 'France', value: 16.3 },
      ],
      unit: '%',
      source: 'SOURCE: MFDS 2025 COSMETICS PRODUCTION AND TRADE STATISTICS; KITA; USITC; JAPAN MINISTRY OF FINANCE',
      asOf: '2024',
    }},

    // The HYBE panel is a year behind the DearU panel. Same slide, two periods.
    { id: 's08', type: 'metrics', props: {
      kicker: 'Stage 4 · Reinvestment',
      title: "Fandom platform economics: subscription pays, commerce doesn't",
      panels: [
        {
          heading: 'Subscription · DearU Bubble (Q4 2025)',
          metrics: [
            { value: '₩23.8B', label: 'quarterly revenue' },
            { value: '41%', label: 'operating margin (₩9.8B)' },
            { value: '2.04M', label: 'paid subscriptions' },
            { value: '67%', label: 'revenue from overseas' },
          ],
          note: 'Implied revenue per subscription is about ₩3,900 a month. A shift to web payments cut fee costs from 48% to 42% of revenue.',
        },
        {
          heading: 'Commerce · HYBE platform segment (2024)',
          metrics: [
            { value: '₩333.5B', label: 'annual revenue' },
            { value: '–₩13.8B', label: 'operating loss', negative: true },
            { value: '₩255.6B', label: 'Weverse Company revenue' },
            { value: '29%', label: 'of HYBE revenue from live' },
          ],
          note: 'Bundling memberships, merchandise and ticketing grows transaction volume but thins margin.',
        },
      ],
      source: 'DearU Q4 2025 results and broker coverage; HYBE annual report',
    }},

    { id: 's09', type: 'timeline', props: {
      kicker: 'Timeline',
      title: 'Inflection points, 2018 → 2026',
      events: [
        { year: '2018', text: 'Korean acts enter global album charts. Content itself becomes the export.' },
        { year: '2020', text: 'Weverse online concert draws 993,000 viewers and ₩49.1B in tickets. Direct fan payment proven.' },
        { year: '2021', text: 'The US becomes the second-largest market for Korean cosmetics.' },
        { year: '2024', text: 'The US becomes the top K-Food market at $1.59B; noodle exports there rise 70.3%.' },
        { year: '2025', text: 'Cosmetics reach second worldwide with a $10.1B surplus. Hallyu Industry Promotion Act takes effect.' },
        { year: '2026', text: 'K-pop accounts for 7.7% of the global top-100 tour gross; cosmetics tracking toward $13B.' },
      ],
      source: 'Source: compiled from the references on slide 12',
    }},

    { id: 's10', type: 'comparison', props: {
      kicker: 'Benchmark · Korea vs Japan',
      title: 'Comparable IP scale, different conversion path',
      data: [
        { label: 'Korea · content exports', value: 14.91 },
        { label: 'Japan · anime overseas', value: 14.25 },
        { label: 'Korea · K-Food+', value: 13.62 },
        { label: 'Korea · cosmetics', value: 11.42 },
      ],
      unit: 'B USD',
      source: 'Association of Japanese Animations, Anime Industry Report 2025; KITA',
      asOf: '2024–2025',
    }},

    { id: 's11', type: 'points', props: {
      kicker: 'Implications',
      title: 'What this means for allocation',
      points: [
        { head: 'Fund conversion, not reach',
          body: 'Viewing share has held at 8–9% for three years. Distribution and retail placement return more per dollar than incremental content volume.' },
        { head: 'Design for value capture',
          body: 'Cosmetics and food firms collect much of the demand that content creates. Co-branding and licensing are the recapture mechanisms.' },
        { head: 'Separate margin from volume',
          body: 'Subscription runs at a 41% operating margin while bundled commerce runs at a loss. Managing both in one P&L hides the signal.' },
      ],
      caveat: 'A share advantage concentrated in the US and Japan is exposed to tariff and regulatory change. Cosmetics safety-assessment rules and reciprocal tariffs are the variables to watch over the next two years.',
    }},

    { id: 's12', type: 'sources', props: {
      kicker: 'Sources',
      title: 'References and notes',
      groups: [
        { topic: 'Streaming', text: 'Omdia and Digital i, Netflix viewing hours by country of origin, Apr 2025 – Mar 2026. Ampere Analysis, share of viewing by origin, 2024–2025.' },
        { topic: 'Cosmetics', text: 'MFDS 2025 cosmetics production, export and import statistics. USITC data processed by KITA. Japan Ministry of Finance trade statistics.' },
        { topic: 'Food', text: 'MAFRA, K-Food+ export results 2022–2025 (2025 preliminary).' },
        { topic: 'Music and live', text: 'Billboard Boxscore year-end report 2025 (Oct 2024 – Sep 2025).' },
        { topic: 'Platforms', text: 'DearU Q4 2025 results and broker coverage; HYBE annual report and platform segment disclosure.' },
        { topic: 'Japan benchmark', text: 'Association of Japanese Animations, Anime Industry Report 2025 (2024 figures).' },
      ],
    }},
  ],
};
