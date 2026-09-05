# Webhook exposure and response contract — design

Date: 2026-09-05. Sub-project A of the hardening program (see the eight-item list in the 2026-09-05 review follow-up). Scope: the n8n webhooks the app calls, the app's `apiFetch` layer, and the two non-app callers.

## Goals

1. Every active n8n webhook requires the existing `X-API-Key` header credential.
2. Every webhook response the app consumes is JSON: the current payload on success, `{ success: false, error }` with HTTP 500 on failure. An empty or non-JSON 2xx is treated as an error by the app.
3. Repeated mutating calls (double tap, retry, two devices) never error on unique-key collisions and never create duplicate rows.
4. A checked-in contract test proves 1 and 2 for every endpoint and gates each rollout wave.

## Non-goals

- Real per-device authentication (the key ships in the public bundle; this closes drive-by and accidental calls only).
- Cloudflare rate limiting (separate follow-up; n8n and the clip server already sit behind Cloudflare).
- Creating invite sessions only on "Copy link" (UI change, deferred).
- Changing success payload shapes or wrapping them in an envelope.
- Clip-server API changes beyond sending the key on its outbound webhook calls.

## Current state (measured 2026-09-05)

- 39 active webhooks; 14 use the header credential `Grocery App API Key` (n8n credential id `OzxeppJmnYuJpXbO`, header `X-API-Key`); 25 accept anything, 17 of those are POSTs.
- The app sends `X-API-Key` from `REACT_APP_API_KEY` on every `apiFetch` call (`src/config/api.js`).
- All 39 workflows use `responseMode: responseNode` with one Respond node (three in `save_coupon_matches`); 116 data nodes (MySQL/Postgres/HTTP/Code) in total.
- Known failure mode: when MySQL is unreachable n8n has returned HTTP 200 with a zero-byte body, which callers read as success.
- Non-app callers: `heb-coupon-scraper/src/store-locations/{phase0,phase1,offline-match}.js` (`categorize_heb_product`, `smart_match_grocery`) and `.claude/commands/review-feedback.md` (`fetch_feedback`). Neither sends the key today.
- Unique keys already exist: `WeeklyGroceryList.uq_week_item (week_start_date, ItemID)` and `uq_item_week (ItemID, ItemName, WeekDateRange)`; `shopping_progress.uq_week_item (week_start_date, item_id)`.

## Design

### 1. Authentication

- Set `authentication: headerAuth` with credential `OzxeppJmnYuJpXbO` on the Webhook node of the 25 unauthenticated workflows. No new credential, no key rotation.
- The partner device is the same app build, so `#join/CODE` keeps working.
- Callers that must add the header before their endpoints flip:
  - Scraper: read the key from a new `GROCERY_APP_API_KEY` entry in `heb-coupon-scraper/.env`; add the header in the three store-locations scripts (one shared helper).
  - `review-feedback` command: add the header to both `https.get` calls, reading the key from the app's `.env` (`REACT_APP_API_KEY`).
  - Session notes: future ad-hoc curls need `-H "X-API-Key: …"`.
- Unauthenticated calls receive n8n's generic 403. `apiFetch` already returns 4xx without retry; `apiJson` (below) turns it into an `ApiError` with `code: 'forbidden'` so the toast says the app is out of date rather than "network error".

### 2. Response contract

Client (`src/config/api.js`):

- New `class ApiError extends Error { status, code, message, body }`. Codes: `http` (non-2xx), `empty` (2xx with no body), `invalid_json`, `failed` (JSON with `success === false`), `forbidden` (403).
- New `apiJson(url, options)`: calls `apiFetch`, then
  - non-2xx → `ApiError('http' or 'forbidden')`, with `message` taken from a JSON `error`/`message` field when the body parses;
  - 2xx with empty body → `ApiError('empty')`;
  - 2xx with unparsable body → `ApiError('invalid_json')`;
  - parsed object with `success === false` → `ApiError('failed', body.error)`;
  - otherwise returns the parsed value (object or array) unchanged.
- `apiFetch` is unchanged and remains the entry point for SSE/streaming callers (HebCart build stream, prep polling that reads text).
- `showApiError` shows `error.message` for `ApiError` and keeps its timeout/network wording otherwise.
- All call sites that do `apiFetch` followed by `response.ok` / `response.json()` migrate to `apiJson`. Hooks (`useWeekStaples`, `useWeekMeals`, `useCategories`, `useClipCoupons`, `useClipServerHealth`), `Deals`, `InStoreMode`, `HebCart` (non-stream calls), `ChatBot`, `MealCreator`, `Home`, `FeedbackContext`, `RecipeInstructions`, `RecipeIngredients`, `CouponMatchPanel`, `App` (join, meals). Behaviour is unchanged on the happy path; on failure each site already has a catch that calls `showApiError` or sets an error state.

