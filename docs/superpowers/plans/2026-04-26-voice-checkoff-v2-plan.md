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
| n8n workflow `Transcribe Grocery Item` | Create | Webhook receiving binary audio → OpenAI Whisper → return `{transcript}` |
| `src/config/api.js` | Modify | Add `transcribeGroceryItem` endpoint constant |
| `src/components/InStoreMode.findBestMatch.test.js` | Create | Unit tests for the transcript-to-item matcher |
| `src/components/InStoreMode.js` | Modify | Re-add `findBestMatch`, `useHoldToTalk` hook, mic-button UI with pointer events |
| `src/components/InStoreMode.test.js` | Modify | Add Playwright-style behavioral test for the hold-to-talk flow |
| `C:\Users\Corey\.claude\projects\c--New-Grocery-App-grocery-checklist-app\memory\MEMORY.md` | Modify | Note new workflow ID + voice-v2 architecture |

---

## Task 1: Create + activate `Transcribe Grocery Item` n8n workflow

**Files:** New n8n workflow (no git change)

**Why first:** Frontend depends on this webhook existing. Deploy backend first; if frontend ships first the mic button hits a 404.

- [ ] **Step 1: Create the workflow via n8n MCP**

Use `mcp__n8n-mcp__n8n_create_workflow` with this body:

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
          "allowedOrigins": "*",
          "binaryData": true,
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
      }
    },
    {
      "id": "code",
      "name": "Build Response",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [750, 300],
      "parameters": {
        "language": "javaScript",
        "jsCode": "const text = ($input.first().json?.text || '').toString().trim();\nreturn [{ json: { success: true, transcript: text } }];"
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

- [ ] **Step 2: Activate the workflow via REST API**

```bash
source /c/hsa-automation/.env && curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<WORKFLOW_ID>/activate"
```

Expected: JSON body with `"active": true`. If `false`, re-run the activate call (n8n sometimes needs a beat). If still `false`, deactivate then re-activate (memory note: "After adding/updating webhookId, deactivate then reactivate the workflow.").

- [ ] **Step 3: Smoke-test the negative path (no audio)**

```bash
curl -sv -X POST "https://n8n-grocery.needexcelexpert.com/webhook/transcribe_grocery_item"
```

Expected: HTTP 5xx or 4xx with an error body. The exact message is fine as long as it's not a 200 with empty transcript — that would mean Whisper accepted an empty input (unlikely; OpenAI rejects empty audio with a 400 that we should propagate as failure).

If the call returns HTTP 200 + `{success:true, transcript:""}`, the workflow ran end-to-end with no audio file — that's a degenerate but acceptable v1 behavior. Verify via the next step that real audio flows through correctly.

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
    expect(findBestMatch('   ', items)).toBeNull();
  });

  test('returns null when no item matches', () => {
    expect(findBestMatch('asparagus', items)).toBeNull();
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

Expected: `Tests: 7 passed, 7 total`

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
- POST the assembled blob to `ENDPOINTS.transcribeGroceryItem`
- Hard caps: 250ms minimum (ignore accidental taps), 8000ms maximum (auto-stop)
- Error states: permission denied, no mic, recorder failure, network failure, server error

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
// State machine: idle → recording → transcribing → idle (on success)
//                idle → recording → idle (on cancel via slide-off)
//                idle → error → idle (on getUserMedia / network / server failure)
//
// Usage:
//   const voice = useHoldToTalk({ endpoint: ENDPOINTS.transcribeGroceryItem });
//   <button
//     onPointerDown={voice.start}
//     onPointerUp={voice.stop}
//     onPointerLeave={voice.cancel}
//     onPointerCancel={voice.cancel}
//   >
//   {voice.state}  // 'idle' | 'recording' | 'transcribing' | 'error'
//   {voice.transcript}  // populated when state transitions to idle after success
//   {voice.error}  // 'permission' | 'no-mic' | 'no-recorder' | 'network' | 'server' | null
//
// Caller is responsible for reacting to transitions (e.g. matching the
// transcript against items and calling shopping_progress_check). The hook
// itself never modifies the shopping list.
const MIN_PRESS_MS = 250;
const MAX_RECORD_MS = 8000;

const useHoldToTalk = ({ endpoint, onResult, onError }) => {
  const [state, setState] = useState("idle");
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startTimeRef = useRef(0);
  const maxTimerRef = useRef(null);

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

  const fail = useCallback((reason) => {
    setState("error");
    if (onError) onError(reason);
    // Reset to idle after the caller has a chance to surface the error.
    setTimeout(() => setState("idle"), 0);
  }, [onError]);

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
  }, []);

  const start = useCallback(async (event) => {
    if (state !== "idle") return;
    if (event && typeof event.preventDefault === "function") {
      // Block default touch behaviors (text selection, context menu) on hold.
      event.preventDefault();
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      fail("no-recorder");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      fail("no-recorder");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      startTimeRef.current = Date.now();
      setState("recording");
      // Hard cap: auto-stop after MAX_RECORD_MS. The caller's onPointerUp
      // is the normal stop path; this is a safety net.
      maxTimerRef.current = setTimeout(() => {
        if (recorderRef.current && recorderRef.current.state === "recording") {
          try { recorderRef.current.stop(); } catch { /* no-op */ }
        }
      }, MAX_RECORD_MS);
    } catch (err) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        fail("permission");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        fail("no-mic");
      } else {
        fail("no-recorder");
      }
    }
  }, [state, fail]);

  const stop = useCallback(async () => {
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

    // Wait for the final ondataavailable to fire after stop() resolves.
    const finalBlobP = new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        resolve(blob);
      };
    });
    try { recorder.stop(); } catch { /* no-op */ }
    setState("transcribing");
    const blob = await finalBlobP;
    cleanupStream();

    // POST as multipart/form-data
    const form = new FormData();
    // Field name "audio" — must match the Webhook node's binaryPropertyName.
    form.append("audio", blob, "recording.webm");

    let resJson = null;
    try {
      const res = await fetch(endpoint, { method: "POST", body: form });
      if (!res.ok) {
        fail("server");
        return;
      }
      resJson = await res.json();
    } catch {
      fail("network");
      return;
    }

    if (!resJson || resJson.success !== true) {
      fail("server");
      return;
    }
    const transcript = (resJson.transcript || "").trim();
    setState("idle");
    if (onResult) onResult(transcript);
  }, [state, endpoint, cleanupStream, fail, onResult]);

  const cancel = useCallback(() => {
    if (state !== "recording") return;
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      try { recorder.stop(); } catch { /* no-op */ }
    }
    cleanupStream();
    setState("idle");
  }, [state, cleanupStream]);

  return { state, start, stop, cancel };
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

