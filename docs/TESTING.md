# Testing Strategy — Medical Article Writer

---

## Document Info

| Field | Value |
|---|---|
| Version | 1.1 |
| Last Updated | 2026-04-10 |
| Status | Living Document |

Update this document each sprint: add new edge cases as you discover them, update coverage targets as the codebase grows.

---

## 1. Test Types and Scope

### 1.1 Unit Tests
**What:** Individual functions and classes in isolation. All dependencies are mocked.  
**Where:** `tests/unit/`  
**Runner:** Jest  
**When:** Every PR (CI gate)  
**Coverage target:** 80% line coverage on all `src/services/`, `src/utils/`, `src/middleware/`, and frontend utility functions.

Unit tests cover:
- Service functions (LLM streaming, PubMed XML parsing, DOCX export logic, section context mapping)
- Utility functions (`fetchWithRetry`, `parsePubMedXML`, `enhanceCitations`, `wordCount`, `htmlEsc`)
- Middleware (auth guard, rate limiter behaviour under threshold)
- Config validation (startup throws on missing required env vars)

Unit tests do NOT test:
- Database operations (use integration tests for those)
- HTTP request/response cycle (use integration tests for those)
- Full user journeys (use E2E tests for those)

---

### 1.2 Integration Tests
**What:** Full request/response cycle through Express, hitting a real in-memory MongoDB.  
**Where:** `tests/integration/`  
**Runner:** Jest + `mongodb-memory-server`  
**When:** Every PR (CI gate)  
**Coverage target:** All happy paths + all documented error paths per endpoint.

Integration tests cover:
- Auth routes: registration, login, Google OAuth callback (mocked), logout, session persistence
- Article CRUD routes: create, read, update (auto-save), delete — with ownership enforcement
- AI streaming endpoints: correct response shape, error handling when Groq is mocked to fail
- PubMed endpoints: PMID fetch, OA enrichment, search — using recorded NCBI XML fixtures
- Export endpoints: DOCX generated without error; PDF endpoint mocked in CI
- Version/clone/share endpoints (Sprint 6+): once implemented

Integration tests do NOT use:
- Real Atlas MongoDB (use `mongodb-memory-server` — starts/stops per test suite)
- Real Groq API (mock with `nock`)
- Real NCBI API (use fixture XML files in `tests/fixtures/`)

---

### 1.3 E2E Tests
**What:** Full user journeys in a real browser against a running dev server.  
**Where:** `tests/e2e/`  
**Runner:** Playwright  
**When:** Nightly CI job + before every production release  
**Coverage target:** Every User Flow (UF-1 through UF-13) in `docs/PRD.md` has at least one passing Playwright spec.

| File | User Flows Covered |
|---|---|
| `auth.spec.ts` | UF-11 — sign-in (Google + email/password), sign-out, redirect-if-unauthenticated |
| `article-lifecycle.spec.ts` | UF-1, UF-13 — create article, fill metadata, auto-save, reopen from dashboard |
| `ai-generate.spec.ts` | UF-2, UF-3, UF-4, UF-5 — generate draft, improve, expand to prose, key points, apply |
| `references.spec.ts` | UF-6, UF-7 — PMID import, PubMed search, add to library, sync references section |
| `tables.spec.ts` | UF-8 — generate table, preview, delete, DOCX export includes table |
| `flow-check.spec.ts` | UF-9 — run flow check, review results, apply recommendation to section |
| `export.spec.ts` | UF-10 — DOCX download, PDF download |
| `dashboard.spec.ts` | UF-12 — card/list view, filter, clone, delete, view mode, lock/unlock (Sprint 6+) |

---

### 1.4 Performance Tests
**What:** Throughput and latency benchmarks under concurrent load.  
**Where:** `tests/performance/`  
**Runner:** `autocannon`  
**When:** Before each Railway production deploy (manual trigger in CI)  
**Coverage target:** Baselines established on first run. Alert (but do not fail CI) if any metric regresses > 20%.

| File | What It Measures |
|---|---|
| `ai-endpoints.perf.js` | `/api/generate`: 10 concurrent users, 30 seconds — req/s and p99 latency |
| `article-list.perf.js` | `GET /api/articles` with 100 articles in DB — latency under 20 concurrent users |
| `docx-export.perf.js` | `POST /api/export-docx` with max-size article (13 sections, 5 tables each) — time to response |

Baselines stored in `tests/performance/baselines.json` (committed to repo).

---

## 2. Directory Structure

```
tests/
  unit/
    config.test.js                  # startup config validation
    middleware/
      rateLimit.test.js
    server/
      version-endpoint.test.js
    utils/
      detectWriteMode.test.js
  integration/
    api/
      agent-draft.test.js           # POST /api/agent/draft (SSE)
      ai.test.js                    # all AI streaming endpoints
      articles.test.js              # article CRUD + clone/lock/share/collaborators
      auth.test.js                  # register, login, logout, session
      export.test.js                # DOCX + PDF export
      settings.test.js              # settings GET/PUT + BYOK keys
      sharing.test.js               # share tokens + collaborators
      suggest-sections.test.js      # POST /api/suggest-sections
      versions.test.js              # article version history
  e2e/
    dashboard.spec.ts
    editor.spec.ts
  performance/
    ai-endpoints.perf.js
    article-list.perf.js
    docx-export.perf.js
    baselines.json
  fixtures/
    ncbi-search-response.xml
    ncbi-fetch-response.xml
    ncbi-oa-response.xml
    mock-article.json
    mock-user.json
  globalSetup.js
  globalTeardown.js
  jestSetup.js
```

