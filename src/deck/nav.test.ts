import { describe, expect, it } from 'vitest';
import { clampSlideIndex, slideIndexFromQuery } from './nav';

/**
 * `?slide=N` is a hand-editable link. A fractional or out-of-range value used to
 * index straight into the slide array, which handed the renderer `undefined`
 * (blank page) or left the rail highlighting nothing.
 */
describe('slideIndexFromQuery', () => {
  it('turns a 1-based slide number into a 0-based index', () => {
    expect(slideIndexFromQuery('?slide=3')).toBe(2);
  });

  it('floors a fractional slide number instead of yielding a fraction', () => {
    expect(slideIndexFromQuery('?slide=3.5')).toBe(2);
    expect(Number.isInteger(slideIndexFromQuery('?slide=3.5'))).toBe(true);
  });

  for (const q of ['', '?slide=0', '?slide=-2', '?slide=abc', '?slide=', '?slide=NaN'])
    it(`falls back to the first slide for ${JSON.stringify(q)}`, () => {
      expect(slideIndexFromQuery(q)).toBe(0);
    });

  it('keeps a very large number finite and integral', () => {
    const i = slideIndexFromQuery('?slide=1e9');
    expect(Number.isSafeInteger(i)).toBe(true);
  });
});

describe('clampSlideIndex', () => {
  it('leaves an in-range index alone', () => {
    expect(clampSlideIndex(4, 12)).toBe(4);
  });

  it('pulls an index past the end back to the last slide', () => {
    expect(clampSlideIndex(98, 12)).toBe(11);
    expect(clampSlideIndex(1e9, 12)).toBe(11);
  });

  it('pulls a negative index back to the first slide', () => {
    expect(clampSlideIndex(-5, 12)).toBe(0);
  });

  it('floors a fraction so it can index an array', () => {
    expect(clampSlideIndex(2.5, 12)).toBe(2);
  });

  it('survives a NaN and an empty deck', () => {
    expect(clampSlideIndex(NaN, 12)).toBe(0);
    expect(clampSlideIndex(3, 0)).toBe(0);
  });
});
