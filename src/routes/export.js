"use strict";

const router = require("express").Router();
const { buildDocx } = require("../services/exportService");
const { generatePdf } = require("../services/pdfService");
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

// Export as PDF (server-side via Puppeteer)
router.post("/export-pdf-server", async (req, res) => {
  const { html, title } = req.body;
  if (!html?.trim()) return res.status(400).json({ error: "No HTML provided." });
  try {
    const buffer = await generatePdf(html);
    const filename = `${(title || "article")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 60)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    logger.error({ msg: "PDF export error", error: err.message });
    res.status(500).json({ error: "PDF generation failed: " + err.message });
  }
});

module.exports = router;
