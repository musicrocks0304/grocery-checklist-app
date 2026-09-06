import { randomUUID } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let originalCryptoDescriptor;

beforeEach(() => {
  originalCryptoDescriptor = Object.getOwnPropertyDescriptor(window, 'crypto');
});

afterEach(() => {
  if (originalCryptoDescriptor) {
    Object.defineProperty(window, 'crypto', originalCryptoDescriptor);
  } else {
    delete window.crypto;
  }
});

test('delegates to crypto.randomUUID when available', () => {
  Object.defineProperty(window, 'crypto', {
    value: { randomUUID: () => '11111111-1111-4111-8111-111111111111' },
    configurable: true,
  });
  expect(randomUUID()).toBe('11111111-1111-4111-8111-111111111111');
});

test('uses getRandomValues when randomUUID is missing', () => {
  const getRandomValues = jest.fn((arr) => { arr.fill(0xab); return arr; });
  Object.defineProperty(window, 'crypto', {
    value: { getRandomValues },
    configurable: true,
  });
  const result = randomUUID();
  expect(result).toMatch(V4);
  expect(getRandomValues).toHaveBeenCalledTimes(1);
  const arg = getRandomValues.mock.calls[0][0];
  expect(arg).toBeInstanceOf(Uint8Array);
  expect(arg.length).toBe(16);
  expect(result[14]).toBe('4');
  expect(/[89ab]/.test(result[19])).toBe(true);
});

test('falls back to Math.random when crypto is absent', () => {
  Object.defineProperty(window, 'crypto', { value: undefined, configurable: true });
  const ids = new Set(Array.from({ length: 200 }, () => randomUUID()));
  ids.forEach((id) => expect(id).toMatch(V4));
  expect(ids.size).toBe(200);
});
