# API Reference — Medical Article Writer

All endpoints are on the same Express server. Base URL: `http://localhost:3000`.

**Conventions:**
- All request/response bodies are `application/json` unless noted
- AI endpoints return `text/plain` with `Transfer-Encoding: chunked` (streaming)
- Errors return `{ "error": "Human-readable message", "code": "MACHINE_CODE" }` with appropriate HTTP status
- All `/api/*` routes (except `/api/version`) require an active session — unauthenticated requests return `401`

---

## Auth Endpoints

### GET /auth/google
Redirect to Google OAuth consent screen.

**Response:** `302` redirect to Google.

---

### GET /auth/google/callback
Handle Google OAuth callback. Called by Google after user grants permission.

**Response:** `302` to `/dashboard` on success; `/login?error=oauth_failed` on failure.

---

### POST /auth/register
Create a new local account.

**Request**
```json
{
  "email": "string (required)",
  "password": "string (required, min 8 chars)",
  "displayName": "string (optional)"
}
```
**Response:** `201` + redirect to `/dashboard`.  
**Errors:** `400` missing fields; `409 EMAIL_TAKEN` duplicate email.

---

### POST /auth/login
Sign in with email and password.

**Request**
```json
{
  "email": "string (required)",
  "password": "string (required)"
}
```
**Response:** `200` + redirect to `/dashboard`.  
**Errors:** `401 INVALID_CREDENTIALS` — same message for wrong email or wrong password (no user enumeration).

---

### POST /auth/logout
Destroy the current session and sign out.

**Response:** `200` + redirect to `/login`. Idempotent.

---

### GET /auth/me
Return the currently authenticated user.

**Response**
```json
{
  "id": "string",
  "email": "string",
  "displayName": "string",
  "avatarUrl": "string | null"
}
```
**Errors:** `401` if not authenticated.

---

## Article Endpoints

### GET /api/articles
List all articles for the authenticated user, sorted by `updatedAt` descending.

**Response**
```json
[
  {
    "_id": "string",
    "title": "string",
    "topic": "string",
    "wordCount": "number",
    "createdAt": "ISO date string",
    "updatedAt": "ISO date string"
  }
]
```

---

### POST /api/articles
Create a new blank article.

**Request body:** empty `{}` or omitted.

**Response:** `201` — full article object with empty sections and library.

---

### GET /api/articles/:id
Fetch a full article by ID.

**Response:** Full article object including all sections, library, and customSections.  
**Errors:** `400 INVALID_ID`; `403 FORBIDDEN` (not owner); `404 NOT_FOUND`.

---

### PUT /api/articles/:id
Full overwrite of an article (auto-save endpoint).

**Request**
```json
{
  "title": "string",
  "topic": "string",
  "authors": "string",
  "keywords": "string",
  "sections": { "[sectionId]": { "prose": "string", "tables": [] } },
  "library": [],
  "customSections": [],
  "wordCount": "number"
}
```
**Response:** `200` + updated article object.  
**Errors:** `400 ARTICLE_LOCKED`; `403 FORBIDDEN`; `404 NOT_FOUND`.

---

### DELETE /api/articles/:id
Permanently delete an article.

**Response:** `204 No Content`.  
**Errors:** `403 FORBIDDEN`; `404 NOT_FOUND`.

### POST /api/articles/:id/clone
Deep-copy an article owned by the authenticated user. The clone gets `"Copy of …"` prepended to its title.

**Response:** `201 Created`
```json
{ "article": { "_id": "...", "title": "Copy of My Article", ... } }
```
**Errors:** `403 FORBIDDEN`; `404 NOT_FOUND`.

---

## Utility

### GET /api/version
Return the running server version. No auth required.

**Response**
```json
{
  "version": "string (semver, e.g. 1.0.0)",
  "sha": "string (git short SHA, e.g. a3f2b1c)",
  "env": "string (development | production)"
}
```

---

## AI Endpoints (Streaming)

### POST /api/generate
Generate a full section draft.

**Request**
```json
{
  "topic": "string (required) — medical topic",
  "sectionId": "string (required) — a section ID (standard or custom)",
  "sectionTitle": "string (required)",
  "notes": "string (optional) — author hints",
  "pubmedContext": "string (optional) — selected abstracts/full-text"
}
```
**Response:** `text/plain` stream of generated prose.
**Errors:** `400` missing topic.

---

### POST /api/improve
Rewrite existing section text for academic rigour and flow.

