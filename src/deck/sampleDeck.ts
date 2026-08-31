import type { Deck } from './types';
import { defaultTheme } from './theme';

/**
 * "From Screen to Cart" — the authored briefing, rendered from a typed model.
 * Every figure and every source below is carried over unchanged.
 *
 * Three things the agent fixes on camera. Two of them were already in the
 * authored deck; one is a chart-form choice this port makes deliberately so the
 * re-forming tool has something to act on:
 *
 *   s06  chartForm: 'pie'  — these three export lines are NOT parts of one
 *        whole, so a pie asserts a total that means nothing. Introduced here.
 *   s08  the HYBE panel reports 2024 while the DearU panel reports Q4 2025.
 *        Already present in the authored deck.
 *   s04 / s07 / s08  three different source-line conventions.
 *        Already present in the authored deck.
 */
export const sampleDeck: Deck = {
  id: 'screen-to-cart',
  title: 'From Screen to Cart',
  theme: defaultTheme,
  slides: [
    { id: 's01', tone: 'dark', type: 'cover', props: {
      eyebrow: 'Export & commerce briefing · 2026',
      title: 'How Korean Content Became a Global Product Engine',
      subtitle: 'Not a fandom story. An export story. This briefing breaks down the path from streaming reach to consumer-goods revenue.',
      meta: ['12 SLIDES', 'FY2024–2025 REPORTED FIGURES'],
    }},

    { id: 's02', tone: 'accent', type: 'hero', props: {
      eyebrow: 'For every $100M increase in Hallyu exports',
      figure: '$202M', tail: 'follows',
      body: 'in related consumer-goods exports. By category: IT devices $105M, cosmetics $73M, apparel $17M, food $15M.',
      footnote: '2025 Korean content exports: $14.91B (+5.9% YoY)',
    }},

    { id: 's03', type: 'cards', props: {
      kicker: 'Framework', accent: '#FF00C8',
      title: 'Content → Attention → Product → Reinvestment',
      cards: [
        { index: '01 · Reach', color: '#FF00C8', head: 'Global streaming distribution',
          body: 'Second-largest source of Netflix viewing hours; share locked in the 8–9% band' },
        { index: '02 · Conversion', color: '#9000FF', head: 'Affinity turns into intent',
          body: 'The effect concentrates in taste-driven differentiated goods, not commodities' },
        { index: '03 · Product', color: '#00A5C8', head: 'Consumer-goods exports',
          body: 'Cosmetics $11.4B and K-Food+ $13.6B both hit record highs in the same year' },
        { index: '04 · Reinvestment', color: '#0B0B12', head: 'Touring and platform cash',
          body: 'Live and subscription revenue funds the next production cycle' },
      ],
      footMark: '↺',
      footnote: 'The speed of the loop is set by stage 2, not stage 1. Reach has already plateaued.',
    }},

    { id: 's04', type: 'barsPair', props: {
      kicker: 'Stage 1 · Reach', accent: '#FF00C8',
      title: 'Streaming Hours: Second in Volume, Flat in Share',
      left: {
        caption: 'Netflix annual viewing hours by country of origin (billions, Apr 2025 – Mar 2026)',
        unit: '',
        rows: [
          { label: 'United States', value: 59.6 },
          { label: 'South Korea', value: 12.1, strong: true },
          { label: 'Japan', value: 8.4 },
        ],
        note: 'Korean titles drew roughly 1.4× the hours of Japanese titles and about twice those of UK titles.',
      },
      right: {
        caption: 'Share of total platform viewing by origin (%)',
        unit: '%',
        rows: [
          { label: 'Korea', value: 8.5, strong: true },
          { label: 'UK', value: 7.5 },
          { label: 'Japan', value: 4.5 },
        ],
        note: 'Share has held the same band for three years. Reach is a maintained asset, not a growth lever.',
      },
      // one of three source conventions in this deck
      source: 'Omdia · Digital i (2026); Ampere Analysis (2025). Panel methods differ.',
    }},

    { id: 's05', type: 'flow', props: {
      kicker: 'Stage 2 · Conversion', accent: '#9000FF',
      title: 'From Watching to Buying: Where Conversion Happens',
      steps: [
        { head: 'Exposure', body: 'Drama, variety and music video place a lifestyle in front of a global audience' },
        { head: 'Affinity', body: 'Closeness to an artist or title transfers into country-of-origin preference' },
        { head: 'Purchase', body: 'Measurable in differentiated goods where taste decides, not in standardized inputs' },
      ],
      chart: {
        caption: "Conversion proxy — Korea's share of US cosmetics imports (%)",
        unit: '%',
        points: [{ label: '2022', value: 10.6 }, { label: '2023', value: 14.3 }, { label: '2024', value: 18.7 }],
      },
      notes: [
        'From 9.2% in 2011, the share nearly doubled in the three years after 2022.',
        'Over the same period, cosmetics exports to the US grew 66.5% in skincare and 26% in color.',
      ],
      source: 'SOURCE: USITC DATA PROCESSED BY KITA; MINISTRY OF FOOD AND DRUG SAFETY',
    }},

    // chartForm 'pie' is wrong here: three separate export lines, not one whole.
    { id: 's06', type: 'figures', props: {
      kicker: 'Stage 3 · Product', accent: '#00A5C8',
      title: 'Export Mix: Three Axes Peaking Together',
      chartForm: 'pie',
      items: [
        { tag: 'CONTENT', head: 'Content exports', figure: '$14.9B', value: 14.9,
          body: '2025, +5.9% YoY. Identified in policy reviews as the lever for diversifying a semiconductor-heavy export base.' },
        { tag: 'BEAUTY', head: 'Cosmetics exports', figure: '$11.4B', value: 11.4,
          body: '2025, +11.8%. Trade surplus passed $10B for the first time; shipments now reach 202 countries.' },
        { tag: 'FOOD', head: 'K-Food+ exports', figure: '$13.6B', value: 13.6,
          body: '2025, +5.1%. Instant noodles cleared $1.5B as a single line item, an eleventh consecutive record.' },
      ],
      notes: [
        'Cosmetics moved from $8.0B in 2022 to $11.4B in 2025; K-Food+ from $11.8B to $13.6B over the same period.',
        'Noodle exports are geographically spread: China $385M (+47.9%), US $255M (+18.2%), ASEAN $223M.',
      ],
    }},

    { id: 's07', tone: 'white', type: 'barsPair', props: {
      kicker: 'Deep dive · K-beauty', accent: '#9000FF',
      title: 'Import Share: Ahead of France in the US and Japan',
      left: {
        caption: 'Share of US cosmetics imports (2024, skincare and makeup)',
        unit: '%',
        rows: [
          { label: 'All others', value: 61.5, color: '#DFE6E9' },
          { label: 'Korea', value: 22.2, strong: true, color: '#FF00C8' },
          { label: 'France', value: 16.3, color: '#9000FF' },
        ],
        note: "In Japan, Korea holds 30.1% of cosmetics imports against France's 24.3% — first place for a third straight year.",
      },
      right: {
        caption: 'Total cosmetics exports by country (2025, US$B)',
        unit: '',
        rows: [
          { label: 'France', value: 24.3, color: '#9000FF' },
          { label: 'Korea', value: 11.4, strong: true, color: '#FF00C8' },
          { label: 'United States', value: 10.8, color: '#DFE6E9' },
        ],
        note: "Korea passed the US to become the world's second-largest exporter, but total value is still half of France's.",
      },
      source: 'SOURCE: MFDS 2025 COSMETICS PRODUCTION AND TRADE STATISTICS; KITA; USITC; JAPAN MINISTRY OF FINANCE',
      asOf: '2024',
    }},

    { id: 's08', type: 'panels', props: {
      kicker: 'Stage 4 · Reinvestment', accent: '#FF00C8',
      title: "Fandom Platform Economics: Subscription Pays, Commerce Doesn't",
      panels: [
        { heading: 'Subscription · DearU Bubble (Q4 2025)', dark: true,
          metrics: [
            { value: '₩23.8B', label: 'quarterly revenue' },
            { value: '41%', label: 'operating margin (₩9.8B)', emphasis: true },
            { value: '2.04M', label: 'paid subscriptions' },
            { value: '67%', label: 'revenue from overseas' },
          ],
          note: 'Implied revenue per subscription is about ₩3,900 a month; net-basis accounting means gross fan spend is higher. A shift to web payments cut fee costs from 48% to 42% of revenue.' },
        { heading: 'Commerce · HYBE platform segment (2024)',
          metrics: [
            { value: '₩333.5B', label: 'annual revenue' },
            { value: '–₩13.8B', label: 'operating loss', emphasis: true },
            { value: '₩255.6B', label: 'Weverse Company revenue' },
            { value: '29%', label: 'of HYBE revenue from live' },
          ],
          note: 'Bundling memberships, merchandise and ticketing grows transaction volume but thins margin.' },
      ],
      source: 'DearU Q4 2025 results and broker coverage; HYBE annual report',
    }},

    { id: 's09', tone: 'white', type: 'timeline', props: {
      kicker: 'Timeline', accent: '#FF00C8',
      title: 'Inflection Points, 2018 → 2026',
      events: [
        { year: '2018', text: 'Korean acts enter global album charts. Content itself becomes the export.' },
        { year: '2020', text: 'Weverse online concert draws 993,000 viewers and ₩49.1B in tickets. Direct fan payment proven.' },
        { year: '2021', text: 'The US becomes the second-largest market for Korean cosmetics.' },
        { year: '2024', late: true, text: 'The US becomes the top K-Food market at $1.59B; noodle exports there rise 70.3%.' },
        { year: '2025', late: true, text: 'Cosmetics reach second worldwide with a $10.1B surplus. Hallyu Industry Promotion Act takes effect.' },
        { year: '2026', late: true, text: 'K-pop accounts for 7.7% of the global top-100 tour gross; cosmetics tracking toward $13B.' },
      ],
    }},

    { id: 's10', type: 'barsPair', props: {
      kicker: 'Benchmark · Korea vs Japan', accent: '#00A5C8',
      title: 'Comparable IP Scale, Different Conversion Path',
      left: {
        caption: 'Japan · monetized inside the IP',
        unit: '',
        rows: [
          { label: 'Anime overseas market', value: 14.25, strong: true, color: '#565C6E' },
          { label: 'Domestic merchandising (¥748.8B ≈ $4.9B)', value: 4.9, color: '#B9C0CC' },
          { label: 'Studio revenue (¥466.2B ≈ $3.0B)', value: 3.0, color: '#B9C0CC' },
        ],
        note: 'Of a ¥3.84T industry in 2024, 56.5% is overseas. Yen figures converted at ¥152/USD so the bars share one scale. Revenue accrues to figures, goods and distribution wrapped directly around the IP.',
      },
      right: {
        caption: 'Korea · spillover outside the IP',
        unit: '',
        rows: [
          { label: 'Content exports', value: 14.91, strong: true, color: '#FF00C8' },
          { label: 'K-Food+ exports', value: 13.62, color: '#9000FF' },
          { label: 'Cosmetics exports', value: 11.42, color: '#00A5C8' },
        ],
        note: 'Goods with no formal link to the IP move at a scale comparable to content exports themselves. The destination of conversion sits outside the franchise.',
      },
      source: 'Association of Japanese Animations, Anime Industry Report 2025; KITA',
    }},

    { id: 's11', tone: 'dark', type: 'cards', props: {
      kicker: 'Implications', accent: '#FF00C8',
      title: 'What This Means for Allocation',
      tone: 'dark',
      cards: [
        { index: '01', color: '#FF00C8', head: 'Fund conversion, not reach',
          body: 'Viewing share has held at 8–9% for three years. Distribution and retail placement return more per dollar than incremental content volume.' },
        { index: '02', color: '#9000FF', head: 'Design for value capture',
          body: 'Cosmetics and food firms collect much of the demand that content creates. Co-branding and licensing are the recapture mechanisms.' },
        { index: '03', color: '#00A5C8', head: 'Separate margin from volume',
          body: 'Subscription runs at a 41% operating margin while bundled commerce runs at a loss. Managing both in one P&L hides the signal.' },
      ],
      footnote: 'Shared caveat: a share advantage concentrated in the US and Japan is exposed to tariff and regulatory change. Cosmetics safety-assessment rules and reciprocal tariffs are the variables to watch over the next two years.',
    }},

    { id: 's12', type: 'refs', props: {
      kicker: 'Sources', accent: '#FF00C8',
      title: 'References and Notes',
      groups: [
        { topic: 'Streaming.', text: 'Omdia and Digital i, Netflix viewing hours by country of origin, April 2025 – March 2026. Ampere Analysis, share of viewing by origin, 2024–2025.' },
        { topic: 'Cosmetics.', text: 'Ministry of Food and Drug Safety, 2025 cosmetics production, export and import statistics. USITC data processed by KITA. Japan Ministry of Finance trade statistics.' },
        { topic: 'Food.', text: 'Ministry of Agriculture, Food and Rural Affairs, K-Food+ export results 2022–2025 (2025 preliminary).' },
        { topic: 'Music and live.', text: 'Billboard Boxscore year-end report 2025 (October 2024 – September 2025).' },
        { topic: 'Platforms.', text: 'DearU Q4 2025 results and broker coverage; HYBE annual report and platform segment disclosure.' },
        { topic: 'Japan benchmark.', text: 'Association of Japanese Animations, Anime Industry Report 2025 (2024 figures).' },
      ],
      source: 'Figures are as reported; base years and panel methods differ across sources.',
    }},
  ],
};
