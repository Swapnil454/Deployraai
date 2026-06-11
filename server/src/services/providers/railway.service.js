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
