const _envFile = process.env.NODE_ENV === "production" ? ".env" : `.env.${process.env.NODE_ENV || "development"}`;
require("dotenv").config({ path: _envFile });

// ── Crash diagnostics ─────────────────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[CRASH] uncaughtException:", err.stack || err.message);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[CRASH] unhandledRejection:", reason?.stack || reason);
  // Do not exit — log only. A DB auth failure should not kill the whole process.
});

console.log("[STARTUP] Loading app module...");
const app = require("./src/app");
console.log("[STARTUP] App module loaded.");

const { port, validateEnv } = require("./src/config");
const logger = require("./src/utils/logger");

if (require.main === module) {
  console.log("[STARTUP] Validating env vars...");
  validateEnv();
  console.log("[STARTUP] Env vars OK. PORT =", port);
  const NCBI_API_KEY = process.env.NCBI_API_KEY || "";
  app.listen(port, () => {
    logger.info(`Medical Article Writer running at http://localhost:${port}`);
    logger.info(`Groq API key:  ${process.env.GROQ_API_KEY ? "✓ Loaded" : "✗ MISSING — add GROQ_API_KEY to .env"}`);
    logger.info(`NCBI API key:  ${NCBI_API_KEY ? "✓ Loaded (10 req/s)" : "not set — anonymous rate limit (3 req/s)"}`);
    console.log("[STARTUP] Server listening. Startup complete.");
  });
}

module.exports = app;
