# Navigation Restructuring & Bug Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Promote Meals to its own bottom bar tab, simplify Plan to just the grocery list, and fix the mobile scroll bug in GroceryChecklist.

**Architecture:** Extract meal planning UI from Plan.js into a new Meals.js with a segmented control. Plan.js becomes a thin wrapper around GroceryChecklist. BottomTabBar grows from 5 to 6 tabs. GroceryChecklist's nested scroll container is removed.

**Tech Stack:** React, Tailwind CSS, Framer Motion, Lucide icons, localStorage

**Design doc:** `docs/plans/2026-03-23-nav-restructure-bugfix-design.md`

---

### Task 1: Fix Bug #5 — Remove nested scroll in GroceryChecklist

**Files:**
- Modify: `src/components/GroceryChecklist.js:1412`

**Step 1: Fix the nested scroll**

On line 1412, change:
```jsx
<div className="max-h-[60vh] overflow-y-auto overscroll-contain border border-default rounded-xl bg-surface">
```
to:
```jsx
<div className="border border-default rounded-xl bg-surface">
```

This removes the inner scroll container that traps touch events on mobile. Items now take their natural height and scroll with the page.

**Step 2: Verify on mobile**

Open the app on mobile (or responsive mode). Navigate to Plan > Grocery List. Touch inside the item list area and scroll. Confirm the page scrolls normally.

**Step 3: Commit**

```bash
git add src/components/GroceryChecklist.js
git commit -m "fix: remove nested scroll trap in grocery item list (Bug #5)"
```

---

### Task 2: Create Meals.js — New component with segmented control

**Files:**
- Create: `src/components/Meals.js`

**Step 1: Create the Meals component**

```jsx
import React, { useState, useCallback, useEffect } from 'react';
import { MessageSquare, UtensilsCrossed } from 'lucide-react';
import { motion } from 'framer-motion';
import ChatBot from './ChatBot';
import MealCreator from './MealCreator';

/**
 * Meals screen — segmented control switching between:
 *   1. AI Meal Planner (ChatBot)
 *   2. Create Recipe (MealCreator)
 */

const MEAL_MODES = [
  { id: 'planner', label: 'AI Planner', icon: MessageSquare },
  { id: 'creator', label: 'Create Recipe', icon: UtensilsCrossed },
];

const Meals = ({
  onNavigate,
  onUnsavedChanges,
  selectedMeals,
  setSelectedMeals,
  refreshMeals,
  groceryListData,
  setGroceryListData,
  debugMode,
}) => {
  const [mealMode, setMealMode] = useState(() => {
    try {
      return localStorage.getItem('mealsTabState') || 'planner';
    } catch { return 'planner'; }
  });

  useEffect(() => {
    try { localStorage.setItem('mealsTabState', mealMode); }
    catch { /* ignore */ }
  }, [mealMode]);

  // Internal navigation: switch sub-mode instead of leaving screen
  const handleMealNavigate = useCallback((screen) => {
    if (screen === 'chatbot') {
      setMealMode('planner');
    } else if (screen === 'meal-creator') {
      setMealMode('creator');
    } else {
      onNavigate(screen);
    }
  }, [onNavigate]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Segmented control */}
      <div className="sticky top-12 lg:top-0 z-20 bg-surface/95 backdrop-blur-md border-b border-default px-4 py-3">
        <div className="max-w-6xl mx-auto flex justify-center">
          <div className="inline-flex bg-background rounded-full p-1 gap-0.5">
            {MEAL_MODES.map((mode) => {
              const Icon = mode.icon;
              const isActive = mealMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setMealMode(mode.id)}
                  className={`relative flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 z-10 ${
                    isActive ? 'text-white' : 'text-muted hover:text-body'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="meals-segment"
                      className="absolute inset-0 bg-primary rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon size={14} />
                    {mode.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {mealMode === 'planner' && (
          <ChatBot
            onBack={() => onNavigate('plan')}
            onNavigate={handleMealNavigate}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            refreshMeals={refreshMeals}
            groceryListData={groceryListData}
            setGroceryListData={setGroceryListData}
            debugMode={debugMode}
          />
        )}

        {mealMode === 'creator' && (
          <MealCreator
            onBack={() => setMealMode('planner')}
            onNavigate={handleMealNavigate}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            refreshMeals={refreshMeals}
            debugMode={debugMode}
          />
        )}
      </div>
    </div>
  );
};

