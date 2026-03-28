# AI Chat Context Retention — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix AI agents losing conversational context by replacing JSON-blob chat memory with human-readable summaries, adding focused search tools, and updating system prompts for multi-turn awareness.

**Architecture:** Dual-write memory (readable summaries in `n8n_chat_histories`, raw JSON archived to `chat_history_raw`), 3 focused MySQL sub-workflow tools replacing the static "get all recipes" query, enhanced system prompts for both ChatBot and MealCreator Propose.

**Tech Stack:** n8n workflows (MCP API), MySQL (hsa database), Postgres (n8n_chat_histories)

**Reference:** Design doc at `docs/plans/2026-03-08-ai-chat-context-design.md`

---

## Key Context for Implementor

- **n8n MCP tools** are the primary interface. Use `n8n_create_workflow`, `n8n_update_partial_workflow`, `n8n_update_full_workflow`.
- **n8n MCP cannot activate/deactivate workflows.** Use REST API: `POST https://n8n-grocery.needexcelexpert.com/api/v1/workflows/{id}/activate` with header `X-N8N-API-KEY` from `C:\hsa-automation\.env`.
- **MySQL credential ID**: `lqIXlvVVqfE4v7DF` (name: "MySQL account")
- **Postgres credential ID**: `ATXDTrCfxDScabsw` (name: "HSA Vector Database")
- **Anthropic credential (Opus)**: `L7zjljOSFhPif3PO` (name: "Anthropic account") — used by ChatBot
- **Anthropic credential (Haiku)**: `oIJGiLWag044CZqj` (name: "Anthropic API") — used by MealCreator
- **HTTP Auth credential**: `OzxeppJmnYuJpXbO` (name: "Grocery App API Key")
- **n8n webhookId gotcha**: Every webhook node MUST have a `webhookId` property (any UUID) or the webhook won't register in production.
- **Sub-workflow tool pattern**: See workflow `KKKbI3qVROijhfFG` (Search HEB Coupons Tool) for the exact node pattern.
- **Parent tool node pattern**: See workflow `CuaKAgmacIOTN6vW` (Match Coupons AI) for how `@n8n/n8n-nodes-langchain.toolWorkflow` connects to an AI Agent.
- **Existing ChatBot workflow ID**: `UsrnHCWpe6zfIbcn` (Blue Apron API Agent)
- **Existing MealCreator Propose workflow ID**: `0eSQFVwGsC8tuYli`
- **n8n MySQL tool node gotcha**: `mySqlTool` (typeVersion 2.5) returns results directly to the AI agent. Regular `mySql` (typeVersion 2.4) flows through the main data pipeline.
- **Postgres `n8n_chat_histories` schema**: columns `id` (int PK), `session_id` (varchar), `message` (jsonb). The `message` jsonb has shape `{"type": "human"|"ai", "content": "...", "additional_kwargs": {}, "response_metadata": {}}`.

---

## Task 1: Create `chat_history_raw` Migration Workflow

**Purpose:** Create the Postgres archival table for raw AI response JSON.

**Step 1: Create migration workflow via n8n MCP**

Use `n8n_create_workflow` with:
- name: `Create chat_history_raw Table`
- Nodes: Manual Trigger → Postgres (execute query) → respond/no-op

Postgres query:
```sql
CREATE TABLE IF NOT EXISTS chat_history_raw (
  id SERIAL PRIMARY KEY,
  chat_history_id INTEGER NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  raw_content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chr_session ON chat_history_raw(session_id);
CREATE INDEX IF NOT EXISTS idx_chr_chat_id ON chat_history_raw(chat_history_id);
```

Note: This table lives in **Postgres** (same DB as `n8n_chat_histories`), not MySQL.

**Step 2: Execute the migration**

Run the workflow manually via n8n UI or trigger it. Then deactivate.

