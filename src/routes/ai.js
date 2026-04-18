"use strict";

const router = require("express").Router();
const { createCompletionForUser, MODEL } = require("../services/llmService");
const { getSectionContext, getStyleInstruction } = require("../services/sectionContext");
const Article = require("../models/Article");
const { requireApiAuth } = require("../middleware/auth");
const logger = require("../utils/logger");

// Generate draft content for a section
router.post("/generate", async (req, res) => {
  const { topic, sectionId, sectionTitle, notes, pubmedContext, userContext, language, writingStyle, articleType, existingSections } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: "A medical topic is required." });
  }

  const subject = topic.trim();
  const context = getSectionContext(subject, sectionId, sectionTitle, articleType || "review");
  const notesText = notes?.trim() ? `\n\nAuthor's specific focus areas:\n${notes}` : "";
  const litText = pubmedContext?.trim()
    ? `\n\nRecent literature from PubMed (use these abstracts for evidence and [Author et al., Year] citations):\n${pubmedContext}`
    : "";
  const userContextText = userContext?.trim()
    ? `\n\nAuthor-supplied data (treat as authoritative — incorporate directly):\n${userContext.trim()}`
    : "";
  const languagePrefix = language && language !== "English"
    ? `Important: Respond in ${language} at a clinical academic level.\n\n`
    : "";
  const styleText = getStyleInstruction(writingStyle);
  const journalHint = { original_research: "NEJM, Lancet, JAMA", perspective: "NEJM Perspective, Lancet Comment, JAMA Viewpoint" }[articleType] || "Nat Rev / NEJM reviews, JCO Reviews";
  const existingSectionsText = Array.isArray(existingSections) && existingSections.length
    ? `\n\nContent already covered in other sections (do not repeat — cross-reference or build upon instead):\n` +
      existingSections.filter(s => s.prose?.trim()).map(s => `- ${s.title}: ...${s.prose.trim().slice(-300)}`).join("\n")
    : "";

  const prompt = `${languagePrefix}You are an expert medical writer with deep expertise in ${subject}. Write ${context}.

Requirements:
- Formal academic writing style suitable for a high-impact journal (e.g. ${journalHint})
- Evidence-based with citations as [Author et al., Year] placeholders
- Comprehensive yet concise (300–600 words for most sections)
- Include key statistics, landmark trial names, drug names, and current guidelines where applicable
- Return ONLY the section content — no section heading, no preamble, no explanations${styleText ? `\n- ${styleText}` : ""}${notesText}${litText}${userContextText}${existingSectionsText}`;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await createCompletionForUser({
      model: MODEL,
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }, req.user);

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    logger.error({ msg: "LLM API error", error: err.message });
    res.status(err.status || 500).json({ error: "AI generation failed: " + err.message });
  }
});

// Improve existing section text
router.post("/improve", async (req, res) => {
  const { topic, sectionTitle, content, pubmedContext, userContext, language, writingStyle } = req.body;

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
  const userContextText = userContext?.trim()
    ? `\n\nAuthor-supplied data (treat as authoritative — incorporate directly):\n${userContext.trim()}`
    : "";
  const languagePrefix = language && language !== "English"
    ? `Important: Respond in ${language} at a clinical academic level.\n\n`
    : "";
  const styleText = getStyleInstruction(writingStyle);

  const prompt = `${languagePrefix}You are an expert medical writer specializing in ${subject}. Improve the following text from the "${sectionTitle}" section of a review article on ${subject}.

Make it:
- More academically rigorous and precise in language
- Better structured with clear logical flow and transitions
- Consistent with standard ${subject} terminology and nomenclature
- More concise where appropriate without losing key content
- Better cited (add [Author et al., Year] placeholders where evidence is cited without a reference)${styleText ? `\n- ${styleText}` : ""}

Return ONLY the improved text — no explanations, no heading.${litText}${userContextText}

Original text:
${content}`;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await createCompletionForUser({
      model: MODEL,
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }, req.user);

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    logger.error({ msg: "LLM API error", error: err.message });
    res.status(err.status || 500).json({ error: "AI generation failed: " + err.message });
  }
});

