# Sprint 5 — Dashboard & Editor Enhancements: Implementation Plan

## Context

Sprint 5 delivers 11 features across dashboard UX, editor preferences, new AI capabilities, and an agentic one-click full-draft flow. It also opens with a bug-fix PR for 3 issues deferred from Sprint 4 testing (tracked in `docs/BUGS.md`). Sprint 4 shipped: confidence indicator bars, strict-mode context grounding, server-side PDF (Puppeteer), and expanded AI/export test coverage. The codebase is now modular (`src/`, `public/js/`, `public/css/`).

**Already done — no rework needed:**

| Item | Where |
|---|---|
| Card grid on dashboard | `public/js/dashboard.js:60-98` |
| SSE streaming pattern | `src/routes/ai.js` (all endpoints) |
| `scheduleAutoSave()` debounce | `public/js/app.js:568-597` |
| `showToast()` error pattern | `public/js/app.js:809-814` |
| `getSectionContext()` helper | `src/services/sectionContext.js` |

**Decisions:** Bug PR first → features → tests PR last. No new external libraries (HTML5 native drag-and-drop for reorder). Dark mode uses `[data-theme="dark"]` on `<html>` per Decision D1 in RULES.md.

---

## Bug Fix PR — `fix/sprint5-bugs`

**Goal:** Fix three bugs from `docs/BUGS.md` before feature work begins.

### BUG-001: Section recommendation chip does nothing
**File:** `public/js/app.js`
- In `pickSuggestion(title)`: after setting `input.value = title`, also fire `input.dispatchEvent(new Event('input'))` and `input.focus()`
- Add visual feedback: toggle `.chip-selected` class on the clicked chip (remove from all chips first)
- Update chip `onclick` to pass the event: `onclick="pickSuggestion(event, '${s.title}')"`; update function signature to `pickSuggestion(e, title)`

**File:** `public/css/app.css`
- `.suggestion-chip.chip-selected { background: var(--ai); color: #fff; border-color: var(--ai); }`

### BUG-002: Auto-numbering missing on new sections and References
**File:** `public/js/app.js`
- Add `renumberSections()` — iterates `SECTIONS`, assigns sequential `num` to non-abstract, non-references sections (standard + custom); leaves `abstract` and `references` with `num: ""`
- Call `renumberSections()` from: `addCustomSection()`, `deleteSection()`, `renderSections()` (before template generation), `applyArticleData()` (after custom sections inserted)

### BUG-003: Run Check / Apply Recommendation buttons broken
**File:** `public/js/app.js`
- Fix inline onclick with unsafe JSON: replace `onclick="applyFlowRecommendation(...)"` with `data-action="apply-rec" data-section-id="${id}" data-rec-text="${recText.replace(/"/g, '&quot;')}"`
- Add delegated click listener on `#coherence-output` for `[data-action="apply-rec"]` targets
- In `checkCoherence()`: call `coherence-body.classList.add("visible")` **before** streaming starts so the loading state shows immediately

**No backend changes. No new tests for bug fixes.**

---

## PR 1 — `feature/sprint5-dashboard-views`

**Goal:** Toggle between card grid (existing) and a compact list/table view.

**Files:**
- `dashboard.html` — add view-toggle button group (`⊞` / `☰`) in `.page-header`
- `public/js/dashboard.js`
  - Module-level: `let currentView = localStorage.getItem('dashboard-view') || 'card';`
  - Add `setView(mode)` — persists to localStorage, updates active button class, calls `renderArticles()`
  - Modify `renderArticles()` to branch on `currentView`:
    - `'card'`: existing markup unchanged
    - `'list'`: `<table class="articles-table">` with columns: Title, Topic, Words, Created, Modified, Actions
  - In `init()`, call `setView(currentView)` before first render
- `public/css/dashboard.css`
  - `.view-toggle`, `.view-btn`, `.view-btn.active`, `.articles-table`, `.articles-table th/td/tr:hover`

**No backend changes. No new unit/integration tests** (covered by E2E in PR 12).

