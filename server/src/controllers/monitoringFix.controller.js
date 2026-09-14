import { pool } from '../config/postgres.js';
import User from '../models/User.js';
import Project from '../models/Project.js';
import MonitorCheck from '../models/MonitorCheck.js';
import FixPullRequest from '../models/FixPullRequest.js';
import { GitHubService } from '../services/providers/github.service.js';
import { decryptSecret } from '../utils/encryption.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { trackAiUsage } from "../utils/aiTracker.js";

export const analyzeMonitorCheck = async (req, res) => {
  try {
    const { projectId, checkId } = req.params;
    const userId = req.user.userId;

    // MonitorChecks are written by the cron system; query by _id and projectId only
    const check = await MonitorCheck.findOne({ _id: checkId, projectId });
    if (!check) return res.status(404).json({ error: 'Monitor check not found' });

    // Return cached analysis only if canAutoFix is true (skip stale cache with canAutoFix=false)
    if (check.aiAnalysis && check.aiAnalysis.summary && check.aiAnalysis.canAutoFix !== false) {
      return res.json({ success: true, aiAnalysis: check.aiAnalysis });
    }

    // Clear stale aiAnalysis so we regenerate with updated prompt
    if (check.aiAnalysis && check.aiAnalysis.canAutoFix === false) {
      check.aiAnalysis = undefined;
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "AI Provider not configured. Please add GEMINI_API_KEY." });
    }

    // Look for recent runtime issues from the SDK/Ingestor
    // that happened roughly around the time of this check (last 1 hour)
    let recentIssuesText = "No recent runtime exceptions found.";
    try {
      const oneHourAgo = new Date(check.checkedAt.getTime() - 60 * 60 * 1000);
      const issuesRes = await pool.query(
        `SELECT title, message, exception_type, latest_deobfuscated_stacktrace, latest_stacktrace, last_seen_at 
         FROM issues 
         WHERE project_id = $1 AND last_seen_at >= $2
         ORDER BY last_seen_at DESC LIMIT 5`,
        [projectId, oneHourAgo]
      );
      if (issuesRes.rows.length > 0) {
        recentIssuesText = issuesRes.rows.map(issue => `
Exception: ${issue.exception_type} - ${issue.message}
Last Seen: ${issue.last_seen_at}
Stack Trace:
${issue.latest_deobfuscated_stacktrace || issue.latest_stacktrace}
`).join('\n\n');
      }
    } catch (err) {
      console.error("Failed to fetch postgres issues for analysis:", err);
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const generateWithRetry = async (promptText) => {
      const fallbackModels = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.6-flash"];
      for (const modelName of fallbackModels) {
        const currentModel = genAI.getGenerativeModel({ model: modelName });
        for (let i = 0; i < 3; i++) {
          try {
            return await currentModel.generateContent(promptText);
          } catch (err) {
            if (err.status === 503 || err.status === 429) {
              console.log(`[Monitoring Analysis] API error ${err.status} with ${modelName}, retrying in ${(i + 1) * 3} seconds...`);
              await new Promise(res => setTimeout(res, (i + 1) * 3000));
            } else {
              throw err;
            }
          }
        }
      }
      throw new Error("All Gemini models exhausted or failed with 503/429");
    };

    const prompt = `You are an expert AI deployment assistant. Analyze the failing health check and recent runtime exceptions, and provide a root cause analysis and a fix.

Monitor Check Status: ${check.status} (Code: ${check.statusCode || 'N/A'})
Health Check URL: ${check.url}
Check Error Message: ${check.errorMessage || 'N/A'}

Recent Runtime Exceptions (from browser/server SDK):
${recentIssuesText}

Based on this information, provide an analysis in strict JSON format matching this schema:
{
  "summary": "Short 1-sentence summary of the issue.",
  "likelyCause": "Detailed explanation of the root cause.",
  "suggestedFix": "What needs to be changed to fix it.",
  "canAutoFix": true // Set to true if this is a codebase or configuration issue that an AI code editor could potentially fix (e.g. adding a missing file, fixing an import, configuring a vercel.json, fixing a route). Only set to false if it is strictly an external infrastructure outage outside the codebase.
}

Return ONLY raw JSON, without markdown formatting blocks.`;

    const result = await generateWithRetry(prompt);
    let jsonText = result.response.text().trim();
    if (jsonText.startsWith('\`\`\`json')) jsonText = jsonText.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim();
    if (jsonText.startsWith('\`\`\`')) jsonText = jsonText.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '').trim();

    let analysis;
    try {
      analysis = JSON.parse(jsonText);
    } catch (e) {
      return res.status(500).json({ error: "AI produced invalid JSON" });
    }

    analysis.generatedAt = new Date();
    analysis.canAutoFix = true; // Always allow user to attempt auto-fix
    check.aiAnalysis = analysis;
    await check.save();
    
    await trackAiUsage(userId, projectId, 'monitor_analysis');

    res.json({ success: true, aiAnalysis: analysis });
  } catch (error) {
    console.error("Monitor Analysis Error:", error);
    res.status(500).json({ error: "Failed to generate analysis" });
  }
};

