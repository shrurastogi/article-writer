# AI UX Streamlining — Sprint Plan

| Field | Value |
|---|---|
| Sprint | Insert between Sprint 5 and Sprint 6 (see Timing section) |
| Start | After Sprint 5 `dev` merge is stable |
| End | TBD (~2–3 days of work) |
| Goal | Reduce per-section AI buttons from 6 to 2 primary actions; fix misplaced controls without removing any capability |
| Type | UX refactor — no new endpoints, no DB changes, no new features |

---

## Why This Sprint Exists

After Sprint 5 lands, each section will expose **6 AI buttons** of equal visual weight:

```
[✨ Generate Draft]  [✨ Improve]  [✍ Expand to Prose]  [💡 Key Points]  [+ Table]  [📝 Grammar]
```

Three of those buttons (`Generate Draft`, `Improve`, `Expand to Prose`) do the same thing from a user's perspective — *"AI, help me write this section"* — and differ only in what state the section is in. A first-time user cannot know which to click. The Grammar button is a quality-review tool sitting alongside content-creation tools, which is also confusing.

No capability is removed. Every existing endpoint keeps working. This sprint only changes what the user sees and when.

---

## Redundancy Analysis

| Button | Endpoint | Redundant? | Reason |
|---|---|---|---|
| ✨ Generate Draft | `/api/generate` | ✅ With Improve | Both mean "AI write for me" — differ only in section state |
| ✨ Improve | `/api/improve` | ✅ With Generate Draft | Same mental model, different empty/filled detection |
| ✍ Expand to Prose | `/api/improve` (same endpoint!) | ✅ Fully redundant | Calls identical endpoint to Improve with a different instruction |
| 💡 Key Points | `/api/keypoints` | ⚠️ Wrong place | Useful, but as a planning tool — output should go to Notes, not AI box |
| + Table | `/api/generate-table` | ❌ Keep | Clearly distinct purpose |
| 📝 Grammar | `/api/grammar-check` | ⚠️ Wrong place | Quality review, not content creation — should not sit alongside write buttons |

---

## Planned Items

| ID | PRD Ref | Description | Status |
|---|---|---|---|
| S-UX-1 | F3 | Merge Generate Draft + Improve + Expand to Prose into one smart `✨ Write` button | 📋 Planned |
| S-UX-2 | F3-11 | Demote Key Points — move to Notes field as `💡 Suggest outline` helper link | 📋 Planned |
| S-UX-3 | F17-1 | Relocate Grammar Check out of AI actions row → section header icon | 📋 Planned |
| S-UX-4 | F3-11 | Relabel context inputs — clarify Notes vs Add Your Data purpose | 📋 Planned |
| S-UX-5 | F3 | Update E2E tests for new button structure | 📋 Planned |

---

## PR Sequence

| PR | Branch | Description |
|---|---|---|
| 1 | `refactor/smart-write-button` | Single `✨ Write` button — auto-detects section state and calls the right endpoint |
| 2 | `refactor/key-points-to-notes` | Remove Key Points button; add `💡 Suggest outline` link that populates Notes field |
| 3 | `refactor/grammar-relocate` | Move Grammar from AI actions row to section header as a small icon button |
| 4 | `refactor/context-inputs-labels` | Relabel Notes/hints and "Add Your Data" for clarity |
| 5 | `test/ai-ux-streamline` | Update E2E tests; add unit test for Write mode detection |

---

## PR 1 — `refactor/smart-write-button`

**Goal:** One button replaces three. Auto-detects what the section contains and calls the right endpoint.

**Detection logic (added to `public/js/app.js`):**

```js
function detectWriteMode(id) {
  const prose = state.sections[id]?.prose?.trim() || "";
  if (!prose) return "generate";
  const lines = prose.split("\n").filter(l => l.trim());
  const bulletLines = lines.filter(l => /^[-•*]|\d+\./.test(l.trim()));
  if (lines.length > 0 && bulletLines.length / lines.length > 0.4) return "expand";
  return "improve";
}

function smartWrite(id, title) {
  const mode = detectWriteMode(id);
  if (mode === "generate") generateDraft(id, title);
  else if (mode === "expand") expandToProse(id, title);
  else improveSection(id, title);
}
```

**In `renderSections()` template — replace 3 buttons with 1:**

```diff
- <button … onclick="generateDraft('${s.id}','${titleEsc}')">✨ Generate Draft</button>
- <button … onclick="improveSection('${s.id}','${titleEsc}')">✨ Improve</button>
- <button … onclick="expandToProse('${s.id}','${titleEsc}')">✍ Expand to Prose</button>
+ <button … onclick="smartWrite('${s.id}','${titleEsc}')">✨ Write</button>
```

`generateDraft()`, `improveSection()`, `expandToProse()` stay as internal functions — only the button entry point is unified. No backend changes.

