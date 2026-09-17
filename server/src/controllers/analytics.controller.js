import crypto from "crypto";
import axios from "axios";
import { UAParser } from "ua-parser-js";
import Project from "../models/Project.js";
import AnalyticsEvent from "../models/AnalyticsEvent.js";
import User from "../models/User.js";
import { GitHubService } from "../services/providers/github.service.js";
import { decryptSecret } from "../utils/encryption.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { trackAiUsage } from "../utils/aiTracker.js";
import { generateProjectToken } from "./project.controller.js";

// Helper: Extract JSON block robustly
function extractJsonBlock(text) {
  const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (match) {
    return match[0];
  }
  // Try object match
  const objMatch = text.match(/\{\s*"[\s\S]*\}\s*/);
  if (objMatch) return objMatch[0];
  return text;
}

// Helper: Find Frontend Entry File robustly
async function findFrontendEntryFile(github, owner, repo, branch) {
  try {
    const tree = await github.getRepoTree(owner, repo, branch);
    if (!tree || tree.length === 0) return null;
    
    const matchingPaths = tree.filter(path => 
      path.endsWith('layout.tsx') || 
      path.endsWith('layout.jsx') || 
      path.endsWith('_document.tsx') || 
      path.endsWith('_document.jsx') || 
      path.endsWith('index.html')
    );

    // Filter out dist/build
    const cleanPaths = matchingPaths.filter(p => !p.includes('dist/') && !p.includes('build/') && !p.includes('.next/'));
    
    // Sort by depth so we prefer root files
    cleanPaths.sort((a, b) => a.split('/').length - b.split('/').length);

    if (cleanPaths.length > 0) {
      const bestMatch = cleanPaths[0];
      const file = await github.getFileContent(owner, repo, bestMatch, branch);
      let framework = bestMatch.includes('layout') ? 'next-app' : bestMatch.includes('_document') ? 'next-pages' : 'react/vite';
      if (file) return { path: bestMatch, content: file.content, sha: file.sha, framework };
    }
  } catch (err) {
    console.error("Tree search failed:", err.message);
  }
  return null;
}

export const analyzeProjectForAnalytics = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ _id: projectId, userId: req.user.userId });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const user = await User.findById(req.user.userId);
    if (!user || !user.githubAccessTokenEncrypted) return res.status(400).json({ error: "GitHub not connected" });

    const githubToken = decryptSecret(user.githubAccessTokenEncrypted);
    const github = new GitHubService(githubToken);

    let { repoOwner, repoName, repoFullName } = project;
    if (!repoOwner) [repoOwner, repoName] = repoFullName.split('/');

    const defaultBranch = await github.getDefaultBranch(repoOwner, repoName);
    const entryFile = await findFrontendEntryFile(github, repoOwner, repoName, defaultBranch);

    if (!entryFile) {
      return res.status(200).json({
        type: 'analytics',
        message: 'Could not automatically detect a frontend layout file. You may need to install the script manually.',
        framework: 'unknown',
        action: 'Manual installation required',
        error: true
      });
    }

    return res.status(200).json({
      type: 'analytics',
      message: `Detected frontend entry point at ${entryFile.path}. We will inject a lightweight script tag into your layout file.`,
      framework: entryFile.framework,
      action: `Inject <script> into ${entryFile.path}`,
      error: false
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to analyze project' });
  }
};

