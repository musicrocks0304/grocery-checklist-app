# F5 — merging synonym ingredients without merging distinct ones

**Status: SPEC ONLY. DEFERRED, nothing implemented.** Written 2026-09-18,
revised the same day after an adversarial review returned **DO NOT SHIP AS IS**.
Corey's decision after reading it: spec only, implement nothing this session.

**Do not implement from this document without re-reading "Blocking work" below.**
One of the required changes touches a live `DELETE` and can lose rows the shopper
still needs, mid-week.

---

## The defect

Ingredient identity is `ItemID = ingredient_id + 1000`. The `ingredients`
catalogue holds rows naming the same grocery, so they get different ids, never
collide on `uq_week_item`, and are bought twice.

Live historical evidence, week `2026-04-26`:

| ItemID | ItemName | Quantity | Unit |
|---|---|---|---|
| 1274 | Chicken thighs | 2 | 1 lb package |
| 1802 | **Boneless chicken thighs** | 2 | 1 lb package |

4 lb bought against 2 lb of need. Week `2026-06-14` carries both `Onion` and
`Yellow onion`.

## Why this is risk HIGH: the reverse mistake is worse than the bug

Naive normalisation merges groceries that must not be merged. Live catalogue:

| id | name | merges? |
|---|---|---|
| 453 / 142 | bell pepper / bell peppers | **yes** — plural |
| 598 / 622 | green bell pepper / red bell pepper | **NO** — colour is a different product |
| 285 / 500 | onion / yellow onion | **see below — do NOT, for a reason found by review** |
| 244 | red onion | **NO** |
| 223 / 580 / 631 | green onions / scallion / scallions | **all three are ONE vegetable** |
| 504 | onion powder | **NO** — a spice, one word from `onion` |
| 274 / 802 | chicken thighs / boneless chicken thighs | **yes for shopping** |
| 83 / 462 / 325 / 340 | chicken breast / boneless / boneless skinless / chopped | **yes for shopping** |

**A correction to the first version of this spec:** it claimed `green onions` is
"a different vegetable entirely" from scallions. That is wrong — scallions *are*
green onions, so 223, 580 and 631 are three rows for one vegetable, and they are
among the strongest merge candidates rather than a counter-example. `green onions`
is a different vegetable from `onion`, which is what the claim should have said.

A wrong merge costs more than the double-buy it replaces: double-buying 2 lb of
chicken wastes money once and is visible on the receipt, whereas merging
`red onion` into `onion` silently changes a recipe and is invisible on the list.

## Proposal: an explicit, curated equivalence table — never an algorithm

```sql
CREATE TABLE ingredient_aliases (
  alias_id      INT AUTO_INCREMENT PRIMARY KEY,
  ingredient_id INT NOT NULL,          -- the row that is an alias
  canonical_id  INT NOT NULL,          -- the row it resolves to
  note          VARCHAR(255) NOT NULL, -- why, in words
  UNIQUE KEY uq_alias (ingredient_id),
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(ingredient_id),
  FOREIGN KEY (canonical_id)  REFERENCES ingredients(ingredient_id)
);
```

- One canonical per alias (the unique key enforces it); a canonical must not
  itself be an alias (check at seed time).
- Seeded **by hand, with a note per row**. No similarity scoring, no plural
  stripping, no LLM in the resolution path.
- Migration-only; merges should be rare and deliberate.

### How the merge actually works — corrected

The first version said "`Transform for DB Input` derives a single
`ItemID = canonical_id + 1000`". **That is not what that node does**, and an
implementer following it would edit the wrong place. Verified by the reviewer:

- **No `ingredient_id` is carried past `Aggregate Ingredients`.** Everything
  downstream is name-string only. `Aggregate Ingredients` groups strictly by
  `row.ingredient_name.toLowerCase().trim()`.
- `Transform for DB Input` (in `Create Grocery List - Meals`) has no
  `canonical_id` in scope at all. It looks the **name** up against a fresh
  `SELECT ingredient_id, ingredient_name FROM ingredients` and computes
  `matchedId + 1000`.

So **the one load-bearing change is `Fetch Recipe Ingredients`**: resolve
`ri.ingredient_id` through the alias table and return the **canonical row's
name**. That shared name then merges in `Aggregate Ingredients`, and
`Create Grocery List - Meals`'s existing name lookup re-resolves it to the
canonical id for free. Nothing downstream needs editing.

## Blocking work — not optional, not "risks to remember"

### 1. `Remove Weekly Selection` → `Cleanup Orphan Meal Ingredients` is a DELETE

Workflow `8m4k9rB5p0Z9zdaz`, **active**. Verified live 2026-09-18:

```sql
DELETE wgl FROM WeeklyGroceryList wgl
WHERE wgl.WeekDateRange = '...' AND wgl.DataSource = 'MealIngredients'
  AND NOT EXISTS (SELECT 1 FROM weekly_selections ws
                  JOIN recipe_ingredients ri ON ri.recipe_id = ws.recipe_id
                  WHERE ws.WeekDateRange = wgl.WeekDateRange
                    AND ri.ingredient_id + 1000 = wgl.ItemID)
```