export default Meals;
```

**Step 2: Commit**

```bash
git add src/components/Meals.js
git commit -m "feat: add Meals screen with segmented control"
```

---

### Task 3: Simplify Plan.js — Remove tab system

**Files:**
- Modify: `src/components/Plan.js`

**Step 1: Rewrite Plan.js**

Replace entire file contents:

```jsx
import React from 'react';
import GroceryChecklist from './GroceryChecklist';

/**
 * Plan screen — renders the weekly grocery checklist.
 * Meal planning has been moved to the separate Meals screen.
 */
const Plan = ({
  onNavigate,
  onUnsavedChanges,
  onStartShopping,
  groceryListData,
  setGroceryListData,
  debugMode,
}) => {
  return (
    <GroceryChecklist
      onNavigate={onNavigate}
      onUnsavedChanges={onUnsavedChanges}
      onStartShopping={onStartShopping}
      debugMode={debugMode}
    />
  );
};

export default Plan;
```

**Step 2: Commit**

```bash
git add src/components/Plan.js
git commit -m "refactor: simplify Plan to render only GroceryChecklist"
```

---

### Task 4: Update BottomTabBar.js — Add Meals tab

**Files:**
- Modify: `src/components/BottomTabBar.js`

**Step 1: Add UtensilsCrossed import**

Line 2, change:
```jsx
import { ClipboardList, Tag, Store, ShoppingBag, ChefHat } from "lucide-react";
```
to:
```jsx
import { ClipboardList, UtensilsCrossed, Tag, Store, ShoppingBag, ChefHat } from "lucide-react";
```

**Step 2: Add Meals tab to TABS array**

Lines 13-19, change:
```jsx
const TABS = [
  { id: "plan", label: "Plan", icon: ClipboardList },
  { id: "deals", label: "Deals", icon: Tag },
  { id: "cart", label: "Cart", icon: Store },
  { id: "shop", label: "Shop", icon: ShoppingBag },
  { id: "cook", label: "Cook", icon: ChefHat },
];
```
to:
```jsx
const TABS = [
  { id: "plan", label: "Plan", icon: ClipboardList },
  { id: "meals", label: "Meals", icon: UtensilsCrossed },
  { id: "deals", label: "Deals", icon: Tag },
  { id: "cart", label: "Cart", icon: Store },
  { id: "shop", label: "Shop", icon: ShoppingBag },
  { id: "cook", label: "Cook", icon: ChefHat },
];
```

**Step 3: Update SCREEN_TO_TAB mappings**

Lines 22-39, change `chatbot` and `meal-creator` to map to `"meals"` instead of `"plan"`. Add `meals: "meals"`:

```jsx
const SCREEN_TO_TAB = {
  // New IDs
  plan: "plan",
  meals: "meals",
  deals: "deals",
  cart: "cart",
  shop: "shop",
  cook: "cook",
  // Legacy IDs (still routable during transition)
  grocery: "plan",
  chatbot: "meals",
  "meal-creator": "meals",
  "recipe-ingredients": "meals",
  "smart-deals": "deals",
  coupons: "deals",
  "heb-cart": "cart",
  "in-store": "shop",
  "recipe-instructions": "cook",
};
```

**Step 4: Reduce tab min-width for 6 tabs**

Line 59, change:
```jsx
className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl min-w-[60px] min-h-[44px] transition-all duration-200 relative ${
```
to:
```jsx
className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl min-w-[52px] min-h-[44px] transition-all duration-200 relative ${
```

**Step 5: Commit**

```bash
git add src/components/BottomTabBar.js
git commit -m "feat: add Meals tab to bottom navigation bar"
```

---

### Task 5: Update App.js — Wire up Meals routing

**Files:**
- Modify: `src/components/App.js`

**Step 1: Add Meals import**

After line 19 (`import Plan from "./Plan";`), add:
```jsx
import Meals from "./Meals";
```

**Step 2: Add UtensilsCrossed import**

Line 2, add `UtensilsCrossed` to the lucide import:
```jsx
import { ClipboardList, UtensilsCrossed, Tag, Store, ShoppingBag, ChefHat } from "lucide-react";
```

**Step 3: Add "meals" to FULL_HEIGHT_SCREENS**

Line 25, change:
```jsx
const FULL_HEIGHT_SCREENS = new Set(["plan", "chatbot", "meal-creator"]);
```
to:
```jsx
const FULL_HEIGHT_SCREENS = new Set(["plan", "meals", "chatbot", "meal-creator"]);
```

**Step 4: Add "meals" to VALID_SCREENS**

Line 30, change:
```jsx
  "home", "plan", "deals", "cart", "shop", "cook",
```
to:
```jsx
  "home", "plan", "meals", "deals", "cart", "shop", "cook",
```

**Step 5: Add Meals to navigation array**

Lines 52-57, change:
```jsx
const navigation = [
  { id: "plan", name: "Plan Meals & List", icon: ClipboardList },
  { id: "deals", name: "Deals & Coupons", icon: Tag },
  { id: "cart", name: "HEB Cart Builder", icon: Store },
  { id: "shop", name: "Shop In-Store", icon: ShoppingBag },
  { id: "cook", name: "Cook Recipes", icon: ChefHat },
];
```
to:
```jsx
const navigation = [
  { id: "plan", name: "Grocery List", icon: ClipboardList },
  { id: "meals", name: "Meal Planning", icon: UtensilsCrossed },
  { id: "deals", name: "Deals & Coupons", icon: Tag },
  { id: "cart", name: "HEB Cart Builder", icon: Store },
  { id: "shop", name: "Shop In-Store", icon: ShoppingBag },
  { id: "cook", name: "Cook Recipes", icon: ChefHat },
];
```

Note: "Plan Meals & List" renamed to "Grocery List" since meals moved out.

**Step 6: Simplify Plan case — remove meal props**

Lines 207-220, change:
```jsx
      case "plan":
        return (
          <Plan
            onNavigate={navigateToScreen}
            onUnsavedChanges={setHasUnsavedChanges}
            onStartShopping={handleStartShopping}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            refreshMeals={refreshMeals}
            groceryListData={groceryListData}
            setGroceryListData={setGroceryListData}
            debugMode={debugMode}
          />
        );
```
to:
```jsx
      case "plan":
        return (
          <Plan
            onNavigate={navigateToScreen}
            onUnsavedChanges={setHasUnsavedChanges}
            onStartShopping={handleStartShopping}
            groceryListData={groceryListData}
            setGroceryListData={setGroceryListData}
            debugMode={debugMode}
          />
        );
```

**Step 7: Add Meals case**

After the Plan case (after line ~220), add:
```jsx
      // --- Meals tab (AI Meal Planner + Create Recipe) ---
      case "meals":
        return (
          <Meals
            onNavigate={navigateToScreen}
            onUnsavedChanges={setHasUnsavedChanges}
            selectedMeals={selectedMeals}
            setSelectedMeals={setSelectedMeals}
            refreshMeals={refreshMeals}
            groceryListData={groceryListData}
            setGroceryListData={setGroceryListData}
            debugMode={debugMode}
          />
        );
```

**Step 8: Update legacy chatbot/meal-creator onBack targets**

Lines 223-245, update the `onBack` props to navigate to `"meals"` instead of `"plan"`:

ChatBot case (~line 226):
```jsx
            onBack={() => navigateToScreen("meals")}
```

MealCreator case (~line 239):
```jsx
            onBack={() => navigateToScreen("meals")}
```

**Step 9: Commit**

```bash
git add src/components/App.js
git commit -m "feat: wire up Meals screen routing in App"
```

---

### Task 6: Update Sidebar.js — Fix legacy mappings

**Files:**
- Modify: `src/components/Sidebar.js`

**Step 1: Update LEGACY_TO_NEW mappings**

Lines 17-27, change `chatbot` and `meal-creator` to map to `"meals"`:
```jsx
  const LEGACY_TO_NEW = {
    grocery: "plan",
    chatbot: "meals",
    "meal-creator": "meals",
    "recipe-ingredients": "meals",
    "smart-deals": "deals",
    coupons: "deals",
    "heb-cart": "cart",
    "in-store": "shop",
    "recipe-instructions": "cook",
  };
```

**Step 2: Commit**

```bash
git add src/components/Sidebar.js
git commit -m "refactor: update sidebar legacy mappings for meals tab"
```

---

### Task 7: Smoke test the full flow

**Step 1: Start the dev server**

```bash
npm start
```

**Step 2: Verify on mobile viewport**

- Bottom bar shows 6 tabs: Plan, Meals, Deals, Cart, Shop, Cook
- Plan tab shows only the grocery checklist (no Grocery List / Meals tabs)
- Scrolling inside the grocery item list works normally on mobile
- Meals tab shows segmented control with AI Planner / Create Recipe
- Switching segments loads ChatBot or MealCreator
- Segment state persists across tab switches (navigate away, come back)

**Step 3: Verify on desktop viewport**

- Sidebar shows "Grocery List" and "Meal Planning" as separate nav items
- Both navigate correctly
- No layout overlap or z-index issues

**Step 4: Clean up old localStorage key**

The old `planTabState` localStorage key stored `{ activeTab, mealMode }`. The new code uses `mealsTabState` (string). The old key is harmless (Plan.js no longer reads it) but can be cleaned up in a future pass.
