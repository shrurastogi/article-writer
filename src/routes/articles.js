"use strict";

const express = require("express");
const Article = require("../models/Article");
const logger = require("../utils/logger");
const { requireApiAuth } = require("../middleware/auth");

const router = express.Router();

// All article routes require authentication — always return JSON 401, never redirect
router.use(requireApiAuth);

// ── GET /api/articles — list user's articles ──────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const articles = await Article
      .find({ _userId: req.user._id })
      .select(Article.SUMMARY_FIELDS)
      .sort({ updatedAt: -1 });

    res.json({ articles });
  } catch (err) {
    logger.error({ msg: "List articles error", error: err.message, userId: req.user._id.toString() });
    res.status(500).json({ error: "Failed to list articles." });
  }
});

// ── POST /api/articles — create blank article ─────────────────────────────────

router.post("/", async (req, res) => {
  try {
    const article = await Article.create({ _userId: req.user._id });
    logger.info({ msg: "Article created", articleId: article._id.toString(), userId: req.user._id.toString() });
    res.status(201).json({ article });
  } catch (err) {
    logger.error({ msg: "Create article error", error: err.message, userId: req.user._id.toString() });
    res.status(500).json({ error: "Failed to create article." });
  }
});

// ── GET /api/articles/:id — fetch full article ────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: "Article not found." });
    if (!article._userId.equals(req.user._id)) {
      return res.status(403).json({ error: "Forbidden." });
    }
    res.json({ article });
  } catch (err) {
    logger.error({ msg: "Get article error", error: err.message, articleId: req.params.id });
    res.status(500).json({ error: "Failed to fetch article." });
  }
});

// ── PUT /api/articles/:id — full overwrite ────────────────────────────────────

router.put("/:id", async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: "Article not found." });
    if (!article._userId.equals(req.user._id)) {
      return res.status(403).json({ error: "Forbidden." });
    }

    const { title, topic, authors, keywords, sections, library, customSections } = req.body;

    if (title !== undefined)         article.title = title;
    if (topic !== undefined)         article.topic = topic;
    if (authors !== undefined)       article.authors = authors;
    if (keywords !== undefined)      article.keywords = keywords;
    if (sections !== undefined)      article.sections = sections;
    if (library !== undefined)       article.library = library;
    if (customSections !== undefined) article.customSections = customSections;

    article.updatedAt = new Date();
    article.wordCount = article.computeWordCount();

    // Mongoose does not track Mixed/Array path mutations automatically
    article.markModified("sections");
    article.markModified("library");

    await article.save();
    res.json({ article });
  } catch (err) {
    logger.error({ msg: "Update article error", error: err.message, articleId: req.params.id });
    res.status(500).json({ error: "Failed to update article." });
  }
});

// ── POST /api/articles/:id/clone — deep-copy an article ──────────────────────

router.post("/:id/clone", async (req, res) => {
  try {
    const original = await Article.findById(req.params.id);
    if (!original) return res.status(404).json({ error: "Article not found." });
    if (!original._userId.equals(req.user._id)) {
      return res.status(403).json({ error: "Forbidden." });
    }

    const data = original.toObject();
    delete data._id;
    delete data.__v;
    data.title = `Copy of ${data.title || "Untitled Article"}`;
    data.createdAt = new Date();
    data.updatedAt = new Date();

    const cloned = await Article.create(data);
    logger.info({ msg: "Article cloned", originalId: req.params.id, newId: cloned._id.toString(), userId: req.user._id.toString() });
    res.status(201).json({ article: cloned });
  } catch (err) {
    logger.error({ msg: "Clone article error", error: err.message, articleId: req.params.id });
    res.status(500).json({ error: "Failed to clone article." });
  }
});

// ── DELETE /api/articles/:id ──────────────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: "Article not found." });
    if (!article._userId.equals(req.user._id)) {
      return res.status(403).json({ error: "Forbidden." });
    }

    await article.deleteOne();
    logger.info({ msg: "Article deleted", articleId: req.params.id, userId: req.user._id.toString() });
    res.status(204).send();
  } catch (err) {
    logger.error({ msg: "Delete article error", error: err.message, articleId: req.params.id });
    res.status(500).json({ error: "Failed to delete article." });
  }
});

module.exports = router;
