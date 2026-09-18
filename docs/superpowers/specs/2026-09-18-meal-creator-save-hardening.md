# Hardening `AI Meal Creator - Save to DB` — escape at the point of use

**Status: SPEC, revised 2026-09-18 after two adversarial reviews.**
Both returned **SHIP WITH CHANGES**; every required change is folded in below.
Workflow `n4lUGlBwxX34tpj7`, **ACTIVE**. Writes six live tables.

---

## The premise this started from was false, and that matters

The session opened with a confirmed observation and a hypothesis built on it:
`Process Ingredients, Instructions & Tags` builds five INSERTs by raw string
concatenation and **has no `sqlEscape` helper at all** — therefore an apostrophe
in LLM-written `instruction_text` ("Sauté until they're golden") must break the
save. That was never reproduced.

**It does not break.** Escaping already happens one node earlier.
`Validate & Parse Recipe` defines:

```js
function esc(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "''").replace(/\\/g, '\\\\');
}
```

and applies it to **every** string field before `Process Ingredients` ever runs:
`recipe_name`, `recipe_description`, `notes`, and per row
`ingredient_name`, `ingredient_category`, `unit_name`, `preparation_notes`,
`instruction_text`, and every tag.

(The two `.replace` calls are order-independent here, which is worth stating
because it looks like a bug: `'`→`''` introduces only quotes and `\`→`\\`
introduces only backslashes, so neither transforms the other's output.)

### Reproduction, live, reverted

Recipe 72 was saved through the real webhook with apostrophes in all six string
fields. **HTTP 200**, and every one of the six tables stored the apostrophe
correctly:

| table | stored value |
|---|---|
| `recipes.recipe_name` | `ZZTest Corey's Apostrophe Probe` |
| `recipes.notes` | `Don't keep this row; it's a test.` |
| `recipe_instructions.instruction_text` | `Saute the herb until they're golden, but don't let it burn.` |
| `ingredients.ingredient_name` | `zztest cook's apostrophe herb` |
| `recipe_ingredients.preparation_notes` | `chopped, don't stem it` |
| `tags.tag_name` | `zztest-apostrophe` |

It also resolved `chicken thighs` to the existing ingredient 274 rather than
minting a duplicate. All rows deleted by `id > watermark`; baseline confirmed.

**So there is no escaping bug to fix. There are five other things.**

---

## The defects

### D1 — the save response echoes SQL-escaped text to the user

`Aggregate Results` reads `recipeName` from `$('Process Ingredients…')`, which
carries `recipe.recipe_name` straight out of the **escaped** `Validate` output.
The live response was:

```json
{"success":true,"recipeId":72,"recipeName":"ZZTest Corey''s Apostrophe Probe", …}
```

That doubled apostrophe is rendered to the user in three places:

| site | use |
|---|---|
| `MealCreator.js:323` | `toast.success(`"${data.recipeName}" saved to your recipe book!`)` |
| `MealCreator.js:843` | the save-confirmation screen heading |
| `MealCreator.js:373`, `:410` | `name: saveResult.recipeName` — the meal pushed into the selected-meals panel |

The database is correct; only the response is wrong.

### D2 — `ingredient_order` and `step_number` are the last unvalidated interpolations

Every other interpolated number is coerced in `Validate & Parse Recipe`:
`quantity` through `fractionToDecimal`, `optional` through a ternary,
`time_minutes` through `parseInt(...) || null`. These two are not:

```js
ingredient_order: ing.ingredient_order || (idx + 1)
step_number:      inst.step_number || (idx + 1)
```

Both land bare in SQL. **Reproduced:** `ingredient_order: "NOT_A_NUMBER"` →
**HTTP 500**. The LLM supplies these fields, so this is a live crash path, and
on an authenticated endpoint it is also the node's one genuine injection surface.

### D2b — `fractionToDecimal` has no zero-denominator guard *(found by review)*

```js
const fractionMatch = val.match(/^(\d+)\/(\d+)$/);
if (fractionMatch) return parseInt(fractionMatch[1]) / parseInt(fractionMatch[2]);
```

Executed directly: `"5/0"` → `Infinity`, `"0/0"` → `NaN`. Both interpolate into a
bare numeric SQL slot as the literal text `Infinity` / `NaN` — the same 500 as
D2, and **not** covered by D2's fix. Fixed here because it is one line and
leaving a known crash inside the node being hardened for exactly this class would
be indefensible.

### D3 — a failed save leaves an orphaned `recipes` row

`Insert Recipe` commits before `Execute SQL Statements` runs, and there is no
transaction. The D2 reproduction left **recipe 73 with 0 ingredients, 0
instructions and 0 tags**.

The statements are **fail-fast, not per-item**: the failing statement aborted
every statement after it, so that recipe's valid instructions and tags never ran.

### D4 — escaping lives in a different node from the concatenation

The latent landmine the original hypothesis was reaching for. Nothing in
`Process Ingredients` says its inputs are pre-escaped; the invariant is
undocumented and enforced nowhere. Any field added there in future — or any edit
to `Validate` that drops a field from `esc()` — is unprotected by default, and
the failure mode is a silent SQL break, not a test failure.

---

## The design: escape at the point of use, once

**Do not add a second `sqlEscape` on top of the existing `esc()`.** Escaping the
same value twice stores `Corey''s` as literal text across six tables — it turns a
non-bug into data corruption. D1 and D4 have to be solved together, and solving
them together is what makes both simple:

> **`Validate & Parse Recipe` stops escaping and emits clean data.
> Every node that builds SQL escapes its own values at the moment it builds them.**

That is the pattern the rest of this codebase already settled on — the other
active workflows escape inline at the SQL node, and `Create Grocery List -
Meals`'s `Transform for DB Input` has a local `sqlEscape`. This brings the outlier
into line. D1 then disappears for free, and D4 is closed.

No change to what is **stored**: `'`→`''` is un-escaped by MySQL on the way in
either way; the same escape simply moves one node later. That is verified as an
explicit acceptance test rather than argued, because "nothing stored changes" is
exactly the kind of claim that deserves evidence.

**Escaping correctness confirmed against the live server, not assumed:**
`SELECT @@global.sql_mode` returns
`ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION`
— **`NO_BACKSLASH_ESCAPES` is absent**, so `\\` is the correct escape for one
literal backslash.

### Change 1 — `Validate & Parse Recipe`

Replace `esc()` with a `clean()` that only strings (keeping the `if (!str)
return ''` behaviour so downstream nulls stay empty strings), rename all nine
call sites, and add:

```js
function posInt(val, fallback) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
```

`ingredient_order: posInt(ing.ingredient_order, idx + 1)`.

**`step_number` needs more than `posInt`.** Live schema check:
`recipe_instructions` carries `UNIQUE KEY unique_recipe_step (recipe_id,
step_number)` (`NON_UNIQUE = 0`). So if one instruction supplies a valid
`step_number: 2` and another supplies an invalid one whose fallback is also `2`,
the INSERT violates the unique key and 500s — and the LLM emitting the *same*
valid number twice fails identically. `step_number` is therefore assigned
through a used-set that takes the next free positive integer on collision, which
removes the class rather than relying on the error path. `ingredient_order` has
**no** uniqueness constraint (recipe 36 already carries ten duplicated values
live), so it needs no such treatment.

And D2b:

```js
const num = parseInt(fractionMatch[1]);
const den = parseInt(fractionMatch[2]);
const ratio = den === 0 ? 0 : num / den;
return Number.isFinite(ratio) ? ratio : 0;
```

### Change 2 — `Process Ingredients, Instructions & Tags`

Add a local helper:

```js
function sqlEscape(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\\/g, '\\\\').replace(/'/g, "''");
}
```

and call it **inline at each SQL slot**, written out literally rather than
described — the first review's main finding was that prose here invites the
implementer to hoist one escaped local per field and reuse it for both the SQL
and the reporting metadata, which quietly puts the escaped form back into the
metadata. Every SQL interpolation site, enumerated and cross-checked against the
live `jsCode`:

| statement | escaped |
|---|---|
| `ingredient_master` | `ing.ingredient_name`, `ing.ingredient_category` |
| `recipe_ingredient` | `ing.preparation_notes`, `ing.unit_name` ×2, `ing.ingredient_name` (WHERE) |
| `instruction` | `inst.instruction_text` |
| `tag_master` | `tagName` |
| `recipe_tag` | `tagName` (WHERE) |

**Load-bearing:** the `recipe_ingredient` INSERT matches the ingredient by name
against the row the master INSERT just created. Both sides must be escaped the
same way, or the `WHERE` misses and the statement silently inserts **zero rows**
while reporting success. The apostrophe reproduction proves they line up today
(`recipe_ingredient` 927 → `ingredient_id` 930); the same must hold after.

The `ingredient_name` / `tag_name` / `recipeName` fields on each emitted item are
**reporting metadata and stay unescaped**. Correcting the first version of this
spec: it called that "load-bearing", which overstates it — `Aggregate Results`
reads only `recipeId`, `recipeName` and `type`, so nothing downstream consumes
`ingredient_name` or `tag_name` today. Keeping them clean is **future-proofing**,
and `recipeName` is the one that genuinely carries D1's fix.

### Change 3 — `Insert Recipe`

`Validate` no longer escapes, so this mySql node escapes inline:

```
'{{ String($json.recipe_name).replace(/\\/g, '\\\\').replace(/'/g, "''") }}'
```

for `recipe_name`, `recipe_description` and `notes`. `difficulty_level` is
already whitelisted to `easy|medium|hard` and needs nothing.

**This exact expression shape is already running in production** —
`Grocery Prep Orchestrator` (`SgEykcbXCexjTe6l`, active), nodes `Update: Docker`
and five siblings, use the identical single-quote/double-quote/backslash nesting
inside a single-quoted SQL literal, with successful executions. So the quoting
parses; this is not a novel construction.

**Reminder that cost a day:** an n8n query field is compiled as a **JS template
literal**. No backticks, no comments. Reasoning goes in `node.notes`.

### Change 4 — clean up the orphan (**D3**)

A new mySql node **`Cleanup Failed Recipe`** between `Execute SQL Statements`
[output 1] and `Respond 500`. The first version of this spec left the two riskiest
details as a placeholder; both are now specified, because the second review
showed the naive reading breaks the response itself.

**`recipeId` source.** On the error branch `$json` is the n8n error object —
live execution 27532 shows `{message: "Unknown column 'NOT_A_NUMBER' …", error:
{…}}` with **no `recipeId` anywhere**, so `{{ $json.recipeId }}` would resolve to
`undefined` and make the cleanup node itself throw. Every item
`Process Ingredients` emits carries `recipeId`, and `Aggregate Results` already
reads it that way in production. Use:

```
{{ Number($('Process Ingredients, Instructions & Tags').first().json.recipeId) || -1 }}
```

`-1` matches no row, so a missing value can never widen the `DELETE`.

**Wiring and error handling.** `onError: continueErrorOutput`, with **both**
outputs wired to `Respond 500` — matching `Remove Weekly Selection`'s
`Cleanup Orphan Meal Ingredients`, which is the uniform pattern for every
mid-chain DELETE in this instance. Without it the node defaults to stopping the
workflow, and if its SQL were ever invalid nothing would call any Respond node:
the caller would get an uncontrolled fallback with none of `Respond 500`'s CORS
headers, which the browser reports as an opaque network failure instead of the
message `MealCreator.js:329` expects.

**A fear from memory that review refuted, recorded so it is not re-litigated:**
a 0-row *SELECT* stops the flow on this n8n version, but a 0-row **DELETE** does
not — `Delete Selection` in execution 27296 emitted `{"success": true}` on
output 0 with 0 rows matched. So the cleanup node is safe when there is nothing
to delete, which is the common case.

**The guard** covers all five cascading children, not three. Live
`REFERENTIAL_CONSTRAINTS` check: `ratings`, `recipe_ingredients`,
`recipe_instructions`, `recipe_tags` **and `weekly_selections`** all reference
`recipes.recipe_id` `ON DELETE CASCADE`:

```sql
DELETE FROM recipes
WHERE recipe_id = {{ … }}
  AND NOT EXISTS (SELECT 1 FROM recipe_ingredients  ri WHERE ri.recipe_id  = recipes.recipe_id)
  AND NOT EXISTS (SELECT 1 FROM recipe_instructions ri WHERE ri.recipe_id  = recipes.recipe_id)
  AND NOT EXISTS (SELECT 1 FROM recipe_tags         rt WHERE rt.recipe_id  = recipes.recipe_id)
  AND NOT EXISTS (SELECT 1 FROM weekly_selections   ws WHERE ws.recipe_id  = recipes.recipe_id)
  AND NOT EXISTS (SELECT 1 FROM ratings             ra WHERE ra.recipe_id  = recipes.recipe_id)
```

Deliberately conservative: it removes **only** a recipe with no children at all.
A *partially* saved recipe is left in place and still reported as a failure —
silently deleting rows that did land would be worse than leaving a visible mess.

There is no race with the frontend adding the recipe to the week:
`addToThisWeek()` is gated on `if (!saveResult || isAddingToWeek) return;` and
`saveResult` is only set inside `if (data.success)`, so a 500 never populates it.

#### Residual orphan paths — accepted, and why

The second review enumerated every path that can leave an orphan. This node
covers the one that is reproducible and reached in practice
(`Execute SQL Statements` errors). Three others bypass it:

- `Process Ingredients` throws → `Respond 500` directly. Only throws on
  `!recipeId`, which cannot happen once `Insert Recipe` has succeeded.
- `Aggregate Results` throws → `Respond 500` directly. No realistic trigger.
- **`DB ok?` false → `Respond 503`.** This one is realistic: the guard exists to
  catch a silent `Execute SQL Statements` no-op, i.e. exactly the state where a
  `recipes` row is real and its children never landed.

`DB ok?` false is **deliberately left uncovered**. That branch means *"the
database cannot be trusted right now"* — it is the state a dropped connection
produces — so firing another `DELETE` into it is the least reliable moment to try
and the worst moment to be wrong. The orphan is better swept later, when the
database is known good. The natural home is the existing daily 5 AM maintenance
workflow, which already sweeps stale `prep_jobs`; that is a follow-up, not part
of this change.

So the verification claim is scoped honestly: *no orphan survives a failed
`Execute SQL Statements`* — not *no orphan can ever exist*.

---

## Out of scope, deliberately

- **`Aggregate Results` reports attempted, not successful, statements.** It
  counts `$('Process Ingredients…').all()` by `type` and assigns
  `const allInputs = $input.all();` which is **never used**. With fail-fast
  behaviour a partial run reaches `Respond 500` rather than reporting inflated
  counts, so this is latent, not live. Fixing it means reasoning about n8n's
  per-item error routing — its own piece of work.
- **Goal #1b** (resolving LLM ingredient names against the catalogue) — Corey's
  decision: spec only, in
  `2026-09-18-ai-ingredient-catalogue-resolution.md`.
- The `INSERT IGNORE INTO ingredients` behaviour itself.

---

## Verification plan

Nothing claimed without evidence. All six tables watermarked with `MAX(id)`
(never `information_schema.AUTO_INCREMENT` — observed stale), revert path proven
with a no-op `DELETE` **before** any write, children-first delete order.

Baseline to return to: `recipes` 70 / `ingredients` 888 /
`recipe_ingredients` 910 / `recipe_instructions` 892 / `tags` 446 /
`recipe_tags` 498 rows / `WeeklyGroceryList` 3693 / `weekly_selections` 181, with
`GroceryItems` 347–349 left intact.

1. **Acceptance test (Corey's):** a recipe with an apostrophe in an instruction
   saves cleanly — re-run the recipe-72 payload, assert all six tables store
   single apostrophes, **and** that the response now returns `Corey's`, not
   `Corey''s`.
2. **Backslash**, which `esc()` also handled: `preparation_notes` containing
   `a\b` stores as `a\b`.
3. **No double-escape:** a title containing a literal `''` round-trips as `''`,
   not `''''`.
4. **D2:** `ingredient_order: "NOT_A_NUMBER"` and `step_number: "x"` save
   successfully at the fallback ordinal instead of 500ing.
5. **D2 collision (added by review):** two instructions where one has a valid
   `step_number: 2` and the other an invalid value — must save with distinct
   step numbers, not violate `unique_recipe_step`. Likewise two instructions both
   claiming `step_number: 1`.
6. **D2b:** `quantity: "5/0"` and `"0/0"` save instead of 500ing.
7. **D3:** force an `Execute SQL Statements` failure and assert no childless
   `recipes` row survives, and that the HTTP response is still a well-formed 500
   with CORS headers.
8. Gates: `npm run lint` clean, Jest ≥ **530**, e2e ≥ **126**.

---

## Companion: the sweep

Corey's decision: **`Search Recipes by Keyword` only.**

`sTXl58QGulCKbPcC`, node `Search Recipes`, interpolates `'{{ $json.keyword }}'`
into **three** `LIKE CONCAT('%', …, '%')` clauses with no escaping. The workflow
is marked inactive, which does not protect it: it is registered as an AI tool of
the **ACTIVE** `Blue Apron API Agent` (`UsrnHCWpe6zfIbcn`) via
`parameters.workflowId.value = "sTXl58QGulCKbPcC"`, and sub-workflow tools do not
require activation. The LLM fills `keyword` from user chat, so "shepherd's pie"
breaks it. Both independently confirmed by review.

Both sibling tools of the same agent already do this correctly — `Search Recipes
by Filters` escapes (`f.replace(/'/g, "''")`) and `Get Recipe Details` whitelists
(`/^\d+$/`). A lone oversight, not a pattern.

Fix: escape inline at the node, matching its siblings. One value, three sites.

**Scoped honestly:** `'`-only escaping does not neutralise `%`, `_` or `\` as
`LIKE` metacharacters, so a keyword containing `%` still behaves as a wildcard.
That is unchanged by this fix and identical to what `Search Recipes by Filters`
already accepts. It cannot regress a working search: the escape is a no-op on any
keyword without an apostrophe, and keywords with one do not work today.
