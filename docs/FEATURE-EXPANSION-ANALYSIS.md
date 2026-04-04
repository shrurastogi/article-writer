# Feature Expansion Analysis — Medical Article Writer
**Date:** 2026-04-04 | **Last updated:** 2026-04-04  
**Status:** Decisions complete — ready for PRD update

---

## Context

The user has proposed 13 potential enhancements to the Medical Article Writer app. This document maps each item against what already exists in the PRD / sprint backlog, assesses what is net-new, and makes a recommendation for each. No PRD edits have been made yet.

**Current state:**
- Sprint 1 (Auth + Storage + Dashboard) — COMPLETE
- Sprint 2 (Core UX Overhaul) — PLANNED (not started)
- Sprint 3 (Dashboard + Editor Enhancements) — PLANNED (not started)
- Sprint 4 (Collaboration, Versioning, BYOK) — PLANNED (not started)
- PRD features F1–F6 shipped; F10, F11, F12 partially shipped (Sprint 1); F13 planned in Sprint 4

---

## Item-by-Item Analysis

---

### 1. Versioning of Documents
**PRD Status:** Partially planned — F11-11 in Sprint 4  
**What's planned:**
- Auto-save snapshots to `ArticleVersion` collection (Mongoose model)
- Capped at 50 versions per article
- 5-minute interval trigger (with change detection)
- Restore via prior state snapshot
- New endpoint: `GET /api/articles/:id/versions`, `POST /api/articles/:id/versions/:vid/restore`

**Gaps (not yet designed):**
- Version labeling / naming by user ("Before major edit", "Submitted to journal")
- Diff view between versions
- Manual "save version" button (vs only auto-interval)
- Version deletion

**Recommendation:** Already in backlog. Enhance scope when implementing Sprint 4 to include manual save + user labels. Add diff view as stretch goal in a later sprint.

**PRD action:** Expand F11-11 — add manual versioning, labels, and diff view as sub-items.

---

### 2. Cloning Capability
**PRD Status:** NOT in PRD, NOT in any sprint  
**Description:** Duplicate an existing article to use as a template for a new one (e.g., reuse structure for a different disease topic)

**Technical complexity:** Low — shallow copy of the article document with a new `_id` and modified title ("Copy of …"), reset `createdAt`/`updatedAt`, same owner

