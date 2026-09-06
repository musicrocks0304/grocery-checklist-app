import { renderHook, act, waitFor } from '@testing-library/react';
import { useHoldToTalk } from './InStoreMode';

// --- Shared mocks ---

class FakeMediaRecorder {
  static instances = [];
  constructor(stream) {
    this.stream = stream;
    this.state = 'inactive';
    this.mimeType = 'audio/webm';
    this.ondataavailable = null;
    this.onstop = null;
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    if (this.state !== 'recording') return;
    this.state = 'inactive';
    // Mimic real browsers: data event then stop event, both async.
    queueMicrotask(() => {
      if (this.ondataavailable) {
        this.ondataavailable({ data: new Blob(['fake-audio'], { type: 'audio/webm' }) });
      }
      if (this.onstop) this.onstop();
    });
  }
}

const fakeStream = () => ({
  _stopped: false,
  getTracks() {
    const stream = this;
    return [
      {
        stop() {
          stream._stopped = true;
        },
      },
    ];
  },
});

// Promise that lets a test resolve/reject getUserMedia at will (simulates a
// permission prompt that takes user time to answer).
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const setupMocks = ({ permission = 'prompt', getUserMediaImpl, fetchImpl } = {}) => {
  FakeMediaRecorder.instances = [];
  global.MediaRecorder = FakeMediaRecorder;

  const permStatus = { state: permission, onchange: null };
  global.navigator.permissions = {
    query: jest.fn(async () => permStatus),
  };
  global.navigator.mediaDevices = {
    getUserMedia: getUserMediaImpl
      ? jest.fn(getUserMediaImpl)
      : jest.fn(async () => fakeStream()),
  };

  global.fetch = jest.fn(
    fetchImpl ||
      (async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, transcript: 'milk' }),
        json: async () => ({ success: true, transcript: 'milk' }),
      }))
  );

  return { permStatus };
};

const teardownMocks = () => {
  delete global.MediaRecorder;
  delete global.fetch;
  delete global.navigator.permissions;
  delete global.navigator.mediaDevices;
};

const ENDPOINT = 'https://example.test/webhook/transcribe_grocery_item';

afterEach(() => {
  jest.useRealTimers();
  teardownMocks();
});

// --- Tests ---

describe('useHoldToTalk — happy path', () => {
  describe('with API key header assertion', () => {
    beforeEach(() => { process.env.REACT_APP_API_KEY = 'test-key'; });
    afterEach(() => { delete process.env.REACT_APP_API_KEY; });

    test('press, hold past MIN_PRESS_MS, release → fetch fires and onResult is called with transcript', async () => {
      setupMocks({
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true, transcript: 'milk' }),
          json: async () => ({ success: true, transcript: 'milk' }),
        }),
      });
      const onResult = jest.fn();
      const { result } = renderHook(() =>
        useHoldToTalk({ endpoint: ENDPOINT, onResult, onError: jest.fn() })
      );

      await act(async () => { await result.current.start({}); });
      expect(result.current.state).toBe('recording');

      // Simulate >250ms held by reaching into the test API. Since MIN_PRESS_MS
      // is gated on Date.now(), we use real time + a small wait.
      await new Promise((r) => setTimeout(r, 270));

      await act(async () => { await result.current.stop(); });

      await waitFor(() => expect(onResult).toHaveBeenCalledWith('milk'));
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = global.fetch.mock.calls[0];
      expect(url).toBe(ENDPOINT);
      expect(init.method).toBe('POST');
      expect(init.headers['X-API-Key']).toBe('test-key');
      expect(init.body).toBeInstanceOf(FormData);
      expect(result.current.state).toBe('idle');
    });
  });

  test('empty transcript → onResult called with "" (caller decides UX)', async () => {
    setupMocks({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, transcript: '' }),
        json: async () => ({ success: true, transcript: '' }),
      }),
    });
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useHoldToTalk({ endpoint: ENDPOINT, onResult, onError: jest.fn() })
    );
    await act(async () => { await result.current.start({}); });
    await new Promise((r) => setTimeout(r, 270));
    await act(async () => { await result.current.stop(); });
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(''));
  });
});