export const createMonitorFixPr = async (req, res) => {
  try {
    const { projectId, checkId } = req.params;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user || !user.githubAccessTokenEncrypted) {
      return res.status(400).json({ error: "GitHub account not connected." });
    }
    const githubToken = decryptSecret(user.githubAccessTokenEncrypted);
    const github = new GitHubService(githubToken);

    // MonitorChecks are written by the cron system; query by _id and projectId only
    const check = await MonitorCheck.findOne({ _id: checkId, projectId });
    if (!check) return res.status(404).json({ error: 'Monitor check not found' });
    if (!check.aiAnalysis || !check.aiAnalysis.summary) {
      return res.status(400).json({ error: 'Please run AI Diagnosis first before creating a fix PR.' });
    }
    if (check.aiAnalysis.fix_pr_url) {
      return res.json({ pr_url: check.aiAnalysis.fix_pr_url });
    }

    const project = await Project.findById(projectId);
    if (!project) return res.status(400).json({ error: 'Project not found.' });
    
    let repoOwner = project.repoOwner;
    let repoName = project.repoName;
    if (!repoOwner || !repoName) {
      if (project.repoFullName) [repoOwner, repoName] = project.repoFullName.split('/');
      else return res.status(400).json({ error: "Repository information missing. Please link a GitHub repository to this project." });
    }

    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY missing." });
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const generateWithRetry = async (promptText) => {
      const fallbackModels = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.6-flash"];
      for (const modelName of fallbackModels) {
        const currentModel = genAI.getGenerativeModel({ model: modelName });
        for (let i = 0; i < 3; i++) {
          try {
            return await currentModel.generateContent(promptText);
          } catch (err) {
            if (err.status === 503 || err.status === 429) {
              console.log(`[Monitoring Fix PR] API error ${err.status} with ${modelName}, retrying in ${(i + 1) * 3} seconds...`);
              await new Promise(res => setTimeout(res, (i + 1) * 3000));
            } else {
              throw err;
            }
          }
        }
      }
      throw new Error("All Gemini models exhausted or failed with 503/429");
    };

    // 1. Get Repo Tree to find the file
    const defaultBranch = await github.getDefaultBranch(repoOwner, repoName);
    const defaultSha = await github.getBranchSha(repoOwner, repoName, defaultBranch);
    const repoFiles = await github.getRepoTree(repoOwner, repoName, defaultSha);

    // Fetch the recent issues again for context
    let stackTrace = "No stack trace";
    try {
      const oneHourAgo = new Date(check.checkedAt.getTime() - 60 * 60 * 1000);
      const issuesRes = await pool.query(
        `SELECT latest_deobfuscated_stacktrace, latest_stacktrace FROM issues 
         WHERE project_id = $1 AND last_seen_at >= $2
         ORDER BY last_seen_at DESC LIMIT 1`,
        [projectId, oneHourAgo]
      );
      if (issuesRes.rows.length > 0) {
        stackTrace = issuesRes.rows[0].latest_deobfuscated_stacktrace || issuesRes.rows[0].latest_stacktrace;
      }
    } catch (err) {}

    const fileIdPrompt = `You are an expert AI debugger.
Identify the SINGLE exact relative file path in the repository that needs to be fixed to resolve this issue.

AI Analysis Summary: ${check.aiAnalysis.summary}
Likely Cause: ${check.aiAnalysis.likelyCause}
Suggested Fix: ${check.aiAnalysis.suggestedFix}

Runtime Stack Trace (if any):
\`\`\`
${stackTrace}
\`\`\`

Repository Tree:
${repoFiles.join('\n')}

Return ONLY the raw relative file path as a string (e.g. src/App.jsx). Do not include quotes or markdown.`;

    const fileIdResult = await generateWithRetry(fileIdPrompt);
    const targetFile = fileIdResult.response.text().trim();

    if (!targetFile || !repoFiles.includes(targetFile)) {
       return res.status(400).json({ error: `AI could not confidently identify the source file. It guessed: ${targetFile}` });
    }

    // 2. Fetch File & Rewrite
    const fileData = await github.getFileContent(repoOwner, repoName, targetFile, defaultBranch);
    if (!fileData) return res.status(404).json({ error: `File ${targetFile} not found.` });

    const rewritePrompt = `You are an expert AI code fixer. We are fixing a runtime bug.
Target File: ${targetFile}

Original Content:
\`\`\`
${fileData.content}
\`\`\`

Suggested Fix:
${check.aiAnalysis.suggestedFix}

Task: Rewrite the ENTIRE file content to apply the fix safely. Maintain existing logic.
Return ONLY the raw new file content. Do NOT wrap it in markdown.`;

    const rewriteResult = await generateWithRetry(rewritePrompt);
    let newContent = rewriteResult.response.text().trim();
    if (newContent.startsWith("\`\`\`")) {
       const lines = newContent.split("\\n");
       lines.shift();
       if (lines.length > 0 && lines[lines.length - 1].startsWith("\`\`\`")) lines.pop();
       newContent = lines.join("\\n");
    }

    if (!newContent || newContent === fileData.content) {
       return res.status(400).json({ error: "AI could not generate a meaningful change." });
    }

    await trackAiUsage(userId, projectId, 'auto_pr_fix_monitor');

    // 3. Create PR
    const timestamp = Date.now();
    const newBranchName = `deployai/fix-runtime-${timestamp}`;
    await github.createBranch(repoOwner, repoName, newBranchName, defaultSha);

    await github.createOrUpdateFile(
       repoOwner, repoName, targetFile,
       `fix: resolve runtime error affecting monitoring check`,
       newContent, fileData.sha, newBranchName
    );

    const prTitle = `fix: resolve runtime error`;
    const prBody = `DeployAI detected a production error causing the health checks to fail.\n\n### Issue Summary\n**${check.aiAnalysis.summary}**\n\n### Root Cause Analysis\n${check.aiAnalysis.likelyCause}\n\n### AI Suggested Fix\n${check.aiAnalysis.suggestedFix}\n\n*Safety note: Please review AI generated code carefully before merging.*`;

    const pr = await github.createPullRequest(repoOwner, repoName, prTitle, prBody, newBranchName, defaultBranch);

    const fixRecord = new FixPullRequest({
      userId, projectId, provider: 'github', status: 'pr_created', fixType: 'runtime_exception',
      branchName: newBranchName, pullRequestUrl: pr.html_url, pullRequestNumber: pr.number, filesChanged: [targetFile]
    });
    await fixRecord.save();

    check.aiAnalysis.fix_pr_url = pr.html_url;
    await check.save();

    return res.json({ success: true, pr_url: pr.html_url, record: fixRecord });
  } catch (error) {
    console.error("Create Monitor Fix PR Error:", error);
    return res.status(500).json({ error: error.message || "Failed to create fix PR" });
  }
};
