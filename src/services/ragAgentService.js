"use strict";

const { getEmbedding } = require("./embeddingService");
const { queryVectors, bm25Fallback } = require("./pineconeService");
const { createCompletionForUser } = require("./llmService");
const logger = require("../utils/logger");

const INTENT_TYPES = ["factual", "comparative", "statistical", "trend", "multi-doc", "verification"];

// ── Intent classification ─────────────────────────────────────────────────────

async function classifyIntent(question, user) {
  const prompt = `Classify the following research question into exactly one category.

Categories:
- factual: asking for a specific fact, definition, or finding
- comparative: comparing two or more treatments, drugs, outcomes, or studies
- statistical: asking for numbers, p-values, confidence intervals, effect sizes, or statistical results
- trend: asking about trends, patterns over time, or longitudinal data
- multi-doc: requiring synthesis across multiple papers
- verification: checking whether a specific claim is supported by evidence

Question: "${question}"

Reply with ONLY one word from the list above.`;

  try {
    const result = await createCompletionForUser({
      model: "llama-3.3-70b-versatile",
      max_tokens: 10,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }, user);

    const intent = result.choices[0]?.message?.content?.trim().toLowerCase();
    return INTENT_TYPES.includes(intent) ? intent : "factual";
  } catch {
    return "factual";
  }
}

// ── Agent tools ───────────────────────────────────────────────────────────────

async function searchLibrary(query, articleId, library, user, topK = 8) {
  const embResult = await getEmbedding(query, user);

  if (embResult) {
    try {
      return await queryVectors(articleId, embResult.vector, topK);
    } catch (err) {
      logger.error({ msg: "Pinecone query failed, falling back to BM25", error: err.message });
    }
  }

  return bm25Fallback(query, library, topK);
}

// Extracts statistical values from retrieved chunks using regex patterns from agentic-RAG.
function retrieveStatistics(chunks) {
  const patterns = [
    /p\s*[<=>]\s*[\d.]+/gi,
    /\d+\.?\d*\s*%\s*(?:CI|confidence interval)/gi,
    /(?:OR|HR|RR|NNT)\s*[=:]\s*[\d.]+/gi,
    /\d+\.?\d*\s*\(\s*95%\s*CI[^)]+\)/gi,
    /hazard ratio[^.;]*/gi,
    /odds ratio[^.;]*/gi,
  ];

  const stats = [];
  for (const chunk of chunks) {
    for (const pat of patterns) {
      const matches = chunk.content.match(pat);
      if (matches) {
        stats.push(...matches.map(m => ({ stat: m.trim(), pmid: chunk.pmid, title: chunk.title })));
      }
    }
  }
  return stats;
}

async function comparePapers(query, chunks, user) {
  if (!chunks.length) return null;

  const evidence = chunks
    .slice(0, 6)
    .map(c => {
      const first = (c.authors || "").split(",")[0].trim().split(/\s+/)[0] || "Author";
      return `[${first} et al., ${c.year}] ${c.title}: ${c.content.slice(0, 400)}`;
    })
    .join("\n\n");

  const prompt = `You are a medical research analyst. Compare the following evidence from multiple papers regarding: "${query}"

${evidence}

Provide a concise comparative analysis (3-5 sentences). Cite papers inline as [Author et al., Year].
Return ONLY the analysis — no preamble.`;

  const result = await createCompletionForUser({
    model: "llama-3.3-70b-versatile",
    max_tokens: 400,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
    stream: false,
  }, user);

  return result.choices[0]?.message?.content?.trim() || null;
}

async function verifyClaim(claim, chunks, user) {
  if (!chunks.length) return { supported: false, explanation: "No relevant evidence found." };

  const evidence = chunks
    .slice(0, 4)
    .map(c => {
      const first = (c.authors || "").split(",")[0].trim().split(/\s+/)[0] || "Author";
      return `[${first} et al., ${c.year}] ${c.title}: ${c.content.slice(0, 400)}`;
    })
    .join("\n\n");

  const prompt = `Does the following claim have support in the provided evidence?

Claim: "${claim}"

Evidence:
${evidence}

Reply with JSON: { "supported": true/false, "explanation": "1-2 sentence reason citing [Author et al., Year]" }
Return ONLY the JSON.`;

  try {
    const result = await createCompletionForUser({
      model: "llama-3.3-70b-versatile",
      max_tokens: 150,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }, user);

    const raw = result.choices[0]?.message?.content?.trim() || "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { supported: false, explanation: raw };
  } catch {
    return { supported: false, explanation: "Could not verify claim." };
  }
}

