const _envFile = process.env.NODE_ENV === "production" ? ".env" : `.env.${process.env.NODE_ENV || "development"}`;
require("dotenv").config({ path: _envFile });
const express = require("express");
const path = require("path");
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } = require("docx");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const passport = require("passport");
const mongoose = require("mongoose");
const logger = require("./lib/logger");
const { requireAuth } = require("./middleware/auth");
const authRouter = require("./routes/auth-router");
const articlesRouter = require("./routes/articles-router");
require("./lib/passport-config");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

// ── Database ──────────────────────────────────────────────────────────────────
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => logger.info("MongoDB connected"))
    .catch((err) => logger.error({ msg: "MongoDB connection error", error: err.message }));
}

// Trust Railway/Heroku/etc. reverse proxy so secure cookies work over HTTPS
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

// ── Session & Passport ────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  store: process.env.MONGODB_URI && process.env.NODE_ENV !== "test"
    ? MongoStore.create({ mongoUrl: process.env.MONGODB_URI })
    : undefined,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "lax" : false,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));
app.use(passport.initialize());
app.use(passport.session());

// ── Page routes (auth-guarded) ────────────────────────────────────────────────
app.get("/", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});
app.get("/login", (req, res) => {
  if (req.isAuthenticated()) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "login.html"));
});

app.use(express.static(path.join(__dirname), { index: false }));

// ── Auth & API routers ────────────────────────────────────────────────────────
app.use("/auth", authRouter);
app.use("/api/articles", articlesRouter);
app.use("/api", require("./src/routes/ai"));

app.get("/api/version", (req, res) => {
  res.json({
    version: process.env.npm_package_version,
    env: process.env.NODE_ENV || "development",
    sha: process.env.BUILD_SHA || "local",
  });
});

const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const NCBI_API_KEY = process.env.NCBI_API_KEY || "";

// Parse HTML table into headers and rows
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

// Export as Word DOCX
app.post("/api/export-docx", async (req, res) => {
  const { title, authors, keywords, sections } = req.body;

  try {
    const children = [];

    // Title
    children.push(
      new Paragraph({
        children: [new TextRun({ text: title || "Untitled Review Article", bold: true, size: 36 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );

    // Authors
    if (authors?.trim()) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: authors, italics: true, size: 22 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
        })
      );
    }

    // Keywords
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

    // Sections
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

      // Render tables for this section
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

    const buffer = await Packer.toBuffer(doc);
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

// Helper: fetch with retry on network errors
async function fetchWithRetry(url, maxRetries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url);
      return resp;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  throw lastErr;
}

// Search PubMed for relevant abstracts
app.post("/api/pubmed-search", async (req, res) => {
  const { query, maxResults = 8 } = req.body;

  if (!query?.trim()) {
    return res.status(400).json({ error: "No search query provided." });
  }

  try {
    const keyParam = NCBI_API_KEY ? `&api_key=${NCBI_API_KEY}` : "";

    const searchUrl =
      `${NCBI_BASE}/esearch.fcgi?db=pubmed` +
      `&term=${encodeURIComponent(query.trim())}` +
      `&retmax=${maxResults}&sort=relevance&retmode=json${keyParam}`;

    const searchResp = await fetch(searchUrl);
    if (!searchResp.ok) throw new Error(`PubMed search HTTP ${searchResp.status}`);
    const searchData = await searchResp.json();
    const ids = searchData.esearchresult?.idlist || [];

    if (!ids.length) {
      return res.json({ articles: [], total: 0 });
    }

    const fetchUrl =
      `${NCBI_BASE}/efetch.fcgi?db=pubmed` +
      `&id=${ids.join(",")}&rettype=abstract&retmode=xml${keyParam}`;

    const fetchResp = await fetch(fetchUrl);
    if (!fetchResp.ok) throw new Error(`PubMed fetch HTTP ${fetchResp.status}`);
    const xml = await fetchResp.text();

    const articles = parsePubMedXML(xml);
    const total = parseInt(searchData.esearchresult?.count || "0", 10);
    res.json({ articles, total });
  } catch (err) {
    logger.error({ msg: "PubMed search error", error: err.message });
    res.status(500).json({ error: "PubMed search failed: " + err.message });
  }
});

function parsePubMedXML(xml) {
  const decode = (s) =>
    s.replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

  const articles = [];
  const blocks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];

  for (const block of blocks) {
    const pmid = (block.match(/<PMID[^>]*>(\d+)<\/PMID>/) || [])[1] || "";
    const title = decode((block.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/) || [])[1] || "");

    const abstractParts = [...block.matchAll(/<AbstractText[^>]*Label="([^"]*)"[^>]*>([\s\S]*?)<\/AbstractText>/g)];
    let abstract = "";
    if (abstractParts.length) {
      abstract = abstractParts.map((m) => `${m[1]}: ${decode(m[2])}`).join(" ");
    } else {
      abstract = decode((block.match(/<AbstractText>([\s\S]*?)<\/AbstractText>/) || [])[1] || "");
    }

    const lastNames = [...block.matchAll(/<LastName>([^<]+)<\/LastName>/g)].map((m) => m[1]);
    const authors =
      lastNames.length === 0 ? "Unknown"
      : lastNames.length > 3 ? `${lastNames[0]} et al.`
      : lastNames.join(", ");

    const year =
      (block.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>[\s\S]*?<\/PubDate>/) || [])[1] ||
      (block.match(/<MedlineDate>(\d{4})/) || [])[1] ||
      "";

    const journal = decode((block.match(/<ISOAbbreviation>([^<]+)<\/ISOAbbreviation>/) || [])[1] || "");

    if (title) {
      articles.push({ pmid, title, abstract, authors, year, journal });
    }
  }

  return articles;
}

