# Grocery Category Redesign

**Date**: 2026-04-11
**Status**: Approved

## Problem

Grocery item categories are inconsistent and poorly organized:
- "Pantry" is a catch-all with 27+ items in GroceryItems and 137+ in HEB product data
- "General" has 58 items in WeeklyGroceryList — a meaningless dump category for AI-generated meal ingredients
- Naming is inconsistent across tables: "Dairy & eggs" vs "Dairy", "Meat" vs "Meat & seafood", "Seasoning" vs "Spices & seasonings"
- Two overlapping categorization fields exist: `Category` (meal context) and `GroceryStoreSection` (store aisle)
- The "Add Item" dropdown is hardcoded to 6 categories, missing several that exist in the DB

## Decision

Adopt HEB's store taxonomy as the single source of truth, with Pantry split into meaningful subcategories.

## New Taxonomy (14 categories)

| # | Category | Contents | HEB Mapping |
|---|---|---|---|
| 1 | Bakery & bread | Bread, tortillas, buns, pitas | HEB L1 `Bakery & bread` |
| 2 | Beverages | Water, juice, coffee, tea, sports drinks | HEB L1 `Beverages` |
| 3 | Cereal & breakfast | Cereal, oatmeal, granola bars, pancake mix | Pantry L2 `Cereal & breakfast` |
| 4 | Condiments & sauces | Ketchup, mustard, salsa, marinades, dressings, oils, vinegar | Merge: Pantry L2 `Condiments` + `Sauces & marinades` + `Dressing, oil & vinegar` + `Salsa & dip` |
| 5 | Dairy & eggs | Milk, cheese, yogurt, eggs, butter, cream | HEB L1 `Dairy & eggs` |
| 6 | Deli & prepared food | Lunch meat, prepared salads, hummus, rotisserie | HEB L1 `Deli & prepared food` |
| 7 | Frozen food | Frozen meals, ice cream, frozen veggies | HEB L1 `Frozen food` |
| 8 | Fruit & vegetables | All produce — fresh fruit, veggies, herbs | HEB L1 `Fruit & vegetables` |
| 9 | Meat & seafood | Chicken, beef, pork, fish, sausage | HEB L1 `Meat & seafood` |
| 10 | Pasta, rice & grains | Pasta, rice, quinoa, couscous | Pantry L2 `Pasta & rice` |
| 11 | Pantry staples | Canned goods, broth, baking ingredients, PB&J, flour, sugar | Pantry remainder: `Canned & dried food`, `Broth & bouillon`, `Baking ingredients`, `Peanut butter`, `Jelly & jam` |
| 12 | Snacks | Chips, popcorn, crackers, candy, trail mix | Pantry L2 `Snacks & candy` |
| 13 | Spices & seasonings | Herbs, spices, seasoning mixes, salt, pepper | Pantry L2 `Spices & seasonings` |
| 14 | Household & other | Non-food items (cleaning, paper goods, cards) | Catchall: `Baby & kids`, `Everyday essentials`, `Home & outdoor`, `Health & beauty` |

**Key rules:**
- No "General" category. Everything gets classified.
- `GroceryStoreSection` is deprecated. `Category` is the single unified field.
- Categories are data-driven from HEB, not hardcoded.

## Category Assignment Strategy

### Source 1: HEB Product Matches
When Smart Match or Cart Builder matches a grocery item to an HEB product, the existing `category` and `category_path` fields map through a `grocery_category_map` reference table to our 14 categories.

Mapping logic: check `category_path` with LIKE patterns. Pantry subcategories match on level-2 path segment; everything else maps 1:1 from HEB's top-level category.

### Source 2: AI-Generated Ingredients
The n8n AI workflows (Meal Creator Propose, Full Build, ChatBot) add a `category` field to their structured output. The 14 valid categories are listed in each system prompt. The AI assigns a category for each ingredient it produces.

### Source 3: Manual / One-Off Items
The "Add Item" form dropdown lists all 14 categories. Smart default logic:
1. Cross-reference item name against `heb_frequent_products` — if found, use mapped category
2. Fallback: "Pantry staples"

## Database Changes

### New table: `grocery_category_map`
Maps HEB `category_path` patterns to app categories. ~20-25 rows.

| Column | Type | Purpose |
|---|---|---|
| id | INT PK AUTO_INCREMENT | |
| heb_pattern | VARCHAR(200) | LIKE pattern for HEB category_path |
| app_category | VARCHAR(100) | One of the 14 app categories |
| priority | INT DEFAULT 0 | Higher priority patterns matched first (for Pantry sub-splits vs Pantry catchall) |

### Update `GroceryItems` (81 rows)
- Reclassify all items using: `GroceryStoreSection` as primary hint → map to new taxonomy
- For items where GroceryStoreSection is null/ambiguous, cross-reference `heb_frequent_products` by item name
- Deprecate `GroceryStoreSection` (stop writing to it, remove from queries over time)

### Update `WeeklyGroceryList` (current/recent weeks)
- Reclassify 58 "General" items via: lookup in `heb_frequent_products`/`heb_product_matches` by item name → mapping table
- Fix inconsistent names: "Dairy" → "Dairy & eggs", "Seasoning"/"Spices & Seasonings" → "Spices & seasonings", "Nuts" → "Snacks", "Meat" → "Meat & seafood"
- Remaining unmapped items: one-time AI batch categorization

### Frontend changes: `GroceryChecklist.js`
- Replace hardcoded 6-category dropdown with 14 new categories (data-driven from a constant or API)
- Remove "General" default — use "Pantry staples" or auto-suggest from HEB lookup
- Remove "Section" groupBy option (redundant now that Category = store aisle taxonomy)

### AI workflow prompt updates
- Add the 14 valid categories to Meal Creator Propose, Meal Creator Build, and ChatBot system prompts
- AI returns `category` field for each ingredient in structured output

## Migration Strategy

All migrations run as n8n workflows (MySQL MCP cannot execute DDL):

1. **Create `grocery_category_map` table** — n8n migration workflow
2. **Populate mapping rows** — INSERT the ~20-25 HEB pattern → app category mappings
3. **Batch UPDATE `GroceryItems.Category`** — SQL using mapping logic from GroceryStoreSection + HEB lookups
4. **Batch UPDATE `WeeklyGroceryList.Category`** — SQL for current week, cross-referencing HEB product data
5. **AI batch for unmapped items** — n8n workflow calls AI to categorize remaining "General" items
6. **Frontend code updates** — Update dropdown, remove Section groupBy, update defaults
7. **AI prompt updates** — Add categories to n8n workflow system prompts
