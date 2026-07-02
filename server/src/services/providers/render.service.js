import ConnectedAccount from '../../models/ConnectedAccount.js';
import { decryptSecret } from '../../utils/encryption.js';

export const getRenderToken = async (userId) => {
  const account = await ConnectedAccount.findOne({ userId, provider: 'render', status: 'connected' });
  if (!account) return null;
  return decryptSecret(account.accessTokenEncrypted);
};

export const renderAPI = async (token, method, endpoint, body = null) => {
  const url = process.env.RENDER_API_URL || 'https://api.render.com/v1';
  
  const options = {
    method,
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };
  
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  options.signal = AbortSignal.timeout(15000);
  const response = await fetch(`${url}${endpoint}`, options);
  
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    if (!response.ok) {
      throw new Error(`Render API HTTP ${response.status}: ${text.substring(0, 100)}`);
    }
    return text;
  }
  
  if (!response.ok) {
    throw new Error(data.message || `Render API Error ${response.status}`);
  }

  return data;
};

export const getRenderOwner = async (token) => {
  const data = await renderAPI(token, 'GET', '/owners?limit=10');
  if (!data || data.length === 0) {
    throw new Error("No Render owner found for this account. Ensure your API Key has full access.");
  }
  // Data format is an array of objects: { cursor: "...", owner: { id, name, email, type } }
  // We return the first valid owner.
  return data[0].owner;
};

export const createRenderWebService = async (token, ownerId, config) => {
  const payload = {
    type: "web_service",
    name: config.name,
    ownerId,
    repo: `https://github.com/${config.repoFullName}`,
    branch: config.branch || "main",
    rootDir: config.rootDir || "",
    autoDeploy: "yes",
    envVars: config.envVars || [],
    serviceDetails: {
      env: "node",
      plan: "free",
      envSpecificDetails: {
        buildCommand: config.buildCommand || "npm install && npm run build",
        startCommand: config.startCommand || "npm start"
      }
    }
  };

  return renderAPI(token, 'POST', '/services', payload);
};

export const getRenderDeploys = async (token, serviceId) => {
  return renderAPI(token, 'GET', `/services/${serviceId}/deploys?limit=1`);
};

export const updateRenderEnvVars = async (token, serviceId, envVars) => {
  return renderAPI(token, 'PUT', `/services/${serviceId}/env-vars`, envVars);
};

export const triggerRenderDeploy = async (token, serviceId) => {
  return renderAPI(token, 'POST', `/services/${serviceId}/deploys`, { clearCache: "do_not_clear" });
};

export const getRenderDeployStatus = async (token, serviceId, deployId) => {
  return renderAPI(token, 'GET', `/services/${serviceId}/deploys/${deployId}`);
};


export const getRenderServices = async (token) => {
  return renderAPI(token, 'GET', '/services?limit=100');
};

export const getRenderService = async (token, serviceId) => {
  const data = await renderAPI(token, 'GET', `/services/${serviceId}`);
  return data;
};

export const addRenderCustomDomain = async (token, serviceId, domain) => {
  const payload = { name: domain };
  const data = await renderAPI(token, 'POST', `/services/${serviceId}/custom-domains`, payload);
  return data;
};

export const getRenderCustomDomain = async (token, serviceId, customDomainId) => {
  const data = await renderAPI(token, 'GET', `/services/${serviceId}/custom-domains/${customDomainId}`);
  return data;
};

export const listRenderCustomDomains = async (token, serviceId) => {
  const data = await renderAPI(token, 'GET', `/services/${serviceId}/custom-domains`);
  return data;
};

export const forceVerifyRenderDomain = async (token, serviceId, customDomainId) => {
  const data = await renderAPI(token, 'POST', `/services/${serviceId}/custom-domains/${customDomainId}/verify`);
  return data;
};

export const removeRenderCustomDomain = async (token, serviceId, customDomainId) => {
  if (!customDomainId) return;
  const data = await renderAPI(token, 'DELETE', `/services/${serviceId}/custom-domains/${customDomainId}`);
  return data;
};

export const validateRenderToken = async (token) => {
  try {
    const data = await renderAPI(token, 'GET', '/owners');
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    return false;
  }
};

export const getRenderUsage = async (token, serviceId, startTime, endTime) => {
  let endpoint = `/metrics/bandwidth?resource=${serviceId}`;
  if (startTime) endpoint += `&startTime=${startTime}`;
  if (endTime) endpoint += `&endTime=${endTime}`;
  
  return renderAPI(token, 'GET', endpoint);
};

export const getRenderCPU = async (token, serviceId, startTime, endTime) => {
  let endpoint = `/metrics/cpu?resource=${serviceId}&resolutionSeconds=86400`;
  if (startTime) endpoint += `&startTime=${startTime}`;
  if (endTime) endpoint += `&endTime=${endTime}`;
  
  return renderAPI(token, 'GET', endpoint);
};

export const getRenderRequests = async (token, serviceId, startTime, endTime) => {
  let endpoint = `/metrics/http-requests?resource=${serviceId}&resolutionSeconds=86400`;
  if (startTime) endpoint += `&startTime=${startTime}`;
  if (endTime) endpoint += `&endTime=${endTime}`;
  
  return renderAPI(token, 'GET', endpoint);
};

export const streamRenderLogs = async (token, serviceId, onLogReceived) => {
  const url = process.env.RENDER_API_URL || 'https://api.render.com/v1';
  const response = await fetch(`${url}/services/${serviceId}/logs?tail=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  // Async generator or callback pattern for log streaming
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const lines = decoder.decode(value).split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const logEntry = JSON.parse(line);
        if (onLogReceived) onLogReceived(logEntry);
      } catch {
        // Fallback for raw text lines
        if (onLogReceived) onLogReceived({ text: line });
      }
    }
  }
};

