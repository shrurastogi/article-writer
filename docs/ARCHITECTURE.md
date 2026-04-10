# Product Architecture: Medical Article Writer

---

## Document Info

| Field | Value |
|---|---|
| Version | 3.0 |
| Last Updated | 2026-04-10 |
| Reflects | Sprint 6 delivered state |

This document describes the **current** architecture. It is updated when the structure changes — not when features are planned.

---

## 1. System Overview

Medical Article Writer is a multi-user Node/Express web application backed by MongoDB Atlas and deployed on Railway. Users authenticate with Google OAuth or email/password and access a personal dashboard of articles stored server-side.

Current file structure after Sprint 6:

```
article-writer/
├── server.js                  # Entry point — binds port, loads .env
├── src/
│   ├── app.js                 # Express app: middleware stack, route mounting
│   ├── config/
│   │   └── index.js           # Startup validation — throws on missing env vars
│   ├── lib/
│   │   └── passport-config.js # Passport Google + Local strategies
│   ├── middleware/
│   │   ├── auth.js            # requireAuth guard
│   │   └── rateLimit.js       # express-rate-limit configs per endpoint group
│   ├── models/
│   │   ├── Article.js
│   │   ├── ArticleVersion.js
│   │   └── User.js
│   ├── routes/
│   │   ├── ai.js              # All AI streaming + SSE endpoints
│   │   ├── articles.js        # Article CRUD + clone/lock/share/collaborators
│   │   ├── auth.js            # Auth routes (Google OAuth + local)
│   │   ├── export.js          # DOCX + PDF export
│   │   ├── pubmed.js          # PubMed search + PMID fetch
│   │   ├── settings.js        # User settings + BYOK key management
│   │   └── versions.js        # Article version history
│   ├── services/
│   │   ├── encryptionService.js   # AES-256-GCM encrypt/decrypt
│   │   ├── exportService.js       # DOCX document builder
│   │   ├── llmService.js          # Groq client pool + createCompletion()
│   │   ├── pdfService.js          # Puppeteer PDF generation
│   │   ├── pubmedService.js       # NCBI E-utilities + BioC full-text
│   │   └── sectionContext.js      # Section-aware prompt context mapping
│   └── utils/
│       ├── detectWriteMode.js     # Detects bullet/prose write mode
│       └── logger.js              # pino structured logger
├── public/
│   ├── css/
│   │   └── app.css            # All editor + preview styles
│   └── js/
│       └── app.js             # All editor frontend logic
├── login.html
├── dashboard.html
├── index.html                 # Editor shell — loads public/css/app.css + public/js/app.js
├── assets/
│   └── gsk-logo.svg
├── tests/
│   ├── unit/
│   ├── integration/
│   │   └── api/
│   ├── e2e/
│   └── performance/
├── docs/
├── package.json
├── jest.config.js
├── .env                       # Production secrets (gitignored)
├── .env.development           # Local dev overrides (gitignored)
└── .env.example               # Documented template (tracked in git)
```

---