**Note on LLM mocks:** All integration tests that touch AI endpoints mock `src/services/llmService` at the module level, exposing both `createCompletion` and `getClient`:

```js
jest.mock('../../../src/services/llmService', () => ({
  createCompletion: jest.fn().mockResolvedValue(makeStream()),
  getClient: () => ({ chat: { completions: { create: jest.fn().mockResolvedValue(makeStream()) } } }),
  MODEL: 'test-model',
}));
```

This ensures tests continue to pass after the key-rotation refactor (all routes now call `createCompletion` instead of `getClient().chat.completions.create`).

---

## 3. Tooling

| Tool | Purpose |
|---|---|
| `jest` | Unit + integration test runner |
| `mongodb-memory-server` | In-memory MongoDB for integration tests — no Atlas needed |
| `supertest` | HTTP integration testing against Express app |
| `nock` | Mock HTTP calls to Groq API and NCBI in integration tests |
| `@playwright/test` | E2E browser automation |
| `autocannon` | HTTP performance / load testing |

Install test dependencies:
```bash
npm install --save-dev jest mongodb-memory-server supertest nock @playwright/test autocannon
npx playwright install chromium
```

---

## 4. Running Tests

```bash
# Unit tests only (fastest — run first)
npm run test:unit

# Integration tests (no external services needed)
npm run test:integration

# All unit + integration
npm test

# E2E (requires running server)
npm run dev &
npm run test:e2e

# Performance (run against dev server manually before prod deploy)
npm run dev &
node tests/performance/ai-endpoints.perf.js
```

---

## 5. Test Environment Setup

