import { describe, expect, it } from 'vitest';
import { importHtml } from './importHtml';
import { registry } from './registry';

const page = (...sections: string[]) =>
  `<!doctype html><html><head><title>Test Deck</title></head><body>${sections
    .map(s => `<section>${s}</section>`).join('')}</body></html>`;

describe('importHtml', () => {
  it('reads a title and counts the sections it found', () => {
    const r = importHtml(page('<h1>One</h1>', '<h2>Two</h2>'), 'x.html');
    expect(r.deck.title).toBe('Test Deck');
    expect(r.sections).toBe(2);
    expect(r.deck.slides).toHaveLength(2);
  });

  it('falls back to the filename when the document has no title', () => {
    const r = importHtml('<html><body><section><h1>Hi</h1></section></body></html>', 'Q3 Review.html');
    expect(r.deck.title).toBe('Q3 Review');
  });

  it('makes the first section a cover', () => {
    const r = importHtml(page('<div>KICKOFF</div><h1>The Big Deck</h1><p>A longer standfirst line that explains it.</p>'), 'x.html');
    expect(r.deck.slides[0].type).toBe('cover');
    expect(r.deck.slides[0].props.title).toBe('The Big Deck');
  });

  /* The bug this suite exists for: a bare figure is technically uppercase, so a
     naive "all caps means kicker" rule ate the number the slide is about. */
  it.each(['$1.4M', '₩23.8B', '22.2%', '202M', '14.9', '−13.8B'])(
    'treats %s as the headline figure, not a kicker', (fig) => {
      const r = importHtml(page(
        '<h1>Cover</h1>',
        `<div>The headline number</div><div>${fig}</div>` +
        '<p>A sentence long enough to be read as the qualifying body text for the figure.</p>' +
        '<div>Source: the ledger</div>',
      ), 'x.html');
      const s = r.deck.slides[1];
      expect(s.type).toBe('hero');
      expect(s.props.figure).toBe(fig);
      expect(s.props.eyebrow).not.toBe(fig);
    });

  it('does not mistake a sentence containing a number for a figure', () => {
    const r = importHtml(page(
      '<h1>Cover</h1>',
      '<h2>Costs moved</h2><p>Compute fell 26% after the reserved-instance purchase this quarter.</p>'
      + '<p>Storage grew 41% on retention rather than on user growth over the same window.</p>',
    ), 'x.html');
    expect(r.deck.slides[1].type).toBe('cards');
  });

  it('recognises a references section', () => {
    const r = importHtml(page(
      '<h1>Cover</h1>',
      '<h2>References and notes</h2><p>Source: the ledger, monthly close, January onward.</p>'
      + '<p>Source: vendor invoices as billed rather than as forecast.</p>',
    ), 'x.html');
    expect(r.deck.slides[1].type).toBe('refs');
    expect(r.deck.slides[1].props.groups.length).toBeGreaterThan(0);
  });

  it('keeps a source line off the body, in a slot the slide actually renders', () => {
    const r = importHtml(page(
      '<h1>Cover</h1>',
      '<h2>A finding</h2><p>Something long enough to count as a body paragraph on this slide.</p>'
      + '<div>Source: the ledger</div>',
    ), 'x.html');
    expect(r.deck.slides[1].props.footnote).toMatch(/^Source:/);
  });

  /* ---------- edges ---------- */

  it('survives a document with no sections at all', () => {
    const r = importHtml('<html><body><h1>Just a page</h1><p>No sections here.</p></body></html>', 'x.html');
    expect(r.deck.slides).toHaveLength(1);
    expect(r.warnings.join(' ')).toMatch(/No <section>/);
  });

  it('falls back to .slide and [data-screen-label]', () => {
    const r = importHtml(
      '<html><body><div class="slide"><h1>A</h1></div><div data-screen-label="2"><h2>B</h2></div></body></html>',
      'x.html');
    expect(r.sections).toBe(2);
  });

  it('warns about a section with no readable text', () => {
    const r = importHtml(page('<h1>Cover</h1>', '<img src="x.png">'), 'x.html');
    expect(r.warnings.some(w => /no readable text/i.test(w))).toBe(true);
  });

  it('never emits a slide without a usable heading', () => {
    const r = importHtml(page('<h1>Cover</h1>', '<span>hi</span>'), 'x.html');
    for (const s of r.deck.slides) {
      const shown = s.props.title ?? s.props.eyebrow ?? s.props.head;
      expect(typeof shown).toBe('string');
      expect(String(shown).length).toBeGreaterThan(0);
    }
  });

  it('caps a very long deck rather than melting', () => {
    const r = importHtml(page(...Array.from({ length: 80 }, (_, i) => `<h2>Slide ${i}</h2>`)), 'x.html');
    expect(r.sections).toBe(80);
    expect(r.deck.slides.length).toBeLessThanOrEqual(40);
  });

  it('gives every slide a unique id', () => {
    const r = importHtml(page(...Array.from({ length: 12 }, (_, i) => `<h2>S${i}</h2>`)), 'x.html');
    const ids = r.deck.slides.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not execute script tags in the imported file', () => {
    const spy = { hit: false };
    (globalThis as any).__importPwn = () => { spy.hit = true; };
    importHtml(page('<h1>Cover</h1><script>globalThis.__importPwn()</script>'), 'x.html');
    expect(spy.hit).toBe(false);
  });

  it('handles an empty string without throwing', () => {
    expect(() => importHtml('', 'x.html')).not.toThrow();
  });

  it('strips runs of whitespace out of the text it keeps', () => {
    const r = importHtml(page('<h1>  Lots   of\n\n  space  </h1>'), 'x.html');
    expect(r.deck.slides[0].props.title).toBe('Lots of space');
  });
});

