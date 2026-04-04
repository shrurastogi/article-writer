"use strict";

const OpenAI = require("openai");

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

module.exports = { getClient, MODEL };
