"use strict";

const express = require("express");
const path = require("path");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const passport = require("passport");
const mongoose = require("mongoose");
const logger = require("./utils/logger");
const { requireAuth } = require("./middleware/auth");
const aiRateLimit = require("./middleware/rateLimit");
require("./lib/passport-config");

const app = express();

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
  res.sendFile(path.join(__dirname, "../index.html"));
});
app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "../dashboard.html"));
});
app.get("/login", (req, res) => {
  if (req.isAuthenticated()) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "../login.html"));
});

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.static(path.join(__dirname, ".."), { index: false }));

// ── API routers ───────────────────────────────────────────────────────────────
app.use("/auth", require("./routes/auth"));
app.use("/api/articles", require("./routes/articles"));
app.use("/api/articles/:id/versions", require("./routes/versions"));
app.use("/api", aiRateLimit, require("./routes/ai"));
app.use("/api", require("./routes/pubmed"));
app.use("/api", require("./routes/export"));

app.get("/api/version", (req, res) => {
  res.json({
    version: process.env.npm_package_version,
    env: process.env.NODE_ENV || "development",
    sha: process.env.BUILD_SHA || "local",
  });
});

module.exports = app;
