# Sprint 3 — Refactor to Modular Production-Grade Structure

**Status:** Planned  
**Dates:** TBD  
**Priority tier:** Critical — do before Sprint 4 feature work  

> **Note:** This sprint replaces the previous SPRINT-3 (Dashboard & Editor Enhancements),
> which has been renumbered to SPRINT-5. See `docs/FEATURE-EXPANSION-ANALYSIS.md` for
> the full context and `docs/sprints/SPRINT-5.md` for that sprint's content.

## Goals

Transform the single-file prototype into a production-grade modular codebase so that
every subsequent sprint builds on clean, maintainable, testable code. Zero new user-facing
features. Zero changes to existing behavior. All existing tests must pass after every PR.

---

## Backend Refactor: `server.js` → `src/`

**Target structure:**
```
src/
  app.js                  ← Express app setup, all middleware registration
  server.js               ← HTTP server bootstrap only (app.listen + port)
  config/
    index.js              ← All env vars, defaults; throws on missing required keys
  routes/
    auth.js               ← /auth/* routes
    articles.js           ← /api/articles/* routes
    ai.js                 ← /api/generate, /api/improve, /api/refine, etc.
    pubmed.js             ← /api/pubmed-search, /api/fetch-pmids
    export.js             ← /api/export-docx, /api/export-pdf-server, /api/version
    llm.js                ← /api/llm/models, /api/suggest-sections
  controllers/
    aiController.js       ← all AI streaming request handlers
    articleController.js  ← CRUD for articles
    pubmedController.js   ← PubMed search + fetch
    exportController.js   ← DOCX + Puppeteer PDF generation
  services/
    llmService.js         ← LLM provider adapter (Groq now, multi-provider in Sprint 6)
    pubmedService.js      ← NCBI API calls, XML parsing, OA enrichment
    exportService.js      ← docx + Puppeteer PDF logic
    sectionContext.js     ← getSectionContext() mapping (extracted from server.js)
  models/
    User.js               ← Mongoose User schema
    Article.js            ← Mongoose Article schema
    ArticleVersion.js     ← Mongoose ArticleVersion schema (used in Sprint 6)
  middleware/
    requireAuth.js        ← isAuthenticated guard
    errorHandler.js       ← global Express error handler
    rateLimit.js          ← express-rate-limit config for AI endpoints
  utils/
    logger.js             ← pino logger instance
    fetchWithRetry.js     ← retry utility
```

**Root `server.js` after refactor (< 10 lines):**
```js
const app = require('./src/app');
const config = require('./src/config');
app.listen(config.port, () => {
  require('./src/utils/logger').info(`Server running on port ${config.port}`);
});
```

---

## Frontend Refactor: `index.html` → separated files

**Target structure:**
```
public/
  style.css       ← all CSS extracted from <style> block
  app.js          ← all JS extracted from <script> block
views/
  index.html      ← HTML structure only; links to /style.css and /app.js
```

Express `app.js` serves `public/` as static files. `GET /` serves `views/index.html`.

---

## What Gets Added (not just moved)

Two small additions only possible once structure exists:

1. **`src/middleware/rateLimit.js`** — `express-rate-limit` on all `/api/ai/*` and `/api/export/*` endpoints: 100 requests / 15 min per IP. Prevents quota exhaustion. Add `express-rate-limit` to `dependencies`.
2. **`src/config/index.js`** — validates all required env vars on startup and throws immediately with a clear message if any are missing. No more silent `undefined` runtime crashes.

```js
// config/index.js example
const required = ['GROQ_API_KEY', 'MONGODB_URI', 'SESSION_SECRET'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}
```

---

## PR Sequence

| PR | Branch | Scope |
|---|---|---|
| 1 | `refactor/config-middleware-utils` | Extract `src/config/index.js`, `src/middleware/requireAuth.js`, `src/middleware/errorHandler.js`, `src/utils/logger.js`, `src/utils/fetchWithRetry.js` |
| 2 | `refactor/models` | Move Mongoose schemas to `src/models/User.js`, `src/models/Article.js`; create stub `ArticleVersion.js` |
| 3 | `refactor/routes-auth-articles` | Extract auth + articles routes → `src/routes/auth.js`, `src/routes/articles.js`, `src/controllers/articleController.js` |
| 4 | `refactor/routes-ai-pubmed-export` | Extract remaining routes → `src/routes/ai.js`, `src/routes/pubmed.js`, `src/routes/export.js`, `src/routes/llm.js` + corresponding controllers and services |
| 5 | `refactor/frontend-extract` | Extract CSS → `public/style.css`; JS → `public/app.js`; HTML → `views/index.html` |
| 6 | `refactor/rate-limit-startup-validation` | Add `express-rate-limit` middleware; add env var validation in `src/config/index.js` |

**Rule for every PR:** Run `npm test` before opening. All tests must be green. No logic changes — moves only (except PRs 6).

---

## New Test Requirements

No new test files are written in Sprint 3 — but all existing tests must be updated to use the new `src/` import paths after each PR.

| Action | Detail |
|---|---|
| Update all unit test imports | `require('../server')` → `require('../../src/app')` etc. after each refactor PR |
| Add `tests/unit/middleware/rateLimit.test.js` | Verify: requests under threshold pass; requests over 100/15min return 429 |
| Add `tests/unit/config.test.js` (if not done in Sprint 2) | Startup throws on missing `GROQ_API_KEY`, `MONGODB_URI`, `SESSION_SECRET` |
| Verify CI still passes after every PR | `npm test` must be green after PRs 1–6 individually |

## Definition of Done

- [ ] `npm test` passes (all existing tests green after every PR)
- [ ] `npm run dev` starts cleanly; app works identically to before
- [ ] `server.js` root file is ≤ 10 lines (HTTP bootstrap only)
- [ ] No inline `<style>` or `<script>` blocks in `views/index.html`
- [ ] `src/config/index.js`: starting with a missing env var prints a clear error and exits
- [ ] Rate limiting active: >100 AI requests from same IP within 15 min returns 429
- [ ] All route paths unchanged (`/api/generate`, `/api/articles`, etc.)

**Effort:** ~2 days (mostly mechanical extraction + careful test verification per PR)
