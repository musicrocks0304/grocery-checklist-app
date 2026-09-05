# Webhook exposure and response contract — design

Date: 2026-09-05 (revised after adversarial review the same day). Sub-project A of the hardening program. Scope: the n8n webhooks the app calls, the app's `apiFetch` layer, and the non-app callers.

## Goals

1. Every active n8n webhook requires the existing `X-API-Key` header credential.
2. Every webhook response the app consumes is JSON. Failures surface as HTTP 5xx with a JSON body; an empty or unparsable 2xx is treated as an error by the app; no error body leaks SQL, hostnames or internals.
3. Retrying a failed mutation never duplicates data or multiplies AI cost.
4. A checked-in contract test proves 1 and 2 for every endpoint without launching scrapes, calling AI, or writing to the feedback table, and gates each rollout wave.

## Non-goals

- Real per-device authentication. The key ships in the public bundle; this closes drive-by and accidental calls only.
- Cloudflare rate limiting (separate follow-up).
- Creating invite sessions only on "Copy link" (UI change, deferred).
- Changing success payload shapes or wrapping them in an envelope.
- Fixing the `WeeklyGroceryList.ItemID` collision (see "Deferred findings"); no schema changes in this sub-project except the feedback idempotency index.

## Current state (measured 2026-09-05, verified against n8n 1.121.3 source and live workflows)

- 39 active webhooks, all `responseMode: responseNode`, all with a `webhookId`; 14 use the header credential `Grocery App API Key` (n8n credential id `OzxeppJmnYuJpXbO`, header `X-API-Key`); 25 accept anything, 17 of those are POSTs. 118 data nodes (63 MySQL, 44 Code, 6 HTTP Request, 5 Postgres).
- The app sends `X-API-Key` from `REACT_APP_API_KEY` on every `apiFetch` call, and the key is present in the deployed Netlify bundle.
- n8n already answers an unhandled node error with `500 {"message":"Error in workflow"}` before the responseNode branch runs. The zero-byte 200 comes from executions that finish without any Respond node firing: nodes configured to swallow errors (`continueOnFail` / `continueRegularOutput`) and branches that dead-end. Known swallowers: `Smart Deals → Basic LLM Chain` and `→ Save to Cache`, `Transcribe Grocery Item → Whisper Transcribe`, `Update Feedback Status → Webhook` and `→ Respond`.
- `onError: continueErrorOutput` only routes per-item errors (MySQL, Postgres, HTTP Request, Code) to the error output; node types that throw (expressions, Aggregate, IF, Switch, Respond, LangChain) send their input items down the success output instead.
- Enabling `headerAuth` does not affect CORS preflight (OPTIONS is answered 204 before auth), and the 403 (plain text `Authorization data is wrong!`) carries the CORS header, so the browser can read it.
- A de-registered webhook returns 404 without an `Origin` header and `500 text/html` with no CORS header when an `Origin` is present, which the browser reports as a network failure.
- `apiFetch` retries 5xx twice by default; the AI and side-effect call sites do not opt out.
- `add_oneoff_item` (`ON DUPLICATE KEY UPDATE Quantity = VALUES(Quantity)`), `shopping_progress_check` and `add_weekly_selection` (`INSERT IGNORE`), and `selection_check` (`WHERE NOT EXISTS`) are already collision-tolerant. `submit_feedback` is a plain INSERT with no unique key; `create_session` inserts on every modal open (rows self-clean daily).
- The n8n MySQL node discards OkPackets unless `options.detailedOutput` is on; `affectedRows`/`insertId` are not available by default, and `LAST_INSERT_ID()` cannot be read from a separate node (per-node connection pool).
- `save_coupon_matches` returns `{success:false, error}` at HTTP 400 for validation; `transcribe_grocery_item` returns `{success:false, error:'no_audio'}` at HTTP 200 by design.
- Non-app callers: `heb-coupon-scraper/src/store-locations/{phase0,phase1,offline-match}.js` (`categorize_heb_product`, `smart_match_grocery`; manual runs only, wrapped in a 3-attempt retry) and `.claude/commands/review-feedback.md` (`fetch_feedback`, two `https.get` calls). The clip server makes no n8n calls. Neither caller sends the key today.
- Client call sites: 50 `apiFetch` calls (3 to the clip server) plus about 21 raw `fetch` calls. `SessionManager.js` is dead code referencing endpoints that don't exist.

## Design

### 1. Authentication

