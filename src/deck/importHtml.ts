import type { Deck, Slide, SlideType } from './types';
import { defaultTheme } from './theme';

/**
 * Read an exported HTML deck into the typed model.
 *
 * This is the claim the whole architecture rests on: the model is the contract,
 * so any tool that emits slides can hand work over and an agent picks it up with
 * the same tools. The mapping is deliberately conservative — it recognises
 * structure it is sure about and leaves everything else as prose, because a
 * wrong guess is worse than a plain slide.
 */

export interface ImportReport {
  deck: Deck;
  sections: number;
  recognised: Record<string, number>;
  warnings: string[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const isShout = (s: string) => s.length < 90 && s === s.toUpperCase() && /[A-Z]/.test(s);
const looksSource = (s: string) => /^(source|sources|출처)\b/i.test(s);
const bigFigure = (s: string) => /^[$€£¥₩]?[\d.,]+[BMK%×x]?$/.test(s.replace(/\s/g, ''));

function textBlocks(root: Element): string[] {
  const out: string[] = [];
  root.querySelectorAll('h1,h2,h3,h4,p,div,span,li,dt,dd,strong').forEach(el => {
    if (el.querySelector('h1,h2,h3,h4,p,div,span,li')) return;   // leaves only
    const t = clean(el.textContent ?? '');
    if (t && t.length > 1 && !out.includes(t)) out.push(t);
  });
  return out;
}

function classify(blocks: string[], index: number): { type: SlideType; props: any; tone?: any } {
  const heading = blocks.find(b => b.length > 12 && !isShout(b)) ?? blocks[0] ?? `Slide ${index + 1}`;
  const kicker = blocks.find(b => isShout(b) && !looksSource(b));
  const source = blocks.find(looksSource);
  const rest = blocks.filter(b => b !== heading && b !== kicker && b !== source);
  const figure = rest.find(bigFigure);

  if (index === 0) {
    return {
      type: 'cover', tone: 'dark',
      props: {
        eyebrow: kicker ?? 'Imported deck', title: heading,
        subtitle: rest.find(b => b.length > 40) ?? '',
        meta: rest.filter(isShout).slice(0, 2),
      },
    };
  }
  if (figure && rest.length <= 6) {
    return {
      type: 'hero', tone: 'accent',
      props: {
        eyebrow: kicker ?? '', figure, tail: '',
        body: rest.find(b => b.length > 40 && b !== figure) ?? '',
        footnote: source ?? '',
      },
    };
  }
  if (blocks.filter(looksSource).length > 1 || /reference|sources/i.test(heading)) {
    const pairs = rest.filter(b => b.length > 20);
    return {
      type: 'refs',
      props: {
        kicker: kicker ?? 'Sources', title: heading,
        groups: pairs.slice(0, 10).map(t => ({ topic: t.split(/[.:]/)[0].slice(0, 40), text: t })),
      },
    };
  }
  // Default: prose becomes cards. Always renders, never misrepresents the source.
  const bodies = rest.filter(b => b.length > 25).slice(0, 4);
  return {
    type: 'cards',
    props: {
      kicker: kicker ?? '', title: heading, source,
      cards: (bodies.length ? bodies : ['(no body text found in this section)']).map((b, i) => ({
        index: String(i + 1).padStart(2, '0'),
        head: b.split(/[.;]/)[0].slice(0, 60),
        body: b,
      })),
    },
  };
}

export function importHtml(html: string, name: string): ImportReport {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const warnings: string[] = [];

  let sections = Array.from(doc.querySelectorAll('section'));
  if (!sections.length) sections = Array.from(doc.querySelectorAll('.slide, [data-screen-label]'));
  if (!sections.length) {
    warnings.push('No <section> or .slide elements found — the whole document was read as one slide.');
    sections = [doc.body];
  }

  const recognised: Record<string, number> = {};
  const slides: Slide[] = sections.slice(0, 40).map((sec, i) => {
    const blocks = textBlocks(sec);
    const { type, props, tone } = classify(blocks, i);
    recognised[type] = (recognised[type] ?? 0) + 1;
    if (!blocks.length) warnings.push(`Section ${i + 1} had no readable text.`);
    return { id: `i${String(i + 1).padStart(2, '0')}`, type, tone, props } as Slide;
  });

  const title = clean(doc.querySelector('title')?.textContent ?? '')
    || name.replace(/\.[^.]+$/, '');

  return {
    deck: { id: 'imported', title: title || 'Imported deck', theme: defaultTheme, slides },
    sections: sections.length,
    recognised,
    warnings,
  };
}