// Fetch PubMed articles by PMID list, with PMC OA full-text if available
app.post("/api/fetch-pmids", async (req, res) => {
  const { pmids } = req.body;

  if (!Array.isArray(pmids) || pmids.length === 0) {
    return res.status(400).json({ error: "pmids must be a non-empty array." });
  }

  const validPmids = [...new Set(pmids.filter((id) => /^\d+$/.test(String(id).trim())).map(String))].slice(0, 50);

  if (validPmids.length === 0) {
    return res.status(400).json({ error: "No valid numeric PMIDs provided." });
  }

  try {
    const keyParam = NCBI_API_KEY ? `&api_key=${NCBI_API_KEY}` : "";

    const fetchUrl =
      `${NCBI_BASE}/efetch.fcgi?db=pubmed&id=${validPmids.join(",")}&rettype=abstract&retmode=xml${keyParam}`;
    const fetchResp = await fetchWithRetry(fetchUrl);
    if (!fetchResp.ok) throw new Error(`PubMed efetch HTTP ${fetchResp.status}`);
    const xml = await fetchResp.text();

    const foundArticles = parsePubMedXML(xml);
    const foundPmids = new Set(foundArticles.map((a) => a.pmid));
    const notFound = validPmids.filter((id) => !foundPmids.has(id));

    async function enrichArticle(article) {
      let pmcid = null;
      let isOA = false;
      let fullText = null;

      try {
        const elinkUrl =
          `${NCBI_BASE}/elink.fcgi?dbfrom=pubmed&db=pmc&id=${article.pmid}&retmode=json${keyParam}`;
        const elinkResp = await fetchWithRetry(elinkUrl);
        if (elinkResp.ok) {
          const elinkData = await elinkResp.json();
          const links = elinkData?.linksets?.[0]?.linksetdbs?.find((db) => db.dbto === "pmc")?.links || [];
          if (links.length > 0) pmcid = String(links[0]);
        }
      } catch (err) {
        logger.error({ msg: "elink error", pmid: article.pmid, error: err.message });
      }

      if (pmcid) {
        try {
          const oaUrl = `https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi?id=PMC${pmcid}`;
          const oaResp = await fetchWithRetry(oaUrl);
          if (oaResp.ok) {
            const oaXml = await oaResp.text();
            if (/<link[^>]+format="tgz"[^>]+href="[^"]+"/i.test(oaXml) ||
                /<link[^>]+format="pdf"[^>]+href="[^"]+"/i.test(oaXml)) {
              isOA = true;
            }
          }
        } catch (err) {
          logger.error({ msg: "OA check error", pmcid: `PMC${pmcid}`, error: err.message });
        }

        if (isOA) {
          try {
            const biocUrl = `https://www.ncbi.nlm.nih.gov/research/biolinkml/api/text?pmcids=PMC${pmcid}&format=bioc`;
            const biocResp = await fetchWithRetry(biocUrl);
            if (biocResp.ok) {
              const biocData = await biocResp.json();
              const targetSections = new Set(["INTRO", "RESULTS", "DISCUSS", "CONCL", "ABSTRACT"]);
              const passages = [];
              for (const doc of (biocData?.documents || biocData?.PubTator3 || [])) {
                for (const passage of doc.passages || []) {
                  const st = (passage?.infons?.section_type || passage?.infons?.type || "").toUpperCase();
                  if (targetSections.has(st)) passages.push(passage.text || "");
                }
              }
              fullText = passages.join(" ").trim().slice(0, 6000) || null;
            }
          } catch (err) {
            logger.error({ msg: "BioC fetch error", pmcid: `PMC${pmcid}`, error: err.message });
          }
        }
      }

      return { ...article, pmcid: pmcid ? `PMC${pmcid}` : null, isOA, fullText };
    }

    const CONCURRENCY = 3;
    const articles = [];
    for (let i = 0; i < foundArticles.length; i += CONCURRENCY) {
      const batch = foundArticles.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(enrichArticle));
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "fulfilled") {
          articles.push(results[j].value);
        } else {
          articles.push({ ...foundArticles[i + j], pmcid: null, isOA: false, fullText: null });
        }
      }
      if (i + CONCURRENCY < foundArticles.length) await new Promise((r) => setTimeout(r, 400));
    }

    res.json({ found: articles, notFound });
  } catch (err) {
    logger.error({ msg: "fetch-pmids error", error: err.message });
    res.status(500).json({ error: "Failed to fetch PMIDs: " + err.message });
  }
});

// Only bind to a port when run directly (node server.js / npm start).
// When required by tests, export the app so supertest can attach without a port.
const REQUIRED_ENV_VARS = ["GROQ_API_KEY", "MONGODB_URI", "SESSION_SECRET"];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}. Check your .env file.`);
  }
}

if (require.main === module) {
  validateEnv();
  app.listen(PORT, () => {
    logger.info(`Medical Article Writer running at http://localhost:${PORT}`);
    logger.info(`Groq API key:  ${process.env.GROQ_API_KEY ? "✓ Loaded" : "✗ MISSING — add GROQ_API_KEY to .env"}`);
    logger.info(`NCBI API key:  ${NCBI_API_KEY ? "✓ Loaded (10 req/s)" : "not set — anonymous rate limit (3 req/s)"}`);
  });
}

app.validateEnv = validateEnv;
module.exports = app;
