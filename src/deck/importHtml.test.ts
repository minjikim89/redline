import { describe, expect, it } from 'vitest';
import { importHtml } from './importHtml';

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

  it('keeps a source line off the body', () => {
    const r = importHtml(page(
      '<h1>Cover</h1>',
      '<h2>A finding</h2><p>Something long enough to count as a body paragraph on this slide.</p>'
      + '<div>Source: the ledger</div>',
    ), 'x.html');
    expect(r.deck.slides[1].props.source).toMatch(/^Source:/);
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
