import { describe, expect, it } from 'vitest';
import { exportHtml } from './exportHtml';
import { importHtml } from './importHtml';
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
