# Bug Tracker

---

## Open Bugs

| ID | Area | Severity | Description | Status |
|---|---|---|---|---|
| BUG-002 | Section Numbering | Low | Newly added sections are missing auto-numbering; same issue affects the References section | Open |

---

## Fixed Bugs

| ID | Area | Severity | Description | Root Cause | Fixed |
|---|---|---|---|---|---|
| BUG-001 | Add Section — AI Chips | Medium | AI-suggested section chips visible but not selectable on click — user had to type manually | Inline handler used `event.currentTarget` which is `null` in inline handlers. Fixed: changed to `pickSuggestion(this,...)` and updated function to use `el` param | 2026-04-09 |
| BUG-003 | Coherence Check | High | "Apply Recommendation" buttons non-functional | Delegated click listener missing from init; added in sprint AI UX work | 2026-04-06 |
| BUG-004 | Font Zoom (A+ / A- / ↺) | Medium | Font size buttons had no visible effect on any UI text | `applyFontSize` only set a CSS custom property on `body`; all UI elements use `rem` units relative to `html` (browser default 16px), not to `body`. Fixed: `applyFontSize` now also sets `document.documentElement.style.fontSize`; `FONT_DEFAULT` updated to 16 | 2026-04-09 |
| BUG-005 | Save Version | High | "Save Version" button showed "Save the article first." error even with content | `articleId` declared as `const` from URL params — always `null` when editor opened without `?id=`. Fixed: changed to `let`; added `ensureArticleSaved()` which auto-creates the article on the server, saves content, and updates the URL transparently | 2026-04-09 |
| BUG-006 | Version History | High | "History" button showed "No article loaded." error | Same root cause as BUG-005 — `articleId` was `null`. Fixed: same `ensureArticleSaved()` helper | 2026-04-09 |
| BUG-007 | PDF Export | Medium | Section titles appear on one page, section content starts on the next page | `.p-body` had `page-break-inside: avoid` — when body was too large to fit on the same page as its title, Chromium pushed the entire body div to the next page. Fixed: removed `page-break-inside: avoid` from `.p-body`; added `break-after: avoid` to `.p-section-title` for modern Chromium support | 2026-04-09 |
| BUG-008 | Share Modal | Low | Invite collaborator email input was too narrow; Viewer/Editor dropdown was disproportionately wide | Email `<input>` had `flex:1` but no `min-width:0`; `<select>` had no width constraint so browser sized it by its native control. Fixed: `select` given `width:84px;flex-shrink:0`; input given `min-width:0`; button and container aligned | 2026-04-09 |
| BUG-009 | Write Full Article | Critical | "Write Full Article" button opened the modal but then hung with no progress and no error | `escHtml()` was called in `startFullDraft()` and `handleDraftEvent()` but was never defined (only `htmlEsc` exists). Threw a `ReferenceError` before `fetch` was called, leaving the modal frozen. Fixed: replaced all 6 occurrences of `escHtml` → `htmlEsc` | 2026-04-09 |

---

## Notes

- BUG-001 through BUG-003 observed in `dev` as of 2026-04-05.
- BUG-004 through BUG-009 found and fixed during dev QA session on 2026-04-09.
- BUG-002 (section numbering) remains open — no sprint assigned.
