"use strict";

const OpenAI = require("openai");
const { decrypt } = require("./encryptionService");

const MODEL = "llama-3.3-70b-versatile";

// Build key pool at startup — GROQ_API_KEY is required, others are optional
const GROQ_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
].filter(Boolean);

let _keyIndex = 0;

function _makeClient(key) {
  return new OpenAI({ apiKey: key, baseURL: "https://api.groq.com/openai/v1" });
}

// Keep getClient() for backward compat (used by getClientForUser)
function getClient() {
  return _makeClient(GROQ_KEYS[_keyIndex]);
}

function getClientForUser(user) {
  if (user?.llmConfig?.encryptedApiKey) {
    try {
      const key = decrypt(user.llmConfig.encryptedApiKey);
      return _makeClient(key);
    } catch { /* fall through to system key */ }
  }
  return getClient();
}

// Drop-in replacement for getClient().chat.completions.create()
// On 429, rotates to the next key and retries all keys before surfacing the error.
async function createCompletion(params) {
  const total = GROQ_KEYS.length;
  let lastErr;
  for (let i = 0; i < total; i++) {
    const idx = (_keyIndex + i) % total;
    try {
      const result = await _makeClient(GROQ_KEYS[idx]).chat.completions.create(params);
      _keyIndex = idx; // stick to this key for the next request
      return result;
    } catch (err) {
      if (err?.status === 429) {
        lastErr = err;
        continue; // try next key
      }
      throw err; // non-429 errors propagate immediately
    }
  }
  // All keys exhausted — advance so next request starts from a fresh key
  _keyIndex = (_keyIndex + 1) % total;
  throw lastErr;
}

module.exports = { getClient, getClientForUser, createCompletion, MODEL };
