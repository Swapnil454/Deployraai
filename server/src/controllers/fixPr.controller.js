import Deployment from "../models/Deployment.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import FixPullRequest from "../models/FixPullRequest.js";
import { GitHubService } from "../services/providers/github.service.js";
import { decryptSecret } from "../utils/encryption.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { trackAiUsage } from "../utils/aiTracker.js";

const BACKEND_ENTRY_FILES = [
  "backend/src/app.js",
  "backend/src/server.js",
  "backend/app.js",
  "backend/server.js",
  "server/src/app.js",
  "server/src/server.js",
  "server/app.js",
  "server/server.js"
];

async function findEntryFile(github, owner, repo, branch) {
  for (const path of BACKEND_ENTRY_FILES) {
    const file = await github.getFileContent(owner, repo, path, branch);
    if (file) return { path, content: file.content, sha: file.sha };
  }
  return null;
}

function patchHealthRoute(content) {
  if (content.includes("/health") || content.includes("app.get('/health'") || content.includes('app.get("/health"')) {
    return null;
  }

  const healthCode = `\napp.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "backend",
    timestamp: new Date().toISOString(),
  });
});\n`;

  let newContent = content;
  if (content.includes("app.listen")) {
    newContent = newContent.replace("app.listen", healthCode + "\napp.listen");
  } else if (content.includes("module.exports")) {
    newContent = newContent.replace("module.exports", healthCode + "\nmodule.exports");
  } else if (content.includes("export default")) {
    newContent = newContent.replace("export default", healthCode + "\nexport default");
  } else {
    newContent += healthCode;
  }
  return newContent;
}

