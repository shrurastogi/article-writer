"use strict";

const { decrypt } = require("./encryptionService");

const EMBEDDING_ENDPOINTS = {
  openai:  { url: "https://api.openai.com/v1/embeddings",  model: "text-embedding-3-small",  dims: 1536 },
  mistral: { url: "https://api.mistral.ai/v1/embeddings",  model: "mistral-embed",            dims: 1024 },
};

const SYSTEM_KEYS = {
  openai:  process.env.OPENAI_API_KEY  || null,
  mistral: process.env.MISTRAL_API_KEY || null,
};

// Returns { vector: number[], dims: number } or null when no embedding key is available.
async function getEmbedding(text, user) {
  if (!text?.trim()) return null;
  const { provider, key } = _resolveEmbeddingProvider(user);
  if (!provider || !key) return null;

  const cfg = EMBEDDING_ENDPOINTS[provider];
  const resp = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: cfg.model, input: text }),
  });

  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`Embedding API error (${resp.status}): ${msg}`);
  }

  const data = await resp.json();
  const vector = data?.data?.[0]?.embedding;
  if (!vector) throw new Error("Embedding API returned no vector");
  return { vector, dims: cfg.dims };
}

// Returns the embedding dimension for the active provider (used when creating Pinecone index).
function getEmbeddingDims(user) {
  const { provider } = _resolveEmbeddingProvider(user);
  return EMBEDDING_ENDPOINTS[provider]?.dims ?? null;
}

function _resolveEmbeddingProvider(user) {
  // BYOK key takes priority; check if the user's provider supports embeddings
  if (user?.llmConfig?.encryptedApiKey) {
    const provider = user.llmConfig.provider;
    if (EMBEDDING_ENDPOINTS[provider]) {
      try {
        const key = decrypt(user.llmConfig.encryptedApiKey);
        return { provider, key };
      } catch { /* fall through */ }
    }
  }

  // System keys — prefer OpenAI, then Mistral
  for (const provider of ["openai", "mistral"]) {
    const key = SYSTEM_KEYS[provider];
    if (key) return { provider, key };
  }

  return { provider: null, key: null };
}

module.exports = { getEmbedding, getEmbeddingDims };