export const analyzeProjectForObservability = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ _id: projectId, userId: req.user.userId });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const user = await User.findById(req.user.userId);
    if (!user || !user.githubAccessTokenEncrypted) return res.status(400).json({ error: "GitHub not connected" });

    const githubToken = decryptSecret(user.githubAccessTokenEncrypted);
    const github = new GitHubService(githubToken);

    let { repoOwner, repoName, repoFullName } = project;
    if (!repoOwner) [repoOwner, repoName] = repoFullName.split('/');

    const defaultBranch = await github.getDefaultBranch(repoOwner, repoName);
    
    let backendPkgPath = "package.json";
    const backendRoot = project.analysis?.backend?.path;
    if (backendRoot && backendRoot !== "." && backendRoot !== "") {
       backendPkgPath = `${backendRoot}/package.json`;
    }

    const pkgFile = await github.getFileContent(repoOwner, repoName, backendPkgPath, defaultBranch).catch(() => null);
    
    if (!pkgFile) {
       return res.status(200).json({
         type: 'observability',
         message: 'Could not find a package.json file. Manual installation may be required.',
         framework: 'unknown',
         action: 'Manual installation required',
         error: true
       });
    }

    const pkg = JSON.parse(pkgFile.content);
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    let framework = 'node';
    let action = 'Prepend Tracepilot SDK to entry file';

    if (deps.next) {
      framework = 'next';
      action = 'Create instrumentation.ts & enable next.config.js hook';
    } else if (deps.express) {
      framework = 'express';
    }

    return res.status(200).json({
      type: 'observability',
      message: `Detected ${framework} environment. We will securely update your package.json and inject initialization code.`,
      framework,
      action,
      error: false
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to analyze project' });
  }
};

export const autoInjectAnalytics = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.userId;

    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) return res.status(404).json({ error: "Project not found" });
    
    if (!project.analytics?.enabled || !project.analytics?.trackingId) {
      if (!project.analytics) project.analytics = {};
      project.analytics.enabled = true;
      if (!project.analytics.trackingId) {
        project.analytics.trackingId = generateProjectToken(project._id.toString());
      }
      project.analytics.enabledAt = new Date();
      await project.save();
    }

    const user = await User.findById(userId);
    if (!user || !user.githubAccessTokenEncrypted) return res.status(400).json({ error: "GitHub not connected" });

    const githubToken = decryptSecret(user.githubAccessTokenEncrypted);
    const github = new GitHubService(githubToken);

    let { repoOwner, repoName, repoFullName } = project;
    if (!repoOwner) [repoOwner, repoName] = repoFullName.split('/');

    const defaultBranch = await github.getDefaultBranch(repoOwner, repoName);
    const defaultSha = await github.getBranchSha(repoOwner, repoName, defaultBranch);

    const timestamp = Date.now();
    const newBranchName = `deployai/analytics-inject-${timestamp}`;
    await github.createBranch(repoOwner, repoName, newBranchName, defaultSha);

    const entryFile = await findFrontendEntryFile(github, repoOwner, repoName, newBranchName);
    if (!entryFile) return res.status(400).json({ error: "Could not find frontend entry file to inject." });

    if (!process.env.GEMINI_API_KEY) return res.status(400).json({ error: "AI Provider not configured. Please add GEMINI_API_KEY." });
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const apiUrl = process.env.API_URL || 'https://api.deployai.in';
    const scriptTag = `<script defer src="${apiUrl}/analytics.js" data-tracking-id="${project.analytics.trackingId}"></script>`;

    const frontendPrompt = `You are an expert web developer AI.
We need to inject a web analytics tracking script into the <head> of this frontend layout file.

File Path: ${entryFile.path}

--- START UNTRUSTED CODE ---
Original File Content:
\`\`\`
${entryFile.content}
\`\`\`
--- END UNTRUSTED CODE ---

Script to inject:
\`\`\`html
${scriptTag}
\`\`\`

Task:
Inject the script tag exactly as provided into the <head> section of the document.
CRITICAL: Return ONLY the raw new file content. Do NOT wrap it in markdown formatting blocks like \`\`\`javascript.`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(frontendPrompt);
    await trackAiUsage(userId, projectId, 'analytics_insight');

    let newContent = result.response.text().trim();
    const blockMatch = newContent.match(/```[a-z]*\n([\s\S]*?)```/);
    if (blockMatch) {
       newContent = blockMatch[1].trim();
    } else {
       newContent = newContent.replace(/^```[a-z]*\n/, "").replace(/```$/, "").trim();
    }

    if (newContent === entryFile.content) return res.status(400).json({ error: "AI failed to modify the file." });

    const blobRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/blobs`, { content: newContent, encoding: "utf-8" });
    
    const treeRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/trees`, {
       base_tree: defaultSha,
       tree: [{ path: entryFile.path, mode: "100644", type: "blob", sha: blobRes.data.sha }]
    });

    const commitRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/commits`, {
       message: "feat: inject DeployAI Analytics Script",
       tree: treeRes.data.sha,
       parents: [defaultSha]
    });

    await github.api.patch(`/repos/${repoOwner}/${repoName}/git/refs/heads/${newBranchName}`, { sha: commitRes.data.sha });

    const prBody = `DeployAI automatically injected Web Analytics into your project.\n\nFiles modified:\n- \`${entryFile.path}\`\n\n*Safety note: Please review the AI generated code carefully before merging.*`;
    const pr = await github.createPullRequest(repoOwner, repoName, "feat: inject DeployAI Analytics Script", prBody, newBranchName, defaultBranch);

    return res.json({ prUrl: pr.html_url, prNumber: pr.number, branch: newBranchName, file: entryFile.path });
  } catch (error) {
    if (error.response?.status === 401) return res.status(401).json({ error: "GitHub integration expired." });
    if (error.response?.status === 404) return res.status(404).json({ error: "Repository not found." });
    if (error.message?.includes("503") || error.message?.includes("Service Unavailable")) {
       return res.status(503).json({ error: "Google AI Service is currently experiencing high demand. Please try again in a few moments." });
    }
    return res.status(500).json({ error: error.message || "Failed to auto-inject analytics" });
  }
};

