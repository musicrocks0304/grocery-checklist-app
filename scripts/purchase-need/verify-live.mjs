#!/usr/bin/env node
// LIVE verification for purchase-need slice 1.
// Spec: docs/superpowers/specs/2026-09-18-purchase-need-design.md, "Slice 1 verification".
//
// Talks to the PRODUCTION webhooks and MySQL — there is no sandbox. Every phase
// that writes works only on a THROWAWAY week that must be empty before it starts,
// watermarks with MAX(id), proves the revert path with a no-op DELETE first,
// and reverts in `finally` (children first is moot: nothing references these
// rows). It never touches Corey's shopping week and never the HEB cart.
//
// Rows it can create, and how they are removed:
//   weekly_selections  get_recipe_items INSERT IGNOREs every recipe for the week
//   WeeklyGroceryList  meal_ingredients writes the list
// Both are deleted by (throwaway week AND id > watermark).
//
// Phases (node scripts/purchase-need/verify-live.mjs <phase> [file]):
//   dry                  preconditions + watermarks + no-op DELETE proof only
//   multiplier           Task 3: RecipeMultiplier written, and updated on resubmit
//   snapshot <file>      Task 4, BEFORE applying: record fetch_grocery_items (read-only)
//   derivation <file>    Task 4, AFTER applying: compare against the snapshot (read-only)
//   agent                Task 5: get_recipe_items emits the structured need
//   full                 Task 10: the spec's whole slice-1 verification list
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { sql, q } from './mysql.mjs';

const ROOT = process.env.REPO_ROOT ? pathToFileURL(`${process.env.REPO_ROOT}/`) : new URL('../../', import.meta.url);
const env = readFileSync(new URL('.env', ROOT), 'utf8');
const API_KEY = (env.match(/^REACT_APP_API_KEY=(.*)$/m) || [])[1]?.trim();
const BASE = (env.match(/^REACT_APP_API_BASE_URL=(.*)$/m) || [])[1]?.trim() || 'https://n8n-grocery.needexcelexpert.com/webhook';
if (!API_KEY) throw new Error('REACT_APP_API_KEY not found in .env');
const { formatNeed } = await import(new URL('src/utils/formatPurchase.js', ROOT).href);
const { getWeekDates } = await import(new URL('src/utils/weekDates.js', ROOT).href);

// The throwaway week. 2026-05-17 holds no WeeklyGroceryList, weekly_selections
// or shopping_progress rows (checked below before every write), is in the past so
// it can never be the week Corey shops and the Thursday flip cannot reach it, and
// it is on or after 2026-04-26 — the need derivation's ItemID-convention guard,
// which makes a 2020 week derive NOTHING.
const WEEK = { start: '2026-05-17', end: '2026-05-23', display: 'For the week of May 17th to May 23rd, 2026' };
const PAST_MEAL_WEEK = { start: '2026-07-05', end: '2026-07-11', display: 'For the week of July 5th to July 11th, 2026' };
const EMPTY_WEEK = { start: '2019-01-06', end: '2019-01-12', display: 'For the week of January 6th to January 12th, 2019' };

// Recipes chosen for coverage (see the plan's Task 10 table): 24 teriyaki glaze
// 1 fluid ounce (counted-unit set); 56 garlic with NO unit (the fold); 59 Frito
// Chili Pie, genuine duplicated rows; 61 lime with no unit + 68 lime in pieces
// (the fold that raises stored Quantity); 68 corn tortillas 12 pieces.
const RECIPES = [24, 56, 59, 61, 68];
const REMOVE = 56; // a garlic recipe
const MULT = { 'corn tortillas': 3, 'ground turkey': 2, 'black pepper': 2 };
const NEED = ['NeedOz', 'NeedTsp', 'NeedCount', 'NeedCountUnit', 'NeedUnspecified'];
const ORIGINAL_KEYS = ['ItemID', 'ItemName', 'Category', 'Store', 'GroceryStoreSection', 'Type', 'IsActive', 'DataSource', 'QuantitySelected', 'IsSelected', 'Unit', 'store_location', 'RecipeNames', 'IsOptional'];

