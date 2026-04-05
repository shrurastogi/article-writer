"use strict";

const express = require("express");
const ArticleVersion = require("../models/ArticleVersion");
const Article = require("../models/Article");
const logger = require("../utils/logger");
const { requireApiAuth } = require("../middleware/auth");

const router = express.Router({ mergeParams: true });

router.use(requireApiAuth);

// ── GET /api/articles/:id/versions — list (no snapshot field) ─────────────────

router.get("/", async (req, res) => {
  try {
    const versions = await ArticleVersion.find(
      { _articleId: req.params.id, _userId: req.user._id },
      { snapshot: 0 }
    ).sort({ createdAt: -1 });
    res.json({ versions });
  } catch (err) {
    logger.error({ msg: "List versions error", error: err.message, articleId: req.params.id });
    res.status(500).json({ error: "Failed to list versions." });
  }
});

// ── POST /api/articles/:id/versions — create snapshot ─────────────────────────

router.post("/", async (req, res) => {
  try {
    const { label } = req.body;
    const article = await Article.findOne({ _id: req.params.id, _userId: req.user._id });
    if (!article) return res.status(404).json({ error: "Not found." });

    const v = await ArticleVersion.create({
      _articleId: article._id,
      _userId: req.user._id,
      label: label || "",
      snapshot: article.sections,
      wordCount: article.wordCount || 0,
    });

    // Cap enforcement — delete oldest if over limit
    const count = await ArticleVersion.countDocuments({ _articleId: article._id });
    if (count > ArticleVersion.CAP) {
      const overflow = count - ArticleVersion.CAP;
      const oldest = await ArticleVersion.find({ _articleId: article._id })
        .sort({ createdAt: 1 })
        .limit(overflow)
        .select("_id");
      await ArticleVersion.deleteMany({ _id: { $in: oldest.map(o => o._id) } });
    }

    logger.info({ msg: "Version created", articleId: req.params.id, versionId: v._id.toString() });
    res.status(201).json({ version: v });
  } catch (err) {
    logger.error({ msg: "Create version error", error: err.message, articleId: req.params.id });
    res.status(500).json({ error: "Failed to create version." });
  }
});

// ── POST /api/articles/:id/versions/:vid/restore ──────────────────────────────

router.post("/:vid/restore", async (req, res) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, _userId: req.user._id });
    if (!article) return res.status(404).json({ error: "Not found." });

    const v = await ArticleVersion.findOne({ _id: req.params.vid, _articleId: article._id });
    if (!v) return res.status(404).json({ error: "Version not found." });

    // Save current state as a version before restoring
    await ArticleVersion.create({
      _articleId: article._id,
      _userId: req.user._id,
      label: "Before restore",
      snapshot: article.sections,
      wordCount: article.wordCount || 0,
    });

    article.sections = v.snapshot;
    article.markModified("sections");
    article.updatedAt = new Date();
    await article.save();

    logger.info({ msg: "Version restored", articleId: req.params.id, versionId: req.params.vid });
    res.json({ restored: true });
  } catch (err) {
    logger.error({ msg: "Restore version error", error: err.message, articleId: req.params.id });
    res.status(500).json({ error: "Failed to restore version." });
  }
});

// ── DELETE /api/articles/:id/versions/:vid ────────────────────────────────────

router.delete("/:vid", async (req, res) => {
  try {
    await ArticleVersion.deleteOne({ _id: req.params.vid, _userId: req.user._id });
    res.json({ deleted: true });
  } catch (err) {
    logger.error({ msg: "Delete version error", error: err.message, versionId: req.params.vid });
    res.status(500).json({ error: "Failed to delete version." });
  }
});

module.exports = router;
