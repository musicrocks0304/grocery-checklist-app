// Wave 3, Ruling 3 — remove both swallowers without a double response, and
// apply the AI pattern to the LLM chain.
//
// 1) An LLM failure must become a 500, not a silently-cached empty result:
//    drop `continueOnFail` on the chain. `error-branch` refuses LangChain
//    nodes and this n8n answers an unhandled LangChain error with an empty
//    HTTP 200, so instead the chain keeps going on error and `Format and
//    Cache` rethrows what it carries — a real error, or an item that carried
//    nothing at all. `Format and Cache`'s own error branch (added afterwards
//    by `error-branch`) turns the throw into a Respond 500.
//    The pre-existing `llmErrored` stale-cache fallback stays: it covers a
//    chain that SUCCEEDED with empty text, which is not a failure.
// 2) `Save to Cache` ran in parallel with the Respond node; move it AFTER the
//    response so a cache failure can neither swallow the answer nor cause a
//    second response. Its query already no-ops (`SELECT 1`) when `cacheJson`
//    is absent, which is what the two non-LLM paths hand it.
import { addNoOutputThrow } from './_ai-agent-guard.mjs';

const THROW_MARKER = 'AI agent failed:';
const AGENT_GUARD = [
  "const agentItem = $('Basic LLM Chain').first().json;",
  'if (agentItem && agentItem.error) {',
  "  const m = typeof agentItem.error === 'string' ? agentItem.error : (agentItem.error.message || 'unknown');",
  "  throw new Error('" + THROW_MARKER + " ' + m);",
  '}',
  '',
  '',
].join('\n');

export default function (wf) {
  const llm = wf.nodes.find((n) => n.name === 'Basic LLM Chain');
  const cache = wf.nodes.find((n) => n.name === 'Save to Cache');
  const format = wf.nodes.find((n) => n.name === 'Format and Cache');
  const respond = wf.nodes.find((n) => n.name === 'Respond to Webhook');
  for (const [name, n] of [['Basic LLM Chain', llm], ['Save to Cache', cache], ['Format and Cache', format], ['Respond to Webhook', respond]]) {
    if (!n) throw new Error(`node "${name}" not found`);
  }
  if (format.type !== 'n8n-nodes-base.code') throw new Error(`node "Format and Cache" is ${format.type}, expected n8n-nodes-base.code`);
  if (respond.type !== 'n8n-nodes-base.respondToWebhook') throw new Error(`node "Respond to Webhook" is ${respond.type}`);

  delete llm.continueOnFail; delete llm.onError;
  delete cache.continueOnFail; delete cache.onError;

  // (2) the cache write runs after the response, not beside it.
  wf.connections['Format and Cache'] = { main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]] };
  wf.connections['Respond to Webhook'] = { main: [[{ node: 'Save to Cache', type: 'main', index: 0 }]] };

  // (1) the AI pattern.
  llm.onError = 'continueRegularOutput';
  if (!format.parameters.jsCode.includes(THROW_MARKER)) {
    format.parameters.jsCode = AGENT_GUARD + format.parameters.jsCode;
  }
  format.parameters.jsCode = addNoOutputThrow(format.parameters.jsCode);
  return wf;
}