**Request**
```json
{
  "topic": "string (required)",
  "sectionTitle": "string (required)",
  "content": "string (required) — existing prose",
  "pubmedContext": "string (optional)"
}
```
**Response:** `text/plain` stream of improved prose.
**Errors:** `400` missing topic or content.

---

### POST /api/keypoints
List essential key points to cover in a section.

**Request**
```json
{
  "topic": "string (required)",
  "sectionId": "string (required)",
  "sectionTitle": "string (required)",
  "pubmedContext": "string (optional)"
}
```
**Response:** `text/plain` stream of bulleted key points.
**Errors:** `400` missing topic.

---

### POST /api/refine
Refine an existing AI draft with a user instruction.

**Request**
```json
{
  "topic": "string (required)",
  "sectionTitle": "string (required)",
  "currentDraft": "string (required)",
  "instruction": "string (required) — e.g. 'make more concise'",
  "pubmedContext": "string (optional)"
}
```
**Response:** `text/plain` stream of refined prose.
**Errors:** `400` missing topic, currentDraft, or instruction.

---

### POST /api/generate-table
Generate an HTML table for a section.

**Request**
```json
{
  "topic": "string (required)",
  "sectionTitle": "string (required)",
  "tableDescription": "string (required) — e.g. 'Comparison of CAR-T therapies'",
  "pubmedContext": "string (optional)"
}
```
**Response:** `text/plain` stream of an HTML `<table>` element.
**Errors:** `400` missing topic or tableDescription.

---

### POST /api/suggest-sections
Suggest relevant section titles for the Main Body of a review article.

**Request**
```json
{
  "topic": "string (required) — medical topic",
  "existingSections": ["string"] 
}
```
`existingSections` is optional; when supplied, the AI avoids suggesting duplicates.

**Response**
```json
{ "suggestions": ["string"] }
```
Returns up to 10 section title strings ranked by relevance.
**Errors:** `400` missing topic; `500` LLM failure.

---

### POST /api/coherence-check
Review the full article for flow and narrative consistency.

**Request**
```json
{
  "topic": "string (required)",
  "sections": [
    { "title": "string", "prose": "string" }
  ]
}
```
**Response:** `text/plain` stream with structured analysis (Overall Assessment, Section Flow, Issues, Recommendations).
**Errors:** `400` missing topic or empty sections array.

---

### POST /api/grammar-check
Check a section for grammar and style issues (passive voice, long sentences, informal language, hedging).

**Request**
```json
{
  "content": "string (required)",
  "topic": "string (optional)",
  "sectionTitle": "string (optional)",
  "language": "string (optional, default: English)"
}
```
**Response:** `text/plain` stream. Each issue on its own line: `ISSUE | TYPE | fragment | suggestion`. Returns `NO_ISSUES` if none found.
**Errors:** `400` missing content.

---

## PubMed Endpoints (JSON)

### POST /api/pubmed-search
Search PubMed for relevant articles.

**Request**
```json
{
  "query": "string (required)",
  "maxResults": "number (optional, default 8)"
}
```
**Response**
```json
{
  "articles": [
    {
      "pmid": "string",
      "title": "string",
      "authors": "string",
      "year": "string",
      "journal": "string",
      "abstract": "string"
    }
  ],
  "total": "number"
}
```
**Errors:** `400` empty query; `500` NCBI unavailable.

---

### POST /api/fetch-pmids
Fetch metadata and OA full-text for a list of PMIDs.

**Request**
```json
{
  "pmids": ["string"] 
}
```
Max 50 PMIDs per request. Non-numeric values are silently filtered.

**Response**
```json
{
  "found": [
    {
      "pmid": "string",
      "title": "string",
      "authors": "string",
      "year": "string",
      "journal": "string",
      "abstract": "string",
      "pmcid": "string | null",
      "isOA": "boolean",
      "fullText": "string | null"
    }
  ],
  "notFound": ["string"]
}
```
**Errors:** `400` invalid or empty pmids array; `500` NCBI unavailable.

---

## Export Endpoint

### POST /api/export-docx
Generate and download a Word document.

**Request**
```json
{
  "title": "string",
  "authors": "string",
  "keywords": "string",
  "sections": [
    {
      "title": "string",
      "prose": "string",
      "tables": [
        { "html": "string", "caption": "string" }
      ]
    }
  ]
}
```
**Response:** `application/vnd.openxmlformats-officedocument.wordprocessingml.document` binary with `Content-Disposition: attachment`.
**Errors:** `500` docx generation failure.
