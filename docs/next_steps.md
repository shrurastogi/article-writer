# Plan: Article Type Selection + Cross-Section Context

## Context
Currently every article is hardcoded as a "review article" — the prompts, section lists, and data model have no concept of article type. Users also get repetitive content between sections because each section is generated in isolation with no awareness of what other sections already say. This plan adds (1) a three-way article type selector (Review / Original Research / Perspective) that changes the section set and tailors all AI prompts, and (2) cross-section context injection so generated sections don't repeat points already covered elsewhere.

---

## Changes

### 1. `src/models/Article.js`
Add `articleType` field after `keywords` (line 8):
```js
articleType: { type: String, enum: ["review", "original_research", "perspective"], default: "review" },
```
No migration needed — `default: "review"` handles all existing documents.

---

### 2. `src/routes/articles.js`
**Line 74** — add `articleType` to destructure:
```js
const { title, topic, authors, keywords, articleType, sections, library, customSections, language, writingStyle } = req.body;
```
**After line 84** — persist it:
```js
if (articleType !== undefined) article.articleType = articleType;
```

---

### 3. `src/services/sectionContext.js`
Replace the `getSectionContext` function signature and body (lines 3–26).

New signature: `getSectionContext(topic, sectionId, sectionTitle, articleType = "review")`

Keep the existing `map` as `baseMap` (all current entries unchanged).

Add a type-override layer on top:
```js
const overrides = {
  original_research: {
    abstract:     `a structured abstract (Background, Methods, Results, Conclusions) for an original research article on ${t}`,
    introduction: `an Introduction identifying the gap in knowledge, study rationale, and primary aims for original research on ${t}`,
    methods:      `a Methods section covering study design, participants, interventions, outcomes, and statistical analysis for ${t}`,
    results:      `a Results section presenting primary and secondary outcomes with data, tables, and statistical results for ${t}`,
  },
  perspective: {
    abstract:          `a brief abstract summarising the perspective argument on ${t}`,
    introduction:      `an Introduction contextualising the clinical debate and author's viewpoint on ${t}`,
    perspective_body:  `a Perspective body presenting the author's argument with supporting evidence and counter-arguments on ${t}`,
  },
};
return overrides[articleType]?.[sectionId] || baseMap[sectionId]
  || `the "${sectionTitle}" section of a medical article on ${t}`;
```

---

### 4. `src/routes/ai.js`

#### 4a. `/api/generate` route (lines 11–61)

**Line 12** — add `articleType`, `existingSections` to destructure:
```js
const { topic, sectionId, sectionTitle, notes, pubmedContext, userContext, language, writingStyle, articleType, existingSections } = req.body;
```

**Line 19** — pass `articleType` to context lookup:
```js
const context = getSectionContext(subject, sectionId, sectionTitle, articleType || "review");
```

**After line 30** (`styleText`) — add journal hint and cross-section block:
```js
const journalHint = { original_research: "NEJM, Lancet, JAMA", perspective: "NEJM Perspective, Lancet Comment, JAMA Viewpoint" }[articleType] || "Nat Rev / NEJM reviews, JCO Reviews";

const existingSectionsText = Array.isArray(existingSections) && existingSections.length
  ? `\n\nContent already covered in other sections (do not repeat — cross-reference or build upon instead):\n` +
    existingSections.filter(s => s.prose?.trim()).map(s => `- ${s.title}: ...${s.prose.trim().slice(-300)}`).join("\n")
  : "";