describe('importHtml — headings', () => {
  it('prefers a real heading element over the longest line', () => {
    const r = importHtml(
      '<html><body><section><div>KICKOFF</div><h1>Short</h1>'
      + '<p>A standfirst that runs considerably longer than the heading above it.</p>'
      + '</section></body></html>', 'x.html');
    expect(r.deck.slides[0].props.title).toBe('Short');
  });

  it('uses h2 when there is no h1', () => {
    const r = importHtml(
      '<html><body><section><h1>Cover</h1></section>'
      + '<section><h2>The Finding</h2><p>Body copy that is longer than the heading is.</p></section>'
      + '</body></html>', 'x.html');
    expect(r.deck.slides[1].props.title).toBe('The Finding');
  });

  it('still works when nothing is marked up as a heading', () => {
    const r = importHtml(
      '<html><body><section><div>Cover</div></section>'
      + '<section><div>An untagged line that has to serve as the heading here.</div></section>'
      + '</body></html>', 'x.html');
    expect(String(r.deck.slides[1].props.title).length).toBeGreaterThan(0);
  });
});

describe('importHtml — text fidelity', () => {
  it('keeps the space between child nodes of a heading', () => {
    const r = importHtml(
      '<html><body><section><h1><span>How Korean Content Became</span>'
      + '<span>a Global Product Engine</span></h1></section></body></html>', 'x.html');
    expect(r.deck.slides[0].props.title).toBe('How Korean Content Became a Global Product Engine');
  });

  it('turns a line break into a space, not into nothing', () => {
    const r = importHtml(
      '<html><body><section><h1>First line<br>second line</h1></section></body></html>', 'x.html');
    expect(r.deck.slides[0].props.title).toBe('First line second line');
  });

  it('strips a .dc.html extension from the fallback title', () => {
    const r = importHtml('<html><body><section><h1>A</h1></section></body></html>',
      'Crowdfunding Market.dc.html');
    expect(r.deck.title).toBe('Crowdfunding Market');
  });

  it('strips a plain .html extension too', () => {
    const r = importHtml('<html><body><section><h1>A</h1></section></body></html>', 'Report.html');
    expect(r.deck.title).toBe('Report');
  });
});

/* ---------- adversarial input ---------- */

