const _envFile = process.env.NODE_ENV === "production" ? ".env" : `.env.${process.env.NODE_ENV || "development"}`;
require("dotenv").config({ path: _envFile });
const express = require("express");
const path = require("path");
const OpenAI = require("openai");
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
const PORT = 3000;

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

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const MODEL = "llama-3.3-70b-versatile";
const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const NCBI_API_KEY = process.env.NCBI_API_KEY || "";

// Generate topic-aware section context
function getSectionContext(topic, sectionId, sectionTitle) {
  const t = topic || "the given medical topic";
  const map = {
    // Current standard sections (Sprint 2+)
    abstract:      `a structured abstract (Background, Key Findings, Conclusions) for a review article on ${t}`,
    introduction:  `an Introduction covering disease background, global burden, and rationale for reviewing ${t}`,
    main_body:     `the Main Body of a review article on ${t}, covering the key thematic areas with appropriate subheadings`,
    discussion:    `a Discussion section synthesising the evidence, addressing clinical implications, limitations, and how findings compare with existing literature on ${t}`,
    conclusions:   `a Conclusions section summarising major advances, remaining challenges, and clinical implications for ${t}`,
    references:    `a References section listing 30–40 key landmark references on ${t} in Vancouver format (numbered, Author et al., Journal, Year;Vol:Pages)`,
    // Legacy section IDs — retained for backward compatibility with articles created before Sprint 2
    epidemiology:      `an Epidemiology & Risk Factors section covering incidence, prevalence, demographic trends, and established risk factors for ${t}`,
    pathophysiology:   `a Pathophysiology & Molecular Biology section covering underlying disease mechanisms, key molecular alterations, and disease progression in ${t}`,
    diagnosis:         `a Clinical Presentation & Diagnosis section covering presenting features, diagnostic criteria, workup, imaging, and differential diagnosis for ${t}`,
    staging:           `a Staging & Risk Stratification section covering classification systems, prognostic factors, and risk categories for ${t}`,
    treatment_nd:      `a Treatment of Newly Diagnosed Disease section covering standard first-line strategies, guidelines, and landmark trials for ${t}`,
    treatment_rr:      `a Treatment of Relapsed/Refractory Disease section covering salvage regimens, drug classes, and key clinical trials for ${t}`,
    novel_therapies:   `a Novel Therapies & Emerging Treatments section covering recently approved agents, pipeline therapies, and recent clinical trial data for ${t}`,
    supportive_care:   `a Supportive Care & Management of Complications section covering disease- and treatment-related complications and their management in ${t}`,
    future_directions: `a Future Directions section covering ongoing trials, emerging targets, and unresolved research questions for ${t}`,
    conclusion:        `a Conclusions section summarising major advances, remaining challenges, and clinical implications for ${t}`,
  };
  return map[sectionId] || `the "${sectionTitle}" section of a review article on ${t}`;
}

// Generate draft content for a section
app.post("/api/generate", async (req, res) => {
  const { topic, sectionId, sectionTitle, notes, pubmedContext } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: "A medical topic is required." });
  }

  const subject = topic.trim();
  const context = getSectionContext(subject, sectionId, sectionTitle);
  const notesText = notes?.trim() ? `\n\nAuthor's specific focus areas:\n${notes}` : "";
  const litText = pubmedContext?.trim()
    ? `\n\nRecent literature from PubMed (use these abstracts for evidence and [Author et al., Year] citations):\n${pubmedContext}`
    : "";

  const prompt = `You are an expert medical writer with deep expertise in ${subject}. Write ${context}.

Requirements:
- Formal academic writing style suitable for a high-impact journal (e.g. NEJM, Lancet, JCO)
- Evidence-based with citations as [Author et al., Year] placeholders
- Comprehensive yet concise (300–600 words for most sections)
- Include key statistics, landmark trial names, drug names, and current guidelines where applicable
- Return ONLY the section content — no section heading, no preamble, no explanations${notesText}${litText}`;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    logger.error({ msg: "Groq API error", error: err.message });
    res.status(500).json({ error: "Failed to call Groq API: " + err.message });
  }
});

