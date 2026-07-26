"use strict";

const pdfParse = require("pdf-parse");

const MAX_PROSE_CHARS = 50000;
const MIN_TABLE_ROWS  = 3;
const MIN_TABLE_COLS  = 2;

// Returns { prose: string, tables: string[], pageCount: number }
async function extractFromPdf(buffer) {
  const data  = await pdfParse(buffer);
  const lines = (data.text || "").split("\n");
  const { prose, tables } = _separateTablesFromProse(lines);
  return { prose: prose.slice(0, MAX_PROSE_CHARS), tables, pageCount: data.numpages };
}

function _isTableLine(line) {
  return line.split(/\s{2,}/).filter(s => s.trim()).length >= MIN_TABLE_COLS;
}

function _toMarkdownTable(lines) {
  const rows = lines.map(line =>
    line.split(/\s{2,}/).map(s => s.trim()).filter(s => s)
  );
  const colCount = Math.max(...rows.map(r => r.length));
  const padded   = rows.map(r => { while (r.length < colCount) r.push(""); return r; });
  const header   = padded[0];
  const sep      = header.map(() => "---");
  return [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...padded.slice(1).map(r => `| ${r.join(" | ")} |`),
  ].join("\n");
}

function _separateTablesFromProse(lines) {
  const tables     = [];
  const proseParts = [];
  let   tableBuffer = [];

  const flushTable = () => {
    if (tableBuffer.length >= MIN_TABLE_ROWS) {
      tables.push(_toMarkdownTable(tableBuffer));
    } else {
      proseParts.push(...tableBuffer);
    }
    tableBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushTable(); proseParts.push(line); continue; }
    if (_isTableLine(trimmed)) {
      tableBuffer.push(trimmed);
    } else {
      flushTable();
      proseParts.push(line);
    }
  }
  flushTable();

  return {
    prose:  proseParts.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    tables,
  };
}

module.exports = { extractFromPdf };
