# F6 + F8 — what quantity the shopper actually sees

**Status: SHIPPED 2026-09-18** (`85ff13d`). Display-only; nothing stored changed.
Gates at merge: lint clean, Jest **530 / 53 suites**, Playwright e2e **126**.

> This document was rewritten after an adversarial review killed its first
> version. The original proposal and why it was wrong are kept in
> "The design that was killed" below, because the reasoning generalises.

## The two defects

### F6 — the purchase quantity and the purchase unit were concatenated, and overlapped

`Ingredient Agent` → `Convert to Shopping List` (`UqXlXX5uPWlGvhU6`) is a
deterministic Code node — **there is no AI in this path**, contrary to an earlier
note that said the AI returns `purchaseQuantity`. Its `toPurchaseQuantity()`
returns two fields whose jobs overlap: `purchaseQuantity` already carries a unit
noun, and `purchaseUnit` names the package.

| rawQuantities | purchaseQuantity | purchaseUnit | used to render |
|---|---|---|---|
| weight ≤ 16 oz | `1 lb` | `1 lb package` | **Buy: 1 lb 1 lb package** |
| weight ≤ 32 oz | `2 lbs` | `1 lb package` | **Buy: 2 lbs 1 lb package** |
| paste | `1 small can` | `6 oz can` | **Buy: 1 small can 6 oz can** |
| volume ≥ 3 tsp | `1 small jar` | `small jar` | **Buy: 1 small jar small jar** |
| volume ≤ 1 cup | `1 container` | `small container` | **Buy: 1 container small container** |
| volume ≤ 4 cups | `1 quart` | `32 oz container` | **Buy: 1 quart 32 oz container** |
| garlic | `1 head` | `whole head` | **Buy: 1 head whole head** |
| count > 1 | `4` | `items` | Buy: 4 items |
| count ≤ 1 | `1` | `item` | Buy: 1 |
| unit contains "can" | `2 cans` | `14.5 oz can` | **Buy: 2 cans 14.5 oz can** |
| unrecognised unit | `8 tbsp` | `as needed` | **Buy: 8 tbsp as needed** |

There were **six** render sites, not the three the first version of this spec
claimed:

| # | site | shape it receives | old output |
|---|---|---|---|
| 1 | `RecipeIngredients.js:760` | purchase strings | `Buy: 1 lb 1 lb package` |
| 2 | `RecipeIngredients.js:781` | purchase strings | `= 3 × 1 lb 1 lb package` |
| 3-4 | `RecipeIngredients.js:403-404` | purchase strings | same, in the confirmation view |
| 5 | `cart/MatchCard.js:32` | **bare INT + Unit** | **`2 1 lb package`** |
| 6 | `instore/ShoppingItems.js:85` | **bare INT + Unit** | **`2 1 lb package`** |

Sites 5 and 6 are the H-E-B Cart Builder and In-Store Mode — the screens where a
wrong string costs money or a wasted trip. Neither had any guard. Both read
`WeeklyGroceryList.Quantity` (an INT) with `Unit` alongside, so they produced the
second half of the defect: two numbers jammed together.

### F8 — the Grocery List and Review screens showed no quantity at all

`staples/ItemRow.js` rendered `{item.ItemName}` and nothing else, and
`staples/ReviewScreen.js`'s `ReviewRow` the same. Those are the screens the
shopper shops from, so an inflated quantity was invisible until the Cart Builder
spent it — exactly how F2's ratchet went unnoticed.

## What shipped

**`src/utils/formatPurchase.js`** — one source of truth, 61 unit tests. Three
exports, because three callers want genuinely different things:

- `formatPurchase(quantity, unit)` — prose, for the `Buy:` lines.
- `formatPurchaseBadge(quantity, unit)` — the Cart Builder / In-Store pill.
  Identical except a unit-less count keeps the `×N` prefix those two pills have
  always shown. Deliberate: most rows have a NULL unit (708 `Staples` and 75
  `MealIngredients` rows live), so turning "×1" into "1" would have churned
  nearly every line for no benefit. The F6 fix changes only the broken strings.
- `summarizePurchase(item)` — the list/review row suffix.

The rules, each derived from observed data rather than invented:

