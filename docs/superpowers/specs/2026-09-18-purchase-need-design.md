# Purchase quantities — show the recipe need, size packages from the real product

**Status: DESIGN, approved section by section by Corey 2026-09-18, then attacked by two
adversarial reviews (both folded in). One open question remains — what ×N means — see the
end.** Not yet implemented.

Two slices, one design. Slice 1 ships and is verified live before slice 2 starts.

---

## Why — the problem as it actually is

`Ingredient Agent` (`UqXlXX5uPWlGvhU6`) → `Convert to Shopping List` → `toPurchaseQuantity()`
guesses a package for every meal ingredient, and `Create Grocery List - Meals`
(`CkLhcFEM9Tfc5uxO`) → `Transform for DB Input` stores only two things from that guess:
`WeeklyGroceryList.Quantity = max(1, ceil(leading number) × multiplier)` and
`Unit = the guessed package name`. **The recipe need itself is thrown away.**

The guess is poor. Per `recipe_ingredients` row, live:
- weight: **59 of 138 (43%)** need ≤ 8 oz and are all labelled "1 lb"
- volume: **400 of 442 (90%)** become the identical "1 small jar" — from two branches of
  `toPurchaseQuantity` that are literally the same code

### Where that actually costs money — corrected by review

The first framing ("the cart over-buys") was wrong in emphasis, and the review that caught
it was right on every load-bearing point (all independently verified):

- **Quantity 1 is one package, which you must buy anyway.** "1 lb for 4 oz" does not
  over-buy in the Cart Builder. It is a wrong *label*.
- The genuine cart exposure is rows with `Quantity > 1`: **piece counts spent as package
  counts** (Corn tortillas 12 → 12 packs, Flour tortillas 8, Chicken thighs 4, Pita 4) and
  weights above 32 oz. That path is real — `useCartBuild.js:21` →
  `heb-cart-routes.js:653` `addToCartGraphQL(..., item.quantity)` → `cart-manager.js:552`
  `cartItemV2 { id: skuId, quantity }` — but **it has never fired**: 538 saved matches,
  **0** for a meal ingredient, and only 3 cart sessions have ever added anything.
- **Corey shops in person**: 385 In-Store check-offs across 15 weeks, against those 3 cart
  builds. **In person the label IS the purchase instruction** — "Sweet peppers · 1 lb
  package" at the shelf means a 1 lb bag for a 4 oz need.

So slice 1 (show the truth on the screens read in the store) has the real present-day
value. Slice 2 (the Cart Builder) is pre-emptive and must land **before the first cart is
built for a meal week**.

---

## Decisions (Corey, 2026-09-18)

1. **The number the cart spends for a meal ingredient is decided by the matched product,
   not by the app's guess.** Refined in section 3: arithmetic from the real product size
   where the units line up, the AI matcher only for the mismatches.
2. **Screens a human reads show the recipe need**: Grocery List, Review screen, In-Store
   Mode, and the pre-submit meal screen.
3. **Staples and one-offs keep the count the shopper set.** Only rows with a recipe need
   are re-expressed or re-sized.
4. **Store the ×N multiplier; derive the need at read time** (not store a need string).
   Deciding case: removing a meal never resubmits (`ChatBot.js:273-297` and
   `MealCreator.js:72-90` call `remove_weekly_selection` then `refreshMeals()` only), so a
   stored need would stay wrong for every shared ingredient until the list is regenerated.
   A derived need recalculates immediately.

---

## 1. Data

### Stored: one column

`WeeklyGroceryList.RecipeMultiplier TINYINT UNSIGNED NULL`. NULL means ×1, so every existing
row is already correct.

- `Transform for DB Input` already computes `multiplier` (clamped 1-10, rounded, missing →
  1) and discards it; it now emits it as `RecipeMultiplier` on each item.
- `Insert Meal Ingredients` gets it in **both** places:
  `INSERT INTO WeeklyGroceryList (..., RecipeMultiplier) VALUES (..., {{ $json.RecipeMultiplier }})`
  **and** `ON DUPLICATE KEY UPDATE ..., RecipeMultiplier = VALUES(RecipeMultiplier)`.
  Omitting the second is a known bug class here: a resubmit would keep the old
  multiplier beside a new Quantity.
