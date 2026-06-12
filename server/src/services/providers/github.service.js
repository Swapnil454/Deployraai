import axios from 'axios';

export class GitHubService {
  constructor(token) {
    this.token = token;
    this.api = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
  }

  async getDefaultBranch(owner, repo) {
    const res = await this.api.get(`/repos/${owner}/${repo}`);
    return res.data.default_branch;
  }

  async getBranchSha(owner, repo, branch) {
    const res = await this.api.get(`/repos/${owner}/${repo}/git/refs/heads/${branch}`);
    return res.data.object.sha;
  }

  async getRepoTree(owner, repo, sha) {
    try {
      const res = await this.api.get(`/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`);
      if (res.data && res.data.tree) {
        // Filter out typical noise directories to save tokens
        return res.data.tree
          .filter(item => item.type === 'blob' && !item.path.includes('node_modules/') && !item.path.includes('.git/') && !item.path.includes('dist/') && !item.path.includes('build/'))
          .map(item => item.path);
      }
      return [];
    } catch (err) {
      console.error("Failed to get repo tree:", err.message);
      return [];
    }
  }

  async createBranch(owner, repo, newBranchName, sourceSha) {
    await this.api.post(`/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${newBranchName}`,
      sha: sourceSha,
    });
  }

  async getFileContent(owner, repo, path, branch) {
    try {
      const res = await this.api.get(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
      const content = Buffer.from(res.data.content, 'base64').toString('utf8');
      return { content, sha: res.data.sha };
    } catch (err) {
      if (err.response && err.response.status === 404) {
        return null; // File doesn't exist
      }
      throw err;
    }
  }

  async createOrUpdateFile(owner, repo, path, message, content, sha, branch) {
    const data = {
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
    };
    if (sha) {
      data.sha = sha;
    }
    const res = await this.api.put(`/repos/${owner}/${repo}/contents/${path}`, data);
    return res.data;
  }

  async createPullRequest(owner, repo, title, body, head, base) {
    const res = await this.api.post(`/repos/${owner}/${repo}/pulls`, {
      title,
      body,
      head,
      base,
    });
    return res.data;
  }
}