**Step 3: Verify table exists**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'chat_history_raw' ORDER BY ordinal_position;
```

---

## Task 2: Create `Search Recipes by Keyword` Sub-Workflow

**Purpose:** Focused keyword search tool for the AI Agent.

**Step 1: Create the workflow via n8n MCP**

Use `n8n_create_workflow` with:
- name: `Search Recipes by Keyword`
- 3 nodes: Execute Workflow Trigger → MySQL → Format Results

**Node 1: Execute Workflow Trigger**
```json
{
  "id": "trigger-1",
  "name": "Execute Workflow Trigger",
  "type": "n8n-nodes-base.executeWorkflowTrigger",
  "typeVersion": 1.1,
  "position": [250, 300],
  "parameters": {
    "inputSource": "workflowInputs",
    "workflowInputs": {
      "values": [
        { "name": "keyword", "type": "string" }
      ]
    }
  }
}
```

**Node 2: MySQL Search**
```json
{
  "id": "mysql-1",
  "name": "Search Recipes",
  "type": "n8n-nodes-base.mySql",
  "typeVersion": 2.4,
  "position": [500, 300],
  "parameters": {
    "operation": "executeQuery",
    "query": "=SELECT DISTINCT R.recipe_id, R.recipe_name, R.recipe_description, R.total_time_minutes, R.servings, GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR ', ') as tags FROM recipes R LEFT JOIN recipe_tags rt ON rt.recipe_id = R.recipe_id LEFT JOIN tags t ON t.tag_id = rt.tag_id WHERE R.recipe_name LIKE CONCAT('%', '{{ $json.keyword }}', '%') OR R.recipe_description LIKE CONCAT('%', '{{ $json.keyword }}', '%') OR t.tag_name LIKE CONCAT('%', '{{ $json.keyword }}', '%') GROUP BY R.recipe_id LIMIT 10",
    "options": {}
  },
  "credentials": {
    "mySql": { "id": "lqIXlvVVqfE4v7DF", "name": "MySQL account" }
  }
}
```

**Node 3: Format Results**
```json
{
  "id": "code-1",
  "name": "Format Results",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [750, 300],
  "parameters": {
    "jsCode": "const results = $input.all().map(item => item.json);\nif (results.length === 0) {\n  return [{ json: { response: 'No recipes found matching that keyword. Try a different search term.' } }];\n}\nconst lines = results.map((r, i) => {\n  return `${i+1}. ID=${r.recipe_id} | ${r.recipe_name} | ${r.recipe_description} | time=${r.total_time_minutes || 'N/A'}min | servings=${r.servings || 'N/A'} | tags: ${r.tags || 'none'}`;\n}).join('\\n');\nreturn [{ json: { response: `Found ${results.length} recipe(s):\\n${lines}` } }];"
  }
}
```

**Connections:**
```json
{
  "Execute Workflow Trigger": { "main": [[{ "node": "Search Recipes", "type": "main", "index": 0 }]] },
  "Search Recipes": { "main": [[{ "node": "Format Results", "type": "main", "index": 0 }]] }
}
```

**Step 2: Note the workflow ID** — needed for Task 5.

**Step 3: Verify by checking workflow structure**

Use `n8n_get_workflow_structure` with the new ID.

---

## Task 3: Create `Search Recipes by Filters` Sub-Workflow

**Purpose:** Multi-filter search by cuisine, protein, and/or cooking style tags.

**Step 1: Create the workflow via n8n MCP**

Same 3-node pattern as Task 2.

**Node 1: Execute Workflow Trigger**
```json
{
  "id": "trigger-1",
  "name": "Execute Workflow Trigger",
  "type": "n8n-nodes-base.executeWorkflowTrigger",
  "typeVersion": 1.1,
  "position": [250, 300],
  "parameters": {
    "inputSource": "workflowInputs",
    "workflowInputs": {
      "values": [
        { "name": "cuisine", "type": "string" },
        { "name": "protein", "type": "string" },
        { "name": "style", "type": "string" }
      ]
    }
  }
}
```

**Node 2: Build & Execute Query (Code node)**

Because the SQL needs conditional WHERE clauses based on which filters are provided, use a Code node that builds the query dynamically and then a MySQL node executes it. Actually — simpler approach: use a Code node to build a safe query, then use MySQL `executeQuery`.

```json
{
  "id": "code-build",
  "name": "Build Query",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [500, 300],
  "parameters": {
    "jsCode": "const cuisine = ($json.cuisine || '').trim();\nconst protein = ($json.protein || '').trim();\nconst style = ($json.style || '').trim();\n\nconst filters = [];\nif (cuisine) filters.push(cuisine.toLowerCase());\nif (protein) filters.push(protein.toLowerCase());\nif (style) filters.push(style.toLowerCase());\n\nif (filters.length === 0) {\n  return [{ json: { query: 'SELECT DISTINCT R.recipe_id, R.recipe_name, R.recipe_description, R.total_time_minutes, R.servings, GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR \\', \\') as tags FROM recipes R LEFT JOIN recipe_tags rt ON rt.recipe_id = R.recipe_id LEFT JOIN tags t ON t.tag_id = rt.tag_id GROUP BY R.recipe_id LIMIT 10' } }];\n}\n\n// Build HAVING clauses for each filter\nconst havingClauses = filters.map(f => {\n  const escaped = f.replace(/'/g, \"''\");\n  return `SUM(LOWER(t.tag_name) LIKE '%${escaped}%') > 0`;\n});\n\nconst query = `SELECT DISTINCT R.recipe_id, R.recipe_name, R.recipe_description, R.total_time_minutes, R.servings, GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR ', ') as tags FROM recipes R LEFT JOIN recipe_tags rt ON rt.recipe_id = R.recipe_id LEFT JOIN tags t ON t.tag_id = rt.tag_id GROUP BY R.recipe_id HAVING ${havingClauses.join(' AND ')} LIMIT 10`;\n\nreturn [{ json: { query } }];"
  }
}
```

**Node 3: MySQL Execute**
```json
{
  "id": "mysql-1",
  "name": "Execute Query",
  "type": "n8n-nodes-base.mySql",
  "typeVersion": 2.4,
  "position": [750, 300],
  "parameters": {
    "operation": "executeQuery",
    "query": "={{ $json.query }}",
    "options": {}
  },
  "credentials": {
    "mySql": { "id": "lqIXlvVVqfE4v7DF", "name": "MySQL account" }
  }
}
```

**Node 4: Format Results**
```json
{
  "id": "code-format",
  "name": "Format Results",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [1000, 300],
  "parameters": {
    "jsCode": "const results = $input.all().map(item => item.json);\nif (results.length === 0) {\n  return [{ json: { response: 'No recipes found matching those filters. Try broadening your search.' } }];\n}\nconst lines = results.map((r, i) => {\n  return `${i+1}. ID=${r.recipe_id} | ${r.recipe_name} | ${r.recipe_description} | time=${r.total_time_minutes || 'N/A'}min | servings=${r.servings || 'N/A'} | tags: ${r.tags || 'none'}`;\n}).join('\\n');\nreturn [{ json: { response: `Found ${results.length} recipe(s):\\n${lines}` } }];"
  }
}
```

**Connections:**
```json
{
  "Execute Workflow Trigger": { "main": [[{ "node": "Build Query", "type": "main", "index": 0 }]] },
  "Build Query": { "main": [[{ "node": "Execute Query", "type": "main", "index": 0 }]] },
  "Execute Query": { "main": [[{ "node": "Format Results", "type": "main", "index": 0 }]] }
}
```

**Step 2: Note the workflow ID** — needed for Task 5.

---

## Task 4: Create `Get Recipe Details` Sub-Workflow

**Purpose:** Fetch full details for specific recipe IDs.

**Step 1: Create the workflow via n8n MCP**

**Node 1: Execute Workflow Trigger**
```json
{
  "id": "trigger-1",
  "name": "Execute Workflow Trigger",
  "type": "n8n-nodes-base.executeWorkflowTrigger",
  "typeVersion": 1.1,
  "position": [250, 300],
  "parameters": {
    "inputSource": "workflowInputs",
    "workflowInputs": {
      "values": [
        { "name": "recipeIds", "type": "string" }
      ]
    }
  }
}
```

**Node 2: Build Safe Query**
```json
{
  "id": "code-build",
  "name": "Build Query",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [500, 300],
  "parameters": {
    "jsCode": "const raw = $json.recipeIds || '';\n// Parse and validate: only allow numeric IDs\nconst ids = raw.split(',').map(s => s.trim()).filter(s => /^\\d+$/.test(s));\nif (ids.length === 0) {\n  return [{ json: { query: null, error: 'No valid recipe IDs provided. Please provide comma-separated numeric IDs.' } }];\n}\nconst idList = ids.join(',');\nconst query = `SELECT R.recipe_id, R.recipe_name, R.recipe_description, R.total_time_minutes, R.servings, GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR ', ') as tags FROM recipes R LEFT JOIN recipe_tags rt ON rt.recipe_id = R.recipe_id LEFT JOIN tags t ON t.tag_id = rt.tag_id WHERE R.recipe_id IN (${idList}) GROUP BY R.recipe_id`;\nreturn [{ json: { query, error: null } }];"
  }
}
```

**Node 3: Check for Error**
```json
{
  "id": "if-1",
  "name": "Has Valid IDs?",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.2,
  "position": [750, 300],
  "parameters": {
    "conditions": {
      "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict", "version": 2 },
      "conditions": [{ "id": "c1", "leftValue": "={{ $json.query }}", "rightValue": "", "operator": { "type": "string", "operation": "notEmpty", "singleValue": true } }],
      "combinator": "and"
    },
    "options": {}
  }
}
```

**Node 4: MySQL Execute** (on true branch)
```json
{
  "id": "mysql-1",
  "name": "Fetch Recipes",
  "type": "n8n-nodes-base.mySql",
  "typeVersion": 2.4,
  "position": [1000, 200],
  "parameters": {
    "operation": "executeQuery",
    "query": "={{ $('Build Query').item.json.query }}",
    "options": {}
  },
  "credentials": {
    "mySql": { "id": "lqIXlvVVqfE4v7DF", "name": "MySQL account" }
  }
}
```

**Node 5: Format Results**
```json
{
  "id": "code-format",
  "name": "Format Results",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [1250, 200],
  "parameters": {
    "jsCode": "const results = $input.all().map(item => item.json);\nif (results.length === 0) {\n  return [{ json: { response: 'No recipes found with those IDs.' } }];\n}\nconst lines = results.map((r, i) => {\n  return `${i+1}. ID=${r.recipe_id} | ${r.recipe_name} | ${r.recipe_description} | time=${r.total_time_minutes || 'N/A'}min | servings=${r.servings || 'N/A'} | tags: ${r.tags || 'none'}`;\n}).join('\\n');\nreturn [{ json: { response: `Recipe details:\\n${lines}` } }];"
  }
}
```

**Node 6: Error Response** (on false branch of If)
```json
{
  "id": "code-error",
  "name": "Error Response",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [1000, 400],
  "parameters": {
    "jsCode": "return [{ json: { response: $('Build Query').item.json.error } }];"
  }
}
```

**Connections:**
```json
{
  "Execute Workflow Trigger": { "main": [[{ "node": "Build Query", "type": "main", "index": 0 }]] },
  "Build Query": { "main": [[{ "node": "Has Valid IDs?", "type": "main", "index": 0 }]] },
  "Has Valid IDs?": { "main": [
    [{ "node": "Fetch Recipes", "type": "main", "index": 0 }],
    [{ "node": "Error Response", "type": "main", "index": 0 }]
  ]},
  "Fetch Recipes": { "main": [[{ "node": "Format Results", "type": "main", "index": 0 }]] }
}
```

**Step 2: Note the workflow ID** — needed for Task 5.

---

## Task 5: Modify ChatBot Workflow (Blue Apron API Agent)

**Workflow ID:** `UsrnHCWpe6zfIbcn`

This is the most complex task. We need to:
1. Remove the old static MySQL tool
2. Add 3 new sub-workflow tool nodes
3. Add post-processing nodes (build summary, archive raw, update summary)
4. Update the system prompt
5. Rewire connections

**Step 1: Read the current workflow**

Use `n8n_get_workflow` with ID `UsrnHCWpe6zfIbcn` to get the current state.

**Step 2: Full workflow update via `n8n_update_full_workflow`**

This requires sending the complete nodes array and connections. Below are the changes:

### Nodes to REMOVE:
- `Execute a SQL query in MySQL` (id: `c357ba16-5400-4eab-979e-9b0416b8661c`) — the old static MySQL tool

### Nodes to ADD:

**Tool 1: Search by Keyword**
```json
{
  "id": "tool-keyword",
  "name": "Search Recipes by Keyword",
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "typeVersion": 2.2,
  "position": [340, 240],
  "parameters": {
    "description": "Search the recipe database by keyword. Input: a search keyword like 'chili', 'pasta', 'slow cooker', 'chicken', 'tacos'. Searches recipe names, descriptions, and tags. Returns up to 10 matching recipes with IDs, names, descriptions, cooking times, and tags. Use this for general recipe searches.",
    "source": "database",
    "workflowId": {
      "__rl": true,
      "mode": "id",
      "value": "REPLACE_WITH_TASK2_WORKFLOW_ID"
    }
  }
}
```

**Tool 2: Search by Filters**
```json
{
  "id": "tool-filters",
  "name": "Search Recipes by Filters",
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "typeVersion": 2.2,
  "position": [500, 240],
  "parameters": {
    "description": "Search recipes by tag-based filters. Inputs: cuisine (e.g. 'asian', 'italian', 'mexican', 'mediterranean'), protein (e.g. 'chicken', 'beef', 'pork', 'turkey', 'vegetarian'), style (e.g. 'slow cooker', 'sheet pan', 'stir-fry', 'comfort food', 'quick'). All inputs are optional — provide at least one. Returns up to 10 matching recipes. Use this when the user specifies a cuisine type, protein preference, or cooking style.",
    "source": "database",
    "workflowId": {
      "__rl": true,
      "mode": "id",
      "value": "REPLACE_WITH_TASK3_WORKFLOW_ID"
    }
  }
}
```

**Tool 3: Get Recipe Details**
```json
{
  "id": "tool-details",
  "name": "Get Recipe Details",
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "typeVersion": 2.2,
  "position": [660, 240],
  "parameters": {
    "description": "Get full details for specific recipes by their IDs. Input: recipeIds as a comma-separated string of numeric IDs (e.g. '22,52,31'). Returns recipe names, descriptions, cooking times, servings, and tags. Use this when you need details about specific recipes you already know the IDs of.",
    "source": "database",
    "workflowId": {
      "__rl": true,
      "mode": "id",
      "value": "REPLACE_WITH_TASK4_WORKFLOW_ID"
    }
  }
}
```

**Post-processing: Build Summary**
```json
{
  "id": "code-summary",
  "name": "Build Summary",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [400, -32],
  "parameters": {
    "jsCode": "const aiOutput = $('AI Agent').first().json;\nconst sessionId = $('Code').first().json.sessionId;\nconst userMessage = $('Code').first().json.body?.message || $('Code').first().json.message || '';\n\n// Get the raw AI content\nlet rawContent = '';\nlet summary = '';\n\ntry {\n  const output = aiOutput.output;\n  rawContent = typeof output === 'string' ? output : JSON.stringify(output);\n\n  // Parse the structured output\n  let parsed = typeof output === 'string' ? JSON.parse(output) : output;\n\n  if (parsed.responseType === 'recipe_list' && parsed.recipes) {\n    const recipes = parsed.recipes;\n    if (recipes.length === 0) {\n      summary = `I found no recipes matching the request. I suggested trying a different search.\\nThe user said: \"${userMessage}\"`;\n    } else {\n      const recipeList = recipes.map(r => `${r.name} (ID:${r.id})`).join(', ');\n      summary = `I suggested ${recipes.length} recipe(s): ${recipeList}.\\nThe user said: \"${userMessage}\"`;\n    }\n  } else {\n    // Fallback: use the message field if available\n    summary = `I responded with: ${parsed.message || rawContent.substring(0, 200)}\\nThe user said: \"${userMessage}\"`;\n  }\n} catch (e) {\n  summary = `I responded to the user.\\nThe user said: \"${userMessage}\"`;\n  rawContent = JSON.stringify(aiOutput);\n}\n\nreturn [{ json: { ...aiOutput, sessionId, rawContent, summary } }];"
  }
}
```

**Post-processing: Archive Raw to Postgres**
```json
{
  "id": "pg-archive",
  "name": "Archive Raw JSON",
  "type": "n8n-nodes-base.postgres",
  "typeVersion": 2.5,
  "position": [650, -100],
  "parameters": {
    "operation": "executeQuery",
    "query": "=INSERT INTO chat_history_raw (chat_history_id, session_id, raw_content) SELECT id, session_id, message->>'content' FROM n8n_chat_histories WHERE session_id = '{{ $json.sessionId }}' AND message->>'type' = 'ai' ORDER BY id DESC LIMIT 1",
    "options": {}
  },
  "credentials": {
    "postgres": { "id": "ATXDTrCfxDScabsw", "name": "HSA Vector Database" }
  }
}
```

**Post-processing: Update Summary in Chat History**
```json
{
  "id": "pg-update",
  "name": "Update Chat Summary",
  "type": "n8n-nodes-base.postgres",
  "typeVersion": 2.5,
  "position": [650, 40],
  "parameters": {
    "operation": "executeQuery",
    "query": "=UPDATE n8n_chat_histories SET message = jsonb_set(message, '{content}', to_jsonb('{{ $json.summary }}'::text)) WHERE id = (SELECT id FROM n8n_chat_histories WHERE session_id = '{{ $json.sessionId }}' AND message->>'type' = 'ai' ORDER BY id DESC LIMIT 1)",
    "options": {}
  },
  "credentials": {
    "postgres": { "id": "ATXDTrCfxDScabsw", "name": "HSA Vector Database" }
  }
}
```

### System Prompt Update:

Replace the AI Agent's `options.systemMessage` with the enhanced version. The full prompt is the existing system prompt PLUS these additions appended at the end:

```
CONVERSATION CONTINUITY:
- You have access to previous messages in this conversation via chat memory.
- If the user says "others", "more", "different", "alternatives", "what else", or similar follow-ups, refer to your PREVIOUS responses to understand what category/type they're asking about.
- Your previous responses describe what recipes you already suggested (by name and ID).
- When providing alternatives, search for the SAME category but exclude recipes you already suggested from your response.
- If you cannot determine what the user is referring to, ask them to clarify.

