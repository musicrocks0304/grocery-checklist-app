// Client error telemetry (hardening sub-project E). Framework-free: installed
// once from src/index.js, called by ErrorBoundary (kind 'boundary') and apiJson
// (kind 'api'). Posts with raw fetch — never apiFetch/apiJson, so it can never
// re-enter the API layer — and never throws: every exported function is wrapped.
import { randomUUID } from '../utils/uuid';
import { resolveScreenFromHash } from '../utils/screenRoute';
import { getWeekDates } from '../utils/weekDates';

export const LIMITS = { message: 500, stack: 2048, perSession: 20, perMinute: 5, frames: 5 };
const KINDS = ['onerror', 'unhandledrejection', 'boundary', 'api'];
const SEEN_KEY = 'ce_seen';
const COUNT_KEY = 'ce_count';
const SESSION_KEY = 'ce_session';
const NOISE = /ResizeObserver loop/;

let config = null;
let memory = freshMemory();
let onError = null;
let onRejection = null;

function freshMemory() { return { seen: new Set(), count: 0, session: null, sent: [] }; }
function storage() { try { return window.sessionStorage; } catch { return null; } }
function readJson(key, fallback) {
  try { const s = storage(); const v = s && s.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJson(key, value) { try { const s = storage(); if (s) s.setItem(key, JSON.stringify(value)); } catch { /* memory only */ } }

/** FNV-1a 32-bit as 8 lower-case hex chars. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** Remove `?query` from every URL-shaped token; plain question marks stay. */
export function stripQueries(text) {
  return String(text == null ? '' : text).replace(/(https?:\/\/[^\s?#'")]+)\?[^\s'")]*/g, '$1');
}

/** The <hash> of the loaded main.<hash>.js bundle, or 'dev'. */
export function bundleVersion(doc) {
  try {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    const scripts = d && d.scripts ? Array.from(d.scripts) : [];
    for (const s of scripts) { const m = /main\.([0-9a-f]+)\.js/.exec(s.src || ''); if (m) return m[1]; }
  } catch { /* fall through */ }
  return 'dev';
}

/** Hash over kind, endpoint, status, message and the top frames (bundle hash normalised, line:col kept). */
export function stackHash(kind, message, stack, endpoint = '', status = '') {
  const frames = String(stack || '').split('\n')
    .filter((l) => /^\s*at\s|@/.test(l))
    .slice(0, LIMITS.frames)
    .map((l) => l.replace(/main\.[0-9a-f]+\.js/g, 'main.js').trim());
  return fnv1a([kind, endpoint || '', status === undefined || status === null ? '' : String(status), message, ...frames].join('\n'));
}

function sessionId() {
  if (memory.session) return memory.session;
  let id = null;
  try { const s = storage(); id = s ? s.getItem(SESSION_KEY) : null; } catch { id = null; }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = randomUUID();
    try { const s = storage(); if (s) s.setItem(SESSION_KEY, id); } catch { /* memory only */ }
  }
  memory.session = id;
  return id;
}

function currentScreen() {
  try {
    const r = resolveScreenFromHash(window.location.hash);
    return r.join ? 'join' : r.screen;
  } catch { return 'unknown'; }
}

function send(payload) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['X-API-Key'] = config.apiKey;
    const p = fetch(config.url, { method: 'POST', keepalive: true, headers, body: JSON.stringify(payload) });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* never throw */ }
}

/**
 * Report one error. Returns true when a POST was issued, false when skipped
 * (not installed, empty, noise, offline network error, deduped, capped).
 */
export function reportError(input) {
  try {
    if (!config) return false;
    const { kind: rawKind, error, endpoint, status } = input || {};
    const kind = KINDS.includes(rawKind) ? rawKind : 'onerror';
    let raw;
    if (input && input.message != null) raw = String(input.message);
    else if (error && error.message != null) raw = String(error.message);
    else raw = error == null ? '' : String(error);
    const message = stripQueries(raw).slice(0, LIMITS.message).trim();
    if (!message) return false;
    if (NOISE.test(message)) return false;
    if (kind === 'api' && error && error.code === 'network' && typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const stack = kind === 'api' ? '' : stripQueries(error && error.stack ? error.stack : '').slice(0, LIMITS.stack);
    const hash = stackHash(kind, message, stack, kind === 'api' ? endpoint : '', kind === 'api' ? status : '');
    if (memory.seen.has(hash)) return false;
    if (memory.count >= LIMITS.perSession) return false;
    const now = Date.now();
    memory.sent = memory.sent.filter((t) => now - t < 60000);
    if (memory.sent.length >= LIMITS.perMinute) return false;
    memory.seen.add(hash);
    memory.count += 1;
    memory.sent.push(now);
    writeJson(SEEN_KEY, Array.from(memory.seen));
    writeJson(COUNT_KEY, memory.count);
    const payload = {
      kind,
      screen: currentScreen(),
      message,
      stack,
      stack_hash: hash,
      session_id: sessionId(),
      app_version: bundleVersion(),
      user_agent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 255) : '',
      week_date_range: (() => { try { return String(getWeekDates().displayRange || '').slice(0, 80); } catch { return ''; } })(),
      client_time: new Date().toISOString(),
    };
    if (kind === 'api') {
      payload.endpoint = String(endpoint || '').slice(0, 80);
      payload.status = Number.isFinite(Number(status)) ? Number(status) : 0;
    }
    send(payload);
    return true;
  } catch { return false; }
}

/** Install once. Returns false when already installed or no url was given. */
export function installErrorReporter(options) {
  try {
    const { url, apiKey } = options || {};
    if (config || !url) return false;
    config = { url: String(url), apiKey: apiKey ? String(apiKey) : '' };
    const seen = readJson(SEEN_KEY, []);
    memory = freshMemory();
    memory.seen = new Set(Array.isArray(seen) ? seen.filter((h) => typeof h === 'string') : []);
    memory.count = Number(readJson(COUNT_KEY, 0)) || 0;
    onError = (event) => {
      try {
        const err = event && event.error;
        const msg = event && event.message;
        if (!err && !msg) return; // resource-load failures, cross-origin "Script error." with nothing to report
        reportError({ kind: 'onerror', error: err || undefined, message: err && err.message ? undefined : msg });
      } catch { /* never throw */ }
    };
    onRejection = (event) => {
      try {
        const reason = event && event.reason;
        if (reason && reason.name === 'AbortError') return;
        if (reason instanceof Error) reportError({ kind: 'unhandledrejection', error: reason });
        else reportError({ kind: 'unhandledrejection', message: String(reason) });
      } catch { /* never throw */ }
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return true;
  } catch { config = null; return false; }
}

/** Tests only. */
export function uninstallErrorReporter() {
  try {
    if (onError) window.removeEventListener('error', onError);
    if (onRejection) window.removeEventListener('unhandledrejection', onRejection);
  } catch { /* ignore */ }
  config = null; onError = null; onRejection = null; memory = freshMemory();
}
