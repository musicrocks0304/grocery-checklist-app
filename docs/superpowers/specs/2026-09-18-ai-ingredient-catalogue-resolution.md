# Goal #1b — should the AI save resolve ingredient names against the catalogue?

**Status: SPEC ONLY. Corey's decision 2026-09-18: write it up, implement nothing.**
Companion to `2026-09-18-meal-creator-save-hardening.md` (1a, which ships).
This is the root-cause half of **F5** — see
`2026-09-18-ingredient-synonym-merge.md`, which is also deferred.

---

## The defect

`AI Meal Creator - Save to DB` (`n4lUGlBwxX34tpj7`), node
`Process Ingredients, Instructions & Tags`, for every ingredient in an
AI-authored recipe:

```sql
INSERT IGNORE INTO ingredients (ingredient_name, ingredient_category) VALUES ('<name>', '<category>')
```

`ingredients.ingredient_name` is `UNIQUE`, so `INSERT IGNORE` is an exact-match
gate: a byte-identical name is reused, anything else becomes a **new catalogue
row**. Since `ItemID = ingredient_id + 1000` is the grocery list's identity, two
rows naming one grocery never collide on `uq_week_item` and are **bought twice**.

The only thing standing between the LLM and a new row is a prompt instruction in
`AI Meal Creator - Full Build` (`ATGuPNtocx6Xypyk`, `Basic LLM Chain`):
*"Use the EXACT name from the existing ingredients list when a match exists."*

**That instruction demonstrably fails.** Recipe 58 correctly reused ingredient
274 (`chicken thighs`) carrying `preparation_notes = "boneless, skinless, about
4-5 thighs"`; recipes 64 and 68 minted ingredient **802**
(`boneless chicken thighs`) for the same concept.

### How bad it is, measured

| measure | value |
|---|---|
| `ingredients` rows | **291** |
| referenced by at least one recipe | 289 |
| **referenced by exactly ONE recipe** | **143 (49%)** |
| referenced by two | 59 |

A catalogue where half the entries are used once is the signature of a naming
process that does not converge. The chicken family alone:

| id | name | recipes |
|---|---|---|
| 325 | boneless skinless chicken breasts | 6 |
| 83 | chicken breast | 5 |
| 462 | boneless chicken breast | 1 |
| 340 | chopped chicken breast | 1 |
| 274 | chicken thighs | 4 |
| 802 | boneless chicken thighs | 2 |

Six rows, 19 recipes, and for shopping purposes roughly **two** groceries.

### What is NOT broken

Verified live 2026-09-18 by saving a probe recipe through the real webhook: when
the LLM writes a name that already exists exactly, the current code resolves it
correctly — `chicken thighs` matched ingredient **274** and created nothing. The
exact-match path works. The gap is only what happens on a near-miss.

---

## Why the obvious fix is the wrong fix

The instinctive version of 1b is "match the name against the catalogue in SQL
instead of trusting the LLM" — i.e. fuzzy matching (`LIKE`, `SOUNDEX`, prefix or
token overlap, similarity scoring).

**The F5 spec already rejected exactly this, on evidence, and that reasoning
still holds:**

> *Not normalising names in SQL (`REPLACE`, `SOUNDEX`, `LIKE`) — that is what
> merges `onion` with `onion powder`.*

The live catalogue is full of pairs one edit apart that must **not** merge:
`onion`(285) / `onion powder`(504); `green bell pepper`(598) /
`red bell pepper`(622); `onion` / `red onion`(244). A wrong merge is worse than
the double-buy it replaces: double-buying 2 lb of chicken wastes money once and
is visible on the receipt, whereas folding `red onion` into `onion` silently
changes a recipe and is invisible on the list.

So fuzzy matching is out. That constrains 1b sharply, and it is the honest
headline of this document:

> **1b cannot prevent synonym creation on its own.** Preventing it requires
> either fuzzy matching (rejected) or a hand-curated equivalence table
> (F5's `ingredient_aliases`, deferred). Dropping the ingredient is not an
> option — the recipe needs it.

---

## What 1b can usefully do instead: make creation visible

Today a new catalogue row appears with **no signal anywhere**. Nobody learns that
recipe 64 invented `boneless chicken thighs` until someone reads a grocery list
and notices chicken twice. The cheap, independent, zero-risk slice is to stop
that being silent.

### Proposal — report newly-created ingredients on save

1. In `Process Ingredients, Instructions & Tags`, the `recipe_ingredient`
   statement already resolves the name to an id. Add one statement per
   ingredient, or one aggregate query at the end, that reports **which names had
   no pre-existing catalogue row** — i.e. which ones this save created.
   The cheapest correct form is to check existence **before** the
   `INSERT IGNORE`, since afterwards the row always exists.
2. Return that list through `Aggregate Results` as e.g.
   `newIngredients: ["boneless chicken thighs"]`.
3. Surface it on the save-confirmation screen in `MealCreator.js` — the same
   screen that already prints "16 ingredients • 5 steps • 3 tags" — as a quiet
   note: *"2 new ingredients added to your catalogue: …"*.

**Why this is worth shipping even though it prevents nothing:**

- It converts an invisible, compounding data problem into a curatable one, at the
  moment the human is already looking at the screen and can recognise
  "that's just chicken thighs".
- It is the natural **prerequisite for F5**: F5's blocking finding #5 is that its
  hand-seeded alias list *"is incomplete, and must not be presented as
  complete"*. A running log of newly-minted names is precisely the input needed
  to keep such a list current without re-auditing 291 rows by hand.
- Zero blast radius: it changes **nothing** that is stored and nothing on any
  grocery list. It only adds a field to a response and a line to one screen.

### Deliberately NOT proposed

- **Fuzzy / similarity matching in SQL** — rejected above.
- **An LLM pass in the resolution path** — defensible only as a *suggestion* tool
  for a human to approve, never as the resolver. Same objection as F5.
- **Rejecting unknown names and failing the save** — the LLM would have to
  re-author the recipe against the catalogue, and a save that fails because the
  author used a reasonable synonym is a worse product than a save that mentions
  it.
- **Editing or deleting existing `ingredients` rows** — 898 `recipe_ingredients`
  rows point at them, and a recipe should keep saying what its author wrote
  ("boneless, skinless") even when the shopping line consolidates.
- **Hardening the prompt further.** Already the only guard, already failing.
  Worth a line saying so, not worth engineering time.

---

## If F5 is ever picked up, the order is

1. **1a** (`2026-09-18-meal-creator-save-hardening.md`) — escaping at the point
   of use, numeric coercion, orphan cleanup. Independent of all of this.
2. **This document's reporting slice** — so new synonyms become visible and the
   alias seed list can be maintained from evidence rather than an audit.
3. **F5 proper** — the `ingredient_aliases` table, resolved in
   `Fetch Recipe Ingredients`, **and in the same deploy** the fix to
   `Remove Weekly Selection` → `Cleanup Orphan Meal Ingredients`, which is a live
   `DELETE` keyed on `ri.ingredient_id + 1000` that `shopping_progress` cascades
   off. Shipping the merge without it loses rows the shopper still needs,
   mid-week.

Item 3 remains deferred and must not be implemented without re-reading
`2026-09-18-ingredient-synonym-merge.md`.
