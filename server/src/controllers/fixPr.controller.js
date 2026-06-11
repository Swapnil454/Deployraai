import Deployment from "../models/Deployment.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import FixPullRequest from "../models/FixPullRequest.js";
import { GitHubService } from "../services/providers/github.service.js";
import { decryptSecret } from "../utils/encryption.js";

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
    if (!["missing_health_route", "cors_origin"].includes(fixType)) {
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

    const { repoOwner, repoName } = deployment.source;

    const defaultBranch = await github.getDefaultBranch(repoOwner, repoName);
    const defaultSha = await github.getBranchSha(repoOwner, repoName, defaultBranch);

    const timestamp = Date.now();
    let branchSuffix = fixType.replace(/_/g, '-');
    const newBranchName = `deployai/fix-${branchSuffix}-${timestamp}`;
    await github.createBranch(repoOwner, repoName, newBranchName, defaultSha);

    const entryFile = await findEntryFile(github, repoOwner, repoName, newBranchName);
    if (!entryFile) {
      return res.status(400).json({ error: "Could not find a recognized backend entry file." });
    }

    let changedContent = null;
    let commitMessage = "";
    let prTitle = "";
    let envExampleChanged = false;

    if (fixType === "missing_health_route") {
      changedContent = patchHealthRoute(entryFile.content);
      if (!changedContent) return res.status(400).json({ error: "Health route already exists. No PR needed." });
      commitMessage = "fix: add backend health check endpoint";
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

    const filesChanged = [entryFile.path];

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

    const prBody = `DeployAI detected a deployment verification issue.\n\nProblem:\n${deployment.aiAnalysis.summary || "Deployment check failed."}\n\nFix:\nApplied safe patch for \`${fixType}\`.\n\nRelated Deployment:\n${deploymentId}\n\n*Safety note: no secrets included*`;

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
