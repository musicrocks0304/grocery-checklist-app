# Grocery Staples — Architectural Audit Request

You're picking up a redesign of the **Grocery Staples** screen. The UI has been explored, iterated, and locked down in a working prototype. **Before you write any production code, I need an architectural audit** against our existing codebase.

**Do not start implementing.** Read the prototype, read our code, then come back with findings.

---

## What's in this package

```
design_handoff_staples/
├── PROMPT.md                          ← you are here
├── screenshots/
│   ├── 01-default-loaded.png          ← hero: default state, 10 items selected from 3 meals
│   └── 02-annotated.png               ← same, with zones called out
└── source/
    ├── staples-v5-best-of.jsx         ← the prototype — this IS the spec
    └── staples-shared.jsx             ← shared tokens (ST), icons (SIcon), seed data (S_ITEMS, S_MEALS), ItemRow
```

The prototype is a React sandbox — Babel-in-browser, no bundler, no routing, no backend. **Nothing from it is meant to ship as-is.** It's a high-fidelity behavioral spec. Your job is to figure out what shape this takes in our real stack.

---

## Step 1 — Understand the target

Read the prototype end-to-end. Specifically:

- `source/staples-v5-best-of.jsx` — the full screen component (`V5_BestOf`), meal tabs, meals card, one-off card, category sections, bottom bar.
- `source/staples-shared.jsx` — the `ST` color/typography token object, `SIcon` component, `byCategory` helper, and the seed data shape (`S_ITEMS`, `S_MEALS`).

Look at both screenshots. The annotated one labels the zones in the order they appear top-to-bottom.

### Intended behavior (things that are locked)

These are design decisions I've made — don't talk me out of them without a strong reason:

1. **Meals are not a filter, they're a section.** The "From your meals" card is always visible when `mealFocus === null` (the "All items" tab). Meal pills lens the whole list down to one meal's items.
2. **Quick-add and search are different modes.** Quick-add (terracotta) adds a one-off item to this week's list. Search (sage, toggle-in via the magnifying glass icon) filters the existing staples library. Different intent, different submit.
3. **Checkboxes, not swipe or long-press.** The primary interaction is tap-to-toggle on a row.
4. **Staples persist across weeks; only the `selected` set is per-week.** `S_ITEMS` is the library; `selected` is "what's on this week's list."
5. **One-offs added this session live in their own card** at the top of the scroll region, separate from the static staples.
6. **Week banner is a passive label.** Not navigable, not editable here.
7. **Review button disables when `selected.size === 0`.**

### Intended behavior (things that are open)

Push back on these if the codebase wants them different:

- Whether the "From your meals" card is collapsible (currently is, via chevron).
- Whether meal pills live in the top bar or elsewhere.
- Whether one-offs survive past the current week, or are truly ephemeral.
- Whether the bottom bar should be a sheet, a tab-bar item, or a floating pill.

---

## Step 2 — Audit our codebase

Now look at the existing app and produce a written audit. **I want a document, not code.** Cover these dimensions:

### 2a. Data model

- What does the current `StapleItem` shape look like? Compare to the prototype's (`ItemID`, `ItemName`, `Category`, `DataSource`, `DefaultQty` — see `S_ITEMS` in `staples-shared.jsx`).
- Does the current model distinguish items that come from meals vs. pantry staples? (Prototype uses `DataSource: 'MealIngredients' | ...`.) If not, what would it take to introduce that?
- Is there a `Meal` entity with an `itemIds` relation? If yes, what's the cardinality — can one ingredient belong to multiple meals? The prototype assumes yes (filter by `mealFocus` checks `m.itemIds.includes(i.ItemID)`).
- Is there a per-week "selected list" somewhere already, or does this need to be new? What's its shape — a `Set<ItemID>` keyed by week start date, or a row-per-selection table?
- **One-off items** — where do they live? Are they rows in the staples table with a flag, or a separate ephemeral table? The prototype treats them as first-class items (`oo-${Date.now()}` IDs, added to the same `selected` Set).

### 2b. State management

Map each piece of the prototype's `useState` to something in our codebase:

| Prototype state | What it is | Where does it live in our app? |
|---|---|---|
| `selected: Set<ItemID>` | Per-week checked items | ? |
| `query: string` | Search input | Ephemeral. Component-local? |
| `quickAdd: string` | Quick-add input | Ephemeral. Component-local? |
| `oneOffs: Array<{id, name}>` | Session one-offs | ? Does this persist? |
| `mealFocus: null \| mealName` | Active meal pill | Ephemeral. URL param? Local? |
| `mode: 'quickAdd' \| 'search'` | Which input is active | Ephemeral. Local. |

