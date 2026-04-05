# Sprint 4 — Core UX Overhaul: Implementation Plan

## Context

Sprint 4 was planned with 7 PRs. A codebase audit shows that **5 of 7 planned features already shipped in Sprint 2**. Only 3 features remain plus a test coverage gap.

**Already done — skip:**
| Feature | Where |
|---|---|
| F6-5: Export controls in preview pane | `index.html:126-132` |
| F6-4: DOCX justified text | `src/services/exportService.js:73` |
| F2-11: AI section recommendations | `public/js/app.js:906-944` |
| F3-10: "Apply to Section" from Flow Check | `public/js/app.js:340-413` |
| Section restructure (7 standard sections) | `public/js/app.js:2-9` |

**Decisions:** Features first → tests last. Puppeteer PDF included; test on Railway dev before merging to prod.

---

## PR 1 — `feature/sprint4-confidence-indicator`

**Goal:** Color-coded bar under each section's AI buttons showing how many library refs are selected.

**Rules:** 0 refs = red | 1–2 = yellow | 3+ = green. Updates live when library selection changes.

**Files:**
- `public/js/app.js`
  - Add `renderConfidenceBars()` — reads `state.library.filter(e=>e.selected).length`, sets bar class + text for every section
  - Call `renderConfidenceBars()` from: `renderLibrary()`, `toggleLibrarySelect()`, `removeFromLibrary()`, `selectAllLibrary()`
  - In `renderSections()` template string: add `<div class="confidence-bar" id="conf-${s.id}"></div>` inside `.section-ai-actions` div
- `public/css/app.css`
  - `.confidence-bar { font-size:0.73rem; padding:3px 8px; border-radius:10px; margin-top:6px; display:inline-block; }`
  - `.conf-red { background:#fee2e2; color:#dc2626; }`
  - `.conf-yellow { background:#fef9c3; color:#b45309; }`
  - `.conf-green { background:#dcfce7; color:#16a34a; }`

**No backend changes. No new tests** (DOM-only).

---

## PR 2 — `feature/sprint4-context-grounding`

**Goal:** Warn when generating with no refs selected. Optional strict mode blocks generation entirely.

**Files:**
- `index.html`
  - Add to Article Details panel (after keywords `<div class="form-group">`):
    ```html
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
      <input type="checkbox" id="strict-mode-toggle" />
      <label for="strict-mode-toggle" style="margin:0;font-size:0.82rem;color:var(--secondary)">
        Strict mode — require references for AI generation
      </label>
    </div>
    ```
- `public/js/app.js`
  - Add helpers:
    - `isStrictMode()` → `document.getElementById('strict-mode-toggle')?.checked`
    - `hasSelectedRefs()` → `state.library.some(e => e.selected)`
  - Guard in `generateDraft()`, `improveSection()`, `expandToProse()`, `getKeyPoints()` — before `streamToAiBox()`:
    ```js
    if (isStrictMode() && !hasSelectedRefs()) {
      showToast("Strict mode: select at least one reference first.", "error");
      return;
    }
    if (!hasSelectedRefs()) {
      // show inline warning in the ai-box but continue
      // set a flag so streamToAiBox prepends the warning
    }
    ```
  - Modify `streamToAiBox()` — accept optional `warn` param; if truthy, show amber warning line above streamed content
  - `renderSections()` and `renderConfidenceBars()` — when strict mode ON + no refs, add `disabled` to Generate/Improve/Key Points/Expand buttons; remove on toggle
  - Add `strict-mode-toggle` change listener → call `renderConfidenceBars()` + update button states
- `public/css/app.css`
  - `.grounding-warning { background:#fffbeb; border:1px solid #fcd34d; color:#92400e; border-radius:6px; padding:6px 10px; font-size:0.8rem; margin-bottom:8px; }`

**No backend changes. No new tests** (frontend-only).

---

## PR 3 — `feature/sprint4-pdf-puppeteer`

**Goal:** Server-side PDF via Puppeteer. html2pdf.js kept as automatic client fallback.

**Install:** `npm install puppeteer-core`

**New file: `src/services/pdfService.js`**
```js
"use strict";
const puppeteer = require("puppeteer-core");

async function generatePdf(html) {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdf = await page.pdf({
    format: "A4", printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
  });
  await browser.close();
  return pdf;
}
module.exports = { generatePdf };
```

