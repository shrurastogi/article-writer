"use strict";

const express = require("express");
const multer  = require("multer");
const router  = express.Router();
const { requireApiAuth }   = require("../middleware/auth");
const { runAgentWorkflow } = require("../services/ragAgentService");
const { upsertPaper, deletePaperVectors, deleteArticleVectors } = require("../services/pineconeService");
const { extractFromPdf }   = require("../services/pdfExtractService");
const Article = require("../models/Article");
const logger  = require("../utils/logger");

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf"),
});

// POST /api/rag/query — SSE streaming agentic RAG query
router.post("/query", requireApiAuth, async (req, res) => {
  const { question, articleId, sectionId } = req.body;

  if (!question?.trim()) return res.status(400).json({ error: "question is required." });
  if (!articleId)         return res.status(400).json({ error: "articleId is required." });

  const article = await Article.findOne({ _id: articleId, _userId: req.user._id });
  if (!article) return res.status(404).json({ error: "Article not found." });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  function sendEvent(data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  try {
    for await (const event of runAgentWorkflow(question, articleId, sectionId, req.user, article)) {
      sendEvent(event);
    }
  } catch (err) {
    logger.error({ msg: "RAG agent error", articleId, error: err.message });
    sendEvent({ type: "error", text: "An error occurred while searching your library." });
  }

  res.end();
});

// POST /api/rag/ingest/:articleId — re-index all papers for an article
router.post("/ingest/:articleId", requireApiAuth, async (req, res) => {
  const { articleId } = req.params;

  const article = await Article.findOne({ _id: articleId, _userId: req.user._id });
  if (!article) return res.status(404).json({ error: "Article not found." });

  const library = article.library || [];
  let indexed = 0;

  try {
    for (const paper of library) {
      await upsertPaper(articleId, paper, req.user);
      indexed++;
    }
    res.json({ indexed });
  } catch (err) {
    logger.error({ msg: "RAG ingest error", articleId, error: err.message });
    res.status(500).json({ error: "Ingestion failed: " + err.message });
  }
});

// DELETE /api/rag/article/:articleId — delete all vectors for an article
router.delete("/article/:articleId", requireApiAuth, async (req, res) => {
  const { articleId } = req.params;

  const article = await Article.findOne({ _id: articleId, _userId: req.user._id });
  if (!article) return res.status(404).json({ error: "Article not found." });

  try {
    await deleteArticleVectors(articleId);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ msg: "RAG delete error", articleId, error: err.message });
    res.status(500).json({ error: "Delete failed: " + err.message });
  }
});

// POST /api/rag/upload-pdf/:articleId/:pmid — extract text+tables from PDF and index in Pinecone
router.post("/upload-pdf/:articleId/:pmid", requireApiAuth, upload.single("pdf"), async (req, res) => {
  const { articleId, pmid } = req.params;

  if (!req.file) return res.status(400).json({ error: "No PDF file provided." });

  const article = await Article.findOne({ _id: articleId, _userId: req.user._id });
  if (!article) return res.status(404).json({ error: "Article not found." });

  const paperIdx = (article.library || []).findIndex(p => p.pmid === pmid);
  if (paperIdx === -1) return res.status(404).json({ error: "Paper not found in library." });

  try {
    const { prose, tables, pageCount } = await extractFromPdf(req.file.buffer);

    article.library[paperIdx].fullText = prose;
    article.library[paperIdx].tables   = tables;
    article.markModified("library");
    await article.save();

    const updatedPaper = article.library[paperIdx];
    // Delete stale vectors first so orphaned chunks from a previous upload don't persist
    await deletePaperVectors(articleId, pmid, req.user);
    setImmediate(() => upsertPaper(articleId, updatedPaper, req.user).catch(() => {}));

    logger.info({ msg: "PDF uploaded and indexed", articleId, pmid, pages: pageCount, tables: tables.length });
    res.json({ ok: true, prose_chars: prose.length, tables_found: tables.length, pages: pageCount });
  } catch (err) {
    logger.error({ msg: "PDF extract error", pmid, error: err.message });
    res.status(500).json({ error: "Failed to extract PDF: " + err.message });
  }
});

module.exports = router;