// Improve existing section text
app.post("/api/improve", async (req, res) => {
  const { topic, sectionTitle, content, pubmedContext } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: "A medical topic is required." });
  }
  if (!content?.trim()) {
    return res.status(400).json({ error: "No content provided." });
  }

  const subject = topic.trim();
  const litText = pubmedContext?.trim()
    ? `\n\nRecent literature from PubMed (use these for evidence and citations):\n${pubmedContext}`
    : "";

  const prompt = `You are an expert medical writer specializing in ${subject}. Improve the following text from the "${sectionTitle}" section of a review article on ${subject}.

Make it:
- More academically rigorous and precise in language
- Better structured with clear logical flow and transitions
- Consistent with standard ${subject} terminology and nomenclature
- More concise where appropriate without losing key content
- Better cited (add [Author et al., Year] placeholders where evidence is cited without a reference)

Return ONLY the improved text — no explanations, no heading.${litText}

Original text:
${content}`;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    logger.error({ msg: "Groq API error", error: err.message });
    res.status(500).json({ error: "Failed to call Groq API: " + err.message });
  }
});

// Suggest key points to cover in a section
app.post("/api/keypoints", async (req, res) => {
  const { topic, sectionId, sectionTitle, pubmedContext } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: "A medical topic is required." });
  }

  const subject = topic.trim();
  const context = getSectionContext(subject, sectionId, sectionTitle);
  const litText = pubmedContext?.trim()
    ? `\n\nSelected references from the user's library (abstracts and available full-text). Extract specific key points, trial names, statistics, and findings directly from these papers:\n${pubmedContext}`
    : "";

  const prompt = `You are a domain expert in ${subject}. List the essential key points, topics, and recent developments that must be covered in ${context}.

Include:
- Critical concepts and mechanisms
- Landmark clinical trials and their key findings
- Current guidelines and consensus recommendations
- Important recent developments (last 3–5 years)
- Specific drug names, biomarkers, or criteria where relevant
${pubmedContext?.trim() ? "- Cite specific findings from the provided references where applicable (Author et al., Year)" : ""}

Format as a clear bulleted list. Each point must be specific and actionable, not generic.${litText}`;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 900,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    logger.error({ msg: "Groq API error", error: err.message });
    res.status(500).json({ error: "Failed to call Groq API: " + err.message });
  }
});

// Search PubMed for relevant abstracts
app.post("/api/pubmed-search", async (req, res) => {
  const { query, maxResults = 8 } = req.body;

  if (!query?.trim()) {
    return res.status(400).json({ error: "No search query provided." });
  }

  try {
    const keyParam = NCBI_API_KEY ? `&api_key=${NCBI_API_KEY}` : "";

    // Step 1: Search for PMIDs
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

    // Step 2: Fetch full records as XML
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
    // PMID — take the first one (the article's own PMID, not a reference)
    const pmid = (block.match(/<PMID[^>]*>(\d+)<\/PMID>/) || [])[1] || "";

    // Title
    const title = decode((block.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/) || [])[1] || "");

    // Abstract — structured abstracts have multiple <AbstractText Label="..."> blocks
    const abstractParts = [...block.matchAll(/<AbstractText[^>]*Label="([^"]*)"[^>]*>([\s\S]*?)<\/AbstractText>/g)];
    let abstract = "";
    if (abstractParts.length) {
      abstract = abstractParts.map((m) => `${m[1]}: ${decode(m[2])}`).join(" ");
    } else {
      // Plain abstract
      abstract = decode((block.match(/<AbstractText>([\s\S]*?)<\/AbstractText>/) || [])[1] || "");
    }

    // Authors
    const lastNames = [...block.matchAll(/<LastName>([^<]+)<\/LastName>/g)].map((m) => m[1]);
    const authors =
      lastNames.length === 0 ? "Unknown"
      : lastNames.length > 3 ? `${lastNames[0]} et al.`
      : lastNames.join(", ");

    // Year — prefer MedlineDate fallback
    const year =
      (block.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>[\s\S]*?<\/PubDate>/) || [])[1] ||
      (block.match(/<MedlineDate>(\d{4})/) || [])[1] ||
      "";

    // Journal abbreviation
    const journal = decode((block.match(/<ISOAbbreviation>([^<]+)<\/ISOAbbreviation>/) || [])[1] || "");

    if (title) {
      articles.push({ pmid, title, abstract, authors, year, journal });
    }
  }

  return articles;
}

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

        // Caption as italic paragraph
        if (tableEntry.caption) {
          children.push(new Paragraph({
            children: [new TextRun({ text: tableEntry.caption, italics: true, size: 20 })],
            spacing: { before: 200, after: 80 },
          }));
        }

        // Build docx Table
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