- The Create Recipe path (`MealCreator.js:395-402`) sends no `quantity`, so it stores ×1 —
  correct, because that path has no multiplier control.

### Stored: one conversion factor

`units.to_base DECIMAL(10,4) NULL`, seeded **with exact parity** to the only conversion the
pipeline has today, `Aggregate Ingredients`' constants:

```
TO_TSP = { teaspoon: 1, tablespoon: 3, cup: 48, pint: 96, quart: 192 }
TO_OZ  = { ounce: 1, pound: 16 }
```

Every other unit stays NULL. Parity matters more than completeness: the pre-submit screen
renders from the JS aggregation and every later screen from this column, so they must
agree or the same ingredient reads differently on adjacent screens. The cost of parity is
small and known — of the units the JS does not convert, only `fluid ounce` is used, in
**2** rows; `gram`, `kilogram`, `milliliter`, `liter`, `gallon`, `dozen` and `package` are
unused. Those 2 rows keep their own unit, exactly as today.

### Derived: the need, at read time

`Pull Grocery Staples` (`JoaR6klT950hwSLB`) → `Pull Current Week Grocery List` is a `UNION`
of two halves — catalogue items joined to the week (`CW`, with subquery `ATTR`) and week
rows not in the catalogue (with subquery `ATTR2`). **Both** attribution subqueries already
join `WeeklyGroceryList w2` → `weekly_selections ws` → `recipe_ingredients ri` on
`ri.ingredient_id = w2.ItemID - 1000`, filtered to the week, to
`DataSource = 'MealIngredients'`, and to `w2.week_start_date >= '2026-04-26'` (the ItemID
convention is unreliable before that). The need is added to **both**, as conditional
aggregation over a `LEFT JOIN units u ON u.unit_id = ri.unit_id`, multiplied by
**`COALESCE(MAX(w2.RecipeMultiplier), 1)`**.

The `MAX()` is not optional. The server runs with `ONLY_FULL_GROUP_BY`, the subqueries are
`GROUP BY w2.ItemID`, and `RecipeMultiplier` is not provably dependent on it. A bare
`COALESCE(w2.RecipeMultiplier, 1)` fails with **ERROR 1055** (reproduced with a stand-in
column), and because this query feeds every Grocery List, Review and In-Store load, the
whole list would fail. The same applies to any other `w2.*` column referenced.

| field | rows that contribute | value |
|---|---|---|
| `NeedOz` | `quantity > 0`, `unit_type = 'weight'`, `to_base` not NULL | `SUM(quantity × to_base)` |
| `NeedTsp` | `quantity > 0`, `unit_type = 'volume'`, `to_base` not NULL | `SUM(quantity × to_base)` |
| `NeedCount` | `quantity > 0` and (no unit, `unit_type = 'count'`, or a weight/volume unit with NULL `to_base`) | `SUM(quantity)` |
| `NeedCountUnit` | the same rows | see fold rule |
| `NeedUnspecified` | `quantity` NULL or ≤ 0, or `unit_type = 'other'` | `1` if any |

**The counted-unit set.** Define it once and use it everywhere — in the `NeedCount` row
filter, the fold rule and the mixed guard, on **both** producers: a unit is *counted* when
`unit_type = 'count'` **or** it is a weight/volume unit with NULL `to_base` (live:
`fluid ounce`, recipe 24 teriyaki glaze `1 fl oz`, recipe 26 worcestershire `0.5 fl oz`).
Those unconvertible units must keep their own name. If the set were read as
`unit_type = 'count'` alone, teriyaki glaze would fold to `piece` and render as a bare
**"1"**, while the pre-submit screen says "1 fluid ounce" — the exact adjacent-screen
disagreement this design exists to prevent. The JS side's `rawQuantities` keys are already
exactly this set plus `''`.

**Fold rule.** A no-unit row is a count of pieces unless the ingredient carries exactly one
unit from the counted-unit set, in which case it adopts it. So `NeedCountUnit` = that single
unit, or `piece` when there is none. This fixes, at the source, the F5 split where
`getBaseUnit('')` and `getBaseUnit('piece')` are different buckets (Whole wheat pita read
"4 items + 4 pieces"), and garlic's lone no-unit "4" joins its cloves. It matches on units,
never on ingredient names.