Server (17 mutating POST workflows: `add_oneoff_item, add_weekly_selection, remove_weekly_item, remove_weekly_selection, selection_check, selection_uncheck, shopping_progress_check, shopping_progress_uncheck, save_coupon_matches, submit_feedback, update_feedback_status, create_session, grocery_prep, smart_deals, smart_match_grocery, transcribe_grocery_item, categorize_heb_product`):

- Every MySQL/Postgres/HTTP/Code node gets `onError: "continueErrorOutput"`.
- One new node per workflow, `Respond 500`, of type Respond to Webhook: `responseCode: 500`, body `={{ JSON.stringify({ success: false, error: $json.error?.message || $json.error || 'Workflow error' }) }}`, CORS header `Access-Control-Allow-Origin: *` like the existing Respond node.
- Every node's error output connects to `Respond 500`.
- Success responses are unchanged, except that endpoints which currently respond with an empty body on success (if any are found during the audit) respond `{ success: true }`.
- Read workflows (22) are not edited in this sub-project; their existing `[]` sentinels plus the client check cover the empty-200 case.

### 3. Idempotency

- `add_oneoff_item`: the WeeklyGroceryList INSERT becomes `INSERT … ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`; the Respond body becomes `{ success: true, itemId, alreadyExisted: <affectedRows !== 1>, message }`. The `oneoff_items` name row stays (it is the stable ID lookup, by design).
- `shopping_progress_check`, `selection_check`, `add_weekly_selection`: each INSERT audited and converted to `INSERT IGNORE` or `ON DUPLICATE KEY UPDATE` where it is not already. Response bodies gain `success: true` if missing.
- `*_uncheck`, `remove_weekly_item`, `remove_weekly_selection`: deleting zero rows is success; response `{ success: true, removed: <affectedRows> }`.
- No schema changes.

### 4. Verification

- `scripts/webhook-contract.mjs` (app repo, Node 22, no dependencies): for each endpoint in `src/config/api.js` that points at n8n, sends the call without the key (expect 403) and with the key and valid parameters (expect 2xx and a parseable JSON body; any 4xx or 5xx with the key is a failure). Mutating endpoints use a fixed past week (`2026-01-04`) and an item name prefixed `__contract_test__`; the script deletes what it created through the matching remove endpoints and prints a per-endpoint table. Exit code non-zero on any failure. Run with `node scripts/webhook-contract.mjs` (reads `.env` for the key).
- Unit tests: `api.test.js` covers `apiJson` for each `ApiError` code and the pass-through cases; hook tests updated where they mock `fetch` responses (`useWeekStaples.test.js`, `useWeekMeals.test.js`, `useCategories.test.js`).
- Fault injection (manual, once): `docker pause hsa-mysql`, load `#plan` and add a one-off, expect error toasts and no phantom "Added"; `docker unpause hsa-mysql`.
- Live check after each wave: the existing UI review Playwright checks for Plan, Deals, Shop and Feedback.

### 5. Rollout order

1. App: `ApiError`, `apiJson`, `showApiError`, call-site migration, unit tests. Deploy (safe against today's backend).
2. Callers: scraper helper + `.env` key; `review-feedback` command header. Commit both repos.
3. n8n wave 1 (22 read workflows): auth only. Backup export first (`n8n-backup-` folder pattern in `C:\hsa-automation`), scripted REST PUT with settings filtered to known keys, deactivate/activate to re-register, contract test.
4. n8n wave 2 (14 list/progress/feedback/session mutations): auth + error branch + idempotent inserts. Same procedure; fault-injection run after this wave.
5. n8n wave 3 (`grocery_prep`, `smart_deals`, `smart_match_grocery`, `transcribe_grocery_item`, `categorize_heb_product`): auth + error branch. `grocery_prep` has 20 data nodes; its error branch connects only the nodes before the job row is created (the orchestrator already writes failed status afterwards).
6. Memory/docs: record the key requirement for curls and the `apiJson` rule in CLAUDE.md-equivalent notes.

### Risks

- Flipping auth on a workflow the scraper calls before the scraper is updated breaks store-location maintenance runs. Mitigation: step 2 before step 3, and the contract test flags any 403 with the key.
- Deactivate/activate can leave a webhook unregistered (known n8n quirk). Mitigation: the contract test runs immediately after each workflow edit; a 404 means re-activate.
- `onError: continueErrorOutput` changes a node's output shape on the error branch only; success branches are untouched.
- Migrating ~40 call sites to `apiJson` is mechanical but wide. Mitigation: hook tests plus the Playwright regression checks after deploy.