**Update `src/routes/export.js`** — add endpoint:
```js
router.post("/export-pdf-server", async (req, res) => {
  const { html, title } = req.body;
  if (!html?.trim()) return res.status(400).json({ error: "No HTML provided." });
  try {
    const buffer = await generatePdf(html);
    const filename = `${(title || "article").replace(/[^a-zA-Z0-9\s]/g,"").replace(/\s+/g,"_").slice(0,60)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    logger.error({ msg: "PDF export error", error: err.message });
    res.status(500).json({ error: "PDF generation failed: " + err.message });
  }
});
```

**Update `public/js/app.js` — `downloadPDF()`:**
```js
async function downloadPDF() {
  const title = document.getElementById("article-title").value || "article";
  const html = document.getElementById("article-preview").innerHTML;
  showToast("Generating PDF...");
  try {
    const resp = await fetch("/api/export-pdf-server", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, title }),
    });
    if (!resp.ok) throw new Error("server unavailable");
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9\s]/g,"").replace(/\s+/g,"_").slice(0,60)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("PDF downloaded!", "success");
  } catch {
    // Fallback to html2pdf.js (existing logic)
    _downloadPDFFallback(title);
  }
}

function _downloadPDFFallback(title) {
  const el = document.getElementById("article-preview");
  const opt = { margin:0, filename:`${title.replace(/[^a-zA-Z0-9\s]/g,"").replace(/\s+/g,"_").slice(0,60)}.pdf`,
    image:{type:"jpeg",quality:0.98}, html2canvas:{scale:2,useCORS:true},
    jsPDF:{unit:"mm",format:"a4",orientation:"portrait"}, pagebreak:{mode:["avoid-all","css","legacy"]} };
  html2pdf().set(opt).from(el).save().then(() => showToast("PDF downloaded!", "success"));
}
```

**Railway env var:** Add `CHROMIUM_PATH=/usr/bin/chromium-browser` to Railway dev project env vars. Verify memory stays under 512MB under load.

**Files:**
- `src/services/pdfService.js` (new)
- `src/routes/export.js` (add endpoint + import pdfService)
- `public/js/app.js` (refactor `downloadPDF()`, extract `_downloadPDFFallback()`)
- `package.json` (add `puppeteer-core`)

---

## PR 4 — `feature/sprint4-test-coverage`

**Goal:** Fill coverage gaps for AI routes and export routes.

**New file: `tests/integration/api/ai.test.js`**
- Mock `getClient()` in `src/services/llmService.js` using jest.mock
- Fake stream: return a ReadableStream that yields `"test content"` then closes
- Test cases:
  - `POST /api/generate` — 200 streams; 400 when `topic` missing
  - `POST /api/improve` — 200 streams; 400 when `content` missing
  - `POST /api/keypoints` — 200 streams; 400 when `topic` missing
  - `POST /api/refine` — 200 streams; 400 when `instruction` missing
  - `POST /api/coherence-check` — 200 streams; 400 when `sections` empty/missing
  - `POST /api/generate-table` — 200 streams; 400 when `tableDescription` missing

**New file: `tests/integration/api/export.test.js`**
- DOCX tests (no mocking needed — docx package is pure JS):
  - `POST /api/export-docx` happy path — 200, correct Content-Type header
  - Empty sections array — still returns 200
  - Sections with table HTML — buffer returned without error
- PDF tests (mock `pdfService.generatePdf`):
  - `POST /api/export-pdf-server` — mock returns Buffer, 200 with `application/pdf`
  - Missing `html` body — 400
  - `generatePdf` throws — 500 with error JSON

**Pattern to follow:** `tests/integration/api/suggest-sections.test.js` — uses `process.env.NODE_ENV = "test"` + `require('../../../src/app')` + supertest.

---

## File Reference Map

| File | PR | Type |
|---|---|---|
| `public/js/app.js` | 1, 2, 3 | Modify |
| `public/css/app.css` | 1, 2 | Modify |
| `index.html` | 2 | Modify (add checkbox) |
| `src/services/pdfService.js` | 3 | New |
| `src/routes/export.js` | 3 | Modify (add endpoint) |
| `package.json` | 3 | Modify (add dep) |
| `tests/integration/api/ai.test.js` | 4 | New |
| `tests/integration/api/export.test.js` | 4 | New |

---

## Repo Plan Document

Save as `docs/sprints/SPRINT-4-PLAN.md` (same content as this file, written at sprint start).

---

## Verification

| PR | How to verify |
|---|---|
| 1 | Railway dev: select 0/1/3 refs → bar under each section changes color |
| 2 | Strict ON + no refs → Generate blocked. Strict OFF + no refs → amber warning shown above AI output |
| 3 | Click PDF → server route called first, file downloads; kill endpoint → html2pdf.js fallback triggers |
| 4 | `npm test` — all tests pass; new AI + export tests visible in output |
