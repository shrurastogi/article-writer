"use strict";

/**
 * Determines which AI endpoint to call based on current section content.
 * @param {string} prose - Current text content of the section
 * @returns {"generate"|"expand"|"improve"}
 */
function detectWriteMode(prose) {
  const text = (prose || "").trim();
  if (!text) return "generate";
  const lines = text.split("\n").filter(l => l.trim());
  const bulletLines = lines.filter(l => /^[-•*]|\d+\./.test(l.trim()));
  if (lines.length > 0 && bulletLines.length / lines.length > 0.4) return "expand";
  return "improve";
}

module.exports = { detectWriteMode };
