# Plan: Agentic RAG Integration — "Ask Your Library" Feature

## Context
The user has an existing agentic-RAG Python repo (Weaviate + LangGraph + BGE embeddings) and wants to bring those concepts into this Node.js article-writer project. The goal is an **"Ask Your Library"** panel in the editor where users can query their PubMed paper library using natural language, get a synthesized answer with citations, and optionally insert that content into the current section.

The agentic-RAG system does: hybrid BM25+semantic search, query intent classification, multi-tool agentic loop, cross-encoder reranking, and citation tracking. We adapt those ideas to fit the existing Express/MongoDB/Groq stack with **Pinecone** as the vector database.

---

## Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Vector DB | **Pinecone** (cloud) | User's explicit choice; free tier available; Node.js SDK |
| Namespacing | One Pinecone index, namespace = `article-{articleId}` | Avoids index proliferation on free tier |
| Embeddings | **OpenAI** `text-embedding-3-small` (1536 dims) preferred; **Mistral** `mistral-embed` fallback; BM25-only if neither available | Reuses existing BYOK provider config |
| Chunking | Abstract → 1 chunk; full-text → 512 tokens / 100 overlap (mirrors agentic-RAG) | Preserves context across long papers |
| Agent loop | Query → intent classify → Pinecone retrieve → optional tool calls → LLM synthesize → stream | Follows existing SSE pattern from `/api/agent/draft` |
| Ingest timing | Auto-ingest when paper added to library; manual re-ingest endpoint | Zero-friction UX |

---

## New Files

### `src/services/embeddingService.js`
Generates embeddings via whichever provider the user has configured.
- `getEmbedding(text, user)` → `Float32Array`
- Uses `user.llmConfig.provider` to pick OpenAI or Mistral embedding endpoint
- Falls back to returning `null` (triggers BM25-only path)

### `src/services/pineconeService.js`
Thin wrapper around `@pinecone-database/pinecone` SDK.
- `upsertPaper(articleId, paper, user)` — chunk + embed + upsert into namespace `article-{articleId}`
- `queryVectors(articleId, queryEmbedding, topK, filter?)` → ranked results with metadata
- `deleteArticleVectors(articleId)` — clean up on article delete
- `bm25Fallback(query, papers, topK)` — pure JS BM25 when no embedding key

### `src/services/ragAgentService.js`
Agentic loop adapted from `agentic-RAG/src/agents/`.
- **Intent classifier** (`classifyIntent(question)`) → one of: `factual | comparative | statistical | trend | multi-doc | verification`
- **Agent tools** (mirrors agentic-RAG's 6 tools, trimmed to 4):
  - `searchLibrary(query, articleId, topK)` — Pinecone or BM25 retrieval
  - `retrieveStatistics(query, chunks)` — extract p-values, CIs, ORs using regex patterns from agentic-RAG
  - `comparePapers(query, selectedChunks)` — LLM-compare findings across 2+ papers
  - `verifyClaim(claim, chunks)` — ground-truth check against source text
- **`runAgentWorkflow(question, articleId, sectionId, user, article)`** → async generator yielding SSE events:
  - `{ type: "thinking", text }` — agent step narration
  - `{ type: "token", text }` — streamed answer token
  - `{ type: "citations", sources: [{pmid, title, authors, year, snippet}] }`
  - `{ type: "done" }`

### `src/routes/rag.js`
New route file, auth-gated via `requireAuth` middleware.
- `POST /api/rag/query` — SSE streaming; body: `{ question, articleId, sectionId }`
- `POST /api/rag/ingest/:articleId` — re-index all papers in library; returns `{ indexed: N }`
- `DELETE /api/rag/article/:articleId` — delete all vectors for article; called from article delete handler

---

## Modified Files

### `src/app.js`
- Register `require('./routes/rag')` alongside existing routes

### `src/routes/articles.js`
- After saving a paper to `article.library` (POST to library endpoint), call `pineconeService.upsertPaper(...)` in the background
- On article DELETE, call `pineconeService.deleteArticleVectors(articleId)`

### `public/js/app.js`
Add **"Ask Your Library"** panel logic:
- Panel toggle button in the editor toolbar (next to existing AI buttons)
- `openRagPanel()` / `closeRagPanel()`
- `submitRagQuery(question, sectionId)` — POST to `/api/rag/query`, read SSE stream
- `handleRagEvent(evt)` — render thinking steps, stream tokens, render citation chips
- `insertRagAnswer(text, citations)` — appends answer + inline `[N]` markers to the active section's prose textarea

### `public/css/app.css`
Add styles for:
- `.rag-panel` — right-side panel, same visual language as existing modals
- `.rag-citation-chip` — pill badge for source papers
- `.rag-thinking-step` — subtle italic step display while agent runs

### `.env.example`
Add:
```
PINECONE_API_KEY=        # Required for vector search
PINECONE_INDEX_NAME=article-writer  # Default index name
```

---

## Chunking Strategy (from agentic-RAG `text_processor.py`)

```
paper.abstract  → 1 chunk, type="abstract"
paper.fullText  → split at sentence boundaries, 512-token target, 100-token overlap
                  type="fulltext", chunkIndex=N
```

Each Pinecone vector metadata:
```json
{
  "pmid": "12345678",
  "title": "...",
  "authors": "Smith et al.",
  "year": "2023",
  "chunkType": "abstract",
  "chunkIndex": 0,
  "content": "..."
}
```

---

## Prompt Structure for Synthesis

Follows existing `ai.js` patterns:
```
You are an expert medical research assistant helping write a {articleType} article on {topic}.

The user asked: {question}

Retrieved evidence from their PubMed library (ranked by relevance):
{chunks formatted as: [1] PMID 12345 (Smith et al., 2023): "...snippet..."}

Using ONLY the evidence above, answer the question concisely.
Cite sources inline as [1], [2], etc.
Return ONLY the answer — no preamble.
```

---

## New Dependencies
- `@pinecone-database/pinecone` — vector DB client
- No other new dependencies (embedding calls use existing OpenAI/Mistral HTTP patterns)

---

## Implementation Steps

1. `npm install @pinecone-database/pinecone`
2. Create `src/services/embeddingService.js` — OpenAI/Mistral embedding + BM25 fallback
3. Create `src/services/pineconeService.js` — upsert, query, delete, BM25 fallback
4. Create `src/services/ragAgentService.js` — intent classifier + 4 tools + agent loop
5. Create `src/routes/rag.js` — 3 endpoints with auth + streaming
6. Modify `src/app.js` — register rag routes
7. Modify `src/routes/articles.js` — auto-ingest on paper save, delete vectors on article delete
8. Add panel HTML to `public/index.html`
9. Modify `public/js/app.js` — panel open/close, query submit, SSE handler, insert-to-section
10. Modify `public/css/app.css` — panel + citation chip + thinking step styles
11. Update `.env.example` with Pinecone vars
12. Write tests in `tests/unit/ragService.test.js` and `tests/integration/rag.test.js`

---

## Verification

1. Add `PINECONE_API_KEY` and `PINECONE_INDEX_NAME` to local `.env.development`
2. `npm run dev` — open the editor for an article that has PubMed papers in its library
3. Click the "Ask Your Library" toolbar button — panel should open
4. Type a question; observe thinking steps stream, then answer with citations
5. Click "Insert into section" — verify text + citation numbers appear in the active section
6. `npm test` — all existing tests pass; new RAG unit tests pass
7. Verify article delete also removes Pinecone vectors (check Pinecone dashboard)