---

## PR 2 — `feature/sprint5-dashboard-filter`

**Goal:** Text search + date range + word count range filter with active chip display.

**Files:**
- `dashboard.html` — add `.filter-bar` (4 inputs + Clear button) and `#filter-chips` div above `#articles-container`
- `public/js/dashboard.js`
  - Module-level: `let filteredArticles = [];`
  - Add `applyFilters()` — filters `articles` array by text/date/wordCount, sets `filteredArticles`, calls `renderFilterChips()`, calls `renderArticles(filteredArticles)`, shows/hides Clear button
  - Add `clearFilters()` — resets all inputs, rerenders
  - Add `renderFilterChips()` — chip per active filter; each chip `onclick` clears that filter and re-applies
  - Modify `renderArticles(list?)` to accept optional list param (defaults to `articles`)
  - In `loadArticles()`: call `applyFilters()` after loading instead of `renderArticles()` directly
- `public/css/dashboard.css`
  - `.filter-bar`, `.filter-input`, `.filter-group`, `.filter-label`, `.filter-chips`, `.filter-chip`, `.filter-chip-x`, `.btn-clear-filters`

**No backend changes. No new tests.**

---

## PR 3 — `feature/sprint5-clone-article`

**Goal:** Deep-copy an article via a new backend endpoint; show Clone button on dashboard cards and list rows.

**Files:**
- `src/routes/articles.js`
  - Add `POST /:id/clone`:
    - Find original by `req.params.id`; verify ownership (403) or existence (404)
    - `original.toObject()`, delete `_id`, prefix title `"Copy of …"`, reset timestamps
    - `Article.create(newDoc)`, return `{ article: cloned }` with 201
    - `logger.info({ msg: "Article cloned", originalId, newId, userId })`
- `dashboard.html` — add `<div class="toast" id="toast"></div>` before `</body>` if missing
- `public/js/dashboard.js`
  - Add `showToast(msg, type)` (matching `app.js` pattern)
  - Add `cloneArticle(e, id)` — `e.stopPropagation()`, `fetch(POST /api/articles/${id}/clone)`, on success unshift to `articles`, call `applyFilters()`
  - In card + list row templates: add Clone button `⧉` before Delete
- `public/css/dashboard.css` — `.clone-btn` styles; copy `.toast` classes from `app.css`
- `docs/API.md` — add entry for `POST /api/articles/:id/clone`

**New tests in `tests/integration/api/articles.test.js`** (extend existing file):
  - Clone happy path: new `_id`, `"Copy of …"` title, all sections preserved, 201
  - 404 for non-existent article
  - 403 when cloning another user's article

---

## PR 4 — `feature/sprint5-spell-check`

**Goal:** Enable browser-native spell-check on all prose-entry textareas and inputs.

**Files:**
- `index.html` — add `spellcheck="true"` to `#authors` textarea and `#table-description` textarea
- `public/js/app.js` — in `renderSections()` template, add `spellcheck="true"` to `#content-${s.id}` textarea and `#notes-${s.id}` input

**No backend changes. No tests** (browser-native, not testable in Jest).

---

## PR 5 — `feature/sprint5-user-data-context`

**Goal:** Per-section "Add Your Data" collapsible textarea — saved to `section.userContext`, persisted to DB, injected into all AI prompts.

**Files:**
- `public/js/app.js`
  - Update `state.sections` default shape to include `userContext: ""`
  - In `renderSections()` template: add collapsible `.user-ctx-toggle` + `.user-ctx-body` textarea before `.section-ai-actions`
  - Add `toggleUserCtx(id)`, `updateUserCtx(id, value)` (calls `scheduleAutoSave()`)
  - In re-population loop: restore `#user-ctx-${id}` value from state
  - In `applyArticleData()`: restore `userContext` from persisted data
  - In all AI dispatch functions (`generateDraft`, `improveSection`, `getKeyPoints`, `expandToProse`, `refineSection`): add `userContext: state.sections[id]?.userContext || ""` to fetch body
