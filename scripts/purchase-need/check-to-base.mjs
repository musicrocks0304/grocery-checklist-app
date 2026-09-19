#!/usr/bin/env node
// The spec's parity check: units.to_base must agree with the TO_TSP / TO_OZ
// constants in the LIVE `Aggregate Ingredients` node (Ingredient Agent,
// UqXlXX5uPWlGvhU6) for EVERY unit — the pre-submit screen renders from the JS
// conversion and every later screen from this column, so any disagreement makes
// one ingredient read differently on adjacent screens.
// READ-ONLY. Usage: node scripts/purchase-need/check-to-base.mjs [workflow.json]
//   (with a file argument it reads the node code from a saved workflow instead of n8n)
import { readFileSync } from 'node:fs';
import { sql } from './mysql.mjs';

async function aggregateCode() {
  const file = process.argv[2];
  let wf;
  if (file) {
    wf = JSON.parse(readFileSync(file, 'utf8'));
  } else {
    const env = readFileSync('C:\\hsa-automation\\.env', 'utf8');
    const key = (env.match(/^N8N_API_KEY=(.*)$/m) || [])[1]?.trim();
    const res = await fetch('http://localhost:5679/api/v1/workflows/UqXlXX5uPWlGvhU6', {
      headers: { 'X-N8N-API-KEY': key, Origin: 'http://localhost:5679' },
    });
    if (!res.ok) throw new Error(`n8n GET workflow -> HTTP ${res.status}`);
    wf = await res.json();
  }
  const node = wf.nodes.find((n) => n.name === 'Aggregate Ingredients');
  if (!node) throw new Error('Aggregate Ingredients node not found');
  return node.parameters.jsCode;
}

const code = await aggregateCode();
// Parse `const TO_TSP = { 'teaspoon': 1, ... };` as data — no eval.
const grab = (name) => {
  const m = code.match(new RegExp(`const ${name} = \\{([^}]*)\\};`));
  if (!m) throw new Error(`${name} not found in Aggregate Ingredients`);
  const out = {};
  for (const [, key, value] of m[1].matchAll(/'([^']+)'\s*:\s*([\d.]+)/g)) out[key] = Number(value);
  if (!Object.keys(out).length) throw new Error(`${name} parsed to nothing`);
  return out;
};
const TO_TSP = grab('TO_TSP');
const TO_OZ = grab('TO_OZ');
console.log(`JS constants: TO_TSP ${JSON.stringify(TO_TSP)}  TO_OZ ${JSON.stringify(TO_OZ)}`);
if (process.argv.includes('--constants-only')) process.exit(0);

const units = sql('SELECT unit_id, unit_name, unit_type, to_base FROM units ORDER BY unit_id');
let bad = 0;
for (const u of units) {
  const inTsp = Object.prototype.hasOwnProperty.call(TO_TSP, u.unit_name);
  const inOz = Object.prototype.hasOwnProperty.call(TO_OZ, u.unit_name);
  const expected = inTsp ? TO_TSP[u.unit_name] : inOz ? TO_OZ[u.unit_name] : null;
  const expectedType = inTsp ? 'volume' : inOz ? 'weight' : u.unit_type;
  const actual = u.to_base === null ? null : Number(u.to_base);
  const ok = actual === expected && u.unit_type === expectedType;
  if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'BAD'}  ${String(u.unit_id).padStart(2)} ${u.unit_name.padEnd(12)} ${String(u.unit_type).padEnd(7)} to_base=${u.to_base}  expected=${expected}`);
}
for (const k of [...Object.keys(TO_TSP), ...Object.keys(TO_OZ)]) {
  if (!units.some((u) => u.unit_name === k)) { bad++; console.log(`BAD  "${k}" is converted by the JS but is not a unit`); }
}
console.log(bad ? `\n${bad} MISMATCH(ES)` : `\nPARITY OK: ${units.length} units agree with TO_TSP / TO_OZ`);
process.exit(bad ? 1 : 0);
