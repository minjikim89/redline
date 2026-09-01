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
  /** The file carried its own typed model; nothing was guessed. */
  lossless?: boolean;
  /** Nothing readable was found. The report explains instead of opening junk. */
  fatal?: string;
}

/** The slide types the renderer can actually draw. */
const KNOWN_TYPES = new Set<string>([
  'cover', 'hero', 'cards', 'barsPair', 'flow', 'figures', 'panels', 'timeline', 'refs',
]);

/**
 * A Redline export carries the deck model itself in a JSON island. Restoring
 * from it is exact: every slide type, figure and source survives, because
 * nothing is re-inferred from markup. Anything malformed falls through to the
 * heuristic reader rather than failing the import.
 */
function readEmbeddedModel(doc: Document): Deck | null {
  const el = doc.querySelector('script#redline-deck[type="application/json"]');
  if (!el?.textContent) return null;
  try {
    const parsed = JSON.parse(el.textContent);
    const deck = parsed?.deck;
    if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) return null;
    const good = deck.slides.every((s: any) =>
      s && typeof s.id === 'string' && KNOWN_TYPES.has(s.type)
      && s.props && typeof s.props === 'object');
    if (!good) return null;
    return {
      id: String(deck.id ?? 'imported'),
      title: String(deck.title ?? 'Imported deck'),
      theme: deck.theme ?? defaultTheme,
      slides: deck.slides,
    };
  } catch { return null; }
}

/** More than this and the deck stops being reviewable; the report says so. */
const MAX_SLIDES = 40;
/** Runaway nesting is a parser bomb, not a layout. Read the rest as one block. */
const MAX_DEPTH = 120;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * The registry's propSchema is the agent's contract, and it carries maxLength.
 * An importer that emits a 30KB title hands the agent props its own tools would
 * reject — and hands the artboard a line no container can hold.
 */
const cap = (s: unknown, n: number) => {
  const t = String(s ?? '');
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};

/**
 * Elements that carry machinery rather than copy. Their text is stylesheet or
 * program source, and an <svg> chart's axis ticks are labels for marks that do
 * not survive the import — pulling either in floods the slide with noise.
 */
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'SVG', 'CANVAS', 'IFRAME']);

/**
 * What separates one block of copy from the next. A <tr> is on the list but
 * <td> is not, so a table row reads as one line rather than the whole table
 * collapsing into a single run-on paragraph.
 */
const BLOCK_TAGS = new Set([
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'DIV', 'LI', 'DT', 'DD',
  'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER', 'MAIN', 'NAV',
  'UL', 'OL', 'DL', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'CAPTION',
  'FIGURE', 'FIGCAPTION', 'BLOCKQUOTE', 'PRE', 'ADDRESS', 'BODY', 'DETAILS', 'SUMMARY',
]);
const BLOCK_SEL = Array.from(BLOCK_TAGS).join(',').toLowerCase();

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
      const tag = (n as Element).tagName.toUpperCase();
      if (SKIP.has(tag)) return;
      if (tag === 'BR') { out += ' '; return; }
      out += ` ${readText(n as Element)} `;
    }
  });
  // The padding above is this function's own doing, so undo it where it landed
  // in front of closing punctuation: "<strong>Streaming</strong>. Omdia" must
  // not come back as "Streaming . Omdia".
  return clean(out).replace(/\s+([.,)\]])/g, '$1');
}
/**
 * A citation, not the word on its own. A references slide is often kickered
 * "Sources", and claiming that label as the slide's source line spends the
 * source slot on a heading and drops the actual citation into the body.
 */
const looksSource = (s: string) => /^(sources?|출처)\b[\s:：.–—-]*\S/i.test(s);

/**
 * A line the document itself labelled as its source. Reading the class is the
 * same kind of coupling the section lookup already accepts: it is the author's
 * own declaration, not an inference about what the line means. Sample decks
 * cite in three different house styles, and only one of them starts with the
 * word "Source" — without this the other two come back as body copy.
 */