// Fetch PubMed articles by PMID list, with PMC OA full-text if available
app.post("/api/fetch-pmids", async (req, res) => {
  const { pmids } = req.body;

  if (!Array.isArray(pmids) || pmids.length === 0) {
    return res.status(400).json({ error: "pmids must be a non-empty array." });
  }

  // Validate: numeric strings only, deduplicate, max 50
  const validPmids = [...new Set(pmids.filter((id) => /^\d+$/.test(String(id).trim())).map(String))].slice(0, 50);

  if (validPmids.length === 0) {
    return res.status(400).json({ error: "No valid numeric PMIDs provided." });
  }

  try {
    const keyParam = NCBI_API_KEY ? `&api_key=${NCBI_API_KEY}` : "";

    // Step 1: Batch-fetch PubMed metadata
    const fetchUrl =
      `${NCBI_BASE}/efetch.fcgi?db=pubmed&id=${validPmids.join(",")}&rettype=abstract&retmode=xml${keyParam}`;
    const fetchResp = await fetchWithRetry(fetchUrl);
    if (!fetchResp.ok) throw new Error(`PubMed efetch HTTP ${fetchResp.status}`);
    const xml = await fetchResp.text();

    // Step 2: Parse with existing helper
    const foundArticles = parsePubMedXML(xml);
    const foundPmids = new Set(foundArticles.map((a) => a.pmid));
    const notFound = validPmids.filter((id) => !foundPmids.has(id));

    // Step 3: Enrich each article with PMC OA info — parallel, max 3 concurrent
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

    // Run enrichment with concurrency limit of 3
    const CONCURRENCY = 3;
    const articles = [];
    for (let i = 0; i < foundArticles.length; i += CONCURRENCY) {
      const batch = foundArticles.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(enrichArticle));
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "fulfilled") {
          articles.push(results[j].value);
        } else {
          // Enrichment failed — fall back to base article data
          articles.push({ ...foundArticles[i + j], pmcid: null, isOA: false, fullText: null });
        }
      }
      // Small inter-batch pause to stay within NCBI rate limit
      if (i + CONCURRENCY < foundArticles.length) await new Promise((r) => setTimeout(r, 400));
    }

    res.json({ found: articles, notFound });
  } catch (err) {
    logger.error({ msg: "fetch-pmids error", error: err.message });
    res.status(500).json({ error: "Failed to fetch PMIDs: " + err.message });
  }
});

// Generate an HTML table for a section
app.post("/api/generate-table", async (req, res) => {
  const { topic, sectionTitle, tableDescription, pubmedContext } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: "A medical topic is required." });
  }
  if (!tableDescription?.trim()) {
    return res.status(400).json({ error: "A table description is required." });
  }

  const litText = pubmedContext?.trim()
    ? `\nPubMed context (use data from these abstracts where possible):\n${pubmedContext}`
    : "";

  const prompt = `You are an expert medical writer creating a publication-quality data table.

Section: ${sectionTitle} in a review article on ${topic}
Table request: ${tableDescription}${litText}

Generate an HTML table that:
- Has a <caption> element as the first child with a descriptive title (e.g. "Table 1: Comparison of CAR-T Cell Therapies in Multiple Myeloma")
- Uses <thead> with <th> header cells (bold)
- Uses <tbody> with <tr>/<td> data cells
- Has a maximum of 7 columns; prefer fewer columns with richer cell content
- Uses data from the provided abstracts/context where possible; mark uncertain values as "NR" (not reported)
- Returns ONLY the <table>...</table> HTML — no surrounding text, no markdown, no explanation

Example structure:
<table>
  <caption>Table 1: ...</caption>
  <thead><tr><th>Col1</th><th>Col2</th></tr></thead>
  <tbody><tr><td>val</td><td>val</td></tr></tbody>
</table>`;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    logger.error({ msg: "Groq API error", error: err.message });
    res.status(500).json({ error: "Failed to call Groq API: " + err.message });
  }
});

