"use strict";

const router = require("express").Router();
const { buildDocx } = require("../services/exportService");
const logger = require("../utils/logger");

// Export as Word DOCX
router.post("/export-docx", async (req, res) => {
  const { title, authors, keywords, sections } = req.body;

  try {
    const buffer = await buildDocx({ title, authors, keywords, sections });
    const filename = `${(title || "review_article")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 60)}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    logger.error({ msg: "DOCX export error", error: err.message });
    res.status(500).json({ error: "Failed to generate DOCX: " + err.message });
  }
});

module.exports = router;
