# Sprint 4 — Core UX Overhaul (Highest Priority)

**Status:** Planned  
**Dates:** TBD  
**Priority tier:** Highest  
**Renumbered from:** Sprint 2 (was SPRINT-2.md)

## Goals

Deliver the four highest-impact UX changes that affect every user every session:
relocate export/utility controls to the preview pane, restructure article sections to a
universal 7-section model with AI-powered section recommendations, enable post-flow-check
targeted refinement, and fix DOCX text justification.

---

## Features in Scope

| ID | Feature | PRD Ref | Notes |
|---|---|---|---|
| F6-5 | Export controls moved to preview pane | F6-5 | ⬇ PDF, ⬇ DOCX, word count badge, Clear All relocated from global header to top of article preview |
| F6-4 | DOCX justified text | F6-4 | Set `AlignmentType.JUSTIFIED` on all body paragraphs in `docx` export |
| F2-1 | Restructure to 7 standard sections | F2-1 (update) | Remove 13 disease-specific sections; replace with: Abstract, Introduction, Main Body placeholder, Discussion, Conclusions, References. Migrate existing `getSectionContext()` and `state.sections` keys |
| F2-11 | AI section recommendations in Add Section modal | F2-11 | New `/api/suggest-sections` endpoint; modal shows ranked AI suggestions + free-text input |
| F3-10 | Refine from Flow Check recommendations | F3-10 | Each numbered recommendation in Flow Check output gets an "Apply to Section" button; pre-fills the Refine prompt for the relevant section |
| F3-12 | Visual AI confidence indicator | F3-12 | Color-coded bar below AI suggestion box (green/yellow/red based on PubMed source count); tooltip shows supporting PMIDs |
| F3-13 | Context grounding warning + strict mode | F3-13 | Warning when generating with no selected refs; optional strict mode toggle blocks generation entirely without sources |
| F6-6 | PDF export via Puppeteer | F6-6 | Server-side `POST /api/export-pdf-server`; html2pdf.js kept as client fallback |

---

## PR Sequence

| PR | Branch | Description |
|---|---|---|
| 1 | `feature/sprint4-preview-controls` | Move export buttons + word count + clear all to preview pane top bar |
| 2 | `feature/sprint4-docx-justify` | Apply justified alignment to DOCX body paragraphs |
| 3 | `feature/sprint4-section-restructure` | Replace 13 pre-defined sections with 7 standard sections; update server + frontend section maps |
| 4 | `feature/sprint4-ai-section-suggest` | `/api/suggest-sections` endpoint + Add Section modal UI update |
| 5 | `feature/sprint4-flowcheck-refine` | "Apply to Section" action on each Flow Check recommendation |
| 6 | `feature/sprint4-confidence-indicator` | Color-coded confidence bar + context grounding warning + strict mode toggle |
| 7 | `feature/sprint4-pdf-puppeteer` | Puppeteer PDF endpoint + html2pdf.js fallback logic |

---

## Architecture Notes

- **Section restructure (PR 3):** `getSectionContext()` in `src/services/sectionContext.js` (post-refactor) needs a new mapping for 7 section IDs. `SECTIONS` array in `public/app.js` updated to match. Existing articles saved in MongoDB use old section keys — migration script or graceful read fallback needed (old keys preserved as custom sections on load).
- **AI section suggestions (PR 4):** New `POST /api/suggest-sections` endpoint takes `{ topic, existingSections[] }` and returns `string[]` of suggested names. JSON response (no streaming needed).
- **Flow Check refinement (PR 5):** Flow Check result rendering must parse recommendation lines and attach section targets. Requires the AI to emit recommendations with a `[Section: <id>]` tag, or a post-processing regex.
- **Confidence indicator (PR 6):** Count `pubmedContext` references passed to each AI call. Map count → tier: 0 = red, 1–2 = yellow, 3+ = green. Return `confidenceTier` in response metadata alongside streamed text.
- **Puppeteer (PR 7):** Use `puppeteer-core` + system Chromium to avoid ~100MB binary overhead on Railway Hobby (512MB RAM limit).

---

## New Test Requirements

| File | Type | Covers |
|---|---|---|
| `tests/integration/ai.test.js` | Integration | All AI endpoints: happy path (mocked Groq stream), missing fields (400), Groq down (502), client disconnect |
| `tests/integration/export.test.js` | Integration | DOCX: happy path, empty sections, HTML entities, 50-section article; PDF endpoint mocked |
| `tests/unit/services/sectionContext.test.js` | Unit | All 13 section IDs return a non-empty prompt string; unknown ID returns a fallback |
| `tests/e2e/ai-generate.spec.ts` | E2E | Generate → apply; Improve; Expand to Prose; Key Points; Refine; confidence indicator visible |
| `tests/e2e/export.spec.ts` | E2E | DOCX download (verify filename + Content-Disposition header); PDF button triggers download |
| `tests/performance/ai-endpoints.perf.js` | Performance | `/api/generate`: 10 concurrent, 30s — establish baseline in `baselines.json` |

## Verification Checklist

- [ ] Header bar no longer shows PDF/DOCX buttons or Clear All — they appear in the preview pane top bar
- [ ] Total word count badge visible in preview pane top bar, updates live
- [ ] New article opens with 7 sections (Abstract, Introduction, Main Body, Discussion, Conclusions, References)
- [ ] "Add Section" modal shows AI-suggested section names based on Medical Topic
- [ ] Existing article opened from DB: old section keys show as custom sections, none are lost
- [ ] DOCX export: body text is visually justified in Word/LibreOffice
- [ ] Flow Check output: each numbered recommendation has "Apply to [Section]" button
- [ ] AI suggestion box shows color-coded confidence bar; tooltip shows source PMIDs
- [ ] Generating with no refs selected: warning displayed
- [ ] Strict mode ON + no refs: generate button disabled with explanation
- [ ] PDF via server Puppeteer: page breaks correct, tables don't split, headers/footers present
- [ ] PDF fallback: if server unavailable, html2pdf.js triggers automatically
