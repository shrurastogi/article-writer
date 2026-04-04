const _envFile = process.env.NODE_ENV === "production" ? ".env" : `.env.${process.env.NODE_ENV || "development"}`;
require("dotenv").config({ path: _envFile });
const express = require("express");
const path = require("path");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const passport = require("passport");
const mongoose = require("mongoose");
const logger = require("./lib/logger");
const { requireAuth } = require("./middleware/auth");
const authRouter = require("./routes/auth-router");
const articlesRouter = require("./routes/articles-router");
require("./lib/passport-config");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

// ── Database ──────────────────────────────────────────────────────────────────
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => logger.info("MongoDB connected"))
    .catch((err) => logger.error({ msg: "MongoDB connection error", error: err.message }));
}

// Trust Railway/Heroku/etc. reverse proxy so secure cookies work over HTTPS
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

// ── Session & Passport ────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  store: process.env.MONGODB_URI && process.env.NODE_ENV !== "test"
    ? MongoStore.create({ mongoUrl: process.env.MONGODB_URI })
    : undefined,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "lax" : false,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));
app.use(passport.initialize());
app.use(passport.session());

// ── Page routes (auth-guarded) ────────────────────────────────────────────────
app.get("/", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});
app.get("/login", (req, res) => {
  if (req.isAuthenticated()) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "login.html"));
});

app.use(express.static(path.join(__dirname), { index: false }));

// ── API routers ───────────────────────────────────────────────────────────────
app.use("/auth", authRouter);
app.use("/api/articles", articlesRouter);
app.use("/api", require("./src/routes/ai"));
app.use("/api", require("./src/routes/pubmed"));
app.use("/api", require("./src/routes/export"));

app.get("/api/version", (req, res) => {
  res.json({
    version: process.env.npm_package_version,
    env: process.env.NODE_ENV || "development",
    sha: process.env.BUILD_SHA || "local",
  });
});

// Only bind to a port when run directly (node server.js / npm start).
// When required by tests, export the app so supertest can attach without a port.
const REQUIRED_ENV_VARS = ["GROQ_API_KEY", "MONGODB_URI", "SESSION_SECRET"];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}. Check your .env file.`);
  }
}

if (require.main === module) {
  validateEnv();
  const NCBI_API_KEY = process.env.NCBI_API_KEY || "";
  app.listen(PORT, () => {
    logger.info(`Medical Article Writer running at http://localhost:${PORT}`);
    logger.info(`Groq API key:  ${process.env.GROQ_API_KEY ? "✓ Loaded" : "✗ MISSING — add GROQ_API_KEY to .env"}`);
    logger.info(`NCBI API key:  ${NCBI_API_KEY ? "✓ Loaded (10 req/s)" : "not set — anonymous rate limit (3 req/s)"}`);
  });
}

app.validateEnv = validateEnv;
module.exports = app;
