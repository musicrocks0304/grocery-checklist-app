// Ruling 5: a LangChain node error is also an empty 200, and `error-branch`
// refuses LangChain nodes. So (a) an IF node short-circuits the agent when
// Build System Prompt already decided to skip it, (b) the AI Agent keeps
// going on error so the failure reaches a Code node, and (c) Format Output
// turns that carried-over error into a throw — which its own error branch
// (added afterwards by `error-branch`) turns into a Respond 500.
import { addNoOutputThrow } from './_ai-agent-guard.mjs';

const THROW_MARKER = 'AI agent failed:';
const AGENT_GUARD = [
  "",
  "const agentItem = $('AI Agent').first().json;",
  "if (agentItem && agentItem.error) {",
  "  const m = typeof agentItem.error === 'string' ? agentItem.error : (agentItem.error.message || 'unknown');",
  "  throw new Error('" + THROW_MARKER + " ' + m);",
  "}",
  "",
].join('\n');

export default function (wf) {
  const build = wf.nodes.find((n) => n.name === 'Build System Prompt');
  const agent = wf.nodes.find((n) => n.name === 'AI Agent');
  const format = wf.nodes.find((n) => n.name === 'Format Output');
  for (const [name, n] of [['Build System Prompt', build], ['AI Agent', agent], ['Format Output', format]]) {
    if (!n) throw new Error(`node "${name}" not found`);
  }

  // (a) IF node between Build System Prompt and AI Agent.
  if (!wf.nodes.some((n) => n.name === 'Skip agent?')) {
    wf.nodes.push({
      id: 'skip-agent',
      name: 'Skip agent?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [build.position[0] + 220, build.position[1]],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
          conditions: [{ id: 'cond-skip', leftValue: '={{ $json.skipAgent }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
          combinator: 'and',
        },
        options: {},
      },
    });
  }
  const buildConns = (wf.connections['Build System Prompt'] ||= { main: [] });
  buildConns.main[0] = [{ node: 'Skip agent?', type: 'main', index: 0 }];
  wf.connections['Skip agent?'] = {
    main: [
      [{ node: 'Format Output', type: 'main', index: 0 }],
      [{ node: 'AI Agent', type: 'main', index: 0 }],
    ],
  };

  // (b) the agent must not swallow the response by erroring silently.
  agent.onError = 'continueRegularOutput';

  // (c) Format Output rethrows an agent error instead of returning [].
  if (!format.parameters.jsCode.includes(THROW_MARKER)) {
    const before = format.parameters.jsCode;
    format.parameters.jsCode = before.replace(/(if \(skipAgent\) \{[\s\S]*?\n\})/, `$1\n${AGENT_GUARD}`);
    if (!format.parameters.jsCode.includes(THROW_MARKER)) throw new Error('could not find the skipAgent block in Format Output');
  }

  // (d) task 12b review: an agent item with neither `error` nor `output` is
  // just as broken as an error, and used to fall through to an empty parse.
  format.parameters.jsCode = addNoOutputThrow(format.parameters.jsCode);
  return wf;
}