**Files:** `public/js/app.js`, `public/css/app.css`

---

## PR 2 — `refactor/key-points-to-notes`

**Goal:** Key Points is a planning tool. Its output (a bullet list) belongs in the Notes field, not the AI output box. Remove the button; add a subtle inline link next to the Notes label.

**In `renderSections()` template:**

```diff
- <button … onclick="getKeyPoints('${s.id}','${titleEsc}')">💡 Key Points</button>

  <!-- Notes input label gets a helper link: -->
+ <div class="notes-label-row">
+   <span class="notes-label">Focus / angle for AI</span>
+   <a class="suggest-outline-link" onclick="suggestOutline('${s.id}','${titleEsc}')">
+     💡 Suggest what to cover
+   </a>
+ </div>
```

**Add `suggestOutline(id, title)` in `public/js/app.js`:**

```js
async function suggestOutline(id, title) {
  const notesEl = document.getElementById(`notes-${id}`);
  if (!notesEl) return;
  const link = document.querySelector(`[onclick*="suggestOutline('${id}'"]`);
  if (link) { link.textContent = "Loading…"; link.style.pointerEvents = "none"; }

  try {
    // reuse existing keypoints endpoint but stream result into Notes field
    const resp = await fetch("/api/keypoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: getTopic(), sectionId: id, sectionTitle: title,
        pubmedContext: getSelectedPubmedContext(),
        userContext: state.sections[id]?.userContext || "",
        language: getLanguage(),
      }),
    });
    if (!resp.ok) throw new Error();
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    notesEl.value = text.trim();
    notesEl.dispatchEvent(new Event("input")); // trigger any listeners
    showToast("Outline added to notes — edit it, then click Write.", "success");
  } catch {
    showToast("Could not suggest outline. Please try again.", "error");
  } finally {
    if (link) { link.textContent = "💡 Suggest what to cover"; link.style.pointerEvents = ""; }
  }
}
```

**`getKeyPoints()` stays** as an internal function (still called by agent draft). Only the button entry point is removed.

**Files:** `public/js/app.js`, `public/css/app.css`

**CSS additions:**
```css
.notes-label-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
.notes-label { font-size:0.78rem; color:var(--muted); font-weight:500; }
.suggest-outline-link { font-size:0.75rem; color:var(--ai); cursor:pointer; text-decoration:none; }
.suggest-outline-link:hover { text-decoration:underline; }
```

---

## PR 3 — `refactor/grammar-relocate`

**Goal:** Move Grammar Check from the AI writing actions row to the section header, making it visually distinct as a quality/review action.

**In `renderSections()` template — section header:**

```diff
  <div class="section-head" onclick="toggleSection('${s.id}')">
    <div class="section-head-left">
      <span class="drag-handle" …>⠿</span>
      <span class="section-num">…</span>
      <span class="section-name">…</span>
    </div>
    <div class="section-head-right">
+     <button class="btn-grammar-icon" title="Grammar & Style Check"
+       onclick="runGrammarCheck('${s.id}','${titleEsc}');event.stopPropagation()">
+       📝
+     </button>
      <!-- existing collapse arrow -->
    </div>
  </div>
```

```diff
  <!-- AI actions row — remove Grammar button -->
  <div class="section-ai-actions">
    <button … onclick="smartWrite(…)">✨ Write</button>
    <button … onclick="openTablePrompt(…)">+ Table</button>
-   <button … onclick="runGrammarCheck(…)">📝 Grammar</button>
    <div class="confidence-bar" id="conf-${s.id}"></div>
  </div>
```

**CSS:**
```css
.section-head-right { display:flex; align-items:center; gap:6px; }
.btn-grammar-icon { background:none; border:none; cursor:pointer; font-size:0.9rem;
  opacity:0.45; transition:opacity 0.15s; padding:2px 4px; border-radius:4px; }
.btn-grammar-icon:hover { opacity:1; background:var(--bg); }
```

**Files:** `public/js/app.js`, `public/css/app.css`

---

## PR 4 — `refactor/context-inputs-labels`

**Goal:** Make the two context inputs obviously different in purpose. The Notes field currently says "✏️ Notes / hints for AI generation (optional)" which doesn't tell the user *how* it differs from Add Your Data.

**In `renderSections()` template:**

```diff
- placeholder="✏️ Notes / hints for AI generation (optional)"
+ placeholder="Angle / focus for AI — e.g. 'emphasise RCT data and hazard ratios', 'focus on paediatric dosing'"
```

```diff
- <span class="user-ctx-hint">+ Add Your Data</span>
+ <span class="user-ctx-hint">+ Add your own data / statistics</span>
```

Add a small tooltip on the "Add your own data" toggle:

