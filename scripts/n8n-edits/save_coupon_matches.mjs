// Fix the Switch routing.
//
// Bug: the Switch's two rules were stored in a non-canonical filter shape —
// each `conditions` had no `options` (so no `version`/`typeValidation`) and no
// `combinator`. SwitchV3 reads a rule with
// `getNodeParameter('rules.values[i].conditions', …)` and treats the result as
// a boolean; an unrecognised filter object comes back as the object itself,
// which is truthy, so RULE 0 MATCHED EVERY ITEM. Every request — save, accept
// and the `{action:'error'}` item from Route Request — was routed to output 0
// (Save Matches). For the error item that meant a MySQL failure inside Save
// Matches instead of the 400 from Respond Error, which this n8n answers as an
// empty HTTP 200. (Every other filter node in the system stores
// `options.version: 2` + `combinator`; this Switch was the only one that did
// not.)
//
// Fix: rewrite the rules in the canonical filter shape and add an explicit
// third rule for `action === 'error'` on output 2, which is already wired to
// Respond Error. `options.fallbackOutput` is pointed at that same output (2)
// so an unrecognised action also gets the 400 rather than falling into a
// mutating node; it can no longer be `'extra'`, which would have created a
// fourth, unconnected output.
const RULE = (id, action, key) => ({
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [
      { id, leftValue: '={{ $json.action }}', rightValue: action, operator: { type: 'string', operation: 'equals' } },
    ],
    combinator: 'and',
  },
  renameOutput: true,
  outputKey: key,
});

export default function (wf) {
  const sw = wf.nodes.find((n) => n.name === 'Switch');
  if (!sw) throw new Error('node "Switch" not found');
  if (sw.type !== 'n8n-nodes-base.switch') throw new Error(`node "Switch" is ${sw.type}, expected n8n-nodes-base.switch`);

  // Outputs are positional, so the rule order must keep matching the wiring.
  const existing = (sw.parameters?.rules?.values || []).map((v) => v.outputKey);
  if (existing[0] !== 'save' || existing[1] !== 'accept' || existing.length > 3) {
    throw new Error(`unexpected Switch rule order: ${JSON.stringify(existing)}`);
  }
  const wired = (i) => ((wf.connections.Switch?.main || [])[i] || []).map((c) => c.node).join('+');
  const expected = ['Save Matches', 'Accept Coupon', 'Respond Error'];
  for (const [i, name] of expected.entries()) {
    if (wired(i) !== name) throw new Error(`Switch output ${i} is wired to "${wired(i)}", expected "${name}"`);
  }

  sw.parameters.rules = { values: [RULE('route-save', 'save', 'save'), RULE('route-accept', 'accept', 'accept'), RULE('route-error', 'error', 'error')] };
  sw.parameters.options = { ...(sw.parameters.options || {}), fallbackOutput: 2 };
  return wf;
}
