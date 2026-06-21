import Deployment from '../models/Deployment.js';
import Project from '../models/Project.js';
import ConnectedAccount from '../models/ConnectedAccount.js';
import User from '../models/User.js';
import { decryptSecret, encryptSecret } from '../utils/encryption.js';
import { captureDeploymentScreenshot } from '../services/screenshot.service.js';
import { getVercelToken, getVercelUser, createVercelProject, updateVercelEnvVars, triggerVercelDeploy, getVercelDeployments, getVercelProjects, getVercelProject, getVercelDeploymentEvents, updateVercelProject } from './providers/vercel.service.js';
import { getRailwayToken, getRailwayMe, getRailwayWorkspaces, createRailwayProject, getProjectEnvironments, createRailwayService, setRailwayVariables, triggerRailwayDeployment } from './providers/railway.service.js';
import { getRenderToken, getRenderOwner, createRenderWebService, getRenderDeployStatus, updateRenderEnvVars, triggerRenderDeploy, getRenderService } from './providers/render.service.js';

export const createLog = (level, step, message, metadata = {}) => ({ level, step, message, metadata, timestamp: new Date() });

export const appendLog = async (deploymentId, level, step, message, metadata={}) => {
  const logEntry = createLog(level, step, message, metadata);
  
  const deployment = await Deployment.findById(deploymentId);
  if (!deployment) return;

  await Deployment.updateOne(
    { _id: deploymentId },
    { $push: { logs: logEntry } }
  );

  if (deployment.type !== 'full' && deployment.orchestrationGroupId) {
    await Deployment.updateOne(
      { orchestrationGroupId: deployment.orchestrationGroupId, type: 'full' },
      { $push: { logs: logEntry } }
    );
  }
};

export const startFrontendProviderDeployment = async (deployment, project, injectedEnvVars = []) => {
  const projectId = project._id;
  const userId = project.userId;
  const platform = project.configuration.frontendPlatform;

  await appendLog(deployment._id, 'info', 'init', `Starting frontend deployment on ${platform}`);

  const token = await getVercelToken(userId);
  if (!token) throw new Error("Vercel is not connected. Please connect it first.");
  
  const user = await getVercelUser(token);
  const envVars = [];
  if (project.configuration.envVariables && project.configuration.envVariables.frontend) {
    for (const env of project.configuration.envVariables.frontend) {
      if (env.key && env.key.trim() !== '') {
        envVars.push({ key: env.key, value: decryptSecret(env.valueEncrypted) });
      }
    }
  }
  if (injectedEnvVars && injectedEnvVars.length > 0) {
    envVars.push(...injectedEnvVars);
  }

  let providerServiceId = project.configuration.vercelProjectId;
  let deploymentUrl;
  let dashboardUrl;
  const safeRepoName = (project.repoName || 'app').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  let projectName = `${safeRepoName}-deployra`;
  let installCommandPayload = project.configuration.installCommand;

  if (providerServiceId) {
    await appendLog(deployment._id, 'info', 'project_update', `Found existing Vercel project (${projectName}). Preparing redeployment...`);
    await updateVercelEnvVars(token, providerServiceId, envVars);
    await updateVercelProject(token, providerServiceId, { installCommand: installCommandPayload || null });
    
    await appendLog(deployment._id, 'info', 'deploy_trigger', 'Triggering redeployment on Vercel...');
    try {
      const deployRes = await triggerVercelDeploy(token, {
        name: projectName, projectId: providerServiceId, repoFullName: project.repoFullName, branch: project.selectedBranch
      });
      deploymentUrl = deployRes.url ? `https://${deployRes.url}` : null;
    } catch (deployErr) {
      throw new Error('Vercel API trigger failed: ' + deployErr.message);
    }
  } else {
    await appendLog(deployment._id, 'info', 'project_create', 'Creating new Vercel Project linked to GitHub...');
    try {
      const vercelProj = await createVercelProject(token, {
        name: projectName, repoFullName: project.repoFullName, branch: project.selectedBranch,
        rootDir: project.configuration.frontendRoot, buildCommand: project.configuration.frontendBuildCommand,
        installCommand: installCommandPayload, outputDirectory: project.configuration.outputDirectory, envVars
      });
      providerServiceId = vercelProj.id;
      project.configuration.vercelProjectId = providerServiceId;
      await project.save();
    } catch (createErr) {
      if (createErr.message.includes('already in use') || createErr.message.includes('exists')) {
        const projectsRes = await getVercelProjects(token);
        const existingProj = projectsRes.projects.find(p => p.name === projectName);
        if (existingProj) {
          providerServiceId = existingProj.id;
          project.configuration.vercelProjectId = providerServiceId;
          await project.save();
          await updateVercelEnvVars(token, providerServiceId, envVars);
        } else throw createErr;
      } else throw createErr;
    }
    
    await appendLog(deployment._id, 'info', 'deploy_trigger', 'Triggering initial Vercel deployment...');
    const deployRes = await triggerVercelDeploy(token, {
      name: projectName, projectId: providerServiceId, repoFullName: project.repoFullName, branch: project.selectedBranch
    });
    deploymentUrl = deployRes.url ? `https://${deployRes.url}` : null;
  }

  dashboardUrl = `https://vercel.com/${user.username}/${projectName}`;
  await Deployment.findByIdAndUpdate(deployment._id, {
    providerServiceId, deploymentUrl, providerUrl: deploymentUrl, providerDashboardUrl: dashboardUrl
  });

  return { token, providerServiceId, username: user.username, projectName };
};