**Mixed guard.** If an ingredient carries two or more units from the counted-unit set,
`NeedCountUnit = 'mixed'` and `NeedCount` is not trusted. Live today: none — the only
ingredient with two count units is garlic, and that is one no-unit row beside cloves, which
the fold rule resolves.

**Duplicates within a recipe are summed, deliberately — and one recipe's are bad data.**
**2 recipes** hold 13 duplicated `(recipe, ingredient)` pairs (an earlier draft of this
spec miscounted them as 13 recipes). Both producers sum both rows, so parity holds either
way, but they are not the same kind of duplicate:
- **Recipe 59** (3 pairs) is genuine — `preparation_notes` "first dump seasoning" /
  "second dump seasoning". Summing is the real need.
- **Recipe 36** (10 pairs) is a **double-save**: `recipe_ingredient_id` 340-349 and 350-359
  carry identical quantities, units and `ingredient_order` 1-10, with NULL notes (pork
  chorizo `10 oz` twice, jasmine rice `0.5 cup` twice). Summing them shows **20 oz** of
  chorizo for a 10 oz recipe. That is a data defect, not a design one;
  `recipe_ingredients` has no unique key that would have stopped it. See Out of scope.

Optional ingredients are included, per the standing decision that they are shown and
bought.

**What this fixes and what it does not.** After a meal is removed, a shared ingredient's
need recalculates on the next read. `Quantity` does not — `Cleanup Orphan Meal Ingredients`
(`8m4k9rB5p0Z9zdaz`) only deletes orphans and nothing rewrites survivors. That staleness
belongs with F5 and `is_skipped` (all three run through that one DELETE). Slice 2 is built
to tolerate it: the stale `Quantity` only ever acts as an *upper* bound.

**Template-literal hazard.** `Pull Current Week Grocery List` is a long query in an n8n
query field, which n8n compiles as a JS template literal. No backticks and no SQL comments
may be added to it; reasoning goes in `node.notes`. A backtick there once produced
`{success:true}`, zero rows, HTTP 200 and an execution logged as success.

---

## 2. Display

### One shape, one renderer

Every screen renders the same structured need — `{ NeedOz, NeedTsp, NeedCount,
NeedCountUnit, NeedUnspecified }` — through **one** new function, `formatNeed()`, in
`src/utils/formatPurchase.js` (the single source of truth F6 established).

Two producers feed it:
- **after submit** — the section 1 derivation, via `fetch_grocery_items`;
- **before submit** — `Convert to Shopping List` emits the same shape on each ingredient,
  built from the `rawQuantities` it already computes (`weight.total` in oz, `volume.total`
  in tsp, and one group per count unit, where `''` is the no-unit group), applying the
  **same fold rule** to `''`.

They must agree. That is an acceptance test, not an assumption. Three things make it true:

- **`formatNeed()` coerces every field with `Number()` and rounds to 3 dp before
  formatting.** The two producers do not hand it the same types. The n8n MySQL node returns
  DECIMAL as a **string** — execution 27542, `Fetch Recipe Ingredients`, shows
  `"quantity": "10.000"` (`typeof` string) — and `SUM(DECIMAL)` will too, whereas the JS
  producer holds numbers. `formatQuantity`'s count branch is
  `qty % 1 === 0 ? qty : qty.toFixed(2)`; `"12.000" % 1 === 0` is true, so it would print
  the string itself — **"12.000 pieces"**, "0.500 tsp". `formatNeed(undefined, …)` returns
  `''`, which is what makes a frontend-before-n8n deploy harmless.
- **The same counted-unit set and fold rule on both sides.** `Convert to Shopping List`
  applies them to `rawQuantities`.
- **`unit_type` reaches the JS.** `Fetch Recipe Ingredients` selects `u.unit_type`, and the
  JS treats `other` as unspecified, as the SQL does. No live row has an `other` unit with a
  quantity today, but a future "2 pinch" would otherwise become the JS group "2 pinchs"
  while the SQL files it as unspecified.