TOOL USAGE:
- You have 3 search tools. Pick the right one:
  1. Search Recipes by Keyword — for general text searches ("chili", "pasta", "slow cooker")
  2. Search Recipes by Filters — when user specifies cuisine, protein, or cooking style
  3. Get Recipe Details — when you need full details for specific recipe IDs
- For follow-up requests ("others", "more"), use the same search as before but note which recipes you already suggested and exclude them from your response.
- Do NOT return recipes you already suggested in this conversation unless the user specifically asks for them again.
```

### New Connections:

After the AI Agent, the flow is:
```
AI Agent → Build Summary → [Archive Raw JSON, Update Chat Summary, Respond to Webhook] (parallel)
```

The three tool nodes connect to the AI Agent via `ai_tool`:
```
Search Recipes by Keyword → AI Agent (ai_tool, index 0)
Search Recipes by Filters → AI Agent (ai_tool, index 1)
Get Recipe Details → AI Agent (ai_tool, index 2)
```

The old MySQL tool connection is removed.

**Step 3: Use `n8n_update_full_workflow`**

Send the complete updated nodes array and connections object. This is a full replace, so include ALL existing nodes that should remain (Webhook, Code, AI Agent, Anthropic Chat Model, Structured Output Parser, Postgres Chat Memory, Respond to Webhook) plus the new nodes, minus the removed MySQL tool.

**Step 4: Deactivate and reactivate the workflow**

```bash
# Read API key
N8N_KEY=$(grep N8N_API_KEY C:/hsa-automation/.env | cut -d= -f2)

