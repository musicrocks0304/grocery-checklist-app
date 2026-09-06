// Jest helper: mock global.fetch by URL substring. Responses provide ok/status/
// text()/json() so apiJson (which reads text()) and raw fetch callers both work.
const originalFetch = global.fetch;
let state = null;

function toResponse(entry, req) {
  const resolved = typeof entry === 'function' ? entry(req) : entry;
  const { status = 200, body = '' } = resolved && typeof resolved === 'object' && 'status' in resolved && 'body' in resolved ? resolved : { status: 200, body: resolved };
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: new Map(), text: () => Promise.resolve(text), json: () => Promise.resolve(JSON.parse(text)) };
}

export function installMockFetch(map) {
  state = { calls: [], unmocked: [] };
  global.fetch = jest.fn((url, init = {}) => {
    const u = String(url);
    let body = null;
    if (init.body && typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    const req = { url: u, method: init.method || 'GET', body };
    state.calls.push(req);
    const key = Object.keys(map).find((k) => u.includes(k));
    if (key === undefined) { state.unmocked.push(req); return Promise.resolve(toResponse({ status: 404, body: { error: 'unmocked' } }, req)); }
    return Promise.resolve(toResponse(map[key], req));
  });
  return {
    calls: () => state.calls,
    for: (substr) => state.calls.filter((c) => c.url.includes(substr)),
    unmocked: () => state.unmocked,
  };
}

export function restoreFetch() { global.fetch = originalFetch; state = null; }