**`toPurchaseQuantity`'s count branch consumes the folded need.** Otherwise the fold
*creates* a mismatch: `toPurchaseQuantity` parses only the first number of a joined string,
so Whole wheat pita's `"4 items + 4 pieces"` stores `Quantity` **4** (every stored pita row
is 4 — weeks 04-26, 07-12, 07-26) while the screens, folded, say **8**. Lime is worse:
no-unit in recipes 57/60/61 and `piece` in 63/66/68, so the need is 4 but `Quantity` 2 —
and slice 2's bound would then *cut* the correct count of 4 limes to 2. So the stored count
follows the folded need; see section 3 for what this does to the bound.

### Rules

- weight: `10 oz`; at 16 oz and above, `1 lb`, `2 lbs`, `1 lb 4 oz`, `2 lbs 4 oz` —
  `formatQuantity`'s exact pluralisation
- volume: under 3 tsp `2 tsp`; under 48 tsp `3 tbsp`; otherwise `1.5 cups`
- decimals trimmed exactly as `Aggregate Ingredients`' `formatQuantity` trims them, so a
  number reads the same before and after submit
- count: a bare number when pieces are the only group (`Corn tortillas · 12`); otherwise
  worded (`3 cloves`, `2 cans`, `1 bunch`)
- several groups are joined: `1.5 lb + 2 pieces`
- unspecified alone → `as needed`; alongside a real amount, the amount wins (TB-3b's rule)
- `NeedCountUnit = 'mixed'` → the count part is omitted and the row falls back (below)

### Where, in slice 1

| screen | file | today | slice 1 |
|---|---|---|---|
| Grocery List row | `staples/ItemRow.js` | `1 lb package` | `4 oz` |
| Review row | `staples/ReviewScreen.js` (`ReviewRow`) | `1 lb package` | `4 oz` |
| In-Store pill | `instore/ShoppingItems.js` `QuantityPill` ← `InStoreMode.js:148` | `×1 · 1 lb package` | `4 oz` |
| Pre-submit selection list | `RecipeIngredients.js:761`, `:782` | **Buy: 1 lb package** / small "Recipe needs: 4 oz"; `= 3 × 1 lb package` | **Need: 4 oz**; ×3 reads `= 12 oz` |
| Pre-submit confirmation list | `RecipeIngredients.js:404-405` | `3 × 1 lb package` | `12 oz` |

`RecipeIngredients.js:193` also builds a `Notes` string ("Recipe needs: …") from the raw
display text; it goes with the rest.

In-Store Mode reads `fetch_grocery_items` (`InStoreMode.js:135-148`); its second call, to
the scraper's `weekly-items` (`:210-213`), is a coupon lookup by name and never touches
quantity. **So slice 1 needs no scraper change and no Docker rebuild.**

### Render condition and fallback

A row renders its need **when `formatNeed()` produces text** — not by `DataSource`, and not
by "a need field is non-NULL" (a matched row carries `NeedUnspecified = 0`, which is
non-NULL yet renders nothing). In `CW` a name group can hold a skipped staple row and a meal
row together; `CW` then reports `DataSource = 'Staples'` while the need belongs to the meal
row. Keying on the rendered need itself avoids both traps.

A row with no need falls back to today's text (`summarizePurchase`), **never to blank**.
That covers staples, one-offs, weeks before 2026-04-26, F7's unmatched 900000-band rows
(which resolve to no ingredient at `ItemID - 1000`), and the `mixed` guard.

### Deliberately unchanged

- **A checked staple that shadows a recipe ingredient** (Olive oil, Salt, Kosher salt,
  Avocado…) shows only the shopper's count. `Transform for DB Input` drops the meal row
  (`droppedAsStaple`), so there is nothing to derive from, and attaching the recipe's need
  to the staple row would need a name match — which the provenance fix deliberately
  removed.
- **The Cart Builder** (`cart/MatchCard.js`, and `HebCart.js:505` / `:514`, the price and
  coupon estimates) still shows and spends the guess in slice 1. That window has never
  been reachable: no cart has ever been built for a meal week.

---

## 3. Slice 2 — the Cart Builder

### The count: arithmetic first, the AI for the mismatches

HEB supplies a structured `size` for every product. Across `heb_frequent_products`, **380 of
380** rows have one, and **350 (92%)** match a clean format:

| format | rows | meaning |
|---|---|---|
| `N oz` / `N lb` | 220 | weight |
| `N ct` | 73 | count |
| `Avg. N lbs` | 47 | sold by weight |
| `Each` | 17 | one unit |
| `gal` / `qt` / `ml` … | 10 | volume |
| other | 13 | mostly `N lb bag`, a doubled space (`28  oz`), bare `lb` (per-lb), household goods |

By contrast only **18 of 380** product *names* contain a size, so the model cannot be
trusted to read it out of the name — and the frontend currently discards the real field
before the matcher sees it.

When the need and the product's size are in the same kind of unit, the count is
arithmetic, which code gets right every time:

| need | product size | count | today |
|---|---|---|---|
| 12 (pieces) | `20 ct` | **1** | 12 |
| 36 oz | `Avg. 1.39 lbs` | **2** | 3 |
| 2 (pieces) | `Each` | **2** | 2 |
| 2 cans | `14.5 oz` | **2** — a container unit counts products | 2 |
| **4 (pieces), chicken thighs** | `Avg. 1.39 lbs` | **the AI's job** | 4 |
| 1.5 lb + 2 pieces | any | **the AI's job** | 2 |

The AI earns its place only on the mismatches — pieces needed against a product sold by
weight, or a need spanning several groups — where "how many thighs are in a 1.39 lb pack"
takes world knowledge. It still picks the product, exactly as today.

### `packagesFor()`

A pure function in `src/utils/`, exhaustively unit-tested (a prompt cannot be):

```
packagesFor({ need, size, quantity, aiCount }) → { count, basis }
```

1. No need (staples, one-offs) → `quantity`, basis `shopper`. Never re-sized.
2. Need is only "as needed" → `1`.
3. Exactly one need group, and it lines up with the parsed size:
   - weight ↔ weight (`N oz`, `N lb`, `N lb bag`, `Avg. N lb(s)`): `ceil(NeedOz / sizeOz)`
   - volume ↔ volume (`fl oz` = 6 tsp, `pt` 96, `qt` 192, `gal` 768, `ml`, `l`):
     `ceil(NeedTsp / sizeTsp)`
   - pieces ↔ `N ct` / `Each`: `ceil(NeedCount / sizeCount)`
   - **pieces ↔ `Avg. N lb` produce** (product category `Fruit & vegetables`): `NeedCount`.
     HEB counts by-weight produce by the piece — Corey's own purchase history has Fresh
     Zucchini `Avg. 0.45 lb` × **2** and Evercrisp apples `Avg. 0.55 lb` × **4**. These are
     the most common piece needs live (onion, lemon, lime, roma tomato, jalapeño), so
     sending them to the model would be needless risk. `Avg.` **meat** is a pack
     (chicken thighs `Avg. 2.0 lbs` × 1) and stays the model's job.
   - a container count unit (`can`, `package`, `bunch`) ↔ any size: `NeedCount`, one product
     per container. Not right every time — a `N ct` case-pack of cans makes 2 cans 2 packs —
     but the bound keeps it at today's count.
   - basis `arithmetic`

   **"Pieces" means `piece` and the folded no-unit group, and nothing else.** `clove`,
   `cube` and `dozen` go to rule 4. Garlic shows why: a need of `8 clove` against a search
   hit sized `Each` (a head) would otherwise compute **8 heads**.

   **The size parser is strict.** Whitespace runs are collapsed (`28  oz`) and case is
   folded (`EACH`). Simple fractions are parsed (`1/2 gal`, 7 rows, is half a gallon, not
   one). Anything ambiguous is **rejected, never guessed**: `N pk` (9 rows) says nothing
   about what is in a pack, and bare `lb` means priced per pound. A rejected size falls
   through to rule 4.
4. Otherwise, a valid `aiCount` → basis `ai`.
5. Otherwise → `quantity`, basis `fallback`.

**Bases `arithmetic` and `ai` are then bounded:** `count = min(max(ceil(count), 1),
quantity)`; anything invalid → `quantity`. Bases `shopper` and `fallback` return `quantity`
untouched, so the fallback is **exactly** today's behaviour.

That bound is the safety argument. `Quantity` is a rounded-*up* count, so the computed
result **can never exceed what the cart would add today** — slice 2 can only save money.
It makes "Confirm All" and pre-confirmed repeat items safe, since neither can raise a
count. The honest cost: a case where today's guess *under*-buys (a 20 oz need, 8 oz packs,
guess 2) stays under-bought — no worse than now, never better.