### `jest.config.js`

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.js', '**/tests/integration/**/*.test.js'],
  globalSetup: './tests/setup/globalSetup.js',
  globalTeardown: './tests/setup/globalTeardown.js',
  setupFilesAfterFramework: ['./tests/setup/jest.setup.js'],
  coverageThreshold: {
    global: { lines: 80, functions: 80, branches: 70, statements: 80 }
  }
};
```

### `tests/setup/globalSetup.js`

```js
const { MongoMemoryServer } = require('mongodb-memory-server');
module.exports = async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  global.__MONGOD__ = mongod;
};
```

### `tests/setup/globalTeardown.js`

```js
module.exports = async () => { await global.__MONGOD__.stop(); };
```

### Required env vars for tests

```
NODE_ENV=test
SESSION_SECRET=test-secret-not-for-production
GROQ_API_KEY=test-key-mocked-by-nock
GOOGLE_CLIENT_ID=test-client-id
GOOGLE_CLIENT_SECRET=test-client-secret
ENCRYPTION_KEY=12345678901234567890123456789012
```

Set these in a `jest.config.js` `testEnvironmentOptions` block or a `.env.test` file (gitignored).

---

## 6. Edge Cases and Boundary Conditions

This section is a living reference. Add new cases each sprint.

---

### PubMed Service

| Case | Expected behaviour |
|---|---|
| 0 PMIDs submitted | Returns `{ found: [], notFound: [] }` — no error |
| 1 PMID (minimum) | Fetches and enriches correctly |
| 50 PMIDs (maximum) | All 50 processed without timeout |
| 51 PMIDs (over limit) | `400` with `code: "PMID_LIMIT_EXCEEDED"` |
| Non-numeric values mixed in PMIDs array | Non-numeric values silently filtered; numeric ones processed |
| NCBI returns empty XML `<PubmedArticleSet/>` | `{ found: [], notFound: [<all submitted pmids>] }` |
| NCBI returns 429 (rate limit) | `fetchWithRetry` retries up to `maxRetries` with 1s delay; after exhaustion returns `502` |
| OA paper with empty BioC full-text | `fullText: null`; `isOA: false` (OA flag only set if text successfully extracted) |
| Duplicate PMIDs in request | Deduplicated before fetch; each PMID returned once |
| PMID with no abstract in XML | `abstract: ""` — not an error |

---

### AI Endpoints

| Case | Expected behaviour |
|---|---|
| Missing required field `topic` | `400` with `code: "MISSING_FIELD"` — Groq never called |
| `pubmedContext` exceeds 6000 chars | Truncated server-side before prompt construction |
| Groq API returns 429 on all keys | `502` with `code: "LLM_RATE_LIMIT"` — after exhausting the full key pool |
| Groq API returns 429 on first key only | Transparent retry on next key — no error surfaced to client |
| Groq API unreachable (network error) | `502` with `code: "LLM_UNAVAILABLE"` — no server crash |
| Client disconnects mid-stream | `res.on('close')` stops streaming — no unhandled promise rejection |
| Empty section prose in coherence check | Section skipped in analysis; report notes it was empty |
| All sections empty in coherence check | `400` — cannot check with no content |
| Empty `instruction` field in `/api/refine` | `400` — instruction is required |
| Very long `currentDraft` (> 5000 words) | Truncated before sending to stay within LLM context window |
| `/api/coherence-fix` missing `recommendation` | `400` — recommendation is required |
| `/api/coherence-fix` missing `currentDraft` | `400` — currentDraft is required |
| `/api/coherence-fix` with no adjacent sections | `prevSection`/`nextSection` omitted — AI fixes in isolation (valid) |
| `/api/coherence-fix` with empty adjacent prose | Adjacent section treated as absent — no context injected |

---

### Article CRUD

| Case | Expected behaviour |
|---|---|
| `GET /api/articles/:id` for another user's article | `403 Forbidden` |
| `PUT /api/articles/:id` for another user's article | `403 Forbidden` |
| `DELETE /api/articles/:id` for non-existent article | `404 Not Found` |
| Invalid MongoDB ObjectId format | `400` with `code: "INVALID_ID"` |
| Auto-save on a locked article (`isLocked: true`) | `400` with `code: "ARTICLE_LOCKED"` |
| 51st version created (cap is 50) | Oldest version deleted; total stays ≤ 50 |
| Restore version on locked article | `400` with `code: "ARTICLE_LOCKED"` |
| Clone: original has 13 sections + 3 custom + library | Clone preserves all; new `_id`, reset timestamps, "Copy of …" title |
| Concurrent saves from two browser tabs | Last write wins — no error, no crash |

---

### Authentication

| Case | Expected behaviour |
|---|---|
| `POST /auth/register` with duplicate email | `409` with `code: "EMAIL_TAKEN"` |
| `POST /auth/login` with wrong password | `401` with `code: "INVALID_CREDENTIALS"` |
| `POST /auth/login` with non-existent email | `401` — same message as wrong password (no user enumeration) |
| `GET /api/articles` without session | `401` redirect to `/login` |
| Google OAuth callback with state mismatch | `400` — CSRF protection |
| Google OAuth callback with revoked token | `401` — redirect to login with error |
| `POST /auth/logout` when already logged out | `200` — idempotent |
| Password > 72 chars | bcrypt silently truncates at 72 bytes — documented limitation |

---

### Export

| Case | Expected behaviour |
|---|---|
| DOCX with all sections empty | Valid `.docx` with section headings and no body |
| DOCX with HTML entities in prose (`&amp;`, `&lt;`) | Entities decoded to plain text in Word output |
| DOCX with 13 sections × 5 tables each | File generated in < 10s |
| PDF via Puppeteer with system Chromium not found | Falls back to html2pdf.js — no `500` error |
| Article title with special chars (`/`, `:`, `?`) in filename | Sanitised — special chars replaced with `_` |

---

### Versioning (Sprint 6+)

| Case | Expected behaviour |
|---|---|
| Save version with identical content | No new snapshot (change detection via content hash) |
| Save version with user label | Label stored in `ArticleVersion.label`; visible in history |
| Restore on locked article | `400 ARTICLE_LOCKED` |
| Restore when current state is unsaved | Current state saved as new version first |

---

### Settings / BYOK (Sprint 6+)

| Case | Expected behaviour |
|---|---|
| Save LLM API key | Encrypted AES-256-GCM before storage; never returned in plaintext |
| Invalid API key format | Stored but flagged; first use returns `502 LLM_AUTH_FAILED` |
| Reset to defaults | All user config fields overwritten with `DEFAULT_CONFIG` |
| Missing `ENCRYPTION_KEY` env var at startup | Config validation throws immediately with clear message |

---

## 7. Sprint-by-Sprint Test Coverage Plan

| Sprint | Status | Test files delivered |
|---|---|---|
| Sprint 1 | ✅ | `integration/api/auth.test.js`, `integration/api/articles.test.js` |
| Sprint 2 | ✅ | `unit/config.test.js`, `unit/server/version-endpoint.test.js` |
| Sprint 3 | ✅ | Updated all imports to `src/` paths. `unit/middleware/rateLimit.test.js` |
| Sprint 4 | ✅ | `integration/api/ai.test.js`, `integration/api/export.test.js`, `unit/utils/detectWriteMode.test.js` |
| Sprint 5 | ✅ | `integration/api/agent-draft.test.js`, `integration/api/suggest-sections.test.js`, `e2e/dashboard.spec.ts`, `e2e/editor.spec.ts` |
| Sprint 6 | ✅ | `integration/api/versions.test.js`, `integration/api/sharing.test.js`, `integration/api/settings.test.js` |
| Sprint 7 | 📋 | `integration/api/planner.test.js`, `integration/api/websearch.test.js`, `performance/docx-export.perf.js` |
| Sprint 8 | 📋 | `integration/agents.test.js`, `e2e/agent-pipeline.spec.ts`, `performance/article-list.perf.js` |

**Current total:** 110 tests across 13 suites (all passing).