- `src/routes/ai.js`
  - In `/generate`, `/improve`, `/keypoints`, `/refine`, `/generate-table`: destructure `userContext`, build:
    ```js
    const userContextText = userContext?.trim()
      ? `\n\nAuthor-supplied data (treat as authoritative):\n${userContext.trim()}`
      : "";
    ```
  - Append `userContextText` to each prompt string
- `public/css/app.css`
  - `.user-ctx-toggle`, `.user-ctx-hint`, `.user-ctx-input`, `.user-ctx-body`

**No model schema changes needed** (`sections` is Mixed type in MongoDB).

---

## PR 6 — `feature/sprint5-dark-mode`

**Goal:** `[data-theme="dark"]` CSS variable overrides; toggle button in editor + dashboard headers; preference persisted to localStorage.

**Files:**
- `public/css/app.css`
  - After `:root`: `[data-theme="dark"]` block with `--bg:#1a1a2e`, `--card:#16213e`, `--border:#2d3561`, `--text:#e2e8f0`, `--muted:#94a3b8`, `--primary:#F36633`, `--ai:#1A1F71` + specific overrides for preview, inputs, modals
- `public/css/dashboard.css`
  - Same pattern: `[data-theme="dark"]` block for dashboard-specific vars + card/modal/table overrides
- `index.html` — add `<button id="theme-toggle" onclick="toggleDarkMode()">🌙</button>` in `.header-right`
- `dashboard.html` — add same toggle button
- `public/js/app.js`
  - Add `applyTheme()` — reads `localStorage.getItem('theme')`, sets/removes `data-theme` on `<html>`, updates button icon
  - Add `toggleDarkMode()` — flips localStorage value, calls `applyTheme()`
  - Call `applyTheme()` as very first line of IIFE (before `checkAuth()`)
- `public/js/dashboard.js`
  - Copy identical `applyTheme()` + `toggleDarkMode()` functions
  - Call `applyTheme()` at start of `init()`
- `docs/RULES.md` — add cross-reference annotation to the existing Decision D1 block pointing to `public/css/app.css [data-theme="dark"]`

**No backend changes. No new tests.**

---

## PR 7 — `feature/sprint5-font-zoom`

**Goal:** `--base-font-size` CSS variable; +/- controls in editor header; range 12–22px; persisted to localStorage.

**Files:**
- `public/css/app.css`
  - In `:root`: add `--base-font-size: 16px;`
  - Add: `html { font-size: var(--base-font-size); }`
  - Add `.font-zoom-group`, `.font-zoom-btn`, `.font-zoom-label` styles
- `index.html` — add font zoom control group in `.header-right` before `#theme-toggle`:
  ```html
  <div class="font-zoom-group">
    <button class="font-zoom-btn" onclick="changeFontSize(-1)">A-</button>
    <span class="font-zoom-label" id="font-size-label">16px</span>
    <button class="font-zoom-btn" onclick="changeFontSize(1)">A+</button>
    <button class="font-zoom-btn" onclick="resetFontSize()">↺</button>
  </div>
  ```
- `public/js/app.js`
  - Add constants: `FONT_SIZE_MIN=12, FONT_SIZE_MAX=22, FONT_SIZE_DEFAULT=16`
  - Add `applyFontSize(px)` — sets CSS var, updates `#font-size-label`
  - Add `changeFontSize(delta)` — clamps to range, persists, calls `applyFontSize()`
  - Add `resetFontSize()` — resets to 16px
  - In IIFE: call `applyFontSize(parseInt(localStorage.getItem('font-size') || FONT_SIZE_DEFAULT))` after `applyTheme()`

**No backend changes. No tests.**

---

## PR 8 — `feature/sprint5-grammar-check`

**Goal:** New streaming `POST /api/grammar-check` endpoint + per-section Grammar panel.

