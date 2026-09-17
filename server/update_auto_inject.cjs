const fs = require('fs');

let content = fs.readFileSync('server/src/controllers/analytics.controller.js', 'utf8');

const newAnalyticsCode = `export const autoInjectAnalytics = async (req, res) => {
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
    if (!repoOwner || !repoName) {
       if (repoFullName) [repoOwner, repoName] = repoFullName.split('/');
       else return res.status(400).json({ error: "Repository information missing in project source." });
    }

    const defaultBranch = await github.getDefaultBranch(repoOwner, repoName);
    const defaultSha = await github.getBranchSha(repoOwner, repoName, defaultBranch);

    const timestamp = Date.now();
    const newBranchName = \`deployai/analytics-inject-\${timestamp}\`;
    await github.createBranch(repoOwner, repoName, newBranchName, defaultSha);

    const entryFile = await findFrontendEntryFile(github, repoOwner, repoName, newBranchName);
    if (!entryFile) return res.status(400).json({ error: "Could not find frontend entry file to inject." });

    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "AI Provider not configured." });
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const apiUrl = process.env.API_URL || 'https://api.deployai.in';
    const scriptTag = \`<script defer src="\${apiUrl}/analytics.js" data-tracking-id="\${project.analytics.trackingId}"></script>\`;

    const frontendPrompt = \`You are an expert web developer AI.
We need to inject a web analytics tracking script into the <head> of this frontend layout file.

File Path: \${entryFile.path}

--- START UNTRUSTED CODE ---
Original File Content:
\\\`\\\`\\\`
\${entryFile.content}
\\\`\\\`\\\`
--- END UNTRUSTED CODE ---

Script to inject:
\\\`\\\`\\\`html
\${scriptTag}
\\\`\\\`\\\`

Task:
Inject the script tag exactly as provided into the <head> section of the document.
CRITICAL: Return ONLY the raw new file content. Do NOT wrap it in markdown formatting blocks like \\\`\\\`\\\`javascript.\`;

    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const result = await model.generateContent(frontendPrompt);
    await trackAiUsage(userId, projectId, 'analytics_insight');

    let newContent = result.response.text().trim();
    if (newContent.startsWith("\`\`\`")) {
       const lines = newContent.split("\\n");
       lines.shift();
       if (lines.length > 0 && lines[lines.length - 1].startsWith("\`\`\`")) lines.pop();
       newContent = lines.join("\\n");
    }

    if (newContent === entryFile.content) return res.status(400).json({ error: "AI failed to modify the file." });

    const blobRes = await github.api.post(\`/repos/\${repoOwner}/\${repoName}/git/blobs\`, { content: newContent, encoding: "utf-8" });
    
    const treeRes = await github.api.post(\`/repos/\${repoOwner}/\${repoName}/git/trees\`, {
       base_tree: defaultSha,
       tree: [{ path: entryFile.path, mode: "100644", type: "blob", sha: blobRes.data.sha }]
    });

    const commitRes = await github.api.post(\`/repos/\${repoOwner}/\${repoName}/git/commits\`, {
       message: "feat: inject DeployAI Analytics Script",
       tree: treeRes.data.sha,
       parents: [defaultSha]
    });

    await github.api.patch(\`/repos/\${repoOwner}/\${repoName}/git/refs/heads/\${newBranchName}\`, { sha: commitRes.data.sha });

    const prBody = \`DeployAI automatically injected Web Analytics into your project.\\n\\nFiles modified:\\n- \\\`\${entryFile.path}\\\`\\n\\n*Safety note: Please review the AI generated code carefully before merging.*\`;
    const pr = await github.createPullRequest(repoOwner, repoName, "feat: inject DeployAI Analytics Script", prBody, newBranchName, defaultBranch);

    return res.json({ prUrl: pr.html_url, prNumber: pr.number, branch: newBranchName, file: entryFile.path });
  } catch (error) {
    if (error.response?.status === 401) return res.status(401).json({ error: "GitHub integration expired." });
    if (error.response?.status === 404) return res.status(404).json({ error: "Repository not found." });
    return res.status(500).json({ error: error.message || "Failed to auto-inject analytics" });
  }
};`;