export const checkFrontendProviderStatus = async (deploymentId, token, providerServiceId, pollStartTime, username, projectName, domainSnapshot) => {
  const deploysResp = await getVercelDeployments(token, providerServiceId);
  if (!deploysResp || !deploysResp.deployments) return { done: false, status: 'initializing' };

  const validDeployments = deploysResp.deployments.filter(d => d.createdAt > pollStartTime);
  if (validDeployments.length === 0) return { done: false, status: 'queued' };

  const latest = validDeployments[0];
  const status = latest.readyState; 

  if (status === 'READY') {
    let deploymentUrl = domainSnapshot?.frontendPrimaryDomain ? `https://${domainSnapshot.frontendPrimaryDomain}` : `https://${latest.url}`;
    let dashboardUrl = latest.inspectorUrl || `https://vercel.com/${username}/${projectName}`;
    
    try {
      const projectData = await getVercelProject(token, providerServiceId);
      if (projectData && projectData.targets && projectData.targets.production) {
        const prodTarget = projectData.targets.production;
        const mainAlias = (prodTarget.alias || []).find(a => a.includes('vercel.app')) || (prodTarget.alias || [])[0];
        if (mainAlias) deploymentUrl = `https://${mainAlias}`;
        else if (prodTarget.url) deploymentUrl = `https://${prodTarget.url}`;
      }
    } catch(e) {}

    await Deployment.findByIdAndUpdate(deploymentId, {
      deploymentUrl, providerUrl: deploymentUrl, providerDashboardUrl: dashboardUrl, providerDeploymentId: latest.uid || latest.id
    });
    return { done: true, status: 'completed', url: deploymentUrl, dashboardUrl };
  } else if (status === 'ERROR' || status === 'CANCELED') {
    let errorMsg = `Vercel build failed with status: ${status}`;
    try {
      const events = await getVercelDeploymentEvents(token, latest.uid || latest.id);
      if (events && events.length > 0) {
        const logMsgs = events.map(e => e.text || e.message || JSON.stringify(e)).filter(Boolean);
        if (logMsgs.length > 0) errorMsg += `\nLogs:\n${logMsgs.join('\n')}`;
      }
    } catch(e) {}
    return { done: true, status: 'failed', error: errorMsg };
  }

  return { done: false, status: status.toLowerCase() };
};

