# Voice check-off v2 — server-side transcription with hold-to-talk

**Date:** 2026-04-26
**Author:** Claude Opus 4.7 (1M context) + Corey Brosam
**Replaces:** removed Web Speech API implementation (commit `310cf39`)

---

## Problem

The original voice check-off used the browser's Web Speech API (`SpeechRecognition`). It worked at first, then started failing for some users — most notably wife's Android Chrome, where the Permissions API persistently reports `denied` for the site even after she cleared site data and verified OS-level mic permission. Multiple fix attempts (error toasts → explicit `getUserMedia` request → diagnostic instrumentation) couldn't resolve the underlying browser-state issue, so the feature was removed.

The use case is real: shopping with hands full of cart/kid, saying "milk" is faster than scrolling+tapping. We want it back, but built on a more reliable foundation.

## Goal

Hands-free item check-off in In-Store Mode that:
- Works the same on every browser (no dependence on Web Speech API quirks)
- Has a press-and-hold UX that's universally familiar from messaging apps
- Fails gracefully with actionable feedback when the mic genuinely isn't available

## Non-goals (deferred to v3)

- Voice activity detection / silence-based auto-stop
- Multi-item matching ("milk and eggs" → check both)
- Streaming transcription
- Actionable "no match" toast with "add as one-off?" CTA
- Per-user rate limiting / cost monitoring
- Fallback to Web Speech API on browsers where MediaRecorder fails (let it fail loudly and we'll iterate)

## Approach: server-side Whisper, client-side matching

```
[user holds mic button in InStoreMode header]
      ↓ MediaRecorder captures opus/webm audio
[release]
      ↓ POST multipart/form-data to /webhook/transcribe_grocery_item
[n8n workflow "Transcribe Grocery Item"]
       Webhook node (binary input)
         ↓
       OpenAI node (Audio → Transcription, whisper-1)
         ↓
       Code node (extract { transcript: $json.text })
         ↓
       Respond to Webhook
[browser]
      ↓ findBestMatch(transcript, allUnchecked) — substring match
      ↓ matched? → fire shopping_progress_check (existing webhook)
      ↓ no match? → toast "Heard 'foo' — not on your list"
```

**Key design choice: server only transcribes; client matches.** The browser already has the full unchecked-items list loaded into `shoppingList.items`. Adding a server-side matching step would require the server to re-fetch that list and add another DB query — pure overhead with zero accuracy benefit. The client's substring match is good enough (we proved that in v1) and saves a roundtrip.

## Why this choice

Three alternatives were considered:

1. **Direct browser → OpenAI**: rejected. Exposes the API key client-side.
2. **clip-server endpoint** (initial proposal): rejected. Adds a new credential surface to manage. n8n already centralizes credentials and has the OpenAI integration as a first-class node.
3. **Web Speech API again** (status quo before removal): rejected. Repeated failures across multiple Chrome states, no debuggable surface.

n8n is the right home because:
- The "OpenAi account" credential (`0fRleFfC6atnLkWr`) is already configured — used by HSA Step 1/2 workflows for text embeddings.
- The native OpenAI node has a built-in "Audio Transcription" operation that handles binary input from upstream Webhook nodes.
- All other backend orchestration in this app goes through n8n; adding a Node service for one feature would diverge the architecture.
- n8n's execution history makes debugging much easier than tail-the-clip-server-logs.

## UX

### Mic button states

The button itself renders four distinct visual states. Result/error feedback comes through toasts, with the exception of *persistent* failures (mic blocked or no mic on device), which the button surfaces as a permanent alert color so the user isn't surprised on every press.

| Button visual | When |
|---|---|
| Idle | Default. Mic icon, hover-tinted background. |
| Recording | Red background, white mic, slight scale-up. Covers both the brief "press registered" moment and the active recording — no separate "pressing" frame. |
| Transcribing | Spinner replaces mic icon, tinted background. While the upload + Whisper call is in flight (1–2 s typical). |
| Blocked | Red-tinted background, alert icon (`MicOff`). Persistent — set when `navigator.permissions.query({name:'microphone'})` returns `denied` OR the device has no microphone. Tapping shows the actionable toast again. Cleared when permission flips back to `prompt`/`granted`. |

Toast feedback (transient, no separate button state):

| Outcome | Toast |
|---|---|
| Match found | `Heard "milk" — checked ✓` (success, 3 s) |
| No match | `Heard "foo" — not on your list` (info, 4 s) |
| Empty transcript | `Didn't hear anything — try again` (info, 3 s) |
| Permission denied (first time, or on every press while denied) | `Microphone access blocked. Allow mic for this site in your browser/OS settings.` (error, 6 s) |
| No mic on device | `No microphone detected on this device.` (error, 4 s) |
| Network failure | `Couldn't reach the transcription server. Check your connection.` (error, 4 s) |
| Whisper / server error | `Transcription failed — try again or tap the item to check it.` (error, 4 s) |
| MediaRecorder unsupported | `Voice check-off isn't supported on this browser.` (error, 4 s) |

The matched item does NOT briefly highlight before checking — it just gets toggled by the existing `handleToggleItem` which has its own toast. Adding a separate highlight animation is a v3 polish item.

### Press handling

Pointer events for cross-input compatibility:
- `onPointerDown` → start recording (acquire stream via `getUserMedia`, start `MediaRecorder`)
- `onPointerUp` → stop recording, send to server
- `onPointerLeave` while held → cancel recording (do not send) — matches WhatsApp's slide-off-to-cancel
- `onPointerCancel` → cancel (browser interrupts, e.g., system call)

Hard cap: 8 seconds. If user holds longer, stop automatically and submit. Short cap: 250ms. Anything shorter is treated as accidental tap (don't submit, no error).

### First-tap permission flow

On first press the browser shows a microphone permission prompt. If granted, recording starts. If denied, the "Microphone access blocked" toast fires.

Unlike v1, the component proactively queries `navigator.permissions.query({name:'microphone'})` on mount (best-effort — Firefox doesn't support the `microphone` name and Safari historically returned `prompt` regardless of true state, so failures here are silently ignored). When the query returns `denied`, the button enters the **Blocked** visual state immediately, before the user ever presses it. This is a direct response to the v1 incident where the failure mode was "tap mic, see error toast 100ms later, repeat" — surfacing the dead state up front saves the user that confusion.

We still cannot bypass a Chrome state where mic is permanently denied. The improvement is that the user's failure mode is "obvious dead button + actionable toast" rather than "silent fail".

## Architecture

### Frontend changes

**Modify:** `src/components/InStoreMode.js`

Re-introduce voice support with the new pattern:
- New `useHoldToTalk()` hook (named export, for testability) encapsulating MediaRecorder lifecycle + getUserMedia + audio blob assembly + AbortController-bounded upload + `navigator.permissions` precheck
- New `findBestMatch()` (named export — the previous v1 version was deleted in commit `310cf39`; re-implement from the "Item matching" section below)
- Press-and-hold mic button in the In-Store header using pointer events (down/up/leave/cancel)
- Four button visual states: idle, recording, transcribing, blocked. The Blocked state is persistent (red-tinted background + `MicOff` icon) and surfaces v1's stuck-permission-denied case immediately

**Create:** `src/components/InStoreMode.findBestMatch.test.js` (9 unit tests for the matcher)
**Create:** `src/components/InStoreMode.useHoldToTalk.test.js` (12 unit tests covering the state machine, async-start race, MAX_RECORD_MS auto-stop, AbortController timeout, permission precheck, and all error classifications — fully mocked, no real network or device access)

**Modify:** `src/config/api.js`
Add `transcribeGroceryItem` to `ENDPOINTS`.

### Backend (n8n) changes

**Create:** workflow `Transcribe Grocery Item` (path `/transcribe_grocery_item`, POST, binary body)

Four nodes:
1. **Webhook** v2 (`responseMode: responseNode`, `options.binaryPropertyName: "audio"`). v2 auto-detects multipart and stores files at `$binary[<formFieldName>]` — no `binaryData: true` flag needed (that option is v1-only per the n8n schema).
2. **OpenAI** v1.8 (`resource: audio`, `operation: transcribe`, `binaryPropertyName: "audio"`, language hint `en`). Hardcodes `whisper-1` for the audio→transcribe operation. **`onError: "continueRegularOutput"`** so a Whisper failure flows to the Code node instead of crashing the workflow before the Respond node fires.
3. **Code** v2 — normalizes the OpenAI output. Detects the `json.error` shape (Whisper failure path, populated by `onError: continueRegularOutput`) and emits the spec's `{success:false, error:"..."}`. Empty transcript on the success path is intentional and propagates as `{success:true, transcript:""}`.
4. **Respond to Webhook** v1.5 — JSON body, CORS headers (`*` for origin/methods/headers).

**Credential reuse**: existing `0fRleFfC6atnLkWr` ("OpenAi account") — no new credential to provision.

### What stays unchanged

- Existing `shopping_progress_check` webhook handles the actual checkbox state. Voice match just calls it the same way the manual checkbox click does (via `handleToggleItem`).
- Existing weekly items fetch — voice doesn't add new data dependencies.
- The substring/word-overlap matching strategy from v1 is preserved (re-implemented from the spec); v1's matching logic was never the problem, the permission state was.

## Backend contract

### Request

```
POST https://n8n-grocery.needexcelexpert.com/webhook/transcribe_grocery_item
Content-Type: multipart/form-data

audio: <binary blob, webm/opus from MediaRecorder>
```

### Response

**Success (HTTP 200):**
```json
{ "success": true, "transcript": "milk" }
```

`transcript` may be an empty string if Whisper returned nothing usable for the clip (silence, unrecognizable noise). The client treats empty-transcript as a "didn't hear anything" signal, not an error — same behavior as a missed voice prompt on a smart speaker.

**Failure (HTTP 200 with `success: false`, OR HTTP 5xx):**
```json
{ "success": false, "error": "no_audio" }
```

Where `error` is one of:
- `no_audio` — multipart upload missing the `audio` field, or the file was zero-length
- `whisper_error` — OpenAI returned an error (rate limit, auth, invalid file format)
- `internal_error` — anything else (n8n node failure, unexpected response shape)

The Code node in the workflow is responsible for normalizing `whisper_error`/`no_audio` into this shape. Anything that crashes the workflow before the Respond node fires will surface as HTTP 5xx (with the Webhook node's `onError: "continueRegularOutput"` guaranteeing a response is always sent).

**Client-side handling:** The frontend doesn't branch on the specific error code — it shows a generic "Couldn't transcribe" toast for all `success: false` responses and a separate "network" toast for HTTP-level failures (timeout, 5xx, fetch reject). The `error` field is for diagnostic logging in n8n's execution history only.

### Constraints

- **Audio max size: NOT enforced at the Webhook node in v2.** n8n's Webhook node v2 has no built-in size cap option; enforcing one requires setting `N8N_PAYLOAD_SIZE_MAX` instance-wide (which would affect every workflow). Client-side, the 8-second `MAX_RECORD_MS` cap and opus's ~32 kbit/s bitrate keep typical uploads well under 100 KB. Abuse vector (someone replaying the URL with large files) is acknowledged and accepted for v1 — see "Risks & mitigations" below.
- **n8n workflow execution timeout: 30 seconds** (instance default). Whisper p95 latency for short clips is 1–2 s, so this leaves ample headroom. The client-side fetch wraps the call in a 15-second `AbortController` so a stalled n8n doesn't leave the user staring at a spinner.
- **No client-side rate limiting in v1.** Each press triggers a fresh request; no debounce on rapid press cycles other than the natural press-and-release human pacing.

## Item matching (client-side, unchanged from v1)

```js
const findBestMatch = (transcript, uncheckedItems) => {
  if (!transcript) return null;
  const t = transcript.toLowerCase().trim();
  // 1. Sort by length descending so "almond milk" beats "milk" if both present
  const byLength = [...uncheckedItems].sort(
    (a, b) => b.ItemName.length - a.ItemName.length
  );
  // 2. Direct substring (in either direction)
  for (const item of byLength) {
    const name = item.ItemName.toLowerCase();
    if (t.includes(name) || name.includes(t)) return item;
  }
  // 3. Word-overlap fallback (any 3+ char word from transcript appears in name)
  const words = t.split(/\s+/).filter((w) => w.length >= 3);
  for (const item of uncheckedItems) {
    const name = item.ItemName.toLowerCase();
    if (words.some((w) => name.includes(w))) return item;
  }
  return null;
};
```

Edge cases:
- Empty transcript → return null → "Didn't hear anything" toast
- Transcript matches an already-checked item → no-op (filtered out by passing only `allUnchecked`)
- Transcript matches multiple items → returns the longest-name match (deterministic)
- Transcript with non-English noise (e.g., "ums") → likely no match → "Heard 'um' — not on your list" toast (acceptable)

## Tests

### Frontend (Jest, fully automated, checked-in)

**`src/components/InStoreMode.findBestMatch.test.js`** — 9 tests:
- Empty / null / undefined / whitespace-only transcript → null
- Empty / null / undefined item list → null (defensive)
- No match → null
- Exact match (case-insensitive)
- Longer name wins when both substring-match
- Reverse-substring (transcript contains item name)
- Word-overlap fallback (only fires when direct substring path misses)
- Two-character word ignored by word-overlap (no false positives)
- Multi-item phrase ("milk and eggs") matches the first contained item

**`src/components/InStoreMode.useHoldToTalk.test.js`** — 12 tests using `renderHook` from `@testing-library/react`. Mocks: `MediaRecorder`, `getUserMedia`, `navigator.permissions.query`, `fetch`. No real network or device access.
- Happy path: press → hold → release → fetch fires with multipart body, onResult called with transcript
- Empty transcript: `success:true, transcript:""` → onResult called with `""` (caller decides UX)
- MIN_PRESS_MS guard: release in <250ms → no fetch, no error
- Slide-off cancel: pointer leaves while held → no fetch, recorder stopped, stream released
- Async-start race: pointerup BEFORE getUserMedia resolves → recorder never constructed, stream released, no fetch
- MAX_RECORD_MS auto-stop: hold past 8s → recorder auto-stops AND submission fires (regression test for the v1 review's "stuck spinner" bug)
- Permission precheck: `navigator.permissions.query` returns `denied` → `blockedReason === "permission"` set on mount
- Press while blocked: onError fired with the same reason, no recorder built, no permission re-prompt
- `getUserMedia` rejects `NotAllowedError` → `blockedReason === "permission"`
- `getUserMedia` rejects `NotFoundError` → `blockedReason === "no-mic"`
- Missing `MediaRecorder` global → `blockedReason === "no-recorder"`
- Network failure (`fetch` throws) → `onError("network")`, state idle, NOT blocked
- Server `success: false` → `onError("server")`, state idle
- Server HTTP 5xx → `onError("server")`

### Backend (n8n)

**Smoke test via curl** (manual, after workflow activation):

Negative path:
```bash
curl -s -X POST "https://n8n-grocery.needexcelexpert.com/webhook/transcribe_grocery_item"
# Expected: {"success":false,"error":"no_audio"}
```

Positive path (requires a recorded clip):
```bash
curl -s -X POST -F "audio=@sample.webm" \
  "https://n8n-grocery.needexcelexpert.com/webhook/transcribe_grocery_item"
# Expected: {"success":true,"transcript":"<spoken phrase>"}
```

No fixture audio file in v2 — verify via real device once. If the workflow misbehaves later, record a clip then.

## Rollout sequence

1. **Backend first**: create + activate the n8n workflow. Smoke-test the negative path (no body → `{success:false, error:"no_audio"}`).
2. **Frontend code**: add the endpoint constant, `findBestMatch`, the `useHoldToTalk` hook, and the mic button. Each is a separate commit; each leaves the build green.
3. **Automated tests**: `findBestMatch` (9 tests) and `useHoldToTalk` (12 tests) pass under `CI=true npm test`. Don't push if either suite fails.
4. **Deploy** via git push to main → Netlify auto-deploys.
5. **Real-world test**: real shopping trip; if the feature works as expected, optionally submit a new `app_feedback` entry noting the v2 success so future Claude knows the implementation is stable.

Order matters: deploying the frontend before the backend means the mic button hits a 404. Deploying the backend before the frontend just leaves the endpoint idle (fine).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Wife's Chrome still has mic stuck at "denied" | The mount-time `navigator.permissions.query` makes the dead state visible (button shows MicOff in alert color) instead of letting her tap-and-fail repeatedly. If she still hits the stuck state: test in incognito to confirm it's per-profile not phone-level, then clear Chrome's app data (not just site data) once. After that the prompt fires fresh and v2 should work. |
| OpenAI rate limit / outage | "Couldn't transcribe" toast; user falls back to manual checkbox. Acceptable for v1. |
| Whisper mishears the item | Same fail-soft as bad match: shows "Heard 'X' — not on list" toast. User taps the actual checkbox. |
| Endpoint URL leaks via JS bundle (it will — it's in the React app) → free Whisper transcription for whoever finds it | Acknowledged for v1. Worst-case spend at $0.006/min is small relative to OpenAI quota. v3: add an HMAC or short-lived signed token, or move the endpoint behind an authenticated path. |
| Audio uploads larger than typical (e.g., someone replaying the URL with a long file) | No Webhook-level cap in v2. Mitigated by the client-side 8-second `MAX_RECORD_MS` cap on the legitimate path; abuse path is accepted. Track for v3 with the URL-leak risk above. |
| MediaRecorder support varies by browser | The vast majority of modern browsers (Chrome 49+, Safari 14.1+, Firefox 25+, all major mobile) support it. If unsupported, hook returns `error: "no-recorder"` and the button enters Blocked state with the "Voice check-off isn't supported on this browser" toast. |
| n8n stalls (Whisper queue, network blip) | 15-second `AbortController` timeout on the client. After abort, "Couldn't reach the transcription server" toast fires; button returns to idle. No stuck-spinner state. |

## Cost

OpenAI Whisper-1 is **$0.006 per minute** of audio, billed by the second.

Conservative estimate for typical use:
- 5-second clip per check → $0.0005
- 50 checks per shopping trip → $0.025
- Weekly trips → ~$0.10/month per user

Negligible. No cost monitoring needed for v1.

## Open questions

None blocking. Implementation can begin once this design is approved.

## Decisions deferred (to be made during plan/implementation)

- Whether to add a "Heard 'foo' — add as one-off?" actionable toast (probably yes, but separate from the v2 core)
- Whether to surface a "tap and hold" hint on first use (onboarding tooltip)
- Whether the press-and-hold button should occupy the same header position or move (probably same)
