import { describe, expect, it } from 'vitest';
import { valueAtPath } from './slideKit';
import { sampleDeck } from './sampleDeck';

/**
 * A refused numeric edit puts the field back to what the model holds. It used to
 * stringify the whole props object, so typing "1.2.3" into a bar left the slide
 * reading "[object Object]".
 */
describe('valueAtPath', () => {
  const props = sampleDeck.slides.find(s => s.id === 's04')!.props;

  it('reads a value out of a nested array row', () => {
    expect(valueAtPath(props, 'left.rows.0.value'))
      .toBe(String(props.left.rows[0].value));
  });

  it('reads a top-level string', () => {
    expect(valueAtPath(props, 'title')).toBe(props.title);
  });

  it('never returns a stringified object', () => {
    expect(valueAtPath(props, 'left')).toBe('');
    expect(valueAtPath(props, 'left.rows')).toBe('');
  });

  it('returns an empty string for a path that is not there', () => {
    expect(valueAtPath(props, 'left.rows.99.value')).toBe('');
    expect(valueAtPath(props, 'nope.nope')).toBe('');
    expect(valueAtPath(undefined, 'title')).toBe('');
  });

  it('keeps a zero rather than blanking the field', () => {
    expect(valueAtPath({ a: 0 }, 'a')).toBe('0');
  });
});
