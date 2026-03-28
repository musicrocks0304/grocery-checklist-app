# AI Chat Context Retention — Design Document

**Date**: 2026-03-08
**Status**: Approved
**Scope**: ChatBot (Blue Apron API Agent) + MealCreator Propose workflows

## Problem Statement

AI agents lose conversational context between messages. Example: User says "Chili?" and gets chili recipes, then says "Others, please" and receives completely unrelated suggestions. The AI treats every message as a standalone query.

### Root Cause (3 compounding issues)

1. **Chat history stores opaque JSON blobs**. The Postgres Chat Memory auto-stores AI responses as structured JSON (e.g., `{"output":{"responseType":"recipe_list","recipes":[...]}}`). When loaded as conversation history on the next turn, the AI sees an unreadable wall of JSON instead of a conversational message. The signal about what was previously discussed is buried inside a data payload.

2. **System prompts have zero multi-turn awareness**. Neither the ChatBot nor MealCreator system prompts instruct the AI to handle follow-up references like "others", "more", "different", or to avoid repeating previous suggestions.

3. **ChatBot's MySQL tool returns all 54 recipes every time**. A static query with no WHERE clause dumps the entire recipe catalog into the AI's context. Combined with unreadable chat history, the AI picks whatever matches the literal words in the current message — and "Others, please" has no recipe keywords.

**Bonus**: MealCreator Propose has a context window of only 4 messages (2 exchanges), so context rolls off almost immediately.

## Solution: Dual-Write Memory + Focused Search Tools

### Architecture Overview

```
ChatBot Workflow:
  Webhook → Code (extract session) → AI Agent
    ├── Anthropic Opus 4.6
    ├── Structured Output Parser
    ├── Postgres Chat Memory (10 messages)
    ├── Tool: searchRecipesByKeyword (sub-workflow)
    ├── Tool: searchRecipesByFilters (sub-workflow)
    └── Tool: getRecipeDetails (sub-workflow)
  AI Agent → Code (build summary)
           → Postgres (archive raw JSON)
           → Postgres (UPDATE with summary)
           → Respond to Webhook

MealCreator Propose Workflow:
  Webhook → Code (extract session) → Basic LLM Chain
    ├── Anthropic Haiku 4.5
    ├── Structured Output Parser
    └── Postgres Chat Memory (10 messages, was 4)
  LLM Chain → Code (build summary)
            → Postgres (archive raw JSON)
            → Postgres (UPDATE with summary)
            → Respond to Webhook
```

### Component 1: Dual-Write Memory

**Goal**: Store human-readable summaries in chat memory (for AI context) while archiving raw JSON (for debugging).

**Flow per turn**:
1. AI Agent/Chain responds — Postgres Chat Memory auto-stores the human message + AI response (JSON blob) as rows in `n8n_chat_histories`
2. Code node "Build Summary" — converts the structured AI output into a readable summary
3. Postgres "Archive Raw" — INSERTs the original JSON into `chat_history_raw` table
4. Postgres "Update Summary" — UPDATEs the `n8n_chat_histories` row to replace the JSON blob with the readable summary
5. Respond to Webhook — returns the original structured JSON to the React client (unchanged)

**New table: `chat_history_raw`**

| Column | Type | Purpose |
|--------|------|---------|
| id | INT AUTO_INCREMENT PK | Row ID |
| chat_history_id | INT | FK to n8n_chat_histories.id |
| session_id | VARCHAR(255) | Session reference for easy querying |
| raw_content | LONGTEXT | Original JSON blob |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | When stored |

**Context window changes**:
- ChatBot: keep at 10 (5 exchanges)
- MealCreator Propose: increase from 4 → 10

### Component 2: Summary Generation

**ChatBot summary format** (for `responseType: recipe_list`):
```
I suggested [N] recipes matching "[topic]": [name1] (ID:[id1]), [name2] (ID:[id2]).
The user said: "[original user message]"
```

Example:
```
I suggested 2 recipes matching "chili": Pork and Butternut Chili with Cheese and Sour Cream (ID:22), Healthy Butternut Squash & Turkey Chili (ID:52).
The user said: "Chili?"
```

For empty results:
```
I found no recipes matching "[topic]". I suggested the user try a different search.
The user said: "[original user message]"
```

**MealCreator summary format** (for `responseType: recipe_proposals`):
```
I proposed [N] meal ideas: 1) [name1] ([cuisine], [protein]), 2) [name2] ([cuisine], [protein]).
The user said: "[original user message]"
```

Example:
```
I proposed 3 meal ideas: 1) Sesame-Ginger Chicken Rice Bowls (Asian, chicken thighs), 2) Thai Basil Chicken Stir-Fry (Thai, chicken breast), 3) Korean BBQ Chicken Tacos (Korean, chicken thighs).
The user said: "Asian chicken ideas"
```

### Component 3: Focused Search Tools (ChatBot only)

Replace the single static MySQL tool with 3 sub-workflow tools.

**Tool 1: searchRecipesByKeyword**
- Input: `keyword` (string)
- SQL: Searches `recipe_name`, `recipe_description`, and `tag_name` via LIKE
- Returns: up to 10 recipes with name, description, time, servings, tags
- Use case: General searches ("chili", "pasta", "slow cooker")

