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

| State | Visual |
|---|---|
| Idle | Mic icon in In-Store header, normal styling |
| Pressing (immediate) | Button scales down slightly, icon turns red |
| Recording | Pulse animation around the button + small "Listening…" badge |
| Released | Spinner for ~1-2s ("Transcribing…") |
| Match found | The matched item briefly highlights in its section, gets checked off, "Heard 'milk' ✓" toast (3s) |
| No match | "Heard 'foo' — not on your list" toast (4s); mic returns to idle |
| Permission denied | "Microphone access blocked. Allow mic for this site." toast (6s) |
| Mic not available | "No microphone detected on this device." toast (4s) |
| Network / Whisper failure | "Couldn't transcribe — try again or check your connection." toast (4s) |

### Press handling

Pointer events for cross-input compatibility:
- `onPointerDown` → start recording (acquire stream via `getUserMedia`, start `MediaRecorder`)
- `onPointerUp` → stop recording, send to server
- `onPointerLeave` while held → cancel recording (do not send) — matches WhatsApp's slide-off-to-cancel
- `onPointerCancel` → cancel (browser interrupts, e.g., system call)

Hard cap: 8 seconds. If user holds longer, stop automatically and submit. Short cap: 250ms. Anything shorter is treated as accidental tap (don't submit, no error).

### First-tap permission flow

Same as before: on first press, browser shows a microphone permission prompt. If granted, recording starts. If denied, the "Microphone access blocked" toast fires. We accept that we cannot bypass a Chrome state where mic is denied — but unlike v1, the user's failure mode is "explicit toast" instead of "silent fail".

## Architecture

### Frontend changes

**Modify:** `src/components/InStoreMode.js`

Re-introduce voice support with the new pattern:
- New `useHoldToTalk()` hook encapsulating MediaRecorder lifecycle + getUserMedia + audio blob assembly
- Re-introduce `findBestMatch()` (re-implement per the spec example below; the previous version was deleted in commit `310cf39`, no need to recover from git — just copy the function from this doc's "Item matching" section)
- New `handleMicPointerDown` / `handleMicPointerUp` / `handleMicPointerLeave` event handlers
- Replace the previous tap-once button with a press-and-hold button using pointer events
- Restore lightweight visual states (pulse during recording, spinner during transcription, toast on result)

**Modify:** `src/config/api.js`
Add `transcribeGroceryItem` to `ENDPOINTS`.

### Backend (n8n) changes

**Create:** workflow `Transcribe Grocery Item` (path `/transcribe_grocery_item`, POST, binary body)

Three nodes:
1. **Webhook** (`responseMode: responseNode`, `binaryData: true`, accepts `multipart/form-data`)
2. **OpenAI** (`resource: audio`, `operation: transcription`, model `whisper-1`, language hint `en`, input from upstream binary)
3. **Code** (extract `{ success: true, transcript: $json.text }`)
4. **Respond to Webhook** (CORS headers, JSON body)

**Credential reuse**: existing `0fRleFfC6atnLkWr` ("OpenAi account") — no new credential to provision.

### What stays unchanged

- Existing `shopping_progress_check` webhook handles the actual checkbox state. Voice match just calls it the same way the manual checkbox click does.
- Existing `findBestMatch` logic — substring match was fine in v1; the issue was never matching, it was permission state.
- Existing weekly items fetch — voice doesn't add new data dependencies.

## Backend contract

### Request

```
POST https://n8n-grocery.needexcelexpert.com/webhook/transcribe_grocery_item
Content-Type: multipart/form-data

audio: <binary blob, webm/opus from MediaRecorder>
```

### Response

**Success (200):**
```json
{ "success": true, "transcript": "milk" }
```

**Failure (4xx/5xx):**
```json
{ "success": false, "error": "<reason>" }
```

Where `<reason>` is one of:
- `no_audio` — multipart upload missing or empty
- `whisper_error` — OpenAI returned an error (rate limit, auth, etc.)
- `network_error` — n8n could not reach OpenAI

The frontend doesn't act on the specific error code; it just shows a generic "Couldn't transcribe" toast. The error code is for diagnostic logging only.

### Constraints

- Audio max size: 1 MB at the Webhook node level (~30 seconds of opus at typical bitrate). Reject larger to prevent abuse.
- n8n execution timeout: 10 seconds total (Whisper p95 latency for short clips is 1-2s, so 10s leaves headroom).
- No client-side rate limiting in v1.

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

### Frontend

**Unit (Jest):** `src/components/InStoreMode.findBestMatch.test.js`
- Empty transcript → null
- Exact match → returns item
- Substring match → returns longer-name item if multiple match
- Word-overlap fallback fires only when no direct substring match
- Already-checked items filtered out by caller (test the integration in handler)

**Behavioral (Playwright):** add to existing InStoreMode test setup
- Mock `MediaRecorder` and `fetch` for `/transcribe_grocery_item`
- Simulate hold-press: pointerdown → 1s wait → pointerup
- Assert recorder started + stopped, fetch hit with multipart body
- Mock 200 response with `{transcript: "Cinnamon Toast Crunch"}` → assert item gets checked off
- Mock 200 response with `{transcript: "asparagus"}` (not in list) → assert "Heard 'asparagus'" toast
- Simulate slide-off (pointerleave during hold) → assert no fetch fires

### Backend (n8n)

**Smoke test via curl** (test plan only, not automated):
```bash
curl -X POST -F "audio=@sample.webm" \
  https://n8n-grocery.needexcelexpert.com/webhook/transcribe_grocery_item
# Expected: {"success": true, "transcript": "<spoken phrase>"}
```

No fixture audio file in v2 — verify via real device once. If the workflow misbehaves later, record a clip then.

## Rollout sequence

1. **Backend first**: create + activate the n8n workflow. Smoke-test it with curl using a recorded clip.
2. **Frontend second**: implement the hold-to-talk UI + integrate with the new endpoint. Build, test, push.
3. **Behavioral verify**: Playwright test passes locally, then live-test on dev server.
4. **Deploy** via git push to main → Netlify.
5. **Real-world test**: real shopping trip; if the feature works as expected, optionally submit a new `app_feedback` entry noting the v2 success so future Claude knows the implementation is stable.

Order matters: deploying the frontend before the backend means the mic button hits a 404. Deploying the backend before the frontend just leaves the endpoint idle (fine).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Wife's Chrome still has mic stuck at "denied" | Test in incognito first to confirm it's a per-Chrome-profile issue, not a phone-level lock. If it's the profile, she'll need to clear Chrome's app data (not just site data) once. After that, the prompt fires fresh and v2 should work. |
| OpenAI rate limit / outage | "Couldn't transcribe" toast; user falls back to manual checkbox. Acceptable for v1. |
| Whisper mishears the item | Same fail-soft as bad match: shows "Heard 'X' — not on list" toast. User taps the actual checkbox. |
| n8n webhook payload size limit unknown | Test with a 30-second recording first to find the actual limit. Set Webhook node's `maxBodySize` to 5 MB explicitly. |
| MediaRecorder support varies by browser | The vast majority of modern browsers (Chrome 49+, Safari 14.1+, Firefox 25+, all major mobile) support it. If unsupported, getUserMedia errors will surface via the "no microphone" toast. |

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