// Suggest key points to cover in a section
router.post("/keypoints", async (req, res) => {
  const { topic, sectionId, sectionTitle, pubmedContext, userContext, language, writingStyle } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: "A medical topic is required." });
  }

  const subject = topic.trim();
  const context = getSectionContext(subject, sectionId, sectionTitle);
  const litText = pubmedContext?.trim()
    ? `\n\nSelected references from the user's library (abstracts and available full-text). Extract specific key points, trial names, statistics, and findings directly from these papers:\n${pubmedContext}`
    : "";
  const userContextText = userContext?.trim()
    ? `\n\nAuthor-supplied data (treat as authoritative — incorporate directly):\n${userContext.trim()}`
    : "";
  const languagePrefix = language && language !== "English"
    ? `Important: Respond in ${language} at a clinical academic level.\n\n`
    : "";
  const styleText = getStyleInstruction(writingStyle);

  const prompt = `${languagePrefix}You are a domain expert in ${subject}. List the essential key points, topics, and recent developments that must be covered in ${context}.${styleText ? ` ${styleText}` : ""}

Include:
- Critical concepts and mechanisms
- Landmark clinical trials and their key findings
- Current guidelines and consensus recommendations
- Important recent developments (last 3–5 years)
- Specific drug names, biomarkers, or criteria where relevant
${pubmedContext?.trim() ? "- Cite specific findings from the provided references where applicable (Author et al., Year)" : ""}

Format as a clear bulleted list. Each point must be specific and actionable, not generic.${litText}${userContextText}`;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await createCompletionForUser({
      model: MODEL,
      max_tokens: 900,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }, req.user);

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    logger.error({ msg: "LLM API error", error: err.message });
    res.status(err.status || 500).json({ error: "AI generation failed: " + err.message });
  }
});

// Generate an HTML table for a section
router.post("/generate-table", async (req, res) => {
  const { topic, sectionTitle, tableDescription, pubmedContext, language } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: "A medical topic is required." });
  }
  if (!tableDescription?.trim()) {
    return res.status(400).json({ error: "A table description is required." });
  }

  const litText = pubmedContext?.trim()
    ? `\nPubMed context (use data from these abstracts where possible):\n${pubmedContext}`
    : "";
  const languagePrefix = language && language !== "English"
    ? `Important: Respond in ${language} at a clinical academic level.\n\n`
    : "";

  const prompt = `${languagePrefix}You are an expert medical writer creating a publication-quality data table.

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

    const stream = await createCompletionForUser({
      model: MODEL,
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }, req.user);

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    logger.error({ msg: "LLM API error", error: err.message });
    res.status(err.status || 500).json({ error: "AI generation failed: " + err.message });
  }
});

// Refine an existing draft section with a user instruction
router.post("/refine", async (req, res) => {
  const { topic, sectionTitle, currentDraft, instruction, pubmedContext, userContext, language, writingStyle } = req.body;

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
  const userContextText = userContext?.trim()
    ? `\n\nAuthor-supplied data (treat as authoritative — incorporate directly):\n${userContext.trim()}`
    : "";
  const languagePrefix = language && language !== "English"
    ? `Important: Respond in ${language} at a clinical academic level.\n\n`
    : "";
  const styleText = getStyleInstruction(writingStyle);

  const prompt = `${languagePrefix}You are an expert medical writer specializing in ${topic}.
The user has a draft of the "${sectionTitle}" section and wants to refine it with the following instruction:

Instruction: ${instruction}${styleText ? `\n${styleText}` : ""}

Current draft:
${currentDraft}${litText}${userContextText}