**Files:**
- `src/routes/ai.js`
  - Add `POST /grammar-check` endpoint (same SSE streaming pattern)
  - Prompt: checks for PASSIVE_VOICE | LONG_SENTENCE | INFORMAL | HEDGING; returns lines in `ISSUE | type | fragment | suggestion` format, or `NO_ISSUES`
  - Destructure `{ content, topic, sectionTitle, language }` from `req.body`; 400 if `!content?.trim()`
- `public/js/app.js`
  - In `renderSections()` template: add `.grammar-panel` (hidden) + "Grammar" button to `.section-ai-actions`
  - Add `runGrammarCheck(id, title)` — guards on empty content, fetches with `getLanguage()`
  - Add `renderGrammarResults(id, rawText)` — parses `ISSUE | ...` lines into `.grammar-issue-card` elements; handles `NO_ISSUES` case
  - Add `closeGrammarPanel(id)`
  - Add `getLanguage()` helper (if not added in PR 9) — `document.getElementById('language-select')?.value || 'English'`
- `public/css/app.css`
  - `.grammar-panel`, `.grammar-panel-header`, `.grammar-results`, `.grammar-issue-card`, `.grammar-issue-type`, `.grammar-fragment`, `.grammar-suggestion`
- `docs/API.md` — add entry for `POST /api/grammar-check`

**New test cases in `tests/integration/api/ai.test.js`** (extend existing):
  - `POST /api/grammar-check` — 200 streams for valid content
  - `POST /api/grammar-check` — 400 when content missing

---

## PR 9 — `feature/sprint5-language-selector`

**Goal:** `article.language` field; Output Language dropdown in Article Details; language prefix injected into all AI prompts.

**Files:**
- `src/models/Article.js`
  - Add `language: { type: String, default: "English" }` to schema
  - Add `"language"` to `SUMMARY_FIELDS` array
- `src/routes/articles.js`
  - In `PUT /:id` handler: destructure and apply `language` from `req.body`
- `src/routes/ai.js`
  - In all 7 streaming endpoints (`/generate`, `/improve`, `/keypoints`, `/generate-table`, `/refine`, `/grammar-check`, `/coherence-check`): destructure `language`, build:
    ```js
    const languagePrefix = language && language !== "English"
      ? `Important: Respond in ${language} at a clinical academic level.\n\n`
      : "";
    ```
  - Prepend `languagePrefix` to each prompt string (before main instruction)
- `index.html` — add `<select id="language-select">` in Article Details panel (after keywords); options: English, Spanish, French, German, Italian, Portuguese, Japanese, Mandarin Chinese, Arabic
- `public/js/app.js`
  - Ensure `getLanguage()` helper exists (from PR 8 or add here)
  - In `scheduleAutoSave()` payload: add `language: getLanguage()`
  - In `applyArticleData(data)`: set `#language-select` value from `data.language`
  - In all AI dispatch functions: add `language: getLanguage()` to fetch bodies
- `docs/API.md` — annotate all updated endpoints with optional `language` field

**New test case in `tests/integration/api/ai.test.js`**:
  - `POST /api/generate` with `language: "Spanish"` — 200, accepted without error

---

## PR 10 — `feature/sprint5-drag-drop`

**Goal:** HTML5 native drag-and-drop on section accordion headers to reorder `SECTIONS`; order auto-saved.

**Files:**
- `public/js/app.js`
  - In `renderSections()` template: add `<span class="drag-handle" draggable="true" ondragstart="onDragStart(event,'${s.id}')" ondragover="onDragOver(event)" ondrop="onDrop(event,'${s.id}')" ondragend="onDragEnd(event)">⠿</span>` as first child of `.section-head-left`
  - Drag event handler also calls `e.stopPropagation()` to prevent accordion toggle
  - Module-level: `let dragSourceId = null;`
  - Add handlers:
    - `onDragStart(e, id)` — set `dragSourceId`, add `.dragging` class to section panel
    - `onDragOver(e)` — `e.preventDefault()`, add `.drag-over` class to target panel
    - `onDrop(e, targetId)` — `e.preventDefault()`, call `reorderSection(dragSourceId, targetId)`
    - `onDragEnd(e)` — remove `.dragging` and `.drag-over` classes from all panels
  - Add `reorderSection(fromId, toId)`:
    - Find and splice `fromId` to `toId` position in `SECTIONS`
    - Call `renumberSections()` (from Bug PR), `renderSections()`, `scheduleAutoSave()`
