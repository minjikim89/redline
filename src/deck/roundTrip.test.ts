import { describe, expect, it } from 'vitest';
import { exportHtml } from './exportHtml';
import { importHtml } from './importHtml';
import { registry, slideTypes } from './registry';
import { sampleDeck } from './sampleDeck';

/**
 * Export then import. The point is not that it is lossless — a rendered chart
 * cannot survive as prose — but that the handover is real: every slide comes
 * back, keeps its heading, and lands on a type the renderer knows.
 */
describe('round trip', () => {
  const html = exportHtml(sampleDeck);
  const back = importHtml(html, 'roundtrip.html');

  it('emits one section per slide', () => {
    expect(back.sections).toBe(sampleDeck.slides.length);
  });

  it('brings every slide back with a usable heading', () => {
    expect(back.deck.slides).toHaveLength(sampleDeck.slides.length);
    for (const s of back.deck.slides) {
      const shown = s.props.title ?? s.props.eyebrow;
      expect(String(shown ?? '').length).toBeGreaterThan(0);
    }
  });

  it('keeps the deck title', () => {
    expect(back.deck.title).toBe(sampleDeck.title);
  });

  it('carries the headline figure through as a figure', () => {
    const hero = back.deck.slides.find(s => s.type === 'hero');
    expect(hero?.props.figure).toBe('$202M');
  });

  it('re-reads without warnings', () => {
    expect(back.warnings).toEqual([]);
  });

  it('escapes markup in slide text instead of emitting it', () => {
    const nasty = {
      ...sampleDeck,
      slides: [{ ...sampleDeck.slides[0], props: { ...sampleDeck.slides[0].props, title: '<script>x()</script>' } }],
    };
    const out = exportHtml(nasty as any);
    expect(out).not.toContain('<script>x()');
    expect(out).toContain('&lt;script&gt;');
  });

  it('produces a parseable document even for an empty deck', () => {
    const out = exportHtml({ id: 'e', title: 'Empty', theme: sampleDeck.theme, slides: [] });
    expect(() => importHtml(out, 'e.html')).not.toThrow();
  });
});

/**
 * Nine slide types go out; four come back as themselves and five come back as
 * prose, because a bar chart has no prose that means "bar chart". What has to
 * hold for every one of them is that the slide arrives, keeps its heading, and
 * lands on a type this renderer can draw.
 */
describe('round trip — every slide type', () => {
  const back = importHtml(exportHtml(sampleDeck), 'roundtrip.html');

  it('covers every type the registry declares at least once', () => {
    const sent = new Set(sampleDeck.slides.map(s => s.type));
    expect([...slideTypes].every(t => sent.has(t))).toBe(true);
  });

  it('brings each slide back on a type the registry knows', () => {
    for (const s of back.deck.slides) expect(registry[s.type]).toBeDefined();
  });

  it('keeps each slide heading verbatim, whatever type it lands on', () => {
    sampleDeck.slides.forEach((sent, i) => {
      const want = sent.props.title ?? sent.props.eyebrow;
      const got = back.deck.slides[i].props.title ?? back.deck.slides[i].props.eyebrow;
      expect(got).toBe(want);
    });
  });

  it('carries a source line through as a source, not as body copy', () => {
    sampleDeck.slides.forEach((sent, i) => {
      if (!sent.props.source) return;
      const got = back.deck.slides[i].props;
      expect(String(got.source ?? got.footnote ?? '')).toContain(String(sent.props.source).slice(0, 24));
    });
  });

  it('settles: a second trip changes nothing', () => {
    const twice = importHtml(exportHtml(back.deck), 'roundtrip2.html');
    expect(twice.deck.slides).toEqual(back.deck.slides);
  });

  /* A references topic is the opening words of its own text. Writing both out
     prepended it again on every pass: "Streaming Streaming Streaming". */
  it('does not grow a references topic on each pass', () => {
    const refs = back.deck.slides.find(s => s.type === 'refs')!;
    const twice = importHtml(exportHtml(back.deck), 'roundtrip2.html');
    const again = twice.deck.slides.find(s => s.type === 'refs')!;
    expect(again.props.groups.map((g: any) => g.topic))
      .toEqual(refs.props.groups.map((g: any) => g.topic));
    for (const g of again.props.groups) expect(g.text).not.toMatch(/^(\S+) \1\b/);
  });

  it('does not repeat a card heading that is only the first clause of its body', () => {
    const out = exportHtml({
      ...sampleDeck,
      slides: [{
        id: 's1', type: 'cards',
        props: { title: 'T', cards: [{ index: '01', head: 'Storage grew on retention', body: 'Storage grew on retention rather than on user growth over the same window.' }] },
      }] as any,
    });
    expect(out.match(/Storage grew on retention/g)).toHaveLength(1);
  });
});
