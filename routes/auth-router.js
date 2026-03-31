const express = require("express");
const passport = require("passport");
const bcrypt = require("bcrypt");
const User = require("../models/user");
const logger = require("../lib/logger");

const router = express.Router();

const BCRYPT_ROUNDS = process.env.NODE_ENV === "test" ? 1 : 12;

// ── Google OAuth ──────────────────────────────────────────────────────────────

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login?error=auth_failed" }),
  (req, res) => res.redirect("/dashboard")
);

// ── Local: Register ───────────────────────────────────────────────────────────

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "name, email, and password are required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  try {
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ error: "An account with that email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
    });

    logger.info({ msg: "New local user registered", userId: user._id.toString() });

    req.login(user, (err) => {
      if (err) {
        logger.error({ msg: "Session error after register", error: err.message });
        return res.status(500).json({ error: "Registration succeeded but session could not be created." });
      }
      res.status(201).json({ ok: true, user: user.toSafeObject() });
    });
  } catch (err) {
    logger.error({ msg: "Register error", error: err.message });
    res.status(500).json({ error: "Registration failed." });
  }
});

// ── Local: Login ──────────────────────────────────────────────────────────────

router.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({ error: info?.message || "Invalid email or password." });
    }
    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      res.json({ ok: true, user: user.toSafeObject() });
    });
  })(req, res, next);
});

// ── Logout ────────────────────────────────────────────────────────────────────

router.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect("/login"));
  });
});

// ── Current user ──────────────────────────────────────────────────────────────

router.get("/me", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required.", code: "UNAUTHENTICATED" });
  }
  res.json(req.user.toSafeObject());
});

module.exports = router;
