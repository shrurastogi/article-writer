const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const User = require("../models/User");
const logger = require("../utils/logger");

// ── Serialize / Deserialize ──────────────────────────────────────────────────

passport.serializeUser((user, done) => {
  done(null, user._id.toString());
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select("-passwordHash");
    done(null, user || false);
  } catch (err) {
    done(err);
  }
});

// ── Google OAuth Strategy ────────────────────────────────────────────────────

if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        const avatarUrl = profile.photos?.[0]?.value || "";

        // Find by googleId first
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          // Check if a local account exists with the same email
          const existing = await User.findOne({ email });
          if (existing) {
            // Link Google to existing local account
            existing.googleId = profile.id;
            existing.avatarUrl = existing.avatarUrl || avatarUrl;
            await existing.save();
            return done(null, existing);
          }
          // Create a new Google-only user
          user = await User.create({
            googleId: profile.id,
            email,
            name: profile.displayName || email,
            avatarUrl,
          });
          logger.info({ msg: "New Google user registered", userId: user._id.toString() });
        }

        return done(null, user);
      } catch (err) {
        logger.error({ msg: "Google strategy error", error: err.message });
        return done(err);
      }
    }
  ));
}

// ── Local Strategy ────────────────────────────────────────────────────────────

passport.use(new LocalStrategy(
  { usernameField: "email" },
  async (email, password, done) => {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user || !user.passwordHash) {
        return done(null, false, { message: "Invalid email or password." });
      }
      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) {
        return done(null, false, { message: "Invalid email or password." });
      }
      return done(null, user);
    } catch (err) {
      logger.error({ msg: "Local strategy error", error: err.message });
      return done(err);
    }
  }
));