- `public/css/app.css`
  - `.drag-handle`, `.drag-handle:active`, `.section-panel.dragging`, `.section-panel.drag-over`

**No backend changes. No unit tests** (HTML5 drag-drop; covered by E2E in PR 12).

---

## PR 11 — `feature/sprint5-one-click-draft`

**Goal:** "Write Full Article" button opens a progress panel; streams SSE per-section drafts; user approves or skips each section.

**Files:**
- `src/routes/ai.js`
  - Add `POST /agent/draft` SSE endpoint:
    - Destructure `{ topic, sections, language, pubmedContext }` from `req.body`
    - 400 if `!topic?.trim()` or `!sections.length`
    - SSE headers; helper `sendEvent(res, data)` writes `data: JSON\n\n`
    - For each section: `sendEvent` `section_start`, call existing generate logic (reuse `getSectionContext()` + `languagePrefix` + `userContextText`), stream/accumulate response, `sendEvent` `section_done`
    - On completion: `sendEvent` `{ type: "complete" }`, `res.end()`
    - `try/catch`: `sendEvent` `{ type: "error", message }`, `res.end()`
- `index.html`
  - In preview panel header: add `<button id="full-draft-btn" onclick="startFullDraft()">✨ Write Full Article</button>`
  - Add `#draft-progress-modal` (hidden overlay with `.draft-progress-box`, `#draft-section-list`, Cancel button)
- `public/js/app.js`
  - `let draftAbortController = null;`
  - Add `startFullDraft()`:
    - Guard on missing topic
    - Build sections payload: all SECTIONS except `references`, with `{ id, title, notes, userContext }`
    - Open modal, populate section rows with initial "Queued" state
    - Fetch with AbortController signal
    - Read SSE stream via `getReader()` / `TextDecoder`, parse `data:` JSON lines
    - Handle `section_start` → "Generating…", `section_done` → snippet + Approve/Skip buttons, `complete` → update subtitle, `error` → `showToast()`
  - Add `approveDraftSection(id, content)` — sets `state.sections[id].prose`, populates `#content-${id}`, calls `updateWordCount()`, `updatePreview()`, `scheduleAutoSave()`, marks row "Applied"
  - Add `skipDraftSection(id)` — marks row "Skipped"
  - Add `cancelFullDraft()` — aborts controller, closes modal
- `public/css/app.css`
  - `.draft-progress-box`, `.draft-progress-title`, `.draft-progress-subtitle`, `.draft-section-list`, `.draft-section-row`, `.draft-section-row-title`, `.draft-section-status`, `.draft-section-preview`, `.draft-section-actions`
- `docs/API.md` — add entry for `POST /api/agent/draft` (SSE; event types documented)

**New test file: `tests/integration/api/agent-draft.test.js`**:
  - Valid request — response is `text/event-stream`, contains `section_done` and `complete` events
  - Missing `topic` — 400
  - Empty `sections` array — 400

---

## PR 12 — `test/sprint5-coverage`

**Goal:** Integration tests for clone + agent-draft; E2E tests for dashboard and editor features.

**Files:**
- `tests/integration/api/articles.test.js` (extend) — clone test cases (see PR 3)
- `tests/integration/api/ai.test.js` (extend) — grammar-check and language test cases (see PR 8/9)
- `tests/integration/api/agent-draft.test.js` (new) — draft SSE events, 400 cases (see PR 11)
- `tests/e2e/dashboard.spec.ts` (new):
  - Card/List toggle + localStorage persistence
  - Filter by text + clear filters
  - Clone from card
  - Delete confirmation
