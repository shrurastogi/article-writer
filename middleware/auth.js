/**
 * Auth middleware.
 * requireAuth  — blocks unauthenticated requests.
 * optionalAuth — always passes; use where auth is helpful but not required.
 */

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  if (req.accepts("json")) {
    return res.status(401).json({ error: "Authentication required.", code: "UNAUTHENTICATED" });
  }
  res.redirect("/login");
}

function optionalAuth(req, res, next) {
  next();
}

module.exports = { requireAuth, optionalAuth };
