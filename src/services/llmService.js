"use strict";

const OpenAI = require("openai");
const { decrypt } = require("./encryptionService");

const MODEL = "llama-3.3-70b-versatile";

let _client;
function getClient() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return _client;
}

function getClientForUser(user) {
  if (user?.llmConfig?.encryptedApiKey) {
    try {
      const key = decrypt(user.llmConfig.encryptedApiKey);
      return new OpenAI({ apiKey: key, baseURL: "https://api.groq.com/openai/v1" });
    } catch {
      // Decryption failed — fall back to system key
    }
  }
  return getClient();
}

module.exports = { getClient, getClientForUser, MODEL };
