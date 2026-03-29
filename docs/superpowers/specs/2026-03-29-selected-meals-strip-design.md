# Selected Meals Docked Strip — "Warm Shelf"

## Problem

Feedback #12: "There's no easy way to see the meals I've already added for the week."

The only way to view selected meals is clicking the "Meal Plans" button in the ChatBot toolbar, which is easy to miss. The MealCreator tab has no access to the selected meals panel at all.

## Solution

A terracotta-tinted docked strip positioned above the chat input area on both the AI Planner (ChatBot) and Create Recipe (MealCreator) tabs. Shows the meal count and a "View All" button that opens the existing Selected Meals side panel.

## Visual Design

**Strip style — "Warm Shelf":**
- Background: warm gradient (`linear-gradient(135deg, #2a2520, #332d28)`)
- Top border: `1px solid rgba(193,120,73,0.3)` (terracotta glow)
- Left side: terracotta icon (gradient `#c17849` → `#d4915e`, 28px, rounded-lg, warm shadow) + two-line text ("3 meals planned" / "this week")
- Right side: "View All →" button with terracotta outline (`rgba(193,120,73,0.3)` border, `#e09565` text)
- Hidden when `selectedMeals.length === 0`
- Animate in/out with framer-motion (slide up + fade)

**Layout position (bottom of chat area, top-down):**
```
[ Chat messages (scrollable)              ]
[ ── Warm Shelf strip ──                  ]  ← NEW
[ Chat input + Send button (pb-6)         ]
[ ── Bottom tab bar ──                    ]
```

## Behavior

- **View All button**: opens existing `showMealsPanel` side panel (same sliding panel currently triggered by "Meal Plans" toolbar button)
- **ChatBot tab**: reuses existing `showMealsPanel` state and panel component
- **MealCreator tab**: adds `showMealsPanel` state + renders the same meals panel with remove capability
- **0 meals**: strip is hidden (AnimatePresence exit animation)
- **Meals added/removed**: count updates reactively via `selectedMeals.length`

## Files to Modify

- `src/components/ChatBot.js` — add strip component above input area (line ~907), between the scrollable messages and the input div
- `src/components/MealCreator.js` — add strip + `showMealsPanel` state + meals panel rendering (MealCreator currently has `selectedMeals` prop but no panel)

## Data Flow

Both components already receive `selectedMeals` and `setSelectedMeals` as props from App.js via Meals.js. No new data fetching or state management needed. The strip reads `selectedMeals.length` for the count, and the panel iterates `selectedMeals` to show cards.

## Testing

- Verify strip appears on ChatBot when meals > 0
- Verify strip appears on MealCreator when meals > 0
- Verify strip hidden when meals === 0
- Verify "View All" opens the meals panel on both tabs
- Verify removing a meal from the panel updates the strip count
- Verify desktop layout (lg:) works correctly
- Run existing test suite: `npm test`
