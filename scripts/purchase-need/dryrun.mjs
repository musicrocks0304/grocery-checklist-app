// Dry-run every purchase-need edit script against a SAVED workflow JSON.
// Nothing here talks to n8n.
// Usage: node scripts/purchase-need/dryrun.mjs <dir holding the exported <workflowId>.json files>
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const wfDir = process.argv[2];
if (!wfDir) throw new Error('usage: node dryrun.mjs <dir holding <workflowId>.json>');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const CASES = [
  ['purchase_need_multiplier.mjs', 'CkLhcFEM9Tfc5uxO'],
  ['purchase_need_derivation.mjs', 'JoaR6klT950hwSLB'],
  ['purchase_need_agent.mjs', 'UqXlXX5uPWlGvhU6'],
];

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

for (const [script, id] of CASES) {
  const edit = (await import(pathToFileURL(join(here, '..', 'n8n-edits', script)).href)).default;
  const pristine = readFileSync(join(wfDir, `${id}.json`), 'utf8');

  const once = edit(JSON.parse(pristine));
  const onceText = JSON.stringify(once);
  ok(onceText !== JSON.stringify(JSON.parse(pristine)), `${script}: changes the workflow`);

  const twice = edit(JSON.parse(onceText));
  ok(JSON.stringify(twice) === onceText, `${script}: idempotent (second apply is a no-op)`);

  for (const n of once.nodes) {
    if (n.type === 'n8n-nodes-base.code') {
      let compiled = true;
      try { new AsyncFunction('$input', '$', n.parameters.jsCode); } catch (e) { compiled = false; console.log(e.message); }
      ok(compiled, `${script}: Code node "${n.name}" compiles`);
    }
    const qry = n.parameters && n.parameters.query;
    if (typeof qry === 'string') ok(!qry.includes(String.fromCharCode(96)), `${script}: "${n.name}" query has no backtick`);
  }

  // Half-patch: take the patched workflow and revert ONE node to pristine.
  const pristineWf = JSON.parse(pristine);
  const changed = once.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(pristineWf.nodes.find((p) => p.name === n.name)));
  if (changed.length > 1) {
    const half = JSON.parse(onceText);
    const idx = half.nodes.findIndex((n) => n.name === changed[0].name);
    half.nodes[idx] = pristineWf.nodes.find((p) => p.name === changed[0].name);
    let threw = false;
    try { edit(half); } catch (e) { threw = /half-patched/.test(e.message); }
    ok(threw, `${script}: refuses a half-patched workflow (reverted "${changed[0].name}")`);
  }

  writeFileSync(join(wfDir, `${id}.patched.json`), JSON.stringify(once, null, 1));
  console.log(`      wrote ${id}.patched.json (${changed.length} node(s) changed: ${changed.map((n) => n.name).join(', ')})`);
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL DRY-RUN CHECKS PASS');
process.exit(failures ? 1 : 0);