Expected: All tests pass (the new findBestMatch test from Task 3 + everything else; should be 105 total — 104 prior + 7 new findBestMatch tests minus 6 = 105 if Jest counts them in the same describe).

(If the count differs from your local baseline, recount; the important thing is no test FAILED.)

- [ ] **Step 5: Commit**

```bash
git add src/components/InStoreMode.js
git commit -m "feat(in-store): add useHoldToTalk hook for voice check-off v2

MediaRecorder lifecycle wrapped in a custom hook. State machine:
  idle -> recording -> transcribing -> idle (success path)
  idle -> recording -> idle (cancel via slide-off)
  idle -> error -> idle (getUserMedia / network / server failure)

Hard caps: 250ms minimum press (accidental tap = no submission), 8s
maximum (auto-stop). POSTs the recorded blob as multipart/form-data to
the new transcribe_grocery_item endpoint. Caller wires the hook to
pointer events on the mic button and reacts to the onResult callback.

Hook is not yet used — Task 5 wires it into the InStoreMode UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire mic button + UI states into InStoreMode

**Files:**
- Modify: `src/components/InStoreMode.js`

This is where the user-visible feature comes back: a mic button in the header that responds to hold-to-talk.

- [ ] **Step 1: Re-add the `Mic` icon import**

In the lucide-react import block at the top of the file, add `Mic`:

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
  MoreHorizontal,
  Filter,
  User,
  Undo2,
  X,
  Copy,
  Users,
} from "lucide-react";
```

- [ ] **Step 2: Re-add the `react-hot-toast` import (now used for voice feedback)**

After the `motion`/`AnimatePresence` import, add:

```js
import hotToast from "react-hot-toast";
```

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
        hotToast("Didn't hear anything — try again", { icon: "🤔" });
        return;
      }
      const allUnchecked = shoppingList
        ? shoppingList.items.filter((i) => !checkedItems.has(i.ItemID.toString()))
        : [];
      const matched = findBestMatch(transcript, allUnchecked);
      if (matched) {
        handleToggleItem(matched);
        hotToast.success(`Heard "${transcript}" — checked ✓`);
      } else {
        hotToast(`Heard "${transcript}" — not on your list`, { icon: "🔍" });
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
    hotToast.error(messages[reason] || "Couldn't transcribe.");
  }, []);

  const voice = useHoldToTalk({
    endpoint: ENDPOINTS.transcribeGroceryItem,
    onResult: handleVoiceResult,
    onError: handleVoiceError,
  });