Once `boneless chicken thighs`(802) merges into `chicken thighs`(274 → ItemID
1274): if the shopper removes the recipe that used 274 but keeps the one using
802, the `EXISTS` computes 1802 ≠ 1274, finds no match, and **deletes a row the
shopper still needs.** This must resolve through the alias table **in the same
deploy** as the attribution join. It is data loss, not mis-labelling.

### 2. `shopping_progress` cascades off that DELETE

`CONSTRAINT fk_sp_wgl FOREIGN KEY (week_start_date, item_id) REFERENCES
WeeklyGroceryList (week_start_date, ItemID) ON DELETE CASCADE` — verified live.
So the delete above also silently removes the shopper's check-off.

### 3. The open week at ship time, not historical weeks, is the boundary case

`Create Grocery List - Meals` inserts with `ON DUPLICATE KEY UPDATE` and never
deletes a row that stops being produced. A week already in progress when this
ships keeps its pre-existing alias-named row **alongside** the new canonical one
on every regenerate, until a recipe is removed and re-added — which invokes the
delete above. "No backfill, past weeks are already shopped" was the wrong framing.

### 4. `yellow onion` → `onion` must be dropped, or `getBaseUnit` fixed first

The first version listed this as merely "flagged". It is empirically broken.
Verified live: ingredient 500 (`yellow onion`) stores `unit_name = 'piece'` for
recipes 46/47/52 and **NULL** for 56/57/60/61. Both mean a count of onions, but
`getBaseUnit('')` → `{group: '', base: ''}` while `getBaseUnit('piece')` →
`{group: 'piece', ...}` — **two different bucket keys**, so the merged line reads
like `"3 items + 3 pieces"` rather than one number. That is worse than today's two
separately-labelled lines. (Plain `onion`/285 has the same split — recipe 59 is
NULL — so the flaw is not specific to the merge.)

The chicken-breast family is unit-safe by contrast: `getBaseUnit` already keeps
`piece` and weight in separate summed buckets, and ingredient 83 alone already
mixes both.

### 5. The seed list is incomplete, and must not be presented as complete

At least these equally obvious pairs exist and would keep double-buying:
`carrot`(5)/`carrots`(84) · `radish`(233)/`radishes`(98) ·
`persian cucumber`(234)/`persian cucumbers`(328) ·
`scallion`(580)/`scallions`(631)/`green onions`(223) ·
`long grain white rice`(15)/`long-grain white rice`(301) ·
`plain non-fat greek yogurt`(675)/`plain nonfat greek yogurt`(17) ·
`pecorino romano`(664)/`pecorino romano cheese`(270) ·
`bbq sauce`(249)/`barbecue sauce`(441) · `jalapeño`(599)/`jalapeno pepper`(188).

Either broaden the seed, or say plainly that this closes three known historical
over-purchases and no more.

### 6. The root cause is untouched — and may be the better first fix

`AI Meal Creator - Save to DB` (`n4lUGlBwxX34tpj7`), node
`Process Ingredients, Instructions & Tags`:

```js
"INSERT IGNORE INTO ingredients (ingredient_name, ingredient_category) VALUES ('" + ing.ingredient_name + "', ...)"
```

Every AI-built recipe inserts a new `ingredients` row for any name that is not a
byte-for-byte match. The only guard is a prompt instruction in
`AI Meal Creator - Full Build` (`ATGuPNtocx6Xypyk`, `Basic LLM Chain`): *"Use the
EXACT name from the existing ingredients list when a match exists."* That rule
demonstrably fails — recipe 58 correctly reused ingredient 274 with
`preparation_notes = "boneless, skinless, about 4-5 thighs"`, while recipes 64/68
created 802 for the same concept.

So an alias table is a symptom fix that someone must keep re-seeding forever, one
migration behind the next AI-authored recipe. **Hardening this insert path
(matching against the catalogue in SQL rather than trusting the prompt) is a
smaller, self-contained change that stops the bleeding**, and is the recommended
first step if F5 is picked up again. It does not fix the three existing
double-buys.

## What is NOT proposed, and why

- **Not merging in the UI** — one line shown, two rows stored: TB-4 inverted.
- **Not editing or deleting `ingredients` rows** — 898 `recipe_ingredients` rows
  point at them, and a recipe should keep saying what its author wrote
  ("boneless, skinless") even when the shopping line consolidates.
- **Not normalising names in SQL** (`REPLACE`, `SOUNDEX`, `LIKE`) — that is what
  merges `onion` with `onion powder`.
- **Not an LLM pass in the resolution path** (defensible as a suggestion tool for
  a human to approve).

## Verified complete — do not re-chase

The reviewer exhaustively grepped all 84 workflows' node payloads, `src/`, and
the scraper repo for `ItemID ± 1000` arithmetic. The **only** live joins are
`Pull Grocery Staples`'s two ATTR subqueries and `Remove Weekly Selection`'s
orphan delete — exactly the two named here. Two inactive migration workflows
share the pattern and are irrelevant. `Save Coupon Matches` keys off
`groceryItemName` strings, so coupon matching is unaffected by a merge.