```

**Line 35** — replace hardcoded journal string:
```
- Formal academic writing style suitable for a high-impact journal (e.g. ${journalHint})
```

**Line 39** — append at end of prompt template:
```js
`...${styleText ? `\n- ${styleText}` : ""}${notesText}${litText}${userContextText}${existingSectionsText}`
```

#### 4b. `/api/agent/draft` route (lines 561–630)

**Line 562** — add `articleType`:
```js
const { topic, sections, language, pubmedContext, writingStyle, articleType } = req.body;
```

**After line 587** (`styleText`) — add accumulator and journal hint:
```js
const generatedSections = [];
const journalHint = { original_research: "NEJM, Lancet, JAMA", perspective: "NEJM Perspective, Lancet Comment" }[articleType] || "Nat Rev / NEJM reviews, JCO Reviews";
```

**Line 594** — pass `articleType`:
```js
const context = getSectionContext(subject, id, title, articleType || "review");
```

**After line 594** — build prior-context block:
```js
const priorContextText = generatedSections.length
  ? `\n\nPreviously generated sections (do not repeat these points — build upon them):\n` +
    generatedSections.map(s => `- ${s.title}: ${s.prose.slice(0, 150)}…`).join("\n")
  : "";
```

**Line 603** — replace journal string with `${journalHint}`; append `${priorContextText}` at end of prompt.

**After line 620** (`sendEvent section_done`) — push to accumulator:
```js
generatedSections.push({ title, prose: content });
```

---

### 5. `public/js/app.js`

#### 5a. Replace `SECTIONS` declaration (lines 2–9)
Replace the `let SECTIONS = [...]` block with a `SECTIONS_BY_TYPE` const map containing all three type arrays (cloned on access via spread), plus a getter:
```js
const SECTIONS_BY_TYPE = {
  review: [ /* existing 6 entries unchanged */ ],
  original_research: [
    { id: "abstract",     num: "",  title: "Abstract",     placeholder: "Structured abstract: Background, Methods, Results, Conclusions...", isCustom: false },
    { id: "introduction", num: "1", title: "Introduction", placeholder: "Background, gap in knowledge, study rationale and aims...", isCustom: false },
    { id: "methods",      num: "2", title: "Methods",      placeholder: "Study design, participants, interventions, outcomes, statistical analysis...", isCustom: false },
    { id: "results",      num: "3", title: "Results",      placeholder: "Primary and secondary outcomes, data, tables, statistical results...", isCustom: false },
    { id: "discussion",   num: "4", title: "Discussion",   placeholder: "Interpretation, clinical implications, limitations, comparison with literature...", isCustom: false },
    { id: "conclusions",  num: "5", title: "Conclusions",  placeholder: "Summary of key findings, implications, future directions...", isCustom: false },
    { id: "references",   num: "",  title: "References",   placeholder: "1. Author A, et al. ...", isCustom: false },
  ],
  perspective: [
    { id: "abstract",         num: "",  title: "Abstract",     placeholder: "Brief abstract summarising the perspective argument...", isCustom: false },
    { id: "introduction",     num: "1", title: "Introduction", placeholder: "Context for the debate and the author's viewpoint...", isCustom: false },
    { id: "perspective_body", num: "2", title: "Perspective",  placeholder: "The argument with supporting evidence and the author's viewpoint...", isCustom: false },
    { id: "conclusions",      num: "3", title: "Conclusions",  placeholder: "Summary and clinical/policy implications...", isCustom: false },
    { id: "references",       num: "",  title: "References",   placeholder: "1. Author A, et al. ...", isCustom: false },
  ],
};
function getSectionsForType(type) {
  return (SECTIONS_BY_TYPE[type] || SECTIONS_BY_TYPE.review).map(s => ({ ...s }));
}
let SECTIONS = getSectionsForType("review");
```

#### 5b. Add `articleType` to `state` (line 26)
```js
const state = {
  articleType: "review",
  sections: Object.fromEntries(SECTIONS.map(s => [s.id, { prose: "", tables: [] }])),
  // ...rest unchanged
};
```

#### 5c. `applyArticleData` — read `articleType` before custom sections / sections loop
Insert before the `customSections` block:
```js
if (data.articleType && data.articleType !== state.articleType) {
  state.articleType = data.articleType;
  const btn = document.querySelector(`input[name="article-type"][value="${data.articleType}"]`);
  if (btn) btn.checked = true;
  SECTIONS = getSectionsForType(data.articleType);
}
```

#### 5d. `scheduleAutoSave` / `ensureArticleSaved`
Add `articleType: state.articleType` to both save payloads.

#### 5e. Add `onArticleTypeChange` function (after `scheduleAutoSave`)
```js
function onArticleTypeChange(newType) {
  if (newType === state.articleType) return;
  const prevProse = {};
  SECTIONS.forEach(s => { prevProse[s.id] = state.sections[s.id]; });
  state.articleType = newType;
  SECTIONS = getSectionsForType(newType);
  const newSections = {};
  SECTIONS.forEach(s => { newSections[s.id] = prevProse[s.id] || { prose: "", tables: [], userContext: "" }; });
  state.sections = newSections;
  renumberSections();
  renderSections();
  updatePreview();
  scheduleAutoSave();
}
```

#### 5f. `generateDraft` — collect `existingSections` and send `articleType`
```js
const existingSections = SECTIONS
  .filter(s => s.id !== id && state.sections[s.id]?.prose?.trim())
  .map(s => ({ title: s.title, prose: state.sections[s.id].prose }));
