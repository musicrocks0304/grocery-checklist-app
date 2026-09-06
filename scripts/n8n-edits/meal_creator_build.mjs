// Ruling 5, chainLlm variant: a LangChain node error is an empty 200 and
// `error-branch` refuses LangChain nodes. So the chain keeps going on error
// (continueRegularOutput) and the Code node that consumes its output rethrows
// the carried error, which its own error branch turns into a Respond 500.
// There is no skipAgent short-circuit here, so the guard sits at the top and
// reads the chain's output item directly.
const THROW_MARKER = 'AI agent failed:';
const CHAIN_GUARD = [
  "const chainItem = $input.first().json;",
  "if (chainItem && chainItem.error) {",
  "  const m = typeof chainItem.error === 'string' ? chainItem.error : (chainItem.error.message || 'unknown');",
  "  throw new Error('" + THROW_MARKER + " ' + m);",
  "}",
  "",
  "",
].join('\n');

export default function (wf) {
  const chain = wf.nodes.find((n) => n.name === 'Basic LLM Chain');
  const parse = wf.nodes.find((n) => n.name === 'Parse AI Response');
  if (!chain) throw new Error('node "Basic LLM Chain" not found');
  if (!parse) throw new Error('node "Parse AI Response" not found');

  chain.onError = 'continueRegularOutput';
  if (!parse.parameters.jsCode.includes(THROW_MARKER)) {
    parse.parameters.jsCode = CHAIN_GUARD + parse.parameters.jsCode;
  }
  return wf;
}