const failures = [];
const expect = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures.push(msg); };
const r3 = (v) => (v === null || v === undefined || v === '' ? null : Math.round(Number(v) * 1000) / 1000);
const lc = (s) => String(s || '').trim().toLowerCase();

async function call(path, { method = 'GET', body, query } = {}) {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.append(k, v);
  const res = await fetch(url, {
    method,
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const fetchList = async (week) => {
  const rows = await call('fetch_grocery_items', {
    query: { weekStartDate: week.start, weekEndDate: week.end, weekDateRange: week.display, timestamp: new Date().toISOString() },
  });
  if (!Array.isArray(rows) || rows.length === 0 || !('ItemName' in rows[0])) {
    throw new Error(`fetch_grocery_items returned no rows for ${week.start}: ${JSON.stringify(rows).slice(0, 200)}`);
  }
  return rows;
};

// ---- protocol --------------------------------------------------------------
function snapshotCounts() {
  const n = (x) => Number(x || 0);
  const [w] = sql(`SELECT COUNT(*) n, COALESCE(MAX(id), 0) mx, SUM(week_start_date = ${q(WEEK.start)} OR WeekDateRange = ${q(WEEK.display)}) wk FROM WeeklyGroceryList`);
  const [s] = sql(`SELECT COUNT(*) n, COALESCE(MAX(selection_id), 0) mx, SUM(WeekDateRange = ${q(WEEK.display)}) wk FROM weekly_selections`);
  const [p] = sql(`SELECT COUNT(*) n, SUM(week_start_date = ${q(WEEK.start)}) wk FROM shopping_progress`);
  return {
    wgl: { n: n(w.n), mx: n(w.mx), wk: n(w.wk) },
    ws: { n: n(s.n), mx: n(s.mx), wk: n(s.wk) },
    sp: { n: n(p.n), wk: n(p.wk) },
  };
}
function revert(wm) {
  const [a] = sql(`DELETE FROM WeeklyGroceryList WHERE week_start_date = ${q(WEEK.start)} AND WeekDateRange = ${q(WEEK.display)} AND id > ${wm.wgl}; SELECT ROW_COUNT() AS affected`);
  const [b] = sql(`DELETE FROM weekly_selections WHERE WeekDateRange = ${q(WEEK.display)} AND selection_id > ${wm.ws}; SELECT ROW_COUNT() AS affected`);
  return { wgl: Number(a.affected), ws: Number(b.affected) };
}
function begin() {
  const before = snapshotCounts();
  console.log(`baseline: WGL ${before.wgl.n} rows (MAX id ${before.wgl.mx}); weekly_selections ${before.ws.n} (MAX ${before.ws.mx}); shopping_progress ${before.sp.n}`);
  if (before.wgl.wk || before.ws.wk || before.sp.wk) {
    throw new Error(`throwaway week ${WEEK.start} is NOT empty (WGL ${before.wgl.wk}, ws ${before.ws.wk}, sp ${before.sp.wk}) — refusing to write; investigate first`);
  }
  const wm = { wgl: before.wgl.mx, ws: before.ws.mx };
  const noop = revert(wm);
  expect(noop.wgl === 0 && noop.ws === 0, `revert path proven: no-op DELETE removed ${noop.wgl}+${noop.ws} rows`);
  if (noop.wgl || noop.ws) throw new Error('the no-op DELETE removed rows — STOP');
  return { before, wm };
}
function finish({ before, wm }) {
  const removed = revert(wm);
  const after = snapshotCounts();
  console.log(`reverted: ${removed.wgl} WeeklyGroceryList + ${removed.ws} weekly_selections rows`);
  // Totals can move if Corey uses the app meanwhile, so prove the two things
  // that matter: every row that existed before is still there, and the
  // throwaway week is empty again.
  const [w] = sql(`SELECT COUNT(*) n FROM WeeklyGroceryList WHERE id <= ${wm.wgl}`);
  const [s] = sql(`SELECT COUNT(*) n FROM weekly_selections WHERE selection_id <= ${wm.ws}`);
  expect(Number(w.n) === before.wgl.n && Number(s.n) === before.ws.n,
    `every pre-existing row intact: WGL ${w.n}/${before.wgl.n}, weekly_selections ${s.n}/${before.ws.n}`);
  expect(after.wgl.wk === 0 && after.ws.wk === 0 && after.sp.wk === 0,
    `throwaway week empty again (WGL ${after.wgl.wk}, ws ${after.ws.wk}, shopping_progress ${after.sp.wk})`);
  console.log(`now: WGL ${after.wgl.n} rows (MAX id ${after.wgl.mx}); weekly_selections ${after.ws.n}; shopping_progress ${after.sp.n}`);
}

// ---- the app's own calls, shaped exactly as the app sends them -------------
async function recipeItems(ids, week = WEEK) {
  const meals = sql(`SELECT recipe_id, recipe_name FROM recipes WHERE recipe_id IN (${ids.map(Number).join(',')})`);
  const res = await call('get_recipe_items', {
    method: 'POST',
    body: { // useGenerateGroceryList.js
      recipe_ids: JSON.stringify(ids),
      session_id: `purchase-need-verify-${Date.now()}`,
      timestamp: new Date().toISOString(),
      meal_count: String(ids.length),
      meals: JSON.stringify(meals.map((m) => ({ id: Number(m.recipe_id), name: m.recipe_name, description: '' }))),
      week_start_date: week.start,
      week_end_date: week.end,
      week_display_range: week.display,
    },
  });
  const ings = (Array.isArray(res) ? res[0] : res)?.output?.ingredients;
  if (!Array.isArray(ings) || ings.length === 0) throw new Error(`get_recipe_items returned no ingredients: ${JSON.stringify(res).slice(0, 300)}`);
  return ings;
}
// RecipeIngredients.js: transform (:177-194) + handleAddToMainList (:69-95).
async function submit(ingredients, mult) {
  let id = 1;
  const selected = ingredients.map((ing) => ({
    ItemID: id++,
    ItemName: ing.name,
    Category: ing.category,
    Store: 'HEB',
    GroceryStoreSection: ing.category,
    Type: 'Basic',
    IsActive: 1,
    IsSelected: 1,
    QuantitySelected: ing.purchaseQuantity || '1',
    Unit: ing.purchaseUnit || 'item',
    RecipeNeeds: ing.recipeNeeds || '',
    FromMeals: ing.usedInRecipes || [],
    quantity: mult[lc(ing.name)] || 1,
  }));
  await call('meal_ingredients', {
    method: 'POST',
    body: {
      ingredients: JSON.stringify(selected),
      totalItems: String(selected.length),
      selectedMeals: JSON.stringify([]),
      weekStartDate: WEEK.start,
      weekEndDate: WEEK.end,
      weekDateRange: WEEK.display,
      timestamp: new Date().toISOString(),
      source: 'purchase_need_verify',
    },
  });
  return selected;
}
const storedRows = () => new Map(
  sql(`SELECT ItemName, Quantity, Unit, RecipeMultiplier FROM WeeklyGroceryList WHERE week_start_date = ${q(WEEK.start)} AND WeekDateRange = ${q(WEEK.display)}`)
    .map((r) => [lc(r.ItemName), r]),
);

// ---- phases ------------------------------------------------------------------
async function phaseMultiplier() {
  const items = [
    { name: 'Corn tortillas', category: 'Pasta, rice & grains', purchaseQuantity: '12', purchaseUnit: 'items' },
    { name: 'Garlic', category: 'Fruit & vegetables', purchaseQuantity: '1 head', purchaseUnit: 'whole head' },
  ];
  await submit(items, { 'corn tortillas': 3 });
  let s = storedRows();
  expect(s.size === 2, `2 rows written (got ${s.size})`);
  expect(s.get('corn tortillas')?.RecipeMultiplier === '3', `Corn tortillas RecipeMultiplier 3 (got ${s.get('corn tortillas')?.RecipeMultiplier})`);
  expect(s.get('corn tortillas')?.Quantity === '36', `Corn tortillas Quantity 36 (got ${s.get('corn tortillas')?.Quantity})`);
  expect(s.get('garlic')?.RecipeMultiplier === '1', `Garlic RecipeMultiplier 1 (got ${s.get('garlic')?.RecipeMultiplier})`);
  await submit(items, {});
  s = storedRows();
  expect(s.get('corn tortillas')?.RecipeMultiplier === '1', `resubmit at x1 UPDATES RecipeMultiplier to 1 (got ${s.get('corn tortillas')?.RecipeMultiplier})`);
  expect(s.get('corn tortillas')?.Quantity === '12', `resubmit at x1 Quantity 12 (got ${s.get('corn tortillas')?.Quantity})`);
}

const weeksForDerivation = () => [PAST_MEAL_WEEK, getWeekDatesAsWeek(), EMPTY_WEEK];
function getWeekDatesAsWeek() {
  const w = getWeekDates();
  return { start: w.startDate, end: w.endDate, display: w.displayRange };
}
async function phaseSnapshot(file) {
  const out = {};
  for (const w of weeksForDerivation()) out[w.start] = await fetchList(w);
  writeFileSync(file, JSON.stringify(out));
  for (const [k, rows] of Object.entries(out)) console.log(`snapshot ${k}: ${rows.length} rows`);
}
async function phaseDerivation(file) {
  const before = JSON.parse(readFileSync(file, 'utf8'));
  const [past, current, empty] = weeksForDerivation();
  for (const w of [past, current, empty]) {
    const after = await fetchList(w);
    const old = before[w.start];
    if (w === current) {
      // Corey edits his own week while we work, so it is a smoke check only:
      // it still loads, and every row carries the new keys.
      console.log(`      ${w.start} is the live shopping week: smoke check only (${old.length} -> ${after.length} rows)`);
    } else {
      expect(after.length === old.length, `${w.start}: same row count (${old.length} -> ${after.length})`);
      const key = (r) => ORIGINAL_KEYS.map((k) => JSON.stringify(r[k])).join('|');
      const oldKeys = new Set(old.map(key));
      const drifted = after.filter((r) => !oldKeys.has(key(r)));
      expect(drifted.length === 0, `${w.start}: the 14 original columns are unchanged (${drifted.length} drifted)`);
    }
    expect(after.every((r) => NEED.every((k) => k in r)), `${w.start}: every row carries all five need keys`);
    // A need may only appear on a name that has a MealIngredients row that week.
    // (CW can label a name group 'Staples' while carrying its meal row's need —
    // the spec's render rule keys on the rendered need for exactly that reason.)
    const mealNames = new Set(sql(`SELECT DISTINCT LOWER(TRIM(ItemName)) AS n FROM WeeklyGroceryList WHERE WeekDateRange = ${q(w.display)} AND DataSource = 'MealIngredients'`).map((r) => r.n));
    const stray = after.filter((r) => NEED.some((k) => r[k] !== null) && !mealNames.has(lc(r.ItemName)));
    expect(stray.length === 0, `${w.start}: only names with a meal row carry a need (${stray.map((r) => r.ItemName).join(', ')})`);
    if (w === empty) expect(after.every((r) => NEED.every((k) => r[k] === null)), `${w.start} (clean slate): all need keys NULL`);
    if (w === past) {
      const meal = after.filter((r) => r.DataSource === 'MealIngredients');
      const withText = meal.filter((r) => formatNeed(r) !== '');
      expect(meal.length > 0 && withText.length === meal.length, `${w.start}: every meal row renders a need (${withText.length}/${meal.length})`);
      const decimals = after.filter((r) => typeof r.NeedOz === 'string' || typeof r.NeedTsp === 'string' || typeof r.NeedCount === 'string');
      console.log(`      wire types: ${decimals.length} row(s) carry DECIMAL strings (e.g. ${JSON.stringify(Object.fromEntries(NEED.map((k) => [k, (decimals[0] || {})[k]])))})`);
      expect(withText.every((r) => !/\d\.\d{4,}/.test(formatNeed(r))), `${w.start}: no rendered need leaks DECIMAL padding`);
      for (const r of withText.slice(0, 6)) console.log(`      ${r.ItemName}: "${formatNeed(r)}"`);
    }
  }
}

async function phaseAgent() {
  const ings = await recipeItems(RECIPES);
  const by = new Map(ings.map((i) => [lc(i.name), i]));
  expect(ings.every((i) => NEED.every((k) => k in i)), `all ${ings.length} ingredients carry the five need fields`);
  expect(ings.every((i) => formatNeed(i) !== ''), 'every ingredient renders a need');
  const want = {
    garlic: '10 cloves', lime: '5', 'black pepper': '1.375 tsp', 'corn tortillas': '12',
    'teriyaki glaze': '1 fluid ounce', 'fritos or corn chips': 'as needed', 'chicken broth': '1 lb + 1.5 cups',
    'ground turkey': '2 lbs 8 oz', 'beef bouillon': '2 cubes', 'chili powder': '7.5 tbsp',
  };
  for (const [name, text] of Object.entries(want)) expect(formatNeed(by.get(name)) === text, `${name}: "${formatNeed(by.get(name))}" === "${text}"`);
  expect(String(by.get('lime')?.purchaseQuantity) === '5', `lime purchaseQuantity follows the folded need: "${by.get('lime')?.purchaseQuantity}" (was "3")`);
}

async function phaseFull() {
  // 1. pre-submit list, then submit exactly as the app does
  const pre = await recipeItems(RECIPES);
  const preBy = new Map(pre.map((i) => [lc(i.name), i]));
  await submit(pre, MULT);

  // 2. every ingredient stored, none dropped (no staples in this week), multiplier stored
  let stored = storedRows();
  expect(stored.size === pre.length, `every submitted ingredient stored: ${stored.size}/${pre.length} (no staple drops in an empty week)`);
  for (const [name, m] of Object.entries(MULT)) {
    expect(stored.get(name)?.RecipeMultiplier === String(m), `${name}: RecipeMultiplier ${m} stored (got ${stored.get(name)?.RecipeMultiplier})`);
  }
  expect([...stored.entries()].filter(([n]) => !(n in MULT)).every(([, r]) => r.RecipeMultiplier === '1'), 'every other row stored RecipeMultiplier 1');
  expect(stored.get('lime')?.Quantity === '5', `lime stored Quantity equals the folded need 5 (got ${stored.get('lime')?.Quantity})`);

  // 3. derived need == pre-submit need x multiplier, as NUMBERS and as RENDERED TEXT
  let list = await fetchList(WEEK);
  const listBy = new Map(list.filter((r) => preBy.has(lc(r.ItemName))).map((r) => [lc(r.ItemName), r]));
  expect(listBy.size === pre.length, `every ingredient comes back from fetch_grocery_items (${listBy.size}/${pre.length})`);
  let numberMismatch = 0;
  let textMismatch = 0;
  for (const [name, p] of preBy) {
    const r = listBy.get(name);
    if (!r) continue;
    const m = MULT[name] || 1;
    for (const f of ['NeedOz', 'NeedTsp', 'NeedCount']) {
      const want = p[f] === null || p[f] === undefined ? null : r3(p[f] * m);
      if (r3(r[f]) !== want) { numberMismatch++; console.log(`      ${name}.${f}: list ${r[f]} vs pre ${p[f]} x${m}`); }
    }
    if ((r.NeedCountUnit || null) !== (p.NeedCountUnit || null)) { numberMismatch++; console.log(`      ${name}.NeedCountUnit: ${r.NeedCountUnit} vs ${p.NeedCountUnit}`); }
    if (Number(r.NeedUnspecified) !== Number(p.NeedUnspecified)) { numberMismatch++; console.log(`      ${name}.NeedUnspecified: ${r.NeedUnspecified} vs ${p.NeedUnspecified}`); }
    if (formatNeed(r) !== formatNeed(p, m)) { textMismatch++; console.log(`      ${name}: list "${formatNeed(r)}" vs pre-submit "${formatNeed(p, m)}"`); }
  }
  expect(numberMismatch === 0, `derived need == pre-submit need x multiplier, field by field, for all ${listBy.size} ingredients`);
  expect(textMismatch === 0, `rendered text identical before and after submit for all ${listBy.size} ingredients`);
  const text = (n) => formatNeed(listBy.get(n));
  expect(text('corn tortillas') === '36', `count row x3 renders "36" (got "${text('corn tortillas')}")`);
  expect(text('black pepper') === '2.75 tsp', `sub-3-tsp row x2 renders "2.75 tsp" (got "${text('black pepper')}")`);
  expect(Number(listBy.get('black pepper')?.ItemID) === 348, `black pepper came through the GroceryItems half (CW/ATTR): ItemID ${listBy.get('black pepper')?.ItemID}`);
  expect(text('garlic') === '10 cloves', `garlic (not in GroceryItems -> ATTR2) folds its no-unit 4 into cloves: "${text('garlic')}"`);
  expect(text('lime') === '5', `lime renders "5" (got "${text('lime')}")`);
  expect(text('teriyaki glaze') === '1 fluid ounce', `unconvertible volume keeps its unit: "${text('teriyaki glaze')}"`);
  expect(text('ground turkey') === '5 lbs', `weight x2 renders "5 lbs" (got "${text('ground turkey')}")`);
  expect(text('fritos or corn chips') === 'as needed', `unspecified-only renders "as needed" (got "${text('fritos or corn chips')}")`);

  // 4. remove one garlic recipe: the need recalculates on the next read
  await call('remove_weekly_selection', { method: 'POST', body: { weekDateRange: WEEK.display, recipeId: REMOVE } });
  list = await fetchList(WEEK);
  const garlic = list.find((r) => lc(r.ItemName) === 'garlic');
  expect(formatNeed(garlic) === '6 cloves', `after removing recipe ${REMOVE}, garlic recalculates to "6 cloves" (got "${formatNeed(garlic)}")`);
  stored = storedRows();
  expect(!stored.has('whole wheat rigatoni'), 'a recipe-56-only row was cleaned up by Cleanup Orphan Meal Ingredients');

  // 5. resubmit at x1: the upsert updates the multiplier
  const pre2 = await recipeItems(RECIPES.filter((id) => id !== REMOVE));
  await submit(pre2, {});
  stored = storedRows();
  expect(stored.get('corn tortillas')?.RecipeMultiplier === '1', `resubmit x1: corn tortillas RecipeMultiplier 3 -> 1 (got ${stored.get('corn tortillas')?.RecipeMultiplier})`);
  expect(stored.get('corn tortillas')?.Quantity === '12', `resubmit x1: corn tortillas Quantity 36 -> 12 (got ${stored.get('corn tortillas')?.Quantity})`);
  list = await fetchList(WEEK);
  expect(formatNeed(list.find((r) => lc(r.ItemName) === 'corn tortillas')) === '12', 'resubmit x1: corn tortillas renders "12"');
}

// ---- main --------------------------------------------------------------------
const [phase, file] = process.argv.slice(2);
const WRITES = { multiplier: phaseMultiplier, agent: phaseAgent, full: phaseFull };
try {
  if (phase === 'dry') {
    const ctx = begin();
    finish(ctx);
  } else if (phase in WRITES) {
    const ctx = begin();
    try { await WRITES[phase](); } finally { finish(ctx); }
  } else if (phase === 'snapshot' && file) {
    await phaseSnapshot(file);
  } else if (phase === 'derivation' && file) {
    await phaseDerivation(file);
  } else {
    console.log('usage: verify-live.mjs dry | multiplier | snapshot <file> | derivation <file> | agent | full');
    process.exit(2);
  }
} catch (e) {
  failures.push(e.message);
  console.error(`ERROR  ${e.message}`);
}
console.log(failures.length ? `\n${failures.length} FAILURE(S)` : `\nALL CHECKS PASS (${phase})`);
process.exit(failures.length ? 1 : 0);
