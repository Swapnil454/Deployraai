import ConnectedAccount from '../../models/ConnectedAccount.js';
import { decryptSecret } from '../../utils/encryption.js';

export const getRailwayToken = async (userId) => {
  const account = await ConnectedAccount.findOne({ userId, provider: 'railway', status: 'connected' });
  if (!account) return null;
  return decryptSecret(account.accessTokenEncrypted);
};

export const railwayGraphQL = async (token, query, variables = {}) => {
  const url = process.env.RAILWAY_API_URL || 'https://backboard.railway.app/graphql/v2';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    if (!response.ok) {
      throw new Error(`Railway API HTTP ${response.status}: ${text.substring(0, 100)}`);
    }
    throw new Error(`Railway API returned invalid JSON: ${text.substring(0, 100)}`);
  }
  
  if (data.errors) {
    throw new Error(data.errors.map(e => e.message).join(", "));
  }

  return data.data;
};

export const getRailwayMe = async (token) => {
  const query = `
    query {
      me {
        id
        name
        email
      }
    }
  `;
  return railwayGraphQL(token, query);
};

export const getRailwayWorkspaces = async (token) => {
  // Railway uses "teams" for workspaces in GraphQL
  const query1 = `
    query {
      teams {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;
  try {
    return await railwayGraphQL(token, query1);
  } catch (e) {
    const query2 = `
      query {
        me {
          teams {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `;
    return await railwayGraphQL(token, query2);
  }
};

export const createRailwayProject = async (token, name, teamId) => {
  const query = `
    mutation projectCreate($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id
        name
      }
    }
  `;
  const variables = {
    input: {
      name: name || `deploy-ai-${Date.now()}`
    }
  };
  if (teamId) {
    variables.input.teamId = teamId;
  }
  return railwayGraphQL(token, query, variables);
};

export const getProjectEnvironments = async (token, projectId) => {
  const query = `
    query getEnvironments($projectId: String!) {
      environments(projectId: $projectId) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;
  return railwayGraphQL(token, query, { projectId });
};

export const createRailwayService = async (token, projectId, sourceConfig) => {
  const query = `
    mutation serviceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
      }
    }
  `;
  const variables = {
    input: {
      projectId,
      name: sourceConfig.name || "backend-service",
      source: {
        repo: sourceConfig.repoFullName, // e.g. "Swapnil454/Rating-Application"
        branch: sourceConfig.branch
      }
    }
  };
  return railwayGraphQL(token, query, variables);
};

export const setRailwayVariables = async (token, projectId, environmentId, serviceId, variablesMap) => {
  const query = `
    mutation variableCollectionUpsert($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `;
  const variables = {
    input: {
      projectId,
      environmentId,
      serviceId,
      variables: variablesMap
    }
  };
  return railwayGraphQL(token, query, variables);
};

export const updateServiceInstance = async (token, serviceId, environmentId, settings) => {
  const query = `
    mutation serviceInstanceUpdate($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }
  `;
  const variables = {
    serviceId,
    environmentId,
    input: settings
  };
  return railwayGraphQL(token, query, variables);
};

export const triggerRailwayDeployment = async (token, serviceId, environmentId) => {
  const query = `
    mutation serviceInstanceDeploy($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId)
    }
  `;
  return railwayGraphQL(token, query, { serviceId, environmentId });
};

export const getDeploymentStatus = async (token, deploymentId) => {
  const query = `
    query deployment($id: String!) {
      deployment(id: $id) {
        id
        status
        staticUrl
      }
    }
  `;
  return railwayGraphQL(token, query, { id: deploymentId });
};

export const addRailwayCustomDomain = async (token, environmentId, serviceId, domain) => {
  const query = `
    mutation customDomainCreate($input: CustomDomainCreateInput!) {
      customDomainCreate(input: $input) {
        id
        domain
        status
      }
    }
  `;
  return railwayGraphQL(token, query, { input: { environmentId, serviceId, domain } });
};

export const getRailwayCustomDomain = async (token, domainId) => {
  const query = `
    query customDomain($id: String!) {
      customDomain(id: $id) {
        id
        domain
        status
      }
    }
  `;
  return railwayGraphQL(token, query, { id: domainId });
};

export const listRailwayDomains = async (token, environmentId, serviceId) => {
  const query = `
    query customDomains($environmentId: String!, $serviceId: String!) {
      customDomains(environmentId: $environmentId, serviceId: $serviceId) {
        edges {
          node {
            id
            domain
            status
          }
        }
      }
    }
  `;
  return railwayGraphQL(token, query, { environmentId, serviceId });
};

export const validateRailwayToken = async (token) => {
  try {
    const query = `query { me { id name } }`;
    const response = await railwayGraphQL(token, query);
    return !!response.data?.me?.id;
  } catch (error) {
    return false;
  }
};

export const getRailwayUsage = async (token, projectId, startTime, endTime) => {
  // Railway's public GraphQL schema does not expose detailed granular network usage
  // natively in the same way Render does. We return a simulated/placeholder structure
  // or minimal info if public metrics aren't supported. 
  // We'll wrap this so the frontend knows how to handle it.
  
  return {
    bandwidth: null,
    message: "Railway network usage metrics are primarily available via the CLI ('railway metrics') or the Railway Dashboard. Detailed API bandwidth access is currently limited.",
    projectId
  };
};

export const streamRailwayLogs = async (token, projectId, environmentId, serviceId, onLogReceived) => {
  // Poll Railway's GraphQL API every 15 seconds using the last seen timestamp as the cursor.
  // This prevents rate limiting and avoids duplicate logs.
  
  let lastSeenTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // Start from 5 mins ago

  const poll = async () => {
    const query = `
      query getLogs($environmentId: String!, $serviceId: String!, $startDate: String, $limit: Int) {
        serviceLogs(environmentId: $environmentId, serviceId: $serviceId, startDate: $startDate, limit: $limit) {
          timestamp
          message
          severity
        }
      }
    `;

    try {
      const data = await railwayGraphQL(token, query, { 
        environmentId, 
        serviceId, 
        startDate: lastSeenTimestamp, 
        limit: 500 
      });
      
      const logs = data.serviceLogs || [];
      
      // Sort chronologically
      logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      for (const log of logs) {
        // Skip exactly identical timestamps to avoid the off-by-one duplicate issue if Railway inclusive-filters
        if (log.timestamp === lastSeenTimestamp) continue;
        
        if (onLogReceived) {
          onLogReceived({
            timestamp: log.timestamp,
            message: log.message,
            severity: log.severity
          });
        }
        lastSeenTimestamp = log.timestamp;
      }
    } catch (error) {
      console.error('Failed to fetch Railway logs', error);
    }

    // Schedule next poll
    setTimeout(poll, 15000);
  };

  // Start polling
  poll();
};
