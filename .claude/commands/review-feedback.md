# Review Feedback

Review user-submitted app feedback with screenshots. Fetches new feedback from the database, displays a summary, and renders any attached screenshots for visual debugging.

## Steps

All n8n webhooks require the X-API-Key header. Run these commands from the repo root so .env resolves. When marking items via update_feedback_status with curl, add -H "X-API-Key: $KEY".

### 1. Fetch Feedback
Fetch all new feedback entries from the n8n webhook:

```bash
node -e "
const https = require('https');
const fs = require('fs');
const key = ((fs.readFileSync('.env', 'utf8').match(/^REACT_APP_API_KEY=(.*)$/m) || [])[1] || '').trim();
if (!key) { console.error('REACT_APP_API_KEY not found in .env'); process.exit(1); }
const opts = { headers: { 'X-API-Key': key } };
https.get('https://n8n-grocery.needexcelexpert.com/webhook/fetch_feedback?status=new', opts, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const items = JSON.parse(data);
    if (!items.length) { console.log('No new feedback!'); return; }
    console.log(JSON.stringify(items, null, 2));
  });
}).on('error', e => console.error('Fetch error:', e.message));
"
```

Display the results as a summary table with columns: **ID**, **Category**, **Screen**, **Description**, **Date**.

If there are no new feedback entries, stop here and tell the user.

### 2. Extract & View Screenshots
For each feedback entry that has a `screenshots` field (non-empty JSON array), extract every screenshot to a temp file and view it using the Read tool.

Run this for each entry, substituting the entry's `id`:

```bash
node -e "
const https = require('https');
const fs = require('fs');
const key = ((fs.readFileSync('.env', 'utf8').match(/^REACT_APP_API_KEY=(.*)$/m) || [])[1] || '').trim();
if (!key) { console.error('REACT_APP_API_KEY not found in .env'); process.exit(1); }
const opts = { headers: { 'X-API-Key': key } };
https.get('https://n8n-grocery.needexcelexpert.com/webhook/fetch_feedback?status=new', opts, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const items = JSON.parse(data);
    items.forEach(item => {
      if (!item.screenshots) return;
      const shots = typeof item.screenshots === 'string' ? JSON.parse(item.screenshots) : item.screenshots;
      shots.forEach((s, i) => {
        const b64 = s.replace(/^data:image\/\w+;base64,/, '');
        const path = '/tmp/feedback-' + item.id + '-' + i + '.jpg';
        require('fs').writeFileSync(path, Buffer.from(b64, 'base64'));
        console.log('Saved: ' + path);
      });
    });
  });
}).on('error', e => console.error(e.message));
"
```

Then use the **Read** tool to view each saved `/tmp/feedback-{id}-{index}.jpg` file. Describe what you see in each screenshot — the screen, any visible errors, UI state, etc.

### 3. Summarize & Triage
After viewing all screenshots, provide a summary for each feedback entry:
- **Category** and **screen** where it was submitted
- **User's description**
- **What the screenshot shows** (your visual analysis)
- **Suggested action**: Is this a real bug? A feature request? Just a test?

Ask the user if they want to take action on any items (e.g., mark as acknowledged, create a task to fix, etc.).

### 4. Cleanup
Remove temp screenshot files:

```bash
rm -f /tmp/feedback-*.jpg
```