function patchCors(content) {
  if (!content.includes("cors")) {
    throw new Error("CORS package not found. Manual setup required.");
  }

  const simpleCorsRegex = /app\.use\(\s*cors\(\s*\)\s*\);?/g;
  const genericCorsRegex = /app\.use\(\s*cors\(\s*\{\s*origin:\s*["']\*["']\s*\}\s*\)\s*\);?/g;

  let newContent = content;
  
  const newCorsCode = `app.use(
  cors({
    origin: process.env.CORS_ORIGIN || process.env.CLIENT_URL || "*",
    credentials: true,
  })
);`;

  if (simpleCorsRegex.test(newContent)) {
    newContent = newContent.replace(simpleCorsRegex, newCorsCode);
  } else if (genericCorsRegex.test(newContent)) {
    newContent = newContent.replace(genericCorsRegex, newCorsCode);
  } else {
    throw new Error("CORS config is custom. Manual review required.");
  }
  
  return newContent;
}

function patchPortBinding(content) {
  let newContent = content;
  
  const constPortRegex = /(const|let|var)\s+(port|PORT)\s*=\s*(\d+)\s*;?/gi;
  if (constPortRegex.test(newContent)) {
    newContent = newContent.replace(constPortRegex, '$1 $2 = process.env.PORT || $3;');
  }
  
  const listenRegex = /app\.listen\(\s*(\d+)\s*,/g;
  if (listenRegex.test(newContent)) {
    newContent = newContent.replace(listenRegex, 'app.listen(process.env.PORT || $1,');
  }
  
  const listenRegexNoComma = /app\.listen\(\s*(\d+)\s*\)/g;
  if (listenRegexNoComma.test(newContent)) {
    newContent = newContent.replace(listenRegexNoComma, 'app.listen(process.env.PORT || $1)');
  }
  
  return newContent !== content ? newContent : null;
}

function updateEnvExample(content, type) {
  let newContent = content || "";
  if (type === "backend") {
    if (!newContent.includes("CORS_ORIGIN=")) newContent += "\nCORS_ORIGIN=";
    if (!newContent.includes("CLIENT_URL=")) newContent += "\nCLIENT_URL=";
  }
  return newContent.trim() + "\n";
}

export const createFixPr = async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const userId = req.user.userId;

    const deployment = await Deployment.findOne({ _id: deploymentId, userId }).populate('projectId');
    if (!deployment) return res.status(404).json({ error: "Deployment not found" });

    if (!deployment.aiAnalysis || !deployment.aiAnalysis.canAutoFix) {
      return res.status(400).json({ error: "This deployment cannot be auto-fixed." });
    }

    const fixType = deployment.aiAnalysis.fixType;
    if (!["missing_health_route", "cors_origin", "build_error"].includes(fixType)) {
      return res.status(400).json({ error: "Fix type not supported yet." });
    }

    const existingPr = await FixPullRequest.findOne({ deploymentId, fixType, status: 'pr_created' });
    if (existingPr) {
      return res.json({ message: "PR already exists", pr: existingPr });
    }

    const user = await User.findById(userId);
    if (!user || !user.githubAccessTokenEncrypted) {
      return res.status(400).json({ error: "GitHub not connected" });
    }

    const githubToken = decryptSecret(user.githubAccessTokenEncrypted);
    const github = new GitHubService(githubToken);

    let { repoOwner, repoName, repoFullName } = deployment.source;
    if (!repoOwner || !repoName) {
       if (repoFullName) {
         [repoOwner, repoName] = repoFullName.split('/');
       } else {
         return res.status(400).json({ error: "Repository information missing in deployment source." });
       }
    }

    const defaultBranch = await github.getDefaultBranch(repoOwner, repoName);
    const defaultSha = await github.getBranchSha(repoOwner, repoName, defaultBranch);

    const timestamp = Date.now();
    let branchSuffix = fixType.replace(/_/g, '-');
    const newBranchName = `deployai/fix-${branchSuffix}-${timestamp}`;
    await github.createBranch(repoOwner, repoName, newBranchName, defaultSha);

    let filesChanged = [];
    let prTitle = "";
    let prBody = "";

    if (fixType === "build_error") {
      const targetFiles = deployment.aiAnalysis.fixPlan?.targetFiles || [];
      if (targetFiles.length === 0) {
        return res.status(400).json({ error: "No target files identified for build error fix." });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "AI Provider not configured. Please add GEMINI_API_KEY." });
      }
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

      const logString = deployment.logs ? deployment.logs.map(l => `[${l.level}] ${l.step}: ${l.message}`).join('\n').substring(0, 5000) : "No logs";

      const repoFiles = await github.getRepoTree(repoOwner, repoName, defaultSha);
      const repoTreeContext = repoFiles.length > 0 
        ? `\nRepository Structure (use this to verify exact import paths):\n${repoFiles.join('\n')}\n`
        : "";

      for (const filePath of targetFiles) {
        const fileData = await github.getFileContent(repoOwner, repoName, filePath, newBranchName);
        if (!fileData) continue;
        
        const prompt = `You are an expert AI code fixer.
We encountered a build/compilation error during deployment.
File: ${filePath}

Original File Content:
\`\`\`
${fileData.content}
\`\`\`
${repoTreeContext}
Deployment Error Logs:
\`\`\`
${logString}
\`\`\`

Task:
Rewrite the file content to fix the compilation/syntax/dependency error.
CRITICAL: If the error involves a missing import or file resolution issue, you MUST consult the "Repository Structure" above to write the exact correct relative path. Do NOT guess file paths.
If the file is package.json and the error is a missing dependency, add the missing dependency to "dependencies".
Return ONLY the raw new file content. Do NOT wrap it in markdown formatting blocks like \`\`\`javascript or \`\`\`json. Return the EXACT text to be saved to the file.`;

      const generateWithRetry = async (promptText) => {
        const fallbackModels = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
        for (const modelName of fallbackModels) {
          const currentModel = genAI.getGenerativeModel({ model: modelName });
          for (let i = 0; i < 3; i++) {
            try {
              return await currentModel.generateContent(promptText);
            } catch (err) {
              if (err.status === 503 || err.status === 429) {
                console.log(`[Fix PR] API error ${err.status} with ${modelName}, retrying in ${(i + 1) * 3} seconds...`);
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
      
      // Track AI usage
      await trackAiUsage(userId, deployment.projectId._id, 'auto_pr_fix');

      let newContent = result.response.text().trim();
        
        if (newContent.startsWith("\`\`\`")) {
           const lines = newContent.split("\n");
           lines.shift();
           if (lines.length > 0 && lines[lines.length - 1].startsWith("\`\`\`")) lines.pop();
           newContent = lines.join("\n");
        }

        if (newContent && newContent !== fileData.content) {
           await github.createOrUpdateFile(
              repoOwner, repoName, filePath,
              `fix: resolve build error in ${filePath}`, newContent, fileData.sha, newBranchName
           );
           filesChanged.push(filePath);
        }
      }

      if (filesChanged.length === 0) {
        return res.status(400).json({ error: "AI could not generate a fix for the target files." });
      }

      prTitle = "fix: resolve build compilation errors";
      prBody = `DeployAI detected a build compilation error.\n\nProblem:\n${deployment.aiAnalysis.summary || "Build failed."}\n\nFix:\nAI rewritten files: ${filesChanged.join(', ')}.\n\nRelated Deployment:\n${deploymentId}\n\n*Safety note: Please review AI generated code carefully.*`;
      
    } else {
      const entryFile = await findEntryFile(github, repoOwner, repoName, newBranchName);
      if (!entryFile) {
        return res.status(400).json({ error: "Could not find a recognized backend entry file." });
      }

      let changedContent = null;
      let commitMessage = "";
      let envExampleChanged = false;

      if (fixType === "missing_health_route" || fixType === "port_binding_error") {
        let currentContent = entryFile.content;
        const portPatched = patchPortBinding(currentContent);
        if (portPatched) currentContent = portPatched;
        
        const healthPatched = patchHealthRoute(currentContent);
        if (healthPatched) currentContent = healthPatched;
        
        if (!portPatched && !healthPatched) {
          return res.status(400).json({ error: "Health route already exists and port is already dynamic. No PR needed." });
        }
        
        changedContent = currentContent;
        commitMessage = "fix: ensure dynamic process.env.PORT and /health endpoint";
        prTitle = commitMessage;
      } else if (fixType === "cors_origin") {
        try {
          changedContent = patchCors(entryFile.content);
          commitMessage = "fix: configure CORS origin for deployed frontend";
          prTitle = commitMessage;
          envExampleChanged = true;
        } catch (err) {
          return res.status(400).json({ error: err.message });
        }
      }

      await github.createOrUpdateFile(
        repoOwner, repoName, entryFile.path,
        commitMessage, changedContent, entryFile.sha, newBranchName
      );

      filesChanged = [entryFile.path];

      if (envExampleChanged) {
        const backendDir = entryFile.path.split('/')[0] === 'backend' ? 'backend' : (entryFile.path.split('/')[0] === 'server' ? 'server' : '');
        const envFilePath = backendDir ? `${backendDir}/.env.example` : '.env.example';
        
        const envFile = await github.getFileContent(repoOwner, repoName, envFilePath, newBranchName);
        const updatedEnv = updateEnvExample(envFile ? envFile.content : "", "backend");
        
        await github.createOrUpdateFile(
          repoOwner, repoName, envFilePath,
          "chore: update .env.example for CORS", updatedEnv, envFile ? envFile.sha : null, newBranchName
        );
        filesChanged.push(envFilePath);
      }

      prBody = `DeployAI detected a deployment verification issue.\n\nProblem:\n${deployment.aiAnalysis.summary || "Deployment check failed."}\n\nFix:\nApplied safe patch for \`${fixType}\`.\n\nRelated Deployment:\n${deploymentId}\n\n*Safety note: no secrets included*`;
    }

    const pr = await github.createPullRequest(repoOwner, repoName, prTitle, prBody, newBranchName, defaultBranch);

    const fixRecord = new FixPullRequest({
      userId,
      projectId: deployment.projectId._id,
      deploymentId,
      provider: 'github',
      status: 'pr_created',
      fixType,
      branchName: newBranchName,
      pullRequestUrl: pr.html_url,
      pullRequestNumber: pr.number,
      filesChanged
    });
    await fixRecord.save();

    deployment.aiAnalysis.fixStatus = 'pr_created';
    await deployment.save();

    return res.json({ pr: fixRecord });
  } catch (error) {
    console.error("Create Fix PR Error:", error);
    return res.status(500).json({ error: error.message || "Failed to create fix PR" });
  }
};

export const getFixPr = async (req, res) => {
  try {
    const { fixPrId } = req.params;
    const fixPr = await FixPullRequest.findOne({ _id: fixPrId, userId: req.user.userId });
    if (!fixPr) return res.status(404).json({ error: "Fix PR not found" });
    res.json(fixPr);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch Fix PR" });
  }
};

export const listProjectFixPrs = async (req, res) => {
  try {
    const { projectId } = req.params;
    const fixPrs = await FixPullRequest.find({ projectId, userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(fixPrs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch project Fix PRs" });
  }
};