```sql
SELECT DISTINCT R.recipe_id, R.recipe_name, R.recipe_description,
       R.total_time_minutes, R.servings,
       GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR ', ') as tags
FROM recipes R
LEFT JOIN recipe_tags rt ON rt.recipe_id = R.recipe_id
LEFT JOIN tags t ON t.tag_id = rt.tag_id
WHERE R.recipe_name LIKE CONCAT('%', ?, '%')
   OR R.recipe_description LIKE CONCAT('%', ?, '%')
   OR t.tag_name LIKE CONCAT('%', ?, '%')
GROUP BY R.recipe_id
LIMIT 10
```

**Tool 2: searchRecipesByFilters**
- Inputs: `cuisine` (optional), `protein` (optional), `style` (optional)
- SQL: Filters by tag matches using HAVING clauses
- Returns: up to 10 recipes matching all provided filters
- Use case: "Asian chicken recipes", "Italian vegetarian meals"

```sql
SELECT DISTINCT R.recipe_id, R.recipe_name, R.recipe_description,
       R.total_time_minutes, R.servings,
       GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR ', ') as tags
FROM recipes R
LEFT JOIN recipe_tags rt ON rt.recipe_id = R.recipe_id
LEFT JOIN tags t ON t.tag_id = rt.tag_id
GROUP BY R.recipe_id
HAVING (? IS NULL OR SUM(LOWER(t.tag_name) LIKE CONCAT('%', LOWER(?), '%')) > 0)
   AND (? IS NULL OR SUM(LOWER(t.tag_name) LIKE CONCAT('%', LOWER(?), '%')) > 0)
   AND (? IS NULL OR SUM(LOWER(t.tag_name) LIKE CONCAT('%', LOWER(?), '%')) > 0)
LIMIT 10
```

**Tool 3: getRecipeDetails**
- Input: `recipeIds` (comma-separated string of IDs)
- SQL: WHERE recipe_id IN (...)
- Returns: full recipe details for specific IDs
- Use case: "Tell me more about recipe 22", detail lookups

```sql
SELECT R.*, GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR ', ') as tags
FROM recipes R
LEFT JOIN recipe_tags rt ON rt.recipe_id = R.recipe_id
LEFT JOIN tags t ON t.tag_id = rt.tag_id
WHERE R.recipe_id IN (?)
GROUP BY R.recipe_id
```

**n8n implementation**: Each tool is a sub-workflow with Execute Workflow Trigger → MySQL query → Format Results (Code node). Connected to the AI Agent via `ai_tool` ports. Same pattern as the existing `Search HEB Coupons Tool` workflow.

### Component 4: System Prompt Updates

**ChatBot additions** (appended to existing system prompt):

```
CONVERSATION CONTINUITY:
- You have access to previous messages in this conversation via chat memory.
- If the user says "others", "more", "different", "alternatives", "what else",
  or similar follow-ups, refer to your PREVIOUS responses to understand what
  category/type they're asking about.
- Your previous responses describe what recipes you already suggested (by name and ID).
- When providing alternatives, search for the SAME category but exclude recipes
  you already suggested from your response.
- If you cannot determine what the user is referring to, ask them to clarify.

TOOL USAGE:
- You have 3 search tools. Pick the right one:
  1. searchRecipesByKeyword — for general text searches ("chili", "pasta", "slow cooker")
  2. searchRecipesByFilters — when user specifies cuisine, protein, or cooking style
  3. getRecipeDetails — when you need full details for specific recipe IDs
- For follow-up requests ("others", "more"), use the same search as before but
  note which recipes you already suggested and exclude them from your response.
- Do NOT return recipes you already suggested in this conversation unless the
  user specifically asks for them again.
```

**MealCreator Propose additions** (appended to existing system prompt):

```
CONVERSATION CONTINUITY:
- You have access to previous messages in this conversation via chat memory.
- If the user asks for "others", "more options", or "different ideas", create NEW
  proposals in the SAME category/cuisine/style as your previous suggestions.
- Do NOT repeat proposals you already offered.
- Your previous responses describe what you already proposed (by name and description).
- If you cannot determine what the user wants more of, ask them to clarify.
```

## What Changes vs. What Stays the Same

### Changes
| Component | Change |
|-----------|--------|
| ChatBot n8n workflow | Remove static MySQL tool. Add 3 search sub-workflows. Add summary + archive post-processing nodes. Update system prompt. |
| MealCreator Propose n8n workflow | Add summary + archive post-processing nodes. Update system prompt. Increase context window 4 → 10. |
| MySQL database | New `chat_history_raw` table (migration workflow) |
| n8n | 3 new sub-workflows for search tools. 1 new migration workflow. |

### No changes
| Component | Why unchanged |
|-----------|---------------|
| React client (ChatBot.js) | Same webhook URLs, same request/response format |
| React client (MealCreator.js) | Same webhook URLs, same request/response format |
| Chat History API workflow | Still reads from `n8n_chat_histories` — summaries are even more readable for UI display |
| MealCreator Full Build workflow | No chat memory by design, all context in request payload |
| Session ID logic | Deterministic week-scoped IDs already working correctly |

## n8n Workflows to Create/Modify

### New workflows
1. `Search Recipes by Keyword` — sub-workflow tool
2. `Search Recipes by Filters` — sub-workflow tool
3. `Get Recipe Details` — sub-workflow tool
4. `Create chat_history_raw Table` — migration, run once

### Modified workflows
5. `Blue Apron API Agent` — remove old MySQL tool, add 3 new tools, add post-processing nodes, update system prompt
6. `AI Meal Creator - Propose` — add post-processing nodes, update system prompt, increase context window