```

This must be placed AFTER `handleToggleItem` is defined, since `handleVoiceResult` references it. If `handleToggleItem` is defined further down, place this block below it.

- [ ] **Step 4: Add the mic button to the header**

Find the In-Store header where the other header buttons (`Smartphone` icon, `MoreHorizontal` menu button) live. Search for `aria-label="More"` to find that area. Insert the mic button immediately before the `MoreHorizontal` button:

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
            aria-label="Hold to voice-check item"
            title="Hold to voice-check item"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all touch-none select-none ${
              voice.state === "recording"
                ? "bg-danger text-white scale-110"
                : voice.state === "transcribing"
                  ? "bg-primary-light text-primary"
                  : "hover:bg-background text-body"
            }`}
          >
            {voice.state === "transcribing" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Mic size={18} />
            )}
          </button>
```

`touch-none` and `select-none` Tailwind classes prevent mobile browsers from interpreting the long-press as a text-selection or scroll gesture. `Loader2` is already imported.

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

## Task 6: Behavioral verification via Playwright

**Files:** none (uses the running dev server + the existing Playwright tooling)

This is a manual Playwright session driven from the controller chat — not a checked-in automated test. The plan is to verify the end-to-end flow with mocks for `MediaRecorder` and `fetch`, which is exactly what we did for the prior In-Store Mode behavioral tests.

- [ ] **Step 1: Confirm dev server is running on http://localhost:3000**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: `200`. If `down`, start it: `cd "C:/New Grocery App/grocery-checklist-app" && BROWSER=none npm start &` and wait until ready.

- [ ] **Step 2: Resize Playwright to a phone-like viewport**

```js
mcp__plugin_playwright_playwright__browser_resize({ width: 390, height: 844 })
```

- [ ] **Step 3: Navigate to /shop and wait for the In-Store screen to render**

```js
mcp__plugin_playwright_playwright__browser_navigate({ url: "http://localhost:3000/#shop" })
// then wait ~3s for shopping list to load
mcp__plugin_playwright_playwright__browser_wait_for({ time: 3 })
```

- [ ] **Step 4: Mock MediaRecorder + fetch via browser_evaluate**

```js
mcp__plugin_playwright_playwright__browser_evaluate({
  function: `() => {
    // Stub MediaRecorder so MediaRecorder is defined and behaves predictably.
    const FakeRecorder = class {
      constructor() { this.state = "inactive"; this.mimeType = "audio/webm"; this.ondataavailable = null; this.onstop = null; }
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; if (this.ondataavailable) this.ondataavailable({ data: new Blob(["x"], { type: "audio/webm" }) }); if (this.onstop) this.onstop(); }
    };
    window.MediaRecorder = FakeRecorder;
    // Stub getUserMedia to return a fake stream.
    navigator.mediaDevices = navigator.mediaDevices || {};
    navigator.mediaDevices.getUserMedia = async () => ({
      getTracks: () => [{ stop: () => {} }],
    });
    // Stub fetch for the transcribe endpoint. Capture the call so we can assert.
    window.__transcribeCalls = [];
    const realFetch = window.fetch;
    window.fetch = async (url, init) => {
      if (typeof url === "string" && url.includes("/transcribe_grocery_item")) {
        window.__transcribeCalls.push({ url, hasBody: !!init?.body });
        return { ok: true, json: async () => ({ success: true, transcript: "Cinnamon Toast Crunch" }) };
      }
      return realFetch(url, init);
    };
    return "ready";
  }`
})
```

- [ ] **Step 5: Press-and-hold the mic button via simulated pointer events**

```js
mcp__plugin_playwright_playwright__browser_evaluate({
  function: `async () => {
    const btn = document.querySelector('button[aria-label="Hold to voice-check item"]');
    if (!btn) return { err: "no mic button" };
    btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "touch" }));
    await new Promise(r => setTimeout(r, 1000)); // hold for 1s (>250ms minimum)
    btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, pointerType: "touch" }));
    await new Promise(r => setTimeout(r, 1500)); // wait for transcribe + state updates
    return {
      transcribeCalls: window.__transcribeCalls.length,
      callDetails: window.__transcribeCalls,
    };
  }`
})
```

Expected: `transcribeCalls: 1`. The fake fetch was called with multipart/form-data body.

- [ ] **Step 6: Verify the matched item ("Cinnamon Toast Crunch") got checked off**

```js
mcp__plugin_playwright_playwright__browser_evaluate({
  function: `() => {
    const items = Array.from(document.querySelectorAll('[role="checkbox"]'));
    const ctc = items.find(el => /Cinnamon Toast Crunch/i.test(el.textContent || ''));
    return { ctcChecked: ctc?.getAttribute('aria-checked'), ctcExists: !!ctc };
  }`
})
```

Expected: `ctcChecked: "true"`. (If your week's data doesn't have Cinnamon Toast Crunch, change the mocked transcript in Step 4 to a known unchecked item from your list, e.g., "milk" if Milk is unchecked.)

- [ ] **Step 7: Clean up — restore the test row by un-checking it**

```js
mcp__plugin_playwright_playwright__browser_evaluate({
  function: `async () => {
    const items = Array.from(document.querySelectorAll('[role="checkbox"]'));
    const ctc = items.find(el => /Cinnamon Toast Crunch/i.test(el.textContent || ''));
    if (ctc?.getAttribute('aria-checked') === 'true') {
      ctc.click();
      await new Promise(r => setTimeout(r, 1500));
    }
    return { ctcChecked: ctc?.getAttribute('aria-checked') };
  }`
})
```

Expected: `ctcChecked: "false"` (uncheck network call fires; row restored).

- [ ] **Step 8: Test slide-off cancel (no fetch should fire)**

```js
mcp__plugin_playwright_playwright__browser_evaluate({
  function: `async () => {
    window.__transcribeCalls = []; // reset
    const btn = document.querySelector('button[aria-label="Hold to voice-check item"]');
    btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 2, pointerType: "touch" }));
    await new Promise(r => setTimeout(r, 600));
    btn.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 2, pointerType: "touch" }));
    await new Promise(r => setTimeout(r, 1000));
    return { transcribeCalls: window.__transcribeCalls.length };
  }`
})
```

Expected: `transcribeCalls: 0` (slide-off cancels before submission).

- [ ] **Step 9: Test the no-match path**

```js
mcp__plugin_playwright_playwright__browser_evaluate({
  function: `async () => {
    // Re-mock fetch to return an unrelated transcript.
    window.__transcribeCalls = [];
    window.fetch = async (url, init) => {
      if (typeof url === "string" && url.includes("/transcribe_grocery_item")) {
        window.__transcribeCalls.push({ url });
        return { ok: true, json: async () => ({ success: true, transcript: "asparagus" }) };
      }
      const real = window.__realFetch || (await import("./").catch(() => null));
      return real ? real(url, init) : new Response();
    };
    const btn = document.querySelector('button[aria-label="Hold to voice-check item"]');
    btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 3, pointerType: "touch" }));
    await new Promise(r => setTimeout(r, 800));
    btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 3, pointerType: "touch" }));
    await new Promise(r => setTimeout(r, 1500));
    // Look for a toast containing the no-match copy.
    const toasts = Array.from(document.querySelectorAll('[role="status"], [class*="toast"]'))
      .map(el => el.textContent?.trim() || '')
      .filter(t => /Heard "asparagus"/.test(t));
    return { transcribeCalls: window.__transcribeCalls.length, toastFound: toasts.length > 0 };
  }`
})
```

Expected: `transcribeCalls: 1, toastFound: true`.

- [ ] **Step 10: Close the Playwright browser**

```js
mcp__plugin_playwright_playwright__browser_close()
```

If any step failed, document the failure mode and address it before continuing. Don't ship the feature without all 10 steps passing.

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
- [ ] Negative-path smoke test against the webhook returns a sensible error (or 200 with empty transcript)
- [ ] `ENDPOINTS.transcribeGroceryItem` resolves to the right URL
- [ ] All 7 `findBestMatch` unit tests pass
- [ ] CI=true `npm run build` passes (no warnings treated as errors)
- [ ] Full Jest suite passes
- [ ] Playwright behavioral test (Task 6) passes for: success match, slide-off cancel, no-match toast
- [ ] Mic button visible in In-Store header on dev server
- [ ] memory.md updated with new workflow ID
- [ ] Pushed to main and Netlify deploy verified
- [ ] Real-device test attempted (success or documented failure)

## Rollback plan

If anything breaks after deploy:

1. Frontend: `git revert <commit-sha-of-Task-5>` and push. The mic button disappears; v2 is gone but rest of the app continues working.
2. Backend: deactivate the n8n workflow via REST API:
   ```bash
   source /c/hsa-automation/.env && curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5679/api/v1/workflows/<WORKFLOW_ID>/deactivate"
   ```
   Browser hits the dead webhook will get a 404, frontend will surface "server" error toast; no data corruption.
3. If you want to fully undo backend, delete the workflow via n8n UI.

No DB schema changes were made by this plan, so no DB rollback is needed.

## Open follow-ups (out of scope, track separately)

Per the spec's "Non-goals" section, defer these:
- Voice activity detection / silence-based auto-stop
- Multi-item matching ("milk and eggs" → check both)
- Streaming transcription
- "Heard 'foo' — add as one-off?" actionable toast
- Per-user rate limiting / cost monitoring
- Web Speech API fallback for browsers where MediaRecorder isn't supported