// Refine an existing draft section with a user instruction
app.post("/api/refine", async (req, res) => {
  const { topic, sectionTitle, currentDraft, instruction, pubmedContext } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: "A medical topic is required." });
  }
  if (!currentDraft?.trim()) {
    return res.status(400).json({ error: "No current draft provided." });
  }
  if (!instruction?.trim()) {
    return res.status(400).json({ error: "No refinement instruction provided." });
  }

  const litText = pubmedContext?.trim()
    ? `\n\n${pubmedContext}`
    : "";

  const prompt = `You are an expert medical writer specializing in ${topic}.
The user has a draft of the "${sectionTitle}" section and wants to refine it with the following instruction:

Instruction: ${instruction}

Current draft:
${currentDraft}${litText}

Apply the instruction precisely. Preserve content not targeted by the instruction.
Return ONLY the refined section text — no heading, no preamble, no explanation.`;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    logger.error({ msg: "Groq API error", error: err.message });
    res.status(500).json({ error: "Failed to call Groq API: " + err.message });
  }
});

// Check full-paper coherence and flow
app.post("/api/coherence-check", async (req, res) => {
  const { topic, sections } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: "A medical topic is required." });
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({ error: "No sections provided." });
  }

  const sectionBlock = sections
    .map(s => `### ${s.title}\n${(s.prose || "").slice(0, 2000)}${s.prose?.length > 2000 ? "\n[...truncated]" : ""}`)
    .join("\n\n");

  const prompt = `You are a senior scientific editor reviewing a full draft review article on "${topic.trim()}" for coherence, logical flow, and narrative consistency.

Here is the full article draft:

${sectionBlock}

Evaluate the article and return your analysis in exactly this structure:

## Overall Assessment
One sentence verdict: does the paper flow as a coherent whole? (e.g. "Strong overall flow with minor disconnect in sections 3–4.")

## Section-by-Section Flow
For each adjacent section pair, one line: ✅ if the transition is smooth, ⚠️ if there is a minor issue, ❌ if there is a clear disconnect. Include a brief reason for ⚠️ and ❌.

## Key Issues Found
Numbered list of specific problems: terminology inconsistencies, repeated content, missing links between sections, claims in one section contradicted elsewhere, or conclusions not supported by the body. Be specific (name the sections).

## Recommendations
Numbered list of concrete, actionable edits to fix the issues above. Each recommendation must name the target section(s).

Be direct and specific. Do not pad with generic praise.`;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    logger.error({ msg: "Groq API error", error: err.message });
    res.status(500).json({ error: "Failed to call Groq API: " + err.message });
  }
});

// Suggest relevant section names for a review article
app.post("/api/suggest-sections", async (req, res) => {
  const { topic, existingSections } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: "A medical topic is required." });
  }

  const existing = Array.isArray(existingSections) && existingSections.length
    ? `\nThe article already has these sections: ${existingSections.join(", ")}. Do not suggest duplicates.`
    : "";

  const prompt = `You are a medical writing expert helping to structure a peer-reviewed review article on "${topic.trim()}".${existing}

List 6–8 recommended thematic section titles for the Main Body of this review article. These should be specific to the topic and cover the most important clinical and scientific areas.

Return ONLY a JSON array of strings — no explanation, no markdown, no numbering. Example format:
["Epidemiology & Incidence", "Pathophysiology", "Diagnostic Criteria", "Treatment Approaches", "Emerging Therapies", "Prognosis & Outcomes"]`;

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "[]";
    // Extract the JSON array even if the model adds surrounding text
    const match = raw.match(/\[[\s\S]*\]/);
    const suggestions = match ? JSON.parse(match[0]) : [];
    if (!Array.isArray(suggestions)) throw new Error("Unexpected response shape");
    res.json({ suggestions: suggestions.slice(0, 10) });
  } catch (err) {
    logger.error({ msg: "Groq API error in suggest-sections", error: err.message });
    res.status(500).json({ error: "Failed to generate suggestions: " + err.message });
  }
});

// Only bind to a port when run directly (node server.js / npm start).
// When required by tests, export the app so supertest can attach without a port.
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Medical Article Writer running at http://localhost:${PORT}`);
    logger.info(`Groq API key:  ${process.env.GROQ_API_KEY ? "✓ Loaded" : "✗ MISSING — add GROQ_API_KEY to .env"}`);
    logger.info(`NCBI API key:  ${NCBI_API_KEY ? "✓ Loaded (10 req/s)" : "not set — anonymous rate limit (3 req/s)"}`);
  });
}

module.exports = app;
