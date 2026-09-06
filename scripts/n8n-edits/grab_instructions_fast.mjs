// Zero rows from either MySQL node left the Respond node unreached → empty 200.
// The Code node ("Merge Results") already builds a single object, so the data
// nodes only need alwaysOutputData — but the empty placeholder item n8n then
// emits was collected as a real row (recipe 1 has ingredients and no
// instructions → one bogus step in `output`), so Merge Results now drops
// empty-object rows. An unknown recipe answers with a valid JSON object.
const GUARD = ".filter(r => r && Object.keys(r).length)";

export default function (wf) {
  for (const name of ['Get Instructions', 'Get Ingredients']) {
    const n = wf.nodes.find((x) => x.name === name);
    if (!n) throw new Error(`node "${name}" not found`);
    n.alwaysOutputData = true;
  }
  const merge = wf.nodes.find((n) => n.name === 'Merge Results');
  if (!merge) throw new Error('node "Merge Results" not found');
  if (!merge.parameters.jsCode.includes(GUARD)) {
    const before = merge.parameters.jsCode;
    merge.parameters.jsCode = before.replace(
      /(\$\('Get (?:Instructions|Ingredients)'\)\.all\(\)\.map\(item => item\.json\))/g,
      `$1${GUARD}`,
    );
    const added = merge.parameters.jsCode.split(GUARD).length - 1;
    if (added !== 2) throw new Error(`expected to guard 2 row collections, guarded ${added}`);
  }
  return wf;
}
