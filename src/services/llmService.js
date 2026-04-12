"use strict";

const OpenAI = require("openai");
const { decrypt } = require("./encryptionService");

const PROVIDER_CONFIG = {
  groq:    { baseURL: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile" },
  mistral: { baseURL: "https://api.mistral.ai/v1",       defaultModel: "mistral-large-latest" },
  openai:  { baseURL: "https://api.openai.com/v1",       defaultModel: "gpt-4o-mini" },
};

const MODEL = PROVIDER_CONFIG.groq.defaultModel; // kept for backward compat

// Groq key pool — GROQ_API_KEY required, others optional for 429 rotation
const GROQ_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
].filter(Boolean);

// System keys for non-Groq providers — optional; BYOK users supply their own via Settings
const MISTRAL_KEY = process.env.MISTRAL_API_KEY || null;
const OPENAI_KEY  = process.env.OPENAI_API_KEY  || null;

let _keyIndex = 0;

function _makeClient(key, baseURL) {
  return new OpenAI({ apiKey: key, baseURL });
}

// Keep getClient() for backward compat
function getClient() {
  return _makeClient(GROQ_KEYS[_keyIndex], PROVIDER_CONFIG.groq.baseURL);
}

// Routes Groq requests through the key pool with 429 rotation.
async function createCompletion(params) {
  const total = GROQ_KEYS.length;
  let lastErr;
  for (let i = 0; i < total; i++) {
    const idx = (_keyIndex + i) % total;
    try {
      const result = await _makeClient(GROQ_KEYS[idx], PROVIDER_CONFIG.groq.baseURL)
        .chat.completions.create(params);
      _keyIndex = idx;
      return result;
    } catch (err) {
      if (err?.status === 429) { lastErr = err; continue; }
      throw err;
    }
  }
  _keyIndex = (_keyIndex + 1) % total;
  throw lastErr;
}

// User-aware completion — reads user.llmConfig to pick provider/key/model.
// Falls back to createCompletion() (Groq key pool) when user is null or has no preference.
async function createCompletionForUser(params, user) {
  const provider = user?.llmConfig?.provider || "groq";
  const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.groq;

  // Model resolution: user saved preference > params.model > provider default
  const model = user?.llmConfig?.model || params.model || config.defaultModel;

  // Key resolution: BYOK > system key for provider > fall through to Groq pool
  let key = null;
  if (user?.llmConfig?.encryptedApiKey) {
    try { key = decrypt(user.llmConfig.encryptedApiKey); } catch { /* fall through */ }
  }

  if (!key) {
    const systemKeys = { mistral: MISTRAL_KEY, openai: OPENAI_KEY };
    const sysKey = systemKeys[provider];
    if (sysKey) {
      key = sysKey;
    } else if (provider !== "groq") {
      const err = new Error(`No ${provider} API key configured. Add a key in Settings or contact your administrator.`);
      err.status = 503;
      throw err;
    }
  }

  if (!key) {
    // No BYOK and provider is groq (or unknown) — use Groq pool with 429 rotation
    return createCompletion({ ...params, model });
  }

  return _makeClient(key, config.baseURL).chat.completions.create({ ...params, model });
}

function getClientForUser(user) {
  // Legacy — kept for backward compat; prefer createCompletionForUser() in new code
  if (user?.llmConfig?.encryptedApiKey) {
    try {
      const key = decrypt(user.llmConfig.encryptedApiKey);
      const provider = user?.llmConfig?.provider || "groq";
      const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.groq;
      return _makeClient(key, config.baseURL);
    } catch { /* fall through */ }
  }
  return getClient();
}

module.exports = { getClient, getClientForUser, createCompletion, createCompletionForUser, MODEL };
