# n8n bespoke edits

Each file here exports `default (workflow, helpers) => workflow` and is applied with `node scripts/n8n-wave.mjs apply <path> scripts/n8n-edits/<file>.mjs`.

Every edit is preceded by `node scripts/n8n-wave.mjs export` so a pre-edit backup exists under `.n8n-backups/`.
