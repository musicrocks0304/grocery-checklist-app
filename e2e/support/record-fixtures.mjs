#!/usr/bin/env node
// Records read endpoints from the live backend, sanitises them, rewrites the
// live week to the fixed fixture week, and writes e2e/fixtures/**. Sends only
// GETs and the documented safe bodies. Usage: npm run test:e2e:record
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { WEEK } = require('./week.js');

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const KEY = env.REACT_APP_API_KEY; if (!KEY) { console.error('REACT_APP_API_KEY missing from .env'); process.exit(1); }
const N8N = env.REACT_APP_API_BASE_URL || 'https://n8n-grocery.needexcelexpert.com/webhook';
const CLIP = env.REACT_APP_CLIP_SERVER_URL || 'https://clip.needexcelexpert.com';

// Live week, computed the way src/utils/weekDates.js does (Thursday+ rolls forward).
function liveWeek() {
  const today = new Date(); const day = today.getDay();
  const sunday = new Date(today); sunday.setDate(today.getDate() - day + (day >= 4 ? 7 : 0));
  const saturday = new Date(sunday); saturday.setDate(sunday.getDate() + 6);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ord = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const long = (d) => `${d.toLocaleString('en-US', { month: 'long' })} ${ord(d.getDate())}`;
  return { startDate: iso(sunday), endDate: iso(saturday), displayRange: `For the week of ${long(sunday)} to ${long(saturday)}, ${sunday.getFullYear()}` };
}
const LIVE = liveWeek();

async function get(base, path, query = {}, key = true) {
  const url = new URL(`${base}/${path}`); for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: 'application/json', Origin: 'https://grocery-checklist-app.netlify.app', ...(key ? { 'X-API-Key': KEY } : {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return text.trim() ? JSON.parse(text) : [];
}

const DROP = new Set(['screenshots', 'metadata', 'user_agent', 'host_user_id']);
const isOneOff = (r) => r && typeof r === 'object' && r.DataSource === 'OneOff';
// Plain 40-cap, except every OneOff row is kept regardless of position (the
// live fetch_grocery_items catalog sorts them past the cap). For arrays with
// no OneOff-tagged rows this is identical to a plain arr.slice(0, 40).
function capArray(arr) {
  const keep = arr.filter(isOneOff);
  const rest = arr.filter((r) => !isOneOff(r)).slice(0, Math.max(0, 40 - keep.length));
  return [...rest, ...keep];
}
// key is the property name this value was read from (undefined at the top
// level, or the parent array's key for array items) — the week-string
// rewrite only fires on fields whose name mentions "week", so an unrelated
// string that happens to equal a week boundary (e.g. a coupon
// expiration_date) is left untouched.
function sanitise(value, key) {
  if (Array.isArray(value)) return capArray(value).map((v) => sanitise(v, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !DROP.has(k)).map(([k, v]) => [k, sanitise(v, k)]));
  if (typeof value === 'string' && key && /week/i.test(key)) return value.split(LIVE.displayRange).join(WEEK.displayRange).split(LIVE.startDate).join(WEEK.startDate).split(LIVE.endDate).join(WEEK.endDate);
  return value;
}

function write(rel, data, endpoint) {
  const out = Array.isArray(data) ? data : { _recorded: { at: new Date().toISOString(), endpoint, sanitised: true }, ...data };
  mkdirSync(`e2e/fixtures/${rel.split('/')[0]}`, { recursive: true });
  writeFileSync(`e2e/fixtures/${rel}`, JSON.stringify(out, null, 1) + '\n');
  console.log('wrote', rel, Array.isArray(out) ? `${out.length} items` : 'object');
}

const READS = [
  ['categories', {}],
  ['fetch_grocery_items', { weekStartDate: LIVE.startDate, weekEndDate: LIVE.endDate, weekDateRange: LIVE.displayRange }],
  ['fetch_weekly_meals', { weekDateRange: LIVE.displayRange }],
  ['fetch_weekly_meal_ingredients', { weekDateRange: LIVE.displayRange }],
  ['shopping_progress', { week_date_range: LIVE.displayRange, week_start_date: LIVE.startDate }],
  ['fetch_heb_coupons', {}],
  ['choose_recipe_instructions', { weekDateRange: LIVE.displayRange }],
  ['chat_history', { sessionId: '__e2e_record__' }],
  ['grocery_prep_status', { jobId: '__e2e_record__' }],
];

(async () => {
  for (const [p, q] of READS) {
    let sanitised = sanitise(await get(N8N, p, q));
    // The live Respond node answers {"error":"not_found"} for an unknown
    // jobId; an empty capture means the sanitiser saw nothing to keep (no
    // fields survived, or the endpoint returned {}), so restore that body.
    if (p === 'grocery_prep_status' && sanitised && typeof sanitised === 'object' && !Array.isArray(sanitised) && Object.keys(sanitised).length === 0) {
      sanitised = { error: 'not_found' };
    }
    write(`n8n/${p}.json`, sanitised, p);
  }
  write('n8n/fetch_feedback.json', [], 'fetch_feedback');
  const meals = JSON.parse(readFileSync('e2e/fixtures/n8n/fetch_weekly_meals.json', 'utf8'));
  if (Array.isArray(meals) && meals.length) write('n8n/grab_instructions_fast.json', sanitise(await get(N8N, 'grab_instructions_fast', { weekDateRange: LIVE.displayRange, recipe_id: String(meals[0].recipe_id) })), 'grab_instructions_fast');
  write('clip/weekly-items.json', sanitise(await get(CLIP, 'api/heb/weekly-items', { weekDateRange: LIVE.displayRange }, false)), 'api/heb/weekly-items');
  const items = JSON.parse(readFileSync('e2e/fixtures/n8n/fetch_grocery_items.json', 'utf8'));
  if (!JSON.stringify(items).includes(WEEK.displayRange) && !JSON.stringify(items).includes(WEEK.startDate)) console.warn('warning: fetch_grocery_items carries no week string (fine if the endpoint omits it)');
  console.log('done — smart_deals.json and clip/health*/session-status* are hand-maintained');
})().catch((e) => { console.error(e.message); process.exit(1); });
