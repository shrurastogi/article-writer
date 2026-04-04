"use strict";

const REQUIRED_ENV_VARS = ["GROQ_API_KEY", "MONGODB_URI", "SESSION_SECRET"];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}. Check your .env file.`);
  }
}

module.exports = {
  port: process.env.PORT || 3000,
  validateEnv,
};
