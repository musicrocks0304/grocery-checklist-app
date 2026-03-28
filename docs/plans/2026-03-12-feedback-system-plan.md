# Feedback System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an in-app feedback system with a floating action button, auto-screenshot capture, emoji categories, and MySQL logging for AI-assisted debugging.

**Architecture:** FAB renders globally in App.js (outside AppShell for z-index control). Tapping it auto-captures the screen via html2canvas, then opens a slide-up panel. Submissions POST to an n8n webhook that INSERTs into MySQL `app_feedback` table. A second GET webhook enables querying feedback during debugging sessions.

**Tech Stack:** React 19, html2canvas, Framer Motion, Tailwind CSS, n8n webhooks, MySQL

---

### Task 1: Install html2canvas

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `cd "C:/New Grocery App/grocery-checklist-app" && npm install html2canvas`
Expected: Package added to dependencies

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add html2canvas dependency for feedback screenshots"
```

---

### Task 2: Create `app_feedback` MySQL table via n8n

**Files:**
- n8n workflow: "Create app_feedback Table" (new)

**Step 1: Create the n8n migration workflow**

Create workflow with these nodes:

**Node 1 — Webhook** (trigger):
- Type: `n8n-nodes-base.webhook`
- httpMethod: `GET`
- path: `create_app_feedback_table`
- responseMode: `responseNode`
- webhookId: `a1b2c3d4-5678-9abc-def0-feedback00001`

**Node 2 — MySQL** (create table):
- Type: `n8n-nodes-base.mySql`
- operation: `executeQuery`
- query:
```sql
CREATE TABLE IF NOT EXISTS app_feedback (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
- MySQL credential: `lqIXlvVVqfE4v7DF`

**Node 3 — Respond to Webhook**:
- respondWith: `json`
- responseBody: `{ "success": true, "message": "app_feedback table created" }`
- options.responseHeaders: `Access-Control-Allow-Origin: *`

**Connections**: Webhook → MySQL → Respond to Webhook

**Step 2: Activate workflow, trigger it via GET request, verify table exists**

Run: `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'hsa' AND TABLE_NAME = 'app_feedback'`
Expected: One row returned

**Step 3: Deactivate the migration workflow**

Use n8n REST API to deactivate.

---

### Task 3: Create n8n "Submit App Feedback" workflow

**Files:**
- n8n workflow: "Submit App Feedback" (new)

**Step 1: Create the workflow**

**Node 1 — Webhook** (trigger):
- Type: `n8n-nodes-base.webhook`
- httpMethod: `POST`
- path: `submit_feedback`
- responseMode: `responseNode`
- webhookId: `c3d4e5f6-7890-abcd-ef01-feedback00002`

**Node 2 — MySQL** (insert):
- Type: `n8n-nodes-base.mySql`
- operation: `executeQuery`
- query:
```sql
INSERT INTO app_feedback (category, description, screen, metadata, screenshots)
VALUES (
  '{{ $json.body.category }}',
  '{{ $json.body.description }}',
  '{{ $json.body.screen }}',
  '{{ JSON.stringify($json.body.metadata) }}',
  '{{ $json.body.screenshots }}'
);
SELECT LAST_INSERT_ID() as id;
```
- MySQL credential: `lqIXlvVVqfE4v7DF`

**Node 3 — Respond to Webhook**:
- respondWith: `json`
- responseBody: `{ "success": true, "id": {{ $json.id }} }`
- options.responseHeaders: `Access-Control-Allow-Origin: *`

**Connections**: Webhook → MySQL → Respond to Webhook

**Step 2: Activate workflow**

**Step 3: Test with curl**

```bash
curl -X POST https://n8n-grocery.needexcelexpert.com/webhook/submit_feedback \
  -H "Content-Type: application/json" \
  -d '{"category":"bug","description":"test feedback","screen":"home","metadata":{"viewport":"375x812","theme":"light"},"screenshots":"[]"}'
```
Expected: `{ "success": true, "id": 1 }`

**Step 4: Verify row in MySQL**

Run: `SELECT * FROM app_feedback WHERE id = 1`
Expected: Row with test data

**Step 5: Delete test row and commit**

Run: `DELETE FROM app_feedback WHERE description = 'test feedback'`

---

### Task 4: Create n8n "Fetch App Feedback" workflow

**Files:**
- n8n workflow: "Fetch App Feedback" (new)

**Step 1: Create the workflow**

**Node 1 — Webhook** (trigger):
- Type: `n8n-nodes-base.webhook`
- httpMethod: `GET`
- path: `fetch_feedback`
- responseMode: `responseNode`
- webhookId: `d4e5f678-90ab-cdef-0123-feedback00003`

**Node 2 — MySQL** (select):
- Type: `n8n-nodes-base.mySql`
- operation: `executeQuery`
- query:
```sql
SELECT id, category, description, screen, metadata, screenshots, status, resolution_notes, created_at, resolved_at
FROM app_feedback
WHERE (status = '{{ $json.query.status }}' OR '{{ $json.query.status }}' = '')
ORDER BY created_at DESC
```
- MySQL credential: `lqIXlvVVqfE4v7DF`
- alwaysOutputData: `true` (in case 0 rows)

**Node 3 — Aggregate**:
- Type: `n8n-nodes-base.aggregate`
- aggregate: `aggregateAllItemData`
- destinationFieldName: `data`
- include: `allFields`

**Node 4 — Respond to Webhook**:
- respondWith: `json`
- responseBody: `{{ JSON.stringify($json.data) }}`
- options.responseHeaders: `Access-Control-Allow-Origin: *`

**Connections**: Webhook → MySQL → Aggregate → Respond to Webhook

**Step 2: Activate workflow and test**

```bash
curl "https://n8n-grocery.needexcelexpert.com/webhook/fetch_feedback?status=new"
```
Expected: JSON array (empty or with data)

---

### Task 5: Add API endpoints

**Files:**
- Modify: `src/config/api.js:90-97`

**Step 1: Add the two new endpoints**

After the `addOneOffItem` line (line 96), before the closing `};` (line 97), add:

```javascript
  // Feedback
  submitFeedback: `${API_BASE_URL}/submit_feedback`,
  fetchFeedback: `${API_BASE_URL}/fetch_feedback`,
```

**Step 2: Verify no lint errors**

Run: `cd "C:/New Grocery App/grocery-checklist-app" && npx eslint src/config/api.js`
Expected: No errors

**Step 3: Commit**

```bash
git add src/config/api.js
git commit -m "feat: add feedback API endpoints"
```

---

### Task 6: Create screenshot utility

**Files:**
- Create: `src/utils/screenshot.js`

**Step 1: Write the utility**

```javascript
import html2canvas from 'html2canvas';

/**
 * Capture the current page as a compressed JPEG base64 string.
 * Excludes the feedback panel itself (via data-feedback-panel attribute).
 *
 * @returns {Promise<string|null>} base64 data URL or null on failure
 */
export async function captureScreen() {
  try {
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      allowTaint: true,
      scale: 1,
      logging: false,
      ignoreElements: (el) => el.hasAttribute('data-feedback-panel'),
    });
    return compressCanvas(canvas, 800, 0.6);
  } catch (err) {
    console.warn('Screenshot capture failed:', err);
    return null;
  }
}

/**
 * Compress an image File/Blob to a max-width JPEG base64 string.
 *
 * @param {File|Blob} file
 * @param {number} maxWidth
 * @param {number} quality JPEG quality 0-1
 * @returns {Promise<string>} base64 data URL
 */
export function compressImage(file, maxWidth = 800, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Resize a canvas to maxWidth and export as JPEG base64.
 */
function compressCanvas(canvas, maxWidth = 800, quality = 0.6) {
  const scale = Math.min(1, maxWidth / canvas.width);
  if (scale < 1) {
    const resized = document.createElement('canvas');
    resized.width = canvas.width * scale;
    resized.height = canvas.height * scale;
    const ctx = resized.getContext('2d');
    ctx.drawImage(canvas, 0, 0, resized.width, resized.height);
    return resized.toDataURL('image/jpeg', quality);
  }
  return canvas.toDataURL('image/jpeg', quality);
}
```

**Step 2: Commit**

```bash
git add src/utils/screenshot.js
git commit -m "feat: add screenshot capture and image compression utilities"
```

---

### Task 7: Create FeedbackFAB component

**Files:**
- Create: `src/components/FeedbackFAB.js`

**Step 1: Write the component**

```jsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquarePlus, X, Plus, Camera, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { ENDPOINTS, apiFetch } from '../config/api';
import { captureScreen, compressImage } from '../utils/screenshot';
import { useTheme } from '../contexts/ThemeContext';
import { getWeekDates } from '../utils/weekDates';

const CATEGORIES = [
  { id: 'bug', emoji: '\uD83D\uDC1B', label: 'Bug' },
  { id: 'idea', emoji: '\uD83D\uDCA1', label: 'Idea' },
  { id: 'confusing', emoji: '\uD83D\uDE15', label: 'Confusing' },
  { id: 'love', emoji: '\u2764\uFE0F', label: 'Love it' },
];

const FeedbackFAB = ({ currentScreen }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const { isDark } = useTheme();

  const reset = useCallback(() => {
    setCategory(null);
    setDescription('');
    setScreenshots([]);
    setIsCapturing(false);
    setIsSubmitting(false);
  }, []);

  const handleOpen = useCallback(async () => {
    setIsCapturing(true);
    setIsOpen(true);
    // Auto-capture screenshot of current screen
    const img = await captureScreen();
    if (img) {
      setScreenshots([img]);
    }
    setIsCapturing(false);
    // Focus textarea after panel opens
    setTimeout(() => textareaRef.current?.focus(), 300);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    // Delay reset so exit animation plays
    setTimeout(reset, 300);
  }, [reset]);

  const handleAddImage = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const compressed = await compressImage(file);
      setScreenshots((prev) => [...prev, compressed]);
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleRemoveImage = useCallback((index) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Clipboard paste support
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = async (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const compressed = await compressImage(blob);
            setScreenshots((prev) => [...prev, compressed]);
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    if (!description.trim()) {
      toast.error('Please describe your feedback');
      return;
    }
    if (!category) {
      toast.error('Please pick a category');
      return;
    }

    setIsSubmitting(true);
    try {
      const weekData = getWeekDates();
      const metadata = {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        theme: isDark ? 'dark' : 'light',
        week_date_range: weekData.displayRange,
        user_agent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      };

      const response = await apiFetch(ENDPOINTS.submitFeedback, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          description: description.trim(),
          screen: currentScreen || 'unknown',
          metadata,
          screenshots: JSON.stringify(screenshots),
        }),
      });

      if (response.ok) {
        toast.success('Feedback sent! Thanks!');
        handleClose();
      } else {
        toast.error('Failed to send feedback. Try again?');
      }
    } catch {
      toast.error('Network error. Try again?');
    } finally {
      setIsSubmitting(false);
    }
  }, [description, category, screenshots, currentScreen, isDark, handleClose]);

  return (
    <>
      {/* FAB Button */}
      {!isOpen && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleOpen}
          className="fixed bottom-24 right-4 lg:bottom-8 lg:right-8 z-50 w-14 h-14 rounded-full bg-primary text-white shadow-warm-lg flex items-center justify-center hover:bg-primary-hover transition-colors duration-200"
          aria-label="Send feedback"
        >
          <MessageSquarePlus size={24} />
        </motion.button>
      )}

      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />
        )}
      </AnimatePresence>

      {/* Feedback Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            data-feedback-panel
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:max-w-lg lg:rounded-2xl z-50 bg-surface rounded-t-2xl shadow-warm-xl border border-default max-h-[85vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-default sticky top-0 bg-surface/95 backdrop-blur-md rounded-t-2xl">
              <h2 className="text-lg font-bold font-display text-heading">Send Feedback</h2>
              <button
                onClick={handleClose}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-background transition-colors"
                aria-label="Close feedback"
              >
                <X size={20} className="text-secondary" />
              </button>
            </div>

            <div className="p-4 space-y-5">
              {/* Category picker */}
              <div>
                <p className="text-sm font-medium text-secondary mb-2">How's it going?</p>
                <div className="flex gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all duration-200 min-h-[44px] ${
                        category === cat.id
                          ? 'border-primary bg-primary-light shadow-warm'
                          : 'border-default hover:border-primary/30 hover:bg-background'
                      }`}
                    >
                      <span className="text-2xl" role="img" aria-label={cat.label}>{cat.emoji}</span>
                      <span className="text-xs font-medium text-secondary">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <textarea
                  ref={textareaRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What happened? What would make it better?"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-default bg-background text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 resize-none text-sm"
                />
              </div>

              {/* Screenshots */}
              <div>
                <p className="text-sm font-medium text-secondary mb-2">Screenshots</p>
                <div className="flex flex-wrap gap-2">
                  {isCapturing && (
                    <div className="w-20 h-20 rounded-lg border-2 border-dashed border-default flex items-center justify-center bg-background">
                      <Loader2 size={20} className="animate-spin text-secondary" />
                    </div>
                  )}
                  {screenshots.map((img, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-default group">
                      <img src={img} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => handleRemoveImage(i)}
                        className="absolute top-0 right-0 w-6 h-6 bg-danger text-white rounded-bl-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`Remove screenshot ${i + 1}`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-default flex flex-col items-center justify-center gap-1 hover:border-primary/40 hover:bg-background transition-all text-secondary hover:text-primary"
                  >
                    <Plus size={20} />
                    <span className="text-[10px] font-medium">Add</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={handleAddImage}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-tertiary mt-1.5">
                  Auto-captured current screen. Paste (Ctrl+V) or add more.
                </p>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full py-3 px-6 rounded-xl bg-primary text-white font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 min-h-[44px] flex items-center justify-center gap-2 shadow-warm"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Submit Feedback'
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default FeedbackFAB;
```

**Step 2: Verify no lint errors**

Run: `cd "C:/New Grocery App/grocery-checklist-app" && npx eslint src/components/FeedbackFAB.js`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/FeedbackFAB.js
git commit -m "feat: add FeedbackFAB component with auto-screenshot and emoji categories"
```

---

### Task 8: Integrate FeedbackFAB into App.js

**Files:**
- Modify: `src/components/App.js:1-4` (imports), `src/components/App.js:299-321` (render)

**Step 1: Add the import**

At `src/components/App.js`, after line 19 (`import Plan from "./Plan";`), add:

```javascript
import FeedbackFAB from "./FeedbackFAB";
```

**Step 2: Add FeedbackFAB to the main render (non-shop screens)**

In the return block (around line 299-321), add `<FeedbackFAB>` inside `<ThemeProvider>` but outside `<AppShell>`, just before the closing `</ThemeProvider>`:

Change this section:
```jsx
  return (
    <ThemeProvider>
      {toaster}
      <AppShell
        currentScreen={currentScreen}
        onNavigate={navigateToScreen}
        navigation={navigation}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentScreen}
            className={FULL_HEIGHT_SCREENS.has(currentScreen) ? "h-full" : ""}
            initial={pageTransition.initial}
            animate={pageTransition.animate}
            exit={pageTransition.exit}
            transition={pageTransition.transition}
          >
            {renderScreen()}
          </motion.div>
        </AnimatePresence>
      </AppShell>
    </ThemeProvider>
  );
```

To:
```jsx
  return (
    <ThemeProvider>
      {toaster}
      <AppShell
        currentScreen={currentScreen}
        onNavigate={navigateToScreen}
        navigation={navigation}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentScreen}
            className={FULL_HEIGHT_SCREENS.has(currentScreen) ? "h-full" : ""}
            initial={pageTransition.initial}
            animate={pageTransition.animate}
            exit={pageTransition.exit}
            transition={pageTransition.transition}
          >
            {renderScreen()}
          </motion.div>
        </AnimatePresence>
      </AppShell>
      <FeedbackFAB currentScreen={currentScreen} />
    </ThemeProvider>
  );
```

**Step 3: Verify no lint errors**

Run: `cd "C:/New Grocery App/grocery-checklist-app" && npx eslint src/components/App.js`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/App.js
git commit -m "feat: integrate FeedbackFAB into App shell"
```

---

### Task 9: Write basic render test for FeedbackFAB

**Files:**
- Create: `src/components/__tests__/FeedbackFAB.test.js`

**Step 1: Write the test**

```javascript
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import FeedbackFAB from '../FeedbackFAB';
import { ThemeProvider } from '../../contexts/ThemeContext';

// Mock html2canvas — returns a fake canvas
jest.mock('html2canvas', () => ({
  __esModule: true,
  default: jest.fn(() =>
    Promise.resolve({
      width: 375,
      height: 812,
      toDataURL: () => 'data:image/jpeg;base64,fake',
      getContext: () => ({ drawImage: jest.fn() }),
    })
  ),
}));

const renderWithTheme = (ui) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);

describe('FeedbackFAB', () => {
  test('renders the FAB button', () => {
    renderWithTheme(<FeedbackFAB currentScreen="home" />);
    expect(screen.getByLabelText('Send feedback')).toBeInTheDocument();
  });

  test('opens feedback panel on click', async () => {
    const { user } = renderWithTheme(<FeedbackFAB currentScreen="plan" />);
    const fab = screen.getByLabelText('Send feedback');
    // Use fireEvent since user-event may have timing issues with async
    const { fireEvent } = require('@testing-library/react');
    fireEvent.click(fab);
    // Panel should appear with header
    expect(await screen.findByText('Send Feedback')).toBeInTheDocument();
  });
});
```

**Step 2: Run tests**

Run: `cd "C:/New Grocery App/grocery-checklist-app" && npx react-scripts test --watchAll=false --verbose`
Expected: All tests pass (including existing 16 tests + 2 new)

**Step 3: Commit**

```bash
git add src/components/__tests__/FeedbackFAB.test.js
git commit -m "test: add FeedbackFAB render tests"
```

---

### Task 10: End-to-end verification

**Step 1: Start dev server**

Run: `cd "C:/New Grocery App/grocery-checklist-app" && npm start`

**Step 2: Visual verification**

- Verify FAB appears on bottom-right of all screens
- Tap FAB — verify auto-screenshot captures and panel slides up
- Pick an emoji category
- Type description
- Add a manual image
- Submit — verify toast success
- Check DB: `SELECT id, category, description, screen, status, created_at FROM app_feedback ORDER BY id DESC LIMIT 5`

**Step 3: Dark mode verification**

- Toggle to dark mode
- Verify FAB and panel look correct
- Submit feedback in dark mode
- Verify `metadata.theme` = "dark" in DB row

**Step 4: Mobile verification**

- Preview at mobile viewport (375x812)
- Verify FAB is above bottom tab bar
- Verify panel fills width as bottom sheet

**Step 5: Final commit (if any fixups needed)**

---

### Task 11: Update MEMORY.md

**Files:**
- Modify: `C:\Users\Corey\.claude\projects\C--New-Grocery-App-grocery-checklist-app\memory\MEMORY.md`

Add section:

```markdown
## App Feedback System
- **Component**: `src/components/FeedbackFAB.js` — FAB + slide-up panel, auto-screenshot via html2canvas
- **Screenshot util**: `src/utils/screenshot.js` — captureScreen() + compressImage() (max 800px, JPEG 0.6)
- **MySQL table**: `app_feedback` — category, description, screen, metadata (JSON), screenshots (LONGTEXT base64 array), status
- **n8n Submit** (ID: TBD): POST webhook at `/submit_feedback`. WebhookId: `c3d4e5f6-7890-abcd-ef01-feedback00002`.
- **n8n Fetch** (ID: TBD): GET webhook at `/fetch_feedback?status=new`. WebhookId: `d4e5f678-90ab-cdef-0123-feedback00003`.
- **n8n Migration** (ID: TBD): GET webhook at `/create_app_feedback_table`. Run once, deactivated.
- **AI debugging**: Query `SELECT * FROM app_feedback WHERE status = 'new'`, extract base64 screenshots to temp files for viewing
- **Status workflow**: new → acknowledged → fixed / wontfix
- Images compressed client-side (max 800px wide, JPEG quality 0.6, ~50-150KB each)
- FAB hidden during InStoreMode (shop screen renders fullscreen without AppShell)
- Clipboard paste supported on desktop (Ctrl+V)
```
