# n8n Cleanup Action Items

Manual tasks for the n8n instance. The React app cannot modify n8n directly.

## 1. Webhook Authentication (from Phase 3)

Generate an API key and configure every active webhook to require it.

```bash
# Generate a key
openssl rand -hex 32
```

1. Add the key to `.env` as `REACT_APP_API_KEY=<generated-key>`
2. For each of the 15 active grocery workflows, open the Webhook node:
   - **Authentication** -> select **Header Auth**
   - **Header Name**: `X-API-Key`
   - **Header Value**: `<generated-key>`
3. Deactivate and reactivate each workflow after the change.

**Workflows to update:**
- Pull Grocery Staples (JoaR6klT950hwSLB)
- Add Grocery Item (Uo35akFGNGHrOKvl)
- Deactivate Grocery Item (pUCo4xrd4KkI1mVP)
- Create Grocery List (o0FnsnU6DaU9CqKD)
- Create Grocery List - Meals (CkLhcFEM9Tfc5uxO)
- Blue Apron API Agent (UsrnHCWpe6zfIbcn)
- Ingredient Agent (UqXlXX5uPWlGvhU6)
- Choose Instructions (jNR615vEH0pDFrs3)
- Grab Recipe Instructions - Fast (OQJthXLgBYglySdU)
- Chat History API (Kz9hrwAH0hVzNR4Y)
- Fetch HEB Coupons (K1kGPK4rJNImPnY1)
- Match Coupons AI (CuaKAgmacIOTN6vW)
- AI Meal Creator - Propose (0eSQFVwGsC8tuYli)
- AI Meal Creator - Full Build (ATGuPNtocx6Xypyk)
- AI Meal Creator - Save to DB (n4lUGlBwxX34tpj7)

**Note:** The clip server (clip.needexcelexpert.com) uses EventSource for SSE progress, which doesn't support custom headers. Keep the clip server open or add query-parameter auth if needed.

## 2. CORS Restrictions (from Phase 3)

Currently all webhooks use `Access-Control-Allow-Origin: *`. Restrict to:

```
Access-Control-Allow-Origin: https://your-app.netlify.app
```

For local dev, you'll need to also allow `http://localhost:3000`. n8n's Webhook node only supports a single origin in the Allowed Origins field. Options:
- Use a wildcard subdomain pattern if your Netlify URL is stable
- Or handle CORS in a Code node that checks the Origin header
- Or keep `*` for now and rely on the API key for security (pragmatic choice)

## 3. Delete Inactive Unnamed Workflows

These 12 unnamed "My workflow X" workflows are experiments with no production use. **Safe to delete.**

| ID | Name | Recommendation |
|----|------|---------------|
| zTiRcoyedL7TOACv | My workflow | DELETE |
| 1jc9Zd4ARaNj8qxe | My workflow 2 | DELETE |
| a1WSX9AXA97kFfJc | My workflow 3 | DELETE |
| gLOBXdoZtJkHYe8z | My workflow 6 | DELETE |
| QBNlq8PUVV7GyLxZ | My workflow 7 | DELETE |
| wSRFmF50cwyu7JeP | My workflow 8 | DELETE |
| 9rxkpEiOSuGO5FhP | My workflow 9 | DELETE |
| ollWpDtMxHsaoYcN | My workflow 10 | DELETE |
| iUe50aXJd2jnTXSI | My workflow 11 | DELETE |
| Cj6ui5lkek19jHnP | My workflow 12 | DELETE |
| LRJBO7S4Y4bBBK9h | My workflow - FIXED VERSION | DELETE |

## 4. "My workflow 4" — Active but Unnamed

**ID:** NM0Y4L0thphtwUkM

This is the **original fetch_grocery_items endpoint** with the UUID-based path (`/5eb40df4-7053-4166-9b7b-6893789ff943/fetch_grocery_items`). It's a simpler version of "Pull Grocery Staples" — just does `SELECT ItemID, ItemName, Category FROM GroceryItems WHERE IsActive = TRUE`.

