import { randomUUID } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('returns v4-format ids', () => {
  expect(randomUUID()).toMatch(V4);
});

test('ids are unique across calls', () => {
  const ids = new Set(Array.from({ length: 200 }, () => randomUUID()));
  expect(ids.size).toBe(200);
});

test('falls back when crypto.randomUUID is unavailable', () => {
  const original = window.crypto;
  Object.defineProperty(window, 'crypto', { value: undefined, configurable: true });
  try { expect(randomUUID()).toMatch(V4); }
  finally { Object.defineProperty(window, 'crypto', { value: original, configurable: true }); }
});