**Recommendation:** ADD to PRD as F11-13, implement in Sprint 3 alongside other dashboard enhancements (it's a dashboard action). One PR, ~1 day effort.

**PRD action:** New feature F11-13: Clone Article (dashboard action, one-click, renames to "Copy of …", opens in editor)

---

### 3. Sharing and Collaboration
**PRD Status:** Partially planned — F11-12 in Sprint 4  
**What's planned:**
- Share link (UUID v4 `shareToken` on Article model)
- Collaborator list with roles on Article model
- Public read-only route `/share/:token` (no auth)
- Last-write-wins for concurrent edits (no real-time)

**Gaps / open questions from Sprint 4:**
- Q10: Concurrent editing strategy — current plan is last-write-wins (no OT/CRDT)
- No comment/annotation system
- No email invite for collaborators
- No notification when co-author makes changes

**Real-time collaboration (e.g., Google Docs style)** would require WebSockets (Socket.io) or CRDTs — significant architectural change, high effort.

**Recommendation:** Proceed with Sprint 4 plan (read-only share link + named collaborators, last-write-wins). Add a note to PRD that real-time concurrent editing is a future consideration (F11-12-RT) requiring WebSocket infrastructure. Do NOT attempt real-time in Sprint 4.

**PRD action:** Confirm F11-12 scope. Add F11-12-RT as a future item flagged as "requires architecture decision."

---

### 4. Settings Tab — API Keys (LLM, NCBI, Dimensions)
**PRD Status:** Partially planned — F13-1 (BYOK LLM keys) and F13-2 (model selector) in Sprint 4  
**What's planned:**
- User enters provider API key in settings UI
- Key encrypted AES-256-GCM before storage
- `user.llmConfig: { provider, encryptedApiKey, model }`
- Fallback to server env key if user has none

**Gaps:**
- NCBI API key management (raises PubMed rate limit from 3 to 10 req/s) — NOT planned
- **Dimensions API** — NOT in PRD at all. Dimensions.ai is a bibliometric database (alternative to PubMed for non-biomedical research). Requires separate API access and authentication.
- Single settings UI that consolidates all keys — not explicitly designed

**Recommendation:**
- ADD NCBI key to the settings UI (low effort — just an extra field stored in `user.llmConfig` or a separate `user.researchConfig` object)
- ADD Dimensions API as a new data source feature (F14-1). Requires Dimensions API credentials (free academic tier available). Medium effort — new search endpoint + result mapping.
- Design a proper "Settings" page/modal (not just a BYOK dialog) that groups: LLM Config, Research APIs, UI Preferences

**PRD action:** Expand F13 into a proper "Settings" feature group. Add Dimensions as F14 (Research Integrations). Add NCBI key as F13-3.

---

### 5. Multiple LLM Models + Dark/Light Mode + Font Zoom
**PRD Status:** Multi-model partially planned (F13-2 in Sprint 4). Dark mode and font zoom are NOT in PRD.

**Multi-model (F13-2 planned):**
- Provider dropdown + model dropdown
- Dynamic model list via `GET /api/llm/models`
- Current plan covers Groq models

**Gaps for multi-provider:**
- **OpenAI** — different SDK (`openai` package, same we already use for Groq proxy) — LOW effort to add
- **Anthropic/Claude** — requires `@anthropic-ai/sdk`, different streaming format — MEDIUM effort
- **Google Gemini** — requires `@google/generative-ai` SDK, different streaming format — MEDIUM effort
- **OpenRouter** — OpenAI-compatible API (like Groq) — LOW effort (just change base URL + key)
- Each provider needs its own streaming adapter on the server

**Dark/Light Mode:**
- Currently uses hardcoded GSK brand colors (orange #F36633, navy #1A1F71) via CSS variables
- Adding a theme system: add `data-theme` attribute to `<html>`, toggle CSS variable sets
- LOW-MEDIUM effort. Conflicts with GSK brand guidelines (RULES.md mandates GSK colors) — needs decision: is dark mode a "theme" alongside the GSK light theme, or does it override brand colors?

**Font Zoom:**
- Increase/decrease base font size via a CSS variable (`--base-font-size`)
- LOW effort. Could also use browser native zoom (Ctrl+/- already works)

**Recommendation:**
- Multi-model: Implement in Sprint 4 as planned, but scope to include OpenAI + OpenRouter in addition to Groq (all use same OpenAI-compatible API). Claude and Gemini as stretch Sprint 5 items.
- Dark mode: ADD to PRD as F15-1 (UI Themes). Needs a design decision on GSK brand compliance.
- Font zoom: ADD to PRD as F15-2 (Accessibility). Low effort, high value for medical writers.

**PRD action:** Add F15 "UI Preferences" group with dark mode (F15-1) and font size control (F15-2). Expand F13-2 to explicitly include OpenAI + OpenRouter.

---

### 6. Document Upload, PDF Extraction, Embeddings & RAG Pipeline
**PRD Status:** NOT in PRD, NOT planned anywhere  
**This is a major new capability:**

**Sub-components:**
1. **Document upload** — Upload PDF/Word files, store server-side (file system or cloud blob)
2. **PDF text extraction** — Parse uploaded PDFs to extract text (`pdf-parse` npm package, free)
3. **Embeddings** — Vectorize text chunks for semantic search (requires embedding model)
4. **Vector store** — Store and query embedding vectors
5. **RAG pipeline** — Retrieve relevant chunks and inject into AI prompts as context

**Free vector store options:**
- **Chroma** — open-source, runs locally (Python or JS client), zero cost, best for local dev
- **Qdrant** — open-source, self-hosted via Docker, production-ready, free tier on Qdrant Cloud
- **Weaviate** — open-source, self-hosted or free cloud sandbox, good filtering support
- **pgvector** — PostgreSQL extension (would require migrating from MongoDB, but zero extra infra if on Postgres)
- **LanceDB** — embedded, no server needed, JavaScript-native, good for a Node.js app like this

**Free embedding models:**
- **nomic-embed-text** via Ollama (local, free)
- **text-embedding-3-small** via OpenAI (paid but cheap — ~$0.02/1M tokens)
- **Groq** does not currently offer embedding endpoints
- **Hugging Face Inference API** — free tier for models like `BAAI/bge-small-en`

**Recommended stack for this app:** LanceDB (embedded, no extra server) + Hugging Face Inference API for embeddings + `pdf-parse` for extraction. Entire pipeline stays in Node.js.

**Effort:** HIGH — 2–3 sprints. Requires new data model for "uploaded documents", chunking strategy, embedding pipeline, retrieval logic, and UI for upload + RAG context display.

**Recommendation:** ADD as F16 (Document Intelligence & RAG). Plan in a dedicated sprint (Sprint 5 or 6). Start with PDF extraction + keyword search before adding full vector RAG.

---

### 7. Run Check Functionality Improvement
**PRD Status:** The `POST /api/coherence-check` endpoint exists and is implemented. No improvements planned in any sprint.

**Current state:**
- Reviews coherence, transitions, terminology consistency
- Returns Overall Assessment + Section-by-Section + Issues + Recommendations
- Sprint 2 adds "Apply to Section" buttons on recommendations

**Potential improvements:**
- **Grammar/style check** — beyond coherence (e.g., passive voice, sentence length)
- **Journal-specific formatting checks** — does the paper meet NEJM/Lancet style guide rules?
- **Plagiarism check** — compare against known sources (requires external API, e.g., iThenticate — paid)
- **Statistical reporting check** — verify p-values, confidence intervals are reported correctly
- **EQUATOR checklist validation** — structured reporting guidelines (CONSORT, PRISMA, STROBE)
- **Reference format validation** — check Vancouver format compliance
- **Word count compliance** — warn if abstract > 250 words, etc.

**Recommendation:** ADD F17 "Advanced Paper Quality Checks" to PRD. Prioritize:
1. Grammar/style (F17-1) — can be done with Groq, no new dependencies
2. EQUATOR checklist (F17-2) — high clinical value
3. Journal-specific checks (F17-3) — medium effort, very high value for researchers

---

### 8. Making It Agentic
**PRD Status:** NOT in PRD, NOT planned  
**This is the most architecturally significant change proposed.**

**What "agentic" means here:** Instead of the user manually clicking buttons for each section, an orchestrating AI agent decomposes the task, calls sub-agents, and produces a complete draft with minimal intervention.

**Proposed agent architecture:**

| Agent | Role | Tools |
|---|---|---|
| **Planner** | Decomposes the article into tasks, sets order | Reads topic + brief, creates task list |
| **Researcher** | Searches PubMed, fetches full texts, selects relevant papers | PubMed search/fetch APIs |
| **Generator** | Writes each section using retrieved context | AI generation endpoints |
| **Validator** | Reviews coherence, grammar, citations | Coherence check + quality checks |
| **Formatter** | Applies formatting, syncs references, prepares export | Export endpoints |

**Framework options:**

| Framework | Cost | Language | Notes |
|---|---|---|---|
| **LangChain.js** | Free/OSS | JavaScript | Mature, many integrations, large community |
| **LlamaIndex.TS** | Free/OSS | TypeScript | Strong RAG + agent support, better for document workflows |
| **Mastra** | Free/OSS | TypeScript | New, designed for production agents, built-in workflows |
| **CrewAI** | Free/OSS | Python | Best multi-agent orchestration, but requires Python service |
| **Anthropic Claude Agent SDK** | Free (via API cost) | JavaScript | Native tool-use + streaming, pairs well with Claude models |
| **OpenAI Assistants API** | Paid (API cost) | Any | Managed threads/state, file retrieval built-in |

**Recommended approach:** Use **Mastra** (TypeScript, built for production) or **LangChain.js** for the orchestration layer. Keep existing Express endpoints as tools the agents call. Add a new `/api/agent/run` endpoint that accepts a topic + brief and streams agent progress to the UI.

**Effort:** VERY HIGH — 3–4 sprints. Requires redesigning the UX to show agent progress, handling partial failures, and streaming multi-step updates.

**Recommendation:** ADD F18 "Agentic Writing Pipeline" to PRD as a future milestone. Both modes coexist permanently — manual/incremental mode (current) stays untouched; agent mode is an additional entry point with human-in-the-loop feedback checkpoints at each step.

---

### 9. Locking a Finalized Paper
**PRD Status:** F11-10 in Sprint 4 plans a "View (read-only) mode" per article — this is closely related but not identical.

**Planned (F11-10):** Explicit View and Edit buttons per article on dashboard. View mode = all inputs/textareas disabled, no AI buttons visible.

**Gaps from "lock" concept:**
- No explicit "Lock" action distinct from "View mode"
- No lock indicator in the editor header
- No unlock flow (who can unlock? — just the owner? any collaborator with Edit role?)
- View mode is a transient UI state; "lock" implies a persistent, intentional state stored in DB (`article.isLocked: Boolean`)

**Recommendation:** Expand F11-10 to include an explicit lock/unlock action:
- Add `isLocked` flag to Article model
- Dashboard and editor show a lock icon when locked
- All editing disabled when locked (same as view mode)
- Only article owner can lock/unlock
- Locked articles cannot be auto-saved (prevent accidental overwrites)

**PRD action:** Expand F11-10 to "View Mode + Article Locking."

---

### 10. PDF Export Rendering Fix
**PRD Status:** NOT addressed in any sprint. This is a known issue.

**Current implementation:** `html2pdf.js` (CDN), renders `#article-preview` in-browser

**Known problems with html2pdf.js:**
- No native support for page breaks (custom CSS `page-break-*` needed)
- Tables often split across pages
- Font rendering inconsistencies
- No headers/footers (page numbers, journal name)
- SVG/complex CSS may not render correctly

**Better alternatives:**

| Solution | Approach | Pros | Cons |
|---|---|---|---|
| **Puppeteer** (server-side) | Headless Chrome renders HTML → PDF | Pixel-perfect, headers/footers, page numbers | Heavy (~130MB), needs server |
| **WeasyPrint** | Python server renders HTML/CSS → PDF | Excellent CSS support, academic formatting | Requires Python service |
| **PDFKit** (Node.js) | Programmatic PDF generation | Lightweight, full control | Manual layout — very verbose |
| **@react-pdf/renderer** | React component → PDF | Clean API | Requires React (breaking change for this app) |
| **Playwright** | Like Puppeteer but multi-browser | Reliable, maintained | Even heavier |
| **pdf-lib** | Manipulate existing PDFs | Good for merging/annotating | Not for HTML → PDF |

**Decision (D2):** Puppeteer as primary server-side renderer (`POST /api/export-pdf-server`) + keep html2pdf.js as client-side fallback when server unavailable.

**PRD action:** Add F6-6 (Improved PDF Export via Puppeteer).

---

### 11. Multilingual Support
**PRD Status:** NOT in PRD, NOT planned

**Two dimensions:**
1. **Application UI language** — labels, buttons, tooltips in other languages (i18n)
2. **Content generation language** — AI generates article content in a non-English language

**Application i18n:**
- Requires extracting all UI strings into a locale file (`en.json`, `es.json`, etc.)
- Library options: `i18next` (JS, free), `Fluent.js` (Mozilla, free)
- Moderate effort: ~200-300 strings to extract from index.html
- GSK brand colors/logo unchanged; only text localizes

**Content generation:**
- Much simpler: pass a `language` parameter to AI endpoints
- Add "Output Language" dropdown to article metadata
- Inject language instruction into all system prompts ("Respond in Spanish at a clinical academic level")
- PubMed search still returns English abstracts; AI would translate/synthesize

**Medical multilingual considerations:**
- Clinical terminology differs by language (some terms untranslatable)
- Some journals require specific language variants (e.g., European vs. Latin American Spanish)
- Regulatory submissions may mandate specific language templates

**Recommendation:** ADD F19 "Multilingual Support" to PRD. Phase 1: content language selector (low effort, high value). Phase 2: UI localization (medium effort, lower priority for medical professionals who typically work in English).

---

### 12. Additional UX & Research Improvements (Suggestions)

Features not in the user's list that would add significant value:

**Research Enhancement:**
- **Dimensions.ai integration** (see item 4) — broader coverage than PubMed (all disciplines)
- **Semantic Scholar API** — free, excellent citation graph and related-work suggestions
- **CrossRef API** — free DOI lookup, metadata enrichment for non-PubMed references
- **Citation graph visualization** — show how papers are connected (D3.js, free)
- **ORCID integration** — auto-fill author affiliations from ORCID profiles

**Writing Quality:**
- **Journal target selector** — user picks target journal, AI adjusts style + word limits
- **Abstract word count enforcer** — visual warning when abstract exceeds 250 words
- **Section-level progress tracker** — completion percentage per section
- **AI confidence indicators** — show when AI is generating from limited context vs. rich PubMed context

**Workflow:**
- **Template library** — pre-configured article templates (RCT, systematic review, case report, editorial)
- **Co-author invitation via email** — goes beyond the share-link model in Sprint 4
- **Export to LaTeX** — critical for many journals (Elsevier, Springer)
- **Endnote/Zotero/Mendeley sync** — import existing reference libraries
- **Submission checklist** — per-journal checklist before download (cover letter, conflict of interest, data availability)

**UX Polish:**
- **Keyboard shortcuts** — Ctrl+G to generate, Ctrl+Enter to apply, etc.
- **Section reordering via drag-and-drop** — currently no way to reorder sections
- **Word count targets** — set a target word count per section; show progress bar
- **Article timeline** — visual changelog of AI vs human edits over time

---

### 13. Competitor Analysis

**Free tools:**

| Tool | Type | Strengths | Weaknesses |
|---|---|---|---|
| **Jenni.ai** | AI writing assistant | Good autocomplete, citation support | Not specialized for medical/academic, limited free tier |
| **SciSpace (Typeset)** | Academic writing | Journal formatting, collaboration | No agentic generation, limited AI depth |
| **Consensus** | AI research synthesis | Excellent paper summarization | No document editor |
| **Elicit** | AI research assistant | Strong literature synthesis | No full article writing |
| **ResearchRabbit** | Citation discovery | Graph-based discovery | No writing |
| **Mendeley** | Reference manager | Free, widely used | No AI writing |
| **Google Scholar + Bard** | General | Free | Not specialized |

**Paid tools:**

| Tool | Price | Strengths | Weaknesses |
|---|---|---|---|
| **Manuscript.ai** | ~$30/mo | Medical-specific, structured | Expensive, limited customization |
| **Writefull** | ~$15/mo | Academic language quality | No AI generation, only editing |
| **Paperpal** | ~$12/mo | Academic writing + grammar | Not PubMed-native |
| **Scrivener** | $50 one-time | Powerful writing environment | No AI, no medical focus |
| **Overleaf** | Free + paid | LaTeX collaboration | No AI integration |
| **Copilot in Word** | M365 subscription | Familiar UX | Not medical-specific, no PubMed |

**What this app has that competitors don't:**
1. Direct PubMed integration with full-text OA enrichment
2. Medical section templates grounded in clinical structure
3. Streaming AI with undo per section
4. Combined reference library + AI generation in one tool
5. Flow checker (coherence analysis across sections)
6. Server-side DOCX export with tables

**What competitors have that this app lacks:**
1. LaTeX export (Overleaf, SciSpace)
2. Real-time collaboration (Google Docs, SciSpace)
3. Journal-specific formatting templates (SciSpace, Manuscript.ai)
4. Citation graph discovery (ResearchRabbit, Semantic Scholar)
5. Grammar/language quality checker (Writefull, Paperpal)
6. ORCID integration (many)
7. Submission portal integration (none yet)
8. Mobile app (none do this well)

---

## Recommended PRD Additions Summary

| New Feature ID | Feature | Priority | Effort | Sprint Target |
|---|---|---|---|---|
| F11-13 | Clone Article | High | Low | Sprint 3 |
| F11-10 expanded | Article Locking (expand view mode) | High | Low | Sprint 4 |
| F11-11 expanded | Versioning: manual save + labels + diff | Medium | Medium | Sprint 4 |
| F11-12 noted | Real-time collaboration (future) | Low | Very High | Sprint 6+ |
| F13-2 expanded | Multi-model: add OpenAI + OpenRouter | High | Low | Sprint 4 |
| F13-3 | NCBI API key in settings | Medium | Low | Sprint 4 |
| F14 | Dimensions API integration | Medium | Medium | Sprint 5 |
| F14-2 | Semantic Scholar integration | Medium | Low | Sprint 5 |
| F15-1 | Dark/Light mode | Medium | Low | Sprint 3 |
| F15-2 | Font size control (accessibility) | Medium | Low | Sprint 3 |
| F16 | Document upload + PDF extraction | Medium | High | Sprint 5 |
| F16-R | RAG pipeline (vector embeddings) | Low | Very High | Sprint 6+ |
| F17-1 | Grammar/style check | High | Low | Sprint 3 |
| F17-2 | EQUATOR checklist validation | Medium | Medium | Sprint 5 |
| F17-3 | Journal-specific formatting check | Medium | Medium | Sprint 5 |
| F18 | Agentic writing pipeline | Low | Very High | Sprint 6+ |
| F19-1 | Content language selector | Medium | Low | Sprint 3 |
| F19-2 | UI localization (i18n) | Low | Medium | Sprint 6+ |
| F6-6 | Puppeteer PDF export (fix rendering) | High | Medium | Sprint 2 or 3 |
| F20-1 | LaTeX export | Medium | Medium | Sprint 5 |
| F20-2 | Section drag-and-drop reorder | Medium | Low | Sprint 3 |
| F20-3 | Journal target selector | Medium | Medium | Sprint 5 |
| F20-4 | Keyboard shortcuts | Low | Low | Sprint 3 |

---

## Decisions (Recorded 2026-04-04)

**D1 — Dark mode:** GSK-compliant dark theme. Dark backgrounds with GSK orange (#F36633) and navy (#1A1F71) as accent colors. RULES.md must be updated to allow a dark theme variant. CSS variable sets for `[data-theme="dark"]`.

**D2 — PDF export fix:** Puppeteer as primary server-side renderer + keep html2pdf.js as client-side fallback when server unavailable. Both coexist. New endpoint `POST /api/export-pdf-server`.

**D3 — Agentic pipeline:** Both modes coexist permanently:
- **Human/Manual mode** (current flow) — user incrementally builds the article section by section. Stays as-is, never removed.
- **Agent mode** (new) — user triggers a full-article agent run with human-in-the-loop feedback checkpoints (approve/reject each step before proceeding). Sprint 5: one-click sequential draft (no true agents). Sprint 6+: true agents (Planner + Researcher + Generator + Validator) with human feedback at each stage.

**D4 — Collaboration:** Both planned:
- Sprint 4: Last-write-wins (share link + named collaborators, one at a time).
- Sprint 6: Real-time collaboration (Socket.io + CRDT). Architecture spike to be included in Sprint 4 docs as a future design note.

**D5 — RAG scope:** Private uploaded documents + public sources. Users can upload their own PDFs/Word files AND query PubMed/Dimensions. Requires file storage (local filesystem initially, cloud blob later).

**D6 — LLM providers:** All 5 providers planned, prioritized across sprints:
- Sprint 4: Groq + OpenAI + OpenRouter (all OpenAI-compatible API format, low effort)
- Sprint 5: Claude (Anthropic SDK) + Gemini (Google SDK) — separate adapters needed
- All providers accessible via the Settings tab with BYOK

**D7 — Dimensions API:** To be confirmed. User to check institutional access. Free academic tier available at dimensions.ai.

---

## Dev / Prod Environment Setup (Added 2026-04-04)

**Current state:** Single `.env` file used for everything. `NODE_ENV` is set inside `.env`. `.gitignore` only ignores `.env`.

**Goal:** Separate dev and prod configs so that local development never touches production MongoDB, prod Google OAuth callback, or prod secrets.

### File structure

```
.env                 # Production secrets (already exists, stays as-is, gitignored)
.env.development     # Dev overrides — local MongoDB, localhost callback, debug logging (gitignored)
.env.example         # Template updated to document both environments (tracked in git)
```

### Key differences between environments

| Variable | Development | Production |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| `MONGODB_URI` | `mongodb://localhost:27017/article-writer-dev` | Atlas URI or hosted Mongo |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3000/auth/google/callback` | `https://yourdomain.com/auth/google/callback` |
| `SESSION_SECRET` | Any local string | Long random hex (32+ bytes) |
| `LOG_LEVEL` | `debug` | `info` |
| `PORT` | `3000` | As set by host (e.g. `8080`) |

### Changes required

**1. `server.js` line 1** — load env file based on `NODE_ENV`:
```js
// Before
require("dotenv").config();

// After
const _envFile = process.env.NODE_ENV === "production" ? ".env" : `.env.${process.env.NODE_ENV || "development"}`;
require("dotenv").config({ path: _envFile });
```
This is fully backward-compatible: production still loads `.env`, dev loads `.env.development`.

**2. `package.json` scripts** — add `dev` script:
```json
"scripts": {
  "start": "NODE_ENV=production node server.js",
  "dev":   "NODE_ENV=development node server.js",
  "lint":  "eslint server.js",
  "test":  "jest --runInBand",
  ...
}
```

**3. `.gitignore`** — extend to cover all env files except `.example`:
```
.env
.env.*
!.env.example
```

**4. Create `.env.development`** (never committed):
```env
NODE_ENV=development
PORT=3000
GROQ_API_KEY=your_dev_groq_key
MONGODB_URI=mongodb://localhost:27017/article-writer-dev
SESSION_SECRET=dev-only-not-secret
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
NCBI_API_KEY=
LOG_LEVEL=debug
```

**5. Update `.env.example`** — document both environments with comments showing which values differ between dev and prod.

### Notes
- `NODE_ENV=test` is already handled by existing test setup (mongodb-memory-server, Jest). No `.env.test` needed — tests mock the DB.
- The `dev` npm script uses `NODE_ENV=development node server.js` (no nodemon yet). Add `nodemon` as a dev dependency if auto-restart on file change is desired.
- Google OAuth requires registering `http://localhost:3000/auth/google/callback` as an Authorized Redirect URI in Google Cloud Console (separate from the prod URI).

### Sprint placement
This is a `chore` PR, not a feature. Can be done as the first PR of Sprint 2 (or as a standalone `chore/dev-prod-env` branch before Sprint 2 starts). Effort: ~30 minutes.

---

---

## Persona Critique (Added 2026-04-04)

Two expert lenses applied to the current plan and feature set.

---

### Persona A — Senior Application Designer / Software Architect

*Profile: 12 years building SaaS products. Has shipped medical/regulated software. Cares about scalability, security, maintainability, and commercial viability.*

| Area | Critique | Severity |
|---|---|---|
| **Architecture** | Single `index.html` + `server.js` is charming for a prototype but a liability at scale. Any new feature bloats both files. No separation of concerns — UI logic, API calls, and state management are all inline. | High for commercial |
| **No TypeScript** | JS without types is risky when the codebase grows. Refactoring becomes guesswork. Strongly recommend TS migration before Sprint 3 for commercial viability. | Medium |
| **Streaming adapters** | Each AI provider has a different streaming format. There's no abstraction layer — adding Claude or Gemini means duplicating streaming logic across all 6 AI endpoints. A provider adapter pattern is needed before multi-model. | High |
| **Secret management** | AES-256-GCM BYOK encryption is correct, but the `ENCRYPTION_KEY` env var approach is fragile. For commercial: use a secrets manager (AWS Secrets Manager, Doppler, or Railway's secret injection). | High for commercial |
| **No observability** | No request tracing, no performance metrics, no error aggregation (e.g., Sentry). You won't know when things break in prod until users complain. | High |
| **No rate limiting** | AI endpoints are un-rate-limited. A single user can exhaust your Groq quota or cause denial-of-wallet. Add `express-rate-limit` before going commercial. | High |
| **MCP for agents** | Using MCP (Model Context Protocol) for the agentic tool layer is the right call. It decouples agent logic from tool implementation and makes tools reusable across frameworks. Plan this from day one of F18. | Design-positive |
| **Vector store abstraction** | LanceDB as the only vector store is fine to start, but locking in one store is the same mistake as locking in one LLM. Build a `VectorStoreAdapter` interface from day one (same pattern as LLM adapters). | Medium |
| **Switchable embeddings** | Embedding model affects quality significantly. Hugging Face free tier has rate limits. Users should be able to bring their own embedding API key (OpenAI, Cohere, Voyage AI). Add to Settings alongside BYOK. | Medium |
| **Frontend refactor** | Vanilla JS + imperative DOM updates will not survive a React/Vue team joining. For commercial: migrate to a lightweight framework (SvelteKit recommended — minimal overhead, SSR-friendly, no build config hell). | Medium-High for commercial |
| **CI/CD pipeline** | GitHub Actions exists but only for test/lint. No automated deployment to Railway on merge to `main`. No staging/preview environments for PRs. Add Railway deploy action. | High |
| **Gaps in F11 (versioning)** | Auto-save snapshots without a diff view means users can't understand what changed between versions. Diff view is not a stretch goal — it's essential for a research tool where every word matters. | High |
| **Writing style capture (F21)** | Excellent idea but needs careful design. Storing raw sample text in the DB raises privacy questions if going commercial. Should be opt-in and clearly labeled. | Design note |
| **Dev environment** | Using MongoDB Atlas (separate project) for dev instead of localhost is the right call — removes "works on my machine" database issues and mirrors prod behavior. Should be priority zero. | Critical |

---

### Persona B — Academic Research Paper Writer / Clinical Researcher

*Profile: Consultant physician. Has published 40+ papers. Uses PubMed daily. Has tried Jenni.ai, SciSpace, and Grammarly. Frustrated by tools that don't understand medical writing.*

| Area | Critique | Severity |
|---|---|---|
| **PDF export broken** | This is a dealbreaker. DOCX is fine for co-author review but PDF is what gets submitted to journals and shared with colleagues. A medical writing tool with broken PDF export feels unfinished. Fix this before any new features. | Critical |
| **Confidence indicator** | Love the idea. But make it visual — a color-coded bar (green = well-grounded in PubMed sources, yellow = partial, red = AI-generated without evidence) is worth 1000 words. Pair it with a tooltip showing which papers supported the claim. | High value |
| **Writing style capture** | Genuinely exciting. Every academic has a voice. My abstracts use specific sentence structures. If the AI can learn my style from a writing sample, the output will need far less editing. Make it easy — a small textarea to paste a sample, then a "calibrate" button. | High value |
| **Agentic mode — human feedback** | The checkpoint model (approve/reject each step) is exactly right. I do NOT want the agent to write my entire paper and hand it to me. I want to see: "I found 23 papers on X, shall I proceed with these 8?" and "Here is the Introduction draft — apply or revise?" | Critical design req |
| **EQUATOR checklists** | CONSORT, PRISMA, STROBE — these are not optional in major journals. A CONSORT checklist that auto-fills based on the article content would be extraordinary. This should be Sprint 3, not Sprint 5. | High |
| **PubMed gaps** | PubMed misses grey literature, conference proceedings, and non-indexed journals. Dimensions.ai fills this well. Semantic Scholar is also excellent for cross-discipline topics. Both integrations are essential. | High |
| **Multilingual** | For European and Asian researchers, writing in English is already a challenge. A language selector for content generation (F19-1) would open the tool to a far larger audience. Low effort, high value — should be Sprint 2. | High |
| **Locking** | Essential. Once a paper is submitted to a journal, accidental edits are catastrophic. The lock feature with a clear visual indicator (padlock icon) in the editor header is non-negotiable. | Critical |
| **LaTeX export** | Elsevier, Springer, PLOS — all prefer LaTeX. Not having LaTeX export means this tool is a drafting aid, not a final-submission tool. Sprint 5 is too late; push to Sprint 4. | High |
| **Reference management gaps** | Vancouver format sync is good. But no DOI lookup, no Zotero/Mendeley import, no duplicate detection in the library. If I paste 50 PMIDs and 3 are duplicates, I want to know. | Medium |
| **Section drag-and-drop** | Cannot understand why this isn't already there. Reordering sections is basic. If I want to move Discussion before Conclusions, I should be able to drag it. | Medium |
| **No plagiarism check** | Even free tools (like Copyleaks free tier) would be helpful. Academic integrity is non-negotiable. At minimum, a "check similarity" button powered by a free API. | Medium |
| **Version history UI** | The auto-save versions are invisible to me as a user. I need a visible "Version History" panel in the editor — not just a restore button on the dashboard. | High |
| **Sprint 0 (validation sprint)** | Absolutely agree. Before any new features, I want confidence that: dev and prod are separate, I can deploy a version bump, and the version number is visible in the app. Ship this first. | Critical |

---

## Additional Feature Additions (2026-04-04)

---

### F21 — User Writing Style Capture
**New feature — NOT in PRD**

**Description:** Learn the user's academic writing style from a sample, then apply it to all AI generation prompts.

**How it works:**
1. Settings tab → "Writing Style" section
2. User pastes a sample paragraph or section they have written (300–500 words recommended)
3. AI analyzes the sample: sentence structure, vocabulary level, citation density, passive vs. active voice ratio, hedging language
4. Analysis stored as `user.writingStyle: { sampleText, styleProfile: { avgSentenceLength, voiceRatio, formalityScore, hedgingFrequency } }`
5. All AI generation prompts inject: "Write in the following academic style: [styleProfile summary]"
6. User can recalibrate at any time or clear the style profile

**Visual:** "Calibrate" button in Settings → shows style analysis summary card after processing (e.g., "Formal academic | Avg 22 words/sentence | Prefers active voice | Moderate citation density")

**Privacy note:** Sample text is stored encrypted alongside BYOK keys. Must be opt-in, clearly explained. For commercial, add a data retention policy.

**Effort:** Low-Medium (1 PR — Settings UI extension + prompt injection in all AI endpoints)  
**Sprint target:** Sprint 3

---

### F3-12 — Visual AI Confidence Indicator (update to existing F3)
**Enhancement to existing feature**

**Current plan (F3):** "AI confidence indicators — show when AI is generating from limited context vs. rich PubMed context"

**Visual design:**
- Color-coded bar below each AI suggestion box: Green (3+ grounded sources) → Yellow (1–2 sources) → Red (no PubMed context)
- Tooltip on hover: "Based on 4 selected references. Sources: [PMID list]"
- Icon variant in section header after applying: small colored dot (green/yellow/red) persists
- In agent mode: confidence shown per section in the agent progress panel

**Implementation:** Count `pubmedContext` references passed to each AI call. Map count to confidence tier. Return `confidenceTier` in response metadata (alongside streamed text).

**Effort:** Low  
**Sprint target:** Sprint 2 (alongside AI improvements)

---

### F16 Updated — Switchable Vector Stores and Embedding Models

**Update to F16 (Document Intelligence & RAG)**

Both the vector store and the embedding model must be configurable by the user, for the same reason LLM providers are configurable: cost, privacy, and quality vary significantly.

**Vector Store Adapter pattern:**
```
VectorStoreAdapter (interface)
  ├── LanceDBAdapter     (embedded, default, no extra server)
  ├── QdrantAdapter      (self-hosted or Qdrant Cloud)
  ├── WeaviateAdapter    (self-hosted or Weaviate Cloud)
  └── ChromaAdapter      (local dev, Python-based)
```
User configures in Settings → Research APIs → "Vector Store" dropdown + connection URL + API key (if cloud).

**Embedding Model Adapter pattern:**
```
EmbeddingAdapter (interface)
  ├── HuggingFaceAdapter  (default, free tier, BAAI/bge-small-en)
  ├── OpenAIAdapter       (text-embedding-3-small, ~$0.02/1M tokens)
  ├── CohereAdapter       (embed-english-v3.0, free tier available)
  └── VoyageAIAdapter     (voyage-2, excellent for scientific text)
```
User configures in Settings → Research APIs → "Embedding Model" dropdown + API key.

**Recommendation:** VoyageAI (`voyage-2`) is specifically trained on scientific/academic text and outperforms OpenAI embeddings for this use case. Should be highlighted as the recommended option.

**Sprint target:** Sprint 5 (alongside full RAG implementation)

---

### F18 Updated — MCP Integration for Agentic Flow

**Update to F18 (Agentic Writing Pipeline)**

**What is MCP?** Model Context Protocol (Anthropic's open standard) defines a way for AI agents to call tools as structured servers. MCP servers expose tools that any MCP-compatible agent can call, regardless of the AI framework.

**Why MCP for this app?**
- Tools built as MCP servers are reusable across LangChain.js, Mastra, Claude SDK, and any future framework
- Decouples tool implementation from orchestration logic
- Existing MCP servers available for free: filesystem, git, fetch (web search), Puppeteer (browser), GitHub

**Custom MCP servers to build:**

| MCP Server | Tools exposed | Used by agent |
|---|---|---|
| `mcp-pubmed` | `search_pubmed`, `fetch_abstract`, `fetch_fulltext` | Researcher agent |
| `mcp-dimensions` | `search_dimensions`, `fetch_paper_metadata` | Researcher agent |
| `mcp-semantic-scholar` | `search_papers`, `get_citations`, `get_related` | Researcher agent |
| `mcp-article-writer` | `get_section`, `update_section`, `get_all_sections` | Generator + Validator agents |
| `mcp-quality-check` | `run_coherence_check`, `run_grammar_check`, `run_equator_check` | Validator agent |
| `mcp-export` | `export_docx`, `export_pdf` | Formatter agent |

**Existing MCP servers to reuse (free/OSS):**
- `@modelcontextprotocol/server-fetch` — web search / URL fetch
- `@modelcontextprotocol/server-filesystem` — uploaded document access
- `@modelcontextprotocol/server-github` — if integrating with research repos

**Agent ↔ MCP flow:**
```
User: "Write a full article on Multiple Sclerosis"
  → Planner agent → creates task list
  → Researcher agent → calls mcp-pubmed.search_pubmed + mcp-semantic-scholar.get_related
  → [HUMAN CHECKPOINT: "Found 31 papers. Proceeding with these 9?"]
  → Generator agent → calls mcp-article-writer.update_section for each section
  → [HUMAN CHECKPOINT: "Introduction drafted. Apply or revise?"]
  → Validator agent → calls mcp-quality-check.run_coherence_check
  → [HUMAN CHECKPOINT: "3 issues found. Auto-fix or review?"]
  → Formatter agent → calls mcp-export.export_docx
```

**Framework recommendation (updated):** Use **Mastra** as the orchestration layer. Mastra has native MCP support, TypeScript-first, and is designed for human-in-the-loop workflows. LangChain.js also supports MCP but is heavier.

**Sprint target:** Sprint 6 (MCP server stubs in Sprint 4 alongside agentic design spike)

---

## Dev / Prod Environment Setup — REVISED (No Local DB)

**Decision update:** No local MongoDB. Dev uses a separate MongoDB Atlas project. Same philosophy for all services.

### Service mapping

| Service | Dev | Prod |
|---|---|---|
| **Database** | MongoDB Atlas — free M0 cluster, project: `article-writer-dev` | MongoDB Atlas — M10+ cluster, project: `article-writer-prod` |
| **Hosting** | Railway — project: `article-writer-dev` | Railway — project: `article-writer-prod` |
| **Auth (Google OAuth)** | Same Google Cloud project, add `http://localhost:3000` + Railway dev URL as authorized redirect URIs | Same Google Cloud project, prod Railway URL as authorized redirect URI |
| **Groq API** | Same key (or separate free key for dev) | Production key with higher rate limits |
| **NCBI API** | Same key or separate | Production key |

**Why same Google Cloud project?** Fewer credentials to manage. Google allows multiple redirect URIs on one OAuth client.

---

## Step-by-Step Manual Setup Guide

*These are actions Claude cannot perform automatically — they require browser/console access.*

---

### Step 1: Git Branching Strategy

**Strategy: Simplified Gitflow**

```
main          ← production only. Protected. Never commit directly.
dev           ← integration branch. All feature branches merge here first.
feature/*     ← individual features (e.g., feature/dark-mode)
fix/*         ← bug fixes
chore/*       ← non-feature work (env setup, CI, deps)
```

**Rules:**
- `main` ← `dev` only via PR, after testing on Railway dev
- `dev` ← `feature/*` via PR, after local testing
- Branch names: `feature/F15-1-dark-mode`, `chore/dev-prod-env`, `fix/pdf-export`
- Tag releases on `main`: `v1.0.0`, `v1.1.0` (semantic versioning)

**One-time setup (run locally):**
```bash
git checkout main
git checkout -b dev
git push -u origin dev

# Protect main on GitHub:
# GitHub → Settings → Branches → Add rule → "main" → Require PR + 1 review
# Do the same for "dev"
```

---

### Step 2: MongoDB Atlas Setup

**A. Create Dev cluster**
1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create new **Project** → name: `article-writer-dev`
3. Create **Cluster** → Free M0 (512MB, shared) → Region: choose nearest
4. Database Access → Add user: `article-writer-dev-user` → password (save it)
5. Network Access → Add IP: `0.0.0.0/0` (allow all — fine for dev; restrict in prod)
6. Connect → Drivers → Node.js → copy connection string
7. Replace `<password>` and add database name: `...mongodb.net/article-writer-dev?retryWrites...`

**B. Create Prod cluster**
1. New **Project** → name: `article-writer-prod`
2. Create **Cluster** → M10 (dedicated, $57/mo) or M0 to start then upgrade
3. Same steps but: user `article-writer-prod-user`, restrict Network Access to Railway outbound IPs (get from Railway dashboard)
4. Enable **Backup** (M10+)

**C. Set connection strings**
- `.env.development`: `MONGODB_URI=mongodb+srv://dev-user:pw@cluster.mongodb.net/article-writer-dev`
- `.env` (prod): `MONGODB_URI=mongodb+srv://prod-user:pw@cluster.mongodb.net/article-writer-prod`

---

### Step 3: Railway Setup

**A. Create Dev environment**
1. Go to [railway.app](https://railway.app) → New Project
2. Name: `article-writer-dev`
3. Add Service → GitHub Repo → select `article-writer` → branch: **`dev`**
4. Settings → Auto-deploy on push to `dev`: **ON**
5. Variables tab → add all `.env.development` values
6. Add variable: `NODE_ENV=development`
7. Note the Railway-generated URL (e.g., `article-writer-dev.up.railway.app`)

**B. Create Prod environment**
1. New Project → name: `article-writer-prod`
2. Add Service → same GitHub repo → branch: **`main`**
3. Auto-deploy on push to `main`: **ON** (or set to manual deploy for more control)
4. Variables tab → add all `.env` (prod) values
5. Add variable: `NODE_ENV=production`
6. Custom domain: add your domain (if applicable)

**C. Railway start command**
In Railway service settings → Start Command: `npm start`
(which runs `NODE_ENV=production node server.js` after your package.json update)

---

### Step 4: Google OAuth Setup

1. [console.cloud.google.com](https://console.cloud.google.com) → Select existing project (or create `article-writer-oauth`)
2. APIs & Services → OAuth Consent Screen → External → fill app name, support email
3. Credentials → Create Credentials → OAuth 2.0 Client ID → Web application
4. **Authorized redirect URIs** — add ALL of these:
   ```
   http://localhost:3000/auth/google/callback
   https://article-writer-dev.up.railway.app/auth/google/callback
   https://article-writer-prod.up.railway.app/auth/google/callback
   https://yourdomain.com/auth/google/callback  (if custom domain)
   ```
5. Copy Client ID and Client Secret → add to both `.env.development` and `.env` (prod)

---

### Step 5: Environment Variable Checklist

After completing steps 1–4, verify both env files have all values:

**`.env.development`**
```
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb+srv://...dev...
SESSION_SECRET=any-32-char-string-for-dev
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
GROQ_API_KEY=...
NCBI_API_KEY=
LOG_LEVEL=debug
```

**`.env` (production — on Railway via env vars panel, NOT in git)**
```
NODE_ENV=production
MONGODB_URI=mongodb+srv://...prod...
SESSION_SECRET=<openssl rand -hex 32>
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://article-writer-prod.up.railway.app/auth/google/callback
GROQ_API_KEY=...
NCBI_API_KEY=
LOG_LEVEL=info
ENCRYPTION_KEY=<openssl rand -hex 32>
```

---

## Infrastructure Clarifications (2026-04-04)

---

### Railway — One account, two projects

**Decision:** One Railway account. Two separate projects within it.

| | Dev project | Prod project |
|---|---|---|
| Name | `article-writer-dev` | `article-writer-prod` |
| GitHub branch | `dev` | `main` |
| Auto-deploy | On push to `dev` | On push to `main` |
| Cost | Covered by Hobby plan | Covered by Hobby plan |

Railway Hobby pricing is per-account ($5/mo credit), not per-project. Both lightweight Node.js services comfortably fit within the $5 credit. No second account needed.

---

### MongoDB Atlas — One account, two projects

**Decision:** Existing Atlas account. Two new projects within the same organization.

| | Dev project | Prod project |
|---|---|---|
| Atlas project name | `article-writer-dev` | `article-writer-prod` |
| Cluster tier | Free M0 (512MB) | Free M0 to start, upgrade to M10 if needed |
| Database name | `article-writer-dev` | `article-writer-prod` |

Free tier allows one M0 cluster per Atlas **project**. By creating two projects you get two free clusters. Do not create clusters inside an existing project that has other data.

---

### Versioning — Fully Automated via semantic-release

**Decision:** Zero manual versioning. `semantic-release` does everything.

**How it works:**
1. Developer writes commit messages in **Conventional Commits** format:
   - `feat: add dark mode` → bumps MINOR (`1.0.0` → `1.1.0`)
   - `fix: pdf table split across pages` → bumps PATCH (`1.0.0` → `1.0.1`)
   - `feat!: new section structure` (breaking change) → bumps MAJOR (`1.0.0` → `2.0.0`)
   - `chore:`, `docs:`, `test:` → no version bump
2. On merge to `main`: `semantic-release` automatically:
   - Reads commits since last release
   - Bumps `package.json` version
   - Creates a git tag (`v1.1.0`)
   - Publishes a GitHub Release with auto-generated changelog
3. On `dev` branch: runs in **pre-release mode**, produces `v1.1.0-dev.3`
4. CI injects Git short SHA at build time as `BUILD_SHA` env var (`git rev-parse --short HEAD`)

**App footer display:**
- Prod: `v1.1.0 · a3f2b1c`
- Dev: `v1.1.0-dev.3 · xyz789`

**Why SHAs never overlap:** Dev and prod are on different commits. Even if the semver portion is the same temporarily, the SHA is always unique per commit.

**npm package needed:** `semantic-release` + plugins: `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, `@semantic-release/npm`, `@semantic-release/git`, `@semantic-release/github`

---

## SPRINT-2 — Infrastructure & Validation (NEXT TO EXECUTE)

**Goal:** Prove end-to-end that dev and prod pipelines work, branches deploy independently, and version number is visible in the app. Zero new features. Zero risk to existing functionality.

**New file to create:** `docs/sprints/SPRINT-2.md`

**PRs in this sprint (all on `chore/` branches):**

### PR 1: `chore/git-branching` — Branch protection rules
- Create `dev` branch from `main`
- Add branch protection rules on GitHub (require PR for both `main` and `dev`)
- Update `RULES.md` to document the `dev` → `main` release flow and conventional commit format
- **Manual steps:** Set up MongoDB Atlas + Railway dev + Google OAuth redirect URI (Steps 1–4 above)

### PR 2: `chore/dev-prod-env` — Environment separation
- Update `server.js` line 1 (load env file by NODE_ENV)
- Update `package.json` (add `dev` script, update `start` to set NODE_ENV=production)
- Update `.gitignore` (`.env` → `.env*` + `!.env.example`)
- Update `.env.example` (document both envs)
- Create `.env.development` locally (not committed)
- **Validates:** `npm run dev` connects to Atlas dev cluster; `npm start` connects to Atlas prod cluster

### PR 3: `chore/semantic-release` — Automated versioning
- Install `semantic-release` + plugins (`@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, `@semantic-release/npm`, `@semantic-release/git`, `@semantic-release/github`)
- Add `.releaserc.json` config (branches: `main` → release, `dev` → pre-release with `-dev.N` suffix)
- Add `BUILD_SHA` injection to CI via `git rev-parse --short HEAD`
- Display version in app footer: `v1.0.0-dev.1 · a3f2b1c` (dev) / `v1.0.0 · a3f2b1c` (prod)
- Badge color: blue for dev, grey for prod
- **Validates:** Version badge visible in both environments, SHAs differ

### PR 4: `chore/ci-deploy` — GitHub Actions deploy pipeline
- Add `.github/workflows/deploy-dev.yml`: on push to `dev` → run tests → Railway deploy dev
- Add `.github/workflows/deploy-prod.yml`: on push to `main` → run tests → semantic-release → Railway deploy prod
- **Validates:** A push to `dev` auto-deploys and shows correct version on dev Railway URL

**Definition of Done for SPRINT-2:**
- [ ] `npm run dev` starts locally, connects to Atlas dev cluster, shows `v1.0.0-dev.N · sha` in footer
- [ ] Push to `dev` branch → auto-deploys to Railway dev URL
- [ ] Push to `main` branch → auto-deploys to Railway prod URL, version auto-bumped by semantic-release
- [ ] Both environments show different version + SHA
- [ ] No existing functionality broken (manual smoke test: login, create article, generate AI content, export)

**Effort:** ~1 day of coding + 2–3 hours of manual setup (Atlas, Railway, Google OAuth)

---

---

## Additional Design Decisions (2026-04-04)

---

### D8 — Context Grounding Principle (Critical Design Constraint)

**Decision:** AI generation must be grounded in selected sources. The app must never silently hallucinate facts.

**Rules:**
1. When no PubMed references are selected AND no documents are uploaded → show a warning before generating ("No sources selected. AI will use general knowledge only. Factual accuracy cannot be guaranteed.")
2. When sources ARE selected → AI prompt must explicitly state "Base all factual claims only on the provided references. Do not introduce facts not present in the sources."
3. **Strict context mode (opt-in):** User can toggle "Strict Mode" in Settings → AI refuses to generate if no sources are selected. Prompt is blocked with a message: "Select at least one reference to generate in strict mode."
4. After generation, confidence indicator (F3-12) reflects how well-grounded the output is.
5. In agent mode: Researcher agent must complete before Generator agent starts. Generator cannot proceed without a populated reference list.

**Implementation touch-points:**
- All 6 AI endpoints: add `hasContext` check to prompt builder
- UI: warning banner when generating with no selected refs
- Settings: "Strict Context Mode" toggle stored in `user.preferences.strictContextMode`
- Sprint target: Sprint 2 (core AI improvement)

---

### D9 — Default Settings + One-Click Revert

**Decision:** All configurable settings (LLM provider, vector store, embedding model, theme, font size, language) must have a documented default. A single "Reset to defaults" button restores all settings at once.

**Design:**
- A `DEFAULT_CONFIG` constant in `server.js` and a `defaultPreferences` object in the frontend define all defaults
- Settings UI shows a "Modified" pill badge on any setting that differs from default
- "Reset all to defaults" button at the bottom of Settings page — single click, confirmation dialog
- Individual settings can also show a "↩ reset" icon inline
- Default config:
  ```
  LLM provider:    Groq
  LLM model:       llama-3.3-70b-versatile
  Embedding model: Hugging Face BAAI/bge-small-en (free)
  Vector store:    LanceDB (embedded, no config needed)
  Theme:           Light (GSK)
  Font size:       Medium (16px base)
  Language:        English
  Strict mode:     Off
  Writing style:   Not calibrated
  ```
- User config stored in `user.preferences` (MongoDB). On every settings load, diff against `DEFAULT_CONFIG` to show "Modified" badges.

**Sprint target:** Sprint 4 (alongside full Settings implementation)

---

### D10 — Versioning Strategy

**Decision:** Semantic versioning + Git short SHA for build identity. Handles multiple daily deploys without overlap.

**Format:**
- `package.json` version: `MAJOR.MINOR.PATCH` (e.g., `1.0.0`) — manually bumped by developer on milestone releases only
- Build suffix from CI: Git short SHA (7 chars) injected at deploy time as `BUILD_SHA` env var
- Display in app footer:
  - Dev: `v1.0.0-dev · a3f2b1c`
  - Prod: `v1.0.0 · a3f2b1c`
- Railway sets `BUILD_SHA` automatically via GitHub Actions: `git rev-parse --short HEAD`

**Why this solves multiple-deploys-per-day:** The SHA is unique per commit, so `v1.0.0-dev · a3f2b1c` and `v1.0.0-dev · 9c4d22e` are clearly different builds even if the semver is unchanged.

**Release tagging:** On every merge to `main`, CI creates a git tag `v{package.version}+{sha}`. Tags are visible in GitHub releases.

**When to bump semver:**
- `PATCH` — bug fixes, small UI changes
- `MINOR` — new features (new sprint shipped)
- `MAJOR` — breaking changes (e.g., section structure migration, auth overhaul)

---

### D11 — Web Search with Grounding (for Agents)

**Decision:** Use Tavily for agent web search. Add ClinicalTrials.gov and FDA drug label APIs for structured clinical data.

**Tavily:**
- Designed for AI agents — returns cleaned, citation-ready results
- Free tier: 1,000 searches/month
- Returns: title, URL, content snippet, relevance score
- Grounding: AI must cite the URL when using web-sourced information
- MCP server: build `mcp-web-search` wrapping Tavily API

**Additional free structured sources:**
| Source | API | Use case |
|---|---|---|
| ClinicalTrials.gov | REST API (free, no key) | Find ongoing/completed trials by condition |
| FDA OpenFDA | REST API (free, no key) | Drug labels, adverse events, clinical pharmacology |
| WHO Essential Medicines | REST API (free) | Global drug classification |
| Europe PMC | REST API (free) | European biomedical literature, includes preprints |

**Grounding rule for web search:** Any claim sourced from web search must have a URL citation in the output. The AI prompt must state: "For any information retrieved from web search, you must include the source URL inline as [Source: URL]."

**Sprint target:** Sprint 6 (alongside full MCP agent toolkit)

---

### D12 — Railway Hobby Tier Constraints

**Constraints to design around:**
- 512MB RAM, 1 vCPU, 1GB disk
- No sleep on Hobby paid plan
- Single region deploy
- **Puppeteer concern:** Puppeteer full install = ~130MB RAM. With Node.js app (~50MB) + MongoDB connections (~20MB) = ~200MB total. Should fit within 512MB.
- **Mitigation:** Use `puppeteer-core` + pre-installed Chromium on Railway Linux image instead of bundled Chromium. Saves ~100MB.
- **Future:** If RAG + vector store is added (Sprint 5), LanceDB is embedded — no extra RAM. Qdrant would require a separate Railway service.

---

## Sprint Execution Order (2026-04-04)

All sprints numbered sequentially. No gaps, no confusion.

| Sprint | Theme | Status |
|---|---|---|
| SPRINT-1 | Auth, Storage & Dashboard | ✅ Complete |
| **SPRINT-2** | Infrastructure: Atlas, Railway, env separation, semantic-release, CI/CD | Planned — do next |
| **SPRINT-3** | Refactor: modular `src/` backend, separate CSS/JS, rate limiting | Planned |
| SPRINT-4 | Core UX Overhaul (renumbered from old Sprint 2) | Planned |
| SPRINT-5 | Dashboard + Agentic MVP (renumbered from old Sprint 3) | Planned |
| SPRINT-6 | Collaboration + Settings (renumbered from old Sprint 4) | Planned |
| SPRINT-7 | Research Expansion: Dimensions, EQUATOR, RAG, LaTeX | Future |
| SPRINT-8 | True Agents: MCP servers, Mastra, Claude/Gemini, real-time collab | Future |

---

## Open Questions — ANSWERED (2026-04-04)

| # | Question | Answer | Design impact |
|---|---|---|---|
| **Q1** | User base? | Individual researchers | Google OAuth is correct. No SSO/SAML needed. No HIPAA compliance required for now. |
| **Q2** | Commercial SaaS? | Internal org use for now | No monetization pressure yet. Architecture should be clean but no need for multi-tenant isolation, billing, or enterprise auth. |
| **Q3** | Web search for agents? | Yes — with grounding | Add `mcp-web-search` to agent toolkit. Use **Tavily** (free tier: 1000 searches/month, designed for AI agents, returns citations). Also add ClinicalTrials.gov API (free, official) for trial data. |
| **Q4** | Writing style: per user or per article? | Per article | `article.writingStyle: { sampleText, styleProfile }`. User calibrates style independently for each paper. |
| **Q5** | Version numbering strategy? | Hybrid — see below | Semantic version in `package.json` (manual bump on milestones) + Git short SHA for build identity. See versioning design below. |
| **Q6** | MongoDB Atlas account? | Yes — existing account | Create two new **projects** within existing org: `article-writer-dev` and `article-writer-prod`. Do not mix with existing clusters. |
| **Q7** | Railway account tier? | Hobby ($5/mo) | 512MB RAM, 1 vCPU, no sleep. Sufficient for this app. **Note:** Puppeteer adds ~130MB RAM — monitor headroom. Consider `puppeteer-core` + system Chrome to reduce size. |
| **Q8** | EQUATOR checklists? | All (CONSORT + PRISMA + STROBE) | Implement all three in F17-2. Study type detected from article metadata or user-selected. UI: checklist modal with auto-filled items + manual checkboxes. |
| **Q9** | Offline use? | No | LanceDB (embedded) still recommended for dev/local testing, but cloud Qdrant is fine for prod. No PWA/service worker needed. |
| **Q10** | Style report card visible to user? | Yes — AI generates report card | After calibration: show a card with metrics (avg sentence length, formality score, active/passive ratio, citation density, hedging frequency). User can accept or recalibrate. |

---

---

## SPRINT-3 — Refactor to Modular Structure

**Goal:** Transform the single-file prototype into a production-grade modular codebase. Zero new features. Zero changes to user-facing behavior. Every existing test must still pass after this sprint.

**New file to create:** `docs/sprints/SPRINT-3.md`

---

### Backend refactor: `server.js` → modular structure

**Target directory layout:**
```
src/
  app.js                  ← Express app setup, all middleware registration
  server.js               ← HTTP server bootstrap only (app.listen)
  config/
    index.js              ← All env vars, defaults, validation (fail fast on missing keys)
  routes/
    auth.js               ← /auth/* routes
    articles.js           ← /api/articles/* routes
    ai.js                 ← /api/generate, /api/improve, /api/refine, etc.
    pubmed.js             ← /api/pubmed-search, /api/fetch-pmids
    export.js             ← /api/export-docx, /api/export-pdf-server
    llm.js                ← /api/llm/models, /api/suggest-sections
  controllers/
    aiController.js       ← handles all AI streaming requests
    articleController.js  ← CRUD for articles
    pubmedController.js   ← PubMed search + fetch
    exportController.js   ← DOCX + PDF generation
  services/
    llmService.js         ← LLM provider adapter (Groq now, multi-provider later)
    pubmedService.js      ← NCBI API calls, XML parsing, OA enrichment
    exportService.js      ← docx + Puppeteer PDF generation
    sectionContext.js     ← getSectionContext() mapping (extracted from server.js)
  models/
    User.js               ← Mongoose User schema
    Article.js            ← Mongoose Article schema
    ArticleVersion.js     ← Mongoose ArticleVersion schema (Sprint 4)
  middleware/
    requireAuth.js        ← isAuthenticated guard (extracted from server.js)
    errorHandler.js       ← global Express error handler
    rateLimit.js          ← express-rate-limit config (new — added here)
  utils/
    logger.js             ← pino logger instance (extracted)
    fetchWithRetry.js     ← extracted from server.js
```

**Rules for this refactor:**
- No logic changes — only moves code to new locations
- All route paths stay identical (`/api/generate` etc.)
- All existing tests (`tests/unit/`, `tests/integration/`) must pass unchanged
- One PR per route group (5 PRs: auth, articles, ai, pubmed, export) — easier review, smaller diffs

---

### Frontend refactor: `index.html` → separated files

**Target layout:**
```
public/
  style.css             ← all CSS extracted from <style> block in index.html
  app.js                ← all JavaScript extracted from <script> block in index.html
  modules/              ← JS split by concern (optional, if app.js > 1000 lines)
    state.js
    sections.js
    ai.js
    references.js
    preview.js
    export.js
views/
  index.html            ← HTML structure only, links to /style.css and /app.js
```

Express serves `public/` as static files. `views/index.html` is served by `GET /`.

**Rules:**
- No JS logic changes — only extract from inline `<script>` to `public/app.js`
- No CSS changes — only extract from inline `<style>` to `public/style.css`
- Browser behavior identical before and after
- One PR: `refactor/frontend-extract`

---

### What gets added (not just moved)

Two small additions that are only possible once the structure exists:

1. **`middleware/rateLimit.js`** — `express-rate-limit` on all `/api/ai/*` endpoints (100 req/15min per IP). Prevents quota exhaustion. Add `express-rate-limit` to `package.json`.
2. **`config/index.js`** — validates all required env vars on startup and throws a clear error if any are missing (instead of silent `undefined` bugs). E.g.: `if (!config.groqApiKey) throw new Error('GROQ_API_KEY is required')`.

---

### PR sequence for Sprint 1

| PR | Branch | Scope |
|---|---|---|
| 1 | `refactor/config-and-middleware` | Extract config/index.js + middleware/requireAuth.js + utils/logger.js + utils/fetchWithRetry.js |
| 2 | `refactor/models` | Move User.js + Article.js to src/models/ |
| 3 | `refactor/routes-backend` | Split server.js into routes/ + controllers/ + services/ (one sub-PR per route group if needed) |
| 4 | `refactor/frontend-extract` | Extract CSS → public/style.css, JS → public/app.js, HTML → views/index.html |
| 5 | `refactor/rate-limit-and-startup-validation` | Add rate limiting + env var validation on startup |

**Definition of Done for SPRINT-3:**
- [ ] `npm test` passes (all existing tests green)
- [ ] `npm run dev` starts cleanly, app works identically to before
- [ ] No inline `<style>` or `<script>` in `views/index.html`
- [ ] `server.js` root file is < 20 lines (HTTP bootstrap only)
- [ ] Missing env var on startup produces a clear error message, not a runtime crash later
- [ ] Rate limiting active on AI endpoints

---

## Sprint Recommendation (Final — 2026-04-04)

| Sprint | Theme | Key scope |
|---|---|---|
| **SPRINT-1** ✅ | Auth, Storage & Dashboard | Complete |
| **SPRINT-2** | Infrastructure | Atlas (2 projects), Railway (2 projects), env separation, semantic-release, version footer (`v1.0.0-dev · sha`), CI/CD. No features. |
| **SPRINT-3** | Refactor | Modular `src/` backend, `public/style.css` + `public/app.js`, config startup validation, rate limiting. No features. |
| **SPRINT-4** | Core UX Overhaul | Section restructure, export controls, context grounding + strict mode, visual confidence indicator, PDF fix (Puppeteer + fallback) |
| **SPRINT-5** | Dashboard + Agentic MVP | Clone, dark mode, font zoom, grammar check, language selector, drag-and-drop, one-click full draft with human checkpoints |
| **SPRINT-6** | Collaboration + Settings | Versioning (labels), article locking, share link (LWW), Settings page (BYOK + NCBI + OpenAI + OpenRouter + defaults + reset), writing style per article |
| **SPRINT-7** | Research Expansion | Dimensions, Semantic Scholar, EQUATOR ×3, doc upload + extraction, RAG (switchable vector store + embeddings), LaTeX export |
| **SPRINT-8** | True Agents | MCP servers, Mastra orchestration, Tavily web search, ClinicalTrials.gov, Claude + Gemini adapters, real-time collab spike |
