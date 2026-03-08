# GroceryAI: Market Launch Design Document

**Date:** 2026-03-05
**Status:** Approved
**Author:** Corey + Claude

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Strategic Decisions](#2-strategic-decisions)
3. [Current State Audit Findings](#3-current-state-audit-findings)
4. [Target Architecture](#4-target-architecture)
5. [Supabase Schema Design](#5-supabase-schema-design)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [API Layer Design](#7-api-layer-design)
8. [React Native App Structure](#8-react-native-app-structure)
9. [Screen-by-Screen Specifications](#9-screen-by-screen-specifications)
10. [In-App Purchases & Subscription](#10-in-app-purchases--subscription)
11. [Accessibility Requirements](#11-accessibility-requirements)
12. [App Store Requirements](#12-app-store-requirements)
13. [CI/CD Pipeline](#13-cicd-pipeline)
14. [Migration Plan: Current Data to Supabase](#14-migration-plan-current-data-to-supabase)
15. [n8n Workflow Changes](#15-n8n-workflow-changes)
16. [Analytics & Monitoring](#16-analytics--monitoring)
17. [Phased Roadmap](#17-phased-roadmap)
18. [Risk Register](#18-risk-register)
19. [Open Questions](#19-open-questions)

---

## 1. Executive Summary

### What We're Building
A mobile grocery list app called GroceryAI (working title) that saves users time on weekly grocery planning through AI-powered meal planning, smart list organization, and a delightful in-store shopping experience.

### Origin Story (for marketing)
"My wife and I hated the chore of weekly grocery list creation and shopping. So I built an app that does it for us."

### Core Value Proposition
- **Hook (acquisition):** "Save time on your weekly grocery list"
- **Retention loop:** AI meal planning + smart deals (v2) save money
- **Moat:** AI intelligence — no competitor combines lists + AI meal planning + smart matching

### Target User
Budget-conscious grocery shoppers who also meal plan and want an end-to-end experience. Families/households who need shared lists.

### Business Model
Freemium. Free grocery list + in-store mode. Paid AI features + household sharing at $3.99/month (or $29.99/year).

### MVP Scope
4 screens + floating AI assistant:
1. Grocery List (free)
2. In-Store Mode (free)
3. AI Meal Planner (paid)
4. Profile/Settings (free)
5. Floating AI Assistant accessible from any screen (paid)

### What's Explicitly Out of v1
- HEB Cart Builder (can't scale, likely violates ToS)
- HEB Coupon Clipping (same)
- Raw Coupons browser (no legit data source yet)
- Smart Deals (no legit data source yet — add in v2 via Quotient/Kroger API)
- Standalone Recipe Instructions screen (folded into Meal Planner)
- Standalone Recipe Ingredients screen (folded into Meal Planner)

---

## 2. Strategic Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Platform | React Native with Expo | Best long-term foundation. No WebView ceiling. AI eliminates learning curve concerns. Expo gives web export too. |
| 2 | Backend & Data | Supabase (auth + Postgres + Edge Functions) | All-in-one. Row-level security for multi-user. Realtime for household sharing. Already have Postgres in stack. n8n stays for AI orchestration only. |
| 3 | Business Model | Freemium ($3.99/mo or $29.99/yr) | AI features cost money per API call — paid users fund their own usage. Free tier (list + in-store) is genuinely useful standalone. |
| 4 | MVP Scope | 4 screens + floating assistant | Focused, shippable, no empty promises. Smart Deals added in v2 when legit coupon data is secured. |
| 5 | AI Experiences | Two distinct UIs: structured Meal Planner wizard + contextual floating assistant | Different interaction models shouldn't be merged. Wizard is task-driven. Assistant is conversational. |
| 6 | Coupon Data | Legitimate sources only (Quotient, Kroger API) in v2 | Scraping violates ToS. App store reviewers reject scrapers. Affiliate programs exist and are legal. |

---

## 3. Current State Audit Findings

These findings from the existing React SPA inform what must be addressed during the rebuild.

### 3.1 Security Findings (from audit)

| # | Severity | Finding | File | Action for Rebuild |
|---|----------|---------|------|-------------------|
| S1 | CRITICAL | `REACT_APP_API_KEY` baked into JS bundle — publicly readable | `src/config/api.js:97` | Eliminate entirely. Supabase JWT replaces API key. n8n webhooks validate JWT via Edge Function proxy. |
| S2 | CRITICAL | No user authentication or authorization | All components | Supabase Auth with RLS policies. Every query scoped to authenticated user. |
| S3 | CRITICAL | Production webhook URL hardcoded as fallback | `src/config/api.js:8` | All API calls go through Supabase Edge Functions. No direct n8n URLs in client code. |
| S4 | HIGH | `console.log` fires unconditionally in production (info disclosure) | Multiple `addDebugLog` functions | Use `__DEV__` flag in React Native. No logging in production builds. |
| S5 | HIGH | No Content Security Policy or security headers | `public/index.html` | Not applicable to React Native (no browser). For any web version, add CSP via hosting config. |
| S6 | MEDIUM | Session IDs use `Math.random()` — not cryptographically secure | `ChatBot.js:10`, `MealCreator.js:9` | Use `expo-crypto` randomUUID() for all ID generation. |
| S7 | MEDIUM | Client-generated ItemID with `Math.random()` — collision risk | `GroceryChecklist.js:446` | Server-generated UUIDs via Supabase. Client never generates IDs. |
| S8 | MEDIUM | `.env.example` exposes real production infrastructure domain | `.env.example:2-5` | New project, new `.env.example` with placeholder values only. |
| S9 | LOW | `inStoreShoppingList` in localStorage with no expiry | `App.js:91` | Use `expo-secure-store` for sensitive data. AsyncStorage with TTL for cached data. |
| S10 | LOW | `react-scripts@5.0.1` has known advisories | `package.json:16` | Not applicable — new project uses Expo/Metro bundler. |

### 3.2 UX Findings (from audit)

| # | Severity | Finding | Action for Rebuild |
|---|----------|---------|-------------------|
| U1 | CRITICAL | No onboarding — drops users into list with no explanation | Build 2-3 screen onboarding flow explaining core value |
| U2 | CRITICAL | Developer strings visible ("Connecting to n8n webhook...", "npm run scrape:login") | All user-facing strings must be consumer-friendly. No internal references. |
| U3 | HIGH | `window.confirm()` native dialogs (3 places) | Use React Native Alert or custom modal components everywhere |
| U4 | HIGH | 9 screens with hidden sub-screens confuse navigation | Reduced to 4 screens + floating button. Clean bottom tab bar. |
| U5 | HIGH | No accessibility (ARIA roles, focus trapping, screen reader support) | Full accessibility pass. React Native has built-in `accessible`, `accessibilityLabel`, `accessibilityRole` props. |
| U6 | HIGH | 11-second Smart Deals load with bare spinner | Not in v1. When added in v2, use skeleton screens + progressive loading. |
| U7 | MEDIUM | "Review Final List" button buried at bottom, requires scrolling | Sticky floating action button for primary CTAs |
| U8 | MEDIUM | Filter controls take too much vertical space on mobile | Collapsible filter bar, or horizontal scroll chips |
| U9 | MEDIUM | Group tabs wrap to multiple rows on mobile | Horizontal scrollable tab strip (ScrollView horizontal) |
| U10 | MEDIUM | Add Item panel has 5 fields requiring scroll on mobile | Simplified quick-add (name only) + optional details expandable |
| U11 | LOW | No entrance animations on grocery item list | Use React Native Reanimated for list item stagger animations |
| U12 | LOW | CouponMatchPanel appears abruptly with no animation | Not in v1. When added, animate entrance. |

### 3.3 Code Quality Findings (from audit)

| # | Severity | Finding | Action for Rebuild |
|---|----------|---------|-------------------|
| C1 | CRITICAL | 160-line inline async onClick handler in JSX | All handlers extracted to named functions. Use React Query mutations. |
| C2 | CRITICAL | Unmemoized filter/group functions called every render | Use `useMemo` for all derived data. React Query caches server data. |
| C3 | CRITICAL | Random ItemID collision + state desync with backend | Server-generated UUIDs. Optimistic updates with React Query. |
| C4 | HIGH | Multi-attempt CORS fetch loop (debug scaffolding in prod) | Single API call per request via Supabase client. No retry loop. React Query handles retries. |
| C5 | HIGH | `addDebugLog` accumulates unbounded state + triggers re-renders | Remove entirely. Use React Native `__DEV__` + Flipper for dev debugging. |
| C6 | HIGH | Two ThemeProvider instances | Single ThemeProvider at root. Use React Native `useColorScheme()` + user preference. |
| C7 | MEDIUM | Duplicated constants (CONFIDENCE_STYLES, CLIP_STATUS_STYLES) | Not in v1 (coupon features removed). When added back, shared constants file. |
| C8 | MEDIUM | `eslint-disable-line react-hooks/exhaustive-deps` | Proper dependency arrays. Separate effects for data fetching vs UI state init. |
| C9 | HIGH | No CI/CD — push to main auto-deploys with no test gate | GitHub Actions: lint + test + build on every PR. EAS Build for app binaries. |
| C10 | HIGH | No lazy loading — all 9 screens imported eagerly | React Navigation handles lazy screen loading by default. |
| C11 | MEDIUM | GroceryChecklist.js is 59KB / ChatBot.js is 56KB — too large | Decompose into smaller components. No file over 300 lines. |
| C12 | MEDIUM | No per-route error boundaries | Error boundary per screen via React Navigation's error handling. |

---

## 4. Target Architecture

```
+--------------------------------------------------+
|              Mobile Device (iOS/Android)          |
|  +--------------------------------------------+  |
|  |         React Native + Expo App            |  |
|  |                                            |  |
|  |  Screens:                                  |  |
|  |    - Grocery List                          |  |
|  |    - In-Store Mode                         |  |
|  |    - AI Meal Planner (with recipes)        |  |
|  |    - Profile / Settings                    |  |
|  |    - Floating AI Assistant (overlay)       |  |
|  |                                            |  |
|  |  State Management:                         |  |
|  |    - React Query (server state + caching)  |  |
|  |    - Zustand (local UI state)              |  |
|  |                                            |  |
|  |  Auth:                                     |  |
|  |    - Supabase Auth SDK                     |  |
|  |    - expo-secure-store (token storage)     |  |
|  |    - expo-apple-authentication             |  |
|  |    - expo-auth-session (Google)            |  |
|  +---------------------+----------------------+  |
+-------------------------|------------------------+
                          | HTTPS (Supabase client SDK)
                          |
+-------------------------|------------------------+
|                   Supabase                       |
|                                                  |
|  +-- Auth --------------------------------+      |
|  |  - Email/password                      |      |
|  |  - Apple Sign-In (required for iOS)    |      |
|  |  - Google Sign-In                      |      |
|  |  - JWT issued on login                 |      |
|  +----------------------------------------+      |
|                                                  |
|  +-- Postgres Database -------------------+      |
|  |  - All tables with RLS policies        |      |
|  |  - User data isolated by user_id       |      |
|  |  - Household data shared by household  |      |
|  |  - Realtime subscriptions enabled      |      |
|  +----------------------------------------+      |
|                                                  |
|  +-- Edge Functions ----------------------+      |
|  |  - /ai/meal-plan  --> proxy to n8n     |      |
|  |  - /ai/chat       --> proxy to n8n     |      |
|  |  - /ai/smart-match --> proxy to n8n    |      |
|  |  - Validates JWT, checks subscription  |      |
|  |  - Injects API keys server-side        |      |
|  |  - Rate limits per user                |      |
|  +----------------------------------------+      |
|                                                  |
|  +-- Storage -----------------------------+      |
|  |  - User avatars                        |      |
|  |  - Recipe images (AI-generated)        |      |
|  +----------------------------------------+      |
+-------------------------|------------------------+
                          | HTTPS (internal)
                          |
+-------------------------|------------------------+
|               n8n (AI Orchestration)             |
|                                                  |
|  Workflows (called by Edge Functions only):      |
|  - Meal Creator (propose, build, instruct)       |
|  - Grocery Chat Assistant                        |
|  - Smart Match (item suggestions)                |
|                                                  |
|  - Validates request came from Edge Function     |
|    (shared secret, not user JWT)                 |
|  - Anthropic API calls happen here               |
|  - No direct client access                       |
+--------------------------------------------------+
```

### Key Architecture Principles

1. **Client never talks to n8n directly.** All AI calls go through Supabase Edge Functions which validate the JWT, check the user's subscription status, and then proxy to n8n with a server-side secret.
2. **No secrets in the client.** The React Native app only knows the Supabase project URL and anon key (which is safe to expose — RLS protects the data).
3. **n8n is an internal service.** It's called by Edge Functions only, authenticated by a shared secret. It does AI orchestration and nothing else.
4. **Supabase RLS enforces data isolation.** Even if a bug in client code tries to read another user's data, the database won't return it.
5. **React Query manages all server state.** No manual fetch/retry logic. Built-in caching, background refetching, optimistic updates.

---

## 5. Supabase Schema Design

### 5.1 Users & Households

```sql
-- Supabase auth.users is created automatically.
-- We extend it with a profiles table.

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium')),
  subscription_platform TEXT CHECK (subscription_platform IN ('apple', 'google', 'web', NULL)),
  subscription_expires_at TIMESTAMPTZ,
  store_preference TEXT, -- e.g., 'heb', 'kroger', 'walmart' (for future use)
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

```sql
-- Households enable shared grocery lists between family members

CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'My Household',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  invite_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE household_members (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

-- RLS: users can only see households they belong to
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their household"
  ON households FOR SELECT
  USING (id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

CREATE POLICY "Owner can update household"
  ON households FOR UPDATE
  USING (created_by = auth.uid());

ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view household members"
  ON household_members FOR SELECT
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

CREATE POLICY "Owner can manage members"
  ON household_members FOR ALL
  USING (household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid() AND role = 'owner'
  ));
```

### 5.2 Grocery Lists & Items

```sql
-- Each user (or household) has weekly grocery lists

CREATE TABLE grocery_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE SET NULL,
  week_start DATE NOT NULL, -- Monday of the week
  week_end DATE NOT NULL, -- Sunday of the week
  week_label TEXT NOT NULL, -- e.g., "Mar 3 - Mar 9"
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'saved', 'shopping', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start) -- one list per user per week
);

CREATE TABLE grocery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT, -- e.g., 'Produce', 'Dairy', 'Meat'
  section TEXT, -- store section / aisle
  store TEXT, -- which store to buy from
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT, -- e.g., 'lbs', 'oz', 'count'
  item_type TEXT NOT NULL DEFAULT 'basic' CHECK (item_type IN ('basic', 'periodic')),
  is_selected BOOLEAN NOT NULL DEFAULT false,
  is_checked BOOLEAN NOT NULL DEFAULT false, -- for in-store mode
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'staple', 'meal_plan', 'ai_suggestion')),
  source_meal_id UUID, -- if added from a meal plan
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: users can only access items in their own lists
ALTER TABLE grocery_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own lists"
  ON grocery_lists FOR SELECT
  USING (user_id = auth.uid() OR household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Users manage own lists"
  ON grocery_lists FOR ALL
  USING (user_id = auth.uid() OR household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  ));

ALTER TABLE grocery_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own items"
  ON grocery_items FOR SELECT
  USING (list_id IN (SELECT id FROM grocery_lists WHERE user_id = auth.uid() OR household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )));
CREATE POLICY "Users manage own items"
  ON grocery_items FOR ALL
  USING (list_id IN (SELECT id FROM grocery_lists WHERE user_id = auth.uid() OR household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )));
```

### 5.3 Grocery Staples (Master Item Catalog)

```sql
-- The "staples" are the master list of items users can select from.
-- In the current app these come from n8n/MySQL.
-- For multi-user, each user/household has their own staples built over time.

CREATE TABLE grocery_staples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT,
  section TEXT,
  default_store TEXT,
  default_quantity NUMERIC DEFAULT 1,
  default_unit TEXT,
  item_type TEXT NOT NULL DEFAULT 'basic' CHECK (item_type IN ('basic', 'periodic')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0, -- track frequency for smart suggestions
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE grocery_staples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own staples"
  ON grocery_staples FOR SELECT
  USING (user_id = auth.uid() OR household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Users manage own staples"
  ON grocery_staples FOR ALL
  USING (user_id = auth.uid() OR household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  ));

-- Seed staples: When a new user signs up, populate from a default set.
-- This replaces the current shared MySQL grocery data.
-- Implementation: Supabase Edge Function called after signup that copies
-- from a `default_staples` table into the user's `grocery_staples`.

CREATE TABLE default_staples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  section TEXT,
  item_type TEXT NOT NULL DEFAULT 'basic',
  sort_order INTEGER NOT NULL DEFAULT 0
);
-- This table is populated once by migration from your current MySQL data.
-- No RLS needed — it's read-only reference data.
```

### 5.4 Meal Plans & Recipes

```sql
CREATE TABLE meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  list_id UUID REFERENCES grocery_lists(id) ON DELETE SET NULL,
  week_start DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'proposed', 'confirmed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE meal_plan_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Mon, 6=Sun. NULL = unscheduled.
  title TEXT NOT NULL,
  description TEXT,
  servings INTEGER NOT NULL DEFAULT 2,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  cuisine TEXT,
  recipe_json JSONB, -- full recipe (ingredients + instructions) from AI
  ai_session_id TEXT, -- links to chat history for regeneration
  is_confirmed BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ingredients from a meal that get added to the grocery list
CREATE TABLE meal_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id UUID NOT NULL REFERENCES meal_plan_meals(id) ON DELETE CASCADE,
  grocery_item_id UUID REFERENCES grocery_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  category TEXT, -- for grouping in grocery list
  is_added_to_list BOOLEAN NOT NULL DEFAULT false
);

-- RLS for all meal tables
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own meal plans"
  ON meal_plans FOR ALL USING (user_id = auth.uid());

ALTER TABLE meal_plan_meals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own meals"
  ON meal_plan_meals FOR ALL
  USING (meal_plan_id IN (SELECT id FROM meal_plans WHERE user_id = auth.uid()));

ALTER TABLE meal_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own meal ingredients"
  ON meal_ingredients FOR ALL
  USING (meal_id IN (
    SELECT m.id FROM meal_plan_meals m
    JOIN meal_plans mp ON m.meal_plan_id = mp.id
    WHERE mp.user_id = auth.uid()
  ));
```

### 5.5 AI Chat Sessions

```sql
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL CHECK (session_type IN ('assistant', 'meal_planner')),
  title TEXT, -- auto-generated from first message
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB, -- response_type, recipe data, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own sessions"
  ON chat_sessions FOR ALL USING (user_id = auth.uid());

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own messages"
  ON chat_messages FOR ALL
  USING (session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid()));
```

### 5.6 Subscription Tracking (Server-Side Validation)

```sql
-- Server-side record of subscription status.
-- The source of truth is Apple/Google, but we cache it here
-- for fast RLS checks and Edge Function authorization.

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('apple', 'google')),
  product_id TEXT NOT NULL, -- e.g., 'com.groceryai.premium.monthly'
  purchase_token TEXT, -- platform-specific receipt/token
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'grace_period')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own subscription"
  ON subscriptions FOR SELECT USING (user_id = auth.uid());
-- Only Edge Functions (service role) can INSERT/UPDATE subscriptions.
-- Users cannot modify their own subscription record directly.

-- Helper function for RLS policies on paid features
CREATE OR REPLACE FUNCTION public.user_is_premium()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = auth.uid()
    AND status IN ('active', 'grace_period')
    AND current_period_end > now()
  );
$$ LANGUAGE sql SECURITY DEFINER;
```

---

## 6. Authentication & Authorization

### 6.1 Auth Providers

Apple Sign-In is **required** by Apple if you offer any third-party sign-in. Google Sign-In is expected on Android.

| Provider | Platform | Implementation |
|----------|----------|----------------|
| Apple Sign-In | iOS (required), Android (optional) | `expo-apple-authentication` + Supabase `signInWithIdToken` |
| Google Sign-In | Android (primary), iOS (optional) | `expo-auth-session` + Supabase `signInWithIdToken` |
| Email/Password | Both | Supabase built-in. Include email verification. |

### 6.2 Auth Flow

```
1. User opens app
2. Check AsyncStorage for existing Supabase session
3. If valid session exists:
   a. Refresh token if needed (Supabase SDK handles this)
   b. Navigate to main app
4. If no session:
   a. Show onboarding screens (first launch only)
   b. Show auth screen: "Continue with Apple" / "Continue with Google" / "Sign up with email"
   c. On success, Supabase returns JWT
   d. Store session in expo-secure-store
   e. Check if profile.onboarding_completed
   f. If false, show onboarding then set to true
   g. Navigate to main app
```

### 6.3 Authorization Rules

| Action | Required Auth | Required Tier |
|--------|---------------|---------------|
| View/manage grocery list | Authenticated | Free |
| Use in-store mode | Authenticated | Free |
| Manage staples | Authenticated | Free |
| Add items manually | Authenticated | Free |
| AI Meal Planner | Authenticated | Premium |
| AI Floating Assistant | Authenticated | Premium |
| Household sharing | Authenticated | Premium |
| Profile/Settings | Authenticated | Free |

### 6.4 Paywall UI Pattern

When a free user taps a premium feature:
1. Show a bottom sheet explaining the feature with a preview/screenshot
2. "Start 7-day free trial" primary CTA
3. "Restore purchase" link
4. Price displayed clearly: "$3.99/month or $29.99/year"
5. On purchase, update local state immediately (optimistic), validate server-side

---

## 7. API Layer Design

### 7.1 Direct Supabase Calls (No Edge Function Needed)

These use the Supabase client SDK directly. RLS handles authorization.

| Operation | Method | Notes |
|-----------|--------|-------|
| CRUD grocery lists | `supabase.from('grocery_lists')...` | Filtered by RLS |
| CRUD grocery items | `supabase.from('grocery_items')...` | Filtered by RLS |
| CRUD staples | `supabase.from('grocery_staples')...` | Filtered by RLS |
| CRUD meal plans | `supabase.from('meal_plans')...` | Filtered by RLS |
| Read chat history | `supabase.from('chat_messages')...` | Filtered by RLS |
| Realtime list updates | `supabase.channel('list:ID').on(...)` | For household sharing |
| User profile | `supabase.from('profiles')...` | Filtered by RLS |
| Household management | `supabase.from('households')...` | Filtered by RLS |

### 7.2 Edge Functions (Proxy to n8n)

These require server-side logic: subscription validation, API key injection, rate limiting.

```
supabase/functions/
  ai-meal-plan/        # POST - proxy to n8n Meal Creator workflow
    index.ts
  ai-chat/             # POST - proxy to n8n Grocery Chat workflow
    index.ts
  ai-smart-match/      # POST - proxy to n8n Smart Match workflow
    index.ts
  validate-receipt/     # POST - Apple/Google receipt validation
    index.ts
  webhook-apple/        # POST - Apple server-to-server notifications
    index.ts
  webhook-google/       # POST - Google RTDN notifications
    index.ts
```

### 7.3 Edge Function Template

Every AI Edge Function follows this pattern:

```typescript
// supabase/functions/ai-meal-plan/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // 1. Verify JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return new Response('Unauthorized', { status: 401 })

  // 2. Check premium subscription
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', user.id)
    .in('status', ['active', 'grace_period'])
    .gt('current_period_end', new Date().toISOString())
    .single()

  if (!sub) return new Response('Premium required', { status: 403 })

  // 3. Rate limit (simple per-user check)
  // ... (check against a rate_limits table or use Supabase's built-in)

  // 4. Forward to n8n with server-side secret
  const body = await req.json()
  const n8nResponse = await fetch(Deno.env.get('N8N_WEBHOOK_URL') + '/meal_creator', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': Deno.env.get('N8N_INTERNAL_SECRET')!,
    },
    body: JSON.stringify({
      ...body,
      user_id: user.id, // inject authenticated user ID
    }),
  })

  // 5. Return response
  const result = await n8nResponse.json()
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

### 7.4 n8n Webhook Security Update

All n8n webhooks must be updated to:
1. Validate the `X-Internal-Secret` header matches a shared secret
2. Reject any request without it (blocks direct public access)
3. Read `user_id` from the request body (injected by Edge Function)
4. No longer accept `X-API-Key` (removed entirely)

---

## 8. React Native App Structure

### 8.1 Project Structure

```
grocery-ai-mobile/
  app.json                    # Expo config
  eas.json                    # EAS Build config
  babel.config.js
  tsconfig.json               # TypeScript

  src/
    app/                      # App entry + providers
      _layout.tsx             # Root layout (providers, auth gate)
      (auth)/                 # Auth screens (Expo Router groups)
        sign-in.tsx
        sign-up.tsx
      (onboarding)/           # Onboarding flow
        welcome.tsx
        how-it-works.tsx
        get-started.tsx
      (tabs)/                 # Main tab navigator
        _layout.tsx           # Tab bar configuration
        grocery-list.tsx      # Main grocery list screen
        in-store.tsx          # In-store shopping mode
        meal-planner.tsx      # AI Meal Planner
        profile.tsx           # Profile & settings

    components/
      grocery/                # Grocery list components
        GroceryItemRow.tsx
        GroceryItemList.tsx
        CategoryTabs.tsx
        FilterBar.tsx
        AddItemSheet.tsx
        QuickAddBar.tsx
        FinalListReview.tsx
        SaveListButton.tsx    # Floating action button

      in-store/               # In-store mode components
        InStoreItemRow.tsx
        InStoreSectionHeader.tsx
        InStoreProgressBar.tsx
        CompletionCelebration.tsx

      meal-planner/           # Meal planner components
        MealPlannerWizard.tsx  # Orchestrates the 4-step flow
        DescribeMealStep.tsx
        ProposalCards.tsx
        RecipeView.tsx
        CookingMode.tsx        # Step-through instructions (was RecipeInstructions)
        AddToListConfirm.tsx

      ai-assistant/            # Floating AI assistant
        AssistantFAB.tsx       # Floating action button
        AssistantSheet.tsx     # Bottom sheet chat UI
        ChatMessage.tsx
        ChatInput.tsx

      ui/                      # Design system primitives
        Button.tsx
        Card.tsx
        Badge.tsx
        LoadingSpinner.tsx
        SkeletonLoader.tsx
        EmptyState.tsx
        BottomSheet.tsx
        ConfirmDialog.tsx      # Replaces window.confirm()
        PaywallSheet.tsx
        Avatar.tsx

      household/               # Household sharing
        InviteSheet.tsx
        MemberList.tsx
        JoinHouseholdScreen.tsx

    hooks/
      useAuth.ts               # Auth state + session management
      useSubscription.ts       # Premium status check
      useGroceryList.ts        # React Query hooks for grocery CRUD
      useStaples.ts            # React Query hooks for staples
      useMealPlan.ts           # React Query hooks for meal plans
      useAI.ts                 # Edge Function calls for AI features
      useHousehold.ts          # Household management
      useRealtimeList.ts       # Supabase Realtime subscription
      useInStoreMode.ts        # In-store state management
      useKeepAwake.ts          # Screen wake lock (expo-keep-awake)
      useHaptics.ts            # Haptic feedback (expo-haptics)

    lib/
      supabase.ts              # Supabase client initialization
      queryClient.ts           # React Query client config
      storage.ts               # expo-secure-store + AsyncStorage helpers
      constants.ts             # App-wide constants
      theme.ts                 # Color tokens, typography, spacing
      animations.ts            # Reanimated shared configs

    stores/
      uiStore.ts               # Zustand: UI state (active filters, modals, etc.)
      inStoreStore.ts          # Zustand: in-store checked items (persisted to AsyncStorage)

    types/
      database.ts              # Generated from Supabase schema (supabase gen types)
      navigation.ts            # Route/param types

    utils/
      weekDates.ts             # Week calculation utilities (port from current app)
      formatting.ts            # Price, quantity, date formatting
      validation.ts            # Input validation helpers

  supabase/
    migrations/                # SQL migration files
      001_profiles.sql
      002_households.sql
      003_grocery_lists.sql
      004_grocery_staples.sql
      005_meal_plans.sql
      006_chat_sessions.sql
      007_subscriptions.sql
      008_seed_default_staples.sql
    functions/                 # Edge Functions (see Section 7)
      ai-meal-plan/
      ai-chat/
      ai-smart-match/
      validate-receipt/
      webhook-apple/
      webhook-google/

  assets/
    icon.png                   # App icon (1024x1024)
    splash.png                 # Splash screen
    adaptive-icon.png          # Android adaptive icon
    fonts/                     # Custom fonts if needed
    images/                    # Onboarding illustrations, etc.
```

### 8.2 Navigation Architecture

Using Expo Router (file-based routing):

```
Root _layout.tsx
  ├── (auth)/                  # Shown when not authenticated
  │   ├── sign-in.tsx
  │   └── sign-up.tsx
  ├── (onboarding)/            # Shown when !profile.onboarding_completed
  │   ├── welcome.tsx
  │   ├── how-it-works.tsx
  │   └── get-started.tsx
  └── (tabs)/                  # Main app (authenticated)
      ├── grocery-list.tsx     # Tab 1: List icon
      ├── in-store.tsx         # Tab 2: Cart icon
      ├── meal-planner.tsx     # Tab 3: Chef hat icon
      └── profile.tsx          # Tab 4: User icon
      + AssistantFAB overlay   # Floating button (not a tab)
```

### 8.3 State Management Strategy

| State Type | Tool | Why |
|------------|------|-----|
| Server data (lists, items, meals, staples) | React Query (`@tanstack/react-query`) | Caching, background refetch, optimistic updates, pagination. Replaces all manual fetch/retry logic. |
| Auth state | Supabase Auth SDK + React Context | Supabase handles token refresh. Context provides `user`, `session`, `isPremium` to all components. |
| UI state (active tab, filter selection, modal open/closed) | Zustand | Lightweight, no boilerplate. Persisted to AsyncStorage where needed. |
| In-store checked items | Zustand + AsyncStorage | Must survive app kills mid-shopping-trip. Synced to Supabase when online. |
| Theme | `useColorScheme()` + user preference in Zustand | System default with manual override. |

### 8.4 Key Libraries

| Library | Purpose | Why This One |
|---------|---------|-------------|
| `expo` | Framework | Managed workflow, EAS Build, OTA updates |
| `expo-router` | Navigation | File-based routing, deep linking built-in |
| `@supabase/supabase-js` | Backend SDK | Direct database access + auth + realtime |
| `@tanstack/react-query` | Server state | Caching, retries, optimistic updates |
| `zustand` | Local state | Minimal API, great with React Native |
| `react-native-reanimated` | Animations | 60fps, runs on UI thread |
| `react-native-gesture-handler` | Gestures | Swipe to check, pull to refresh |
| `@gorhom/bottom-sheet` | Bottom sheets | Used for AI assistant, add item, paywall |
| `expo-haptics` | Haptic feedback | Tap feedback on item check |
| `expo-keep-awake` | Screen wake lock | In-store mode keeps screen on |
| `expo-secure-store` | Secure storage | Auth tokens, sensitive data |
| `expo-apple-authentication` | Apple Sign-In | Required by Apple |
| `expo-in-app-purchases` or `react-native-purchases` (RevenueCat) | IAP | Subscription management |
| `react-native-confetti-cannon` | Confetti | Completion celebrations |
| `expo-notifications` | Push notifications | Reminders, household updates (v1.1) |

---

## 9. Screen-by-Screen Specifications

### 9.1 Onboarding (3 screens, shown once)

**Screen 1: Welcome**
- App logo + tagline: "The AI-powered grocery list that saves you time"
- Your origin story in one line: "Built by a couple who hated grocery planning"
- "Get Started" button

**Screen 2: How It Works**
- Three value props with icons:
  1. "Build your weekly list in seconds" (list icon)
  2. "AI plans your meals and adds ingredients" (sparkle icon)
  3. "Shop stress-free with in-store mode" (cart icon)
- "Next" button

**Screen 3: Get Started**
- "Continue with Apple" button (prominent, dark, top)
- "Continue with Google" button
- "Sign up with email" text link
- "Already have an account? Sign in" text link
- Terms of service + privacy policy links (required by app stores)

### 9.2 Grocery List (Tab 1 — Free)

This is the core screen. It needs to be excellent.

**Layout:**
```
┌─────────────────────────────┐
│  My Grocery List            │
│  Week of Mar 3 - Mar 9  ▼  │  ← Week selector dropdown
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ Quick Add: [Type item]  │ │  ← Quick add bar (name only, auto-categorize)
│ └─────────────────────────┘ │
│ [Filters ▼] [Group: Aisle▼] │  ← Collapsible filter controls
├─────────────────────────────┤
│ ┌ Produce ─────────────────┐│
│ │ ☑ Bananas         x3    ││  ← Swipe right to check, left to delete
│ │ ☐ Avocados        x2    ││  ← Tap to select/deselect
│ │ ☐ Spinach         x1    ││
│ └──────────────────────────┘│
│ ┌ Dairy ───────────────────┐│
│ │ ☑ Milk (2%)       x1    ││
│ │ ☐ Greek Yogurt    x2    ││
│ └──────────────────────────┘│
│                             │
│      ... more sections ...  │
│                             │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │  ★ Save List (12 items) │ │  ← Sticky floating button. Always visible.
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

**Behaviors:**
- Items come from user's `grocery_staples` (personalized over time)
- Quick Add bar: type a name, hit enter. AI auto-categorizes. Gets added to staples.
- Tap item row to select/deselect for this week
- Tap quantity to increment (long press for custom number)
- Swipe left on item to reveal delete (with confirm dialog, not `window.confirm`)
- Group tabs are horizontal scroll strip (not wrapping pills)
- Filter bar collapses to single "Filters" button on mobile
- "Save List" is a sticky floating button at the bottom, always visible, shows selected count
- On save, React Query mutation with optimistic update. No coupon matching in v1.
- After save, offer "Start Shopping" which navigates to In-Store Mode tab
- Realtime: if another household member edits the list, changes appear live (Supabase Realtime)

**Component Decomposition:**
- `GroceryListScreen` — orchestrates layout, holds query hooks
- `WeekSelector` — dropdown to pick week
- `QuickAddBar` — text input + auto-categorize
- `FilterBar` — collapsible filter controls
- `CategoryTabs` — horizontal scrollable tab strip
- `GroceryItemList` — FlatList with section headers
- `GroceryItemRow` — single item (memoized, swipeable)
- `SaveListFAB` — floating action button

### 9.3 In-Store Mode (Tab 2 — Free)

**This is your best screen. Port it closely with these enhancements:**

**Layout:**
```
┌─────────────────────────────┐
│  ← Back     In-Store Mode   │
│  ████████████░░░░  8/12     │  ← Sticky progress bar
├─────────────────────────────┤
│ ┌ Produce (2/3) ──────── ▼ ┐│  ← Section header, tap to collapse
│ │ ☑ Bananas         x3  ✓ ││  ← Checked items fade/strikethrough
│ │ ☐ Avocados        x2    ││  ← Large 56px touch targets
│ │ ☐ Spinach         x1    ││
│ └──────────────────────────┘│
│ ┌ Dairy (1/2) ─────────  ▼ ┐│
│ │ ☐ Milk (2%)       x1    ││
│ │ ☑ Greek Yogurt    x2  ✓ ││
│ └──────────────────────────┘│
└─────────────────────────────┘

On 100% complete:
┌─────────────────────────────┐
│  🎉 All Done!               │
│                              │
│  You got everything on       │
│  your list! Great job.       │
│                              │
│  [Done Shopping]             │
└─────────────────────────────┘
```

**Behaviors:**
- `expo-keep-awake` keeps screen on (like current wake lock)
- `expo-haptics` provides tactile feedback on item check
- Large 56px minimum touch targets (port from current InStoreMode)
- Sections auto-collapse when all items checked
- Progress bar is sticky at top
- Checked items animate to strikethrough + fade (Reanimated)
- Confetti celebration when all items checked (`react-native-confetti-cannon`)
- Back button with confirmation if items are checked (custom dialog, not `window.confirm`)
- Checked state persisted to AsyncStorage (survives app kill mid-trip)
- On completion, update `grocery_lists.status` to 'completed'
- Update `grocery_staples.usage_count` and `last_used_at` for checked items (fuels future smart suggestions)

### 9.4 AI Meal Planner (Tab 3 — Premium)

**This merges the current MealCreator + RecipeInstructions into one guided flow.**

**Step 1: Describe What You Want**
```
┌─────────────────────────────┐
│  AI Meal Planner     ★ PRO  │
│                              │
│  What kind of meals are you  │
│  looking for this week?      │
│                              │
│  ┌─────────────────────────┐ │
│  │ "Quick weeknight dinners │ │  ← Text input
│  │  for 2, we like Mexican  │ │
│  │  and Italian food"       │ │
│  └─────────────────────────┘ │
│                              │
│  Quick picks:                │
│  [Quick & Easy] [Budget]     │  ← Suggestion chips
│  [Healthy] [Comfort Food]    │
│                              │
│  [Get Meal Suggestions →]    │
└─────────────────────────────┘
```

**Step 2: Review Proposals**
```
┌─────────────────────────────┐
│  ← Back     Meal Suggestions │
│                              │
│  Here are 5 meal ideas:      │
│                              │
│  ┌──────────────────────┐    │
│  │ 🍝 Chicken Parm      │    │  ← Card, tap to expand
│  │ 30 min · Easy · 2srv │    │
│  │ [Add to Plan]        │    │
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │ 🌮 Street Tacos      │    │
│  │ 20 min · Easy · 2srv │    │
│  │ [Add to Plan]        │    │
│  └──────────────────────┘    │
│  ... more ...                │
│                              │
│  [Get Different Ideas]       │  ← Regenerate
│  [Continue with 3 meals →]   │
└─────────────────────────────┘
```

**Step 3: Recipe Detail (expand from card)**
- Full recipe: ingredients list + step-by-step instructions
- "Add Ingredients to Grocery List" button
- "Cook This Now" button → enters cooking mode

**Step 4: Cooking Mode (was RecipeInstructions)**
```
┌─────────────────────────────┐
│  ← Exit    Step 3 of 8      │
│  ████████████░░░░░           │
├─────────────────────────────┤
│                              │
│  Add the diced onions to     │
│  the heated pan and sauté    │
│  for 3-4 minutes until       │
│  translucent.                │
│                              │
│        ⏱ 3:00               │  ← Timer (if step has a time)
│                              │
│  [← Prev]    [Next →]       │  ← Swipe or tap to navigate
│                              │
└─────────────────────────────┘
```

**Behaviors:**
- Paywall gate: if user is free tier, tapping this tab shows PaywallSheet
- "Add Ingredients to Grocery List" calls a Supabase mutation that creates `grocery_items` linked to the `meal_plan_meals` entry
- Cooking Mode uses `expo-keep-awake` (same as in-store)
- Swipe gestures for step navigation (React Native Gesture Handler)
- Step timer with local notification when time's up
- Confetti on completing all steps

### 9.5 Profile / Settings (Tab 4 — Free)

```
┌─────────────────────────────┐
│  Profile                     │
├─────────────────────────────┤
│  ┌─────────────────────────┐ │
│  │ 👤 Corey               │ │
│  │ corey@email.com         │ │
│  │ Premium Member          │ │
│  └─────────────────────────┘ │
│                              │
│  Preferences                 │
│  ├ Dark Mode        [toggle] │
│  ├ Default Store    [HEB  ▼] │
│  ├ Household Size   [2    ▼] │
│                              │
│  Household                   │
│  ├ Members (2)       [Edit>] │
│  ├ Invite Code: A3F2B1 [📋] │
│  ├ Join a Household    [>]   │
│                              │
│  Subscription                │
│  ├ Plan: Premium Monthly     │
│  ├ Renews: Apr 5, 2026      │
│  ├ Manage Subscription  [>]  │
│                              │
│  Support                     │
│  ├ Help & FAQ           [>]  │
│  ├ Contact Us           [>]  │
│  ├ Rate This App        [>]  │
│  ├ Privacy Policy       [>]  │
│  ├ Terms of Service     [>]  │
│                              │
│  [Sign Out]                  │
│                              │
│  v1.0.0                      │
└─────────────────────────────┘
```

**Behaviors:**
- "Manage Subscription" deep-links to the platform's subscription management (iOS Settings / Google Play)
- "Invite Code" has copy-to-clipboard
- "Join a Household" opens a sheet with code input
- "Rate This App" uses `expo-store-review` (triggers native review prompt)
- Privacy Policy and ToS open in-app browser (`expo-web-browser`)
- Sign Out clears all local state + SecureStore + navigates to auth screen

### 9.6 Floating AI Assistant (Overlay — Premium)

**Not a tab. A floating action button visible on all tabs.**

```
┌─────────────────────────────┐
│                              │
│  [Any screen content]        │
│                              │
│                              │
│                         🤖  │  ← Floating button, bottom-right
└─────────────────────────────┘

On tap, opens bottom sheet:
┌─────────────────────────────┐
│  ─── (drag handle) ───      │
│  AI Assistant        [✕]    │
├─────────────────────────────┤
│                              │
│  🤖 Hi! I can help with:    │
│  - "What goes well with     │
│     salmon?"                 │
│  - "Substitute for heavy    │
│     cream?"                  │
│  - "How long does chicken   │
│     last in the fridge?"    │
│                              │
│  USER: What's a good side   │
│  dish for grilled chicken?   │
│                              │
│  🤖 Here are some great     │
│  options: ...                │
│                              │
├─────────────────────────────┤
│ [Type a message...]   [Send]│
└─────────────────────────────┘
```

**Behaviors:**
- Uses `@gorhom/bottom-sheet` — can be swiped up to full screen or down to dismiss
- Context-aware: knows which screen the user is on, what's in their current list
- Chat history persisted to `chat_sessions` / `chat_messages`
- Paywall gate: if free user taps FAB, show PaywallSheet instead
- FAB hides during In-Store Mode (avoid accidental taps while shopping)
- FAB has a subtle pulse animation on first appearance (teach users it exists)

---

## 10. In-App Purchases & Subscription

### 10.1 Product IDs

| Product ID | Type | Price |
|------------|------|-------|
| `com.groceryai.premium.monthly` | Auto-renewable subscription | $3.99/month |
| `com.groceryai.premium.yearly` | Auto-renewable subscription | $29.99/year |

### 10.2 Implementation: RevenueCat vs Native

**Recommended: RevenueCat (`react-native-purchases`)**

RevenueCat abstracts Apple and Google subscription management into one SDK. It handles:
- Receipt validation (you don't build this yourself)
- Subscription status tracking
- Grace periods, billing retries
- Analytics (MRR, churn, trial conversion)
- Webhook to your backend when subscription status changes

| Aspect | RevenueCat | Native (`expo-in-app-purchases`) |
|--------|-----------|--------------------------------|
| Receipt validation | Built-in | You build it (Edge Function + Apple/Google server APIs) |
| Cross-platform sync | Built-in | You build it |
| Analytics | Built-in dashboard | You build it or use a third party |
| Price | Free up to $2.5K MRR, then 1% | Free |
| Complexity | ~50 lines of code | ~500+ lines across client + server |

For a solo developer: **use RevenueCat.** It saves weeks of work.

### 10.3 RevenueCat Integration Flow

```
1. User taps premium feature
2. Show PaywallSheet (your UI, not RevenueCat's)
3. User taps "Start Free Trial" or "Subscribe"
4. RevenueCat.purchasePackage(selectedPackage)
5. RevenueCat handles Apple/Google purchase flow
6. On success:
   a. RevenueCat webhook fires to your Supabase Edge Function
   b. Edge Function upserts `subscriptions` table
   c. Client receives updated CustomerInfo
   d. Update local state (isPremium = true)
   e. Dismiss paywall, show premium feature
7. On failure/cancel:
   a. Show appropriate error or do nothing
```

### 10.4 Free Trial

- 7-day free trial on first subscription
- Configured in App Store Connect and Google Play Console (not in code)
- RevenueCat tracks trial status
- Show trial expiration in Profile/Settings

### 10.5 Restore Purchases

Required by Apple. Must be accessible from:
- PaywallSheet ("Already subscribed? Restore purchase")
- Profile/Settings screen
- Calls `RevenueCat.restorePurchases()`

---

## 11. Accessibility Requirements

Apple and Google both require accessibility. WCAG 2.1 AA is the standard.

### 11.1 Required for Every Interactive Element

```tsx
// EVERY touchable element needs these:
<Pressable
  accessible={true}
  accessibilityRole="button"    // or "checkbox", "tab", "link", etc.
  accessibilityLabel="Add bananas to list"  // what it does, not what it looks like
  accessibilityState={{ checked: isSelected }}  // for toggles
  accessibilityHint="Double tap to add" // optional, extra context
>
```

### 11.2 Screen-by-Screen Requirements

**Navigation:**
- Bottom tab bar: each tab has `accessibilityRole="tab"` and `accessibilityState={{ selected: isActive }}`
- Tab bar container has `accessibilityRole="tablist"`

**Grocery List:**
- Each item row: `accessibilityRole="checkbox"` with `accessibilityState={{ checked }}`
- Category headers: `accessibilityRole="header"`
- Filter controls: `accessibilityRole="radiogroup"` wrapping filter options
- Quantity stepper: `accessibilityLabel="Quantity: 3. Double tap to change"`

**In-Store Mode:**
- Progress bar: `accessibilityRole="progressbar"` with `accessibilityValue={{ min: 0, max: total, now: checked }}`
- Section collapse: `accessibilityState={{ expanded }}`

**Modals / Bottom Sheets:**
- `accessibilityViewIsModal={true}` on the sheet
- Focus trap: first element in sheet receives focus on open
- Close button has `accessibilityLabel="Close"`

**AI Chat:**
- Messages: `accessibilityRole="text"` with `accessibilityLabel="Assistant said: ..."` or `"You said: ..."`
- Send button: `accessibilityLabel="Send message"`

### 11.3 Color & Contrast

- All text must meet 4.5:1 contrast ratio (3:1 for large text)
- Never use color as the sole indicator (the current confidence green/yellow/red issue)
- Support Dynamic Type on iOS (`allowFontScaling={true}` — default in RN)
- Test with system font size set to largest

### 11.4 Testing

- iOS: VoiceOver (`Settings > Accessibility > VoiceOver`)
- Android: TalkBack (`Settings > Accessibility > TalkBack`)
- Xcode Accessibility Inspector for automated checks
- Test every screen with VoiceOver before submission

---

## 12. App Store Requirements

### 12.1 Apple App Store (iOS)

**Developer Account:**
- Apple Developer Program: $99/year
- Requires an Apple ID
- Enrollment takes up to 48 hours

**Required Before Submission:**
- [ ] App icon: 1024x1024 PNG, no alpha, no rounded corners (Apple adds them)
- [ ] Screenshots: minimum 3, required for 6.7" (iPhone 15 Pro Max) and 6.5" (iPhone 11 Pro Max)
- [ ] iPad screenshots if you support iPad (optional for v1 — can mark iPhone-only)
- [ ] App name (30 chars max): "GroceryAI - Smart Meal Planner" (or similar)
- [ ] Subtitle (30 chars max): "AI-Powered Grocery Lists"
- [ ] Description (4000 chars max): explain features, your story
- [ ] Keywords (100 chars): "grocery,list,meal,planner,ai,shopping,recipe,family"
- [ ] Privacy policy URL (REQUIRED — hosted on your website)
- [ ] Terms of service URL (REQUIRED for subscriptions)
- [ ] Support URL
- [ ] App category: "Food & Drink"
- [ ] Age rating: 4+ (no objectionable content)
- [ ] App Privacy Nutrition Labels: declare all data collected/used

**Apple-Specific Technical Requirements:**
- [ ] Apple Sign-In (REQUIRED because you offer Google Sign-In)
- [ ] In-App Purchase products created in App Store Connect
- [ ] Subscription group created with monthly + yearly options
- [ ] Free trial configured in App Store Connect
- [ ] "Restore Purchases" button accessible from settings
- [ ] Privacy manifest file (`PrivacyInfo.xcprivacy`) — required since 2024 for any app using tracking APIs
- [ ] No private API usage
- [ ] Works on iOS 16+ (Expo default minimum)
- [ ] Passes `expo run:ios` build without warnings

**Common Rejection Reasons to Avoid:**
1. "Wrapper app" — app must feel native, not like a website in a frame. React Native is fine; Capacitor can be risky.
2. Missing "Restore Purchases" — Apple requires this for all subscription apps.
3. Incomplete functionality — all screens must work. No "Coming Soon" screens.
4. Privacy policy missing or inadequate.
5. Sign-in required for features that don't need it — Apple may require parts of the app to work without sign-in. Since your free features (list, in-store) require user data, sign-in is justified.
6. Metadata mismatch — screenshots must match actual app. No mockups.

### 12.2 Google Play Store (Android)

**Developer Account:**
- Google Play Console: $25 one-time fee
- Registration takes 1-2 days

**Required Before Submission:**
- [ ] App icon: 512x512 PNG
- [ ] Feature graphic: 1024x500 (shown at top of Play Store listing)
- [ ] Screenshots: minimum 2, required for phone. Recommended: 8.
- [ ] Short description (80 chars): "AI-powered grocery lists and meal planning for families"
- [ ] Full description (4000 chars)
- [ ] Privacy policy URL (REQUIRED)
- [ ] App category: "Food & Drink"
- [ ] Content rating: IARC questionnaire (takes 5 minutes)
- [ ] Target audience declaration: 18+ (simplest; avoids Families Policy)
- [ ] Data safety form: declare all data collected, shared, and security practices

**Google-Specific Technical Requirements:**
- [ ] Target Android API 34+ (current requirement)
- [ ] Billing library v5+ for subscriptions
- [ ] Data safety form completed
- [ ] App signing by Google Play (upload your signing key)
- [ ] 20 testers for closed testing track (required before production launch since Nov 2023)
- [ ] 14 days of closed testing before production review

**Important: Google's 14-Day Testing Requirement**
Since November 2023, new developer accounts must:
1. Create a closed testing track
2. Have at least 20 testers opted in
3. Run the closed test for at least 14 consecutive days
4. Then you can apply for production access

**This means you need 20 people who will install a test build.** Friends, family, co-workers. Plan for this early.

### 12.3 Legal Documents Needed

**Privacy Policy (Required by Both):**
Must disclose:
- What data you collect (email, name, grocery lists, meal preferences, chat messages)
- How you use it (provide the service, improve AI, analytics)
- Third parties that receive data (Supabase, Anthropic for AI, RevenueCat for payments)
- How users can delete their data (GDPR right to erasure)
- Data retention period
- Children's data (state that app is not for children under 13)
- Contact information

Host this on a public URL (your website or a simple GitHub Pages site).

**Terms of Service (Required for Subscriptions):**
Must include:
- Subscription terms (auto-renewal, pricing, cancellation)
- Acceptable use policy
- Disclaimer: AI suggestions are not nutritional advice
- Limitation of liability
- Intellectual property (user owns their data)
- Termination conditions

---

## 13. CI/CD Pipeline

### 13.1 GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck        # TypeScript
      - run: npm test -- --ci --coverage
      - uses: codecov/codecov-action@v4  # optional: coverage tracking
```

### 13.2 EAS Build (Expo Application Services)

```json
// eas.json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false },
      "channel": "preview"
    },
    "production": {
      "channel": "production",
      "ios": { "buildConfiguration": "Release" },
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "your-apple-id@email.com", "ascAppId": "YOUR_ASC_APP_ID" },
      "android": { "serviceAccountKeyPath": "./google-play-key.json" }
    }
  }
}
```

### 13.3 Deployment Flow

```
Feature Branch → PR → CI (lint + test + typecheck) → Code Review → Merge to main
                                                                        │
                                                                        ▼
                                                               EAS Build triggered
                                                                        │
                                                            ┌───────────┼───────────┐
                                                            ▼                       ▼
                                                      iOS Build              Android Build
                                                            │                       │
                                                            ▼                       ▼
                                                      TestFlight            Internal Track
                                                            │                       │
                                                            ▼                       ▼
                                                    Manual promote          Manual promote
                                                     to App Store           to Production
```

### 13.4 OTA Updates (Expo Updates)

For non-native changes (JS bundle), you can push updates without app store review:

```bash
eas update --branch production --message "Fix grocery list sort order"
```

This is huge for bug fixes. Users get the update next time they open the app.

---

## 14. Migration Plan: Current Data to Supabase

### 14.1 What Migrates

| Current Source | Current Location | Destination | Notes |
|---------------|-----------------|-------------|-------|
| Grocery staple items | MySQL `hsa` database | `default_staples` table | One-time seed. Becomes the template for new users. |
| Grocery list structure | MySQL | Schema only — no user data | New users start fresh |
| Chat history | Postgres (n8n internal) | `chat_sessions` + `chat_messages` | Optional: your personal data can be migrated. Other users start fresh. |
| Meal/recipe data | Postgres (n8n internal) | `meal_plan_meals` | Optional: same as chat |
| Coupon data | MySQL `heb_coupons` | NOT migrated for v1 | Comes back in v2 with legit data source |
| Coupon matches | MySQL `coupon_matches` | NOT migrated for v1 | Same |
| HEB product matches | MySQL `heb_product_matches` | NOT migrated for v1 | HEB features removed |

### 14.2 Migration Steps

1. **Export grocery staples from MySQL:**
   ```sql
   SELECT DISTINCT ItemName, Category, Section, Store, Type
   FROM GroceryChecklist
   WHERE IsActive = 1
   ORDER BY Category, ItemName;
   ```

2. **Transform to `default_staples` INSERT:**
   ```sql
   INSERT INTO default_staples (name, category, section, item_type, sort_order)
   VALUES
     ('Bananas', 'Produce', 'Fresh Fruits', 'basic', 1),
     ('Milk (2%)', 'Dairy', 'Refrigerated', 'basic', 2),
     -- ... generated from MySQL export
   ;
   ```

3. **Run as Supabase migration:** Save as `008_seed_default_staples.sql`

4. **Build the signup seed function:** Edge Function or database trigger that copies `default_staples` into `grocery_staples` for each new user.

### 14.3 Your Personal Data

Your current lists, chat history, and meals can be migrated to your own account in the new system. This is a one-time script:

1. Create your account in the new app
2. Run a migration script that:
   - Reads your MySQL grocery data
   - Reads your Postgres chat history
   - Inserts into the new Supabase tables with your `user_id`
3. Verify everything looks right
4. Done — your existing data lives in the new system

---

## 15. n8n Workflow Changes

### 15.1 What Changes

| Workflow | Current State | New State |
|----------|--------------|-----------|
| Fetch Grocery Items (K1kGPK4rJNImPnY1) | Public webhook, serves MySQL data | **DECOMMISSION** — Supabase serves data directly |
| Add Grocery Items | Public webhook, inserts to MySQL | **DECOMMISSION** — Supabase handles CRUD |
| Deactivate Grocery Item | Public webhook, soft-delete in MySQL | **DECOMMISSION** — Supabase handles CRUD |
| Meal Creator | Public webhook | **UPDATE** — validate `X-Internal-Secret`, read `user_id` from body |
| Grocery Chat Agent | Public webhook | **UPDATE** — validate `X-Internal-Secret`, read `user_id` from body |
| Smart Match (DDlygjzqHlLs4V1E) | Public webhook | **UPDATE** — validate `X-Internal-Secret`, read `user_id` from body |
| Match Coupons AI (CuaKAgmacIOTN6vW) | Public webhook | **DECOMMISSION for v1** — coupon features removed |
| Save Coupon Matches (nznc27SZO17zZQh0) | Public webhook | **DECOMMISSION for v1** |
| Smart Deals (PSRbvFrHGRHdBjdf) | Public webhook | **DECOMMISSION for v1** |
| Fetch HEB Coupons (K1kGPK4rJNImPnY1) | Public webhook | **DECOMMISSION for v1** |
| Chat History API (Kz9hrwAH0hVzNR4Y) | Public webhook, reads Postgres | **DECOMMISSION** — Supabase serves chat history directly |

### 15.2 n8n Security Hardening

For remaining workflows (Meal Creator, Chat Agent, Smart Match):

```
Webhook Node:
  - Add header auth: X-Internal-Secret must match env var
  - Remove X-API-Key validation (no longer used)
  - CORS: remove * wildcard, add only your Supabase Edge Function origin
  - webhookId: keep existing (required for n8n)

First Node After Webhook:
  - Validate X-Internal-Secret header
  - Extract user_id from body
  - If either missing, return 401
```

### 15.3 n8n Scaling Consideration

n8n remains a single Docker container. For v1 with early users, this is fine. If you reach hundreds of concurrent AI requests, consider:
- Scaling n8n to multiple workers (`N8N_CONCURRENCY_PRODUCTION_LIMIT`)
- Or replacing n8n AI workflows with direct Anthropic API calls in Supabase Edge Functions (eliminating n8n entirely)

The Edge Function pattern already positions you for this migration — if n8n becomes a bottleneck, you rewrite the Edge Functions to call Anthropic directly instead of proxying to n8n. No client code changes needed.

---

## 16. Analytics & Monitoring

### 16.1 What to Track

**Acquisition:**
- Downloads, signups, onboarding completion rate
- Auth method breakdown (Apple vs Google vs email)

**Activation:**
- First list created within 24 hours of signup
- First item added to list
- First in-store shopping session

**Engagement:**
- Weekly active users
- Lists created per week
- Items per list (average)
- In-store mode sessions per week
- AI Meal Planner usage (premium)
- AI Assistant messages per session (premium)

**Revenue:**
- Trial start rate
- Trial → paid conversion rate
- Monthly recurring revenue (MRR)
- Churn rate
- Average revenue per user (ARPU)

**Technical:**
- API response times (Edge Functions)
- Error rates by endpoint
- App crash rate
- n8n workflow execution time

### 16.2 Tools

| Tool | Purpose | Cost |
|------|---------|------|
| RevenueCat Dashboard | Revenue analytics, cohort analysis, trial conversion | Free (included) |
| Supabase Dashboard | Database metrics, auth stats, Edge Function logs | Free (included) |
| Expo Analytics | Crash reporting, OTA update adoption | Free (included in EAS) |
| PostHog or Mixpanel | Product analytics (funnels, retention) | Free tier available |
| Sentry (via `sentry-expo`) | Error tracking, crash reporting | Free tier (5K events/mo) |

### 16.3 Implementation Priority

For v1, start with:
1. RevenueCat (comes free with subscription integration)
2. Sentry for crash reporting (critical for app store apps)
3. Supabase dashboard for backend metrics

Add PostHog/Mixpanel in v1.1 once you want deeper product analytics.

---

## 17. Phased Roadmap

### Phase 1: Foundation (Weeks 1-3)

**Goal:** New React Native project with auth, database, and one working screen.

- [ ] Initialize Expo project with TypeScript
- [ ] Set up Supabase project (auth, database)
- [ ] Run all SQL migrations (tables, RLS policies, triggers)
- [ ] Seed `default_staples` from current MySQL data
- [ ] Implement auth flow (Apple Sign-In, Google Sign-In, email)
- [ ] Build onboarding screens (3 screens)
- [ ] Build Profile/Settings screen (scaffolding)
- [ ] Set up React Query + Supabase client
- [ ] Set up Zustand stores
- [ ] Build design system primitives (Button, Card, etc.)
- [ ] Define color tokens and typography
- [ ] Set up GitHub Actions CI (lint, test, typecheck)
- [ ] Configure EAS Build for development builds

**Exit criteria:** Can sign up, see onboarding, land on empty app shell with working auth.

### Phase 2: Core Grocery List (Weeks 3-5)

**Goal:** Fully functional grocery list that replaces the current app's core feature.

- [ ] Build Grocery List screen (all sub-components)
- [ ] Implement CRUD operations via Supabase
- [ ] Quick Add bar with auto-categorization
- [ ] Category tabs (horizontal scroll)
- [ ] Collapsible filter bar
- [ ] Floating Save List button
- [ ] Swipe-to-delete with confirmation dialog
- [ ] Quantity management
- [ ] Week selector
- [ ] Build In-Store Mode (port from current, enhance)
- [ ] Haptic feedback on item check
- [ ] Reanimated animations (check, strikethrough, section collapse)
- [ ] Confetti on completion
- [ ] AsyncStorage persistence for mid-trip state
- [ ] Realtime subscriptions for household sharing
- [ ] Write tests for all hooks and critical paths

**Exit criteria:** Can create a list, save it, shop with it in-store, complete it. Works offline-ish (cached data). Feels great.

### Phase 3: AI Features + Paywall (Weeks 5-8)

**Goal:** Premium features working behind paywall.

- [ ] Set up RevenueCat
- [ ] Build PaywallSheet component
- [ ] Implement subscription purchase flow
- [ ] Build Supabase Edge Functions (ai-meal-plan, ai-chat, ai-smart-match)
- [ ] Update n8n workflows (add secret validation, remove public access)
- [ ] Build AI Meal Planner wizard (4 steps)
- [ ] Build Cooking Mode (step-through instructions)
- [ ] Build "Add Ingredients to List" flow
- [ ] Build Floating AI Assistant (FAB + bottom sheet)
- [ ] Chat message persistence (Supabase)
- [ ] Rate limiting per user in Edge Functions
- [ ] Write tests for AI flows

**Exit criteria:** Free users see paywall when tapping AI features. Paid users can plan meals, chat with assistant, and add meal ingredients to their list.

### Phase 4: Household Sharing (Weeks 8-9)

**Goal:** Multiple users can share a grocery list.

- [ ] Build household creation flow
- [ ] Invite code generation + sharing (native share sheet)
- [ ] Join household flow
- [ ] Member management (view members, remove)
- [ ] Realtime list sync (Supabase Realtime)
- [ ] Handle conflicts (two users editing same item)
- [ ] Test with 2+ devices simultaneously

**Exit criteria:** Two people on different phones can share and edit the same grocery list in real time.

### Phase 5: Polish & App Store Prep (Weeks 9-11)

**Goal:** App store ready.

- [ ] Full accessibility audit with VoiceOver + TalkBack
- [ ] Fix all a11y issues found
- [ ] Performance profiling (Flipper, React DevTools)
- [ ] Design app icon (1024x1024)
- [ ] Design splash screen
- [ ] Take app store screenshots (iPhone + Android)
- [ ] Write app store description and keywords
- [ ] Create privacy policy page (hosted)
- [ ] Create terms of service page (hosted)
- [ ] Set up Apple Developer account
- [ ] Set up Google Play Console account
- [ ] Configure App Store Connect (app listing, IAP products, subscription group)
- [ ] Configure Google Play Console (app listing, IAP products, closed testing track)
- [ ] Set up Sentry for crash reporting
- [ ] TestFlight build for iOS beta testers
- [ ] Internal track build for Android beta testers

**Exit criteria:** App submitted to both stores. All metadata complete. Privacy and legal docs hosted.

### Phase 6: Launch (Weeks 11-12)

**Goal:** Live on both app stores.

- [ ] Recruit 20 testers for Google Play closed testing (14-day requirement)
- [ ] Run 14-day closed test on Google Play
- [ ] Submit iOS to App Store review
- [ ] Submit Android to Google Play production review
- [ ] Address any review feedback/rejections
- [ ] Create simple landing page with app store links
- [ ] Monitor crash reports and error rates post-launch
- [ ] Monitor RevenueCat for first subscriptions

**Exit criteria:** App live on both stores. No critical crashes. Subscriptions working.

### Phase 7: Post-Launch / v1.1+ (Ongoing)

- [ ] Push notifications (shopping reminders, household activity)
- [ ] Apply to Quotient publisher program for coupon data
- [ ] Apply to Kroger developer API
- [ ] Smart Deals feature (when data source secured)
- [ ] Deeper analytics (PostHog/Mixpanel)
- [ ] User feedback collection (in-app feedback button)
- [ ] Iterate based on real user behavior data

---

## 18. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Apple rejects app | Medium | High (1-2 week delay) | Follow all guidelines precisely. Test with TestFlight first. Common rejections checklist above. |
| Google 14-day testing requirement delays launch | High | Medium (2-week delay) | Start recruiting 20 testers in Phase 1. Begin closed test as soon as build is stable. |
| n8n can't handle concurrent AI requests | Low (v1) | Medium | Edge Function pattern allows swapping n8n for direct Anthropic calls without client changes. |
| Supabase free tier limits hit | Low (v1) | Low | Generous free tier (50K MAU, 500MB DB, 1GB storage). Upgrade to Pro ($25/mo) if needed. |
| RevenueCat subscription webhook failures | Low | High (users pay but don't get premium) | Edge Function validates receipt directly with Apple/Google as fallback. |
| Users don't convert from free to paid | Medium | High (no revenue) | Ensure free tier is genuinely useful. AI features must be obviously valuable in onboarding. |
| Coupon data partners reject application | Medium | Low (v2 feature, not v1 blocker) | Multiple options (Quotient, Kroger, Ibotta). Start applications early. |
| Solo developer burnout | Medium | High | AI assistance dramatically reduces workload. Phased approach means each phase delivers value. Can pause after any phase. |

---

## 19. Open Questions

These need answers but don't block starting Phase 1:

1. **App name:** "GroceryAI" is a working title. Need to check trademark availability and app store name availability. Alternatives: "ListAI", "MealCart", "GrocerEase", etc.
2. **Pricing validation:** $3.99/mo is a starting point. Research competitor pricing. Consider starting higher (you can always lower, but raising prices angers existing users).
3. **Default staples list:** How comprehensive should the seed data be? Too many items overwhelms new users. Too few and the app feels empty. Consider: top 100 most common grocery items, organized by category.
4. **AI model for mobile:** Currently using Claude Haiku via n8n. Haiku is fast and cheap — good for v1. Monitor costs and quality.
5. **Offline support:** How much should work without internet? List viewing and in-store mode should work offline (cached). AI features obviously need connectivity.
6. **iPad support:** Skip for v1? iPhone-only simplifies screenshots and testing. Add iPad in v1.1.
7. **Dark mode implementation:** System default with manual override? Or manual only? Recommend: system default with override in settings.

---

## Appendix A: Current Codebase Reference

Files from the existing React SPA that inform the rebuild:

| Existing File | What to Port | What to Change |
|--------------|-------------|----------------|
| `src/components/InStoreMode.js` | Touch targets, progress bar, confetti, wake lock, section collapse | Replace web APIs with Expo equivalents. Reanimated instead of Framer Motion. |
| `src/components/GroceryChecklist.js` | Item selection, quantity management, grouping, filtering | Decompose into 6+ smaller components. React Query instead of manual fetch. Server-generated IDs. |
| `src/components/MealCreator.js` | AI meal proposal flow, recipe display | Merge with RecipeInstructions into wizard. Edge Function instead of direct webhook. |
| `src/components/ChatBot.js` | Chat UI, message rendering, session management | Becomes floating bottom sheet. Crypto UUIDs for sessions. |
| `src/styles/tokens.js` | Color token architecture, semantic naming | Port to React Native StyleSheet + useColorScheme. Keep the semantic token concept. |
| `src/config/api.js` | Endpoint organization pattern | Replace with Supabase client + Edge Function calls. No direct webhook URLs. |
| `src/utils/weekDates.js` | Week calculation logic | Port directly — pure JS, no web dependencies. |
| `src/utils/animations.js` | Animation timing/easing concepts | Replace Framer Motion configs with Reanimated equivalents. |
| `src/components/ui/Button.js` | Loading state, tactile feedback, variant system | Port to React Native Pressable with same variants. |

---

*This document is the source of truth for the GroceryAI market launch. All implementation decisions should reference it.*
