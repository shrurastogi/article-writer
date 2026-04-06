"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  _articleId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  _userId:    { type: mongoose.Schema.Types.ObjectId, required: true },
  label:      { type: String, default: "" },
  snapshot:   { type: mongoose.Schema.Types.Mixed, required: true },
  wordCount:  { type: Number, default: 0 },
  createdAt:  { type: Date, default: Date.now },
});

schema.index({ _articleId: 1, createdAt: -1 });

const ArticleVersion = mongoose.model("ArticleVersion", schema);

ArticleVersion.CAP = 50;

module.exports = ArticleVersion;