## 2. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                            Browser                               │
│                                                                  │
│  login.html          dashboard.html          index.html          │
│  (unauthenticated)   (article list)          (editor + preview)  │
│                                              public/js/app.js    │
│                                              public/css/app.css  │
│       │                    │                       │             │
│       └────────────────────┴───────────────────────┘            │
│                            │ fetch() / EventSource              │
└────────────────────────────┼─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                    src/app.js (Express)                          │
│                                                                  │
│  pino-http (structured HTTP logging)                             │
│  express.json() + express.urlencoded()                           │
│  express-session (connect-mongo store)                           │
│  passport.initialize() + passport.session()                      │
│  express-rate-limit (per-route groups)                           │
│  express.static('public') + express.static('assets')            │
│                                                                  │
│  src/routes/auth.js     ──► Google OAuth / local auth            │
│  src/routes/articles.js ──► MongoDB Atlas (Article model)        │
│  src/routes/versions.js ──► MongoDB Atlas (ArticleVersion model) │
│  src/routes/settings.js ──► MongoDB Atlas (User.llmConfig)       │
│                                                                  │
│  src/routes/ai.js       ──► src/services/llmService.js           │
│                              (Groq API — key pool, rotation)     │
│                                                                  │
│  src/routes/pubmed.js   ──► NCBI E-utilities + PMC BioC API      │
│                                                                  │
│  src/routes/export.js   ──► src/services/exportService.js (DOCX) │
│                         ──► src/services/pdfService.js (PDF)     │
│                                                                  │
│  GET /*                 ──► index.html (requireAuth guarded)     │
└──────────────────────────────────────────────────────────────────┘
                 │                          │
   ┌─────────────▼───────────┐   ┌─────────▼──────────────┐
   │     MongoDB Atlas       │   │       Groq API          │
   │  users collection       │   │  llama-3.3-70b-         │
   │  articles collection    │   │  versatile              │
   │  articleversions coll.  │   │  (OpenAI-compatible)    │
   │  sessions collection    │   └────────────────────────┘
   └─────────────────────────┘
```

---

## 3. Authentication & Session Management

### 3.1 Strategies (Passport.js)

**Google OAuth 2.0 (`passport-google-oauth20`)**
- `GET /auth/google` → redirect to Google consent screen
- `GET /auth/google/callback` → exchange code for profile → upsert User by `googleId`
- Requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`

**Local Strategy (`passport-local`)**
- `POST /auth/register` → create User with bcrypt-hashed password (rounds: 12 prod, 1 test)
- `POST /auth/login` → find by email, bcrypt compare

Both strategies serialize by `user._id`. `deserializeUser` loads the User from MongoDB on every authenticated request.

### 3.2 Session

- `express-session` with `connect-mongo` — sessions stored in MongoDB `sessions` collection
- `SESSION_SECRET` from env (32-byte random hex in production)
- Sessions expire after 7 days of inactivity

### 3.3 Route Protection

`requireAuth` middleware in `src/middleware/auth.js` redirects to `/login` if `req.isAuthenticated()` is false.

```
Public:    /auth/*, /login, /api/version, /share/:token
Protected: /api/articles/*, /api/generate*, /api/pubmed*, /api/export*, GET /
```

---

## 4. Data Models (Mongoose)

### User

```js
{
  _id: ObjectId,
  googleId: String,               // null for local accounts
  email: String (unique, required),
  passwordHash: String,           // null for Google accounts
  displayName: String,
  avatarUrl: String,
  llmConfig: {
    provider: String,             // 'groq' | 'openai' | 'openrouter'
    model: String,
    encryptedApiKey: String,      // AES-256-GCM encrypted BYOK key
  },
  researchConfig: {
    encryptedNcbiKey: String,     // AES-256-GCM encrypted NCBI key
  },
  preferences: {
    theme: String,                // 'light' | 'dark'
    fontSize: Number,
    language: String,
    strictMode: Boolean,
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Article

```js
{
  _id: ObjectId,
  userId: ObjectId (ref: 'User', indexed),
  title: String (default: 'Untitled Article'),
  topic: String,
  authors: String,
  keywords: String,
  sections: Mixed,                // { [sectionId]: { prose: String, tables: [] } }
  library: Array,                 // [{ pmid, title, authors, year, journal, abstract, pmcid, isOA, fullText, selected }]
  customSections: Array,          // [{ id, title, position }]
  wordCount: Number,
  isLocked: Boolean (default: false),
  shareToken: String,             // UUID or null
  collaborators: Array,           // [{ userId, role: 'viewer'|'editor' }]
  writingStyle: String,
  language: String,
  createdAt: Date,
  updatedAt: Date
}
```

### ArticleVersion

```js
{
  _id: ObjectId,
  articleId: ObjectId (ref: 'Article', indexed),
  userId: ObjectId (ref: 'User'),
  label: String,
  sections: Mixed,                // snapshot of article.sections at save time
  wordCount: Number,
  createdAt: Date
}
```

### Sessions (managed by connect-mongo)

```js
{ _id: String, session: Mixed, expires: Date }
```

---

## 5. Frontend Architecture

Three HTML files. `login.html` and `dashboard.html` contain inline JS. `index.html` (editor) loads `public/js/app.js` and `public/css/app.css` as separate files.

### `login.html`
- Google Sign-in button → `GET /auth/google`
- Email/password form → `POST /auth/login` and `POST /auth/register`
- Error message display from `?error=` query param

### `dashboard.html`

Fetches `GET /api/articles` on load and renders article cards. Actions:
- `+` button → `POST /api/articles` → redirect to `/?id=<newId>`
- Card click → `GET /?id=<articleId>`
- Clone icon → `POST /api/articles/:id/clone`
- Delete icon → `DELETE /api/articles/:id` + confirmation → re-render

### `index.html` + `public/js/app.js` (Editor)

**State model:**

```js
const state = {
  articleId: String,              // from URL ?id= param
  sections: {
    [sectionId]: { prose: String, tables: [] }
  },
  library: [
    { pmid, title, authors, year, journal, abstract,
      pmcid, isOA, fullText, refNumber, selected }
  ],
  writingStyle: String,
}
```

**Persistence:**
- On load: `GET /api/articles/:id` → populate state
- Auto-save: `PUT /api/articles/:id` with 1500ms debounce
- `localStorage` retained as write-behind fallback only

**Layout:** Two-column CSS Grid (`1fr 1fr`), responsive below 960px. Left column: editing UI. Right column: sticky live preview.

**Font Size:** `FONT_SIZES = [13,14,15,16,17,18,20]`. `applyFontSize(size)` sets `document.documentElement.style.fontSize` to apply to all `rem`-based elements.

**AI Streaming:** `streamToAiBox(url, body, sectionId, label, canApply)` POSTs to an endpoint, reads the `ReadableStream` via `TextDecoder`, and appends chunks to the AI suggestion box.

**Coherence Fix:** `applyFlowRecommendation(sectionId, instruction)` collects `prevSection` and `nextSection` objects from `state.sections`, then calls `streamToAiBox("/api/coherence-fix", {...})` to get a context-aware rewrite.

**Citation Linking:** `enhanceCitations(text, library)` converts `[Author et al., YYYY]` patterns to superscript links in the preview pane.

**Reference Library:** Collapsible panel with two tabs — References (PMID import) and PubMed Search.

**Version History:** `saveVersionManual()` and `openVersionHistory()` call `ensureArticleSaved()` first to guarantee the article exists in the DB before creating/listing versions.

---

## 6. Backend: Route and Endpoint Summary

### Auth Routes

| Method | Path | Description |
|---|---|---|
| GET | /auth/google | Redirect to Google OAuth |
| GET | /auth/google/callback | Handle OAuth callback, upsert user, set session |
| POST | /auth/register | Create local account |
| POST | /auth/login | Verify local credentials, set session |
| POST | /auth/logout | Destroy session |
| GET | /auth/me | Return current user |

### Article Routes

| Method | Path | Description |
|---|---|---|
| GET | /api/articles | List all articles for signed-in user |
| POST | /api/articles | Create blank article |
| GET | /api/articles/:id | Full article (403 if not owner or collaborator) |
| PUT | /api/articles/:id | Full overwrite — auto-save (403 if not owner; 400 if locked) |
| DELETE | /api/articles/:id | Permanent delete (403 if not owner) |
| POST | /api/articles/:id/clone | Deep-copy article |
| POST | /api/articles/:id/lock | Lock article |
| POST | /api/articles/:id/unlock | Unlock article |
| POST | /api/articles/:id/share | Generate or return public share token |
| DELETE | /api/articles/:id/share | Revoke public share token |
| POST | /api/articles/:id/collaborators | Invite collaborator (viewer/editor) |
| DELETE | /api/articles/:id/collaborators/:uid | Remove collaborator |
| GET | /share/:token | Public read-only article view (no auth) |

### Version Routes

| Method | Path | Description |
|---|---|---|
| GET | /api/articles/:id/versions | List version metadata (no content) |
| POST | /api/articles/:id/versions | Create a named snapshot (cap: 50) |
| POST | /api/articles/:id/versions/:vid/restore | Restore version (saves current as "Before restore") |
| DELETE | /api/articles/:id/versions/:vid | Delete a version |

### Settings Routes

| Method | Path | Description |
|---|---|---|
| GET | /api/settings | Return user settings (keys masked) |
| PUT | /api/settings | Update provider/model/apiKey/ncbiKey/preferences |
| DELETE | /api/settings/llm-key | Remove stored BYOK LLM key |
| DELETE | /api/settings/ncbi-key | Remove stored NCBI key |
| GET | /api/llm/models | List available Groq models |

### AI Endpoints (all POST, stream `text/plain` unless noted)

| Endpoint | Description | Max Tokens |
|---|---|---|
| /api/generate | Section draft | 1800 |
| /api/improve | Improve existing prose | 1800 |
| /api/keypoints | Key points to cover | 900 |
| /api/refine | Refine with instruction | 1800 |
| /api/generate-table | HTML table | 1200 |
| /api/coherence-check | Full-article flow analysis | 1500 |
| /api/coherence-fix | Context-aware section rewrite using adjacent sections | 1800 |
| /api/grammar-check | Grammar + style issues per section | 800 |
| /api/suggest-sections | Suggest section titles (JSON, not streamed) | — |
| /api/agent/draft | Multi-section draft (SSE, `text/event-stream`) | — |

All AI calls use `createCompletion()` from `src/services/llmService.js`. This wraps `openai` npm package pointed at `https://api.groq.com/openai/v1` with automatic round-robin rotation across `GROQ_API_KEY` through `GROQ_API_KEY_4` on HTTP 429 responses.

### PubMed Endpoints (POST, JSON)

| Endpoint | Description |
|---|---|
| /api/pubmed-search | esearch + efetch XML → parsed articles (max 10) |
| /api/fetch-pmids | Batch fetch + OA enrichment via PMC BioC API (concurrency 3) |

### Export and Utility

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/export-docx | Server-side Word document via `docx` package |
| POST | /api/export-pdf | Server-side PDF via Puppeteer; falls back to 501 if Chromium absent |
| GET | /api/version | Returns `{ version, sha, env }` |

### Middleware Stack (registration order in `src/app.js`)

```
pino-http (structured HTTP logging)
express.json() + express.urlencoded()
express-session (connect-mongo store)
passport.initialize() + passport.session()
express-rate-limit (applied per route group)
express.static('public') + express.static('assets')
route handlers
requireAuth guard (per-route)
global error handler (last)
```

---

## 7. LLM Service: Key Rotation

`src/services/llmService.js` builds a key pool at startup:

```js
const GROQ_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
].filter(Boolean);
```

`createCompletion(params)` iterates the pool on 429 errors. On success, it sticks to the working key for subsequent requests. On full exhaustion, it throws the last 429 error. Non-429 errors (401, 400, network) throw immediately — no rotation attempted.

`getClientForUser(user)` returns a client using the user's BYOK key if set, otherwise falls back to the pool via `getClient()`.

---

## 8. Data Flows

### Article Auto-Save

```
User types in any section textarea
  → updateSection(id, value) → state.sections[id].prose = value
  → scheduleAutoSave() — 1500ms debounced
  → PUT /api/articles/:id { title, topic, authors, keywords, sections, library, customSections, wordCount }
  → MongoDB: Article.findOneAndUpdate({ _id, userId })
  → localStorage.setItem('mm-article', JSON.stringify(...)) — write-behind cache
```

### AI Generation

```
User clicks "Generate Draft"
  → getSelectedPubmedContext() → selected library entries → pubmedContext string
  → POST /api/generate { topic, sectionId, sectionTitle, notes, pubmedContext }
  → getSectionContext() → topic-aware prompt
  → createCompletion({ stream: true, model, messages })
    → tries GROQ_KEY[_keyIndex]; rotates on 429
  → ReadableStream → TextDecoder → append to AI suggestion box
```

### Coherence Fix

```
User clicks "Apply" on a Flow Check recommendation
  → applyFlowRecommendation(sectionId, instruction)
  → collects prevSection and nextSection from state.sections (title + prose)
  → POST /api/coherence-fix { topic, sectionTitle, currentDraft, recommendation,
       prevSection, nextSection, language, writingStyle }
  → AI rewrites section aware of adjacent context (last 400 chars prev / first 400 chars next)
  → stream into AI suggestion box with canApply = true
```

### Version Save

```
User clicks "Save Version"
  → ensureArticleSaved() — awaits PUT /api/articles/:id if articleId is null
  → POST /api/articles/:id/versions { label }
  → ArticleVersion.create({ articleId, userId, sections snapshot, wordCount, label })
  → If count > 50: oldest version deleted
```

---

## 9. Key Design Decisions

| Decision | Rationale |
|---|---|
| MongoDB + Mongoose | Fits JSON article state shape directly. Mixed type for `sections` allows flexible section additions without schema migrations |
| express-session + connect-mongo | Sessions in the same MongoDB Atlas cluster — no Redis needed on Railway Hobby |
| Passport.js with two strategies | Google OAuth for convenience; local email/password as fallback |
| bcrypt rounds: 12 prod / 1 test | 12 rounds meets security minimum. Round 1 in tests cuts test suite time significantly |
| Full article overwrite on auto-save | Simplest correctness guarantee. Article document < 100KB — well within M0 Atlas limits |
| localStorage as write-behind cache | No data loss if server temporarily unreachable. Server is always authoritative on reconnect |
| Groq via openai npm package | Groq's API is OpenAI-compatible; only `baseURL` swap required |
| `createCompletion()` wrapper for key rotation | All AI routes call `createCompletion()` instead of `getClient().chat.completions.create()` directly. Rotation is transparent — 429s never surface to the user if any key has remaining quota |
| AES-256-GCM for BYOK keys | Symmetric encryption; `ENCRYPTION_KEY` env var is the single secret. Keys are never returned in API responses |
| `/api/coherence-fix` separate from `/api/refine` | Coherence fix needs adjacent section context; `/api/refine` is a generic instruction-following endpoint. Keeping them separate avoids polluting the refine prompt with optional context parameters |
| Sprint 3 modular refactor | `server.js` monolith split into `src/` modules for testability and maintainability. Routes are thin; business logic lives in services |

---

## 10. Planned Architecture Changes

| Sprint | Change |
|---|---|
| Sprint 7 | Article Planner — 3-step wizard (Research, Structure, Publication Strategy). Web search integration. New planner routes. See `docs/sprints/SPRINT-7.md` |
| Sprint 7 | LaTeX export endpoint (`/api/export-latex`) |
| Sprint 8 | Mastra agent orchestration. Socket.io + CRDT real-time collaboration |
| Sprint 8 | `VectorStoreAdapter` + `EmbeddingAdapter` for RAG. LanceDB embedded vector store. File upload storage |