// add existingSections and articleType: state.articleType to the streamToAiBox payload
```

#### 5g. `startFullDraft` — add `articleType: state.articleType` to fetch body

#### 5h. `clearAll` — reset article type
Before `renumberSections()` in `clearAll`:
```js
SECTIONS = getSectionsForType("review");
state.articleType = "review";
document.querySelector('input[name="article-type"][value="review"]').checked = true;
```

---

### 6. `index.html` + `public/css/app.css`

Add a segmented radio control inside the Article Details panel, after the Output Language `form-group` (~line 81):
```html
<div class="form-group" style="margin-bottom:0">
  <label>Article Type</label>
  <div class="article-type-selector" role="group">
    <label class="type-option"><input type="radio" name="article-type" value="review" checked onchange="onArticleTypeChange(this.value)"><span>Review Article</span></label>
    <label class="type-option"><input type="radio" name="article-type" value="original_research" onchange="onArticleTypeChange(this.value)"><span>Original Research</span></label>
    <label class="type-option"><input type="radio" name="article-type" value="perspective" onchange="onArticleTypeChange(this.value)"><span>Perspective</span></label>
  </div>
</div>
```

Add to `public/css/app.css`:
```css
.article-type-selector { display:flex; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
.type-option { flex:1; display:flex; align-items:center; justify-content:center; padding:6px 10px; font-size:0.8rem; font-weight:500; cursor:pointer; border-right:1px solid var(--border); }
.type-option:last-child { border-right:none; }
.type-option input[type="radio"] { display:none; }
.type-option:has(input:checked) { background:var(--ai); color:#fff; }
.type-option:not(:has(input:checked)):hover { background:var(--ai-light); }
```

---

## Implementation Order
1. `src/models/Article.js`
2. `src/routes/articles.js`
3. `src/services/sectionContext.js`
4. `src/routes/ai.js`
5. `public/js/app.js`
6. `index.html` + `public/css/app.css`

---

## Verification
1. Start dev server: `npm run dev`
2. Create a new article → Article Details panel shows 3-button type selector defaulting to "Review Article"
3. Switch to "Original Research" → section list changes to Abstract / Introduction / Methods / Results / Discussion / Conclusions / References; auto-saves
4. Generate the Methods section → prompt references study design/statistical analysis; journal hint shows NEJM/Lancet/JAMA (not Nat Rev)
5. Write content in Introduction, then generate Methods → Methods prompt includes a "Content already covered" block listing what the Introduction said
6. Use "Draft All Sections" on Original Research → each section after the first includes a "Previously generated sections" block in its prompt
7. Switch type back to "Review Article" → sections reset; prose for shared IDs (abstract, introduction, discussion, conclusions, references) is preserved
8. Load an old article (no `articleType` field) → defaults to Review Article with no errors
9. Run `npm test` — all existing tests pass
