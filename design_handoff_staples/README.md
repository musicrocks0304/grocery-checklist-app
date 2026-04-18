# Grocery Staples — Handoff package

Drop this folder into a fresh Claude Code session. Start with **PROMPT.md**.

## Contents

- **PROMPT.md** — the ask. Architectural audit, not implementation.
- **screenshots/01-default-loaded.png** — hero, default state.
- **screenshots/02-annotated.png** — same image with zones labelled.
- **source/staples-v5-best-of.jsx** — the prototype screen. Source of truth for behavior.
- **source/staples-shared.jsx** — shared tokens, icons, seed data, `ItemRow`.

## How to use

1. Open a Claude Code session rooted in our app repo.
2. Attach this entire folder.
3. Paste (or ask it to read) `PROMPT.md`.
4. Let it produce the audit doc. Review. Iterate. **Then** greenlight implementation.

## Context the prompt assumes

- Claude Code is starting fresh on our repo — it hasn't seen the grocery screen before.
- The prototype is React + Babel-in-browser. **Not** our production stack. Shape is the spec; code is disposable.
- Stack-agnostic prompt — should work whether our app is React Native, web React, SwiftUI translated via wrapper, etc. The audit sections are the same either way.
