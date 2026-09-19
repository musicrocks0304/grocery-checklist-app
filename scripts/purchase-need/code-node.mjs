// Run an n8n Code node's jsCode ("run once for all items" mode) outside n8n,
// with $input / $('Node') stubbed from plain objects. Lets an edited node be
// exercised against real rows BEFORE it is deployed.
// It EXECUTES the node's code, by design — only ever feed it our own workflow
// JSON (a saved export or the n8n REST API on localhost), never outside input.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const wrap = (rows) => {
  const items = rows.map((json) => ({ json }));
  return {
    all: () => items,
    first: () => items[0],
    last: () => items[items.length - 1],
    item: items[0],
  };
};

export async function runCodeNode(jsCode, { input = [], nodes = {} } = {}) {
  const $input = wrap(input);
  const $ = (name) => {
    if (!(name in nodes)) throw new Error(`runCodeNode: node "${name}" not stubbed`);
    return wrap(nodes[name]);
  };
  const fn = new AsyncFunction('$input', '$', jsCode);
  return fn($input, $);
}

export const nodeByName = (wf, name) => {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n) throw new Error(`node "${name}" not found in ${wf.name}`);
  return n;
};
