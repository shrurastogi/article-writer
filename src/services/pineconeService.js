"use strict";

const { Pinecone } = require("@pinecone-database/pinecone");
const { getEmbedding } = require("./embeddingService");
const logger = require("../utils/logger");

const INDEX_NAME = process.env.PINECONE_INDEX_NAME || "article-writer";
const TARGET_CHUNK_TOKENS = 512;
const OVERLAP_TOKENS = 100;
// Rough approximation: 1 token ≈ 4 chars
const CHARS_PER_TOKEN = 4;

let _pinecone = null;

function _getClient() {
  if (!_pinecone) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) throw new Error("PINECONE_API_KEY is not set");
    _pinecone = new Pinecone({ apiKey });
  }
  return _pinecone;
}

// ── Chunking ──────────────────────────────────────────────────────────────────

function _chunkText(text, targetChars, overlapChars) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length > targetChars && current.length > 0) {
      chunks.push(current.trim());
      // carry overlap from end of current chunk
      const words = current.split(" ");
      const overlapWords = words.slice(-Math.floor(overlapChars / 6));
      current = overlapWords.join(" ") + " " + sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function _buildChunksForPaper(paper) {
  const chunks = [];
  const targetChars = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;
  const overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN;

  const base = {
    pmid:    paper.pmid    || "",
    title:   paper.title   || "",
    authors: paper.authors || "",
    year:    paper.year    || "",
  };

  if (paper.abstract) {
    chunks.push({ ...base, chunkType: "abstract", chunkIndex: 0, content: paper.abstract });
  }

  if (paper.fullText) {
    const textChunks = _chunkText(paper.fullText, targetChars, overlapChars);
    textChunks.forEach((content, i) => {
      chunks.push({ ...base, chunkType: "fulltext", chunkIndex: i, content });
    });
  }

  if (paper.tables?.length) {
    paper.tables.forEach((table, i) => {
      chunks.push({ ...base, chunkType: "table", chunkIndex: i, content: table });
    });
  }

  return chunks;
}

// ── Pinecone operations ───────────────────────────────────────────────────────

async function upsertPaper(articleId, paper, user) {
  if (!process.env.PINECONE_API_KEY) return;

  const chunks = _buildChunksForPaper(paper).filter(c => c.content?.trim());
  if (!chunks.length) return;

  const namespace = `article-${articleId}`;

  const vectors = [];
  for (const chunk of chunks) {
    const embResult = await getEmbedding(chunk.content, user);
    if (!embResult) return; // no embedding provider — skip silently

    vectors.push({
      id: `${chunk.pmid}-chunk-${chunk.chunkIndex}-${chunk.chunkType}`,
      values: embResult.vector,
      metadata: {
        pmid:       chunk.pmid,
        title:      chunk.title,
        authors:    chunk.authors,
        year:       chunk.year,
        chunkType:  chunk.chunkType,
        chunkIndex: chunk.chunkIndex,
        content:    chunk.content.slice(0, 1000), // Pinecone metadata cap
      },
    });
  }

  if (!vectors.length) return;

  try {
    const index = _getClient().index(INDEX_NAME).namespace(namespace);
    // Upsert in batches of 100 (Pinecone limit)
    for (let i = 0; i < vectors.length; i += 100) {
      await index.upsert({ records: vectors.slice(i, i + 100) });
    }
    logger.info({ msg: "Pinecone upsert", articleId, pmid: paper.pmid, vectors: vectors.length });
  } catch (err) {
    logger.error({ msg: "Pinecone upsert error", articleId, pmid: paper.pmid, error: err.message });
    throw err;
  }
}

async function queryVectors(articleId, queryEmbedding, topK = 8, filter = undefined) {
  const namespace = `article-${articleId}`;
  const index = _getClient().index(INDEX_NAME).namespace(namespace);

  const queryParams = { vector: queryEmbedding, topK, includeMetadata: true };
  if (filter) queryParams.filter = filter;

  const result = await index.query(queryParams);
  return (result.matches || []).map(m => ({
    score:      m.score,
    pmid:       m.metadata.pmid,
    title:      m.metadata.title,
    authors:    m.metadata.authors,
    year:       m.metadata.year,
    chunkType:  m.metadata.chunkType,
    chunkIndex: m.metadata.chunkIndex,
    content:    m.metadata.content,
  }));
}

// Delete all existing vectors for a single paper within an article namespace.
// Uses a query-then-delete pattern because serverless Pinecone does not support
// metadata-filter deletes — only ID-based deletes.
async function deletePaperVectors(articleId, pmid, user) {
  if (!process.env.PINECONE_API_KEY) return;
  try {
    const namespace = `article-${articleId}`;
    const index     = _getClient().index(INDEX_NAME).namespace(namespace);

    // Need a real vector to run the filtered query
    const embResult = await getEmbedding(pmid, user);
    if (!embResult) return;

    const result = await index.query({
      vector:          embResult.vector,
      topK:            100,
      includeMetadata: false,
      filter:          { pmid: { $eq: pmid } },
    });

    const ids = (result.matches || []).map(m => m.id);
    if (!ids.length) return;

    await index.deleteMany({ ids });
    logger.info({ msg: "Deleted stale paper vectors", articleId, pmid, count: ids.length });
  } catch (err) {
    // Non-fatal — upsert will still overwrite any vectors with matching IDs
    logger.warn({ msg: "Could not delete stale paper vectors", articleId, pmid, error: err.message });
  }
}

async function deleteArticleVectors(articleId) {
  if (!process.env.PINECONE_API_KEY) return;
  try {
    const namespace = `article-${articleId}`;
    await _getClient().index(INDEX_NAME).namespace(namespace).deleteAll();
    logger.info({ msg: "Pinecone namespace deleted", articleId });
  } catch (err) {
    logger.error({ msg: "Pinecone delete error", articleId, error: err.message });
  }
}

// ── BM25 fallback (used when no embedding provider is available) ──────────────

function bm25Fallback(query, papers, topK = 8) {
  const k1 = 1.5, b = 0.75;
  const queryTerms = _tokenize(query);

  // Build corpus
  const docs = papers.flatMap(p => {
    const chunks = _buildChunksForPaper(p);
    return chunks.map(c => ({ ...c, tokens: _tokenize(c.content) }));
  });

  if (!docs.length) return [];

  const avgLen = docs.reduce((s, d) => s + d.tokens.length, 0) / docs.length;

  // IDF
  const df = {};
  for (const doc of docs) {
    const unique = new Set(doc.tokens);
    unique.forEach(t => { df[t] = (df[t] || 0) + 1; });
  }
  const N = docs.length;
  const idf = t => Math.log((N - df[t] + 0.5) / (df[t] + 0.5) + 1);

  // Score each doc
  const scored = docs.map(doc => {
    const tf = {};
    doc.tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
    const dl = doc.tokens.length;
    let score = 0;
    for (const t of queryTerms) {
      if (!tf[t]) continue;
      score += idf(t) * (tf[t] * (k1 + 1)) / (tf[t] + k1 * (1 - b + b * dl / avgLen));
    }
    return { score, ...doc };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(d => d.score > 0)
    .map(({ score, pmid, title, authors, year, chunkType, chunkIndex, content }) => ({
      score, pmid, title, authors, year, chunkType, chunkIndex, content,
    }));
}

function _tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(t => t.length > 2);
}

module.exports = { upsertPaper, queryVectors, deletePaperVectors, deleteArticleVectors, bm25Fallback, _buildChunksForPaper };