```diff
- <div class="user-ctx-toggle" onclick="toggleUserCtx('${s.id}');event.stopPropagation()">
+ <div class="user-ctx-toggle" title="Paste raw numbers, trial results, or patient data. AI treats this as fact." onclick="toggleUserCtx('${s.id}');event.stopPropagation()">
```

**Files:** `public/js/app.js` only (template strings)

---

## PR 5 — `test/ai-ux-streamline`

**Goal:** Update tests to match new button structure; add unit test for Write mode detection.

**New file: `tests/unit/smartWrite.test.js`**
```js
const { detectWriteMode } = require("../../public/js/app"); // or extract to util

describe("detectWriteMode", () => {
  test("empty section → generate", () => expect(detectWriteMode("")).toBe("generate"));
  test("bullet-heavy section → expand", () =>
    expect(detectWriteMode("- Point one\n- Point two\n- Point three")).toBe("expand"));
  test("prose section → improve", () =>
    expect(detectWriteMode("The pathophysiology of this condition involves...")).toBe("improve"));
  test("mixed but prose-dominant → improve", () =>
    expect(detectWriteMode("Overview:\nThe condition affects...\nKey point: treatment varies.")).toBe("improve"));
});
```

**Update `tests/e2e/editor.spec.ts`** (from Sprint 5 PR 12):
- Replace `Generate Draft` button selector → `Write` button
- Replace `Improve` button selector → `Write` button
- Add: empty section → Write → verify generates content
- Add: prose section → Write → verify content improved (not replaced from blank)
- Add: Grammar icon on section header → verify grammar panel opens
- Add: "Suggest what to cover" link → verify Notes field populated

**Files:** `tests/unit/smartWrite.test.js` (new), `tests/e2e/editor.spec.ts` (update)

---

## Before vs After

**Per-section UI — before:**
```
[✨ Generate Draft]  [✨ Improve]  [✍ Expand to Prose]  [💡 Key Points]  [+ Table]  [📝 Grammar]
```

**Per-section UI — after:**
```
Section header:   [section name]  ············  [📝]  [▾]
AI actions row:   [✨ Write]  [+ Table]
Notes field:      [Focus / angle for AI ___________________]  💡 Suggest what to cover
```

6 buttons → **2 primary buttons + 1 inline helper link + 1 header icon**. All 6 backend endpoints still work; no API changes.

---

## File Reference Map

| File | PRs |
|---|---|
| `public/js/app.js` | 1, 2, 3, 4 |
| `public/css/app.css` | 1, 2, 3 |
| `tests/unit/smartWrite.test.js` | 5 (new) |
| `tests/e2e/editor.spec.ts` | 5 (update) |

No backend files touched. No database changes. No new endpoints.

---

## Verification

| PR | How to verify |
|---|---|
| 1 | Empty section → click Write → content generated; section with prose → Write → content improved (not replaced with blank draft); section with bullet list → Write → bullets expanded to paragraphs |
| 2 | No Key Points button visible; click "Suggest what to cover" link → Notes field populates with bullet outline; Write then uses those notes |
| 3 | Grammar icon `📝` visible on section header right side; click it → grammar panel opens; icon not in AI actions row |
| 4 | Notes placeholder text updated; "Add your own data / statistics" label + tooltip shows on hover |
| 5 | `npm test` passes; E2E suite passes with updated selectors |

---

## Timing Recommendation

```
Sprint 4 (running)
      ↓
Sprint 5 — Dashboard & Editor Enhancements  ← Grammar Check and "Add Your Data" added here
      ↓
► AI UX Streamline  ← insert here — reorganises Sprint 5's new Grammar + context controls
      ↓
Sprint 6 — Collaboration, Versioning & Full Settings
      ↓
Sprint 7+ — RAG, Agents, Real-time collab
```

**Run immediately after Sprint 5 for three reasons:**

1. **Sprint 5 adds the features being reorganised.** Grammar Check (`PR 8`) and "Add Your Data" (`PR 5`) land in Sprint 5. Streamlining them immediately after (rather than in Sprint 5 itself) keeps Sprint 5 PRs focused and reviewable, and avoids redesigning mid-sprint.

2. **Sprint 6 builds settings and writing style on top of the editor.** Entering Sprint 6 with a clean, minimal AI actions row means any new Sprint 6 controls have less competition for visual space in the editor header.

3. **It is small.** 5 PRs, no backend work, ~2–3 days. It slots naturally as a mini cleanup sprint between two larger feature sprints. Running it as a standalone sprint (not bundled into Sprint 5 or 6) keeps the scope of both those sprints clean and this change reviewable on its own merits.

**Estimated effort:** ~2–3 days  
**Risk:** Low — no backend changes, no new endpoints, all changes are in `public/js/app.js` and `public/css/app.css`
