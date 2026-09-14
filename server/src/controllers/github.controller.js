import axios from "axios";
import User from "../models/User.js";
import { decryptSecret } from "../utils/encryption.js";

import ConnectedAccount from "../models/ConnectedAccount.js";

const getGithubToken = async (userId) => {
  // 1. Try to get token from ConnectedAccount
  const connectedAccount = await ConnectedAccount.findOne({ userId, provider: 'github', status: 'connected' });
  if (connectedAccount && connectedAccount.accessTokenEncrypted) {
    return decryptSecret(connectedAccount.accessTokenEncrypted);
  }

  // 2. Fallback to legacy User model
  const user = await User.findById(userId);
  if (!user || (!user.githubConnected && !user.githubAccessTokenEncrypted)) {
    throw new Error("GitHub not connected");
  }
  return decryptSecret(user.githubAccessTokenEncrypted);
};

export const getRepos = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const token = await getGithubToken(req.user.userId);
    
    let rawRepos = [];
    let hasMore = false;
    
    if (search.trim()) {
      // Search API requires the username to scope the query
      const connectedAccount = await ConnectedAccount.findOne({ userId: req.user.userId, provider: 'github' });
      let username = connectedAccount?.providerAccountName;
      if (!username) {
         const userRes = await axios.get("https://api.github.com/user", {
           headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" }
         });
         username = userRes.data.login;
      }
      
      const q = encodeURIComponent(`${search.trim()} user:${username}`);
      const response = await axios.get(`https://api.github.com/search/repositories?q=${q}&per_page=${limit}&page=${page}&sort=updated`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" }
      });
      
      rawRepos = response.data.items || [];
      hasMore = (response.data.total_count || 0) > page * limit;
    } else {
      const response = await axios.get(`https://api.github.com/user/repos?visibility=public&sort=updated&per_page=${limit}&page=${page}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" }
      });
      
      rawRepos = response.data || [];
      hasMore = rawRepos.length === parseInt(limit, 10);
    }

    const repos = rawRepos.map(repo => ({
      id: repo.id,
      name: repo.name,
      owner: repo.owner.login,
      fullName: repo.full_name,
      private: repo.private,
      defaultBranch: repo.default_branch,
      htmlUrl: repo.html_url,
      updatedAt: repo.updated_at
    }));

    res.json({ repos, hasMore });
  } catch (error) {
    if (error.response?.status === 401) {
      // Token is invalid/expired
      await User.findByIdAndUpdate(req.user.userId, { githubConnected: false });
      await ConnectedAccount.findOneAndUpdate({ userId: req.user.userId, provider: 'github' }, { status: 'expired' });
      return res.status(401).json({ error: "GitHub connection expired. Please reconnect GitHub." });
    }
    if (error.message === "GitHub not connected") {
      return res.status(401).json({ error: "GitHub not connected" });
    }
    console.error("GitHub Fetch Repos Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch repositories" });
  }
};

export const getBranches = async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const token = await getGithubToken(req.user.userId);
    
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });

    const branches = response.data.map(branch => ({
      name: branch.name,
      protected: branch.protected
    }));

    res.json(branches);
  } catch (error) {
    if (error.response?.status === 401) {
      await User.findByIdAndUpdate(req.user.userId, { githubConnected: false });
      await ConnectedAccount.findOneAndUpdate({ userId: req.user.userId, provider: 'github' }, { status: 'expired' });
      return res.status(401).json({ error: "GitHub connection expired. Please reconnect GitHub." });
    }
    console.error("GitHub Fetch Branches Error:", error.message);
    res.status(500).json({ error: "Failed to fetch branches" });
  }
};
