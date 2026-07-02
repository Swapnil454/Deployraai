/**
 * Strictly compare two URL strings by parsing with new URL() and
 * comparing protocol + hostname + port — NOT a prefix match.
 * This prevents attacker domains like `https://deployai.in.attacker.com`
 * from satisfying a `.startsWith("https://deployai.in")` check.
 */
const isSameOrigin = (incomingUrl, expectedUrl) => {
  try {
    const incoming = new URL(incomingUrl);
    const expected = new URL(expectedUrl);
    return (
      incoming.protocol === expected.protocol &&
      incoming.hostname === expected.hostname &&
      incoming.port    === expected.port
    );
  } catch {
    return false;
  }
};

export const requireOrigin = (req, res, next) => {
  // Only protect state-changing requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const origin  = req.headers.origin;
  const referer = req.headers.referer;

  const expectedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (origin) {
    if (!isSameOrigin(origin, expectedOrigin)) {
      return res.status(403).json({ error: 'CSRF check failed: Invalid Origin' });
    }
  } else if (referer) {
    if (!isSameOrigin(referer, expectedOrigin)) {
      return res.status(403).json({ error: 'CSRF check failed: Invalid Referer' });
    }
  }
  // If neither header is present the request is treated as a non-browser
  // (e.g. curl / server-to-server) which cannot carry session cookies cross-site.

  next();
};
