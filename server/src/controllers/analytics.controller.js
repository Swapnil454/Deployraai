import crypto from "crypto";
import { UAParser } from "ua-parser-js";
import Project from "../models/Project.js";
import AnalyticsEvent from "../models/AnalyticsEvent.js";
import User from "../models/User.js";
import FixPullRequest from "../models/FixPullRequest.js";
import { GitHubService } from "../services/providers/github.service.js";
import { decryptSecret } from "../utils/encryption.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { trackAiUsage } from "../utils/aiTracker.js";

function getVisitorHash(req) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  const userAgent = req.headers["user-agent"] || "unknown";
  const today = new Date().toISOString().slice(0, 10);
  const raw = `${ip}:${userAgent}:${today}:${process.env.ANALYTICS_HASH_SECRET || 'secret'}`;

  return crypto.createHash("sha256").update(raw).digest("hex");
}

function parseUserAgent(userAgent = "") {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  return {
    browser: result.browser.name || "Unknown",
    os: result.os.name || "Unknown",
    device: result.device.type || "desktop",
  };
}

function sanitizeMetadata(metadata = {}) {
  const blockedKeys = [
    "token",
    "accessToken",
    "refreshToken",
    "password",
    "secret",
    "apiKey",
    "databaseUrl",
    "authorization",
  ];

  const clean = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    const isBlocked = blockedKeys.some((blocked) =>
      lowerKey.includes(blocked.toLowerCase())
    );

    if (!isBlocked) {
      clean[key] = value;
    }
  }

  return clean;
}

export const trackEvent = async (req, res) => {
  try {
    const {
      trackingId,
      eventType = "page_view",
      eventName,
      path,
      fullUrl,
      hostname,
      referrer,
      environment = "unknown",
      metadata = {},
    } = req.body;

    if (!trackingId || !path) {
      return res.status(400).json({
        success: false,
        message: "trackingId and path are required",
      });
    }

    const project = await Project.findOne({
      "analytics.trackingId": trackingId,
      "analytics.enabled": true,
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Analytics not enabled for this project",
      });
    }

    const visitorHash = getVisitorHash(req);
    const parsedUA = parseUserAgent(req.headers["user-agent"]);

    await AnalyticsEvent.create({
      projectId: project._id,
      trackingId,
      eventType,
      eventName: eventType === "custom" ? eventName : null,
      visitorHash,
      path,
      fullUrl,
      hostname,
      referrer,
      environment,
      browser: parsedUA.browser,
      os: parsedUA.os,
      device: parsedUA.device,
      country: req.headers["x-vercel-ip-country"] || req.headers["cf-ipcountry"] || null,
      metadata: sanitizeMetadata(metadata),
    });

    res.status(201).json({
      success: true,
    });
  } catch (error) {
    console.error("Analytics track error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to track event",
    });
  }
};

const FRONTEND_ENTRY_FILES = [
  "app/layout.tsx",
  "app/layout.jsx",
  "src/app/layout.tsx",
  "src/app/layout.jsx",
  "pages/_document.tsx",
  "pages/_document.jsx",
  "src/pages/_document.tsx",
  "src/pages/_document.jsx",
  "index.html",
  "public/index.html",
  "src/index.html",
  "client/app/layout.tsx",
  "client/app/layout.jsx",
  "client/src/app/layout.tsx",
  "client/src/app/layout.jsx",
  "frontend/app/layout.tsx",
  "frontend/app/layout.jsx",
  "web/app/layout.tsx",
  "client/index.html",
  "frontend/index.html",
  "client/pages/_document.tsx",
  "frontend/pages/_document.tsx"
];

async function findFrontendEntryFile(github, owner, repo, branch) {
  try {
    const tree = await github.getRepoTree(owner, repo, branch);
    if (!tree || tree.length === 0) return null;
    
    // Find the first match in the tree
    for (const entryPath of FRONTEND_ENTRY_FILES) {
      if (tree.includes(entryPath)) {
        const file = await github.getFileContent(owner, repo, entryPath, branch);
        if (file) return { path: entryPath, content: file.content, sha: file.sha };
      }
    }
  } catch (err) {
    console.error("Tree search failed, falling back to direct paths:", err.message);
  }

  // Fallback to direct requests if tree is too large
  for (const path of FRONTEND_ENTRY_FILES) {
    try {
      const file = await github.getFileContent(owner, repo, path, branch);
      if (file) return { path, content: file.content, sha: file.sha };
    } catch (e) {
      // ignore
    }
  }
  return null;
}