- `tests/e2e/editor.spec.ts` (new):
  - Dark mode toggle + persistence across reload
  - Font zoom +/- and reset
  - Spell check attribute on section textarea
  - User context persists after auto-save + reload
  - Drag-drop section reorder + verify new order persists

**Pattern:** Follow `tests/integration/api/suggest-sections.test.js` for integration tests. Use `tests/e2e/` for Playwright specs.

---

## File Reference Map

| File | PRs |
|---|---|
| `public/js/app.js` | Bug, 4, 5, 6, 7, 8, 9, 10, 11 |
| `public/js/dashboard.js` | Bug, 1, 2, 3, 6 |
| `public/css/app.css` | Bug, 5, 6, 7, 8, 10, 11 |
| `public/css/dashboard.css` | 1, 2, 3, 6 |
| `dashboard.html` | 1, 2, 3, 6 |
| `index.html` | 4, 5, 6, 7, 9, 11 |
| `src/routes/ai.js` | 5, 8, 9, 11 |
| `src/routes/articles.js` | 3, 9 |
| `src/models/Article.js` | 9 |
| `docs/API.md` | 3, 8, 9, 11 |
| `docs/RULES.md` | 6 |
| `tests/integration/api/articles.test.js` | 3, 12 |
| `tests/integration/api/ai.test.js` | 8, 9, 12 |
| `tests/integration/api/agent-draft.test.js` | 11, 12 |
| `tests/e2e/dashboard.spec.ts` | 12 |
| `tests/e2e/editor.spec.ts` | 12 |

---

## New Test Requirements

| File | Type | Runner | Covers |
|---|---|---|---|
| `tests/integration/api/articles.test.js` (extended) | Integration | Jest + mongodb-memory-server | Clone: happy path, 404, 403 |
| `tests/integration/api/ai.test.js` (extended) | Integration | Jest (Groq mocked) | Grammar-check 200/400; language field accepted |
| `tests/integration/api/agent-draft.test.js` (new) | Integration | Jest (Groq mocked) | Draft SSE events; 400 for missing topic/sections |
| `tests/e2e/dashboard.spec.ts` (new) | E2E | Playwright | Card/list; filter; clone; delete confirm |
| `tests/e2e/editor.spec.ts` (new) | E2E | Playwright | Dark mode; font zoom; spell-check attr; user context; drag-drop |

---

## Verification

| PR | How to verify |
|---|---|
| Bug PR | BUG-001: click recommendation chip — input populates + chip highlights; BUG-002: add custom section — sequential number appears in header; BUG-003: click "Run Check" with 2+ filled sections — output appears and "Apply" button applies text to target section |
| PR 1 | Click list-view toggle — compact table with Title/Topic/Words/Created/Modified columns renders; reload — list view persists |
| PR 2 | Type partial title — matching articles shown, chip appears; click Clear — all articles restore |
| PR 3 | Clone any article — "Copy of [title]" appears at top of dashboard; open clone — all content identical |
| PR 4 | Right-click a section textarea — browser spell-check option present; misspelled words underlined |
| PR 5 | Expand "Add Your Data", type text, save + reload — text restored; generate draft — AI output incorporates the pasted data |
| PR 6 | Click moon icon — dark background (#1a1a2e) with orange/navy accents; reload — dark persists; click sun icon — reverts |
| PR 7 | A+ x3 — label shows 19px, text visibly larger; Reset — 16px |
| PR 8 | Write passive-voice content, click Grammar — panel with PASSIVE_VOICE issue card showing fragment + suggestion |
| PR 9 | Set language Spanish, Generate Draft — Spanish academic prose streamed; PubMed search still returns English abstracts |
| PR 10 | Drag handle of Introduction below Main Body — sections reorder; reload — new order persists |
| PR 11 | Click "Write Full Article" — progress modal opens, each section shows draft snippet with Approve/Skip; Approve populates editor section; Skip leaves unchanged |
| PR 12 | `npm test` passes; Playwright E2E suite green on local dev server |