describe('useHoldToTalk — guards and cancellation', () => {
  test('release under MIN_PRESS_MS → no fetch, no error', async () => {
    setupMocks();
    const onResult = jest.fn();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useHoldToTalk({ endpoint: ENDPOINT, onResult, onError })
    );

    await act(async () => { await result.current.start({}); });
    // Release immediately (well under 250ms).
    await act(async () => { await result.current.stop(); });
    // Give any stray microtasks time to flush.
    await new Promise((r) => setTimeout(r, 50));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });

  test('slide-off (cancel) → no fetch, recorder.stop() called, stream released', async () => {
    setupMocks();
    const { result } = renderHook(() =>
      useHoldToTalk({ endpoint: ENDPOINT, onResult: jest.fn(), onError: jest.fn() })
    );

    await act(async () => { await result.current.start({}); });
    await act(async () => { result.current.cancel(); });
    await new Promise((r) => setTimeout(r, 50));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
    expect(FakeMediaRecorder.instances[0].state).toBe('inactive');
  });

  test('async-start race: release BEFORE getUserMedia resolves → recorder never starts, no fetch', async () => {
    const gum = deferred();
    setupMocks({ getUserMediaImpl: () => gum.promise });
    const { result } = renderHook(() =>
      useHoldToTalk({ endpoint: ENDPOINT, onResult: jest.fn(), onError: jest.fn() })
    );

    // Press — start() awaits getUserMedia which we hold open.
    let startPromise;
    act(() => { startPromise = result.current.start({}); });
    // User releases while permission prompt is still up.
    act(() => { result.current.stop(); });
    // Now resolve getUserMedia.
    const stream = fakeStream();
    gum.resolve(stream);
    await act(async () => { await startPromise; });
    await new Promise((r) => setTimeout(r, 50));

    // The recorder should NEVER have been constructed; the stream should
    // have been released by start()'s post-await intent check.
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(stream._stopped).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });
});