const SOURCE_CLASS = /^(src|source|sources|citation|cite|footnote)$/i;
const marksSource = (el: Element) =>
  el.tagName === 'CITE'
  || Array.from(el.classList ?? []).some(c => SOURCE_CLASS.test(c));

/** A standalone number, with an optional currency mark and magnitude suffix. */
const bigFigure = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim();
  // A bare year is a label, not a headline. "2024" as a 300px figure is the
  // kind of confident wrong guess this parser is supposed to refuse to make.
  if (/^(1[89]|20)\d{2}$/.test(t)) return false;
  return /^[-−+]?[$€£¥₩]?[\d][\d.,]*\s?[BMKTbn%×x]?$/.test(t);
};

/**
 * An all-caps label. Two things have to be excluded. A bare figure like "$1.4M"
 * is technically uppercase, so it would eat the number the slide exists to
 * show. And a script without letter case — Korean, Japanese, Arabic — is
 * *always* equal to its own uppercase, so "AI 도입 전략" would read as a shout.
 * Only a line whose letters are mostly cased, and all upper, is shouting.
 */
const isShout = (s: string) => {
  if (s.length >= 90 || bigFigure(s)) return false;
  let letters = 0;
  let cased = 0;
  for (const c of s) {
    if (c.toLowerCase() === c.toUpperCase()) {
      // no case distinction: a letter only if it is not punctuation or a digit
      if (/[\p{L}\p{M}]/u.test(c)) letters++;
      continue;
    }
    if (c !== c.toUpperCase()) return false;   // a lowercase letter: not a shout
    letters++; cased++;
  }
  return cased >= 2 && cased >= letters * 0.6;
};

/**
 * The first clause of a block, for use as a card head. A sentence boundary is
 * a ./!/?/; followed by whitespace or the end — a bare split on "." read the
 * decimal in "+5.9%" as the end of the sentence and made "2025, +5" a heading.
 */
export function headOf(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === ';') return s.slice(0, i);
    if ((c === '.' || c === '!' || c === '?')
      && (i === s.length - 1 || /\s/.test(s[i + 1]))) return s.slice(0, i);
  }
  return s;
}

interface Read { blocks: string[]; headings: string[]; sources: Set<string> }

/**
 * Leaf text, in document order, plus whatever the document itself called a
 * heading. Honouring h1–h4 matters: a real heading can be shorter than the
 * standfirst under it, so length alone picks the wrong line.
 *
 * The walk is linear in the size of the section. It used to compare every leaf
 * against every leaf already claimed, which turned a large export into a frozen
 * tab rather than a slow one.
 */
function textBlocks(root: Element): Read {
  const blocks: string[] = [];
  const headings: string[] = [];
  const sources = new Set<string>();
  const seen = new Set<string>();

  const push = (raw: string, el?: Element) => {
    const t = clean(raw);
    if (t.length < 2 || seen.has(t)) return;
    seen.add(t);
    blocks.push(t);
    if (!el) return;
    if (/^H[1-4]$/.test(el.tagName.toUpperCase())) headings.push(t);
    if (marksSource(el)) sources.add(t);
  };

  const walk = (el: Element, depth: number) => {
    let run = '';
    el.childNodes.forEach(n => {
      if (n.nodeType === 3) { run += n.nodeValue ?? ''; return; }
      if (n.nodeType !== 1) return;
      const e = n as Element;
      const tag = e.tagName.toUpperCase();
      if (SKIP.has(tag)) return;
      const nested = depth < MAX_DEPTH && e.querySelector(BLOCK_SEL) !== null;
      if (!BLOCK_TAGS.has(tag) && !nested) { run += ` ${readText(e)} `; return; }
      // Text sitting loose beside a block child is still copy — "<div>Intro
      // <p>para</p></div>" must not lose "Intro".
      push(run); run = '';
      if (nested) walk(e, depth + 1);
      else push(readText(e), e);
    });
    push(run);
  };

  walk(root, 0);
  return { blocks, headings, sources };
}

