# In-App Feedback System Design

**Date**: 2026-03-12
**Status**: Approved

## Overview

Add an in-app feedback system so the primary user can report bugs, suggest ideas, flag confusing UX, or share what she loves — all while using the app. Feedback is logged to MySQL with full context (screen, device, theme, screenshots) so that AI-assisted debugging sessions can query and triage it efficiently.

## UI Layer

### Floating Action Button (FAB)

- **Position**: Bottom-right corner, all screens. z-50.
- **Mobile**: Sits above the bottom tab bar (above safe-area-inset-bottom).
- **Desktop**: Fixed bottom-right with margin.
- **Hidden**: During InStoreMode (fullscreen shopping experience).
- **Icon**: Speech bubble / message icon from Lucide.
- **Behavior**: Tap opens feedback panel. Subtle entrance animation (scale + fade).

### Feedback Panel (Slide-Up Sheet)

Opens as a bottom sheet (mobile) or centered modal (desktop) with Framer Motion `AnimatePresence`.

**Contents (top to bottom)**:

1. **Header**: "Send Feedback" title + close X button
2. **Emoji category picker**: Single-select row of 4 options
   - 🐛 Bug — `"bug"`
   - 💡 Idea — `"idea"`
   - 😕 Confusing — `"confusing"`
   - ❤️ Love it — `"love"`
3. **Text area**: "What happened?" placeholder, auto-grow, 3-6 rows
4. **Screenshots section**:
   - Auto-captured screenshot thumbnail (pre-attached, removable with X)
   - "+ Add" button for manual attachment (file picker or camera)
   - Supports multiple images
   - Clipboard paste (Ctrl+V / Cmd+V) on desktop
5. **Submit button**: Full-width primary button, loading state on submit

### Auto-Screenshot Capture

When FAB is tapped (before panel opens):
1. `html2canvas` captures the current screen DOM
2. Canvas resized to max 800px wide (maintaining aspect ratio)
3. Exported as JPEG with quality 0.6 (~50-150KB)
4. Pre-attached in the panel as a removable thumbnail

### Manual Image Attachment

- File input: `accept="image/*"`, `capture="environment"` (mobile camera)
- Multiple files supported
- Client-side compression: same max 800px / JPEG 0.6 pipeline
- Desktop: also listens for `paste` event on the panel to capture clipboard images

## Auto-Captured Metadata

Every submission silently captures context (not shown to user):

| Field | Source | Example |
|-------|--------|---------|
| `screen` | `window.location.hash` | `"plan"` |
| `viewport` | `window.innerWidth + 'x' + window.innerHeight` | `"375x812"` |
| `theme` | ThemeContext value | `"dark"` |
| `week_date_range` | App state (weekDateRange) | `"Mar 8 - Mar 14, 2026"` |
| `user_agent` | `navigator.userAgent` | Browser string |
| `timestamp` | `new Date().toISOString()` | ISO timestamp |

## Database

### Table: `app_feedback`

```sql
CREATE TABLE app_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(20) NOT NULL COMMENT 'bug/idea/confusing/love',
  description TEXT NOT NULL,
  screen VARCHAR(50) COMMENT 'hash route where feedback was submitted',
  metadata JSON COMMENT 'auto-captured context (viewport, theme, week, user_agent)',
  screenshots LONGTEXT COMMENT 'JSON array of base64-encoded compressed JPEG images',
  status VARCHAR(20) DEFAULT 'new' COMMENT 'new/acknowledged/fixed/wontfix',
  resolution_notes TEXT COMMENT 'developer notes when resolving',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL
);
```

**Image storage**: Base64-encoded compressed JPEGs in a JSON array within LONGTEXT column. Each image ~50-150KB after client-side compression. MySQL LONGTEXT supports up to 4GB.

**Status workflow**: `new` → `acknowledged` → `fixed` / `wontfix`

## n8n Workflow: Submit App Feedback

**Webhook**: POST `/submit_feedback`
**WebhookId**: (generate UUID at creation time)
**Architecture**: Webhook (responseMode: responseNode) → MySQL INSERT → Respond to Webhook (CORS `*`)

**Request body**:
```json
{
  "category": "bug",
  "description": "The deals page shows last week's coupons",
  "screen": "deals",
  "metadata": {
    "viewport": "375x812",
    "theme": "dark",
    "week_date_range": "Mar 8 - Mar 14, 2026",
    "user_agent": "Mozilla/5.0...",
    "timestamp": "2026-03-12T15:30:00.000Z"
  },
  "screenshots": ["data:image/jpeg;base64,...", "data:image/jpeg;base64,..."]
}
```

**Response**: `{ "success": true, "id": 42 }`

## n8n Workflow: Fetch App Feedback

**Webhook**: GET `/fetch_feedback`
**WebhookId**: (generate UUID at creation time)
**Query params**: `?status=new` (optional filter)
**Architecture**: Webhook → MySQL SELECT → Aggregate → Respond to Webhook (CORS `*`)

Returns all feedback rows matching the status filter (or all if no filter). Used by Claude Code during debugging sessions.

## AI Debugging Workflow

When developer sits down to fix issues:

1. Claude Code queries: `SELECT id, category, description, screen, metadata, status, created_at FROM app_feedback WHERE status = 'new' ORDER BY created_at`
2. Reviews feedback with full context (screen, device, theme, week)
3. For items with screenshots: extracts base64 to temp PNG files and views them
4. After fixing: `UPDATE app_feedback SET status = 'fixed', resolution_notes = '...', resolved_at = NOW() WHERE id = ?`

## React Integration

### New Files
- `src/components/FeedbackFAB.js` — FAB button + feedback panel component
- `src/utils/screenshot.js` — html2canvas wrapper + image compression utility

### Modified Files
- `src/components/App.js` — Render `<FeedbackFAB />` in the app shell (after main content, before bottom bar)
- `src/config/api.js` — Add `submitFeedback` and `fetchFeedback` endpoints

### Dependencies
- `html2canvas` — for auto-screenshot capture (~40KB gzipped)

## Design System Compliance

- Uses existing color tokens (`--color-primary`, `--color-surface`, etc.)
- Dark mode fully supported via `.dark` CSS variables
- Framer Motion for panel entrance/exit animation
- Lucide icons (MessageSquarePlus or similar for FAB)
- Card component for panel container
- Button component for submit
- Min 44px touch targets
- `rounded-2xl` on panel, `rounded-full` on FAB
