const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/controllers/deployment.controller.js');
let code = fs.readFileSync(file, 'utf8');

// 1. Add imports
if (!code.includes('GoogleGenerativeAI')) {
  code = code.replace(
    'import { checkBackendHealth, checkFrontendHealth, checkCors } from "../services/healthCheck.service.js";',
    'import { checkBackendHealth, checkFrontendHealth, checkCors } from "../services/healthCheck.service.js";\nimport { sanitizeDeploymentLogs } from "../utils/sanitizeLogs.js";\nimport { GoogleGenerativeAI } from "@google/generative-ai";'
  );
}

// 2. Add retryOfDeploymentId to Deployment.create calls
code = code.replace(/Deployment\.create\(\{([\s\S]*?)type: 'frontend'/g, 'Deployment.create({$1retryOfDeploymentId: req.body?.retryOfDeploymentId || undefined,\n      type: \'frontend\'');
code = code.replace(/Deployment\.create\(\{([\s\S]*?)type: 'backend'/g, 'Deployment.create({$1retryOfDeploymentId: req.body?.retryOfDeploymentId || undefined,\n      type: \'backend\'');
code = code.replace(/Deployment\.create\(\{([\s\S]*?)type: 'full'/g, 'Deployment.create({$1retryOfDeploymentId: req.body?.retryOfDeploymentId || undefined,\n      type: \'full\'');

// 3. Add explainDeploymentError and retryDeployment
if (!code.includes('explainDeploymentError')) {
  code += `
export const explainDeploymentError = async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const deployment = await Deployment.findById(deploymentId);
    
    if (!deployment) return res.status(404).json({ error: "Deployment not found" });
    if (deployment.userId.toString() !== req.user.userId.toString()) return res.status(403).json({ error: "Access denied" });
    if (deployment.status !== 'failed' && deployment.status !== 'warning') {
      return res.status(400).json({ error: "Explanation is only available for failed or warning deployments" });
    }

    if (deployment.aiAnalysis && deployment.aiAnalysis.summary) {
       return res.json({ success: true, aiAnalysis: deployment.aiAnalysis });
    }

    if (!process.env.GEMINI_API_KEY) {
       return res.status(500).json({ error: "AI Provider not configured. Please add GEMINI_API_KEY." });
    }

    const sanitizedLogs = sanitizeDeploymentLogs(deployment.logs || []);
    const logString = sanitizedLogs.map(l => \`[\${l.level}] \${l.step}: \${l.message}\`).join('\\n');

    const prompt = \`You are an AI deployment assistant. Analyze the failed deployment and return ONLY valid JSON.
Do not wrap it in markdown code blocks. Just return the raw JSON object.

Deployment Type: \${deployment.type}
Status: \${deployment.status}
Failed Step: \${deployment.finalSummary?.failedStep || 'Unknown'}
Frontend URL: \${deployment.finalSummary?.frontendUrl ? 'available' : 'missing'}
Backend URL: \${deployment.finalSummary?.backendUrl ? 'available' : 'missing'}

Health Checks:
Backend: \${deployment.healthCheck?.backend?.status || 'N/A'}
Frontend: \${deployment.healthCheck?.frontend?.status || 'N/A'}
CORS: \${deployment.healthCheck?.cors?.status || 'N/A'}
Database: \${deployment.healthCheck?.database?.status || 'N/A'}

Logs:
\${logString}

Task:
Explain the failure in simple language and suggest practical fixes for a developer.
Response MUST match this exact JSON schema:
{
  "summary": "String",
  "likelyCause": "String",
  "failedStep": "String",
  "suggestedFixes": ["String", "String"],
  "severity": "low" | "medium" | "high",
  "canAutoFix": Boolean
}\`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(prompt);
    let jsonText = result.response.text().trim();
    
    if (jsonText.startsWith('\`\`\`json')) {
       jsonText = jsonText.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim();
    } else if (jsonText.startsWith('\`\`\`')) {
       jsonText = jsonText.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '').trim();
    }

    let aiAnalysis;
    try {
      aiAnalysis = JSON.parse(jsonText);
      aiAnalysis.generatedAt = new Date();
    } catch (e) {
      console.error("AI JSON parse error:", e, "Text:", jsonText);
      aiAnalysis = {
         summary: "Deployment failed, but AI explanation could not be parsed.",
         likelyCause: "Unknown configuration or runtime error.",
         failedStep: deployment.finalSummary?.failedStep || "unknown",
         suggestedFixes: ["Check the logs manually.", "Verify environment variables."],
         severity: "medium",
         canAutoFix: false,
         generatedAt: new Date()
      };
    }

    deployment.aiAnalysis = aiAnalysis;
    await deployment.save();

    res.json({ success: true, aiAnalysis });
  } catch (error) {
    console.error("Explain error:", error);
    res.status(500).json({ error: "Failed to generate AI explanation" });
  }
};

export const retryDeployment = async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const oldDeployment = await Deployment.findById(deploymentId);
    
    if (!oldDeployment) return res.status(404).json({ error: "Deployment not found" });
    if (oldDeployment.userId.toString() !== req.user.userId.toString()) return res.status(403).json({ error: "Access denied" });

    req.params.projectId = oldDeployment.projectId.toString();
    req.body = { retryOfDeploymentId: oldDeployment._id.toString() };

    if (oldDeployment.type === 'frontend') {
       return triggerFrontendDeployment(req, res);
    } else if (oldDeployment.type === 'backend') {
       return triggerBackendDeployment(req, res);
    } else {
       return triggerFullDeployment(req, res);
    }
  } catch (error) {
    console.error("Retry deployment error:", error);
    res.status(500).json({ error: "Failed to retry deployment" });
  }
};
`;
}

fs.writeFileSync(file, code);