export const autoInjectObservability = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.userId;

    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const user = await User.findById(userId);
    if (!user || !user.githubAccessTokenEncrypted) return res.status(400).json({ error: "GitHub not connected" });

    const githubToken = decryptSecret(user.githubAccessTokenEncrypted);
    const github = new GitHubService(githubToken);

    let { repoOwner, repoName, repoFullName } = project;
    if (!repoOwner) [repoOwner, repoName] = repoFullName.split('/');

    const defaultBranch = await github.getDefaultBranch(repoOwner, repoName);
    const defaultSha = await github.getBranchSha(repoOwner, repoName, defaultBranch);

    const timestamp = Date.now();
    const newBranchName = `deployai/observability-inject-${timestamp}`;
    await github.createBranch(repoOwner, repoName, newBranchName, defaultSha);

    const backendRoot = project.analysis?.backend?.path || ".";
    const getPath = (p) => backendRoot !== "." ? `${backendRoot}/${p}` : p;
    
    // 1. Language Detection (Fix: Check Backend specific files first to avoid Monorepo collision)
    const [pkgFile, reqFile, pyprojectFile, goModFile] = await Promise.all([
      github.getFileContent(repoOwner, repoName, getPath("package.json"), newBranchName).catch(() => null),
      github.getFileContent(repoOwner, repoName, getPath("requirements.txt"), newBranchName).catch(() => null),
      github.getFileContent(repoOwner, repoName, getPath("pyproject.toml"), newBranchName).catch(() => null),
      github.getFileContent(repoOwner, repoName, getPath("go.mod"), newBranchName).catch(() => null)
    ]);

    let language = "unknown";
    let pkgJson = null;

    // Fix: Prioritize explicit backend markers (reqFile, goModFile) over generic package.json in case of Monorepo
    if (reqFile || pyprojectFile) {
      language = "python";
    } else if (goModFile) {
      language = "go";
    } else if (pkgFile) {
      language = "node";
      try { pkgJson = JSON.parse(pkgFile.content); } catch (e) {}
      if (pkgJson) {
         const hasReact = !!(pkgJson.dependencies?.react || pkgJson.devDependencies?.react);
         const hasNext = !!(pkgJson.dependencies?.next || pkgJson.devDependencies?.next);
         const hasExpress = !!(pkgJson.dependencies?.express || pkgJson.devDependencies?.express);
         
         if (hasReact && !hasNext && !hasExpress) {
           language = "react"; // Pure SPA
         } else if (hasNext) {
           language = "next";
         } else {
           language = "express"; // Fallback to express/node
         }
      }
    }

    if (language === "unknown") {
      return res.status(400).json({ error: "Could not detect language. Supported files not found (package.json, requirements.txt, pyproject.toml, go.mod)." });
    }

    if (!process.env.GEMINI_API_KEY) return res.status(400).json({ error: "AI Provider not configured. Please add GEMINI_API_KEY." });
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const extractCodeBlock = (text) => {
      const blockMatch = text.match(/```[a-z]*\n([\s\S]*?)```/);
      return blockMatch ? blockMatch[1].trim() : text.replace(/^```.*\n/, "").replace(/```$/, "").trim();
    };

    const treeEntries = [];
    const modifiedFiles = [];

    // --- NODE.JS DEPENDENCY INJECTION ---
    if (["next", "express", "react"].includes(language) && pkgJson && pkgFile) {
      if (!pkgJson.dependencies) pkgJson.dependencies = {};
      pkgJson.dependencies["@swapnil454/tracepilot"] = "^0.2.2";
      const newPkgContent = JSON.stringify(pkgJson, null, 2);
      const pkgBlobRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/blobs`, { content: newPkgContent, encoding: "utf-8" });
      treeEntries.push({ path: getPath("package.json"), mode: "100644", type: "blob", sha: pkgBlobRes.data.sha });
      modifiedFiles.push(getPath("package.json"));
    }

    // --- PYTHON DEPENDENCY INJECTION ---
    if (language === "python") {
      const pyDeps = "opentelemetry-api\nopentelemetry-sdk\nopentelemetry-instrumentation\nopentelemetry-exporter-otlp\nopentelemetry-instrumentation-fastapi\nopentelemetry-instrumentation-flask\n";
      if (reqFile) {
         let newReqContent = reqFile.content.trim() + "\n" + pyDeps;
         const reqBlobRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/blobs`, { content: newReqContent, encoding: "utf-8" });
         treeEntries.push({ path: getPath("requirements.txt"), mode: "100644", type: "blob", sha: reqBlobRes.data.sha });
         modifiedFiles.push(getPath("requirements.txt"));
      } else if (pyprojectFile) {
         const prompt = `Inject the following dependencies into this pyproject.toml file safely: opentelemetry-api, opentelemetry-sdk, opentelemetry-instrumentation, opentelemetry-exporter-otlp, opentelemetry-instrumentation-fastapi, opentelemetry-instrumentation-flask.\n\nOriginal:\n\`\`\`\n${pyprojectFile.content}\n\`\`\`\nReturn ONLY the modified raw toml file.`;
         const result = await model.generateContent(prompt);
         let newContent = extractCodeBlock(result.response.text());
         const pyBlobRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/blobs`, { content: newContent, encoding: "utf-8" });
         treeEntries.push({ path: getPath("pyproject.toml"), mode: "100644", type: "blob", sha: pyBlobRes.data.sha });
         modifiedFiles.push(getPath("pyproject.toml"));
      }
    }

    // --- NEXT.JS LOGIC ---
    if (language === "next") {
      const srcExists = await github.getFileContent(repoOwner, repoName, getPath("src"), newBranchName).catch(() => null);
      const isSrc = !!srcExists;
      
      const instrumentationContent = `import { initTracer, setupGlobalErrorCapture } from '@swapnil454/tracepilot';\n\nexport function register() {\n  initTracer();\n  setupGlobalErrorCapture();\n}\n`;
      const instrumentationPath = getPath(isSrc ? "src/instrumentation.ts" : "instrumentation.ts");

      const instBlobRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/blobs`, { content: instrumentationContent, encoding: "utf-8" });
      treeEntries.push({ path: instrumentationPath, mode: "100644", type: "blob", sha: instBlobRes.data.sha });
      modifiedFiles.push(instrumentationPath);

      const configExts = ['next.config.js', 'next.config.mjs', 'next.config.ts'];
      let nextConfigFile = null;
      let nextConfigPath = null;
      for (const ext of configExts) {
        const path = getPath(ext);
        const file = await github.getFileContent(repoOwner, repoName, path, newBranchName).catch(() => null);
        if (file) {
          nextConfigFile = file;
          nextConfigPath = path;
          break;
        }
      }

      if (nextConfigFile) {
        const nextConfigPrompt = `You are an expert Next.js developer AI.\nWe need to enable the \`instrumentationHook\` in this \`next.config.js\` file.\n\nOriginal File Content:\n\`\`\`\n${nextConfigFile.content}\n\`\`\`\n\nTask:\nInject \`experimental: { instrumentationHook: true }\` into the config object safely. \nIf \`experimental\` already exists, add \`instrumentationHook: true\` to it.\nCRITICAL: Return ONLY the raw modified file content. Do NOT wrap in \`\`\`javascript blocks. Do NOT remove existing configuration.`;
        const result = await model.generateContent(nextConfigPrompt);
        let newConfigContent = extractCodeBlock(result.response.text());
        if (newConfigContent !== nextConfigFile.content) {
          const cfgBlobRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/blobs`, { content: newConfigContent, encoding: "utf-8" });
          treeEntries.push({ path: nextConfigPath, mode: "100644", type: "blob", sha: cfgBlobRes.data.sha });
          modifiedFiles.push(nextConfigPath);
        }
      }
    } 
    // --- EXPRESS / REACT / PYTHON / GO ENTRY FILE INJECTION ---
    else {
      let entryFiles = [];
      if (language === "express") entryFiles = [pkgJson?.main, 'src/main.ts', 'src/index.ts', 'index.js', 'src/index.js', 'server.js', 'src/server.js', 'app.js', 'src/app.js'];
      if (language === "react") entryFiles = ['src/main.tsx', 'src/index.tsx', 'src/main.jsx', 'src/index.jsx', 'src/index.js'];
      if (language === "python") entryFiles = ['main.py', 'app.py', 'server.py', 'src/main.py', 'src/app.py'];
      if (language === "go") entryFiles = ['main.go', 'cmd/main.go', 'server.go'];

      entryFiles = entryFiles.filter(Boolean);

      let entryFile = null;
      let entryPath = null;

      for (const p of entryFiles) {
        const path = getPath(p);
        const file = await github.getFileContent(repoOwner, repoName, path, newBranchName).catch(() => null);
        if (file) {
          entryFile = file;
          entryPath = path;
          break;
        }
      }

      if (entryFile) {
        let aiPrompt = "";

        if (language === "express") {
          aiPrompt = `You are an expert Node.js developer AI.\nWe need to initialize the tracepilot SDK at the very top of this entry file.\n\nFile Path: ${entryPath}\n\nOriginal File Content:\n\`\`\`\n${entryFile.content}\n\`\`\`\n\nTask:\nPrepend the following code at the absolute top of the file (before any other imports or requires):\n\`\`\`javascript\nprocess.env.OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '${process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "https://api.deployai.in"}/api/observability/traces';\nprocess.env.OTEL_SERVICE_NAME = '${project.repoName}';\nconst { initExpressObservability } = require('@swapnil454/tracepilot/express');\ninitExpressObservability();\n\`\`\`\nNote: If the file uses ES6 modules (import), use \`import { initExpressObservability } from '@swapnil454/tracepilot/express';\` instead of require, but KEEP the process.env assignments BEFORE any other code.\nCRITICAL: Return ONLY the raw modified file content. Do NOT wrap in \`\`\`javascript blocks.`;
        } 
        else if (language === "react") {
          aiPrompt = `You are an expert React developer AI.\nWe need to wrap the root application component with TracePilotProvider.\n\nFile Path: ${entryPath}\n\nOriginal:\n\`\`\`\n${entryFile.content}\n\`\`\`\n\nTask:\n1. Import TracePilotProvider: \`import { TracePilotProvider } from '@swapnil454/tracepilot/react';\`\n2. Wrap the <App /> (or equivalent root component) with <TracePilotProvider token="${project.repoName}" serviceName="${project.repoName}" ingestorUrl="${process.env.NEXT_PUBLIC_API_URL || 'https://api.deployai.in'}/api/observability/traces"> ... </TracePilotProvider>\nCRITICAL: Return ONLY the raw modified file content. Do NOT wrap in \`\`\`tsx blocks.`;
        }
        else if (language === "python") {
          aiPrompt = `You are an expert Python developer AI.\nWe need to initialize OpenTelemetry and instrument the framework.\n\nOriginal:\n\`\`\`\n${entryFile.content}\n\`\`\`\n\nTask:\n1. Prepend the standard OpenTelemetry setup:\n\`\`\`python\nimport os\nfrom opentelemetry import trace\nfrom opentelemetry.sdk.trace import TracerProvider\nfrom opentelemetry.sdk.trace.export import BatchSpanProcessor\nfrom opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter\n\nos.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = "https://api.deployai.in/api/observability/traces"\nos.environ["OTEL_SERVICE_NAME"] = "${project.repoName}"\n\ntrace.set_tracer_provider(TracerProvider())\notlp_exporter = OTLPSpanExporter()\ntrace.get_tracer_provider().add_span_processor(BatchSpanProcessor(otlp_exporter))\n\`\`\`\n\n2. CRITICAL FIX: If you detect a FastAPI app (e.g. \`app = FastAPI()\`), you MUST add \`from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor\` and \`FastAPIInstrumentor.instrument_app(app)\` directly after the app is created.\n3. If you detect Flask, do the same using \`FlaskInstrumentor\`.\nCRITICAL: Return ONLY the raw modified file content. Do NOT wrap in \`\`\`python blocks.`;
        }
        else if (language === "go") {
          aiPrompt = `You are an expert Go developer AI.\nWe need to initialize OpenTelemetry safely.\n\nOriginal:\n\`\`\`\n${entryFile.content}\n\`\`\`\n\nTask:\n1. Add the necessary imports.\n2. Inject an initTracer() function that sets up OTLP to "https://api.deployai.in/api/observability/traces" with service name "${project.repoName}".\n3. Call \`tp := initTracer()\` at the very beginning of the main() function, and IMMEDIATELY add \`defer tp.Shutdown(context.Background())\` to prevent memory leaks!\n4. If an HTTP router (Gin, Fiber, net/http) is present, wrap it with OpenTelemetry middleware.\nCRITICAL: Return ONLY the raw modified file content. Do NOT wrap in \`\`\`go blocks.`;
        }

        const result = await model.generateContent(aiPrompt);
        let newEntryContent = extractCodeBlock(result.response.text());

        if (newEntryContent !== entryFile.content) {
          const entryBlobRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/blobs`, { content: newEntryContent, encoding: "utf-8" });
          treeEntries.push({ path: entryPath, mode: "100644", type: "blob", sha: entryBlobRes.data.sha });
          modifiedFiles.push(entryPath);
        }
      }
    }

    if (modifiedFiles.length === 0) {
      return res.status(400).json({ error: "AI could not safely modify any files. Please use manual setup." });
    }

    const treeRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/trees`, {
       base_tree: defaultSha,
       tree: treeEntries
    });

    const commitRes = await github.api.post(`/repos/${repoOwner}/${repoName}/git/commits`, {
       message: "feat: inject DeployAI Observability SDK",
       tree: treeRes.data.sha,
       parents: [defaultSha]
    });

    await github.api.patch(`/repos/${repoOwner}/${repoName}/git/refs/heads/${newBranchName}`, { sha: commitRes.data.sha });

    const prBody = `DeployAI automatically injected Observability into your project.\n\nFiles modified:\n${modifiedFiles.map(f => `- \`${f}\``).join('\n')}\n\n*Safety note: Please review the AI generated code carefully before merging.*`;
    const pr = await github.createPullRequest(repoOwner, repoName, "feat: inject DeployAI Observability SDK", prBody, newBranchName, defaultBranch);

    return res.json({ prUrl: pr.html_url, prNumber: pr.number, branch: newBranchName, file: modifiedFiles.join(", ") });
  } catch (error) {
    if (error.response?.status === 401) return res.status(401).json({ error: "GitHub integration expired." });
    if (error.response?.status === 404) return res.status(404).json({ error: "Repository not found." });
    if (error.message?.includes("503") || error.message?.includes("Service Unavailable")) {
       return res.status(503).json({ error: "Google AI Service is currently experiencing high demand. Please try again in a few moments." });
    }
    return res.status(500).json({ error: error.message || "Failed to auto-inject observability" });
  }
};


export const verifyAnalytics = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ _id: projectId, userId: req.user.userId });
    if (!project) return res.status(404).json({ error: "Project not found" });

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
    return res.status(500).json({ error: "Failed to verify analytics" });
  }
};

export const trackAnalytics = async (req, res) => {
  try {
    const { trackingId, eventType, eventName, path, fullUrl, hostname, referrer, environment, metadata } = req.body;
    if (!trackingId || !eventType) return res.status(400).json({ error: "Missing required tracking fields" });
    
    const project = await Project.findOne({ "analytics.trackingId": trackingId });
    if (!project) return res.status(404).json({ error: "Project not found" });
    
    const userAgentStr = req.headers["user-agent"] || "";
    const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    
    const parser = new UAParser(userAgentStr);
    const browser = parser.getBrowser().name || "unknown";
    const os = parser.getOS().name || "unknown";
    const device = parser.getDevice().type || "desktop";
    
    const visitorHash = crypto.createHash("sha256").update((ipAddress || "") + userAgentStr).digest("hex");
    
    const event = new AnalyticsEvent({
      projectId: project._id,
      trackingId,
      eventType,
      eventName,
      visitorHash,
      path: path || "/",
      fullUrl,
      hostname,
      referrer,
      environment: environment || "production",
      browser,
      os,
      device,
      metadata: metadata || {}
    });
    
    await event.save();
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};


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
      const authHeader = cookieToken ? `Bearer ${cookieToken}` : (req.headers.authorization || '');
      
      const traceApiUrl = `${ANALYTICS_API_URL}/traces`;
      console.log(`[VerifyObservability] Querying trace API at: ${traceApiUrl}`);
      console.log(`[VerifyObservability] Params: projectId=${project.slug || projectId}`);
      
      let tracesVerified = false;
      try {
        const response = await axios.get(traceApiUrl, {
          params: { projectId: project.slug || projectId },
          headers: { Authorization: authHeader },
          timeout: 5000
        });
        const traces = response.data?.traces || response.data || [];
        if (Array.isArray(traces) && traces.length > 0) tracesVerified = true;
      } catch (err) {
        console.warn(`[VerifyObservability] Trace check failed (ClickHouse offline?):`, err.message);
      }

      // Check RUM as a fallback. If they installed the frontend SDK, they are verified.
      const AnalyticsEvent = (await import("../models/AnalyticsEvent.js")).default;
      const hasRum = await AnalyticsEvent.exists({ projectId: project._id });

      if (tracesVerified || hasRum) {
        if (!project.observability) project.observability = {};
        project.observability.verified = true;
        await project.save();
        console.log(`[VerifyObservability] Project ${projectId} successfully verified!`);
        return res.json({ verified: true, success: true });
      }
    } catch (err) {
      console.error("[VerifyObservability] Failed to query traces:");
      console.error("  - Message:", err.message);
      if (err.response) {
         console.error("  - Response Status:", err.response.status);
         console.error("  - Response Data:", err.response.data);
      }
      // Fall through to false
    }

    return res.json({ verified: false, success: true, message: "No backend traces detected yet. Please ensure you have deployed the backend and sent a request." });
  } catch (error) {
    return res.status(500).json({ error: "Failed to verify observability" });
  }
};
