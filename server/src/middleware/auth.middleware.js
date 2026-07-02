import jwt from "jsonwebtoken";

const COOKIE_NAME = process.env.COOKIE_NAME || "deployai_token";

export const requireAuth = (req, res, next) => {
  const token = req.cookies[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
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

export const verifyProjectOwnership = async (req, res, next) => {
  try {
    const projectId = req.params.projectId || req.query.projectId || req.body?.projectId;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required in params, query, or body' });
    }

    // Dynamic import to avoid circular dependencies if auth middleware is imported broadly
    const Project = (await import('../models/Project.js')).default;

    const project = await Project.findOne({ _id: projectId, userId: req.user.userId });
    if (!project) {
      // Also check without userId filter to distinguish "project not found" from "wrong owner"
      const anyProject = await Project.findById(projectId).lean();
      if (!anyProject) {
        return res.status(404).json({ error: 'Project not found' });
      }
      console.error('[verifyProjectOwnership] Owner mismatch. JWT userId:', req.user.userId, '| DB userId:', anyProject.userId);
      return res.status(403).json({ error: 'Access denied: You do not own this project' });
    }

    next();
  } catch (error) {
    console.error('[verifyProjectOwnership] Error:', error.name, error.message);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid projectId format', detail: error.message });
    }
    res.status(500).json({ error: 'Failed to verify project ownership', detail: error.message });
  }
};
