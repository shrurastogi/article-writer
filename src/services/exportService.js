"use strict";

const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } = require("docx");

function parseTableHTML(html) {
  const headers = [...(html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi))]
    .map(m => m[1].replace(/<[^>]+>/g, "").trim());
  const rows = [];
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (tbodyMatch) {
    const rowMatches = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const rm of rowMatches) {
      const cells = [...rm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        .map(m => m[1].replace(/<[^>]+>/g, "").trim());
      if (cells.length) rows.push(cells);
    }
  }
  return { headers, rows };
}

async function buildDocx({ title, authors, keywords, sections }) {
  const children = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: title || "Untitled Review Article", bold: true, size: 36 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  if (authors?.trim()) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: authors, italics: true, size: 22 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
      })
    );
  }

  if (keywords?.trim()) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Keywords: ", bold: true }),
          new TextRun({ text: keywords }),
        ],
        spacing: { after: 300 },
      })
    );
  }

  for (const section of sections) {
    const sectionText = section.prose ?? section.content ?? "";
    if (!sectionText.trim() && !(section.tables?.length)) continue;

    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 160 },
      })
    );

    const paragraphs = sectionText.split(/\n\n+/).filter((p) => p.trim());
    for (const para of paragraphs) {
      const lines = para.split(/\n/).filter((l) => l.trim());
      for (const line of lines) {
        children.push(
          new Paragraph({
            text: line.trim(),
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 120 },
          })
        );
      }
    }

    for (const tableEntry of section.tables || []) {
      const { headers, rows } = parseTableHTML(tableEntry.html || "");
      if (!headers.length) continue;

      if (tableEntry.caption) {
        children.push(new Paragraph({
          children: [new TextRun({ text: tableEntry.caption, italics: true, size: 20 })],
          spacing: { before: 200, after: 80 },
        }));
      }

      const allCols = Math.max(headers.length, ...rows.map(r => r.length));
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: headers.map(h => new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })],
            })),
          }),
          ...rows.map(row => new TableRow({
            children: Array.from({ length: allCols }, (_, ci) => new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: row[ci] || "", size: 18 })] })],
            })),
          })),
        ],
      }));
      children.push(new Paragraph({ spacing: { after: 160 } }));
    }
  }

  const doc = new Document({
    creator: "Medical Article Writer",
    title: title || "Review Article",
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildDocx, parseTableHTML };
