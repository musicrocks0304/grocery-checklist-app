# Grocery Checklist App

AI-powered weekly meal planning and grocery shopping assistant with coupon matching.

## What It Does

1. **Meal Planning** - Chat with AI (Claude 3.5 Haiku) to plan weekly meals
2. **Recipe Creation** - 4-phase AI recipe creation (Describe, Build, Preview, Save)
3. **Grocery Checklist** - Select/add grocery items, save weekly list
4. **Coupon Matching** - AI matches your grocery list to scraped HEB digital coupons
5. **In-Store Mode** - Phone-optimized shopping checklist grouped by store section
6. **Cooking Mode** - Step-by-step instructions with timers, wake lock, and dark kitchen mode

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Tailwind CSS 3, lucide-react icons |
| Backend | n8n (self-hosted workflow automation) |
| AI | Claude 3.5 Haiku via Anthropic API (through n8n) |
| Database | MySQL 8 (database: `hsa`, port 3307) |
| Deployment | Netlify (frontend), Docker (n8n + clip server) |
| Coupon Clipping | Node.js/Express + Playwright, Cloudflare Tunnel |

## Local Setup

### Prerequisites
- Node.js 18+
- Access to the n8n instance and MySQL database

### Install & Run

```bash
npm install
cp .env.example .env
# Edit .env with your actual values
npm start
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `REACT_APP_API_BASE_URL` | n8n webhook base URL (no trailing slash) |
| `REACT_APP_CLIP_SERVER_URL` | HEB coupon clip server URL |
| `REACT_APP_API_KEY` | API key for webhook authentication |

See `.env.example` for defaults.

### Debug Mode

Add `?debug=true` to the URL to show debug panels in all components.

## Project Structure

```
src/
  components/       React components (App, ChatBot, GroceryChecklist, etc.)
  config/           Centralized API configuration (api.js)
  utils/            Shared utilities (weekDates.js, fallbackData.js)
  hooks/            Custom React hooks (future use)
sql/                Database maintenance scripts (review before running)
```

## n8n Backend (Webhook Map)

All API calls go through n8n webhooks. Endpoints are defined in `src/config/api.js`.

| Frontend Action | Webhook Path | n8n Workflow |
|----------------|-------------|--------------|
| Load grocery items | `/fetch_grocery_items` | Pull Grocery Staples |
| Add item | `/add_grocery_items` | Add Grocery Item |
| Remove item | `/deactivate_grocery_item` | Deactivate Grocery Item |
| Save grocery list | `/create_grocery_list` | Create Grocery List |
| Chat with AI | `/call_grocery_agent` | Blue Apron API Agent |
| Load/save chat history | `/chat_history` | Chat History API |
| Generate grocery list from meals | `/get_recipe_items` | Create Grocery List - Meals |
| Fetch ingredients | `/meal_ingredients` | Ingredient Agent |
| Choose recipe for cooking | `/choose_recipe_instructions` | Choose Instructions |
| Get step-by-step instructions | `/grab_instructions_fast` | Grab Recipe Instructions (Fast) |
| AI recipe proposal | `/meal_creator_propose` | AI Meal Creator - Propose |
| AI recipe full build | `/meal_creator_build` | AI Meal Creator - Full Build |
| Save AI recipe | `/meal_creator_save` | AI Meal Creator - Save to DB |
| Match coupons to list | `/match_coupons` | Match Coupons AI |
| Browse coupons | `/fetch_heb_coupons` | Fetch HEB Coupons |

## Database Schema

16 base tables + 4 views in MySQL database `hsa`:

**Core Recipe Tables:** `recipes`, `ingredients`, `recipe_ingredients`, `recipe_instructions`, `recipe_tags`, `tags`, `units`, `ratings` (unused)

**Grocery Tables:** `GroceryItems`, `WeeklyGroceryList`, `weekly_selections`

**Coupon Tables:** `heb_coupons`, `heb_scraping_history`, `coupon_matches`

**HSA Tables (separate project):** `ManualHSAItems`, `OrderDetails`

**Views:** `recipe_complete`, `recipe_summary`, `recipe_ingredient_list`, `recipe_instructions_list` (documented in `sql/05_view_documentation.sql`)

## SQL Maintenance Scripts

Located in `sql/`. **Review before running** - none are auto-executed.

1. `01_add_foreign_keys.sql` - Add missing foreign keys
2. `02_add_indexes.sql` - Add performance indexes
3. `03_cleanup_expired_coupons.sql` - Prune expired coupon data
4. `04_archive_old_grocery_lists.sql` - Archive old weekly lists (12-week retention)
5. `05_view_documentation.sql` - View definitions and documentation