const newObservabilityCode = `export const autoInjectObservability = async (req, res) => {
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
    if (!repoOwner || !repoName) {
       if (repoFullName) [repoOwner, repoName] = repoFullName.split('/');
       else return res.status(400).json({ error: "Repository information missing in project source." });
    }

    const defaultBranch = await github.getDefaultBranch(repoOwner, repoName);
    const defaultSha = await github.getBranchSha(repoOwner, repoName, defaultBranch);

    const timestamp = Date.now();
    const newBranchName = \`deployai/observability-inject-\${timestamp}\`;
    await github.createBranch(repoOwner, repoName, newBranchName, defaultSha);

    let backendPkgPath = "package.json";
    const backendRoot = project.analysis?.backend?.path;
    if (backendRoot && backendRoot !== "." && backendRoot !== "") {
       backendPkgPath = \`\${backendRoot}/package.json\`;
    }
    
    const pkgFile = await github.getFileContent(repoOwner, repoName, backendPkgPath, newBranchName).catch(() => null);
    if (!pkgFile) return res.status(400).json({ error: "Could not find package.json in backend directory." });

    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "AI Provider not configured." });
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const backendPlatform = project.configuration?.backendPlatform || 'Node.js';

    const backendPrompt = \`You are an expert backend web developer AI.
We need to inject backend observability SDK into a \${backendPlatform} project.

--- START UNTRUSTED CODE ---
Here is the current package.json:
\\\`\\\`\\\`json
\${pkgFile.content}
\\\`\\\`\\\`
--- END UNTRUSTED CODE ---

Task:
1. Add "@swapnil454/tracepilot": "^0.1.2" to the dependencies in package.json.
2. Create the content for a new file "src/instrumentation.ts" to initialize the SDK.
   (The standard content is:
    import { registerOTel } from '@swapnil454/tracepilot/next';
    export function register() { registerOTel(); }
   )

CRITICAL: Return a JSON array containing exactly two objects:
[
  { "path": "package.json", "content": "<the fully updated package.json content>" },
  { "path": "src/instrumentation.ts", "content": "<the exact content of instrumentation.ts>" }
]
CRITICAL: Return ONLY the valid JSON array string. Do NOT wrap in \\\`\\\`\\\`json blocks.\`;

    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const result = await model.generateContent(backendPrompt);
    await trackAiUsage(userId, projectId, 'analytics_insight');
    
    let newContent = result.response.text().trim();
    if (newContent.startsWith("\`\`\`")) {
       const lines = newContent.split("\\n");
       lines.shift();
       if (lines.length > 0 && lines[lines.length - 1].startsWith("\`\`\`")) lines.pop();
       newContent = lines.join("\\n").trim();
    }

    let parsedFiles = JSON.parse(newContent);
    const treeEntries = [];
    const modifiedFiles = [];

    for (const file of parsedFiles) {
       let filePath = file.path;
       if (backendRoot && backendRoot !== "." && backendRoot !== "") {
          if (!filePath.startsWith(backendRoot)) filePath = \`\${backendRoot}/\${filePath}\`;
       }
       const blobRes = await github.api.post(\`/repos/\${repoOwner}/\${repoName}/git/blobs\`, { content: file.content, encoding: "utf-8" });
       treeEntries.push({ path: filePath, mode: "100644", type: "blob", sha: blobRes.data.sha });
       modifiedFiles.push(filePath);
    }

    const treeRes = await github.api.post(\`/repos/\${repoOwner}/\${repoName}/git/trees\`, {
       base_tree: defaultSha,
       tree: treeEntries
    });

    const commitRes = await github.api.post(\`/repos/\${repoOwner}/\${repoName}/git/commits\`, {
       message: "feat: inject DeployAI Observability SDK",
       tree: treeRes.data.sha,
       parents: [defaultSha]
    });

    await github.api.patch(\`/repos/\${repoOwner}/\${repoName}/git/refs/heads/\${newBranchName}\`, { sha: commitRes.data.sha });

    const prBody = \`DeployAI automatically injected Observability into your project.\\n\\nFiles modified:\\n\${modifiedFiles.map(f => \`- \\\`\${f}\\\`\`).join('\\n')}\\n\\n*Safety note: Please review the AI generated code carefully before merging.*\`;
    const pr = await github.createPullRequest(repoOwner, repoName, "feat: inject DeployAI Observability SDK", prBody, newBranchName, defaultBranch);

    return res.json({ prUrl: pr.html_url, prNumber: pr.number, branch: newBranchName, file: modifiedFiles.join(", ") });
  } catch (error) {
    if (error.response?.status === 401) return res.status(401).json({ error: "GitHub integration expired." });
    if (error.response?.status === 404) return res.status(404).json({ error: "Repository not found." });
    return res.status(500).json({ error: error.message || "Failed to auto-inject observability" });
  }
};`;

const autoInjectStart = content.indexOf('export const autoInjectAnalytics = async (req, res) => {');
const verifyStart = content.indexOf('export const verifyAnalytics = async (req, res) => {');

const before = content.substring(0, autoInjectStart);
const after = content.substring(verifyStart);

const newFileContent = before + newAnalyticsCode + '\n\n' + newObservabilityCode + '\n\n' + after;
fs.writeFileSync('server/src/controllers/analytics.controller.js', newFileContent);