Apply the instruction precisely. Preserve content not targeted by the instruction.
Return ONLY the refined section text — no heading, no preamble, no explanation.`;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await createCompletionForUser({
      model: MODEL,
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }, req.user);

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    logger.error({ msg: "LLM API error", error: err.message });
    res.status(err.status || 500).json({ error: "AI generation failed: " + err.message });
  }
});

// Check full-paper coherence and flow
router.post("/coherence-check", async (req, res) => {
  const { topic, sections, language } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: "A medical topic is required." });
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({ error: "No sections provided." });
  }

  const sectionBlock = sections
    .map(s => `### ${s.title}\n${(s.prose || "").slice(0, 2000)}${s.prose?.length > 2000 ? "\n[...truncated]" : ""}`)
    .join("\n\n");
  const languagePrefix = language && language !== "English"
    ? `Important: Respond in ${language} at a clinical academic level.\n\n`
    : "";

  const prompt = `${languagePrefix}You are a senior scientific editor reviewing a full draft review article on "${topic.trim()}" for coherence, logical flow, and narrative consistency.

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

    const stream = await createCompletionForUser({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }, req.user);

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    logger.error({ msg: "LLM API error", error: err.message });
    res.status(err.status || 500).json({ error: "AI generation failed: " + err.message });
  }
});

// Context-aware coherence fix — rewrites one section with knowledge of adjacent sections
router.post("/coherence-fix", async (req, res) => {
  const { topic, sectionTitle, currentDraft, recommendation, prevSection, nextSection, language, writingStyle } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: "A medical topic is required." });
  }
  if (!currentDraft?.trim()) {
    return res.status(400).json({ error: "No current draft provided." });
  }
  if (!recommendation?.trim()) {
    return res.status(400).json({ error: "No recommendation provided." });
  }

  const languagePrefix = language && language !== "English"
    ? `Important: Respond in ${language} at a clinical academic level.\n\n`
    : "";
  const styleText = getStyleInstruction(writingStyle);

  const prevBlock = prevSection?.prose?.trim()
    ? `\n\nPreceding section — "${prevSection.title}" (final part):\n${prevSection.prose.trim().slice(-400)}`
    : "";
  const nextBlock = nextSection?.prose?.trim()
    ? `\n\nFollowing section — "${nextSection.title}" (opening part):\n${nextSection.prose.trim().slice(0, 400)}`
    : "";

  const prompt = `${languagePrefix}You are a senior medical editor fixing a coherence issue in a review article on "${topic.trim()}".

Issue to fix in the "${sectionTitle}" section:
${recommendation}

Section to revise:
${currentDraft}${prevBlock}${nextBlock}

Rewrite the "${sectionTitle}" section to:
1. Fix the stated issue precisely
2. Flow naturally FROM the preceding section — do not repeat points it already made${prevSection ? ` ("${prevSection.title}")` : ""}
3. Set up the following section logically — leave its content for it to cover${nextSection ? ` ("${nextSection.title}")` : ""}
4. Preserve all unique clinical content, data, and citations in the current draft${styleText ? `\n5. ${styleText}` : ""}

Return ONLY the revised section text — no heading, no preamble, no explanation.`;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await createCompletionForUser({
      model: MODEL,
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }, req.user);

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    logger.error({ msg: "LLM API error in coherence-fix", error: err.message });
    res.status(err.status || 500).json({ error: "AI generation failed: " + err.message });
  }
});

// Grammar and style check for a section
router.post("/grammar-check", async (req, res) => {
  const { content, topic, sectionTitle, language } = req.body;

  if (!content?.trim()) {
    return res.status(400).json({ error: "Section content is required." });
  }

  const languagePrefix = language && language !== "English"
    ? `Important: Respond in ${language} at a clinical academic level.\n\n`
    : "";

  const prompt = `${languagePrefix}You are a scientific copy-editor reviewing a section of a medical review article for grammar and style issues.

Section: "${sectionTitle || "Untitled"}"
Topic: "${topic?.trim() || "medical"}"

Content to review:
"""
${content.trim().slice(0, 3000)}
"""

Check for these issue types only: PASSIVE_VOICE, LONG_SENTENCE, INFORMAL, HEDGING.

For each issue found, output exactly one line in this format:
ISSUE | <TYPE> | <exact fragment from text, max 15 words> | <brief suggestion>

If no issues are found, output exactly: NO_ISSUES

Rules:
- Output ONLY the ISSUE lines or NO_ISSUES — no other text, no preamble, no explanations.
- Limit to the 5 most important issues.
- Fragment must be a verbatim substring of the input text.`;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await createCompletionForUser({
      model: MODEL,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }, req.user);

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    logger.error({ msg: "LLM API error", error: err.message });
    res.status(err.status || 500).json({ error: "AI generation failed: " + err.message });
  }
});

// Calibrate writing style from a sample text
router.post("/articles/:id/calibrate-style", requireApiAuth, async (req, res) => {
  const { sampleText } = req.body;
  if (!sampleText || sampleText.trim().length < 100) {
    return res.status(400).json({ error: "Sample must be at least 100 characters." });
  }

  const article = await Article.findOne({ _id: req.params.id, _userId: req.user._id });
  if (!article) return res.status(404).json({ error: "Not found." });

  const prompt = `Analyze the writing style of the following text and return a JSON object with these exact keys:
avgSentenceLength (number, average words per sentence),
activeVoicePercent (number 0-100),
formalityScore (number 0-100, where 100 is very formal),
hedgingFrequency ("low" | "medium" | "high"),
citationDensity ("low" | "medium" | "high"),
toneDescriptor (string, max 20 chars, e.g. "authoritative", "cautious", "clinical").
Return ONLY valid JSON — no markdown, no code fences, no explanation.
Text:
"""${sampleText.trim().slice(0, 3000)}"""`;

  try {
    const completion = await createCompletionForUser({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }, req.user);
    const raw = completion.choices[0].message.content.trim();
    let styleProfile;
    try { styleProfile = JSON.parse(raw); }
    catch {
      logger.error({ msg: "Style profile JSON parse error", raw: raw.slice(0, 200) });
      return res.status(500).json({ error: "Could not parse style profile from AI response." });
    }

    article.writingStyle = { sampleText: sampleText.trim().slice(0, 1000), styleProfile, calibratedAt: new Date() };
    article.markModified("writingStyle");
    await article.save();
    res.json({ writingStyle: article.writingStyle });
  } catch (err) {
    logger.error({ msg: "Calibrate style error", error: err.message });
    res.status(500).json({ error: "Failed to calibrate style: " + err.message });
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
    const completion = await createCompletionForUser({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }, req.user);

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

// One-click full article draft — SSE endpoint
router.post("/agent/draft", async (req, res) => {
  const { topic, sections, language, pubmedContext, writingStyle, articleType } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: "A medical topic is required." });
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({ error: "No sections provided." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  function sendEvent(data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  const subject = topic.trim();
  const languagePrefix = language && language !== "English"
    ? `Important: Respond in ${language} at a clinical academic level.\n\n`
    : "";
  const litText = pubmedContext?.trim()
    ? `\n\nRecent literature from PubMed (use these abstracts for evidence and [Author et al., Year] citations):\n${pubmedContext}`
    : "";

  const styleText = getStyleInstruction(writingStyle);
  const generatedSections = [];
  const journalHint = { original_research: "NEJM, Lancet, JAMA", perspective: "NEJM Perspective, Lancet Comment" }[articleType] || "Nat Rev / NEJM reviews, JCO Reviews";

  try {
    for (const section of sections) {
      const { id, title, notes, userContext } = section;
      sendEvent({ type: "section_start", id, title });

      const context = getSectionContext(subject, id, title, articleType || "review");
      const notesText = notes?.trim() ? `\n\nAuthor's specific focus areas:\n${notes}` : "";
      const userContextText = userContext?.trim()
        ? `\n\nAuthor-supplied data (treat as authoritative — incorporate directly):\n${userContext.trim()}`
        : "";
      const priorContextText = generatedSections.length
        ? `\n\nPreviously generated sections (do not repeat these points — build upon them):\n` +
          generatedSections.map(s => `- ${s.title}: ${s.prose.slice(0, 150)}…`).join("\n")
        : "";

      const prompt = `${languagePrefix}You are an expert medical writer with deep expertise in ${subject}. Write ${context}.

Requirements:
- Formal academic writing style suitable for a high-impact journal (e.g. ${journalHint})
- Evidence-based with citations as [Author et al., Year] placeholders
- Comprehensive yet concise (300–600 words for most sections)
- Return ONLY the section content — no section heading, no preamble, no explanations${styleText ? `\n- ${styleText}` : ""}${notesText}${litText}${userContextText}${priorContextText}`;

      const stream = await createCompletionForUser({
        model: MODEL,
        max_tokens: 1800,
        messages: [{ role: "user", content: prompt }],
        stream: true,
      }, req.user);

      let content = "";
      for await (const chunk of stream) {
        content += chunk.choices[0]?.delta?.content || "";
      }

      sendEvent({ type: "section_done", id, title, content });
      generatedSections.push({ title, prose: content });
    }

    sendEvent({ type: "complete" });
    res.end();
  } catch (err) {
    logger.error({ msg: "Agent draft error", error: err.message });
    sendEvent({ type: "error", message: err.message });
    res.end();
  }
});

module.exports = router;
