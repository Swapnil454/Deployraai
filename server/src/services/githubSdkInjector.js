import fetch from 'node-fetch';
import User from '../models/User.js';
import { decryptSecret } from '../utils/encryption.js';

export async function injectSdkViaGithub(project) {
  try {
    const user = await User.findById(project.userId);
    if (!user || !user.githubAccessTokenEncrypted) {
      console.log('Skipping SDK injection: No GitHub token available');
      return;
    }

    const token = decryptSecret(user.githubAccessTokenEncrypted);
    const { repoOwner, repoName, selectedBranch } = project;
    
    // 1. Get the latest commit SHA of the branch
    const branchRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/ref/heads/${selectedBranch}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!branchRes.ok) throw new Error('Failed to fetch branch ref');
    const branchData = await branchRes.json();
    const baseTreeSha = branchData.object.sha;

    // 2. Fetch package.json
    const pkgRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/package.json?ref=${selectedBranch}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!pkgRes.ok) return; // Project might not be Node.js, skip
    const pkgData = await pkgRes.json();
    
    let pkgJson;
    try {
      pkgJson = JSON.parse(Buffer.from(pkgData.content, 'base64').toString('utf8'));
    } catch (e) {
      return;
    }

    // Check if already injected
    if (pkgJson.dependencies && pkgJson.dependencies['@swapnil454/tracepilot']) {
      console.log('SDK already injected');
      return;
    }

    pkgJson.dependencies = pkgJson.dependencies || {};
    pkgJson.dependencies['@swapnil454/tracepilot'] = '^0.1.2';

    const newPkgContent = JSON.stringify(pkgJson, null, 2);

    // Prepare blobs to create a commit
    // Create blob for package.json
    const pkgBlobRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/blobs`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newPkgContent, encoding: 'utf-8' })
    });
    const pkgBlob = await pkgBlobRes.json();

    // Create blob for instrumentation.ts
    const instrumentationContent = `import { registerOTel } from '@swapnil454/tracepilot/next';\n\nexport function register() {\n  registerOTel();\n}\n`;
    const instBlobRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/blobs`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: instrumentationContent, encoding: 'utf-8' })
    });
    const instBlob = await instBlobRes.json();

    // 3. Create tree
    const treeRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/trees`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [
          { path: 'package.json', mode: '100644', type: 'blob', sha: pkgBlob.sha },
          { path: 'src/instrumentation.ts', mode: '100644', type: 'blob', sha: instBlob.sha }
        ]
      })
    });
    const treeData = await treeRes.json();

    // 4. Create Commit
    const commitRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/commits`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'chore: auto-inject tracepilot observability sdk',
        tree: treeData.sha,
        parents: [baseTreeSha]
      })
    });
    const commitData = await commitRes.json();

    // 5. Update Ref
    await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/refs/heads/${selectedBranch}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commitData.sha })
    });

    console.log('Successfully injected SDK via GitHub');
  } catch (error) {
    console.error('Failed to inject SDK via GitHub:', error);
  }
}
