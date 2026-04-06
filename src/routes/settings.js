"use strict";

const express = require("express");
const User = require("../models/User");
const { encrypt } = require("../services/encryptionService");
const logger = require("../utils/logger");
const { requireApiAuth } = require("../middleware/auth");

const router = express.Router();

const GROQ_MODELS = [
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile (default)" },
  { id: "llama-3.1-70b-versatile", name: "Llama 3.1 70B Versatile" },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant" },
  { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B 32K" },
  { id: "gemma2-9b-it", name: "Gemma 2 9B IT" },
];

// ── GET /api/settings ─────────────────────────────────────────────────────────

router.get("/settings", requireApiAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({
      llmConfig: {
        provider: user.llmConfig?.provider || "groq",
        model: user.llmConfig?.model || "",
        hasKey: !!(user.llmConfig?.encryptedApiKey),
      },
      researchConfig: {
        hasNcbiKey: !!(user.researchConfig?.encryptedNcbiKey),
      },
      preferences: {
        theme: user.preferences?.theme || "light",
        fontSize: user.preferences?.fontSize || 14,
        language: user.preferences?.language || "English",
        strictMode: user.preferences?.strictMode || false,
      },
    });
  } catch (err) {
    logger.error({ msg: "Get settings error", error: err.message, userId: req.user._id.toString() });
    res.status(500).json({ error: "Failed to load settings." });
  }
});

// ── PUT /api/settings ─────────────────────────────────────────────────────────

router.put("/settings", requireApiAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found." });

    const { provider, model, apiKey, ncbiKey, preferences } = req.body;

    if (!user.llmConfig) user.llmConfig = {};
    if (provider !== undefined) user.llmConfig.provider = provider;
    if (model !== undefined)    user.llmConfig.model = model;
    if (apiKey)                 user.llmConfig.encryptedApiKey = encrypt(apiKey);

    if (!user.researchConfig) user.researchConfig = {};
    if (ncbiKey)               user.researchConfig.encryptedNcbiKey = encrypt(ncbiKey);

    if (preferences) {
      if (!user.preferences) user.preferences = {};
      if (preferences.theme !== undefined)      user.preferences.theme = preferences.theme;
      if (preferences.fontSize !== undefined)   user.preferences.fontSize = preferences.fontSize;
      if (preferences.language !== undefined)   user.preferences.language = preferences.language;
      if (preferences.strictMode !== undefined) user.preferences.strictMode = preferences.strictMode;
    }

    user.markModified("llmConfig");
    user.markModified("researchConfig");
    user.markModified("preferences");
    await user.save();

    res.json({
      llmConfig: { provider: user.llmConfig.provider, model: user.llmConfig.model, hasKey: !!(user.llmConfig.encryptedApiKey) },
      researchConfig: { hasNcbiKey: !!(user.researchConfig.encryptedNcbiKey) },
      preferences: { theme: user.preferences.theme, fontSize: user.preferences.fontSize, language: user.preferences.language, strictMode: user.preferences.strictMode },
    });
  } catch (err) {
    logger.error({ msg: "Update settings error", error: err.message, userId: req.user._id.toString() });
    res.status(500).json({ error: "Failed to update settings." });
  }
});

// ── DELETE /api/settings/llm-key ─────────────────────────────────────────────

router.delete("/settings/llm-key", requireApiAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found." });
    user.llmConfig = { ...user.llmConfig?.toObject?.() ?? user.llmConfig, encryptedApiKey: "" };
    user.markModified("llmConfig");
    await user.save();
    res.json({ hasKey: false });
  } catch (err) {
    logger.error({ msg: "Delete LLM key error", error: err.message });
    res.status(500).json({ error: "Failed to delete key." });
  }
});

// ── DELETE /api/settings/ncbi-key ────────────────────────────────────────────

router.delete("/settings/ncbi-key", requireApiAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found." });
    user.researchConfig = { encryptedNcbiKey: "" };
    user.markModified("researchConfig");
    await user.save();
    res.json({ hasNcbiKey: false });
  } catch (err) {
    logger.error({ msg: "Delete NCBI key error", error: err.message });
    res.status(500).json({ error: "Failed to delete NCBI key." });
  }
});

// ── GET /api/llm/models ───────────────────────────────────────────────────────

router.get("/llm/models", requireApiAuth, (req, res) => {
  res.json({ models: GROQ_MODELS });
});

module.exports = router;