# Deactivate
curl -X POST "https://n8n-grocery.needexcelexpert.com/api/v1/workflows/UsrnHCWpe6zfIbcn/deactivate" \
  -H "X-N8N-API-KEY: $N8N_KEY"

# Reactivate
curl -X POST "https://n8n-grocery.needexcelexpert.com/api/v1/workflows/UsrnHCWpe6zfIbcn/activate" \
  -H "X-N8N-API-KEY: $N8N_KEY"
```

**Step 5: Verify workflow structure**

Use `n8n_get_workflow_structure` to confirm all nodes and connections are correct.

---

## Task 6: Modify MealCreator Propose Workflow

**Workflow ID:** `0eSQFVwGsC8tuYli`

Simpler than Task 5 — no new tools, just add post-processing nodes and update the prompt.

**Step 1: Read current workflow**

Use `n8n_get_workflow` with ID `0eSQFVwGsC8tuYli`.

**Step 2: Add post-processing nodes**

### Nodes to ADD:

**Build Summary (Code node)**
```json
{
  "id": "code-summary",
  "name": "Build Summary",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [350, 300],
  "parameters": {
    "jsCode": "const llmOutput = $('Basic LLM Chain').first().json;\nconst sessionId = $('Extract Session & Message').first().json.sessionId;\nconst userMessage = $('Extract Session & Message').first().json.message || '';\n\nlet rawContent = '';\nlet summary = '';\n\ntry {\n  const output = llmOutput.output || llmOutput.text || llmOutput;\n  rawContent = typeof output === 'string' ? output : JSON.stringify(output);\n\n  let parsed = typeof output === 'string' ? JSON.parse(output) : output;\n\n  if (parsed.responseType === 'recipe_proposals' && parsed.proposals) {\n    const proposals = parsed.proposals;\n    const propList = proposals.map(p => `${p.name} (${p.cuisineStyle}, ${p.protein})`).join(', ');\n    summary = `I proposed ${proposals.length} meal idea(s): ${propList}.\\nThe user said: \"${userMessage}\"`;\n  } else {\n    summary = `I responded with: ${parsed.message || rawContent.substring(0, 200)}\\nThe user said: \"${userMessage}\"`;\n  }\n} catch (e) {\n  summary = `I responded to the user.\\nThe user said: \"${userMessage}\"`;\n  rawContent = JSON.stringify(llmOutput);\n}\n\nreturn [{ json: { ...llmOutput, sessionId, rawContent, summary } }];"
  }
}
```

**Archive Raw JSON (Postgres)**
```json
{
  "id": "pg-archive",
  "name": "Archive Raw JSON",
  "type": "n8n-nodes-base.postgres",
  "typeVersion": 2.5,
  "position": [600, 200],
  "parameters": {
    "operation": "executeQuery",
    "query": "=INSERT INTO chat_history_raw (chat_history_id, session_id, raw_content) SELECT id, session_id, message->>'content' FROM n8n_chat_histories WHERE session_id = '{{ $json.sessionId }}' AND message->>'type' = 'ai' ORDER BY id DESC LIMIT 1",
    "options": {}
  },
  "credentials": {
    "postgres": { "id": "ATXDTrCfxDScabsw", "name": "HSA Vector Database" }
  }
}
```

**Update Chat Summary (Postgres)**
```json
{
  "id": "pg-update",
  "name": "Update Chat Summary",
  "type": "n8n-nodes-base.postgres",
  "typeVersion": 2.5,
  "position": [600, 340],
  "parameters": {
    "operation": "executeQuery",
    "query": "=UPDATE n8n_chat_histories SET message = jsonb_set(message, '{content}', to_jsonb('{{ $json.summary }}'::text)) WHERE id = (SELECT id FROM n8n_chat_histories WHERE session_id = '{{ $json.sessionId }}' AND message->>'type' = 'ai' ORDER BY id DESC LIMIT 1)",
    "options": {}
  },
  "credentials": {
    "postgres": { "id": "ATXDTrCfxDScabsw", "name": "HSA Vector Database" }
  }
}
```

### Changes to existing nodes:

**Postgres Chat Memory** — change `contextWindowLength` from 4 to 10:
```json
{
  "sessionIdType": "fromInput",
  "sessionKey": "={{ $json.sessionId }}",
  "tableName": "n8n_chat_histories",
  "contextWindowLength": 10
}
```

**System prompt** — append to existing system message:
```
CONVERSATION CONTINUITY:
- You have access to previous messages in this conversation via chat memory.
- If the user asks for "others", "more options", or "different ideas", create NEW proposals in the SAME category/cuisine/style as your previous suggestions.
- Do NOT repeat proposals you already offered.
- Your previous responses describe what you already proposed (by name and description).
- If you cannot determine what the user wants more of, ask them to clarify.
```

### New connection flow:

```
Basic LLM Chain → Build Summary → [Archive Raw JSON, Update Chat Summary, Respond to Webhook] (parallel)
```

The old direct connection `Basic LLM Chain → Respond to Webhook` is replaced.

**Step 3: Use `n8n_update_full_workflow`**

Send complete nodes and connections.

**Step 4: Deactivate and reactivate**

Same pattern as Task 5.

---

## Task 7: End-to-End Testing

**Step 1: Clear test session history**

```sql
DELETE FROM n8n_chat_histories WHERE session_id = 'chat_2026-03-09';
DELETE FROM n8n_chat_histories WHERE session_id = 'creator_2026-03-09';
```

**Step 2: Test ChatBot multi-turn context**

Send via React app or direct webhook POST:
1. Message: "Chili?" → expect chili recipes returned
2. Check Postgres: verify the AI message was rewritten to a summary (not JSON blob)
3. Check `chat_history_raw`: verify raw JSON was archived
4. Message: "Others, please" → expect DIFFERENT chili recipes (not random meals)

**Step 3: Test ChatBot tool selection**

1. Message: "What Asian chicken meals do you have?" → should use `searchByFilters` tool
2. Message: "Tell me more about recipe 22" → should use `getRecipeDetails` tool

**Step 4: Test MealCreator multi-turn context**

1. Message: "Something with pasta" → expect pasta proposals
2. Message: "Different options please" → expect NEW pasta proposals (not repeats, not random)

**Step 5: Verify no React client breakage**

- The webhook response format must still be the same structured JSON
- The React client should render recipes/proposals as before
- Chat history loading on mount should work (summaries are fine for display)

---

## Execution Order & Dependencies

```
Task 1 (migration) ──────────┐
Task 2 (keyword tool) ───────┤
Task 3 (filters tool) ───────┼──→ Task 5 (modify ChatBot) ──→ Task 7 (testing)
Task 4 (details tool) ───────┘                                     ↑
                                   Task 6 (modify MealCreator) ────┘
```

Tasks 1-4 can run in parallel. Task 5 depends on 2-4 (needs workflow IDs). Task 6 depends on 1 (needs `chat_history_raw` table). Task 7 depends on 5 and 6.
