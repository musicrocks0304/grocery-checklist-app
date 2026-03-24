# Navigation Restructuring & Bug Fixes Design

**Date:** 2026-03-23
**Status:** Approved
**Feedback IDs:** #5 (bug), #6 (bug), #7 (idea)

## Problem Statement

User feedback identified three related issues on the Plan screen:

1. **Bug #5** — Can't scroll the page when touching inside the item list area on mobile. Only scrollable from the far left/right edges.
2. **Bug #6** — The meal agent sub-menu overlaps the grocery planning header when switching tabs.
3. **Idea #7** — The 3-level navigation (bottom bar > Plan tabs > Meals sub-tabs) is confusing and difficult to navigate.

All three stem from the Plan screen trying to contain two distinct experiences (grocery list + meal planning) within a single tabbed interface.

## Solution Overview

**Promote Meals to its own bottom bar tab.** This eliminates the nested tab structure, separates the grocery and meal planning concerns, and naturally resolves both bugs.

## Design Decisions

### 1. Bottom Tab Bar — 5 tabs becomes 6

```
Plan | Meals | Deals | Cart | Shop | Cook
 📋    🍴      🏷️     🏪    🛍️    👨‍🍳
```

- New `Meals` tab positioned second (after Plan), matching the weekly flow order
- Icon: `UtensilsCrossed` from Lucide
- Label: "Meals"
- `SCREEN_TO_TAB` mapping updated: `chatbot` and `meal-creator` map to `meals`
- Tab `min-w` drops from 60px to ~55px — fits comfortably on 375px+ screens

### 2. Plan Screen — Simplified

Plan.js renders only GroceryChecklist. No tabs, no sub-navigation.

- Remove the Grocery List / Meals tab bar entirely
- Remove mealMode state and sub-tab rendering
- More vertical space for the grocery item list

### 3. New Meals Screen — Segmented Control

New `Meals.js` component with:

- **Segmented control** at top for AI Meal Planner / Create Recipe
  - Background: `bg-surface-alt` rounded pill container
  - Active indicator: `bg-primary` sliding pill with Framer Motion `layoutId`
  - Text: DM Sans, active = white/bold, inactive = muted
  - Compact height (~36px)
- Renders ChatBot (planner mode) or MealCreator (creator mode) below
- Full-height layout (added to `FULL_HEIGHT_SCREENS`)
- State persisted to localStorage as `mealsTabState`

### 4. Bug #6 Fix — Automatic

The meal agent sub-tabs no longer exist on the Plan screen. No code change needed beyond the restructuring.

### 5. Bug #5 Fix — Remove Nested Scroll

**Root cause:** GroceryChecklist's grouped items container has `max-h-[60vh] overflow-y-auto`, creating a nested scroll trap on mobile. Touch events inside the inner container don't propagate to the outer page scroll.

**Fix:** Remove `max-h-[60vh] overflow-y-auto` from the grouped items container. Let items take their natural height and scroll with the single page-level scroll context in AppShell.

Filter controls (Item Type, Data Source, Group by) scroll with the page — they are "set and forget" controls, not frequently toggled while browsing items. Sticky filters can be added later if needed.

## Component Architecture Changes

| File | Change |
|------|--------|
| `Meals.js` (new) | Segmented control + ChatBot/MealCreator. Manages mealMode state. |
| `Plan.js` | Remove tab logic. Render GroceryChecklist directly. |
| `BottomTabBar.js` | Add Meals tab (UtensilsCrossed, position 2). Update SCREEN_TO_TAB. |
| `App.js` | Add `meals` routing case. Pass props to Meals. Add to FULL_HEIGHT_SCREENS. |
| `Sidebar.js` | Add Meals nav item for desktop. |
| `GroceryChecklist.js` | Remove `max-h-[60vh] overflow-y-auto` from grouped items container. |

### Data Flow for Meals.js

Props from App.js:
- `selectedMeals`, `setSelectedMeals`, `refreshMeals`
- `onNavigate`, `groceryListData`
- `onUnsavedChanges`

Internal state:
- `mealMode` — "planner" or "creator", persisted to localStorage

### Props Removed from Plan.js

The following props are no longer needed by Plan (only by Meals):
- `selectedMeals`, `setSelectedMeals`, `refreshMeals`

Plan.js retains:
- `onNavigate`, `onUnsavedChanges`, `onStartShopping`
- `groceryListData`, `setGroceryListData`, `debugMode`
