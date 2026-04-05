const _envFile = process.env.NODE_ENV === "production" ? ".env" : `.env.${process.env.NODE_ENV || "development"}`;
require("dotenv").config({ path: _envFile });

const app = require("./src/app");
const { port, validateEnv } = require("./src/config");
const logger = require("./src/utils/logger");

if (require.main === module) {
  validateEnv();
  const NCBI_API_KEY = process.env.NCBI_API_KEY || "";
  app.listen(port, () => {
    logger.info(`Medical Article Writer running at http://localhost:${port}`);
    logger.info(`Groq API key:  ${process.env.GROQ_API_KEY ? "✓ Loaded" : "✗ MISSING — add GROQ_API_KEY to .env"}`);
    logger.info(`NCBI API key:  ${NCBI_API_KEY ? "✓ Loaded (10 req/s)" : "not set — anonymous rate limit (3 req/s)"}`);
  });
}

module.exports = app;
