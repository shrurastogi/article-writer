# Sprint 7 — Article Planner (AI + Web Search)

**Status:** Planned  
**Dates:** Start 2026-04-09 | End TBD  
**Priority tier:** High

## Goals

Add a 3-step AI-powered Article Planner that runs **before** article creation. The planner
researches the topic (PubMed + optional web search), generates a structured article outline,
and produces a publication strategy. The output pre-populates a new article's sections so
the writer starts with a scaffold rather than a blank page.

---

## Features in Scope

| ID | Feature | PRD Ref | Notes |
|---|---|---|---|
| F22-1 | Web Search Service | F22-1 | Brave Search API (optional, free 2K/mo); falls back to PubMed + AI if key absent; never throws |
| F22-2 | Step 1 — Research & Literature Review | F22-2 | SSE endpoint; searches recent developments (2020–2026), FDA approvals, clinical trials, treatment landscape, efficacy/safety/outcomes |
| F22-3 | Step 2 — Article Structure Planning | F22-3 | SSE endpoint; article type + journal input; generates detailed outline with sections, figures/tables plan, citation strategy |
| F22-4 | Step 3 — Publication Strategy | F22-4 | SSE endpoint; journal shortlist with IF/scope/timeline, author guidelines summary, publication milestone timeline, data sharing requirements |
| F22-5 | Create Article from Plan | F22-5 | JSON endpoint; maps extracted section titles → pre-populated Article document; stores full planner output on article |
| F22-6 | Planner UI (`planner.html`) | F22-6 | Full-page 3-step wizard; left sidebar (inputs + step indicators + section editor); right pane (streamed markdown output per step, tabs, copy/download) |
| F22-7 | Dashboard entry point | F22-7 | "Plan Article" button on dashboard navigates to `/planner` |
| F22-8 | Article model: `plannerOutput` field | F22-8 | Stores step1/step2/step3 raw markdown + articleType + targetJournal + generatedAt; excluded from SUMMARY_FIELDS |

---

## PR Sequence

| PR | Branch | Description |
|---|---|---|
| 1 | `feature/sprint7-planner-backend` | Sprint doc, `webSearchService.js`, `routes/planner.js` (3 SSE + 1 create), `Article.js` model change, `app.js` registration, `.env.example` |
| 2 | `feature/sprint7-planner-frontend` | `planner.html`, `public/js/planner.js`, `public/css/planner.css` |
| 3 | `feature/sprint7-planner-dashboard` | Dashboard "Plan Article" button + `openPlanner()` in `dashboard.js` |
| 4 | `feature/sprint7-planner-tests` | Integration tests (planner routes), unit tests (webSearchService), `docs/API.md` update |

---

## Architecture Notes

### Web Search Service (`src/services/webSearchService.js`)
- `searchWeb(query, options) → { results: [{title, url, snippet}], source: "brave"|"pubmed"|"ai-only" }`
- Checks `process.env.BRAVE_SEARCH_API_KEY` at call time (not module load).
- Brave: `GET https://api.search.brave.com/res/v1/web/search?q=<query>&count=10`, header `X-Subscription-Token`.
- Fallback: reuses `fetchWithRetry` + `parsePubMedXML` from `pubmedService.js`.
- Total failure: returns `{ results: [], source: "ai-only" }`, never throws.

### Planner Routes (`src/routes/planner.js`)
Registered as `app.use("/api/planner", aiRateLimit, require("./routes/planner"))`.

All 3 SSE step endpoints follow the `/api/agent/draft` pattern:
- `Content-Type: text/event-stream`, `data: {JSON}\n\n` events
- Event types: `status` → `sources` → `chunk` (per token) → `complete` (with `rawText`) | `error`
- Model: `llama-3.3-70b-versatile`, `max_tokens: 2500` via `getClient()` from `llmService.js`

**Step 1 (`POST /api/planner/step1`)** — body: `{ topic, articleType, targetJournal }`
- Fires two `searchWeb` calls: `"<topic> clinical trial 2020 2025"` + `"<topic> FDA approved"`
- PubMed search for 8 abstracts
- Combined context capped at 7,000 chars
- Prompt sections: Recent Developments (2020–2026), FDA-Approved Therapies, Key Clinical Trials & Outcomes, Treatment Landscape, Efficacy/Safety/Patient Outcomes

**Step 2 (`POST /api/planner/step2`)** — body: `{ topic, articleType, targetJournal, step1Output }`
- No additional web search; `step1Output` truncated to 3,000 chars server-side
- Prompt sections: Article Type & Rationale, Target Journal Analysis (or 3 recommendations), Detailed Article Outline (`### Section Title` per section), Figures & Tables Plan, Citation Strategy

