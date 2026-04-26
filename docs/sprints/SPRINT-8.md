# Sprint 8 — Agentic RAG: "Ask Your Library"

**Status:** Active
**Dates:** Start 2026-04-24 | End TBD
**Priority tier:** High

## Goals

Add an **"Ask Your Library"** panel to the article editor that lets users query their PubMed paper library with natural language. An agentic pipeline (intent classification → Pinecone vector retrieval → tool-augmented synthesis → citation tracking) returns a grounded, cited answer that can be inserted directly into the active section.

Adapted from the agentic-RAG Python repo (https://github.com/shrurastogi/agentic-RAG) into the Node.js stack.

---

## Features in Scope

| ID | Feature | Notes |
|---|---|---|
| F16-3 | Vector Embeddings | OpenAI `text-embedding-3-small` preferred; Mistral `mistral-embed` fallback; BM25-only when neither key present |
| F16-4 | Vector Store | Pinecone cloud (one index, per-article namespaces) |
| F16-5 | RAG Pipeline | Semantic search over PubMed library + agentic synthesis loop |
| F16-6 | "Ask Your Library" UI | Panel in editor with query input, streamed answer, citation chips, insert-to-section |

---

## PR Sequence

| PR | Branch | Description |
|---|---|---|
| 1 | `feature/sprint8-rag-backend` | Sprint doc, `embeddingService.js`, `pineconeService.js`, `ragAgentService.js`, `routes/rag.js`, `app.js` registration, `articles.js` hooks, `.env.example` update |
| 2 | `feature/sprint8-rag-frontend` | Panel HTML in `index.html`, `public/js/app.js` panel logic, `public/css/app.css` styles |
| 3 | `feature/sprint8-rag-tests` | Unit tests for ragService, integration tests for rag routes, API.md update |

---

## Architecture

### Embedding Strategy
- **OpenAI key present**: `text-embedding-3-small` (1536 dims) via `POST https://api.openai.com/v1/embeddings`
- **Mistral key present**: `mistral-embed` (1024 dims) via `POST https://api.mistral.ai/v1/embeddings`
- **Neither key present**: BM25 in-memory fallback (no external call)

### Pinecone Layout
- One index named `PINECONE_INDEX_NAME` (default `article-writer`)
- Namespace per article: `article-{articleId}`
- Vector ID: `{pmid}-chunk-{n}`
- Metadata: `{ pmid, title, authors, year, chunkType, chunkIndex, content }`

### Agent Tools (adapted from agentic-RAG `src/agents/tools.py`)
1. `searchLibrary(query, articleId, topK)` — Pinecone/BM25 retrieval
2. `retrieveStatistics(query, chunks)` — regex extraction of p-values, CIs, ORs
3. `comparePapers(query, chunks)` — LLM cross-paper comparison
4. `verifyClaim(claim, chunks)` — grounding check

### Intent Types (adapted from `src/retrieval/query_processor.py`)
`factual | comparative | statistical | trend | multi-doc | verification`

### SSE Event Schema
```json
{ "type": "thinking", "text": "Classifying intent..." }
{ "type": "token",    "text": "Phase III data..." }
{ "type": "citations","sources": [{"pmid":"...","title":"...","authors":"...","year":"...","snippet":"..."}] }
{ "type": "done" }
```

---

## New Env Vars (`.env.example`)

```
PINECONE_API_KEY=        # Required for vector search
PINECONE_INDEX_NAME=article-writer
```

---

## New Test Requirements

| File | Type | Covers |
|---|---|---|
| `tests/unit/services/ragService.test.js` | Unit | BM25 fallback scoring, chunking logic, intent classification |
| `tests/integration/api/rag.test.js` | Integration | `/api/rag/query` without auth → 401; missing articleId → 400; ingest returns count; delete returns 200 |

---

## Verification Checklist

- [ ] Add `PINECONE_API_KEY` + `PINECONE_INDEX_NAME` to `.env.development`
- [ ] Open editor with an article that has PubMed papers in library
- [ ] Click "Ask Your Library" button — panel opens
- [ ] Type a factual question — thinking steps appear, then streamed answer with citations
- [ ] Click "Insert into section" — answer + `[1][2]` markers appear in active section textarea
- [ ] Delete article — Pinecone namespace is cleared (verify in Pinecone dashboard)
- [ ] Without Pinecone key (or with only Groq key): BM25 fallback works with reduced accuracy
- [ ] `npm test` passes; no regressions
