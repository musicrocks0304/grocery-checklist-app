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
  return wf;
}
