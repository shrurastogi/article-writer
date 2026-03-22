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

// Section-specific context for better AI generation
const SECTION_CONTEXT = {
  abstract: "a structured abstract (Background, Key Findings, Conclusions) for a review article on Multiple Myeloma",
  introduction: "an Introduction covering disease background, clinical burden (~160,000 new cases/year globally), and rationale for the review",
  epidemiology: "an Epidemiology & Risk Factors section covering global incidence, prevalence, demographic trends (median age 70, M:F ratio), racial disparities, and risk factors (MGUS progression, genetic predisposition, occupational exposures)",
  pathophysiology: "a Pathophysiology & Molecular Biology section covering clonal plasma cell proliferation, key genetic alterations (t(4;14), t(14;16), del(17p), gain 1q21), tumor microenvironment, key signaling pathways (MAPK, PI3K/AKT, NF-κB), and disease progression from MGUS to smoldering MM to overt MM",
  diagnosis: "a Clinical Presentation & Diagnosis section covering CRAB criteria (hypercalcemia, renal failure, anemia, bone lesions), SLiM-CRAB criteria, diagnostic workup (SPEP, immunofixation, serum free light chains, 24h urine, bone marrow biopsy, FISH, PET-CT/WB-MRI), and differential diagnosis",
  staging: "a Staging & Risk Stratification section covering ISS (β2-microglobulin, albumin) and R-ISS (+ LDH, FISH cytogenetics), cytogenetic risk categories (standard vs high-risk: del17p, t(4;14), t(14;16), gain 1q), and their prognostic implications",
  treatment_nd: "a Treatment of Newly Diagnosed Multiple Myeloma section covering transplant-eligible pathway (VRd or Dara-VRd induction, ASCT, consolidation, lenalidomide maintenance) and transplant-ineligible pathway (DRd or VRd), key trials (GRIFFIN, PERSEUS, MAIA, SWOG S0777)",
  treatment_rr: "a Treatment of Relapsed/Refractory Multiple Myeloma section covering drug sequencing principles, key drug classes (2nd-gen PIs: carfilzomib, ixazomib; IMiDs: pomalidomide; anti-CD38: daratumumab, isatuximab; XPO1: selinexor; BCL-2: venetoclax in t(11;14)), landmark trials (POLLUX, CASTOR, IKEMA, BOSTON, ELOQUENT-2)",
  novel_therapies: "a Novel Therapies & Emerging Treatments section covering approved CAR-T cell therapies (ide-cel/ABECMA, cilta-cel/CARVYKTI), bispecific antibodies (teclistamab/TECVAYLI, elranatamab, talquetamab/TALVEY), GPRC5D and FcRH5 as novel targets, ADCs (belantamab mafodotin), and key trials (KarMMa, CARTITUDE-1, MajesTEC-1)",
  supportive_care: "a Supportive Care & Management of Complications section covering bone disease (bisphosphonates: zoledronic acid/denosumab, orthopedic interventions, radiation), renal impairment management, infection prophylaxis (IVIG, antiviral, PCP prophylaxis), VTE prophylaxis, anemia management, and peripheral neuropathy",
  future_directions: "a Future Directions & Research Priorities section covering MRD-guided therapy, quadruplet induction regimens, combination immunotherapy approaches, CAR-T optimization strategies, next-generation targets, and key ongoing trials (PERSEUS, IMROZ, IsKia, IFM 2020-02)",
  conclusion: "a Conclusion summarizing major advances in MM treatment over the past decade, remaining challenges (high-risk disease, depth of response, accessibility), and clinical implications for practice",
  references: "a References section listing 30-40 key landmark references in Multiple Myeloma in Vancouver format (numbered, Author et al., Journal, Year;Vol:Pages)",
};

// Generate draft content for a section
app.post("/api/generate", async (req, res) => {
  const { sectionId, sectionTitle, notes } = req.body;

  const context = SECTION_CONTEXT[sectionId] || `the "${sectionTitle}" section of a review article on Multiple Myeloma`;
  const notesText = notes?.trim() ? `\n\nAuthor's specific focus areas:\n${notes}` : "";

  const prompt = `You are an expert medical writer and hematologist/oncologist with deep expertise in Multiple Myeloma. Write ${context}.

Requirements:
- Formal academic writing style suitable for a high-impact journal (Blood, Journal of Clinical Oncology, Leukemia)
- Evidence-based with citations as [Author et al., Year] placeholders
- Comprehensive yet concise (300-600 words for most sections)
- Include key statistics, landmark trial names, drug names, and current guidelines where applicable
- Return ONLY the section content — no section heading, no preamble, no explanations${notesText}`;

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
  const { sectionTitle, content } = req.body;

  if (!content?.trim()) {
    return res.status(400).json({ error: "No content provided." });
  }

  const prompt = `You are an expert medical writer specializing in hematology and oncology. Improve the following text from the "${sectionTitle}" section of a review article on Multiple Myeloma.

Make it:
- More academically rigorous and precise in language
- Better structured with clear logical flow and transitions
- Consistent with standard MM terminology and nomenclature
- More concise where appropriate without losing key content
- Better cited (add [Author et al., Year] placeholders where evidence is cited without a reference)

Return ONLY the improved text — no explanations, no heading.

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
  const { sectionId, sectionTitle } = req.body;

  const context = SECTION_CONTEXT[sectionId] || `the "${sectionTitle}" section of a review article on Multiple Myeloma`;

  const prompt = `You are an expert hematologist/oncologist with deep knowledge of Multiple Myeloma. List the essential key points, topics, and recent developments that must be covered in ${context}.

Include:
- Critical concepts and mechanisms
- Landmark clinical trials and their key findings
- Current guidelines and consensus recommendations
- Important recent developments (2020–2024)
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

      // Section heading
      children.push(
        new Paragraph({
          text: section.title,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 320, after: 160 },
        })
      );

      // Section body — split into paragraphs
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
      creator: "MM Article Writer",
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
  console.log(`MM Article Writer running at http://localhost:${PORT}`);
  console.log(
    `Groq API key: ${process.env.GROQ_API_KEY ? "Loaded" : "MISSING — add GROQ_API_KEY to .env"}`
  );
});