Flag which of these need to survive navigation away and back, which need to survive app restart, and which are pure UI.

### 2c. Component inventory

Walk the prototype's component tree and, for each, say **reuse / extend / build fresh**:

- `V5_BestOf` (screen) — the container
- Input toolbar (quick-add + Add button + search toggle)
- `MealTab` (individual meal pill) — see staples-v5-best-of.jsx for the inline def
- `MealsCard` — grouped meals section with per-meal subheaders
- `OneOffCard`
- `V5CategorySection` — sticky-header category block with `All` bulk-toggle
- `ItemRow` (defined in staples-v1, pulled in via scope — same row component everywhere)
- Bottom bar with Review CTA

For each: do we have a component that already does 80% of this? What's missing? Any pattern mismatches (e.g., our rows use swipe actions, these don't)?

### 2d. Routing & navigation

- Where does this screen live in the nav tree? Tab? Deep link?
- What does "Review" go to? Is that screen built yet?
- Back behavior — does meal focus survive back? Does scroll position?

### 2e. API & backend contracts

List the mutations and queries this screen needs. At minimum:
- fetch current-week list (items + selected set + meals + one-offs)
- toggle item selection
- add one-off item to current week
- remove one-off item from current week
- search staples library by name

For each: does the endpoint exist? Shape mismatch? N+1 risks if we fetch naively?

### 2f. Migration

If an older grocery-list screen exists:
- What gets deleted?
- What data needs to transform (e.g., old flat list → new meal-grouped structure)?
- Is there a feature flag / phased rollout angle?

### 2g. Performance

- How many items realistically in `S_ITEMS`? (Prototype seed has ~50; real users may have 200+.) Does the current list component virtualize? If not, do we need to introduce that here?
- The meals card re-renders on every toggle. Any memoization wins?
- Search filter runs on every keystroke across all items — debounce needed?

### 2h. Accessibility

- Row semantics — `role="checkbox"` with `aria-checked`? The prototype uses clickable divs.
- Focus management when search toggles in — does focus move to the search input?
- Screen reader announcement of the running count strip as it updates.
- Meal pill bar keyboard nav (arrow keys across horizontal scroll).

---

## Step 3 — Propose a file/folder plan

Sketch where the new code lands in our repo. Something like:

```
src/features/staples/
├── StaplesScreen.tsx              ← container
├── components/
│   ├── InputToolbar.tsx           ← NEW
│   ├── MealTabBar.tsx             ← NEW
│   ├── MealsCard.tsx              ← NEW
│   ├── OneOffCard.tsx             ← NEW
│   ├── CategorySection.tsx        ← extends existing <Section>?
│   └── ReviewBar.tsx
├── hooks/
│   ├── useWeekList.ts             ← NEW, wraps query + mutations
│   └── useMealFocus.ts            ← NEW, local UI state
├── model/
│   ├── types.ts                   ← StapleItem, Meal, WeekList
│   └── selectors.ts               ← groupByCategory, filterByMeal
└── api/
    └── staples.queries.ts         ← NEW endpoints
```

Adjust to our conventions. Flag any proposed name that collides with existing code.

---

## Step 4 — Deliverable

Write a single markdown doc back to me. Structure:

1. **Summary** — one paragraph: net-new lines, files touched, biggest risks
2. **Audit by dimension** — the 8 sections from Step 2
3. **File/folder plan** — from Step 3
4. **Open questions for me** — things you need me to decide before you can scope cleanly
5. **Proposed phases** — if this is big, break it into shippable slices

No code yet. Treat this as a design doc I'll read, react to, and then greenlight for implementation.

---

## Ground rules

- Don't build from your memory of what our app looks like. **Read the actual files.** If you find yourself guessing, stop and grep.
- If something in the prototype conflicts with a pattern in our codebase, flag the conflict — don't silently pick a side.
- No new dependencies without calling them out explicitly in the audit.
- If a section in Step 2 doesn't apply (e.g., we have no a11y story yet so there's nothing to compare against), say so instead of padding.
- Keep the audit to ~1500 words. Bullets over prose. I'll ask follow-ups.
