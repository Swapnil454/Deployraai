const fs = require('fs');

const path = 'server/src/controllers/analytics.controller.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Add axios to imports
if (!content.includes('import axios')) {
  content = content.replace('import crypto from "crypto";', 'import crypto from "crypto";\nimport axios from "axios";');
}

// 2. Add verifyObservability
const verifyObservabilityCode = `
export const verifyObservability = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ _id: projectId, userId: req.user.userId });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const ANALYTICS_API_URL = process.env.ANALYTICS_API_URL || 'http://localhost:4318';
    
    // Check for traces in the last 24 hours
    try {
      // Re-package the verified cookie JWT as a Bearer header for the internal service call.
      const cookieName = process.env.COOKIE_NAME || 'deployai_token';
      const cookieToken = req.cookies?.[cookieName];
      const authHeader = cookieToken ? \`Bearer \${cookieToken}\` : (req.headers.authorization || '');
      
      const response = await axios.get(\`\${ANALYTICS_API_URL}/api/observability/traces\`, {
        params: { projectId: project.slug || projectId }, // Try slug first, fallback to id
        headers: { Authorization: authHeader },
        timeout: 10000
      });

      // Simple heuristic: if we got traces back, it's verified
      const traces = response.data?.traces || response.data || [];
      if (Array.isArray(traces) && traces.length > 0) {
        if (!project.analytics) project.analytics = {};
        project.analytics.verified = true; // Use same verified flag or create new
        await project.save();
        return res.json({ verified: true, success: true });
      }
    } catch (err) {
      console.error("Failed to query traces:", err.message);
      // Fall through to false
    }

    return res.json({ verified: false, success: true, message: "No backend traces detected yet. Please ensure you have deployed the backend and sent a request." });
  } catch (error) {
    return res.status(500).json({ error: "Failed to verify observability" });
  }
};
`;

if (!content.includes('export const verifyObservability')) {
  content = content + '\n' + verifyObservabilityCode;
  fs.writeFileSync(path, content);
  console.log("Added verifyObservability");
} else {
  console.log("verifyObservability already exists");
}