export const startBackendProviderDeployment = async (deployment, project, injectedEnvVars = []) => {
  const projectId = project._id;
  const userId = project.userId;
  const platform = project.configuration.backendPlatform;
  const safeRepoName = (project.repoName || 'app').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const projectName = `${safeRepoName}-deployra`;

  if (platform === 'railway') {
    const token = await getRailwayToken(userId);
    if (!token) throw new Error("Railway is not connected.");
    
    let teamId = null;
    try {
      const workspacesRes = await getRailwayWorkspaces(token);
      const teams = workspacesRes?.teams?.edges || workspacesRes?.me?.teams?.edges;
      if (teams && teams.length > 0) teamId = teams[0].node.id;
    } catch (wsErr) {}

    let providerProjectId = project.configuration.railwayProjectId;
    if (!providerProjectId) {
      await appendLog(deployment._id, 'info', 'project_create', 'Creating Railway project');
      const railProj = await createRailwayProject(token, `deploy-ai-${projectId.toString().slice(-6)}`, teamId);
      providerProjectId = railProj.projectCreate.id;
      project.configuration.railwayProjectId = providerProjectId;
      await project.save();
    }

    const envs = await getProjectEnvironments(token, providerProjectId);
    const providerEnvironmentId = envs.environments.edges[0].node.id;

    let providerServiceId;
    try {
      const railSvc = await createRailwayService(token, providerProjectId, {
        name: 'backend', repoFullName: project.repoFullName, branch: project.selectedBranch
      });
      providerServiceId = railSvc.serviceCreate.id;
    } catch (svcErr) {
      const railSvc = await createRailwayService(token, providerProjectId, { name: 'backend' });
      providerServiceId = railSvc.serviceCreate.id;
    }

    const varsMap = {};
    if (project.configuration.envVariables && project.configuration.envVariables.backend) {
      for (const env of project.configuration.envVariables.backend) {
        if (env.key && env.key.trim() !== '') varsMap[env.key] = decryptSecret(env.valueEncrypted);
      }
    }
    if (injectedEnvVars && injectedEnvVars.length > 0) {
      for (const env of injectedEnvVars) varsMap[env.key] = env.value;
    }
    await setRailwayVariables(token, providerProjectId, providerEnvironmentId, providerServiceId, varsMap);

    await appendLog(deployment._id, 'info', 'deploy_trigger', 'Triggering Railway deployment');
    await triggerRailwayDeployment(token, providerServiceId, providerEnvironmentId);

    const dashboardUrl = `https://railway.app/project/${providerProjectId}`;
    await Deployment.findByIdAndUpdate(deployment._id, {
       providerProjectId, providerEnvironmentId, providerServiceId,
       providerUrl: dashboardUrl, providerDashboardUrl: dashboardUrl
    });

    let railwayUrl = null;
    if (deployment.domainSnapshot?.backendPrimaryDomain) {
      railwayUrl = `https://${deployment.domainSnapshot.backendPrimaryDomain}`;
    }

    return { platform: 'railway', token, providerServiceId, newDeployId: null, url: railwayUrl, dashboardUrl };
  } else if (platform === 'render') {
    const token = await getRenderToken(userId);
    if (!token) throw new Error('Render is not connected.');
    const owner = await getRenderOwner(token);
    
    const varsMap = {};
    if (project.configuration.envVariables && project.configuration.envVariables.backend) {
       for (const env of project.configuration.envVariables.backend) {
          if (env.key && env.key.trim() !== '') varsMap[env.key] = decryptSecret(env.valueEncrypted);
       }
    }
    if (injectedEnvVars && injectedEnvVars.length > 0) {
       for (const env of injectedEnvVars) varsMap[env.key] = env.value;
    }
    const envVarsArray = Object.entries(varsMap).map(([key, value]) => ({ key, value }));
    
    let providerServiceId = deployment.providerServiceId || project.configuration.renderServiceId;
    if (!providerServiceId) {
       await appendLog(deployment._id, 'info', 'project_create', 'Creating Render Web Service...');
       const renderSvc = await createRenderWebService(token, owner.id, {
         name: projectName, repoFullName: project.repoFullName, branch: project.selectedBranch,
         rootDir: project.configuration.backendRoot, buildCommand: project.configuration.backendBuildCommand,
         startCommand: project.configuration.backendStartCommand, envVars: envVarsArray
       });
       providerServiceId = renderSvc.id || renderSvc.service?.id;
       project.configuration.renderServiceId = providerServiceId;
       await project.save();
    } else {
       await updateRenderEnvVars(token, providerServiceId, envVarsArray);
    }
       
    await appendLog(deployment._id, 'info', 'deploy_trigger', 'Triggering Render deployment');
    const deployTriggerRes = await triggerRenderDeploy(token, providerServiceId);
    const newDeployId = deployTriggerRes?.deploy?.id || deployTriggerRes?.id;
    
    const dashboardUrl = `https://dashboard.render.com/web/${providerServiceId}`;
    await Deployment.findByIdAndUpdate(deployment._id, {
       providerServiceId, providerUrl: dashboardUrl, providerDashboardUrl: dashboardUrl
    });

    return { platform: 'render', token, providerServiceId, newDeployId, dashboardUrl };
  }
};

export const checkBackendProviderStatus = async (deploymentId, token, platform, providerServiceId, providerDeploymentId, domainSnapshot) => {
  if (platform === 'railway') {
    // Railway marks as completed instantly in API
    let railwayUrl = domainSnapshot?.backendPrimaryDomain ? `https://${domainSnapshot.backendPrimaryDomain}` : null;
    return { done: true, status: 'completed', url: railwayUrl };
  } else if (platform === 'render') {
    if (!providerDeploymentId) return { done: true, status: 'completed' }; // Assume started if no ID
    
    const deployStatus = await getRenderDeployStatus(token, providerServiceId, providerDeploymentId);
    const st = deployStatus?.deploy?.status || deployStatus?.status;
    if (st === 'live') {
      let pollRenderUrl = domainSnapshot?.backendPrimaryDomain ? `https://${domainSnapshot.backendPrimaryDomain}` : null;
      try {
        if (!pollRenderUrl) {
          const svcDetails = await getRenderService(token, providerServiceId);
          const rawUrl = svcDetails?.serviceDetails?.url || svcDetails?.service?.url || svcDetails?.url;
          if (rawUrl) pollRenderUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
        }
      } catch(e) {}
      await Deployment.findByIdAndUpdate(deploymentId, {
        providerDeploymentUrl: pollRenderUrl, deploymentUrl: pollRenderUrl
      });
      return { done: true, status: 'completed', url: pollRenderUrl };
    } else if (st === 'build_failed' || st === 'update_failed' || st === 'canceled' || st === 'deactivated') {
      return { done: true, status: 'failed', error: `Render build ${st}` };
    }
    return { done: false, status: st };
  }
};
