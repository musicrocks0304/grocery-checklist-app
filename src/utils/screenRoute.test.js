import { resolveScreenFromHash, VALID_SCREENS, LEGACY_REDIRECT } from './screenRoute';

describe('resolveScreenFromHash', () => {
  test('empty hash resolves to home', () => {
    expect(resolveScreenFromHash('')).toEqual({ screen: 'home' });
  });

  test('"#home" resolves to home', () => {
    expect(resolveScreenFromHash('#home')).toEqual({ screen: 'home' });
  });

  test('hash without a leading # still resolves', () => {
    expect(resolveScreenFromHash('deals')).toEqual({ screen: 'deals' });
  });

  test('legacy "#grocery" redirects to plan', () => {
    expect(resolveScreenFromHash('#grocery')).toEqual({ screen: 'plan' });
  });

  test('legacy "#smart-deals" redirects to deals', () => {
    expect(resolveScreenFromHash('#smart-deals')).toEqual({ screen: 'deals' });
  });

  test('unknown hash falls back to home', () => {
    expect(resolveScreenFromHash('#nonsense')).toEqual({ screen: 'home' });
  });

  test('"#join/gs62" returns the uppercased invite code', () => {
    expect(resolveScreenFromHash('#join/gs62')).toEqual({ join: 'GS62' });
  });

  test('"#join/" with no code falls back to home', () => {
    expect(resolveScreenFromHash('#join/')).toEqual({ screen: 'home' });
  });

  test('"#join/  gs62  " trims surrounding whitespace', () => {
    expect(resolveScreenFromHash('#join/  gs62  ')).toEqual({ join: 'GS62' });
  });

  test('missing or non-string input falls back to home', () => {
    expect(resolveScreenFromHash(undefined)).toEqual({ screen: 'home' });
    expect(resolveScreenFromHash(null)).toEqual({ screen: 'home' });
    expect(resolveScreenFromHash('#')).toEqual({ screen: 'home' });
  });

  test('every non-legacy valid screen resolves to itself', () => {
    VALID_SCREENS.filter((id) => !LEGACY_REDIRECT[id]).forEach((id) => {
      expect(resolveScreenFromHash(`#${id}`)).toEqual({ screen: id });
    });
  });

  test('every legacy screen resolves to its redirect target', () => {
    Object.entries(LEGACY_REDIRECT).forEach(([legacy, target]) => {
      expect(resolveScreenFromHash(`#${legacy}`)).toEqual({ screen: target });
    });
  });
});
