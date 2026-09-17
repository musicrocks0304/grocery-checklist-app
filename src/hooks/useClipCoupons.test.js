import { renderHook, act } from '@testing-library/react';
import { useClipCoupons } from './useClipCoupons';
import FakeEventSource from '../test-utils/FakeEventSource';

/**
 * `useHebSession` fetches /api/health once on mount and never again, so a
 * login that dies mid-session stayed invisible until the component remounted:
 * the panel kept saying `ready` while every clip failed. The design (spec §8)
 * wires the SESSION_EXPIRED the server already sends to a session recheck,
 * rather than adding a timer that polls a healthy server forever.
 */
const originalEventSource = global.EventSource;

beforeEach(() => {
  FakeEventSource.instances = [];
  global.EventSource = FakeEventSource;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ jobId: 'job-1' }),
  });
});

afterEach(() => {
  global.EventSource = originalEventSource;
  jest.restoreAllMocks();
});

const startClip = async (result) => {
  await act(async () => { await result.current.clipSelected(['heb_1']); });
  return FakeEventSource.instances[0];
};

test('a SESSION_EXPIRED message rechecks the HEB session', async () => {
  const onSessionExpired = jest.fn();
  const { result } = renderHook(() => useClipCoupons({ onSessionExpired }));

  const es = await startClip(result);
  act(() => {
    es.message({
      type: 'progress',
      couponId: 'heb_1',
      status: 'failed',
      message: 'SESSION_EXPIRED: Clip action triggered login redirect',
    });
  });

  expect(onSessionExpired).toHaveBeenCalledTimes(1);
});

test('an ordinary clip failure does NOT recheck the session', async () => {
  // A recheck on every failure would hammer /api/health during a bad batch,
  // and a stale hash failure has nothing to do with the login.
  const onSessionExpired = jest.fn();
  const { result } = renderHook(() => useClipCoupons({ onSessionExpired }));

  const es = await startClip(result);
  act(() => {
    es.message({
      type: 'progress',
      couponId: 'heb_1',
      status: 'failed',
      message: 'GraphQL hash stale (PersistedQueryNotFound)',
    });
  });

  expect(onSessionExpired).not.toHaveBeenCalled();
});

test('works without a callback — every other caller omits it', async () => {
  const { result } = renderHook(() => useClipCoupons());

  const es = await startClip(result);
  expect(() => {
    act(() => {
      es.message({
        type: 'progress',
        couponId: 'heb_1',
        status: 'failed',
        message: 'SESSION_EXPIRED: gone',
      });
    });
  }).not.toThrow();
});