describe('useHoldToTalk — MAX_RECORD_MS auto-stop', () => {
  test('holding past 8s auto-stops AND submits (the v1 bug regression)', async () => {
    jest.useFakeTimers();
    setupMocks({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, transcript: 'milk' }),
        json: async () => ({ success: true, transcript: 'milk' }),
      }),
    });
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useHoldToTalk({ endpoint: ENDPOINT, onResult, onError: jest.fn() })
    );

    await act(async () => { await result.current.start({}); });

    // Advance past MAX_RECORD_MS. Wrap in act so React processes the timer's
    // setState synchronously.
    await act(async () => {
      jest.advanceTimersByTime(8001);
    });
    // Let the queued microtasks (recorder.onstop, fetch resolution) run. We
    // need real timers for the submit promise chain.
    jest.useRealTimers();
    await waitFor(() => expect(onResult).toHaveBeenCalledWith('milk'));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('useHoldToTalk — failure modes', () => {
  test('permission precheck = denied → blockedReason set on mount', async () => {
    setupMocks({ permission: 'denied' });
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useHoldToTalk({ endpoint: ENDPOINT, onResult: jest.fn(), onError })
    );
    await waitFor(() => expect(result.current.blockedReason).toBe('permission'));
  });

  test('press while blocked → onError fires with same reason, no recorder built', async () => {
    setupMocks({ permission: 'denied' });
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useHoldToTalk({ endpoint: ENDPOINT, onResult: jest.fn(), onError })
    );
    await waitFor(() => expect(result.current.blockedReason).toBe('permission'));

    await act(async () => { await result.current.start({ preventDefault: () => {} }); });

    expect(onError).toHaveBeenCalledWith('permission');
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('getUserMedia rejects NotAllowedError → blockedReason=permission + onError', async () => {
    const err = new Error('Permission denied');
    err.name = 'NotAllowedError';
    setupMocks({ getUserMediaImpl: async () => { throw err; } });
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useHoldToTalk({ endpoint: ENDPOINT, onResult: jest.fn(), onError })
    );
    await act(async () => { await result.current.start({}); });
    expect(onError).toHaveBeenCalledWith('permission');
    expect(result.current.blockedReason).toBe('permission');
  });

  test('getUserMedia rejects NotFoundError → blockedReason=no-mic', async () => {
    const err = new Error('No mic');
    err.name = 'NotFoundError';
    setupMocks({ getUserMediaImpl: async () => { throw err; } });
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useHoldToTalk({ endpoint: ENDPOINT, onResult: jest.fn(), onError })
    );
    await act(async () => { await result.current.start({}); });
    expect(onError).toHaveBeenCalledWith('no-mic');
    expect(result.current.blockedReason).toBe('no-mic');
  });

  test('MediaRecorder undefined (older browser) → blockedReason=no-recorder', async () => {
    setupMocks();
    delete global.MediaRecorder;
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useHoldToTalk({ endpoint: ENDPOINT, onResult: jest.fn(), onError })
    );
    await act(async () => { await result.current.start({}); });
    expect(onError).toHaveBeenCalledWith('no-recorder');
    expect(result.current.blockedReason).toBe('no-recorder');
  });

  test('fetch throws (network failure) → onError("network"), state idle, NOT blocked', async () => {
    setupMocks({
      fetchImpl: async () => { throw new TypeError('Failed to fetch'); },
    });
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useHoldToTalk({ endpoint: ENDPOINT, onResult: jest.fn(), onError })
    );
    await act(async () => { await result.current.start({}); });
    await new Promise((r) => setTimeout(r, 270));
    await act(async () => { await result.current.stop(); });
    await waitFor(() => expect(onError).toHaveBeenCalledWith('network'));
    expect(result.current.blockedReason).toBeNull();
    expect(result.current.state).toBe('idle');
  });

  test('15s fetch deadline fires (AbortError) → onError("network"), state idle', async () => {
    jest.useFakeTimers();
    setupMocks({
      fetchImpl: (_url, opts) => new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      }),
    });
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useHoldToTalk({ endpoint: ENDPOINT, onResult: jest.fn(), onError })
    );

    await act(async () => { await result.current.start({}); });

    // Auto-stop past MAX_RECORD_MS (8s) drives submitRecording, which then
    // arms its own FETCH_TIMEOUT_MS (15s) AbortController and calls fetch.
    await act(async () => {
      jest.advanceTimersByTime(8001);
    });
    // Advance past the 15s deadline to fire that AbortController.
    await act(async () => {
      jest.advanceTimersByTime(15001);
    });

    jest.useRealTimers();
    await waitFor(() => expect(onError).toHaveBeenCalledWith('network'));
    expect(result.current.state).toBe('idle');
  });

  test('server returns success:false → onError("server"), state idle', async () => {
    setupMocks({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: false, error: 'whisper_error' }),
        json: async () => ({ success: false, error: 'whisper_error' }),
      }),
    });
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useHoldToTalk({ endpoint: ENDPOINT, onResult: jest.fn(), onError })
    );
    await act(async () => { await result.current.start({}); });
    await new Promise((r) => setTimeout(r, 270));
    await act(async () => { await result.current.stop(); });
    await waitFor(() => expect(onError).toHaveBeenCalledWith('server'));
    expect(result.current.state).toBe('idle');
  });

  test('server returns HTTP 5xx → onError("server")', async () => {
    setupMocks({
      fetchImpl: async () => ({ ok: false, status: 500, text: async () => '', json: async () => ({}) }),
    });
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useHoldToTalk({ endpoint: ENDPOINT, onResult: jest.fn(), onError })
    );
    await act(async () => { await result.current.start({}); });
    await new Promise((r) => setTimeout(r, 270));
    await act(async () => { await result.current.stop(); });
    await waitFor(() => expect(onError).toHaveBeenCalledWith('server'));
  });
});
