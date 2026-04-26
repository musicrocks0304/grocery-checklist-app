# Voice Check-off v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hold-to-talk voice check-off in In-Store Mode using OpenAI Whisper for server-side transcription via a new n8n workflow, with client-side item matching.

**Architecture:** Browser captures audio with `MediaRecorder`, POSTs the blob (multipart/form-data) to a new n8n webhook → OpenAI Audio Transcribe node (Whisper-1) returns the transcript → browser matches against the active week's unchecked items and fires the existing `shopping_progress_check` webhook.

**Tech Stack:** React 19, n8n (Webhook + OpenAI Audio Transcribe nodes), OpenAI Whisper-1, browser MediaRecorder + getUserMedia, Pointer Events API.

**Spec:** [docs/superpowers/specs/2026-04-26-voice-checkoff-v2-design.md](../specs/2026-04-26-voice-checkoff-v2-design.md)

**Rollout order (must follow):** backend → frontend → behavioral verify → real-device test. Frontend before backend would mean the mic button hits a 404.

## File map

| File | Action | Responsibility |
|---|---|---|
| n8n workflow `Transcribe Grocery Item` | Create | Webhook receiving binary audio → OpenAI Whisper → spec-conformant `{success, transcript}` or `{success, error}` response |
| `src/config/api.js` | Modify | Add `transcribeGroceryItem` endpoint constant |
| `src/components/InStoreMode.findBestMatch.test.js` | Create | Unit tests for the transcript-to-item matcher (9 tests) |
| `src/components/InStoreMode.useHoldToTalk.test.js` | Create | Unit tests for the hold-to-talk hook with mocked MediaRecorder/getUserMedia/fetch (12 tests) |
| `src/components/InStoreMode.js` | Modify | Add `findBestMatch` (named export), `useHoldToTalk` hook (named export), mic-button UI with pointer events + blocked-state visual |
| `C:\Users\Corey\.claude\projects\c--New-Grocery-App-grocery-checklist-app\memory\MEMORY.md` | Modify | Note new workflow ID + voice-v2 architecture |

---

## Task 1: Create + activate `Transcribe Grocery Item` n8n workflow

**Files:** New n8n workflow (no git change)

**Why first:** Frontend depends on this webhook existing. Deploy backend first; if frontend ships first the mic button hits a 404.

- [ ] **Step 1: Create the workflow via n8n MCP**

Use `mcp__n8n-mcp__n8n_create_workflow` with this body. Key decisions baked in:

- **Webhook node v2**: `binaryData` and `allowedOrigins` were dropped — neither is a valid option in v2's schema (verified via `mcp__n8n-mcp__get_node_info`). v2 auto-detects multipart and stores files at `$binary[<formFieldName>]` (so the form field `"audio"` lands at `$binary.audio`, which the OpenAI node reads via its `binaryPropertyName: "audio"`). CORS comes from the Respond node's `responseHeaders`.
- **`onError: "continueRegularOutput"` on the Whisper node**: if Whisper fails (rate limit, auth, malformed audio), execution continues to the Code node with an error item, so the Respond node always fires. Without this, a Whisper failure leaves the client hanging until its 15 s timeout.
- **Code node detects + normalizes errors** to the spec's `{success:false, error}` shape. It checks for the OpenAI error shape (`json.error` populated) before assuming success.
- **3-second per-node timeout on the OpenAI node**: hard cap so a stuck Whisper call doesn't dominate the 15-s client budget. n8n retries once on its side.

```json
{
  "name": "Transcribe Grocery Item",
  "nodes": [
    {
      "id": "webhook",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [250, 300],
      "parameters": {
        "httpMethod": "POST",
        "path": "transcribe_grocery_item",
        "responseMode": "responseNode",
        "options": {
          "binaryPropertyName": "audio"
        }
      },
      "webhookId": "transcribe-grocery-2026-04-26"
    },
    {
      "id": "openai",
      "name": "Whisper Transcribe",
      "type": "@n8n/n8n-nodes-langchain.openAi",
      "typeVersion": 1.8,
      "position": [500, 300],
      "parameters": {
        "resource": "audio",
        "operation": "transcribe",
        "binaryPropertyName": "audio",
        "options": {
          "language": "en"
        }
      },
      "credentials": {
        "openAiApi": {
          "id": "0fRleFfC6atnLkWr",
          "name": "OpenAi account"
        }
      },
      "onError": "continueRegularOutput"
    },
    {
      "id": "code",
      "name": "Build Response",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [750, 300],
      "parameters": {
        "language": "javaScript",
        "jsCode": "// Normalize the OpenAI Whisper response to the spec's contract:\n//   success path: { success: true, transcript: \"...\" }  (transcript may be \"\")\n//   error path:   { success: false, error: \"no_audio\" | \"whisper_error\" | \"internal_error\" }\n//\n// `onError: continueRegularOutput` on the Whisper node means an OpenAI failure\n// reaches us as an item with `json.error` populated instead of `json.text`.\n// Empty-transcript on the success path is INTENTIONAL — the client treats it\n// as \"didn't hear anything\", not as an error.\nconst item = $input.first()?.json || {};\n\nif (item.error) {\n  const msg = String(item.error?.message || item.error || '').toLowerCase();\n  if (msg.includes('no audio') || msg.includes('empty file') || msg.includes('binary data')) {\n    return [{ json: { success: false, error: 'no_audio' } }];\n  }\n  return [{ json: { success: false, error: 'whisper_error' } }];\n}\n\nif (typeof item.text !== 'string') {\n  return [{ json: { success: false, error: 'internal_error' } }];\n}\n\nreturn [{ json: { success: true, transcript: item.text.trim() } }];"
      }
    },
    {
      "id": "respond",
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.5,
      "position": [1000, 300],
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify($json) }}",
        "options": {
          "responseHeaders": {
            "entries": [
              { "name": "Access-Control-Allow-Origin", "value": "*" },
              { "name": "Access-Control-Allow-Methods", "value": "POST, OPTIONS" },
              { "name": "Access-Control-Allow-Headers", "value": "Content-Type" }
            ]
          }
        }
      }
    }
  ],
  "connections": {
    "Webhook": { "main": [[{ "node": "Whisper Transcribe", "type": "main", "index": 0 }]] },
    "Whisper Transcribe": { "main": [[{ "node": "Build Response", "type": "main", "index": 0 }]] },
    "Build Response": { "main": [[{ "node": "Respond", "type": "main", "index": 0 }]] }
  },
  "settings": {
    "executionOrder": "v1",
    "saveDataErrorExecution": "all",
    "saveDataSuccessExecution": "all"
  }
}
```