function classify(read: Read, index: number): { type: SlideType; props: any; tone?: any } {
  const { blocks, headings, sources } = read;
  const isSource = (b: string) => looksSource(b) || sources.has(b);
  // Claim in order of certainty: a bare figure, then a source line, then an
  // all-caps label, then the longest remaining line as the heading.
  const figure = blocks.find(bigFigure);
  const source = blocks.find(isSource);
  const shout = blocks.find(b => isShout(b) && b !== source);
  const heading = headings.find(h => h !== figure && h !== source)
    ?? blocks.find(b => b.length > 12 && !isShout(b) && b !== source && b !== figure)
    ?? blocks.find(b => b !== figure && b !== source && b !== shout)
    ?? (blocks.length === 1 ? blocks[0] : undefined)
    ?? `Slide ${index + 1}`;
  // The document is allowed to use one line as both label and heading. Showing
  // it twice on the slide is this parser's mistake, not the author's.
  const kicker = shout === heading ? undefined : shout;
  const rest = blocks.filter(b => b !== heading && b !== kicker && b !== source && b !== figure);

  if (index === 0) {
    return {
      type: 'cover', tone: 'dark',
      props: {
        eyebrow: cap(kicker ?? 'Imported deck', 80), title: cap(heading, 120),
        // A cover with one short line under it still has that line. Dropping
        // everything under 40 characters silently emptied the slide.
        subtitle: cap(rest.find(b => b.length > 40) ?? rest.find(b => !isShout(b)) ?? '', 300),
        meta: rest.filter(isShout).slice(0, 2).map(m => cap(m, 60)),
      },
    };
  }
  // One dominant number carrying the slide: give it the full bleed it wants.
  if (figure && rest.length <= 4) {
    return {
      type: 'hero', tone: 'accent',
      props: {
        eyebrow: cap(kicker ?? (heading === figure ? '' : heading), 120),
        figure: cap(figure, 24), tail: '',
        body: cap(rest.find(b => b.length > 40) ?? '', 400),
        footnote: cap(source ?? '', 160),
      },
    };
  }
  if (blocks.filter(isSource).length > 1 || /reference|sources/i.test(heading)) {
    // A reference that opens with its own "Source:" label would surface a
    // topic literally called "Source" — strip the label and let the citation
    // speak for itself.
    const deLabel = (b: string) => b.replace(/^(sources?|출처)\b[\s:：.–—-]*/i, '');
    const pairs = rest.filter(b => b.length > 20).map(deLabel);
    return {
      type: 'refs',
      props: {
        kicker: cap(kicker ?? 'Sources', 60), title: cap(heading, 200),
        source: source === undefined ? undefined : cap(source, 300),
        groups: pairs.slice(0, 10).map(t => ({ topic: headOf(t).split(':')[0].slice(0, 40), text: cap(t, 400) })),
      },
    };
  }
  // Default: prose becomes cards. Always renders, never misrepresents the source.
  // Prefer full sentences, but a slide of short bullets has body text and saying
  // otherwise is a lie the reader cannot check against the file they just gave us.
  const carried = [figure, ...rest].filter((b): b is string => !!b);
  const long = carried.filter(b => b.length > 25);
  const bodies = (long.length ? long : carried).slice(0, 4);
  // Say which kind of empty this is. "No body text" on a section whose one line
  // is already the heading reads as a parser failure the reader cannot check.
  const empty = blocks.length
    ? '(this section had a heading and no body text)'
    : '(no readable text found in this section)';
  return {
    type: 'cards',
    props: {
      kicker: cap(kicker ?? '', 60), title: cap(heading, 200),
      // "cards" declares a footnote, not a source. Writing a prop the type does
      // not declare puts the line where nothing renders it: it survives export
      // but is invisible on the artboard, which is the worst of both.
      footnote: source === undefined ? undefined : cap(source, 400),
      cards: (bodies.length ? bodies : [empty]).map((b, i) => {
        // The head is the first clause. Leaving that clause in the body prints
        // the same sentence twice on one card; slicing it out reads as authored.
        const h = headOf(b);
        const rest = b.slice(h.length).replace(/^[\s.;!?]+/, '');
        // A clause too long to be a heading is not one — a truncated sentence
        // wearing an ellipsis is a guess the reader can see failing. The card
        // simply runs headless and carries the full text as body.
        const fits = h.length <= 60;
        return {
          index: String(i + 1).padStart(2, '0'),
          head: fits ? h : '',
          body: cap(fits && rest ? rest : b, 300),
        };
      }),
    },
  };
}

