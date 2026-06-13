import ConnectedAccount from "../../models/ConnectedAccount.js";
import { decryptSecret } from "../../utils/encryption.js";

const vercelAPI = async (token, method, endpoint, body = null) => {
  const url = `https://api.vercel.com${endpoint}`;
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    if (!response.ok) {
      throw new Error(`Vercel API HTTP ${response.status}: ${text.substring(0, 100)}`);
    }
    throw new Error(`Vercel API parsing error: ${err.message}`);
  }

  if (!response.ok) {
    throw new Error(data.error?.message || `Vercel API Error: ${response.status}`);
  }

  return data;
};

export const getVercelToken = async (userId) => {
  const account = await ConnectedAccount.findOne({ userId, provider: 'vercel' });
  if (!account) return null;
  return decryptSecret(account.accessTokenEncrypted);
};

export const getVercelUser = async (token) => {
  const data = await vercelAPI(token, 'GET', '/v2/user');
  return data.user;
};

export const createVercelProject = async (token, config) => {
  const payload = {
    name: config.name,
    framework: config.framework || null,
    gitRepository: {
      type: "github",
      repo: config.repoFullName
    }
  };

  if (config.rootDir && config.rootDir !== '/') {
    payload.rootDirectory = config.rootDir;
  }
  if (config.buildCommand) payload.buildCommand = config.buildCommand;
  if (config.installCommand) payload.installCommand = config.installCommand;
  if (config.outputDirectory) payload.outputDirectory = config.outputDirectory;

  if (config.envVars && config.envVars.length > 0) {
    payload.environmentVariables = config.envVars.map(env => ({
      type: "plain",
      key: env.key,
      value: env.value,
      target: ["production", "preview", "development"]
    }));
  }

  return vercelAPI(token, 'POST', '/v9/projects', payload);
};

export const updateVercelEnvVars = async (token, projectId, envVars) => {
  // Vercel v10 /env?upsert=true will update existing or create new
  if (!envVars || envVars.length === 0) return;
  
  const payload = envVars.map(env => ({
    type: "plain",
    key: env.key,
    value: env.value,
    target: ["production", "preview", "development"]
  }));

  // Note: Vercel expects a single object for POST /v10/projects/:id/env?upsert=true
  // We'll iterate and push each variable
  for (const env of payload) {
    await vercelAPI(token, 'POST', `/v10/projects/${projectId}/env?upsert=true`, env);
  }
};

export const triggerVercelDeploy = async (token, config) => {
  // Vercel v13 API requires the numeric GitHub repoId
  let repoId = null;
  try {
    const githubRes = await fetch(`https://api.github.com/repos/${config.repoFullName}`);
    if (githubRes.ok) {
      const githubData = await githubRes.json();
      repoId = githubData.id;
    }
  } catch (err) {
    console.warn("Failed to fetch numeric GitHub repoId:", err.message);
  }

  const payload = {
    name: config.name,
    project: config.projectName, // The string ID or name of the project
    target: "production",
    gitSource: {
      type: "github",
      repo: config.repoFullName,
      ref: config.branch || "main"
    }
  };

  if (repoId) {
    payload.gitSource.repoId = repoId;
  }

  return vercelAPI(token, 'POST', '/v13/deployments', payload);
};

export const getVercelDeployments = async (token, projectId) => {
  // Fetch latest deployments for the project
  return vercelAPI(token, 'GET', `/v6/deployments?projectId=${projectId}&limit=1`);
};

export const getVercelProjects = async (token) => {
  return vercelAPI(token, 'GET', '/v9/projects');
};

export const getVercelProject = async (token, projectId) => {
  return vercelAPI(token, 'GET', `/v9/projects/${projectId}`);
};

export const getVercelDeploymentEvents = async (token, deploymentId) => {
  const url = `https://api.vercel.com/v2/deployments/${deploymentId}/events`;
  const options = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  };
  const response = await fetch(url, options);
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : (data.events || []);
  } catch (err) {
    const lines = text.split('\n').filter(Boolean);
    const events = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch (e) {}
    }
    return events;
  }
};

export const addVercelDomain = async (token, projectId, domain) => {
  const payload = { name: domain };
  const data = await vercelAPI(token, 'POST', `/v10/projects/${projectId}/domains`, payload);
  return data;
};

export const getVercelDomain = async (token, projectId, domain) => {
  const data = await vercelAPI(token, 'GET', `/v9/projects/${projectId}/domains/${domain}`);
  return data;
};

export const forceVerifyVercelDomain = async (token, projectId, domain) => {
  const data = await vercelAPI(token, 'POST', `/v9/projects/${projectId}/domains/${domain}/verify`);
  return data;
};

export const removeVercelDomain = async (token, projectId, domain) => {
  const data = await vercelAPI(token, 'DELETE', `/v9/projects/${projectId}/domains/${domain}`);
  return data;
};

export const validateVercelToken = async (token) => {
  try {
    await vercelAPI(token, 'GET', `/v2/user`);
    return true;
  } catch (error) {
    return false;
  }
};
