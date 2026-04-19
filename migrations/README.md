# Migrations

SQL reference scripts for database schema changes. Each file documents one migration.

**Execution model:** Migrations are NOT run from this directory. Each file's contents are pasted into a one-shot n8n workflow (per the existing pattern in this codebase) and executed via the n8n REST API. After successful execution, the workflow is deactivated.

**Naming:** `YYYY-MM-DD_phaseN_description.sql`

**Per-file structure:**
- Header comment with date, phase, purpose, rollback instructions
- The SQL itself
- Verification query at the end (can be run separately to confirm migration applied)