**One deliberate exception, from slice 1, stated plainly.** Because `toPurchaseQuantity`
now counts the *folded* need (section 2), a few stored `Quantity` values rise: lime 2 → 4,
Whole wheat pita 4 → 8. In each case today's count was **short** — it read only the first
half of a split need. So the precise guarantee is: *the cart never adds more than today,
except where today's count dropped part of the recipe's own need, and never more than the
need shown on screen rounded up to whole packages.* Pita against a `5 ct` pack is still 2
packs, not 8.

**The bound always uses the `Quantity` on the Cart Builder's own row** — the
`weekly-items` item — never a value merged in from elsewhere (see wiring).

There is deliberately **no fixed ceiling such as 10**. With `≤ quantity` in place it adds no
safety, and it would cut correct counts: "12 cans" at `Quantity` 12 is right, and a cap of 10
would under-buy it below today. (`Quantity` exceeds 10 legitimately — tortillas at ×3 are
12.)

### Wiring

- **Stop discarding the size.** `HebCart.js:208-211` (frequent products) and `:328-332`
  (search results) keep `size`. Live search returns `size` and `pricedByWeight`
  (`cart-manager.js:165-190` `normalizeProduct`), but the cached frequent-products path
  returns `size` **only** — `heb_frequent_products` has no by-weight column and
  `/frequent-cached` (`heb-cart-routes.js:1000-1023`) selects none. So **by-weight is derived
  from the size string** (`Avg. …`, bare `lb`), one rule for both paths, rather than from a
  field half the data lacks.
