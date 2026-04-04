"use strict";

const router = require("express").Router();
const { getClient, MODEL } = require("../services/llmService");
const { getSectionContext } = require("../services/sectionContext");
const logger = require("../../lib/logger");

// Generate draft content for a section
router.post("/generate", async (req, res) => {
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

    const stream = await getClient().chat.completions.create({
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
router.post("/improve", async (req, res) => {
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

    const stream = await getClient().chat.completions.create({
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
router.post("/keypoints", async (req, res) => {
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

    const stream = await getClient().chat.completions.create({
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

// Generate an HTML table for a section
router.post("/generate-table", async (req, res) => {
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

    const stream = await getClient().chat.completions.create({
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
router.post("/refine", async (req, res) => {
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

    const stream = await getClient().chat.completions.create({
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
router.post("/coherence-check", async (req, res) => {
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

    const stream = await getClient().chat.completions.create({
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
router.post("/suggest-sections", async (req, res) => {
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
    const completion = await getClient().chat.completions.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    const suggestions = match ? JSON.parse(match[0]) : [];
    if (!Array.isArray(suggestions)) throw new Error("Unexpected response shape");
    res.json({ suggestions: suggestions.slice(0, 10) });
  } catch (err) {
    logger.error({ msg: "Groq API error in suggest-sections", error: err.message });
    res.status(500).json({ error: "Failed to generate suggestions: " + err.message });
  }
});

module.exports = router;
