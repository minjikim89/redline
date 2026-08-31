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

/**
 * textContent glues child nodes together with nothing between them, so a
 * heading broken across two spans comes back as "Becamea Global". Walk the
 * children and put the whitespace back.
 */
function readText(el: Element): string {
  let out = '';
  el.childNodes.forEach(n => {
    if (n.nodeType === 3) out += n.nodeValue ?? '';
    else if (n.nodeType === 1) {
      const tag = (n as Element).tagName.toLowerCase();
      if (tag === 'br') { out += ' '; return; }
      out += ` ${readText(n as Element)} `;
    }
  });
  return clean(out);
}
const looksSource = (s: string) => /^(source|sources|출처)\b/i.test(s);

/** A standalone number, with an optional currency mark and magnitude suffix. */
const bigFigure = (s: string) =>
  /^[-−+]?[$€£¥₩]?[\d][\d.,]*\s?[BMKTbn%×x]?$/.test(s.replace(/\s+/g, ' ').trim());

/**
 * An all-caps label. A bare figure like "$1.4M" is technically uppercase, so it
 * has to be excluded here — otherwise the headline number gets consumed as a
 * kicker and the slide loses the thing it exists to show.
 */
const isShout = (s: string) =>
  s.length < 90 && s === s.toUpperCase() && /[A-Z]/.test(s) && !bigFigure(s);

interface Read { blocks: string[]; headings: string[] }

/**
 * Leaf text, in document order, plus whatever the document itself called a
 * heading. Honouring h1–h4 matters: a real heading can be shorter than the
 * standfirst under it, so length alone picks the wrong line.
 */
/** Only these break a block apart. Inline children stay part of their parent. */
const BLOCK = 'h1,h2,h3,h4,p,div,li,dt,dd,section,article,ul,ol,dl,table';

function textBlocks(root: Element): Read {
  const blocks: string[] = [];
  const headings: string[] = [];
  const claimed: Element[] = [];

  root.querySelectorAll(`${BLOCK},span,strong`).forEach(el => {
    if (el.querySelector(BLOCK)) return;                       // not a leaf block
    if (claimed.some(c => c.contains(el))) return;             // parent already took it
    const t = readText(el);
    if (!t || t.length < 2) return;
    claimed.push(el);
    if (blocks.includes(t)) return;
    blocks.push(t);
    if (/^h[1-4]$/i.test(el.tagName)) headings.push(t);
  });
  return { blocks, headings };
}

function classify(read: Read, index: number): { type: SlideType; props: any; tone?: any } {
  const { blocks, headings } = read;
  // Claim in order of certainty: a bare figure, then a source line, then an
  // all-caps label, then the longest remaining line as the heading.
  const figure = blocks.find(bigFigure);
  const source = blocks.find(looksSource);
  const kicker = blocks.find(b => isShout(b) && b !== source);
  const heading = headings.find(h => h !== figure && h !== source)
    ?? blocks.find(b => b.length > 12 && !isShout(b) && b !== source && b !== figure)
    ?? blocks.find(b => b !== figure && b !== source && b !== kicker)
    ?? `Slide ${index + 1}`;
  const rest = blocks.filter(b => b !== heading && b !== kicker && b !== source && b !== figure);

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
  // One dominant number carrying the slide: give it the full bleed it wants.
  if (figure && rest.length <= 4) {
    return {
      type: 'hero', tone: 'accent',
      props: {
        eyebrow: kicker ?? heading, figure, tail: '',
        body: rest.find(b => b.length > 40) ?? '',
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
  const bodies = [figure, ...rest].filter((b): b is string => !!b && b.length > 25).slice(0, 4);
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
    const read = textBlocks(sec);
    const { type, props, tone } = classify(read, i);
    recognised[type] = (recognised[type] ?? 0) + 1;
    if (!read.blocks.length) warnings.push(`Section ${i + 1} had no readable text.`);
    return { id: `i${String(i + 1).padStart(2, '0')}`, type, tone, props } as Slide;
  });

  const title = clean(doc.querySelector('title')?.textContent ?? '')
    || name.replace(/(\.dc)?\.html?$/i, '');

  return {
    deck: { id: 'imported', title: title || 'Imported deck', theme: defaultTheme, slides },
    sections: sections.length,
    recognised,
    warnings,
  };
}