- **`Build Match Prompt`** (`DDlygjzqHlLs4V1E`) prints each product's size, so the model
  also picks better-sized products, prints each meal item's need (`Need: 4 pieces`), and
  asks for an integer `purchaseCount` on meal items. It already receives `unit` from the
  client (`HebCart.js:321`) and ignores it; the need replaces that role.
- **`Build Match Prompt` also emits `sizeById`**, built from `body.frequentProducts` and
  every item's `searchResults`. Today it emits only ID lists (`validProductsByItem`,
  `validFrequentIds`), and `Format Output` reads nothing but that node's output — so without
  this there is no size to look up.
- **`Format Output`** keeps a `purchaseCount` only if it is an integer ≥ 1, and attaches the
  **validated** product's `size` from `sizeById` — never from the model's text.
- **The need reaches the Cart Builder** by merging `fetch_grocery_items` (which carries the
  section 1 derivation) into `HebCart`'s items by `TRIM(LOWER(ItemName))` — the key
  `Pull Grocery Staples` itself groups on — **only from rows with `IsSelected = 1`**.
  `weekly-items` returns only `is_skipped = 0` rows, but `fetch_grocery_items` groups skipped
  and unskipped rows by name; without that filter a shopper who skipped a meal row and
  checked the same-named staple would have the skipped need attached to the staple. (Latent:
  no such mixed name group exists live since 2026-04-26.) An item whose need does not merge
  falls back to `Quantity`. **No scraper change, no Docker rebuild.**
- **The count is per week and never persisted on the match.** `heb_product_matches`
  persists across weeks (`UNIQUE (grocery_item_id, heb_product_id)`, keyed by item, not
  week) and has no size column; the need changes every week. So the count is computed
  fresh each session.
