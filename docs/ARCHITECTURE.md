# Product Architecture: Medical Article Writer

---

## Document Info

| Field | Value |
|---|---|
| Version | 2.0 |
| Last Updated | 2026-04-04 |
| Reflects | Sprint 1 delivered state |

This document describes the **current** architecture. It is updated when the structure changes — not when features are planned. The Sprint 3 refactor will produce a major update; the Sprint 3 target structure is documented in `docs/sprints/SPRINT-3.md`.

---

## 1. System Overview

Medical Article Writer is a multi-user Node/Express web application backed by MongoDB Atlas and deployed on Railway. Users authenticate with Google OAuth or email/password and access a personal dashboard of articles stored server-side.

Current file structure after Sprint 1:

```
article-writer/
├── server.js           # Express app: all routes, middleware, DB connection, Passport config
├── login.html          # Unauthenticated entry point — Google + email/password sign-in
├── dashboard.html      # Post-auth landing page — article grid with CRUD actions
├── index.html          # Article editor — section editing, AI, references, export UI
├── assets/
│   └── gsk-logo.svg
├── package.json
├── jest.config.js
├── .env                # Production secrets (gitignored)
├── .env.development    # Local dev overrides (gitignored)
└── .env.example        # Documented template (tracked in git)
```

> **Sprint 3 target:** `server.js` will be split into `src/routes/`, `src/controllers/`, `src/services/`, `src/models/`, `src/middleware/`, `src/utils/`, `src/config/`. Inline CSS/JS in `index.html` extracted to `public/style.css` and `public/app.js`. See `docs/sprints/SPRINT-3.md`.

---

