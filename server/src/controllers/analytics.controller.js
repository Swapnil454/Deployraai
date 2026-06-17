import crypto from "crypto";
import { UAParser } from "ua-parser-js";
import Project from "../models/Project.js";
import AnalyticsEvent from "../models/AnalyticsEvent.js";
import User from "../models/User.js";
import FixPullRequest from "../models/FixPullRequest.js";
import { GitHubService } from "../services/providers/github.service.js";
import { decryptSecret } from "../utils/encryption.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
  "src/index.html"
];

async function findFrontendEntryFile(github, owner, repo, branch) {
  for (const path of FRONTEND_ENTRY_FILES) {
    const file = await github.getFileContent(owner, repo, path, branch);
    if (file) return { path, content: file.content, sha: file.sha };
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
    if (!entryFile) {
      return res.status(400).json({ error: "Could not find a recognized frontend layout or index HTML file to inject." });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "AI Provider not configured. Please add GEMINI_API_KEY." });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    
    const apiUrl = process.env.API_URL || 'https://api.deployai.in';
    const scriptTag = `<script defer src="${apiUrl}/analytics.js" data-tracking-id="${project.analytics.trackingId}"></script>`;

    const prompt = `You are an expert web developer AI.
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
If it is a React/Next.js file, inject it appropriately inside the <head> or <Head> tags without breaking React syntax (e.g., watch out for HTML entities or unescaped characters, though standard script tags usually work fine). 
If you see \`next/script\`, you can use it, but raw \`<script defer src="..." data-tracking-id="..."></script>\` inside \`<head>\` is perfectly acceptable for normal HTML or standard layouts.
CRITICAL: Return ONLY the raw new file content. Do NOT wrap it in markdown formatting blocks like \`\`\`javascript or \`\`\`html. Return the EXACT text to be saved to the file.`;

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

    const result = await generateWithRetry(prompt);
    let newContent = result.response.text().trim();
    
    if (newContent.startsWith("\`\`\`")) {
       const lines = newContent.split("\\n");
       lines.shift();
       if (lines.length > 0 && lines[lines.length - 1].startsWith("\`\`\`")) lines.pop();
       newContent = lines.join("\\n");
    }

    if (newContent === entryFile.content) {
       return res.status(400).json({ error: "AI failed to modify the file content." });
    }

    await github.createOrUpdateFile(
      repoOwner, repoName, entryFile.path,
      `feat: inject DeployAI Web Analytics into ${entryFile.path}`, newContent, entryFile.sha, newBranchName
    );

    const prTitle = "feat: inject DeployAI Web Analytics";
    const prBody = `DeployAI automatically injected web analytics tracking for your project.\n\nFile modified: \`${entryFile.path}\`\n\n*Safety note: Please review the AI generated code carefully before merging.*`;

    const pr = await github.createPullRequest(repoOwner, repoName, prTitle, prBody, newBranchName, defaultBranch);

    return res.json({ prUrl: pr.html_url, prNumber: pr.number, branch: newBranchName, file: entryFile.path });
  } catch (error) {
    console.error("Auto Inject Analytics Error:", error);
    return res.status(500).json({ error: error.message || "Failed to auto-inject analytics" });
  }
};