describe('importHtml — hostile and malformed files', () => {
  it('does not read a stylesheet as slide copy', () => {
    const r = importHtml(page('<h1>Cover</h1>',
      '<div><style>.card{color:red;background:#fff;padding:12px}</style>The real body copy.</div>'), 'x.html');
    const text = JSON.stringify(r.deck.slides[1].props);
    expect(text).not.toMatch(/color:red/);
    expect(text).toContain('The real body copy.');
  });

  it('does not read script source as slide copy', () => {
    const r = importHtml(page('<h1>Cover</h1>',
      '<h2>A finding</h2><script>var secret = "leak me into the deck"</script>'
      + '<p>The paragraph that actually belongs on this slide.</p>'), 'x.html');
    expect(JSON.stringify(r.deck.slides[1].props)).not.toMatch(/leak me/);
  });

  it('does not fire an inline event handler while parsing', () => {
    delete (globalThis as any).__importPwn2;
    importHtml(page('<h1 onclick="globalThis.__importPwn2=1">Cover</h1>',
      '<img src=x onerror="globalThis.__importPwn2=1"><h2>Heading</h2>'), 'x.html');
    expect((globalThis as any).__importPwn2).toBeUndefined();
  });

  it('reads a table row at a time instead of collapsing the whole table', () => {
    const r = importHtml(page('<h1>Cover</h1>',
      '<h2>Rules by market</h2><table>'
      + '<tr><td>United States</td><td>$5M</td><td>Income-based</td></tr>'
      + '<tr><td>United Kingdom</td><td>None</td><td>Self-certified</td></tr></table>'), 'x.html');
    const bodies = r.deck.slides[1].props.cards.map((c: any) => c.body);
    expect(bodies).toContain('United States $5M Income-based');
    expect(bodies).toContain('United Kingdom None Self-certified');
  });

  it('does not claim a section has no body text when it is a list of short bullets', () => {
    const r = importHtml(page('<h1>Cover</h1>',
      '<h2>What moved</h2><ul><li>Revenue up 12%</li><li>Churn down 3pt</li><li>NPS flat</li></ul>'), 'x.html');
    const bodies = r.deck.slides[1].props.cards.map((c: any) => c.body);
    expect(bodies).toEqual(['Revenue up 12%', 'Churn down 3pt', 'NPS flat']);
  });

  it('keeps text that sits loose beside a block child', () => {
    const r = importHtml(page('<h1>Cover</h1>',
      '<div>An introductory line<p>And a paragraph that follows it inside the same box.</p></div>'), 'x.html');
    expect(JSON.stringify(r.deck.slides[1].props)).toContain('An introductory line');
  });

  it('reads a document whose body has no element children at all', () => {
    const r = importHtml('not html, just a line of text that somebody dropped on the page', 'notes.txt');
    expect(r.warnings.join(' ')).toMatch(/No <section>/);
    expect(JSON.stringify(r.deck.slides[0].props)).toContain('just a line of text');
  });

  it('imports a reveal-style nested stack once, not twice', () => {
    const r = importHtml(
      '<html><head><title>R</title></head><body><div class="slides">'
      + '<section><section><h2>Vertical A</h2><p>Body copy long enough to be a paragraph.</p></section>'
      + '<section><h2>Vertical B</h2><p>Another body paragraph that runs on a while.</p></section></section>'
      + '</div></body></html>', 'x.html');
    expect(r.sections).toBe(2);
    expect(r.deck.slides.map(s => s.props.title)).toEqual(['Vertical A', 'Vertical B']);
  });

  it('keeps a wrapper section that has copy of its own', () => {
    const r = importHtml(
      '<html><body><section><h2>Outer heading</h2><p>Copy that belongs to the wrapper itself.</p>'
      + '<section><h2>Inner heading</h2><p>Copy that belongs to the inner section.</p></section>'
      + '</section></body></html>', 'x.html');
    expect(r.sections).toBe(2);
    expect(JSON.stringify(r.deck.slides.map(s => s.props))).toContain('Outer heading');
  });

  it('says so when it stops reading rather than dropping sections silently', () => {
    const r = importHtml(page(...Array.from({ length: 500 }, (_, i) => `<h2>Slide ${i}</h2>`)), 'x.html');
    expect(r.sections).toBe(500);
    expect(r.deck.slides).toHaveLength(40);
    expect(r.warnings.join(' ')).toMatch(/first 40 of 500/);
  });

  it('reads a large document in reasonable time', () => {
    const many = Array.from({ length: 6000 },
      (_, i) => `<p>Paragraph ${i} with enough filler text to stand as a real block of copy.</p>`).join('');
    const t0 = Date.now();
    importHtml(`<html><head><title>Big</title></head><body><section>${many}</section></body></html>`, 'big.html');
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});

describe('importHtml — text the parser must not misread', () => {
  it('does not read a script without letter case as an all-caps kicker', () => {
    const r = importHtml(page('<h1>표지</h1>',
      '<h2>AI 도입 전략</h2><p>국내 기업의 인공지능 도입은 빠르게 확산되었습니다.</p>'), 'x.html');
    expect(r.deck.slides[1].props.kicker).toBe('');
    expect(r.deck.slides[1].props.title).toBe('AI 도입 전략');
  });

  it('still recognises a genuine all-caps kicker', () => {
    const r = importHtml(page('<h1>Cover</h1>',
      '<div>STAGE 2 · CONVERSION</div><h2>From Watching to Buying</h2>'
      + '<p>A paragraph of body copy long enough to be read as one.</p>'), 'x.html');
    expect(r.deck.slides[1].props.kicker).toBe('STAGE 2 · CONVERSION');
  });

  it('never prints the same line as both kicker and heading', () => {
    const r = importHtml(page('<h1>THE COVER</h1>',
      '<h2>EVERYTHING HERE IS SHOUTING</h2><p>THIS BODY COPY IS ALSO IN CAPITALS.</p>'), 'x.html');
    for (const s of r.deck.slides) {
      const kick = s.props.eyebrow ?? s.props.kicker;
      if (kick && kick !== 'Imported deck') expect(kick).not.toBe(s.props.title);
    }
  });

  it('leaves right-to-left text intact', () => {
    const r = importHtml(page('<h1>تقرير السوق</h1>',
      '<h2>نمو السوق</h2><p>ينمو سوق التمويل الجماعي بسرعة كبيرة في السنوات الأخيرة.</p>'), 'x.html');
    expect(r.deck.slides[0].props.title).toBe('تقرير السوق');
    expect(r.deck.slides[1].props.title).toBe('نمو السوق');
  });

  it('keeps entities and emoji as the characters they decode to', () => {
    const r = importHtml(page('<h1>Cover &amp; Contents</h1>',
      '<h2>Growth &gt; 20% &mdash; 🚀 momentum</h2><p>Q&amp;A follows the deep dive 🎬 later today.</p>'), 'x.html');
    expect(r.deck.slides[0].props.title).toBe('Cover & Contents');
    expect(r.deck.slides[1].props.title).toBe('Growth > 20% — 🚀 momentum');
    expect(r.deck.slides[1].props.cards[0].body).toContain('Q&A');
  });

  it('does not blow a bare year up into a headline figure', () => {
    const r = importHtml(page('<h1>Cover</h1>',
      '<h2>National divergence</h2><p>The four rulebooks diverged after the Act took effect.</p><div>2024</div>'), 'x.html');
    expect(r.deck.slides[1].type).toBe('cards');
  });

  it('keeps the only line on a section rather than inventing a placeholder', () => {
    const r = importHtml(page('<div>42</div>'), 'x.html');
    expect(r.deck.slides[0].props.title).toBe('42');
  });

  it('does not let an svg chart title become the deck title', () => {
    const r = importHtml(
      '<html><head></head><body><section><svg><title>Bar chart</title></svg><h1>Real Heading</h1></section></body></html>',
      'MyDeck.html');
    expect(r.deck.title).toBe('MyDeck');
  });

  it('keeps every prop inside the length its own schema declares', () => {
    const long = 'word '.repeat(400);
    const r = importHtml(page(`<h1>${long}</h1>`, `<h2>${long}</h2><p>${long}</p>`), 'x.html');
    expect(r.deck.slides[0].props.title.length).toBeLessThanOrEqual(120);
    expect(r.deck.slides[1].props.title.length).toBeLessThanOrEqual(200);
    for (const c of r.deck.slides[1].props.cards) {
      expect(c.body.length).toBeLessThanOrEqual(300);
      expect(c.head.length).toBeLessThanOrEqual(60);
    }
  });

  it('survives runaway nesting instead of overflowing the stack', () => {
    let inner = '<p>The body copy buried at the bottom of the well.</p>';
    for (let i = 0; i < 400; i++) inner = `<div>${inner}</div>`;
    expect(() => importHtml(page('<h1>Cover</h1>', inner), 'x.html')).not.toThrow();
  }, 30_000);
});

/**
 * The registry is the contract for what an agent may write and for what the
 * component draws. An importer that invents a prop outside it produces text
 * that survives export and is invisible on the artboard.
 */
describe('importHtml — stays inside the registry', () => {
  it('only writes props the slide type declares', () => {
    const html = page(
      '<div>BRIEFING</div><h1>The Cover</h1><p>A standfirst long enough to be read as one.</p>',
      '<div>THE NUMBER</div><div>$202M</div><p>A qualifying sentence about that figure, long enough.</p><div>Source: a ledger</div>',
      '<h2>A prose slide</h2><p>Body copy that is long enough to count as a real paragraph here.</p><div>Source: a ledger</div>',
      '<h2>References and notes</h2><p>Source: one citation that is long enough to be a group.</p>'
      + '<p>Source: a second citation that is also long enough to count.</p>',
    );
    const r = importHtml(html, 'x.html');
    for (const s of r.deck.slides) {
      const allowed = new Set([...Object.keys(registry[s.type].propSchema), 'meta', 'cards', 'groups']);
      for (const [k, v] of Object.entries(s.props)) {
        if (v === undefined) continue;
        expect({ type: s.type, prop: k, allowed: [...allowed] })
          .toMatchObject({ allowed: expect.arrayContaining([k]) });
      }
    }
  });
});