export const autoInjectAnalytics = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.userId;

    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!project.analytics?.enabled || !project.analytics?.trackingId) {
      return res.status(400).json({ error: "Analytics not enabled for this project." });
    }

    const user = await User.findById(userId);
    if (!user || !user.githubAccessTokenEncrypted) {
      return res.status(400).json({ error: "GitHub not connected" });
    }

    const githubToken = decryptSecret(user.githubAccessTokenEncrypted);
    const github = new GitHubService(githubToken);

    let { repoOwner, repoName, repoFullName } = project;
    if (!repoOwner || !repoName) {
       if (repoFullName) {
         [repoOwner, repoName] = repoFullName.split('/');
       } else {
         return res.status(400).json({ error: "Repository information missing in project source." });
       }
    }

    const defaultBranch = await github.getDefaultBranch(repoOwner, repoName);
    const defaultSha = await github.getBranchSha(repoOwner, repoName, defaultBranch);

    const timestamp = Date.now();
    const newBranchName = `deployai/analytics-inject-${timestamp}`;
    await github.createBranch(repoOwner, repoName, newBranchName, defaultSha);

    const entryFile = await findFrontendEntryFile(github, repoOwner, repoName, newBranchName);

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "AI Provider not configured. Please add GEMINI_API_KEY." });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const generateWithRetry = async (promptText) => {
      const fallbackModels = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
      for (const modelName of fallbackModels) {
        const currentModel = genAI.getGenerativeModel({ model: modelName });
        for (let i = 0; i < 3; i++) {
          try {
            return await currentModel.generateContent(promptText);
          } catch (err) {
            if (err.status === 503 || err.status === 429) {
              await new Promise(res => setTimeout(res, (i + 1) * 3000));
            } else {
              throw err;
            }
          }
        }
      }
      throw new Error("All Gemini models exhausted or failed with 503/429");
    };

    const treeEntries = [];
    const modifiedFiles = [];

    // --- 1. FRONTEND INJECTION ---
    if (entryFile) {
      const apiUrl = process.env.API_URL || 'https://api.deployai.in';
      const scriptTag = `<script defer src="${apiUrl}/analytics.js" data-tracking-id="${project.analytics.trackingId}"></script>`;

      const frontendPrompt = `You are an expert web developer AI.
We need to inject a web analytics tracking script into the <head> of this frontend layout file.

File Path: ${entryFile.path}

Original File Content:
\`\`\`
${entryFile.content}
\`\`\`

Script to inject:
\`\`\`html
${scriptTag}
\`\`\`

Task:
Inject the script tag exactly as provided into the <head> section of the document.
If it is a React/Next.js file, inject it appropriately inside the <head> or <Head> tags without breaking React syntax. 
CRITICAL: Return ONLY the raw new file content. Do NOT wrap it in markdown formatting blocks like \`\`\`javascript or \`\`\`html. Return the EXACT text to be saved to the file.`;

      const result = await generateWithRetry(frontendPrompt);
      await trackAiUsage(userId, projectId, 'analytics_insight');

      let newContent = result.response.text().trim();
      if (newContent.startsWith("\`\`\`")) {
         const lines = newContent.split("\\n");
         lines.shift();
         if (lines.length > 0 && lines[lines.length - 1].startsWith("\`\`\`")) lines.pop();
         newContent = lines.join("\\n");
      }

      if (newContent !== entryFile.content) {
         const blobRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/blobs`, {
            content: newContent,
            encoding: "utf-8"
         });
         treeEntries.push({ path: entryFile.path, mode: "100644", type: "blob", sha: blobRes.data.sha });
         modifiedFiles.push(entryFile.path);
      }
    }

    // --- 2. BACKEND INJECTION ---
    let backendPkgPath = "package.json";
    const backendRoot = project.analysis?.backend?.path;
    if (backendRoot && backendRoot !== "." && backendRoot !== "") {
       backendPkgPath = `${backendRoot}/package.json`;
    }
    
    const pkgFile = await github.getFileContent(repoOwner, repoName, backendPkgPath, newBranchName).catch(() => null);

    if (pkgFile) {
      const backendPrompt = `You are an expert backend web developer AI.
We need to inject backend observability SDK into a Node.js/Next.js project.

Here is the current package.json:
\`\`\`json
${pkgFile.content}
\`\`\`

Task:
1. Add "@swapnil454/tracepilot": "^0.1.2" to the dependencies in package.json.
2. Create the content for a new file "src/instrumentation.ts" to initialize the SDK.
   (The standard content is:
    import { registerOTel } from '@swapnil454/tracepilot/next';
    export function register() { registerOTel(); }
   )

Return a JSON array containing two objects:
[
  { "path": "package.json", "content": "<the fully updated package.json content>" },
  { "path": "src/instrumentation.ts", "content": "<the exact content of instrumentation.ts>" }
]

CRITICAL: Return ONLY the valid JSON array string. Do NOT wrap in \`\`\`json blocks. Return the exact parseable JSON array.`;

      const result = await generateWithRetry(backendPrompt);
      await trackAiUsage(userId, projectId, 'analytics_insight');
      
      let newContent = result.response.text().trim();
      if (newContent.startsWith("\`\`\`")) {
         const lines = newContent.split("\\n");
         lines.shift();
         if (lines.length > 0 && lines[lines.length - 1].startsWith("\`\`\`")) lines.pop();
         newContent = lines.join("\\n").trim();
      }

      let parsedFiles = [];
      try {
        parsedFiles = JSON.parse(newContent);
        
        for (const file of parsedFiles) {
           let filePath = file.path;
           // Adjust path if we are in a monorepo backend folder
           if (backendRoot && backendRoot !== "." && backendRoot !== "") {
              // If Gemini didn't prefix the path with the backend folder, add it
              if (!filePath.startsWith(backendRoot)) {
                 filePath = `${backendRoot}/${filePath}`;
              }
           }
           const blobRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/blobs`, {
              content: file.content,
              encoding: "utf-8"
           });
           treeEntries.push({ path: filePath, mode: "100644", type: "blob", sha: blobRes.data.sha });
           modifiedFiles.push(filePath);
        }
      } catch (err) {
         console.error("[AutoInject] Failed to parse backend Gemini JSON:", newContent);
         // Non-fatal, we just skip backend injection if it failed to parse, or we error out if nothing else succeeded
      }
    }

    // --- 3. COMMIT AND PR ---
    if (treeEntries.length === 0) {
       return res.status(400).json({ error: "Could not find frontend layout or backend package.json to inject observability, or AI failed to modify them." });
    }

    const baseTreeSha = await github.getBranchSha(repoOwner, repoName, newBranchName);
    const treeRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/trees`, {
       base_tree: baseTreeSha,
       tree: treeEntries
    });
    const newTreeSha = treeRes.data.sha;

    const commitRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/commits`, {
       message: "feat: inject DeployAI Observability SDKs",
       tree: newTreeSha,
       parents: [baseTreeSha]
    });
    const newCommitSha = commitRes.data.sha;

    await github.api.patch(`/repos/${repoOwner}/${repoName}/git/refs/heads/${newBranchName}`, {
       sha: newCommitSha
    });

    const prTitle = "feat: inject DeployAI Observability SDKs";
    const prBody = `DeployAI automatically injected Web Analytics and/or Backend Tracing into your project via AI Agent.\n\nFiles modified:\n${modifiedFiles.map(f => `- \`${f}\``).join('\\n')}\n\n*Safety note: Please review the AI generated code carefully before merging.*`;
    
    const pr = await github.createPullRequest(repoOwner, repoName, prTitle, prBody, newBranchName, defaultBranch);

    return res.json({ prUrl: pr.html_url, prNumber: pr.number, branch: newBranchName, file: modifiedFiles.join(", ") });
  } catch (error) {
    console.error("Auto Inject Analytics Error:", error);
    return res.status(500).json({ error: error.message || "Failed to auto-inject analytics" });
  }
};

export const verifyAnalytics = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.userId;

    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Check if any events have been received for this project
    const eventCount = await AnalyticsEvent.countDocuments({ projectId: project._id });

    if (eventCount > 0) {
      if (!project.analytics) project.analytics = {};
      project.analytics.enabled = true;
      project.analytics.verified = true;
      await project.save();

      return res.json({ verified: true, success: true });
    } else {
      return res.json({ verified: false, success: true, message: "No data detected yet. Please ensure you have deployed the changes and visited the site." });
    }
  } catch (error) {
    console.error("Verify Analytics Error:", error);
    return res.status(500).json({ error: "Failed to verify analytics" });
  }
};
