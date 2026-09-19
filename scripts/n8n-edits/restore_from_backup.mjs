// Restore a workflow's nodes and connections from an n8n-wave pre-save backup.
// The rollback path for every purchase-need edit:
//   RESTORE_FROM=<backup.json> node scripts/n8n-wave.mjs apply <webhookPath> scripts/n8n-edits/restore_from_backup.mjs
// (or `apply-id <workflowId>` if the workflow is no longer active). n8n-wave's
// own save still writes a fresh pre-save backup first, so a restore is itself
// reversible.
import { readFileSync } from 'node:fs';

export default function (wf) {
  const file = process.env.RESTORE_FROM;
  if (!file) throw new Error('restore_from_backup: set RESTORE_FROM to the backup JSON');
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  if (backup.id !== wf.id) throw new Error(`restore_from_backup: backup is for ${backup.id}, not ${wf.id}`);
  wf.nodes = backup.nodes;
  wf.connections = backup.connections;
  return wf;
}