// ── Main agentic workflow ─────────────────────────────────────────────────────

// Async generator — yields SSE-ready event objects.
// Events: { type: "thinking"|"token"|"citations"|"done", text?, sources? }
async function* runAgentWorkflow(question, articleId, sectionId, user, article) {
  const library = article?.library || [];

  yield { type: "thinking", text: "Classifying question intent..." };
  const intent = await classifyIntent(question, user);
  yield { type: "thinking", text: `Intent: ${intent}. Searching library...` };

  // Step 1: retrieve relevant chunks
  let chunks = await searchLibrary(question, articleId, library, user, 10);

  if (!chunks.length) {
    yield { type: "token", text: "No relevant papers found in your library for this question." };
    yield { type: "done" };
    return;
  }

  // Step 2: apply intent-specific tools
  let extraContext = "";

  if (intent === "statistical") {
    yield { type: "thinking", text: "Extracting statistical data..." };
    const stats = retrieveStatistics(chunks);
    if (stats.length) {
      extraContext = `\n\nKey statistics found:\n${stats.slice(0, 10).map(s => `- ${s.stat} (${s.title})`).join("\n")}`;
    }
  }

  if (intent === "comparative" || intent === "multi-doc") {
    yield { type: "thinking", text: "Comparing findings across papers..." };
    const comparison = await comparePapers(question, chunks, user);
    if (comparison) extraContext = `\n\nComparative analysis:\n${comparison}`;
  }

  if (intent === "verification") {
    yield { type: "thinking", text: "Verifying claim against evidence..." };
    const result = await verifyClaim(question, chunks, user);
    extraContext = `\n\nVerification: ${result.explanation}`;
  }

  // Step 3: deduplicate by PMID (keep highest-ranked chunk per paper), cap at 8 papers
  const seenPmids = new Set();
  const topChunks = chunks.filter(c => c.pmid && !seenPmids.has(c.pmid) && seenPmids.add(c.pmid)).slice(0, 8);

  yield { type: "thinking", text: "Synthesizing answer..." };

  // Step 4: synthesize with streaming
  const topic = article?.topic || "the topic";
  const articleType = article?.articleType || "review";
  const sectionNote = sectionId ? ` (for the ${sectionId} section)` : "";

  // Build [Author et al., Year] citation keys — one per unique paper
  function makeCiteKey(c) {
    const first = (c.authors || "").split(",")[0].trim().split(/\s+/)[0] || "Author";
    return `[${first} et al., ${c.year || ""}]`.trim();
  }

  const evidence = topChunks
    .map(c => `${makeCiteKey(c)} PMID ${c.pmid} — ${c.title}:\n"${c.content.slice(0, 500)}"`)
    .join("\n\n");

  const prompt = `You are an expert medical research assistant helping write a ${articleType} article on ${topic}.

The user asked${sectionNote}: "${question}"

Retrieved evidence from their PubMed library (ranked by relevance):
${evidence}${extraContext}

Using ONLY the evidence above, answer the question concisely (3-6 sentences).
Cite sources inline using the exact [Author et al., Year] keys shown above.
Return ONLY the answer — no preamble, no heading, no source list.`;

  const stream = await createCompletionForUser({
    model: "llama-3.3-70b-versatile",
    max_tokens: 600,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }],
    stream: true,
  }, user);

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || "";
    if (text) yield { type: "token", text };
  }

  // Step 5: emit deduplicated citation list with citeKey for UI display
  const sources = topChunks.map(c => ({
    pmid:    c.pmid,
    title:   c.title,
    authors: c.authors,
    year:    c.year,
    citeKey: makeCiteKey(c),
    snippet: c.content.slice(0, 200),
  }));

  yield { type: "citations", sources };
  yield { type: "done" };
}

module.exports = { runAgentWorkflow, classifyIntent, searchLibrary, retrieveStatistics };