## 2. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                            Browser                               │
│                                                                  │
│  login.html          dashboard.html          index.html          │
│  (unauthenticated)   (article list)          (editor + preview)  │
│       │                    │                       │             │
│       └────────────────────┴───────────────────────┘            │
│                            │ fetch() / form POST                 │
└────────────────────────────┼─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                       server.js (Express)                        │
│                                                                  │
│  Auth Middleware (Passport.js)                                   │
│  Session Middleware (express-session + connect-mongo)            │
│  Static Middleware (serves HTML files + assets)                  │
│                                                                  │
│  /auth/google         /auth/google/callback  ──► Google OAuth    │
│  /auth/register       /auth/login                                │
│  /auth/logout         /auth/me                                   │
│                                                                  │
│  /api/articles (CRUD)          ──► MongoDB Atlas (Article model) │
│                                                                  │
│  /api/generate        /api/improve                               │
│  /api/keypoints       /api/refine        ──► Groq API            │
│  /api/generate-table  /api/coherence-check                       │
│  /api/suggest-sections                                           │
│                                                                  │
│  /api/pubmed-search   /api/fetch-pmids   ──► NCBI E-utilities    │
│                                                                  │
│  /api/export-docx                        ──► docx npm package    │
│  /api/version                                                    │
│                                                                  │
│  GET /*                                  ──► index.html (guarded)│
└──────────────────────────────────────────────────────────────────┘
                             │
              ┌──────────────▼──────────────┐
              │       MongoDB Atlas          │
              │  users collection            │
              │  articles collection         │
              │  sessions collection         │
              └─────────────────────────────┘
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

`requireAuth` middleware redirects to `/login` if `req.isAuthenticated()` is false. Applied to all `/api/*` routes and `GET /`.

```
Public:    /auth/*, /login, /api/version
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
  createdAt: Date,
  updatedAt: Date
}
```

### Sessions (managed by connect-mongo)

```js
{ _id: String, session: Mixed, expires: Date }
```

---

## 5. Frontend Architecture

Three HTML files, each self-contained with inline CSS and JavaScript (pre-Sprint 3).

### `login.html`
- Google Sign-in button → `GET /auth/google`
- Email/password form → `POST /auth/login` and `POST /auth/register`
- Error message display from `?error=` query param

### `dashboard.html`

Fetches `GET /api/articles` on load and renders article cards. Actions:
- `+` button → `POST /api/articles` → redirect to `/?id=<newId>`
- Card click → `GET /?id=<articleId>`
- Delete icon → `DELETE /api/articles/:id` + confirmation → re-render

### `index.html` (Editor)

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
  ]
}
```

**Persistence (post-Sprint 1):**
- On load: `GET /api/articles/:id` → populate state
- Auto-save: `PUT /api/articles/:id` with debounced 1500ms
- `localStorage` retained as write-behind fallback only

**Layout:** Two-column CSS Grid (`1fr 1fr`), responsive below 960px. Left column: editing UI. Right column: sticky live preview.

**AI Streaming:** All AI actions call `streamToAiBox(url, body, sectionId, label, canApply)` which POSTs to an endpoint, reads the `ReadableStream` via `TextDecoder`, and appends chunks to the AI suggestion box.

**Citation Linking:** `enhanceCitations(text, library)` converts `[Author et al., YYYY]` patterns to superscript links in the preview pane.

**Reference Library:** Collapsible panel with two tabs — References (PMID import) and PubMed Search.

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
| GET | /api/articles/:id | Full article (403 if not owner) |
| PUT | /api/articles/:id | Full overwrite — auto-save (403 if not owner; 400 if locked) |
| DELETE | /api/articles/:id | Permanent delete (403 if not owner) |

### AI Endpoints (all POST, stream `text/plain`)

| Endpoint | Max Tokens | Uses pubmedContext |
|---|---|---|
| /api/generate | 1800 | Yes |
| /api/improve | 1800 | Yes |
| /api/keypoints | 900 | Yes |
| /api/refine | 1800 | Yes |
| /api/generate-table | 1200 | Yes |
| /api/coherence-check | 1500 | No (uses full article sections) |
| /api/suggest-sections | — | No (returns JSON, not streamed) |

All AI calls use `openai` npm package pointed at `https://api.groq.com/openai/v1` with `llama-3.3-70b-versatile`.

`getSectionContext(topic, sectionId, sectionTitle)` maps 13 section IDs to topic-aware prompt descriptions.

### PubMed Endpoints (POST, JSON)

| Endpoint | Description |
|---|---|
| /api/pubmed-search | esearch + efetch XML → parsed articles (max 10) |
| /api/fetch-pmids | Batch fetch + OA enrichment via PMC BioC API (concurrency 3) |

`fetchWithRetry(url, maxRetries=2)` wraps all NCBI calls with 1s retry delay on network error.

### Export and Utility

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/export-docx | Server-side Word document via `docx` package |
| GET | /api/version | Returns `{ version, sha, env }` for footer badge |

### Middleware Stack (in registration order)

```
morgan (HTTP logging)
express.json() + express.urlencoded()
express-session (connect-mongo store)
passport.initialize() + passport.session()
express.static('assets')
app routes
requireAuth guard (per-route)
global error handler (last)
```

---

## 7. Data Flows

### Sign In (Google OAuth)

```
User clicks "Sign in with Google"
  → GET /auth/google
  → Google consent screen
  → GET /auth/google/callback?code=...
  → Passport exchanged code → Google profile
  → Upsert User (googleId + email + displayName + avatarUrl)
  → req.login() → session created in MongoDB
  → Redirect to /dashboard
```

### Sign In (Email/Password)

```
User submits form
  → POST /auth/login { email, password }
  → Passport Local: find User by email, bcrypt.compare
  → req.login() → session created
  → Redirect to /dashboard
```

### Article Auto-Save

```
User types in any section textarea
  → updateSection(id, value) → state.sections[id].prose = value
  → scheduleAutoSave() — 1500ms debounced
  → PUT /api/articles/:id { title, topic, authors, keywords, sections, library, customSections, wordCount }
  → MongoDB: Article.findOneAndUpdate({ _id, userId })
  → localStorage.setItem('mm-article', JSON.stringify(...)) — write-behind cache
```

### AI Generation with Literature Grounding

```
User clicks "Generate Draft"
  → getSelectedPubmedContext() → selected library entries → pubmedContext string
  → POST /api/generate { topic, sectionId, sectionTitle, notes, pubmedContext }
  → getSectionContext() → topic-aware prompt
  → Groq llama-3.3-70b-versatile (stream: true)
  → ReadableStream → TextDecoder → append to #ai-content-{id}
```

### Reference Import (PMID)

```
User pastes PMIDs → POST /api/fetch-pmids { pmids }
  → NCBI efetch (batch metadata XML) → parsePubMedXML()
  → NCBI elink × N (PMC ID lookup, concurrency=3)
  → NCBI oa.fcgi × N (OA check)
  → BioC API × OA papers (full-text, up to 6000 chars)
  → { found: enrichedArticles, notFound }
  → state.library.push(...) → renderLibrary() → scheduleAutoSave()
```

---

## 8. Key Design Decisions

| Decision | Rationale |
|---|---|
| MongoDB + Mongoose | Fits JSON article state shape directly. Mixed type for `sections` allows flexible section additions without schema migrations |
| express-session + connect-mongo | Sessions in the same MongoDB Atlas cluster — no Redis needed on Railway Hobby |
| Passport.js with two strategies | Google OAuth for convenience; local email/password as fallback |
| bcrypt rounds: 12 prod / 1 test | 12 rounds meets security minimum. Round 1 in tests cuts test suite time from ~30s to ~2s |
| Full article overwrite on auto-save | Simplest correctness guarantee. Article document < 100KB — well within M0 Atlas limits |
| localStorage as write-behind cache | No data loss if server temporarily unreachable. Server is always authoritative on reconnect |
| `{ index: false }` on express.static | Prevents `index.html` being served without auth guard |
| Groq via openai npm package | Groq's API is OpenAI-compatible; only `baseURL` swap required |
| Server-side DOCX, client-side PDF (current) | `docx` requires Node. `html2pdf.js` is browser-only. Sprint 4 adds Puppeteer as server-side PDF primary |
| localStorage retained as fallback | Removed as primary persistence in Sprint 1 but kept as emergency cache. Will be deprecated once server reliability is proven |

---

## 9. Planned Architecture Changes

| Sprint | Change |
|---|---|
| Sprint 2 | `.env.development` / `.env` env separation. `semantic-release` automated versioning. GitHub Actions CI/CD |
| Sprint 3 | Refactor `server.js` into `src/` modular structure. Extract frontend CSS + JS from `index.html` |
| Sprint 4 | `puppeteer-core` server-side PDF. `express-rate-limit` on AI endpoints. `getSectionContext` service extraction |
| Sprint 6 | `ArticleVersion` Mongoose model. `shareToken` + `collaborators` on Article. AES-256-GCM encrypted BYOK keys. `article.writingStyle` field |
| Sprint 7 | `VectorStoreAdapter` + `EmbeddingAdapter` interfaces. LanceDB embedded vector store. File upload storage |
| Sprint 8 | Mastra agent orchestration framework. Custom MCP servers. Socket.io + CRDT real-time collaboration |