- **Repeat items need the size list loaded on their path.** Today `runSmartMatch` returns
  early when every item is already confirmed (`HebCart.js:189`, `if (needsMatch.length ===
  0)`) — *before* it fetches frequent products (`:198-200`), which it also keeps in a local
  rather than state. A fully pre-confirmed week would have no sizes at all. So the
  frequent-products fetch moves ahead of that early return and its sizes are kept in state
  as `sizeById`. Coverage is good once loaded: 409 of 538 `heb_product_matches` product IDs,
  and all 6 confirmed ones, exist in `heb_frequent_products`. An unknown size → `Quantity`.
- **`cart/MatchCard.js`** shows both — `Need 12 · Adding 1 × H-E-B Flour Tortillas (20 ct)` —
  with a stepper from 1 to `max(10, Quantity)`. A human override is **not** bounded by the
  computed count: the bound guards against the model and the arithmetic, not against the
  shopper.
- **`HebCart.js:505` / `:514`** (price and coupon estimates) and **`useCartBuild.js:21`**
  spend the same count.

---

## Rollout and verification

Every live write follows the protocol: watermark with `MAX(id)` (never
`information_schema.AUTO_INCREMENT`), prove the revert with a no-op DELETE before writing,
use a throwaway 2020 week, delete by `id > watermark`, confirm the baseline.

### Slice 1, in order

1. **Migration**, via a one-shot n8n workflow per `migrations/README.md`, following
   `Migration: Add Unit to WeeklyGroceryList` (`Q2W9Ugzu0qdOxw0N`): add `units.to_base` and
   seed it, add `WeeklyGroceryList.RecipeMultiplier`. Rollback SQL in
   `migrations/2026-09-18_purchase_need_columns.sql`.
2. `Transform for DB Input` emits `RecipeMultiplier`; `Insert Meal Ingredients` writes it
   and updates it on duplicate.
3. Both attribution subqueries derive the need; the clean-slate branch returns the same
   need columns as NULL, so the two branches' column sets cannot drift apart again.
4. `Fetch Recipe Ingredients` selects `u.unit_type`; `Convert to Shopping List` emits the
   structured need, and `toPurchaseQuantity`'s count branch consumes the folded need.
5. `formatNeed()`, then every render site in the section 2 table.

**Deploy order is migration → n8n → frontend.** The n8n query must not reference
`RecipeMultiplier` or `to_base` before the columns exist, or every list load fails. A
frontend that ships first is harmless only because `formatNeed()` of absent fields returns
`''` and the row falls back — that is a requirement, and it gets a unit test.
6. `e2e/fixtures/n8n/fetch_grocery_items.json`: meal rows carry need fields, with assertions
   that the list shows `4 oz` and not `1 lb package`. A stale fixture once hid F6 from 124
   green e2e tests.

### Slice 1 verification

- On a throwaway week: two recipes that share garlic, **recipe 59** (a genuine duplicated
  ingredient — not recipe 36, whose duplicates are the bad data in Out of scope), a recipe
  with Whole wheat pita or lime (the fold), and tortillas at ×3. Submit, then assert:
  - `RecipeMultiplier` is stored;
  - **for every submitted ingredient, the derived need equals the pre-submit need** —
    excluding, by design, rows the shopper deselected and rows dropped as a staple
    (`droppedAsStaple`), which never reach the list;
  - **compared as rendered text, not just numbers**, for at least one count row and one
    sub-3-tsp row (0.5 tsp black pepper is live) — the DECIMAL-as-string trap only shows
    up in the text;
  - pita / lime: stored `Quantity` now equals the folded need;
  - remove one garlic recipe → **garlic's need recalculates**;
  - resubmit at ×1 → **the multiplier updates** (proves the upsert list).
- A check that `units.to_base` agrees with `TO_TSP` / `TO_OZ` for every unit.
- Gates: lint clean, Jest ≥ 531, e2e ≥ 128. Then Netlify `commit_ref`, and the deployed
  bundle loaded with a cache-bust.

### Slice 2

Starts only once slice 1 is verified live; lands before the first meal-week cart build.

- `packagesFor()` and the size parser unit-tested across all six size formats, every
  mismatch, container units, "as needed", no need, and the bound.
- `smart_match_grocery` called directly with crafted items — 12 pieces against `20 ct`,
  4 chicken thighs against `Avg. 1.39 lbs`, 36 oz against `Avg. 1.39 lbs`. That endpoint
  writes nothing, so this exercises the matcher live, which reaching `MatchCard` never has.
