# Product Architecture: Medical Article Writer

---

## 1. System Overview

Medical Article Writer is a **two-file, no-build full-stack application**. There is no bundler, no framework, no database, and no authentication layer. The entire product ships as:

```
article-writer/
├── server.js       # Express API server
├── index.html      # Complete frontend (HTML + CSS + JS, all inline)
├── package.json
└── .env            # API keys (not committed)
```

The server serves `index.html` as a static file and exposes a set of JSON/streaming API endpoints. The frontend is a single self-contained file with all styles and logic inline.

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│                                                             │
│  ┌──────────────────────┐   ┌───────────────────────────┐  │
│  │   Left Column        │   │   Right Column            │  │
│  │                      │   │                           │  │
│  │  Article Metadata    │   │  Live Preview             │  │
│  │  Reference Library   │   │  (sticky, scrollable)     │  │
│  │  ├─ References tab   │   │                           │  │
│  │  └─ PubMed Search tab│   │                           │  │
│  │  Section Accordion   │   │                           │  │
│  │  Paper Flow Checker  │   │                           │  │
│  └──────────┬───────────┘   └───────────────────────────┘  │
│             │ fetch() POST                                   │
└─────────────┼───────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│                     server.js (Express)                     │
│                                                             │
│   /api/generate          /api/improve                       │
│   /api/keypoints         /api/refine          ──► Groq API  │
│   /api/generate-table    /api/coherence-check               │
│                                                             │
│   /api/pubmed-search     /api/fetch-pmids     ──► NCBI API  │
│                                                             │
│   /api/export-docx                            ──► docx pkg  │
│                                                             │
│   GET /*                                      ──► index.html│
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Frontend Architecture (`index.html`)

### 3.1 Layout

Two-column CSS Grid (`grid-template-columns: 1fr 1fr`), responsive to single column below 960px.

- **Left column** — scrollable. Contains all editing UI.
- **Right column** — `position: sticky`, fills viewport height. Contains the live preview.

### 3.2 State Model

All mutable application state lives in a single plain object:

```js
const state = {
  sections: {
    [sectionId]: { prose: string, tables: [] }
  },
  library: [
    { pmid, title, authors, year, journal, abstract,
      pmcid, isOA, fullText, refNumber, selected }
  ]
}
```

`SECTIONS` is a separate array of section definitions (id, num, title, placeholder, isCustom). It is mutated when custom sections are added or deleted.

There is no reactive framework. Every change calls one or more of:
- `updateSection(id, value)` — updates `state.sections[id].prose`
- `renderLibrary()` — re-renders the reference list DOM
- `renderSections()` — re-renders the full section accordion
- `updatePreview()` — re-renders `#article-preview`

### 3.3 Persistence

Auto-save writes the full state to `localStorage` key `mm-article` with a 1500ms debounce after any change:

```js
localStorage.setItem("mm-article", JSON.stringify({
  topic, title, authors, keywords,
  sections: state.sections,
  library: state.library,
  customSections: SECTIONS.filter(s => s.isCustom)
}))
```

On page load, `loadFromStorage()` restores all fields, re-injects custom sections into `SECTIONS`, and re-renders.

### 3.4 AI Streaming

All AI actions go through a single function `streamToAiBox(url, body, sectionId, label, canApply)`:

1. POST to the given endpoint with `body` as JSON
2. Read the response as a `ReadableStream` via `getReader()` / `TextDecoder`
3. Append each decoded chunk to `contentEl.textContent`
4. On completion, make the content editable if `canApply` is true

Each AI action constructs its `body` before calling `streamToAiBox`:

```
generateDraft   → { topic, sectionId, sectionTitle, notes, pubmedContext }
improveSection  → { topic, sectionTitle, content, pubmedContext }
getKeyPoints    → { topic, sectionId, sectionTitle, pubmedContext }
expandToProse   → { topic, sectionTitle, currentDraft, instruction (fixed), pubmedContext }
refineSection   → { topic, sectionTitle, currentDraft, instruction (user input), pubmedContext }
```

`pubmedContext` is assembled by `getSelectedPubmedContext()`: all `state.library` entries with `selected === true`, each contributing `fullText` (OA papers, up to 3000 chars) or `abstract`.

### 3.5 Citation Linking

`enhanceCitations(text, library)` runs inside `updatePreview()` on every section's prose. It replaces `[Author et al., YYYY]` patterns with:
- A superscript `<sup class="cite-link">` linked to the matching library entry (fuzzy match on surname + year)
- Or a highlighted `<span class="cite-unmatched">` if no match is found

### 3.6 Reference Library Tabs

The Reference Library panel has two tabs sharing one collapsible body:

```
#reflib-body
├── .reflib-tabs (tab bar)
├── #reflib-tab-references (default visible)
│   ├── PMID textarea + Fetch button
│   ├── Select All / Deselect All / Sync References
│   └── #reflib-list (rendered by renderLibrary())
└── #reflib-tab-pubmed (hidden by default)
    ├── #pubmed-query input + Search button
    └── #pubmed-results (rendered by renderPubmedResults())
```

`toggleRefLib()` shows/hides `#reflib-body`. `switchRefTab(e, tab)` toggles visibility between the two tab content divs and moves the `.active` class on the tab buttons.

---

## 4. Backend Architecture (`server.js`)

### 4.1 AI Endpoints

All six AI endpoints follow the same pattern:

1. Validate required fields from `req.body`
2. Build a prompt string (injecting topic, section context, user content, and `pubmedContext` where applicable)
3. Call `client.chat.completions.create({ stream: true, ... })` via the `openai` npm package pointed at Groq
4. Set `Content-Type: text/plain` + `Transfer-Encoding: chunked`
5. Stream each chunk with `res.write(text)` → `res.end()`

```
Endpoint               Max Tokens   Uses pubmedContext
/api/generate          1800         ✅
/api/improve           1800         ✅
/api/keypoints          900         ✅
/api/refine            1800         ✅
/api/generate-table    1200         ✅
/api/coherence-check   1500         ✗ (uses full article sections instead)
```

**`getSectionContext(topic, sectionId, sectionTitle)`** maps each of the 13 section IDs to a topic-aware natural language description used in prompts (e.g. the `references` section gets a prompt requesting Vancouver format with 30–40 entries).

### 4.2 PubMed Endpoints

**`/api/pubmed-search`**
1. `esearch.fcgi` → get PMID list (max 10, sorted by relevance)
2. `efetch.fcgi` → fetch full records as XML
3. `parsePubMedXML(xml)` → extract title, authors, year, journal, abstract, PMID from each `<PubmedArticle>` block using regex
4. Return `{ articles, total }`

**`/api/fetch-pmids`**
1. Validate and deduplicate PMIDs (max 50)
2. `efetch.fcgi` → batch fetch metadata XML → `parsePubMedXML()`
3. For each article, `enrichArticle()` runs in parallel batches of 3 (NCBI rate limit):
   - `elink.fcgi` → check if PMC ID exists
   - If yes: `oa.fcgi` → check if Open Access
   - If OA: BioC API → fetch structured full-text, extract INTRO/RESULTS/DISCUSS/CONCL/ABSTRACT passages, concatenate to 6000 chars
4. Return `{ found: enrichedArticles, notFound: [] }`

`fetchWithRetry(url, maxRetries=2)` wraps all NCBI calls with 1s retry delay on network error.

### 4.3 Export Endpoint

**`/api/export-docx`** uses the `docx` npm package:

1. Build `children[]` array of `Paragraph` and `Table` objects
2. Title → bold, centered, size 36; Authors → italic, centered; Keywords → inline bold label
3. Each section: `HeadingLevel.HEADING_1` paragraph + body paragraphs (split on `\n\n`)
4. Tables: parsed from HTML via `parseTableHTML()` (regex extracts `<th>` headers and `<td>` rows), rendered as native `docx.Table` with 100% width
5. `Packer.toBuffer(doc)` → send as `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

---

## 5. Data Flows

### AI Generation with Literature Grounding

```
User clicks "Generate Draft"
  │
  ├─ getSelectedPubmedContext()
  │    └─ state.library.filter(e => e.selected)
  │         └─ each entry: fullText (OA) or abstract, sliced to 3000 chars
  │
  ├─ notes = document.getElementById(`notes-${id}`).value
  │
  └─ POST /api/generate
       { topic, sectionId, sectionTitle, notes, pubmedContext }
         │
         └─ Groq (llama-3.3-70b-versatile)
              └─ stream → streamToAiBox() → #ai-content-{id}
```

### Reference Import (PMID)

```
User pastes PMIDs → fetchPmids()
  │
  └─ POST /api/fetch-pmids { pmids }
       │
       ├─ NCBI efetch (batch metadata)
       ├─ NCBI elink × N (PMC ID lookup, concurrency=3)
       ├─ NCBI oa.fcgi × N (OA check)
       └─ BioC API × OA papers (full-text)
            │
            └─ { found: enrichedArticles, notFound }
                 │
                 ├─ state.library.push(...) for each new article
                 ├─ renderLibrary()
                 └─ scheduleAutoSave()
```

### Export to DOCX

```
User clicks "⬇ DOCX"
  │
  └─ POST /api/export-docx
       { title, authors, keywords,
         sections: [{ title, prose, tables: [{ html, caption }] }] }
         │
         └─ server builds docx.Document
              └─ Packer.toBuffer() → ArrayBuffer → browser download
```

---

## 6. Key Design Decisions

| Decision | Rationale |
|---|---|
| Single `index.html` file | No build step, no framework overhead. Simple to deploy and modify |
| `openai` npm package → Groq | Groq's API is OpenAI-compatible; the same SDK works with `baseURL` swap. Free tier with fast inference |
| Streaming all AI responses | Perceived performance — users see output immediately rather than waiting for full generation |
| `localStorage` only | No auth, no backend complexity. Acceptable for single-user local tool |
| Library as single source of truth for AI context | Eliminates the fragile in-memory `selectedPubmed` Set; selections persist across searches and page refreshes |
| Server-side DOCX, client-side PDF | `docx` package requires Node; `html2pdf.js` is browser-only. PDF is WYSIWYG because it renders the actual preview DOM |
| Concurrency limit of 3 for NCBI enrichment | NCBI anonymous rate limit is 3 req/s; with `NCBI_API_KEY` it is 10 req/s. Batching avoids 429 errors |

---

## 7. Adding New Features

### New AI Action (frontend only)
1. Add a function that calls `streamToAiBox(url, body, id, label, canApply)`
2. Add a `<button>` in the `renderSections()` template string
3. No backend change needed if reusing `/api/refine` with a fixed instruction (e.g. `expandToProse`)

### New AI Endpoint (requires backend)
1. Add `app.post("/api/my-endpoint", ...)` in `server.js` following the streaming pattern
2. Validate inputs, build prompt, stream from Groq
3. Call from frontend with `streamToAiBox` or a custom `fetch` + stream reader

### New Section Type
1. Add an entry to the `SECTIONS` array in `index.html`
2. Add a matching key to `getSectionContext()` map in `server.js`

### New Library Metadata Field
1. Add field to the object pushed in `fetchPmids()` → `insertReference()` → `parsePubMedXML()`
2. Render it in `renderLibrary()`
3. Include it in `getSelectedPubmedContext()` if it should feed AI context
