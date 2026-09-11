import { useState, useEffect, useCallback, useRef } from "react";
import { apiJson } from "../config/api";

// Hook encapsulating MediaRecorder lifecycle for hold-to-talk voice input.
//
// Externally observable state values:
//   idle          — ready to record
//   recording     — actively capturing
//   transcribing  — uploading + waiting for Whisper
//   blocked       — persistent failure: mic permission denied, or no mic on
//                   device, or MediaRecorder unsupported. Caller renders a
//                   distinct disabled-looking visual on the button.
//
// Transient failures (network, server) DO NOT enter `blocked` — they fire
// onError and return to `idle` so the user can immediately retry.
//
// Usage:
//   const voice = useHoldToTalk({
//     endpoint: ENDPOINTS.transcribeGroceryItem,
//     onResult: (transcript) => { ... match + check ... },
//     onError:  (reason)     => { ... toast ... },
//   });
//   <button
//     onPointerDown={voice.start}
//     onPointerUp={voice.stop}
//     onPointerLeave={voice.cancel}
//     onPointerCancel={voice.cancel}
//   >
//
// onError reasons: 'permission' | 'no-mic' | 'no-recorder' | 'network' | 'server'
//
// Caller is responsible for matching the transcript against items and calling
// shopping_progress_check. The hook itself never modifies the shopping list.
const MIN_PRESS_MS = 250;
const MAX_RECORD_MS = 8000;
const FETCH_TIMEOUT_MS = 15000;

