"use strict";

const express = require("express");
const crypto = require("crypto");
const Article = require("../models/Article");
const User = require("../models/User");
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
    const isOwner = article._userId.equals(req.user._id);
    const collab = article.collaborators?.find(c => c._userId.equals(req.user._id));
    if (!isOwner && !collab) return res.status(403).json({ error: "Forbidden." });
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

    const isOwner = article._userId.equals(req.user._id);
    const collab = article.collaborators?.find(c => c._userId.equals(req.user._id));
    if (!isOwner && !collab) return res.status(403).json({ error: "Forbidden." });
    if (!isOwner && collab?.role === "viewer") return res.status(403).json({ error: "Read-only collaborator." });

    if (article.isLocked) return res.status(423).json({ error: "Article is locked." });

    const { title, topic, authors, keywords, articleType, sections, library, customSections, language, writingStyle } = req.body;

    if (title !== undefined)         article.title = title;
    if (topic !== undefined)         article.topic = topic;
    if (authors !== undefined)       article.authors = authors;
    if (keywords !== undefined)      article.keywords = keywords;
    if (articleType !== undefined)   article.articleType = articleType;
    if (sections !== undefined)      article.sections = sections;
    if (library !== undefined)       article.library = library;
    if (customSections !== undefined) article.customSections = customSections;
    if (language !== undefined)      article.language = language;
    if (writingStyle !== undefined)  { article.writingStyle = writingStyle; article.markModified("writingStyle"); }

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

// ── POST /api/articles/:id/lock ───────────────────────────────────────────────

router.post("/:id/lock", async (req, res) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, _userId: req.user._id });
    if (!article) return res.status(404).json({ error: "Not found." });
    article.isLocked = true;
    await article.save();
    res.json({ isLocked: true });
  } catch (err) {
    logger.error({ msg: "Lock article error", error: err.message, articleId: req.params.id });
    res.status(500).json({ error: "Failed to lock article." });
  }
});

// ── POST /api/articles/:id/unlock ─────────────────────────────────────────────

router.post("/:id/unlock", async (req, res) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, _userId: req.user._id });
    if (!article) return res.status(404).json({ error: "Not found." });
    article.isLocked = false;
    await article.save();
    res.json({ isLocked: false });
  } catch (err) {
    logger.error({ msg: "Unlock article error", error: err.message, articleId: req.params.id });
    res.status(500).json({ error: "Failed to unlock article." });
  }
});


// ── POST /api/articles/:id/share ──────────────────────────────────────────────

router.post("/:id/share", async (req, res) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, _userId: req.user._id });
    if (!article) return res.status(404).json({ error: "Not found." });
    if (!article.shareToken) {
      article.shareToken = crypto.randomUUID();
      await article.save();
    }
    res.json({ shareToken: article.shareToken, url: `/share/${article.shareToken}` });
  } catch (err) {
    logger.error({ msg: "Share article error", error: err.message, articleId: req.params.id });
    res.status(500).json({ error: "Failed to generate share link." });
  }
});

// ── DELETE /api/articles/:id/share ────────────────────────────────────────────

router.delete("/:id/share", async (req, res) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, _userId: req.user._id });
    if (!article) return res.status(404).json({ error: "Not found." });
    article.shareToken = undefined;
    await article.save();
    res.json({ revoked: true });
  } catch (err) {
    logger.error({ msg: "Revoke share error", error: err.message, articleId: req.params.id });
    res.status(500).json({ error: "Failed to revoke share link." });
  }
});

// ── POST /api/articles/:id/collaborators ──────────────────────────────────────

router.post("/:id/collaborators", async (req, res) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, _userId: req.user._id });
    if (!article) return res.status(404).json({ error: "Not found." });
    const { email, role } = req.body;
    if (!email || !["viewer", "editor"].includes(role)) {
      return res.status(400).json({ error: "email and role (viewer|editor) required." });
    }
    const invitee = await User.findOne({ email });
    if (!invitee) return res.status(404).json({ error: "User not found." });
    const already = article.collaborators?.find(c => c._userId.equals(invitee._id));
    if (already) { already.role = role; }
    else { article.collaborators.push({ _userId: invitee._id, role }); }
    article.markModified("collaborators");
    await article.save();
    res.json({ collaborators: article.collaborators });
  } catch (err) {
    logger.error({ msg: "Add collaborator error", error: err.message, articleId: req.params.id });
    res.status(500).json({ error: "Failed to add collaborator." });
  }
});

// ── DELETE /api/articles/:id/collaborators/:uid ───────────────────────────────

router.delete("/:id/collaborators/:uid", async (req, res) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, _userId: req.user._id });
    if (!article) return res.status(404).json({ error: "Not found." });
    article.collaborators = article.collaborators.filter(c => !c._userId.equals(req.params.uid));
    article.markModified("collaborators");
    await article.save();
    res.json({ collaborators: article.collaborators });
  } catch (err) {
    logger.error({ msg: "Remove collaborator error", error: err.message, articleId: req.params.id });
    res.status(500).json({ error: "Failed to remove collaborator." });
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
