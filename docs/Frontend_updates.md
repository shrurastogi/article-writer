# Frontend UX Improvements — Cognitive Load Reduction

This document records planned UI improvements identified during the Sprint 8 UX audit. Changes are prioritised by impact vs. effort. No redesign — surgical fixes only.

---

## Issues Identified

| # | Issue | Location |
|---|-------|----------|
| 1 | "✨ Write" button has 3 hidden modes with no visual signal | Every section panel |
| 2 | Reference Library has 5 buttons in a row, 2 with technical labels | `index.html` reflib row |
| 3 | 📝 grammar icon is nearly invisible and icon-only | Section header |
| 4 | Coherence Check is always enabled but silently fails if <2 sections filled | `#coherence-btn` |
| 5 | Key points textarea has no visual link to the Write button | Section panel |
| 6 | Collapsed section header shows only "N words" — no content preview | Section accordion |
| 7 | Confidence bar has no label explaining what it measures | Below Write button |
| 8 | "Ask Library" tab is hidden 2 levels deep with no discoverability cue | Reference Library tabs |

---

## P1 — High Impact, Low Effort

### 1. Dynamic Write button label
`detectWriteMode(id)` already returns `"generate"` / `"expand"` / `"improve"`. Surface this on the button so the user knows what will happen before clicking.

**Changes:**
- Give Write button an id: `id="write-btn-${s.id}"`
- Add `refreshWriteLabel(id)` function:
  - Empty section → `✨ Generate Draft`
  - Bullet-heavy content → `✨ Expand to Prose`
  - Has prose → `✨ Improve Draft`
- Call `refreshWriteLabel` from: `updateSection()`, `applyAiSuggestion()`, end of `renderSections()`

**Files:** `public/js/app.js`

---

### 2. Rename Reference Library buttons
Current labels are technical and unclear to non-developers.

**Changes in `index.html`:**
- `↺ Sync References` → `↺ Update References Section`
- `⟳ Re-index RAG` → `⟳ Rebuild Search Index`
- Update `title` on Rebuild button: `"Rebuilds the semantic search index used by Ask Library. Run after adding new references."`

**Files:** `index.html`

---

### 3. Grammar button — self-labelling
The 📝 icon at opacity 0.45 is nearly invisible and its purpose is unclear without hovering.

**Changes:**
- Replace icon-only button with text+icon: `📝 Check`
- Rename CSS class `.btn-grammar-icon` → `.btn-grammar-btn`
- Style similar to `.btn-xs` so it fits in the section header without breaking layout

**Files:** `public/js/app.js` (template), `public/css/app.css`

---

### 4. Coherence Check — disable when prerequisites not met
Button is always enabled but currently shows a toast error if fewer than 2 sections have content. The affordance is wrong.

**Changes:**
- Add `updateCoherenceBtn()` function:
  - Counts sections with non-empty prose
  - Sets `btn.disabled = true` if count < 2
  - Sets `btn.title` to `"Write content in at least 2 sections first (N of 2 ready)"` or the normal description when enabled
- Call from `updateSection()` and end of `renderSections()`
- CSS: ensure `button:disabled { opacity: 0.4; cursor: not-allowed; }` is present

**Files:** `public/js/app.js`, `public/css/app.css`

---

## P2 — Medium Effort

### 5. Key points → Write micro-hint
There is no visual connection between the key points textarea and the Write button. Users may fill in key points and not realise the Write button uses them.

**Changes:**
- Add a thin hint strip between keypoints area and Write button: `id="kp-hint-${s.id}"`
- Content: `↑ Key points ready — click Generate Draft to use them`
- Show/hide from `updateKeyPoints(id, value)` based on whether textarea has content
- Also restore visibility on article load in `renderSections`

**CSS:**
```css
.kp-write-hint {
  font-size: 0.75rem;
  color: var(--ai);
  margin: 2px 0 6px;
  padding: 3px 8px;
  background: #f5f3ff;
  border-radius: 4px;
  border-left: 3px solid var(--ai);
}
```

**Files:** `public/js/app.js`, `public/css/app.css`

---

### 6. Collapsed section header — content preview snippet
When a section is collapsed, the user has no way to see what's inside without expanding it.

**Changes:**
- Add `<span class="section-snippet" id="snippet-${s.id}"></span>` in section header after `.section-name`
- In `updateWordCount(id)`, populate the snippet with the first ~60 characters of prose
- Hide snippet when section is open (`.section-panel.open .section-snippet { display: none; }`)

**CSS:**
```css
.section-snippet {
  font-size: 0.72rem;
  color: var(--muted);
  font-style: italic;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-left: 10px;
  opacity: 0.8;
}
```

**Files:** `public/js/app.js`, `public/css/app.css`

---

### 7. Confidence bar — add label
The coloured confidence bar appears after AI generation with no label. Users don't know what it measures.

**Changes:**
- In section template, add `<span class="conf-label" id="conf-label-${s.id}" style="display:none">AI confidence</span>` before the confidence bar div
- Show `conf-label-${id}` at the same time the bar is populated
- CSS: `.conf-label { font-size: 0.72rem; color: var(--muted); margin-right: 4px; vertical-align: middle; }`

**Files:** `public/js/app.js`, `public/css/app.css`

---

### 8. Consolidate Reference Library action buttons
5 buttons in a row is crowded. `Select All` and `Deselect All` always appear together and serve a single binary toggle.

**Changes:**
- Merge into single toggle: `<button id="sel-toggle-btn" onclick="toggleSelectAll()">Select All</button>`
- Add `toggleSelectAll()`: checks `state.library.every(r => r.selected)`, calls `selectAllLibrary(!allSelected)`, updates button text
- Move `Rebuild Search Index` to a secondary row below the main row (de-emphasised) — it is a maintenance action, not part of daily workflow
- Primary row becomes: `Fetch References | Select All | Update References Section`

**Files:** `index.html`, `public/js/app.js`

---

## P3 — Deferred

### 9. "Ask Library" discoverability
- Show a `● New` badge on the "🔎 Ask Library" tab the first time the Reference Library is opened
- Use a `localStorage` flag (`askLibraryTabSeen`) — clear it when the tab is clicked
- Low priority: tab label already includes 🔎 icon as a distinguishing cue

---

## Verification Checklist

- [ ] Blank article → Write button shows "✨ Generate Draft" for each section
- [ ] Type a sentence → button updates to "✨ Improve Draft" without page reload
- [ ] Type `• bullet` lines → button updates to "✨ Expand to Prose"
- [ ] Accept AI suggestion → button label refreshes correctly
- [ ] Coherence Check disabled + tooltip "0 of 2 ready"; activates after 2 sections have content
- [ ] Click 💡 Suggest → key points fill; `kp-hint` strip appears below
- [ ] Collapse a section with prose → header shows first ~60 chars
- [ ] Open the section → snippet is hidden
- [ ] Reference Library primary row: 3 buttons; Rebuild is secondary row
- [ ] Grammar button reads "📝 Check" — legible without hover
- [ ] No JS errors; auto-save still fires; all existing functionality unchanged
