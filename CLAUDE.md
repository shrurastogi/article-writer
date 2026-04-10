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
| `/frontend` | Building or modifying UI in `public/js/app.js`, `public/css/app.css`, or HTML files |
| `/backend` | Adding or modifying endpoints in `src/routes/` |
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
| `docs/TESTING.md` | Testing strategy, directory structure, tooling, edge cases — read before writing tests |
| `docs/sprints/` | Sprint plans — every feature must be in a sprint before coding |

## Commands

```bash
# Install dependencies
npm install

# Start dev server (loads .env.development, http://localhost:3000)
npm run dev

# Start production server (loads .env)
npm start

# Run unit + integration tests
npm test

# Run E2E tests (requires server running)
npm run test:e2e

# Lint
npm run lint
```

Required env vars — see `.env.example` for the full list. Minimum to run locally:
- `GROQ_API_KEY` — required (free key at console.groq.com)
- `MONGODB_URI` — required (Atlas dev connection string)
- `SESSION_SECRET` — required (any string locally)
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_CALLBACK_URL` — required for Google OAuth

## Architecture (Sprint 6 delivered state)

Three HTML files served by a modular Express app (`src/app.js`), backed by MongoDB Atlas:

- **`login.html`** — Unauthenticated entry. Google OAuth + email/password sign-in.
- **`dashboard.html`** — Post-auth landing. Article card grid with create/open/delete/clone actions.
- **`index.html`** — Article editor. All section editing, AI generation, reference library, version history, export UI. Auto-saves via `PUT /api/articles/:id`. Frontend JS in `public/js/app.js`, CSS in `public/css/app.css`.

**`src/routes/`** contains all route handlers:
- **`auth.js`**: `/auth/google`, `/auth/login`, `/auth/register`, `/auth/logout`, `/auth/me` (Passport.js)
- **`articles.js`**: `GET/POST/PUT/DELETE /api/articles/:id` + clone, lock/unlock, share, collaborators (MongoDB Atlas)
- **`ai.js`**: Streaming AI endpoints → Groq (`llama-3.3-70b-versatile`) via `src/services/llmService.js`
  - `/api/generate`, `/api/improve`, `/api/keypoints`, `/api/refine`, `/api/generate-table`
  - `/api/coherence-check`, `/api/coherence-fix`, `/api/grammar-check`, `/api/suggest-sections`
  - `/api/agent/draft` (SSE, multi-section)
- **`versions.js`**: Article version history (save, list, restore, delete)
- **`settings.js`**: User settings + BYOK API key management (AES-256-GCM encrypted)
- **`pubmed.js`**: `/api/pubmed-search`, `/api/fetch-pmids` → NCBI E-utilities
- **`export.js`**: `/api/export-docx`, `/api/export-pdf` → `docx` package + Puppeteer

**`src/services/llmService.js`** manages the Groq client with auto key-rotation across up to 4 keys (`GROQ_API_KEY` through `GROQ_API_KEY_4`) on 429 rate-limit errors.

See `docs/ARCHITECTURE.md` for the full architecture including data models, data flows, and planned changes.
