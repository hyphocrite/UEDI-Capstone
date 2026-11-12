const env = require("../config/env");

/**
 * Fixed-window limit per client IP, kept in memory (fine for UEDI's single API process).
 * `key` can narrow it further, e.g. to IP + email for login attempts.
 */
function rateLimit({ windowMs, max, message, key = () => "" }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    if (!env.authRateLimit) return next();
    const k = `${req.ip}|${key(req)}`;
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

module.exports = { rateLimit };
