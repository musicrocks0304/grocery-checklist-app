// Ruling 5, applied to the two chat workflows (meal_creator_propose,
// call_grocery_agent). `error-branch` refuses LangChain nodes, and an
// unhandled AI Agent error is answered by this n8n as an empty HTTP 200. So
// (a) the AI Agent keeps going on error, which carries the failure into the
// next Code node as an `error` field on the item, and (b) that Code node
// rethrows it — its own error branch (added afterwards by `error-branch`)
// turns the throw into a Respond 500. Unlike match_coupons these two have no
// skipAgent short-circuit, so no IF node is needed.
const THROW_MARKER = 'AI agent failed:';
const GUARD = [
  "const agentItem = $input.first().json;",
  "if (agentItem && agentItem.error) {",
  "  const m = typeof agentItem.error === 'string' ? agentItem.error : (agentItem.error.message || 'unknown');",
  "  throw new Error('" + THROW_MARKER + " ' + m);",
  "}",
  "",
  "",
].join('\n');

// Task 12b review: `onError: continueRegularOutput` also carries through an
// agent that produced NOTHING useful — no `error` and no `output` — which the
// parser below turns into an empty/garbage 200. Throw on that too, so the
// existing error branch answers 500.
// Fix round 2: only a genuinely EMPTY item is "no output". These parsers
// legitimately accept shapes other than `output` — meal_creator_propose reads
// `llmOutput.output || llmOutput.text || llmOutput`, i.e. a bare parsed object
// is valid — so keying on the absence of `output` produced false 500s.
export const NO_OUTPUT_MARKER = 'AI agent returned no output';
const ANCHOR = "  throw new Error('" + THROW_MARKER + " ' + m);\n}";
const NO_OUTPUT_GUARD = [
  '',
  "if (!agentItem || (!('error' in agentItem) && Object.keys(agentItem).length === 0)) {",
  "  throw new Error('" + NO_OUTPUT_MARKER + "');",
  '}',
].join('\n');
// matches any previously-installed version of the block, so a re-apply
// rewrites it in place instead of stacking a second copy
const INSTALLED = /\nif \(!agentItem[^\n]*\) \{\n  throw new Error\('AI agent returned no output'\);\n\}/;

export function addNoOutputThrow(code) {
  if (INSTALLED.test(code)) return code.replace(INSTALLED, NO_OUTPUT_GUARD);
  if (code.includes(NO_OUTPUT_MARKER)) return code;
  if (!code.includes(ANCHOR)) throw new Error(`could not find the existing "${THROW_MARKER}" block to anchor to`);
  return code.replace(ANCHOR, ANCHOR + NO_OUTPUT_GUARD);
}

export default function aiAgentGuard(wf) {
  const agent = wf.nodes.find((n) => n.name === 'AI Agent');
  const summary = wf.nodes.find((n) => n.name === 'Build Summary');
  if (!agent) throw new Error('node "AI Agent" not found');
  if (!summary) throw new Error('node "Build Summary" not found');
  if (summary.type !== 'n8n-nodes-base.code') throw new Error(`node "Build Summary" is ${summary.type}, expected n8n-nodes-base.code`);

  agent.onError = 'continueRegularOutput';
  if (!summary.parameters.jsCode.includes(THROW_MARKER)) {
    summary.parameters.jsCode = GUARD + summary.parameters.jsCode;
  }
  summary.parameters.jsCode = addNoOutputThrow(summary.parameters.jsCode);
  return wf;
}