**Recommendation:** DEACTIVATE. The app now uses "Pull Grocery Staples" which serves the same path (`/fetch_grocery_items`) with additional logic (checks for current week's existing list). The UUID-based path is no longer referenced in the codebase after the Phase 2 URL cleanup.

## 5. Delete/Archive Superseded Inactive Workflows

| ID | Name | Recommendation | Reason |
|----|------|---------------|--------|
| lsXlPoyvpTbe9B0G | Blue Apron Agent | DELETE | Superseded by active "Blue Apron API Agent" |
| NRHkQLu30jeEi25I | Instructions Agent | DELETE | Superseded by "Choose Instructions" + "Grab Recipe Instructions (Fast)" |
| I53kYaUA8w6GcreA | Batch Fetch Grocery Items | DELETE | One-time utility, not used |
| XE5FeHcqIk16sREz | Batch Delete Grocery Items | DELETE | One-time utility, not used |
| mUgUYGaQb6Krx5G7 | Batch Add Grocery Items | DELETE | One-time utility, not used |
| jIx4b0pJqo6M33Rg | Batch Rename Grocery Items | DELETE | One-time utility, not used |
| Vry7Hi6NQ0sTkcyH | Recipe JSON to MySQL Processor | DELETE | One-time data import |
| SPlhE95N5b6kb6DB | HEB Coupon Scraper to MySQL | DELETE | Replaced by Playwright scraper on host |
| 8hxYTbot98dN5Xqh | Real-time Updates Polling | DELETE | Experiment, never used |
| jHj1RIcKYOOuH2pY | MCP Trigger | DELETE | Experiment (1 node), not used |
| cRy2r1CV6Qmi7YBX | SQLLite Init | DELETE | SQLite was abandoned for MySQL |
| kEjkBXrDPNH308OR | Document Vectorizer | DELETE | Experiment, not used |
| eL9bELwsWCnszUzW | Clear Chat History | KEEP (archive) | Could be useful for future maintenance |

## 6. Keep Inactive Migration Workflows (Archive)

| ID | Name | Recommendation |
|----|------|---------------|
| hqrMM3xsoN6FlHFf | Create coupon_matches Table | KEEP (archive) — migration reference |
| kucXuu7OeYFg9J3N | HEB Coupons - Schema Migration 001 | KEEP (archive) — migration reference |

## 7. Search HEB Coupons Tool — STILL NEEDED

**ID:** KKKbI3qVROijhfFG
**Status:** Inactive
**Called by:** Match Coupons AI (CuaKAgmacIOTN6vW) — active parent

This sub-workflow is referenced by the active "Match Coupons AI" workflow as a tool (`toolWorkflow` node). n8n sub-workflows called via Execute Workflow / Tool Workflow nodes **do not need to be active** — they're invoked directly by the parent. **Do not delete.**

However, if coupon matching stops working, check that this workflow still exists and hasn't been accidentally deleted.

## 8. HSA Workflows

| ID | Name | Status | Recommendation |
|----|------|--------|---------------|
| OtnZdkHRMg15Wwho | HSA Step 2 - Manual Uploads | ACTIVE | DEACTIVATE if HSA project is on hold |
| UYAEyoLVwOXG2g1N | HSA Step 1 - Amazon Invoice Processor | Inactive | DELETE or KEEP based on HSA project plans |
| 9gWDTBJQydpbysmd | HSA Step 3 - Generate Report | Inactive | DELETE or KEEP based on HSA project plans |
| qE4p5fQ0gRZWlTWb | HSA Analyzer - AI Agent Workflow | Inactive | DELETE |
| aOibg3RxHwYo3Nr6 | HSA Analyzer - Simple Working Version | Inactive | DELETE |
| vFOf90ObhSvh5v5N | HSA Analyzer - Modern AI Workflow | Inactive | DELETE |

**Recommendation:** Deactivate "HSA Step 2" to stop it from running. Keep Steps 1-3 if you plan to continue the HSA project; delete the three Analyzer experiments.

## 9. Tagging Strategy

Create these tags in n8n and apply them:

| Tag | Apply To |
|-----|----------|
| `grocery` | All 15 active grocery workflows |
| `coupon` | Fetch HEB Coupons, Match Coupons AI, Search HEB Coupons Tool |
| `recipe` | Choose Instructions, Grab Instructions, AI Meal Creator (3) |
| `migration` | Create coupon_matches Table, HEB Coupons Schema Migration 001 |
| `hsa` | All HSA-related workflows |

## Summary

| Action | Count |
|--------|-------|
| Workflows to DELETE | ~23 |
| Workflows to DEACTIVATE | 2 (My workflow 4, HSA Step 2) |
| Workflows to KEEP (archive) | 3 (Clear Chat History, 2 migrations) |
| Active workflows needing auth update | 15 |
| Sub-workflow to preserve (inactive but called) | 1 (Search HEB Coupons Tool) |
