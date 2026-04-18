# Weekly Purchase History Scrape — Design

**Date:** 2026-04-18
**Status:** Design approved, awaiting implementation plan
**Goal:** Add the HEB purchase history scrape to the weekly grocery prep flow so orders are captured before HEB rotates them out of view (HEB's order-history page only exposes ~4 months of history).

## Problem

The purchase-history scraper built earlier today ([2026-04-18-purchase-history-export-design.md](2026-04-18-purchase-history-export-design.md)) is a one-shot CLI tool. Running it manually means missing orders if the gap between runs exceeds HEB's ~4-month retention window. Scraping is idempotent (dedupes via `heb_purchase_history.heb_order_id UNIQUE`), so running it every week is cheap when there are no new orders.

The weekly grocery prep flow already orchestrates coupon and frequent-product scrapes via the cloud prep system deployed 2026-04-10:

- **prep-agent**: Express server on Windows host (port 3850), spawns `npm` scrape scripts as child processes, tracks jobs in memory
- **n8n Orchestrator** (`SgEykcbXCexjTe6l`): Runs steps sequentially, writes progress to `prep_jobs` table
- **React Home** "Prep for Shopping" button triggers the orchestrator via webhook

Adding history to this flow means it runs exactly when the user already prepares for shopping — no separate schedule.

## Scope

**In scope:**
- New `POST /scrape-history` route on prep-agent
- New node group in the n8n orchestrator: `Scrape History → Clean History Result → Update: History`
- Schema addition for history step progress in `prep_jobs`
- Verification that the React "Prep for Shopping" UI picks up the new step

**Out of scope:**
- Any change to `scrape-purchase-history.js` itself — it's already idempotent and well-behaved
- Any change to `GroceryItems` / Staples logic (that's the follow-up analysis conversation)
- Parallel scraping (all scrapers share the Playwright session — must remain sequential)
- Retry logic (idempotent — next week catches what this week missed, as long as HEB still shows it)

## Architecture

Two files change, one on each side of the orchestration:

### 1. `C:\New Grocery App\prep-agent\server.js`

Add to the `activeJobs` concurrency guard:

```javascript
const activeJobs = {
  'scrape-frequent': null,
  'scrape-coupons': null,
  'scrape-history': null,  // new
};
```

Add a new route mirroring `/scrape-coupons` exactly (same pattern, different npm script):

```javascript
// POST /scrape-history  — ?wait=true blocks until done
app.post('/scrape-history', async (req, res) => {
  const result = spawnScrapeJob('scrape-history', 'scrape:history');
  if (result.alreadyRunning) {
    return res.status(409).json({ error: 'ALREADY_RUNNING', jobId: result.jobId });
  }
  console.log(`[prep-agent] Spawned scrape-history job ${result.jobId}`);
  if (req.query.wait === 'true') {
    try {
      const job = await waitForJob(result.jobId, 10 * 60 * 1000);
      return res.json({ jobId: result.jobId, status: job.status, output: job.stdout, exitCode: job.exitCode });
    } catch (err) {
      return res.json({ jobId: result.jobId, status: 'timeout', error: err.message });
    }
  }
  res.json({ jobId: result.jobId });
});
```

10-minute timeout matches `/scrape-coupons`. Minimum runtime ~20s (no new orders), maximum ~3 min (full page of new orders).

### 2. n8n Orchestrator (`SgEykcbXCexjTe6l`)

Insert three new nodes between `Update: Coupons` and `Start Clip Session`:

| Node | Type | Purpose |
|---|---|---|
| `Scrape History` | HTTP Request | POST `http://host.docker.internal:3850/scrape-history?wait=true` with `X-Prep-Key` header. `continueOnFail: true`. |
| `Clean History Result` | Code | Strip control chars / normalize output for MySQL TEXT storage. Mirror of `Clean Coupons Result`. |
| `Update: History` | MySQL | UPDATE `prep_jobs` SET `step_history_status` and `step_history_output` for the jobId. |

**Rewire connections:**
- `Update: Coupons` → `Scrape History` (was → `Start Clip Session`)
- `Update: History` → `Start Clip Session`

### 3. `prep_jobs` schema

Add two columns (verify existing naming convention first — if it differs from `step_<name>_status/output`, match the existing pattern):

```sql
ALTER TABLE prep_jobs
  ADD COLUMN step_history_status VARCHAR(50) DEFAULT NULL,
  ADD COLUMN step_history_output LONGTEXT DEFAULT NULL;
```

## Data Flow

The orchestrator sequence becomes:

```
Webhook → Generate Job ID → Init Job → Respond (returns jobId immediately)
       → Check Docker → Update: Docker
       → Check Session → Update: Session
       → Gate: Session Valid
            ├─ (invalid) → Mark Failed: Session Expired
            └─ (valid)   → Scrape Frequent → Clean → Update
                         → Scrape Coupons  → Clean → Update
                         → Scrape History  → Clean → Update   ← NEW
                         → Start Clip Session
                         → Build Summary → Clean Summary → Final Update
```

History runs last in the scrape group because:
- All scrapes share the Playwright session and must run sequentially
- `Start Clip Session` holds the persistent browser — scrapes after it can't run
- Putting history last preserves all existing ordering and makes rollback simpler if needed

## Error Handling

| Failure | Response |
|---|---|
| Scrape returns non-zero exit | Output captured in `step_history_output`; status = `'failed'`; pipeline proceeds to `Start Clip Session` via `continueOnFail: true` |
| Session expired mid-scrape | Scraper detects WAF/redirect, exits 1 with clear message; same failure path as above |
| prep-agent unreachable | HTTP node errors; `continueOnFail: true` lets orchestrator skip to `Update: History` which records the error |
| 409 `ALREADY_RUNNING` | Clean node detects 409 body; `Update: History` writes status = `'skipped (already running)'` |
| Session invalid at start of prep | `Gate: Session Valid` already blocks all scrapes — no change needed; history never attempts |

**No retry logic.** HEB's ~4-month retention means a missed week recovers next week as long as orders are still visible. Weekly runs comfortably within that window.

## Testing

No new automated tests — matches the existing (test-less) pattern for prep-agent and the orchestrator. Manual verification checklist:

1. **prep-agent route standalone**: `curl -X POST http://localhost:3850/scrape-history?wait=true -H "X-Prep-Key: $PREP_API_KEY"` → expect 200 with `status: 'done'`
2. **Concurrency guard**: two rapid `/scrape-history` calls → second returns 409
3. **n8n workflow visual check**: open workflow in n8n UI, verify 3 new nodes wire correctly
4. **n8n validation**: `n8n_validate_workflow` passes
5. **End-to-end**: "Prep for Shopping" button → progress UI shows history step → `heb_purchase_history` row count unchanged (no new orders) OR incremented (new orders) → CSV regenerated → Start Clip Session runs
6. **Failure path**: rename `cookies/heb-session.json` to expire session, trigger prep, verify `step_history_status='failed'` and pipeline continues

## Rollout Order

1. Add prep-agent route and restart prep-agent service (safe — new endpoint only)
2. ALTER `prep_jobs` via existing migration workflow pattern
3. Deactivate orchestrator → add/wire new nodes → validate → reactivate
4. Verify via "Prep for Shopping" button on React Home

## Non-Decisions (deferred)

- Whether the React progress UI needs a hardcoded label for the new step (verify during implementation — if labels are mapped in UI, add one; if generic, no change)
- Whether to extend HEB order-history pagination beyond ~4 months (HEB limitation, not ours)
- Whether to surface purchase frequency anywhere in the app yet (belongs in the Staples redesign conversation)