- Set `authentication: headerAuth` with credential `OzxeppJmnYuJpXbO` on the Webhook node of the 25 unauthenticated workflows. No new credential, no key rotation, no app change. The partner device runs the same build, so `#join/CODE` keeps working.
- Callers updated before their endpoints flip:
  - Scraper: a shared helper reads `GROCERY_APP_API_KEY` from `heb-coupon-scraper/.env` (gitignored) and adds the header in the three store-locations scripts.
  - `review-feedback` command: both `https.get` calls add the header, reading the key by parsing the app's `.env` with `fs` at runtime. The key is never pasted into the markdown.
  - Session notes: ad-hoc curls need `-H "X-API-Key: …"`.
- `apiJson` maps 403 to `ApiError('forbidden')`; the toast says "This app version can't reach the server. Reload and try again."

### 2. Response contract

#### 2a. Client (`src/config/api.js`)

- `class ApiError extends Error { status, code, message, body }`. Codes: `http` (non-2xx), `forbidden` (403), `empty` (2xx with no body), `invalid_json` (2xx with unparsable body), `network`, `timeout`.
- `apiJson(url, options)`: calls `apiFetch`; non-2xx → `ApiError` with `message` from a JSON `error`/`message` field when the body parses, else the status text (the 403 body is plain text and must degrade cleanly); 2xx empty → `empty`; 2xx unparsable → `invalid_json`; otherwise returns the parsed body unchanged. A 2xx body with `success:false` is returned, not thrown, because `transcribe_grocery_item` uses it by design; callers keep checking `success` where it matters.
- Retries: `apiJson` defaults to `retries: 0` when `method` is `POST`, `PUT` or `DELETE`, and to `retries: 2` for GET. A POST that wants retries passes `retries` explicitly. `apiFetch` keeps its current defaults for the SSE/streaming callers.
- `showApiError` shows `ApiError.message` and keeps its timeout/network wording.
- Migration: every site that does `apiFetch` then `response.ok`/`response.json()` moves to `apiJson`. Files: `useWeekStaples`, `useWeekMeals`, `useCategories` (keep its injection shim and localStorage fallback), `useClipCoupons`, `useClipServerHealth`, `Deals`, `SmartDeals`, `Coupons`, `InStoreMode`, `HebCart` (non-stream calls), `Home` (add the missing `ok` check on `grocery_prep`), `FeedbackContext`, `RecipeInstructions`, `RecipeIngredients`, `staples/ReviewScreen`, `App` (join, meals). `ChatBot` (5 sites) and `MealCreator` (4 sites) read `response.text()` and hand-parse with fallbacks; they are reviewed individually and keep `apiFetch` where the text path is load-bearing. `SessionManager.js` is deleted.
- Explicit `retries: 0` is confirmed or added at every AI and side-effect call: `smart_deals`, `smart_match_grocery` (per-batch loop in `HebCart`), `match_coupons`, `meal_creator_*`, `call_grocery_agent`, `grocery_prep`, `create_session`, `save_coupon_matches`, `submit_feedback`.

#### 2b. Server

- Step zero (before any workflow edit): `docker pause hsa-mysql`, curl `add_oneoff_item` and `shopping_progress_check` with the key, record status and body, `docker unpause hsa-mysql`. This confirms the failure path on the current version and sizes the remaining work.
- Remove the four error-swallowing settings listed under "Current state" so those failures reach n8n's own 500. For `Smart Deals`, an LLM failure must respond 500 rather than caching an empty result.
- On MySQL, Postgres, HTTP Request and Code nodes only, set `onError: continueErrorOutput` and connect the error output to one new `Respond 500` node per workflow: `responseCode: 500`, CORS header as the existing Respond node, body `={{ JSON.stringify({ success: false, error: (typeof $json.error === 'string' ? $json.error : ($json.message || 'Workflow error')) }) }}`. Never serialize the error object: for MySQL it carries the interpolated SQL in `description`.
- Branch audit per workflow: every IF false path, Switch fallback and possible zero-row stop must terminate at a Respond node (`{ success: true, ... }` with the current payload, or `[]` for reads). This closes the empty-200 path.
- Scope: the 17 unauthenticated POST workflows plus the six authenticated mutating ones (`create_grocery_list`, `deactivate_grocery_item`, `meal_ingredients`, `meal_creator_save`, `meal_creator_propose`, `call_grocery_agent`). `grocery_prep` responds before the orchestration starts, so only `Generate Job ID` and `Init Job` get the error branch; mid-chain failures are the orchestrator's concern (already sweeps stale jobs at 5 AM). `save_coupon_matches` keeps its 400 validation response.
- Read workflows (the remaining 16) get the branch audit only where a zero-row stop is possible; otherwise untouched.
- Unhandled throws continue to yield n8n's `500 {"message":"Error in workflow"}`; that is acceptable and `apiJson` surfaces it.

### 3. Idempotency

