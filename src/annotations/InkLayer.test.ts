import { afterEach, describe, expect, it, vi } from 'vitest';
import { giveToText } from './InkLayer';

/**
 * The press that edit mode is built on. The ink surface lies over the whole
 * artboard, so both halves of this are load-bearing:
 *   · the caret probe has to be taken with the surface lifted, or it resolves
 *     against the surface and the caret lands outside the text;
 *   · the press has to be claimed, or the browser's own mousedown moves focus
 *     to <body> and blurs the text a moment after we focused it.
 */

function scene() {
  document.body.innerHTML = '';
  const surface = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  surface.setAttribute('class', 'ink');
  const text = document.createElement('div');
  text.contentEditable = 'true';
  // jsdom implements neither `isContentEditable` nor focus on a contenteditable
  // div, so both are shimmed here; the browser gives them for free.
  Object.defineProperty(text, 'isContentEditable', { value: true });
  text.tabIndex = 0;
  text.append(document.createTextNode('How Korean Content Became a Global Product Engine'));
  document.body.append(text, surface);
  return { surface, text };
}

/** jsdom has neither hit-testing API; the point of the fix is how they interact. */
const under = (...els: Element[]) => {
  (document as any).elementsFromPoint = () => els;
};

afterEach(() => {
  delete (document as any).caretRangeFromPoint;
  delete (document as any).elementsFromPoint;
});

describe('giveToText', () => {
  it('lifts the ink surface while probing for the caret', () => {
    const { surface, text } = scene();
    const seen: string[] = [];
    (document as any).caretRangeFromPoint = vi.fn(() => {
      seen.push(surface.style.pointerEvents);
      const r = document.createRange();
      r.setStart(text.firstChild!, 4); r.collapse(true);
      return r;
    });
    under(surface, text);

    expect(giveToText(surface, 100, 100)).toBe(true);
    expect(seen).toEqual(['none']);
    expect(surface.style.pointerEvents).toBe('');   // and put back afterwards
  });

  it('focuses the text and drops the caret where the pointer was', () => {
    const { surface, text } = scene();
    (document as any).caretRangeFromPoint = () => {
      const r = document.createRange();
      r.setStart(text.firstChild!, 4); r.collapse(true);
      return r;
    };
    under(surface, text);

    giveToText(surface, 100, 100);
    expect(document.activeElement).toBe(text);
    const sel = getSelection()!;
    expect(sel.anchorNode).toBe(text.firstChild);
    expect(sel.anchorOffset).toBe(4);
  });

  it('ignores a caret that resolved outside the text it focused', () => {
    const { surface, text } = scene();
    const elsewhere = document.createElement('p');
    elsewhere.append(document.createTextNode('not the text under the pointer'));
    document.body.append(elsewhere);
    (document as any).caretRangeFromPoint = () => {
      const r = document.createRange();
      r.setStart(elsewhere.firstChild!, 2); r.collapse(true);
      return r;
    };
    under(surface, text);

    giveToText(surface, 100, 100);
    expect(document.activeElement).toBe(text);
    expect(getSelection()!.anchorNode).not.toBe(elsewhere.firstChild);
  });

  it('does not claim a press on open space', () => {
    const { surface } = scene();
    under(surface);
    expect(giveToText(surface, 10, 10)).toBe(false);
    expect(surface.style.pointerEvents).toBe('');
  });
});