- **Nothing is added to Corey's real HEB cart during testing.** Verification stops at the
  payload `useCartBuild` would send.

---

## Out of scope

- `Quantity` going stale after a meal removal — with F5 and `is_skipped`, through
  `Cleanup Orphan Meal Ingredients`.
- The scraper's navigation fallback, which adds **1** of every item regardless of quantity
  once GraphQL fails three times (`heb-cart-routes.js:~658-677`).
- Showing a recipe's need on a checked staple that shadows it.
- Converting `fluid ounce`, `gram` and the other units the pipeline has never converted —
  a change to both producers at once, for 2 live rows.
- **Recipe 36's ten double-saved ingredient rows** (`recipe_ingredient_id` 350-359, exact
  copies of 340-349). They double that recipe's need (20 oz chorizo for 10 oz). A live data
  fix, awaiting Corey's go-ahead. Adding a unique key to prevent a recurrence would also
  block recipe 59's legitimate duplicates, so any key must include `ingredient_order` or
  `preparation_notes` — a separate decision.
- `weekly_selections` 179-181, which carry a blank `WeekDateRange` (recipes 3, 20, 47,
  created 2026-09-17 18:39:09) and can never match anything. Not from the Create Recipe
  path, which sends a week (`MealCreator.js:376`); cause unknown. Awaiting Corey's
  go-ahead to delete.

---

## Review history

**Review 1 (Fable, on the pre-design proposal): DO NOT APPROVE AS IS.** Every
load-bearing claim was verified independently before acting. It changed the design:

- The money claim was real but had **never fired**, and the author had not checked how
  Corey shops — which, once checked, moved the value to slice 1.
- "Product names embed the package size" was false (18 of 380); the real `size` field
  exists on all 380 and is **stripped client-side**.
- "Every count is human-confirmed" was false: "Confirm All" is one tap
  (`HebCart.js:468-483`), and repeat items load pre-confirmed (`:71-86`).
- "A stored need goes stale no more than `Quantity` does" was true and hollow — `Quantity`
  is itself stale after a removal. This is what moved the design from storing a need
  string to storing the multiplier and deriving the need.
- The need must be structured numbers, not a display string; the Create Recipe path has
  its own submit payload; and the reduce-only bound came from this review.

**Review 2 (Fable, on this spec): APPROVE WITH CHANGES.** It ran the section 1 derivation
as a plain SELECT over the live 2026-07-05 week and matched `Aggregate Ingredients`' totals
**exactly for all 32 meal rows**, found no join fan-out, confirmed the removal of the fixed
cap of 10, and found no `SELECT *`, column-less INSERT, trigger or view that the new columns
disturb. Every load-bearing finding was reproduced before it was accepted. All thirteen are
folded in above; the ones that would have produced a wrong number or a broken endpoint:

- `COALESCE(w2.RecipeMultiplier, 1)` fails with **ERROR 1055** under `ONLY_FULL_GROUP_BY`
  (reproduced) — it would have taken down every list load. Now `MAX()`.
- The counted-unit set was ambiguous; read one way, teriyaki glaze rendered as a bare "1".
- DECIMAL arrives as a string (reproduced), so the shared formatter would have printed
  "12.000 pieces".
- The fold raised the displayed need above the stored count, so the bound would have cut
  a correct 4 limes to 2. `toPurchaseQuantity` now counts the folded need.
- "Pieces" needed a whitelist (garlic → 8 heads); by-weight produce is arithmetic, not a
  model call (proved from purchase history); repeat items never loaded a size list;
  `Format Output` had no size data to look up; the name merge needed an `IsSelected` filter.
- "13 recipes list an ingredient twice" was wrong — 2 recipes, and one is bad data.

## Open question — awaiting Corey

**What ×N means.** Today ×3 means *three of the suggested package*:
`Quantity = ceil(base) × multiplier`. This design shows it as *three times the need*
(`= 12 oz`). A shopper who set ×3 to stock up on three bags would read "12 oz" in the store
and could buy one. This must be settled before implementation, because it decides what
`Quantity` and the need both mean when the multiplier is above 1.
