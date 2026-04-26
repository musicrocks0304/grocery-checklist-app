# HEB Store-Aligned Categories & Walk Order — Design Spec

**Date:** 2026-04-26
**Bug ref:** `app_feedback` #41 (idea — Christian / Corey, screen=`shop`)
**Status:** Design approved, awaiting implementation plan
**Store of record:** H-E-B McKinney #794, 8700 Eldorado Pkwy

---

## 1. Problem

In-Store Mode's walk-order is currently driven by 14 hand-rolled categories. Items are assigned categories based on hand-built rules and free-form text from upstream agents, with no signal from the actual store layout. The result: items appear in the wrong sections, and the in-store walk is inefficient.

Bug #41 (excerpt): *"the grocery sections/categories are not aligned to the actual HEB store layout. Items dont match where they actually are in the store, which makes the walk-order on Shop In-Store screen ineffective."*

## 2. Goals & non-goals

**Goals**
- Each catalog item gets an HEB-aware category and a physical aisle, derived from real HEB data at one specific store (#794 McKinney).
- The 14 walk-order categories stay (no UI restructuring).
- In-Store Mode sorts items by aisle within each category.
- The pipeline is idempotent, resumable, and fully auditable.
- Backfill of existing data is a side effect of the first scraper run.

**Non-goals**
- Multi-store support. Hardcoded to #794. (Schema includes `store_id` to make future expansion possible without migration.)
- Real-time aisle updates (changes between runs).
- Auto-detecting HEB store remodels.
- Replacing the 14 categories with HEB's actual aisle taxonomy.
- Retroactively re-categorizing the current week's `WeeklyGroceryList` rows.
- Building an admin UI for review or manual override (deferred to a follow-up).

## 3. Approach summary

Five-stage pipeline driven by one new npm script (`npm run scrape:store-locations`):

```
1. Preflight: assert HEB_STORE_ID=794, valid session, schema present
2. Enumerate: pull catalog rows needing scrape (audit-table-driven dedup)
3. Match + categorize: extended Smart Match returns hebProductId + userCategory enum
4. Capture aisle: extract productLocation.location from HEB SSR data
5. Apply: per-item transaction writes audit row + (if confident) catalog UPDATE
```

Existing `Smart Match Grocery Items` n8n workflow (`DDlygjzqHlLs4V1E`) is extended with one new structured-output field — `userCategory` constrained to the 14-category enum. The categorization decision rides the AI call we're already making for SKU matching, at zero additional token cost.

## 4. Schema changes

All migrations run as new n8n workflows (consistent with WGL-Fix migration pattern).

### 4.1 New columns on existing tables

```sql
-- GroceryItems (staples catalog)
ALTER TABLE GroceryItems
  ADD COLUMN heb_product_id        VARCHAR(50) NULL AFTER category_id,
  ADD COLUMN store_location        VARCHAR(50) NULL AFTER heb_product_id,
  ADD COLUMN store_id              VARCHAR(20) NULL AFTER store_location,
  ADD COLUMN store_loc_scraped_at  TIMESTAMP NULL AFTER store_id,
  ADD INDEX idx_store_loc (store_id, store_location);

-- ingredients (recipe ingredient catalog)
ALTER TABLE ingredients
  ADD COLUMN category_id           INT NULL AFTER name,         -- conditional, see §4.3
  ADD COLUMN heb_product_id        VARCHAR(50) NULL,
  ADD COLUMN store_location        VARCHAR(50) NULL,
  ADD COLUMN store_id              VARCHAR(20) NULL,
  ADD COLUMN store_loc_scraped_at  TIMESTAMP NULL,
  ADD CONSTRAINT fk_ing_category FOREIGN KEY (category_id) REFERENCES categories(id),
  ADD INDEX idx_store_loc (store_id, store_location);

-- heb_frequent_products (cached HEB product table)
ALTER TABLE heb_frequent_products
  ADD COLUMN store_location        VARCHAR(50) NULL AFTER category_path,
  ADD COLUMN store_id              VARCHAR(20) NULL AFTER store_location;

-- heb_product_matches (Smart Match link table)
ALTER TABLE heb_product_matches
  ADD COLUMN store_location           VARCHAR(50) NULL AFTER heb_category,
  ADD COLUMN store_id                 VARCHAR(20) NULL AFTER store_location,
  ADD COLUMN user_category_id         INT NULL,
  ADD COLUMN user_category_confidence ENUM('high','medium','low') NULL,
  ADD CONSTRAINT fk_hpm_category FOREIGN KEY (user_category_id) REFERENCES categories(id);
```

### 4.2 New table — audit log

```sql
CREATE TABLE category_assignment_audit (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  source_table       ENUM('GroceryItems','ingredients','heb_frequent_products') NOT NULL,
  source_item_id     INT NOT NULL,
  source_item_name   VARCHAR(255) NOT NULL,
  old_category_id    INT NULL,
  new_category_id    INT NULL,
  heb_product_id     VARCHAR(50) NULL,
  heb_product_name   VARCHAR(500) NULL,
  store_location     VARCHAR(50) NULL,
  confidence         ENUM('high','medium','low') NULL,
  ai_reason          VARCHAR(500) NULL,
  action             ENUM('applied','skipped_low_conf','no_match','error','dry_run') NOT NULL,
  run_id             VARCHAR(50) NOT NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_run (run_id),
  INDEX idx_action (action),
  INDEX idx_source (source_table, source_item_id)
);
```

### 4.3 Conditional column on `ingredients`

The `ingredients` table currently lacks a `category_id` column (categorization is derived JIT in the `Create Grocery List - Meals` workflow's `CATEGORY_MAP` JS). The migration will:
- If `ingredients.category_id` does not exist → add it (per §4.1) and update the meals workflow to consume it instead of running the JS mapping.
- If it exists → migration is additive only.

Verification step in the implementation plan must check this before generating the migration.

### 4.4 Environment

```bash
# heb-coupon-scraper/.env
HEB_STORE_ID=794
HEB_STORE_NAME=H-E-B McKinney
```

`HEB_STORE_ID` already exists in `src/config.js:8` but is unset; this becomes a required value with explicit preflight enforcement.

## 5. Pipeline detail

### 5.1 Run lifecycle

```
1. Preflight
   ├─ HEB_STORE_ID env present and equal to 794
   ├─ cookies/heb-session.json present and valid
   ├─ Session-bound store === 794 (read from heb.com __NEXT_DATA__)
   ├─ Required new columns present on GroceryItems / ingredients / etc.
   └─ categories table has at least 14 rows

2. Enumerate work (audit-table-driven, see §5.4)
   └─ Three buckets:
        A) Items already in heb_product_matches → only need aisle
        B) Items already in heb_frequent_products → need AI category + aisle
        C) Items with no existing match → full search + match + AI category + aisle

3. Phase 0 — heb_frequent_products enrichment
   └─ For each cached frequent product:
        - AI categorize (small call: name + brand + HEB taxonomy → 14-category enum)
        - Fetch productLocation via product page __NEXT_DATA__
        - Per-item transaction: insert audit + update heb_frequent_products + upsert heb_product_matches
   ~1.5s/item × 380 items ≈ 10 minutes

4. Phase 1 — GroceryItems + ingredients catalog
   └─ For each item (sequential, with 3–5s jittered delay):
        - Dedup: if heb_product_matches has user_category_id for the same item name OR for the resolved heb_product_id, REUSE it (no Smart Match call)
        - Otherwise: HEB search → Smart Match (returns hebProductId + userCategory + matchConfidence + matchReason)
        - Capture productLocation from search-results SSR data (no extra request)
        - Per-item transaction (see §5.5)
   ~6s/item × ~400 fresh items ≈ 40 minutes (after dedup against Phase 0)

5. Run summary
   └─ Print + persist counts per bucket per action; check coverage thresholds (§7.5)
```

### 5.2 n8n workflow changes

Two distinct call sites need AI categorization, with overlapping but not identical inputs:

**(a) Phase 1 — Smart Match extension.** Workflow `DDlygjzqHlLs4V1E` (`Smart Match Grocery Items`) is extended to also return `userCategory` per match. Same call, no extra tokens.

**(b) Phase 0 — new "Categorize HEB Product" workflow.** Items in `heb_frequent_products` already have a known `heb_product_id` and full HEB taxonomy — no search needed. A small new POST workflow takes `(name, brand, hebProductCategory, hebProductCategoryPath)` and returns `userCategory + confidence`. Uses the same prompt template as (a), minus the search/match scaffolding.

**Shared prompt addition (~5 lines, used by both workflows):**
> "Assign each grocery item to exactly one of these 14 walk-order categories: \[Produce, Meat & seafood, Dairy & eggs, Bakery, Frozen, Pantry staples, Beverages, Snacks, Household, Personal care, Baby, Pet, Floral, One-off items\]. Use HEB's productCategory and productCategoryPath as your primary signal."

**Smart Match output schema addition:**
```json
{
  "matches": [
    {
      "groceryItemId": "...",
      "hebProductId": "...",
      "matchConfidence": "high|medium|low",
      "matchReason": "...",
      "userCategory": "<one of the 14 enum values>"   // NEW
    }
  ]
}
```

**Categorize HEB Product output schema:**
```json
{
  "userCategory": "<one of the 14 enum values>",
  "confidence": "high|medium|low",
  "reason": "..."
}
```

**Enum sourcing:** both workflows fetch the 14 category names from the `categories` table at the start of each execution (single MySQL SELECT, then injected into the prompt). This means adding/renaming a category in the table updates the prompt automatically — no hand-edited prompt drift.

### 5.3 Aisle capture

Two paths, both reuse existing extraction patterns from `src/cart-manager.js`:

- **Search-results path (Phase 1, fresh items):** the search results page's `__NEXT_DATA__` blob already contains `productLocation` per result. Capture during the existing search call. **Zero net HTTP requests added.**
- **Product-detail path (Phase 0, cached items):** single navigation to `/product/<id>`, extract `__NEXT_DATA__`, read `productLocation.location`. ~1.5s per item.

Defensive shape check:
```js
const loc = product?.productLocation?.location;
if (typeof loc !== 'string' || loc.length === 0) return null;
return loc;
```

### 5.4 Idempotency / resumption

Work-queue WHERE clause checks the audit table:

```sql
SELECT g.id, g.name FROM GroceryItems g
WHERE NOT EXISTS (
  SELECT 1 FROM category_assignment_audit a
   WHERE a.source_table='GroceryItems'
     AND a.source_item_id=g.id
     AND a.action IN ('applied','no_match')
     AND a.created_at > NOW() - INTERVAL 90 DAY
);
```

- `applied` and `no_match` are sticky for 90 days (configurable via `--max-age-days=N`).
- `skipped_low_conf` and `error` are retried every run (transient; future Smart Match improvements may resolve them).
- A crash mid-item simply doesn't log → next run picks it up.

### 5.5 Per-item transaction boundary

```
BEGIN
  INSERT INTO category_assignment_audit (...) VALUES (...)
  IF action = 'applied':
    UPDATE <catalog_table> SET category_id=..., heb_product_id=..., store_location=...,
                                store_id=..., store_loc_scraped_at=NOW()
                            WHERE id=?
    UPSERT heb_product_matches (heb_product_id, user_category_id, store_location, ...)
COMMIT
```

Atomic per item. Audit row is the source of truth for "did this happen?".

### 5.6 Cross-table consistency

`heb_product_id` is the canonical join key. The same logical item appearing in `GroceryItems`, `ingredients`, and `heb_frequent_products` will resolve to the same `heb_product_id` and reuse the same `user_category_id` from `heb_product_matches`. **Net: one AI call per unique HEB product**, regardless of how many catalog tables reference it.

### 5.7 Confidence-gated overwrite

| `matchConfidence` | Action |
|---|---|
| `high` | Apply: overwrite existing `category_id` with `userCategory` mapping |
| `medium` | Apply: same as high |
| `low` | Skip: leave existing category, log `skipped_low_conf` |

Audit captures old → new for every `applied` row. Rollback is a single SQL statement per run_id.

### 5.8 Concurrency & rate limits

- Concurrency = 1 (sequential), with 3–5s jittered delay between items (`BETWEEN_OPS_DELAY` pattern from `cart-manager.js`).
- WAF/Incapsula detection: pause 60s, navigate to homepage to re-warm cookies, retry once. Second WAF in same run = abort run cleanly.
- Session expiration detection (`isLoginRedirect()` pattern from `clipper.js`): abort with `SESSION_EXPIRED`, instruct user to re-run `npm run scrape:login`.

## 6. In-Store Mode integration

Three changes — all small.

### 6.1 Backend: `fetch_grocery_items` returns `store_location`

```sql
SELECT
  wgl.id, wgl.ItemName, wgl.IsSelected, wgl.is_skipped,
  c.id AS category_id, c.name AS category_name, c.walk_order,
  COALESCE(g.store_location, i.store_location) AS store_location  -- NEW
FROM WeeklyGroceryList wgl
LEFT JOIN GroceryItems g ON wgl.ItemID = g.id AND wgl.DataSource = 'Staples'
LEFT JOIN ingredients  i ON wgl.ItemID = i.ingredient_id + 1000 AND wgl.DataSource = 'Meals'
LEFT JOIN categories   c ON c.id = wgl.category_id
WHERE wgl.week_start_date = ? AND wgl.is_skipped = 0
```

### 6.2 Frontend: secondary sort by aisle within category

```js
function aisleSortKey(loc) {
  if (!loc) return 9999;                    // unknown → end of group
  const m = loc.match(/aisle\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);         // "Aisle 14" → 14
  return 8000;                              // "Produce", "Bakery" → before unknowns
}

// Categories still order by walk_order. Within each category:
items.sort((a, b) => aisleSortKey(a.store_location) - aisleSortKey(b.store_location));
```

### 6.3 Aisle badge (default visible)

Compact display alongside each item:

```
☐ Soy Sauce              [A14]
☐ Peanut Butter          [A9]
☐ Olive Oil              [—]      ← null store_location
```

Format: `Aisle 14` → `A14`, `Produce` → `Prod`, null → `—`. Decorative only — no interaction.

### 6.4 What this does NOT change

- Category `walk_order` values (still manually maintained).
- `WeeklyGroceryList` rows for the current shopping week (no retroactive update — next week's WGL inherits the new categories naturally via catalog inheritance).

## 7. Errors & edge cases

### 7.1 Preflight assertions (run aborts if any fail)

| Check | On failure |
|---|---|
| `HEB_STORE_ID=794` env | Exit; instruct to set in `heb-coupon-scraper/.env` |
| `cookies/heb-session.json` valid | Exit; instruct to run `npm run scrape:login` |
| Session-bound store === 794 | Exit; instruct to change curbside store on heb.com to McKinney, then re-run `scrape:login` |
| Required schema columns present | Exit; reference migration workflow IDs |
| `categories` table has ≥14 rows | Exit; "categories not seeded" |

### 7.2 Per-item failure matrix

| Failure | Response | Audit action | Retried next run? |
|---|---|---|---|
| HEB search returns 0 results | NULL match, NULL aisle | `no_match` | After 90d |
| Network timeout | Retry 3× (1s/5s/20s backoff) | `error` if all 3 fail | Yes |
| Smart Match returns 500 / empty | Retry 3× | `error` if all 3 fail | Yes |
| Smart Match `confidence=low` | Don't apply | `skipped_low_conf` | Yes |
| Hallucinated `heb_product_id` | Validate against search results, drop | `no_match` | After 90d |
| AI returns `userCategory` not in enum | Fall back to existing category, log warning | `error` | Yes |
| Product page 404 (discontinued) | Apply category, `store_location=NULL` | `applied` | After 90d |
| `productLocation` field absent | Apply category, `store_location=NULL` | `applied` | After 90d |
| MySQL transaction fails | Whole transaction rolls back | (nothing logged) | Yes |

### 7.3 Run-level failure modes

| Failure | Detection | Response |
|---|---|---|
| WAF / Incapsula challenge | Body markers / captcha HTML | Pause 60s → re-warm → retry once. Second WAF = abort, exit code 2 |
| Session expiration | Redirect to `accounts.heb.com` or `/login` | Abort with `SESSION_EXPIRED`; preserved audit rows |
| n8n MySQL exhaustion | Smart Match returns null repeatedly | Per-call retry; 5 consecutive failures = abort with `n8n MySQL exhausted` |
| Process crash | (none) | Resumption automatic via audit-table dedup |
| User Ctrl-C | SIGINT handler | Finish current item's transaction, log summary, exit |

### 7.4 Data edge cases (no exit, behavioral)

- **Conceptually-wrong matches** (e.g., recipe "grilled chicken" matching pre-cooked frozen strips). Acknowledged limitation. Audit log makes them spottable; manual one-row UPDATE corrects them. Future enhancement: `category_locked` flag (out of scope for v1).
- **Generic search terms** ("salt", "milk"). Smart Match picks one product; AI categorizes from that product's taxonomy. Existing behavior, works fine in practice.
- **Duplicate item names.** Both rows get same assignment via `heb_product_id` dedup. Inefficient but correct.
- **Items HEB doesn't sell.** `no_match`, no change to existing category.

### 7.5 Schema-drift canary

Run summary includes `% applied with non-null store_location`. If <30%, surface prominent warning: HEB may have changed `__NEXT_DATA__` shape; check `extractProductLocation()` in scraper.

## 8. CLI

```bash
npm run scrape:store-locations                 # default: phase 0 then phase 1
npm run scrape:store-locations -- --phase=0    # only frequent_products enrichment
npm run scrape:store-locations -- --phase=1    # only catalog scrape
npm run scrape:store-locations -- --retry-skipped     # retry low_conf + error rows
npm run scrape:store-locations -- --dry-run --limit=10  # smoke test (~1-2 min)
npm run scrape:store-locations -- --dry-run    # full preview (~50 min, no writes)
```

## 9. Rollback

Each `applied` audit row preserves `old_category_id`. Rollback for run `R`:

```sql
UPDATE GroceryItems g
JOIN category_assignment_audit a ON a.source_item_id=g.id
SET g.category_id = a.old_category_id,
    g.store_location = NULL,
    g.heb_product_id = NULL,
    g.store_loc_scraped_at = NULL
WHERE a.run_id = 'R'
  AND a.source_table='GroceryItems'
  AND a.action='applied';
-- (similar for ingredients, heb_frequent_products)
```

Single transaction, fully reversible.

## 10. Testing

### 10.1 Unit tests (Jest, deterministic)

- `aisle-sort-key.test.js` — null, `Aisle 14`, `Produce`, `aisle 7`, `AISLE  14`, `12B`, ``
- `dedup-by-product-id.test.js` — work-queue construction with various heb_product_matches states
- `audit-row-builder.test.js` — input → audit shape
- `work-queue-filter.test.js` — 90-day freshness + skip-no_match logic
- `run-summary.test.js` — counts, percentages, threshold warnings

### 10.2 Integration tests (recorded fixtures)

Recorded `__NEXT_DATA__` blobs from real HEB responses; tests run extraction logic against fixtures with no network calls.

### 10.3 Golden-set categorization test

`test/fixtures/categorization-golden.json`: ~30 hand-labeled items spanning all 14 categories, including ~5 deliberately ambiguous cases. Test runs Smart Match against the set, asserts ≥90% agreement. Cost ≈ a few cents per run.

### 10.4 Smoke test (live, ~1-2 min)

`npm run scrape:store-locations -- --dry-run --limit=10` — full pipeline against 10 items, no writes. Recommended before every full run.

### 10.5 Acceptance criteria

| # | Check | Pass condition |
|---|---|---|
| 1 | First full run completes | Phase 0 + Phase 1 succeed end-to-end, exit code 0 |
| 2 | Coverage thresholds | ≥80% applied; ≥70% of applied items have non-null `store_location` |
| 3 | Rollback verified | Pick recent run_id, run rollback SQL, verify catalog reverts |
| 4 | In-Store Mode renders correctly | Items sort by aisle within categories, badge displays |
| 5 | Audit spot-check | 50 random `applied` rows, ≥90% subjectively correct |
| 6 | Real-world walkthrough | Next grocery trip; in-store walk noticeably better; track miscategorizations as feedback |

## 11. Out of scope (future enhancements)

- `category_locked` flag on catalog rows so manual edits survive future scrape runs.
- Admin UI to review `skipped_low_conf` items and apply manual category.
- Multi-store support (selecting between multiple sessions per store).
- Auto-detection of HEB store remodels (currently handled by 90-day refresh).
- Retroactive update of current-week WGL rows (currently a manual SQL one-liner if desired).
- AI re-prompting when output enum is invalid (currently falls back, logs error, retries next run).

## 12. Open questions / risk register

- **Smart Match prompt token budget.** Adding the 14-category enum + instruction to the existing prompt is small (~50 tokens) — well under Haiku's per-call rate limits — but worth verifying during implementation.
- **`ingredients.category_id` migration.** Conditional on whether the column already exists; verify before generating migration workflow.
- **Session-store assertion mechanism.** Need to identify the exact field in HEB's homepage `__NEXT_DATA__` (e.g., `pageProps.selectedStore.id`) — to be confirmed during implementation by inspecting a logged-in session.
- **WAF resilience for Phase 0 product-page navigation.** Phase 0 makes ~380 product-page requests in series. May trip rate limits earlier than Phase 1's search-only flow. Monitor first run; if WAF triggers, add larger inter-item delay for Phase 0 specifically.

---

**Status:** Design approved 2026-04-26 by Corey. Implementation plan to follow via `superpowers:writing-plans`.
