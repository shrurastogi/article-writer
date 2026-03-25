require("dotenv").config();
const express = require("express");
const path = require("path");
const OpenAI = require("openai");
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require("docx");

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname)));

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
    abstract:          `a structured abstract (Background, Key Findings, Conclusions) for a review article on ${t}`,
    introduction:      `an Introduction covering disease background, global burden, and rationale for reviewing ${t}`,
    epidemiology:      `an Epidemiology & Risk Factors section covering incidence, prevalence, demographic trends, and established risk factors for ${t}`,
    pathophysiology:   `a Pathophysiology & Molecular Biology section covering underlying disease mechanisms, key molecular alterations, and disease progression in ${t}`,
    diagnosis:         `a Clinical Presentation & Diagnosis section covering presenting features, diagnostic criteria, workup, imaging, and differential diagnosis for ${t}`,
    staging:           `a Staging & Risk Stratification section covering classification systems, prognostic factors, and risk categories for ${t}`,
    treatment_nd:      `a Treatment of Newly Diagnosed Disease section covering standard first-line strategies, guidelines, and landmark trials for ${t}`,
    treatment_rr:      `a Treatment of Relapsed/Refractory Disease section covering salvage regimens, drug classes, and key clinical trials for ${t}`,
    novel_therapies:   `a Novel Therapies & Emerging Treatments section covering recently approved agents, pipeline therapies, and recent clinical trial data for ${t}`,
    supportive_care:   `a Supportive Care & Management of Complications section covering disease- and treatment-related complications and their management in ${t}`,
    future_directions: `a Future Directions section covering ongoing trials, emerging targets, and unresolved research questions for ${t}`,
    conclusion:        `a Conclusion summarizing major advances, remaining challenges, and clinical implications for ${t}`,
    references:        `a References section listing 30–40 key landmark references on ${t} in Vancouver format (numbered, Author et al., Journal, Year;Vol:Pages)`,
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
    console.error("Groq API error:", err.message);
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
    console.error("Groq API error:", err.message);
    res.status(500).json({ error: "Failed to call Groq API: " + err.message });
  }
});

// Suggest key points to cover in a section
app.post("/api/keypoints", async (req, res) => {
  const { topic, sectionId, sectionTitle } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: "A medical topic is required." });
  }

  const subject = topic.trim();
  const context = getSectionContext(subject, sectionId, sectionTitle);

  const prompt = `You are a domain expert in ${subject}. List the essential key points, topics, and recent developments that must be covered in ${context}.

Include:
- Critical concepts and mechanisms
- Landmark clinical trials and their key findings
- Current guidelines and consensus recommendations
- Important recent developments (last 3–5 years)
- Specific drug names, biomarkers, or criteria where relevant

Format as a clear bulleted list. Each point must be specific and actionable, not generic.`;

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
    console.error("Groq API error:", err.message);
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
    console.error("PubMed error:", err.message);
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
      if (!section.content?.trim()) continue;

      children.push(
        new Paragraph({
          text: section.title,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 320, after: 160 },
        })
      );

      const paragraphs = section.content.split(/\n\n+/).filter((p) => p.trim());
      for (const para of paragraphs) {
        const lines = para.split(/\n/).filter((l) => l.trim());
        for (const line of lines) {
          children.push(
            new Paragraph({
              text: line.trim(),
              spacing: { after: 120 },
            })
          );
        }
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
    console.error("DOCX export error:", err.message);
    res.status(500).json({ error: "Failed to generate DOCX: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Medical Article Writer running at http://localhost:${PORT}`);
  console.log(`Groq API key:  ${process.env.GROQ_API_KEY ? "✓ Loaded" : "✗ MISSING — add GROQ_API_KEY to .env"}`);
  console.log(`NCBI API key:  ${NCBI_API_KEY ? "✓ Loaded (10 req/s)" : "not set — anonymous rate limit (3 req/s)"}`);
});
