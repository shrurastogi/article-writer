/**
 * Auth middleware.
 * requireAuth  — blocks unauthenticated requests.
 * optionalAuth — always passes; use where auth is helpful but not required.
 */

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  // Return JSON only for API clients that explicitly prefer JSON over HTML.
  // Browsers send Accept: text/html,*/* so req.accepts("json") is always truthy —
  // using accepts(["html","json"]) returns whichever is listed first in the Accept header.
  if (req.accepts(["html", "json"]) === "json") {
    return res.status(401).json({ error: "Authentication required.", code: "UNAUTHENTICATED" });
  }
  res.redirect("/login");
}

function optionalAuth(req, res, next) {
  next();
}

module.exports = { requireAuth, optionalAuth };
