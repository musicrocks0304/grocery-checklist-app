// Read-only-by-convention MySQL access for verification scripts.
// SQL goes in on stdin, so no shell quoting is involved at any layer.
// One statement per call: --batch prints one header per result set.
import { spawnSync } from 'node:child_process';

export function sql(query) {
  const r = spawnSync(
    'docker',
    ['exec', '-i', 'hsa-mysql', 'bash', '-c',
      'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --batch --default-character-set=utf8mb4 hsa'],
    { input: query, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const stderr = (r.stderr || '').split('\n').filter((l) => l && !/Using a password/.test(l)).join('\n');
  if (r.status !== 0 || stderr) throw new Error(`mysql failed (${r.status}): ${stderr}\n--- query ---\n${query.slice(0, 600)}`);
  const lines = r.stdout.split('\n').filter((l) => l.length);
  if (!lines.length) return [];
  const header = lines[0].split('\t');
  return lines.slice(1).map((l) => {
    const cells = l.split('\t');
    return Object.fromEntries(header.map((h, i) => [h, cells[i] === 'NULL' ? null : cells[i]]));
  });
}

// For single-quoted SQL literals.
export const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
