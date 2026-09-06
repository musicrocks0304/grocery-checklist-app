// Wave 3, Ruling 5 — the AI pattern without a skipAgent short-circuit
// (every request to this endpoint needs the model).
//
// `error-branch` refuses LangChain nodes and this n8n answers an unhandled
// LangChain error with an empty HTTP 200, so the agent keeps going on error
// and `Format Output` rethrows what it carries — both a real error and an
// item that carried no output at all. Its own error branch (added afterwards
// by `error-branch`) turns the throw into a Respond 500.
//
// The existing `{userCategory: null, …, reason: 'parse error'}` 200 for an
// unparsable-but-present model answer is by design and is left alone.
import { addNoOutputThrow } from './_ai-agent-guard.mjs';

const THROW_MARKER = 'AI agent failed:';
const AGENT_GUARD = [
  "const agentItem = $('AI Agent').first().json;",
  'if (agentItem && agentItem.error) {',
  "  const m = typeof agentItem.error === 'string' ? agentItem.error : (agentItem.error.message || 'unknown');",
  "  throw new Error('" + THROW_MARKER + " ' + m);",
  '}',
  '',
  '',
].join('\n');

export default function (wf) {
  const agent = wf.nodes.find((n) => n.name === 'AI Agent');
  const format = wf.nodes.find((n) => n.name === 'Format Output');
  if (!agent) throw new Error('node "AI Agent" not found');
  if (!format) throw new Error('node "Format Output" not found');
  if (format.type !== 'n8n-nodes-base.code') throw new Error(`node "Format Output" is ${format.type}, expected n8n-nodes-base.code`);

  agent.onError = 'continueRegularOutput';
  if (!format.parameters.jsCode.includes(THROW_MARKER)) {
    format.parameters.jsCode = AGENT_GUARD + format.parameters.jsCode;
  }
  format.parameters.jsCode = addNoOutputThrow(format.parameters.jsCode);
  return wf;
}
