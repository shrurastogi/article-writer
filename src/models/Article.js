const mongoose = require("mongoose");

const articleSchema = new mongoose.Schema({
  _userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title:         { type: String, default: "Untitled Article", trim: true },
  topic:         { type: String, default: "" },
  authors:       { type: String, default: "" },
  keywords:      { type: String, default: "" },
  wordCount:     { type: Number, default: 0 },
  sections:      { type: mongoose.Schema.Types.Mixed, default: {} },
  library:       { type: Array, default: [] },
  customSections:{ type: Array, default: [] },
  createdAt:     { type: Date, default: Date.now },
  updatedAt:     { type: Date, default: Date.now },
});

// Compound index for efficient sorted dashboard queries
articleSchema.index({ _userId: 1, updatedAt: -1 });

// Mongoose drops empty Mixed fields ({}) during JSON serialization.
// Both sections and library are excluded from SUMMARY_FIELDS — if library is present
// this is a full document response, so ensure sections is also present.
articleSchema.set("toJSON", {
  transform: (doc, ret) => {
    if ("library" in ret && ret.sections === undefined) ret.sections = {};
    return ret;
  },
});

// Compute word count from all section prose values
articleSchema.methods.computeWordCount = function () {
  const sections = this.sections || {};
  let total = 0;
  for (const val of Object.values(sections)) {
    const prose = typeof val === "string" ? val : (val?.prose || "");
    if (prose.trim()) total += prose.trim().split(/\s+/).length;
  }
  return total;
};

// Summary projection for dashboard list (no sections/library)
articleSchema.statics.SUMMARY_FIELDS = "_id title topic wordCount updatedAt createdAt";

module.exports = mongoose.model("Article", articleSchema);
