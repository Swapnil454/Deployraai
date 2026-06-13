import jwt from "jsonwebtoken";

const COOKIE_NAME = process.env.COOKIE_NAME || "deployai_token";

export const requireAuth = (req, res, next) => {
  const token = req.cookies[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod';
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded; // { userId, role, iat, exp }
    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized - Invalid token" });
  }
};

export const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ error: "Forbidden - Admin access required" });
  }
};