export const useHoldToTalk = ({ endpoint, onResult, onError }) => {
  const [state, setState] = useState("idle");
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startTimeRef = useRef(0);
  const maxTimerRef = useRef(null);
  // True between start() entry and the next stop/cancel. Read after
  // getUserMedia resolves to detect "user already released" — the fix for
  // the async-start race where start() is in flight while pointerup fires.
  const intentRef = useRef(false);
  // Promise that resolves with the final Blob once recorder.onstop fires.
  // Set ONCE per recording session, before recorder.start(). Both the user-
  // release path and the MAX_RECORD_MS auto-stop path await the same
  // promise, so the auto-stop can submit without depending on a handler
  // attached after the fact.
  const blobPromiseRef = useRef(null);
  // Latest onResult / onError refs so the in-flight async stop closure
  // always uses the freshest callbacks (avoids stale-closure on
  // shoppingList / checkedItems updates mid-recording).
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  // Permanent-disabled flag: set when navigator.permissions reports denied
  // OR when getUserMedia rejects with NotAllowedError / NotFoundError /
  // missing MediaRecorder. Distinct from transient errors — drives the
  // button's "blocked" visual.
  const [blockedReason, setBlockedReason] = useState(null);

  // Best-effort permission precheck on mount. If permission is `denied`,
  // surface it before the user ever presses the mic. Browsers that don't
  // support `permissions.query({name:'microphone'})` (older Firefox, some
  // Safari versions) silently skip — no harm done; we'll learn at first
  // press instead.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'microphone' })
      .then((status) => {
        if (cancelled) return;
        if (status.state === 'denied') setBlockedReason('permission');
        // Also subscribe to changes — user may grant via OS settings during
        // the session. Clear the block when they do.
        status.onchange = () => {
          if (cancelled) return;
          if (status.state === 'denied') setBlockedReason('permission');
          // Functional update — this closure captured blockedReason from
          // mount, so comparing against it directly never saw 'permission'
          // and a granted-in-OS-settings mic stayed blocked forever.
          else setBlockedReason((cur) => (cur === 'permission' ? null : cur));
        };
      })
      .catch(() => { /* unsupported; ignore */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanupStream = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    blobPromiseRef.current = null;
  }, []);

  // Best-effort cleanup on unmount.
  useEffect(() => {
    return () => {
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      if (recorderRef.current && recorderRef.current.state === "recording") {
        try { recorderRef.current.stop(); } catch { /* no-op */ }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Transient failure: surface via onError, return to idle. Does not touch
  // blockedReason — only `start()` sets that, on classifiable hard errors.
  const failTransient = useCallback((reason) => {
    cleanupStream();
    setState("idle");
    if (onErrorRef.current) onErrorRef.current(reason);
  }, [cleanupStream]);

  // Permanent failure: surface via onError AND latch into blocked state.
  const failBlocked = useCallback((reason) => {
    cleanupStream();
    setBlockedReason(reason);
    setState("idle");
    if (onErrorRef.current) onErrorRef.current(reason);
  }, [cleanupStream]);

  // Shared submission path used by both user-release (stop) and the
  // MAX_RECORD_MS auto-stop. Reads the blob from blobPromiseRef which was
  // set at recorder construction time, BEFORE recorder.start(). This is
  // why the auto-stop can drive submission — the onstop handler exists.
  const submitRecording = useCallback(async () => {
    const blobP = blobPromiseRef.current;
    if (!blobP) {
      cleanupStream();
      setState("idle");
      return;
    }
    setState("transcribing");
    const blob = await blobP;
    cleanupStream();

    // 15-second deadline on the server roundtrip. A stalled n8n must not
    // leave the user staring at a spinner.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const form = new FormData();
    // Field name "audio" — must match the Webhook node's binaryPropertyName.
    form.append("audio", blob, "recording.webm");

    let resJson = null;
    try {
      resJson = await apiJson(endpoint, {
        method: "POST",
        body: form,
        signal: controller.signal,
        timeout: FETCH_TIMEOUT_MS,
        retries: 0,
      });
      clearTimeout(timeoutId);
    } catch (err) {
      clearTimeout(timeoutId);
      setState("idle");
      // Timeout, caller abort and network failures all mean "try again";
      // anything the server answered (403/5xx/empty/invalid JSON) is "server".
      const isNetwork = err?.name === "AbortError" || err?.code === "network" || err?.code === "timeout";
      if (onErrorRef.current) onErrorRef.current(isNetwork ? "network" : "server");
      return;
    }

    if (!resJson || resJson.success !== true) {
      setState("idle");
      if (onErrorRef.current) onErrorRef.current("server");
      return;
    }

    const transcript = (resJson.transcript || "").trim();
    setState("idle");
    if (onResultRef.current) onResultRef.current(transcript);
  }, [endpoint, cleanupStream]);

  const start = useCallback(async (event) => {
    // If the button is in the persistent blocked state, re-surface the same
    // error toast on every press. Browsers won't re-prompt for a permanently
    // denied site, so attempting getUserMedia would just fail silently — better
    // to short-circuit and remind the user what's broken.
    if (blockedReason) {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (onErrorRef.current) onErrorRef.current(blockedReason);
      return;
    }
    if (state !== "idle") return;
    if (event && typeof event.preventDefault === "function") {
      // Block default touch behaviors (text selection, context menu) on hold.
      event.preventDefault();
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      failBlocked("no-recorder");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      failBlocked("no-recorder");
      return;
    }

    intentRef.current = true;
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        failBlocked("permission");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        failBlocked("no-mic");
      } else {
        failTransient("no-recorder");
      }
      return;
    }

    // Async-start race fix: user may have released or slid off during the
    // permission prompt / device acquisition. If intentRef cleared, release
    // the tracks we just acquired and don't start the recorder.
    if (!intentRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;
    let recorder = null;
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      // iOS / older Safari: no compatible MIME. Treat as unsupported.
      failBlocked("no-recorder");
      return;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    // CRITICAL: set onstop and the blob promise BEFORE recorder.start().
    // Both the user-release path and the MAX_RECORD_MS auto-stop need the
    // single onstop to fire and resolve the same promise. Setting onstop
    // after stop() returns inactive on some browsers — the onstop event
    // fires before the new handler is attached, and the promise hangs
    // forever.
    blobPromiseRef.current = new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        resolve(blob);
      };
    });

    try {
      recorder.start();
    } catch {
      failBlocked("no-recorder");
      return;
    }
    startTimeRef.current = Date.now();
    setState("recording");

    // Hard cap: auto-stop AND submit after MAX_RECORD_MS. The user-release
    // path drives submitRecording too — single shared code path means the
    // auto-stop is no longer a dead-end.
    maxTimerRef.current = setTimeout(() => {
      const r = recorderRef.current;
      if (r && r.state === "recording") {
        try { r.stop(); } catch { /* no-op */ }
        intentRef.current = false;
        submitRecording();
      }
    }, MAX_RECORD_MS);
  }, [state, blockedReason, failBlocked, failTransient, submitRecording]);

  const stop = useCallback(async () => {
    // If start() is still awaiting getUserMedia, clear intent so it cleans
    // up when permission resolves. Otherwise it leaks an 8s recording.
    intentRef.current = false;
    if (state !== "recording") return;
    const recorder = recorderRef.current;
    if (!recorder) {
      cleanupStream();
      setState("idle");
      return;
    }
    const elapsed = Date.now() - startTimeRef.current;
    if (elapsed < MIN_PRESS_MS) {
      // Treat as accidental tap — discard, no submission, no error.
      try { recorder.stop(); } catch { /* no-op */ }
      cleanupStream();
      setState("idle");
      return;
    }

    try { recorder.stop(); } catch { /* no-op */ }
    submitRecording();
  }, [state, cleanupStream, submitRecording]);

  const cancel = useCallback(() => {
    intentRef.current = false;
    if (state !== "recording") return;
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      try { recorder.stop(); } catch { /* no-op */ }
    }
    cleanupStream();
    setState("idle");
  }, [state, cleanupStream]);

  return { state, blockedReason, start, stop, cancel };
};