1. No usable quantity → `''`. Never `0`, `NaN` or `undefined`.
2. **A quantity that already contains a word wins alone.** `1 small jar` +
   `small jar` → `1 small jar`. Secondary package detail is dropped on purpose:
   `toPurchaseQuantity` picks it arbitrarily anyway (4 oz of sweet peppers
   becomes "1 lb package"), so it is not worth garbling the line for.
3. **A unit that says nothing is dropped**: `''`, `null`, `item`, and
   `as needed`. `as needed` is not a unit — it is the aggregator's fallback for
   an unrecognised one, and live data pairs it with real counts of 2-4, so
   "4 as needed" was reachable.
4. **A bare count plus a digit-leading unit joins with `×`**: `2 × 1 lb package`,
   never `2 1 lb package`.
5. Otherwise `<count> <unit>`: `4 items`.
6. On a row, a bare `1` is suppressed entirely — it says nothing a checkbox has
   not already said. 708 live `Staples` rows are Quantity 1 / Unit NULL and stay
   clean; the **31** rows a shopper genuinely set to 2-10 still show.

`summarizePurchase` reads `QuantitySelected` **or** `Quantity`, deliberately: the
two branches of `fetch_grocery_items` disagree. `Pull Current Week Grocery List`
aliases the column `QuantitySelected`; `Pull Clean Slate Grocery List` — taken
when the week has no rows yet — returns `1 AS Quantity` and has **no
`QuantitySelected` column at all**. The first version of this spec asserted
"every row returns QuantitySelected" as verified fact; it is false, and a fresh
week only rendered correctly by accident.

### Out of scope, deliberately

- `chat/plannerChatAdapter.js:150` also joins a quantity and a unit, but with
  **recipe amounts** from the agent's recipe-detail response (`category.items`,
  `item.quantity`/`item.unit`), not purchase quantities. Different shape, not
  this defect.
- The *choice* of package size in `toPurchaseQuantity` (why 4 oz of peppers
  becomes a 1 lb package) is a separate judgement call and untouched.

### Test coverage that did not exist before

`e2e/fixtures/n8n/fetch_grocery_items.json` had all 42 rows at
`QuantitySelected: 1, Unit: null`, so the entire e2e suite was blind to any of
this. Two meal rows now carry a digit-leading unit and a word unit, and one
staple sits above 1, with a `plan.spec.js` test asserting the separator is
present and the jammed form absent.

`RecipeIngredients.test.js` asserted `getByText('2 lbs 1 lb package')` — written
for F3 (a unit-bearing quantity must not be multiplied by itself) and freezing
the F6 duplication in place as a side effect. Updated; the F3 guarantee it exists
for is unchanged.

## The design that was killed, and why it generalises

The first proposal changed `purchaseQuantity` to a bare count and pluralised
`purchaseUnit` into `1 lb packages`, so the two fields would have disjoint jobs
and could always be joined. An adversarial reviewer killed it on evidence:

- **`purchaseUnit` is written to `WeeklyGroceryList.Unit`**, which the scraper
  reads directly (`heb-cart-routes.js`, `GET /api/heb/weekly-items`). So it was
  never "presentation only" — it was a stored-data format change.
- Sites 5 and 6 have **no guard**, so pluralising would have made them render
  `2 1 lb packages` — reintroducing the exact defect being fixed, on the two
  highest-stakes screens, which the spec had never opened.
- Old and new shapes would have coexisted in the table indefinitely.

**The lesson: when a formatting bug spans several screens, inventory every render
site BEFORE choosing between fixing the data and fixing the display.** Fixing the
display needed no coexistence story, no migration, and could not reach the
scraper. Counting the sites is what made the cheaper design visible.

Two claims the reviewer checked and cleared, worth not re-chasing:
- `smart_match_grocery` → `Build Match Prompt` reads only `item.quantity`; it
  **never reads `item.unit`**, so AI product matching is unaffected by anything
  here.
- `Transform for DB Input` extracts `Quantity` via `qs.match(/^([\d.]+)/)`, i.e.
  it already discards everything after the leading number, so
  `WeeklyGroceryList.Quantity` genuinely does not change.
