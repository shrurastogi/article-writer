# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules & Standards

**Read `docs/RULES.md` before making any changes.** It defines:
- Git branching and PR rules (never commit to `main` directly)
- Sprint planning requirements (feature must be in an active sprint before coding starts)
- Coding standards: naming conventions, error handling, logging, security
- Testing requirements and CI gates
- Brand guidelines (GSK colors)

## Specialist Commands

Use these slash commands when working on specific areas:

| Command | When to use |
|---|---|
| `/frontend` | Building or modifying UI in `index.html` |
| `/backend` | Adding or modifying endpoints in `server.js` |
| `/test` | Writing unit, integration, or E2E tests |
| `/review` | Reviewing staged changes or a PR before merge |
| `/sprint` | Planning a new sprint from PRD backlog items |

## Documentation Map

| Document | Purpose |
|---|---|
| `docs/PRD.md` | What is being built and why — source of truth for features |
| `docs/ARCHITECTURE.md` | How the system works — update when structure changes |
| `docs/RULES.md` | Development standards — must be followed in every session |
| `docs/API.md` | API contract — update when endpoints change |
| `docs/sprints/` | Sprint plans — every feature must be in a sprint before coding |

## Commands

```bash
# Install dependencies
npm install

# Start the server (runs on http://localhost:3000)
npm start
```

Requires a `.env` file with:
- `GROQ_API_KEY=your_key_here` (free key at console.groq.com) — required
- `NCBI_API_KEY=your_key_here` (optional; raises PubMed rate limit from 3 to 10 req/s)

## Architecture

This is a two-file full-stack app with no build step:

**`server.js`** — Express server with these endpoints:
- **Streaming AI** (all POST, stream `text/plain`): `/api/generate`, `/api/improve`, `/api/keypoints`, `/api/refine`, `/api/generate-table` — proxy to Groq using `openai` npm package at `https://api.groq.com/openai/v1` with `llama-3.3-70b-versatile`
- **PubMed** (POST, JSON): `/api/pubmed-search` (esearch + efetch XML), `/api/fetch-pmids` (batch fetch by PMID + PMC OA enrichment via elink/BioC, concurrency 3)
- **Export** (POST): `/api/export-docx` — builds Word document server-side with the `docx` package, including tables parsed from HTML

`getSectionContext()` maps the 12 section IDs (`abstract`, `introduction`, `epidemiology`, `pathophysiology`, `diagnosis`, `staging`, `treatment_nd`, `treatment_rr`, `novel_therapies`, `supportive_care`, `future_directions`, `conclusion`, `references`) to topic-aware prompts.

**`index.html`** — Single-file frontend with all CSS and JS inline:
- 13 pre-defined sections stored in the `SECTIONS` array with IDs matching keys in `getSectionContext` (server-side) and `state.sections` (client-side)
- AI responses stream via `ReadableStream` / `TextDecoder` and render directly into `.ai-box-content` elements
- Auto-save uses `localStorage` key `mm-article` with a 1500ms debounce
- PDF export uses `html2pdf.js` (CDN) to render `#article-preview` directly — what you see in the preview is what exports
- The preview pane renders escaped HTML from `state.sections`; it does not sanitize beyond `htmlEsc()` (entity escaping only)

## Key data flow

1. User types → `updateSection(id, value)` → updates `state.sections[id]` + re-renders preview
2. AI button → `streamToAiBox()` → POST to `/api/*` → streams text chunks into the AI suggestion box
3. "Apply" → `applyAiSuggestion(id)` → copies AI box text into the section textarea → triggers `updateSection`
4. "⬇ DOCX" → `downloadDOCX()` → POST `/api/export-docx` with all sections (including `tables` array per section) → receives `.docx` blob → triggers browser download
5. "⬇ PDF" → `downloadPDF()` → `html2pdf` renders `#article-preview` in-browser → no server involvement
6. PubMed panel → searches/fetches articles → selected abstracts are passed as `pubmedContext` to AI endpoints