- No changes to existing `WeeklyGroceryList` or `shopping_progress` inserts.
- `submit_feedback`: the app generates a `client_id` (UUID) per report attempt and sends it; a new nullable `client_id VARCHAR(36)` column with a unique index on `app_feedback` (migration via an n8n workflow, as usual) and `INSERT IGNORE` make retries and double taps safe. Old rows keep `NULL`.
- `create_session`: unchanged; rows expire in 4 h and are swept daily.

### 4. Verification

- `scripts/webhook-contract.mjs` (app repo, Node 22, no dependencies, reads `.env` for the key). Every request carries `Origin: https://grocery-checklist-app.netlify.app` so results match the browser. Three tiers, declared per endpoint in the script:
  - Exercised: reads, list/selection/progress mutations, sessions. Called without the key (expect 403) and with the key and valid parameters (expect 2xx JSON). Mutations use the fixed past week `2026-01-04`, sent as the display string `"For the week of January 4th, 2026 to January 10th, 2026"` where an endpoint derives the date from it, with the item name `__contract_test__`; the script removes what it added through the matching uncheck/remove endpoints.
  - Auth probe: `grocery_prep`, `transcribe_grocery_item`, `smart_deals`, `smart_match_grocery`, `match_coupons`, `categorize_heb_product`, `call_grocery_agent`, `get_recipe_items`, `meal_creator_*`, `create_grocery_list`, `deactivate_grocery_item`. Called without the key (expect 403) and with the key and a deliberately invalid body (expect a 4xx or 5xx JSON, never a 2xx).
  - Skipped with a printed reason: `submit_feedback` (writes the user's bug list; no delete path).
- Assertions on every error body: parses as JSON; contains none of `INSERT`, `SELECT`, `UPDATE`, `host.docker.internal`, `hsa-`.
- A `500 text/html` (with Origin) or 404 (without) means the webhook is not registered → re-activate the workflow.
- Unit tests: `api.test.js` covers each `ApiError` code, the POST/GET retry defaults, and pass-through of `success:false`; hook tests that mock `fetch` are updated.
- Fault injection: step zero above, repeated after wave 2 through the UI (add a one-off with MySQL paused → error toast, no phantom "Added").
- Live check after each wave: the Plan, Deals, Shop and Feedback Playwright checks from the 2026-09-05 review.

### 5. Rollout order

1. App: `ApiError`, `apiJson`, retry defaults, `showApiError`, call-site migration, `SessionManager` removal, feedback `client_id`, unit tests. Deploy (safe against today's backend). Gate: `REACT_APP_API_KEY` present in the Netlify build env (it is today).
2. Callers: scraper helper and `.env` key; `review-feedback` command header. Commit both repos.
3. Step zero fault injection; record results in the plan.
4. n8n wave 1 (16 read workflows): auth, plus branch audit where needed. Backup export first, scripted REST PUT with settings filtered to known keys, deactivate/activate, contract test.
5. n8n wave 2 (list/progress/feedback/session mutations plus the six authenticated mutating workflows): auth where missing, swallower removal, error branches, feedback migration. Contract test, UI fault injection.
6. n8n wave 3 (`grocery_prep`, `smart_deals`, `smart_match_grocery`, `transcribe_grocery_item`, `categorize_heb_product`): auth where missing, swallower removal, error branches. Contract test.
7. Notes: key requirement for curls and the `apiJson` rule recorded in project memory.

## Deferred findings (logged, not in scope)

- `WeeklyGroceryList.ItemID` is shared across `DataSource` values: staples use 1001–1050 and meal ingredients use `ingredient_id + 1000`, so 21 IDs already collide (`SELECT ItemID, GROUP_CONCAT(DISTINCT DataSource) FROM WeeklyGroceryList GROUP BY ItemID HAVING COUNT(DISTINCT DataSource) > 1`). Today a collision surfaces as `ER_DUP_ENTRY` → 500. Fix needs `uq_week_item` to include `DataSource` (or namespaced IDs). Until then no WGL insert may be converted to `INSERT IGNORE`/ODKU.
- `grocery_prep` mid-chain failures leave `prep_jobs.status='running'` until the 5 AM sweep; a `Final Update` on the error path is orchestrator work.
- `categorize_heb_product` answers 200 with a `parse error` placeholder when the model output is unparsable.

## Risks

- Flipping auth on the two scraper-called workflows before step 2 breaks manual store-location runs (three retries per product). Mitigation: order, and the contract test flags any 403 with the key.
- Deactivate/activate can leave a webhook unregistered. Mitigation: contract test immediately after each edit, with the browser-equivalent detection above.
- Removing a swallower changes behaviour from "silent partial success" to "visible 500" for Smart Deals and transcription; that is the intent, and the client no longer retries those.
- Migrating 50 call sites is wide but mechanical; the nine text-parsing sites are handled by hand. Hook tests plus the Playwright checks guard the deploy.