**Step 3 (`POST /api/planner/step3`)** — body: `{ topic, articleType, targetJournal, step1Output, step2Output }`
- Web search: `"<targetJournal || topic> journal impact factor submission guidelines"`
- `step1Output` truncated to 1,500 chars, `step2Output` to 2,000 chars
- Prompt sections: Journal Shortlist (3–5 journals), Author Guidelines Summary, Publication Timeline (milestone table), Supplementary Materials Plan, Data Sharing & Ethics

**Create Article (`POST /api/planner/create-article`)** — requires `requireApiAuth`
- Body: `{ topic, title, articleType, plannerOutput: {step1,step2,step3}, suggestedSections: [string] }`
- Maps `suggestedSections` → `{ [slugifiedTitle]: { prose: "", tables: [], notes: "" } }`
- Calls `Article.create(...)`, returns `{ article: { _id, title, topic } }` with 201

### Article Model Change (`src/models/Article.js`)
Add after `writingStyle` block:
```js
plannerOutput: {
  step1:         { type: String, default: "" },
  step2:         { type: String, default: "" },
  step3:         { type: String, default: "" },
  articleType:   { type: String, default: "" },
  targetJournal: { type: String, default: "" },
  generatedAt:   { type: Date },
},
```
Excluded from `SUMMARY_FIELDS`. No migration needed (Mongoose defaults handle existing docs).

### Planner UI (`planner.html` + `public/js/planner.js` + `public/css/planner.css`)

**Page layout (2-column desktop, single-column mobile):**
```
Left sidebar (320px):
  - Topic input (required)
  - Article Type dropdown (Review / Systematic Review / Meta-Analysis /
    Original Research / Case Report / Perspective / Clinical Practice Guideline)
  - Target Journal input (optional)
  - [Start Planning] button
  - Step indicators: ① Research  ② Structure  ③ Publication
    Status: pending (grey) / active (spinner) / done (✓) / error (✗)
  - Section editor: editable chip list (appears after Step 2 done)
  - [Create Article] button (appears after Step 3 done)

Right content (flex-fill):
  - Tab bar: Step 1 | Step 2 | Step 3
  - Streamed markdown output (rendered HTML)
  - [Copy] [Download .md]
```

**Client state machine (`planner.js`):**
- Steps chain automatically: Step 2 fires on Step 1 `complete`, Step 3 on Step 2 `complete`
- Prior outputs passed as request body (truncation server-side)
- Section titles extracted from Step 2 via regex: `/^###\s+(.+)$/gm` under `## Detailed Article Outline`
- Fallback: standard 7 sections if extraction yields nothing
- `activeReader` stored for cancellation via `cancelPlanning()`
- `renderMarkdown()`: inline converter for `##/###`, `- `, `**bold**`, pipe tables → no external lib

### App Registration (`src/app.js`)
Add (in the same block as `/dashboard`, before `express.static`):
```js
app.get("/planner", requireAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "../planner.html")));
app.use("/api/planner", aiRateLimit, require("./routes/planner"));
```

### Dashboard Change
`dashboard.html`: Add `<button class="btn btn-secondary" onclick="openPlanner()">Plan Article</button>` in header action row next to "New Article".  
`public/js/dashboard.js`: Add `function openPlanner() { window.location.href = "/planner"; }`.

### New Env Var (`.env.example`)
```
# Optional: Brave Search API — free 2,000 calls/mo at brave.com/search/api
# If absent, planner uses PubMed + AI knowledge only (no degraded UX)
BRAVE_SEARCH_API_KEY=
```

---

## New Test Requirements

| File | Type | Covers |
|---|---|---|
| `tests/integration/api/planner.test.js` | Integration | step1 streams + emits complete; step1 without topic → 400; step2 without step1Output → 400; step3 without step2Output → 400; create-article without auth → 401; create-article with valid body → 201 + article in DB; suggestedSections → correct sections keys on article |
| `tests/unit/services/webSearchService.test.js` | Unit | Brave key set + mocked fetch → source: "brave"; no key → falls back to PubMed; both fail → source: "ai-only", no throw |

---

## Verification Checklist

- [ ] `/planner` unauthenticated → redirect to `/login`
- [ ] "Start Planning" disabled with empty topic
- [ ] All 3 steps stream and render markdown; step indicators update correctly
- [ ] Without `BRAVE_SEARCH_API_KEY`: all steps complete via PubMed + AI only
- [ ] With `BRAVE_SEARCH_API_KEY`: `sources` SSE event shows `source: "brave"`
- [ ] Step error: toast shown, indicator red, subsequent steps do not start
- [ ] Step 2 section chips editable (add/remove) before article creation
- [ ] "Create Article" → article in MongoDB with `plannerOutput.step1/2/3` + pre-built sections → redirect to editor
- [ ] Dashboard "Plan Article" button navigates to `/planner`
- [ ] Dark mode on planner page correct (CSS variables)
- [ ] Rate limiter: excessive requests → 429
- [ ] `npm test` passes; coverage thresholds maintained