export function importHtml(html: string, name: string): ImportReport {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const warnings: string[] = [];

  const embedded = readEmbeddedModel(doc);
  if (embedded) {
    const recognised: Record<string, number> = {};
    embedded.slides.forEach(s => { recognised[s.type] = (recognised[s.type] ?? 0) + 1; });
    return {
      deck: embedded, sections: embedded.slides.length,
      recognised, warnings: [], lossless: true,
    };
  }

  let sections: Element[] = Array.from(doc.querySelectorAll('section'));
  // A <section> holding other sections is a container — reveal.js stacks
  // verticals that way. Reading both levels imports every slide twice. Only
  // drop the wrapper when it has no copy of its own, so a document whose tags
  // merely failed to close does not lose the text that was stranded outside.
  if (sections.length > 1) {
    const kept = sections.filter(s => {
      if (!s.querySelector('section')) return true;
      const bare = s.cloneNode(true) as Element;
      bare.querySelectorAll('section').forEach(k => k.remove());
      return clean(bare.textContent ?? '').length > 0;
    });
    if (kept.length) sections = kept;
  }
  if (sections.length < 2) {
    const marked = Array.from(doc.querySelectorAll('.slide, [data-screen-label]'));
    if (marked.length > sections.length) sections = marked;
  }
  if (!sections.length) {
    warnings.push('No <section> or .slide elements found — the whole document was read as one slide.');
    sections = [doc.body];
  }
  if (sections.length > MAX_SLIDES) {
    warnings.push(`Read the first ${MAX_SLIDES} of ${sections.length} sections; the rest were left out.`);
  }

  const recognised: Record<string, number> = {};
  const slides: Slide[] = sections.slice(0, MAX_SLIDES).map((sec, i) => {
    const read = textBlocks(sec);
    const { type, props, tone } = classify(read, i);
    recognised[type] = (recognised[type] ?? 0) + 1;
    if (!read.blocks.length) warnings.push(`Section ${i + 1} had no readable text.`);
    return { id: `i${String(i + 1).padStart(2, '0')}`, type, tone, props } as Slide;
  });

  // A page with no readable copy at all is not a deck — opening it would hand
  // the person one empty slide called "Slide 1" and make the importer look
  // broken instead of the file. Say what happened and stop.
  const anyText = sections.some(sec => clean(sec.textContent ?? '').length > 0);
  if (!anyText) {
    return {
      deck: { id: 'imported', title: 'Nothing readable', theme: defaultTheme, slides: [] },
      sections: sections.length, recognised: {},
      warnings,
      fatal: 'No readable slide content was found in that file. It may be an app page or a script-rendered deck — export it as static HTML first.',
    };
  }

  // querySelector('title') also matches an <svg><title>, so a chart's
  // accessible name would win over the document's own.
  const titleEl = Array.from(doc.querySelectorAll('title')).find(t => !t.closest('svg'));
  const title = clean(titleEl?.textContent ?? '')
    || name.replace(/(\.dc)?\.html?$/i, '');

  return {
    deck: { id: 'imported', title: title || 'Imported deck', theme: defaultTheme, slides },
    sections: sections.length,
    recognised,
    warnings,
  };
}
