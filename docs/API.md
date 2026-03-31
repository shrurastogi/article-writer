# API Reference — Medical Article Writer

All endpoints are on the same Express server (`server.js`). Base URL: `http://localhost:3000`.

**Conventions:**
- All request/response bodies are `application/json` unless noted
- AI endpoints return `text/plain` with `Transfer-Encoding: chunked` (streaming)
- Errors return `{ "error": "Human-readable message", "code": "MACHINE_CODE" }` with appropriate HTTP status

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
