import { decodeHtmlEntities } from './text';

describe('decodeHtmlEntities', () => {
  test('decodes &nbsp; to a normal space and trims/collapses whitespace', () => {
    expect(decodeHtmlEntities('…Strawberry &amp; Watermelon&nbsp;')).toBe('…Strawberry & Watermelon');
  });

  test('decodes &amp;', () => {
    expect(decodeHtmlEntities('A&amp;B')).toBe('A&B');
  });

  test('decodes &#39; numeric entity', () => {
    expect(decodeHtmlEntities("x&#39;y")).toBe("x'y");
  });

  test('returns "" for null', () => {
    expect(decodeHtmlEntities(null)).toBe('');
  });

  test('returns "" for undefined', () => {
    expect(decodeHtmlEntities(undefined)).toBe('');
  });

  test('returns "" for non-string types (number, object)', () => {
    expect(decodeHtmlEntities(42)).toBe('');
    expect(decodeHtmlEntities({})).toBe('');
  });

  test('decodes &lt; &gt; &quot; &apos;', () => {
    expect(decodeHtmlEntities('&lt;tag&gt; &quot;quoted&quot; &apos;single&apos;')).toBe('<tag> "quoted" \'single\'');
  });

  test('decodes hex numeric entities (&#xHH;)', () => {
    expect(decodeHtmlEntities('caf&#x65;')).toBe('cafe');
  });

  test('decodes decimal numeric entities (&#NNN;)', () => {
    expect(decodeHtmlEntities('caf&#101;')).toBe('cafe');
  });

  test('collapses internal runs of whitespace to a single space', () => {
    expect(decodeHtmlEntities('too    many   spaces')).toBe('too many spaces');
  });

  test('trims leading and trailing whitespace after decoding', () => {
    expect(decodeHtmlEntities('&nbsp;&nbsp;padded&nbsp;&nbsp;')).toBe('padded');
  });

  test('returns "" for empty string', () => {
    expect(decodeHtmlEntities('')).toBe('');
  });

  test('leaves plain strings untouched (aside from whitespace collapse)', () => {
    expect(decodeHtmlEntities('Whole Milk')).toBe('Whole Milk');
  });
});