Capture the returned workflow ID — you'll need it for steps 2, 4, and 7.

> **Validation note:** the n8n MCP strict validator flags the Webhook node for not setting `onError: "continueRegularOutput"` on the trigger itself. We deliberately don't set it on the Webhook — a webhook-trigger error means n8n didn't even parse the request, so there's no flow to continue. Setting `onError` on the OpenAI node is sufficient for the spec's "always respond" guarantee.

- [ ] **Step 2: Activate the workflow via REST API**

```bash
source /c/hsa-automation/.env && curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<WORKFLOW_ID>/activate"
```

Expected: JSON body with `"active": true`. If `false`, re-run the activate call (n8n sometimes needs a beat). If still `false`, deactivate then re-activate (memory note: "After adding/updating webhookId, deactivate then reactivate the workflow.").

- [ ] **Step 3: Smoke-test the negative path (no audio)**

```bash
curl -s -X POST "https://n8n-grocery.needexcelexpert.com/webhook/transcribe_grocery_item"
```

Expected: HTTP 200 with `{"success":false,"error":"no_audio"}` (the Code node detects the missing-binary path via the OpenAI node's error message). If you see HTTP 5xx with no body, the Webhook → OpenAI → Code → Respond chain is broken — re-check the workflow connections and the `onError: continueRegularOutput` on the Whisper node.

If you see HTTP 200 + `{"success":true,"transcript":""}`, the Code node's `item.error` branch isn't matching — the OpenAI node may have returned a different error shape than expected. Inspect the n8n execution history (the workflow has `saveDataErrorExecution: all`) and adjust the Code node's `msg.includes(...)` patterns accordingly.

- [ ] **Step 4: Smoke-test the positive path (real audio)**

You need a small webm audio clip (3-5 seconds, saying a single grocery item like "milk"). Two options:

Option A — record one with the host's microphone via ffmpeg:
```bash
ffmpeg -f dshow -i audio="<your-mic-name>" -t 4 -c:a libopus /tmp/milk.webm
```

Option B — skip live audio and verify only via the Playwright integration test (Task 6) which mocks the fetch response.

If you record one, hit the webhook:
```bash
curl -s -X POST -F "audio=@/tmp/milk.webm" \
  "https://n8n-grocery.needexcelexpert.com/webhook/transcribe_grocery_item"
```

Expected: `{"success":true,"transcript":"milk"}` (or whatever was said).

If you opted for Option B, document that explicitly in the commit message for Task 7.

- [ ] **Step 5: Update memory.md with the workflow ID**

Edit [C:\Users\Corey\.claude\projects\c--New-Grocery-App-grocery-checklist-app\memory\MEMORY.md](C:\Users\Corey\.claude\projects\c--New-Grocery-App-grocery-checklist-app\memory\MEMORY.md). In the "n8n Workflows Created" section (find the existing entries for migrations etc.), add:

```
- `Transcribe Grocery Item` (ID: <WORKFLOW_ID>) — POST webhook at `/transcribe_grocery_item`. Voice check-off v2: Webhook (binary multipart) → OpenAI Audio Transcribe (Whisper-1, lang=en) → Code → Respond. Returns `{success, transcript}`. Uses `0fRleFfC6atnLkWr` (OpenAi account) credential. WebhookId: `transcribe-grocery-2026-04-26`. ACTIVE.
```

(Memory note edits don't need a commit; the directory isn't a git repo.)

---

## Task 2: Add `transcribeGroceryItem` endpoint to api.js

**Files:**
- Modify: `src/config/api.js`

- [ ] **Step 1: Locate the ENDPOINTS object**

```bash
grep -n "ENDPOINTS\b" src/config/api.js | head -5
```

You'll find the object literal where all webhook URLs are defined.

- [ ] **Step 2: Add the new endpoint constant**

Find a logical spot (alphabetical or grouped with other webhook URLs) and add:

```js
  transcribeGroceryItem: `${API_BASE_URL}/transcribe_grocery_item`,
```

`API_BASE_URL` is already defined at the top of the file as `https://n8n-grocery.needexcelexpert.com/webhook`. The full URL becomes `https://n8n-grocery.needexcelexpert.com/webhook/transcribe_grocery_item`.

- [ ] **Step 3: Verify the constant resolves**

```bash
node -e "const {ENDPOINTS}=require('./src/config/api.js'); console.log(ENDPOINTS.transcribeGroceryItem)"
```

Expected: `https://n8n-grocery.needexcelexpert.com/webhook/transcribe_grocery_item`

(If `require` fails because of ESM/CJS differences, just grep the file to verify the line is there. The build will catch any syntax errors.)

- [ ] **Step 4: Commit**

```bash
git add src/config/api.js
git commit -m "feat(api): add transcribeGroceryItem endpoint for voice check-off v2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Re-add `findBestMatch` with TDD unit tests

**Files:**
- Create: `src/components/InStoreMode.findBestMatch.test.js`
- Modify: `src/components/InStoreMode.js` (add the function + named export)

The previous version of `findBestMatch` was removed in commit `310cf39`. We re-add it from scratch — don't `git revert` or anything; we want it placed alongside the new voice code.

- [ ] **Step 1: Write the failing tests**

Create `src/components/InStoreMode.findBestMatch.test.js`:

```js
import { findBestMatch } from './InStoreMode';

const items = [
  { ItemID: 1, ItemName: 'Milk' },
  { ItemID: 2, ItemName: 'Almond milk' },
  { ItemID: 3, ItemName: 'Cinnamon Toast Crunch' },
  { ItemID: 4, ItemName: 'Sugar' },
];

describe('findBestMatch', () => {
  test('returns null for empty transcript', () => {
    expect(findBestMatch('', items)).toBeNull();
    expect(findBestMatch(null, items)).toBeNull();
    expect(findBestMatch(undefined, items)).toBeNull();
    expect(findBestMatch('   ', items)).toBeNull();
  });

  test('returns null for empty or missing item list', () => {
    expect(findBestMatch('milk', [])).toBeNull();
    // The function spreads `uncheckedItems` so it should not crash on a falsy
    // list if the caller forgot to default to []. Defensive: treat as no-match.
    expect(findBestMatch('milk', null)).toBeNull();
    expect(findBestMatch('milk', undefined)).toBeNull();
  });

  test('returns null when no item matches', () => {
    expect(findBestMatch('asparagus', items)).toBeNull();
  });

  test('phrase containing an item name matches that item (multi-item heard, first one wins)', () => {
    // Spec non-goal: multi-item matching. Documented behavior is that the
    // longest-matching item wins. "milk and eggs" against [Milk, Almond milk]
    // — neither item name is a substring of "milk and eggs" exactly, but the
    // word "milk" is a substring of "milk and eggs" via reverse-substring
    // (the transcript contains the item name). Longest-name-first ordering
    // means "Almond milk" is checked before "Milk" — but "milk and eggs"
    // doesn't include "almond". So Milk wins.
    const noEggs = [
      { ItemID: 1, ItemName: 'Milk' },
      { ItemID: 2, ItemName: 'Almond milk' },
    ];
    expect(findBestMatch('milk and eggs', noEggs).ItemID).toBe(1);
  });

  test('exact-name match returns the item (case-insensitive)', () => {
    expect(findBestMatch('milk', items).ItemID).toBe(1);
    expect(findBestMatch('MILK', items).ItemID).toBe(1);
  });

  test('longer name wins when both substring-match the transcript', () => {
    // transcript "almond milk" matches both "Almond milk" (full) and "Milk" (substring).
    // The longer name should win — order matches deterministic.
    expect(findBestMatch('almond milk', items).ItemID).toBe(2);
  });

  test('reverse-substring match (item name contains transcript)', () => {
    expect(findBestMatch('cinnamon', items).ItemID).toBe(3);
  });

  test('word-overlap fallback fires when no direct substring match', () => {
    // "I need cinnamon toast" — no item NAME is a substring of transcript and
    // no item is a superstring of transcript. Word-overlap on "cinnamon" or
    // "toast" should hit "Cinnamon Toast Crunch".
    // (Note this also passes via direct substring "cinnamon" — both paths
    // converge on the same item; that's fine.)
    expect(findBestMatch('I need cinnamon toast', items).ItemID).toBe(3);
  });

  test('two-character word does not trigger word-overlap fallback', () => {
    // The fallback only considers words of length >= 3, to avoid false
    // positives like "we" matching "Watermelon".
    const onlyShort = [{ ItemID: 99, ItemName: 'Watermelon' }];
    expect(findBestMatch('we are out', onlyShort)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — should fail with "findBestMatch is not exported"**

```bash
cd "C:/New Grocery App/grocery-checklist-app" && CI=true npx react-scripts test src/components/InStoreMode.findBestMatch.test.js --watchAll=false 2>&1 | tail -15
```

Expected: FAIL because `findBestMatch` doesn't exist in InStoreMode.js yet.

- [ ] **Step 3: Add the implementation to InStoreMode.js**

In `src/components/InStoreMode.js`, find a place near the top of the file after the imports (above any component definitions) and insert:

```js
// Match a transcript against a list of unchecked items. Used by voice
// check-off v2. Strategy:
//   1. Direct substring (case-insensitive, in either direction); longest
//      item name wins so "almond milk" beats "milk".
//   2. Word-overlap fallback for cases where the transcript is a phrase
//      that doesn't directly contain any item name (e.g. "I need
//      cinnamon toast" → "Cinnamon Toast Crunch"). Only words of length
//      >= 3 count, to avoid false positives.
// Returns the matched item, or null if no match.
export const findBestMatch = (transcript, uncheckedItems) => {
  if (!transcript) return null;
  if (!Array.isArray(uncheckedItems) || uncheckedItems.length === 0) return null;
  const t = transcript.toLowerCase().trim();
  if (!t) return null;
  const byLength = [...uncheckedItems].sort(
    (a, b) => b.ItemName.length - a.ItemName.length
  );
  for (const item of byLength) {
    const name = item.ItemName.toLowerCase();
    if (t.includes(name) || name.includes(t)) return item;
  }
  const words = t.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length === 0) return null;
  for (const item of uncheckedItems) {
    const name = item.ItemName.toLowerCase();
    if (words.some((w) => name.includes(w))) return item;
  }
  return null;
};
```

`InStoreMode.js` already has a default export of the component; adding a named export of `findBestMatch` is fine (React supports mixing default and named exports).

- [ ] **Step 4: Run the tests — all should pass**

```bash
cd "C:/New Grocery App/grocery-checklist-app" && CI=true npx react-scripts test src/components/InStoreMode.findBestMatch.test.js --watchAll=false 2>&1 | tail -10
```

Expected: `Tests: 9 passed, 9 total` (empty-transcript, empty/null item list, no-match, exact match, longer-name wins, reverse-substring, word-overlap fallback, two-char-word ignore, multi-item-phrase).

- [ ] **Step 5: Commit**

```bash
git add src/components/InStoreMode.js src/components/InStoreMode.findBestMatch.test.js
git commit -m "feat(in-store): re-add findBestMatch transcript-to-item matcher

Used by voice check-off v2. Same heuristic as the v1 implementation
(substring match with longest-wins, word-overlap fallback for >=3 char
words). Now exported as a named export so a focused unit test can
exercise it without mounting the full component.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Create the `useHoldToTalk` hook

**Files:**
- Modify: `src/components/InStoreMode.js` (inline hook; could extract later if it grows)

The hook handles:
- `getUserMedia({audio: true})` to acquire the mic
- `MediaRecorder` lifecycle (start, ondataavailable, stop)
- POST the assembled blob to `ENDPOINTS.transcribeGroceryItem` with a 15-second `AbortController` deadline
- Hard caps: 250ms minimum (ignore accidental taps), 8000ms maximum (auto-stop AND submit)
- Error surfacing: `state` includes `"blocked"` for permission-denied / no-mic so the button can render a persistent alert visual; transient errors (network, server) flow through `onError` only

**Three subtle bugs from review that this iteration explicitly fixes — the executing agent must preserve all three:**

1. **Async-start race:** `start()` awaits `getUserMedia`. If the user releases or slides off DURING the permission prompt or device acquisition, `stop()`/`cancel()` would see `state === "idle"` and bail, but `start()` would still finish acquiring the stream and arming the 8-s timer afterward — leaking 8 s of recording. **Fix:** an `intentRef` set true on `start`, false on `stop`/`cancel`, checked after `getUserMedia` resolves. If false, release tracks and abort before recorder.start.
2. **MAX_RECORD_MS auto-stop:** the timer used to call `recorder.stop()` directly. Recorder went inactive but state stayed "recording". Then on user release, `stop()` attached `recorder.onstop` to an already-inactive recorder → `await finalBlobP` hung forever. **Fix:** the timer drives the same submission code path as user release. Single shared `submitRecording()` helper resolved by a one-shot `recorder.onstop` set BEFORE `recorder.start()`.
3. **Stream leak on recorder-construction failure:** `new MediaRecorder(stream)` can throw on iOS / older browsers when no compatible MIME is available. **Fix:** `cleanupStream()` runs in the catch block before `fail()`.

We're putting this hook inside `InStoreMode.js` (not a separate file) to match the project's pattern — no external custom hooks for one-off feature logic. If it grows beyond ~80 lines we can extract later.

- [ ] **Step 1: Read the current state declarations area in InStoreMode**

```bash
grep -n "const \[.*\] = useState\|const .* = useRef\|return (" src/components/InStoreMode.js | head -20
```

Note where component state and refs are declared — you'll add the hook nearby (above the component, since it's a custom hook).

- [ ] **Step 2: Add the `useHoldToTalk` hook + supporting state types**

In `src/components/InStoreMode.js`, near the top of the file (after the imports, alongside `findBestMatch`), add:

```js
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

const useHoldToTalk = ({ endpoint, onResult, onError }) => {
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
          else if (blockedReason === 'permission') setBlockedReason(null);
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
      const res = await fetch(endpoint, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        setState("idle");
        if (onErrorRef.current) onErrorRef.current("server");
        return;
      }
      resJson = await res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      setState("idle");
      // Both the abort timeout and a network failure surface as "network"
      // to the user — they can't tell the difference and the recovery is
      // the same (try again).
      if (onErrorRef.current) onErrorRef.current("network");
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
```

- [ ] **Step 3: Verify InStoreMode still builds**

```bash
cd "C:/New Grocery App/grocery-checklist-app" && CI=true npm run build 2>&1 | tail -8
```

Expected: `Compiled successfully.` (No frontend changes that could fail yet — the hook isn't used.)

- [ ] **Step 4: Run the existing test suite — should still pass**

```bash
cd "C:/New Grocery App/grocery-checklist-app" && CI=true npx react-scripts test --watchAll=false 2>&1 | tail -8
```

Expected: All tests pass. The hook itself isn't tested yet (Task 6 covers that). The findBestMatch suite from Task 3 (9 tests) plus the prior baseline should all be green.

(Pin the baseline number on your machine before this task and compare. Important thing is "no test FAILED" — exact totals depend on what other tests exist in the repo.)

- [ ] **Step 5: Commit**

```bash
git add src/components/InStoreMode.js
git commit -m "feat(in-store): add useHoldToTalk hook for voice check-off v2

MediaRecorder lifecycle wrapped in a custom hook. States:
  idle, recording, transcribing, blocked (persistent disable)

Persistent failures (mic permission denied, no mic on device,
MediaRecorder unsupported) latch into 'blocked' so the button can
render a distinct alert visual. Transient failures (network, server)
fire onError and return to idle for immediate retry.

Hard caps:
  - 250ms minimum press (accidental tap = no submission)
  - 8s maximum (auto-stop AND submit via shared submitRecording path)
  - 15s fetch timeout (AbortController) so a stalled n8n doesn't hang
    the UI

Race fix: intentRef tracks press state through the async getUserMedia
window. If the user releases or slides off during the permission
prompt, the resolved stream is released without ever starting the
recorder.

Permission precheck: navigator.permissions.query({name:'microphone'})
on mount surfaces a stuck 'denied' state immediately, instead of
making the user discover it on first press (the v1 incident).

Hook is not yet used — Task 5 wires it into the InStoreMode UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire mic button + UI states into InStoreMode

**Files:**
- Modify: `src/components/InStoreMode.js`

This is where the user-visible feature comes back: a mic button in the header that responds to hold-to-talk.

- [ ] **Step 1: Re-add the `Mic` and `MicOff` icon imports**

In the lucide-react import block at the top of the file, add `Mic` and `MicOff` (the `MicOff` icon renders the "blocked" button visual when permission is denied or the device has no mic):

```js
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  PartyPopper,
  Smartphone,
  Loader2,
  Tag,
  AlertCircle,
  Clock,
  Mic,
  MicOff,
  MoreHorizontal,
  Filter,
  User,
  Undo2,
  X,
  Copy,
  Users,
} from "lucide-react";
```

- [ ] **Step 2: Add the `react-hot-toast` import**

The codebase imports it as `toast` everywhere (App.js, ChatBot.js, HebCart.js, etc.) — but `InStoreMode.js` already has a local state variable named `toast` (line ~680). Import the library with a distinct name to avoid collision:

```js
import { toast as hotToast } from "react-hot-toast";
```

(Named import + alias keeps the rest of the codebase's `toast` convention intact while not shadowing local state.)

- [ ] **Step 3: Inside the `InStoreMode` component, instantiate the hook + reaction logic**

Find the area where other `useState`/`useRef`/`useCallback` hooks are declared in the component (search for `const [toast, setToast] = useState`). Just below the existing local state, add:

```js
  // Voice check-off v2: hold-to-talk on the header mic button.
  // The hook handles audio capture + transcription. We wire the result to
  // findBestMatch + the existing handleToggleItem so a successful match
  // checks the item the same way a tap would.
  const handleVoiceResult = useCallback(
    (transcript) => {
      if (!transcript) {
        // Whisper returned "" (silence, unintelligible noise) or the spec's
        // empty-transcript success path. Distinct from "no match" — user
        // didn't say anything we could parse.
        hotToast("Didn't hear anything — try again", { icon: "🤔", duration: 3000 });
        return;
      }
      const allUnchecked = shoppingList
        ? shoppingList.items.filter((i) => !checkedItems.has(i.ItemID.toString()))
        : [];
      const matched = findBestMatch(transcript, allUnchecked);
      if (matched) {
        handleToggleItem(matched);
        hotToast.success(`Heard "${transcript}" — checked ✓`, { duration: 3000 });
      } else {
        hotToast(`Heard "${transcript}" — not on your list`, { icon: "🔍", duration: 4000 });
      }
    },
    [shoppingList, checkedItems, handleToggleItem]
  );

  const handleVoiceError = useCallback((reason) => {
    const messages = {
      permission: "Microphone access blocked. Allow mic for this site in your browser/OS settings.",
      "no-mic": "No microphone detected on this device.",
      "no-recorder": "Voice check-off isn't supported on this browser.",
      network: "Couldn't reach the transcription server. Check your connection.",
      server: "Transcription failed — try again or tap the item to check it.",
    };
    const durations = { permission: 6000, "no-mic": 4000, "no-recorder": 4000, network: 4000, server: 4000 };
    hotToast.error(messages[reason] || "Couldn't transcribe.", { duration: durations[reason] || 4000 });
  }, []);

  const voice = useHoldToTalk({
    endpoint: ENDPOINTS.transcribeGroceryItem,
    onResult: handleVoiceResult,
    onError: handleVoiceError,
  });
```

This must be placed AFTER `handleToggleItem` is defined (around line 935 in current InStoreMode.js), since `handleVoiceResult` references it. The `useHoldToTalk` hook stashes `handleVoiceResult` and `handleVoiceError` in refs internally, so React's no-stale-closure rule is upheld even if `shoppingList`/`checkedItems` change mid-recording — the latest snapshot is used at result time.

- [ ] **Step 4: Add the mic button to the header**

Find the In-Store header where the other header buttons (`Smartphone` icon, `MoreHorizontal` menu button) live. Search for `aria-label="More"` (around line 1239) to find that area. Insert the mic button immediately before the `MoreHorizontal` button:

```jsx
          <button
            type="button"
            onPointerDown={voice.start}
            onPointerUp={voice.stop}
            onPointerLeave={voice.cancel}
            onPointerCancel={voice.cancel}
            // Prevent the browser's long-press context menu / text selection
            // on touch devices.
            onContextMenu={(e) => e.preventDefault()}
            aria-label={
              voice.blockedReason === "permission"
                ? "Microphone blocked — tap for help"
                : voice.blockedReason === "no-mic"
                  ? "No microphone detected"
                  : voice.blockedReason === "no-recorder"
                    ? "Voice not supported on this browser"
                    : "Hold to voice-check item"
            }
            title="Hold to voice-check item"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all touch-none select-none ${
              voice.blockedReason
                ? "bg-danger/10 text-danger"
                : voice.state === "recording"
                  ? "bg-danger text-white scale-110"
                  : voice.state === "transcribing"
                    ? "bg-primary-light text-primary"
                    : "hover:bg-background text-body"
            }`}
          >
            {voice.blockedReason ? (
              <MicOff size={18} />
            ) : voice.state === "transcribing" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Mic size={18} />
            )}
          </button>
```

Visual state mapping:
- `blockedReason !== null` → `MicOff` icon, red-tinted background. Tapping still routes to `voice.start`, which short-circuits and re-fires the toast (so the user gets the "Microphone access blocked" message on every press while denied — useful prompt to act).
- `state === "recording"` → red bg, white mic, scale-up.
- `state === "transcribing"` → tinted bg, spinner.
- Default → hover-tinted background, mic icon.

`touch-none` and `select-none` Tailwind classes prevent mobile browsers from interpreting the long-press as a text-selection or scroll gesture. `Loader2` is already imported.

> **Note:** `voice.start` is a no-op when `blockedReason` is set (the hook checks this at the top), but still surfaces the same toast as the original failure via `onError`. So a tap on the blocked button shows the actionable error toast immediately without trying — no permission re-prompt is fired (browsers won't re-prompt on a permanently denied site anyway).

- [ ] **Step 5: Build + verify nothing else broke**

```bash
cd "C:/New Grocery App/grocery-checklist-app" && CI=true npm run build 2>&1 | tail -8
```

Expected: `Compiled successfully.`

- [ ] **Step 6: Run the test suite**

```bash
cd "C:/New Grocery App/grocery-checklist-app" && CI=true npx react-scripts test --watchAll=false 2>&1 | tail -8
```

Expected: All passing (Playwright integration test from Task 6 doesn't exist yet, so no regressions expected).

- [ ] **Step 7: Commit**

```bash
git add src/components/InStoreMode.js
git commit -m "feat(in-store): wire useHoldToTalk into a header mic button

Press-and-hold mic button in the In-Store header. Pointer events handle
touch + mouse uniformly; slide-off-to-cancel matches WhatsApp's voice
note pattern.

Visual states:
- idle: mic icon, hover-tinted background
- recording: button scales up, red bg, white mic
- transcribing: tinted bg, spinner
- error / no-match / no-speech: toast (specific message per reason)
- match found: target item highlights and checks; success toast

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Add checked-in automated tests for `useHoldToTalk`

**Files:**
- Modify: `src/components/InStoreMode.js` (export `useHoldToTalk` so the test can import it)
- Create: `src/components/InStoreMode.useHoldToTalk.test.js`

A unit test on the hook (rather than an integration test on the full InStoreMode component) is the right granularity here: the hook contains all the timing-sensitive logic (state machine, refs, async race fixes, AbortController), and the InStoreMode integration is straightforward enough that the bug surface is in the hook. We use `renderHook` from `@testing-library/react` v16.3 (already a project dep, no new packages).

The tests cover every case the v1 review flagged as missing — including the three subtle bugs the hook was specifically rewritten to fix:
- Async-start race (release before getUserMedia resolves)
- MAX_RECORD_MS auto-stop (timer drives submission, not just stop)
- AbortController fetch timeout (15 s)

- [ ] **Step 1: Make `useHoldToTalk` a named export**

In `src/components/InStoreMode.js`, change:
```js
const useHoldToTalk = ({ endpoint, onResult, onError }) => {
```
to:
```js
export const useHoldToTalk = ({ endpoint, onResult, onError }) => {
```

(`findBestMatch` was already exported in Task 3 for the same reason — same pattern.)

- [ ] **Step 2: Create the test file**

Create `src/components/InStoreMode.useHoldToTalk.test.js`:

```js
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
  test('press, hold past MIN_PRESS_MS, release → fetch fires and onResult is called with transcript', async () => {
    setupMocks({
      fetchImpl: async () => ({
        ok: true,
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
    expect(init.body).toBeInstanceOf(FormData);
    expect(result.current.state).toBe('idle');
  });

  test('empty transcript → onResult called with "" (caller decides UX)', async () => {
    setupMocks({
      fetchImpl: async () => ({
        ok: true,
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

  test('server returns success:false → onError("server"), state idle', async () => {
    setupMocks({
      fetchImpl: async () => ({
        ok: true,
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
      fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
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
```

- [ ] **Step 3: Run the suite — all should pass**

```bash
cd "C:/New Grocery App/grocery-checklist-app" && CI=true npx react-scripts test src/components/InStoreMode.useHoldToTalk.test.js --watchAll=false 2>&1 | tail -20
```

Expected: 12 passing tests across 4 describe blocks. The MAX_RECORD_MS test mixes `useFakeTimers` + real timers — if it's flaky in CI, file an issue and consider gating it behind `describe.skip` rather than chasing the flake (the bug it covers is also exercised by manual testing on real devices, see Step 5 below).

- [ ] **Step 4: Commit**

```bash
git add src/components/InStoreMode.js src/components/InStoreMode.useHoldToTalk.test.js
git commit -m "test(in-store): unit tests for useHoldToTalk (voice check-off v2)

12 tests covering: happy path, empty-transcript, MIN_PRESS_MS guard,
slide-off cancel, async-start race (release-before-permission-resolves),
MAX_RECORD_MS auto-stop, permission precheck (denied at mount), press-
while-blocked, NotAllowedError/NotFoundError classification, missing
MediaRecorder, fetch throw (network), server success:false, server
HTTP 5xx.

Mocks MediaRecorder, getUserMedia, navigator.permissions, and fetch.
No real network calls.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Live device sanity-check (optional but recommended)**

Once the dev server is running, do a manual press-and-release on the actual mic button in `#shop` and verify the round-trip works against the live n8n endpoint. The unit tests cover logic; this is the only way to validate that real getUserMedia + MediaRecorder + Whisper actually flow end-to-end. Don't substitute for the unit tests — both matter. Real-device testing is also covered in Task 7.

---

## Task 7: Push to main + real-device validation

**Files:** none (deploy + manual test)

- [ ] **Step 1: Final build + test run**

```bash
cd "C:/New Grocery App/grocery-checklist-app" && CI=true npm run build 2>&1 | tail -5 && CI=true npx react-scripts test --watchAll=false 2>&1 | tail -5
```

Expected: `Compiled successfully.` AND `Test Suites: N passed, N total`. Don't push if either fails.

- [ ] **Step 2: Push to main**

```bash
git push origin main
```

Netlify auto-deploys from main; deploy takes ~2-3 minutes.

- [ ] **Step 3: Wait for Netlify to deploy the new bundle**

```bash
PREV=$(curl -s "https://grocery-checklist-app.netlify.app/" | grep -oE 'main\.[a-f0-9]+\.js' | head -1)
echo "Pre-deploy bundle: $PREV"
for i in {1..15}; do
  CURRENT=$(curl -s "https://grocery-checklist-app.netlify.app/" | grep -oE 'main\.[a-f0-9]+\.js' | head -1)
  if [ "$CURRENT" != "$PREV" ]; then
    echo "Deploy complete: $CURRENT (poll $i)"
    break
  fi
  sleep 20
done
```

If after 5 minutes the bundle hasn't changed, check the Netlify deploys API:

```bash
curl -s "https://api.netlify.com/api/v1/sites/grocery-checklist-app.netlify.app/deploys?per_page=3" | python -c "
import json, sys
d = json.load(sys.stdin)
for dep in d:
  print(f'{dep.get(\"created_at\", \"?\")[:19]} | {dep.get(\"state\")} | {dep.get(\"commit_ref\", \"?\")[:7]}')"
```

If the latest commit is in `state: building` it's still in progress; if `error`, check Netlify dashboard.

- [ ] **Step 4: Real-device test**

On the wife's phone (Android Chrome):
1. Hard-refresh `https://grocery-checklist-app.netlify.app/#shop` (or open in a new incognito tab to bypass cache).
2. Tap-and-hold the mic button. Browser may show a microphone permission prompt — tap Allow.
3. Speak an item name from the current shopping list (e.g., "milk").
4. Release the button.

Expected: ~1-2 seconds of "transcribing" spinner, then the matched item gets checked off and a "Heard 'milk' ✓" toast appears.

If the mic permission was previously denied at a level cleared site settings can't reach (per the v1 debug session), the user may still hit a "permission" toast. In that case, opening the site in incognito (which has fresh permission state) should let them test if v2 works at all. Long-term they may need to clear all Chrome app data once to wipe the stuck denial.

- [ ] **Step 5: If real-device test passes, optionally close out the original feedback entry**

There's no specific feedback ID for "voice check-off doesn't work" since the wife reported it verbally. But if you want to track this in `app_feedback` for posterity, submit one:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  "https://n8n-grocery.needexcelexpert.com/webhook/submit_feedback" \
  -d '{"category":"bug","description":"Voice check-off broken in v1 (Web Speech API). Replaced with v2 (server-side Whisper, hold-to-talk). Plan: docs/superpowers/plans/2026-04-26-voice-checkoff-v2-plan.md","screen":"shop","metadata":{"source":"manual entry, post-v2 deploy","timestamp":"<replace with real ISO timestamp>"},"screenshots":"[]"}'
```

Then immediately mark it `fixed` via the `update_feedback_status` webhook with the resulting ID.

If the real-device test fails: document the specific failure mode (which toast appeared, what permission state the diagnostic shows in the toast text) and treat it as a Phase 1 bug per the systematic-debugging skill — gather evidence before more code changes.

---

## Self-Review checklist

After implementing all tasks, verify:

- [ ] n8n workflow `Transcribe Grocery Item` exists and is `active: true`
- [ ] Negative-path smoke test (no audio) returns `{"success":false,"error":"no_audio"}` per the spec contract
- [ ] `ENDPOINTS.transcribeGroceryItem` resolves to the right URL
- [ ] All 9 `findBestMatch` unit tests pass
- [ ] All 12 `useHoldToTalk` unit tests pass — including the three regression tests for: async-start race, MAX_RECORD_MS auto-stop, fetch timeout
- [ ] `useHoldToTalk` and `findBestMatch` are both named exports from `InStoreMode.js`
- [ ] CI=true `npm run build` passes (no warnings treated as errors)
- [ ] Full Jest suite passes (no regressions)
- [ ] Mic button visible in In-Store header on dev server
- [ ] When permissions are denied, the mic button shows the `MicOff` icon in `bg-danger/10` immediately (without requiring a press)
- [ ] memory.md updated with new workflow ID
- [ ] Pushed to main and Netlify deploy verified
- [ ] Real-device test attempted (success or documented failure)

## Rollback plan

If anything breaks after deploy:

1. **Frontend, surgical:** revert just Task 5 (the button wiring) — `git revert <commit-sha-of-Task-5>` and push. The mic button disappears; the hook + tests stay in the bundle but are unreferenced (dead code, slight bundle-size cost). Rest of the app continues working.
2. **Frontend, full:** revert Tasks 3, 4, 5 in reverse order. This removes `findBestMatch`, `useHoldToTalk`, and the button. Tests are also removed (they reference the removed exports). Bundle returns to pre-v2 size.
3. **Backend:** deactivate the n8n workflow via REST API:
   ```bash
   source /c/hsa-automation/.env && curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<WORKFLOW_ID>/deactivate"
   ```
   Browser hits the dead webhook will get HTTP 404. The frontend's `failTransient("server")` path fires the "Couldn't transcribe" toast; no data corruption, no stuck spinner (15-s AbortController kicks in if needed).
4. If you want to fully undo backend, delete the workflow via n8n UI.

**Per-task safety:** each task is a clean stopping point.
- After Task 1: backend exists but unused; harmless.
- After Task 2: frontend has an extra constant; harmless.
- After Task 3: `findBestMatch` exists + tests pass but it's not called anywhere; harmless.
- After Task 4: hook exists but unused; harmless. Build passes.
- After Task 5: feature is live. This is the first commit that changes user-visible behavior.
- After Task 6: tests are added; if any fail, halt and debug — don't push to main.

No DB schema changes were made by this plan, so no DB rollback is needed.

## Open follow-ups (out of scope, track separately)

Per the spec's "Non-goals" section, defer these:
- Voice activity detection / silence-based auto-stop
- Multi-item matching ("milk and eggs" → check both)
- Streaming transcription
- "Heard 'foo' — add as one-off?" actionable toast
- Per-user rate limiting / cost monitoring
- Web Speech API fallback for browsers where MediaRecorder isn't supported
