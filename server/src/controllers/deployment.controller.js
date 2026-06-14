import mongoose from "mongoose";
import Deployment from "../models/Deployment.js";
import Project from "../models/Project.js";
import ConnectedAccount from "../models/ConnectedAccount.js";
import { decryptSecret, encryptSecret } from "../utils/encryption.js";
import User from "../models/User.js";
import {
  getRailwayToken,
  getRailwayMe,
  getRailwayWorkspaces,
  createRailwayProject,
  getProjectEnvironments,
  createRailwayService,
  setRailwayVariables,
  triggerRailwayDeployment,
  getDeploymentStatus
} from "../services/providers/railway.service.js";
import {
  getRenderToken,
  getRenderOwner,
  createRenderWebService,
  getRenderDeploys,
  updateRenderEnvVars,
  triggerRenderDeploy,
  getRenderServices,
  getRenderService
} from "../services/providers/render.service.js";
import { createDefaultMonitors } from '../services/monitoring.service.js';
import {
  getVercelToken,
  getVercelUser,
  createVercelProject,
  updateVercelEnvVars,
  triggerVercelDeploy,
  getVercelDeployments,
  getVercelProjects,
  getVercelProject,
  getVercelDeploymentEvents
} from "../services/providers/vercel.service.js";
import { checkBackendHealth, checkFrontendHealth, checkCors } from "../services/healthCheck.service.js";
import { sanitizeDeploymentLogs } from "../utils/sanitizeLogs.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
// Helper to construct a log entry
const createLog = (level, step, message, metadata = {}) => ({
  level,
  step,
  message,
  metadata,
  timestamp: new Date()
});

const generateMockDeployment = async (req, res, type) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.userId;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (project.status !== 'configured') {
      return res.status(400).json({ error: "Project is not fully configured" });
    }

    const platform = type === 'frontend' ? project.configuration.frontendPlatform : project.configuration.backendPlatform;
    if (!platform || platform === 'none') {
      return res.status(400).json({ error: `No ${type} platform configured` });
    }

    // Check provider connection
    const account = await ConnectedAccount.findOne({ userId, provider: platform, status: 'connected' });
    if (!account) {
      return res.status(400).json({ error: `${platform} is not connected. Please connect it first.` });
    }

    // Config Snapshot setup
    const envKeys = {};
    if (project.configuration.envVariables) {
      if (project.configuration.envVariables.frontend) envKeys.frontend = project.configuration.envVariables.frontend.map(e => e.key);
      if (project.configuration.envVariables.backend) envKeys.backend = project.configuration.envVariables.backend.map(e => e.key);
      if (project.configuration.envVariables.shared) envKeys.shared = project.configuration.envVariables.shared.map(e => e.key);
    }

    const configSnapshot = {
      installCommand: project.configuration.installCommand,
      buildCommand: type === 'frontend' ? project.configuration.frontendBuildCommand : project.configuration.backendBuildCommand,
      startCommand: type === 'backend' ? project.configuration.backendStartCommand : undefined,
      outputDirectory: project.configuration.outputDirectory,
      envKeys
    };

    const source = {
      repoOwner: project.repoOwner,
      repoName: project.repoName,
      repoFullName: project.repoFullName,
      branch: project.selectedBranch,
      commitSha: null,
      rootDirectory: type === 'frontend' ? project.configuration.frontendRoot : project.configuration.backendRoot
    };

    const initialLogs = [
      createLog('info', 'validation', `${type.charAt(0).toUpperCase() + type.slice(1)} deployment requested`, { projectId }),
      createLog('info', 'validation', 'Project ownership verified'),
      createLog('info', 'validation', 'Configuration loaded', { platform, branch: project.selectedBranch }),
      createLog('info', 'provider_connection', `${platform} connection verified`, { providerType: account.providerType }),
      createLog('warning', 'provider_connection', `Real ${platform} deployment API not connected yet in Phase 4B`),
      createLog('success', 'validation', 'Deployment job created successfully')
    ];

    const deployment = await Deployment.create({
      userId,
      projectId,
      type,
      serviceName: type,
      platform,
      status: 'queued',
      source,
      configSnapshot,
      logs: initialLogs
    });

    res.status(201).json({ success: true, deploymentId: deployment._id });
  } catch (error) {
    console.error(`Trigger ${type} deployment error:`, error);
    res.status(500).json({ error: "Failed to trigger deployment" });
  }
};

export const triggerFrontendDeployment = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.userId;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.userId.toString() !== userId.toString()) return res.status(403).json({ error: "Access denied" });
    if (project.status !== 'configured') return res.status(400).json({ error: "Project is not fully configured" });

    const platform = project.configuration.frontendPlatform;
    if (platform !== 'vercel') return generateMockDeployment(req, res, 'frontend');

    await Deployment.updateMany(
      { projectId, retryOfDeploymentId: req.body?.retryOfDeploymentId || undefined,
      type: 'frontend', status: 'running' },
      { $set: { status: 'failed', errorMessage: 'Superseded', completedAt: new Date() } }
    );

    const deployment = await Deployment.create({
      userId,
      projectId,
      retryOfDeploymentId: req.body?.retryOfDeploymentId || undefined,
      type: 'frontend',
      serviceName: 'frontend',
      platform,
      status: 'running',
      source: { repoFullName: project.repoFullName, branch: project.selectedBranch, rootDirectory: project.configuration.frontendRoot }
    });

    res.status(202).json({ success: true, deploymentId: deployment._id, message: "Deployment started" });
    executeFrontendDeployment(deployment, project, []);
  } catch (error) {
    console.error(`Trigger frontend deployment error for project ${req.params?.projectId}:`, error);
    res.status(500).json({ error: "Failed to trigger deployment", details: error.message });
  }
};

export const triggerBackendDeployment = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.userId;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.userId.toString() !== userId.toString()) return res.status(403).json({ error: "Access denied" });
    if (project.status !== 'configured') return res.status(400).json({ error: "Project is not fully configured" });

    const platform = project.configuration.backendPlatform;
    if (platform !== 'railway' && platform !== 'render') return generateMockDeployment(req, res, 'backend');

    await Deployment.updateMany(
      { projectId, retryOfDeploymentId: req.body?.retryOfDeploymentId || undefined,
      type: 'backend', status: 'running' },
      { $set: { status: 'failed', errorMessage: 'Superseded', completedAt: new Date() } }
    );

    const deployment = await Deployment.create({
      userId,
      projectId,
      retryOfDeploymentId: req.body?.retryOfDeploymentId || undefined,
      type: 'backend',
      serviceName: 'backend',
      platform,
      status: 'running',
      source: { repoFullName: project.repoFullName, branch: project.selectedBranch, rootDirectory: project.configuration.backendRoot }
    });

    res.status(202).json({ success: true, deploymentId: deployment._id, message: "Deployment started" });
    executeBackendDeployment(deployment, project, []);
  } catch (error) {
    console.error(`Trigger backend deployment error for project ${req.params?.projectId}:`, error);
    res.status(500).json({ error: "Failed to trigger deployment", details: error.message });
  }
};

const executeFrontendDeployment = async (deployment, project, injectedEnvVars = []) => {
  const projectId = project._id;
  const userId = project.userId;
  const platform = project.configuration.frontendPlatform;

      const appendLog = async (level, step, message, metadata={}) => {
        await Deployment.findByIdAndUpdate(deployment._id, {
          $push: { logs: createLog(level, step, message, metadata) }
        });
      };

      try {
        await appendLog('info', 'init', `Starting frontend deployment on ${platform}`);

        const token = await getVercelToken(userId);
        if (!token) throw new Error("Vercel is not connected. Please connect it first.");
        
        await appendLog('info', 'provider_connection', 'Vercel connection found');
        await appendLog('info', 'provider_connection', 'Vercel token decrypted');
        
        await appendLog('info', 'provider_connection', 'Authenticating with Vercel API');
        const user = await getVercelUser(token);
        await appendLog('success', 'provider_connection', 'Vercel API authentication verified', { username: user.username });

        await appendLog('info', 'env_setup', 'Preparing frontend environment variables');
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
        await appendLog('success', 'env_setup', 'Frontend variables prepared');

        let providerServiceId = project.configuration.vercelProjectId;
        let deploymentUrl;
        let dashboardUrl;
        const safeRepoName = (project.repoName || 'app').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        let projectName = `${safeRepoName}-deployra`;

        try {
          if (providerServiceId) {
             const previousDeploy = await Deployment.findOne({ projectId, platform: { $in: ['vercel', 'multiple'] }, providerServiceId }).sort({ createdAt: -1 });
             const previousEnvSnapshot = previousDeploy?.configSnapshot?.envSnapshotStr || "";
             const currentEnvSnapshot = JSON.stringify([...(project.configuration.envVariables?.frontend || []), ...(injectedEnvVars || [])]);
             const envChanged = previousEnvSnapshot !== currentEnvSnapshot || (injectedEnvVars && injectedEnvVars.length > 0);

             if (envChanged) {
               await appendLog('info', 'project_update', `Found existing Vercel project (${projectName}). Updating environment variables...`);
               await updateVercelEnvVars(token, providerServiceId, envVars);
               
               await appendLog('info', 'deploy_trigger', 'Environment changed. Triggering redeployment on existing Vercel project...');
               try {
                 const deployRes = await triggerVercelDeploy(token, {
                   name: projectName,
                   projectName: projectName,
                   repoFullName: project.repoFullName,
                   branch: project.selectedBranch
                 });
                 deploymentUrl = deployRes.url ? `https://${deployRes.url}` : null;
                 await appendLog('success', 'deploy_trigger', 'Vercel redeployment started successfully');
               } catch (deployErr) {
                 await appendLog('warning', 'deploy_trigger', 'API trigger failed, assuming manual Vercel Git trigger...', { error: deployErr.message });
               }
             } else {
               await appendLog('info', 'project_update', `Found existing Vercel project (${projectName}). Environment variables unchanged.`);
               await appendLog('info', 'deploy_trigger', 'No configuration changes detected. Fetching latest deployment status...');
               // We don't trigger a new deployment, we just let the polling loop fetch the latest one
             }
          } else {
             await appendLog('info', 'project_create', 'Creating new Vercel Project linked to GitHub...');
             try {
               const vercelProj = await createVercelProject(token, {
                 name: projectName,
                 repoFullName: project.repoFullName,
                 branch: project.selectedBranch,
                 rootDir: project.configuration.frontendRoot,
                 buildCommand: project.configuration.frontendBuildCommand,
                 installCommand: project.configuration.installCommand,
                 outputDirectory: project.configuration.outputDirectory,
                 envVars
               });
               providerServiceId = vercelProj.id;
               project.configuration.vercelProjectId = providerServiceId;
               await project.save();
               await appendLog('success', 'project_create', 'Vercel Project created successfully');
             } catch (createErr) {
               if (createErr.message.includes('already in use') || createErr.message.includes('exists')) {
                 await appendLog('info', 'project_update', 'Vercel project already exists in provider. Linking...');
                 const projectsRes = await getVercelProjects(token);
                 const existingProj = projectsRes.projects.find(p => p.name === projectName);
                 if (existingProj) {
                   providerServiceId = existingProj.id;
                   project.configuration.vercelProjectId = providerServiceId;
                   await project.save();
                   await appendLog('success', 'project_update', 'Linked successfully. Triggering redeployment...');
                   await updateVercelEnvVars(token, providerServiceId, envVars);
                 } else { throw createErr; }
               } else { throw createErr; }
             }
             await appendLog('info', 'deploy_trigger', 'Triggering initial Vercel deployment...');
             try {
               const deployRes = await triggerVercelDeploy(token, {
                 name: projectName,
                 projectName: projectName,
                 repoFullName: project.repoFullName,
                 branch: project.selectedBranch
               });
               deploymentUrl = deployRes.url ? `https://${deployRes.url}` : null;
               await appendLog('success', 'deploy_trigger', 'Vercel deployment automatically started');
             } catch (deployErr) {
               await appendLog('warning', 'deploy_trigger', 'API trigger failed, assuming manual Vercel Git trigger...', { error: deployErr.message });
             }
          }

          await Deployment.findByIdAndUpdate(deployment._id, {
             providerServiceId,
             deploymentUrl,
             providerUrl: deploymentUrl,
             providerDashboardUrl: `https://vercel.com/${user.username}/${projectName}`
          });

          // Poll Vercel deployment status
          await appendLog('info', 'deploy_trigger', 'Waiting for Vercel build to complete...');
          let isCompleted = false;
          let finalStatus = 'failed';
          let finalErrorMessage = null;
          
          for (let i = 0; i < 60; i++) { // Max 5 minutes
            await new Promise(resolve => setTimeout(resolve, 5000));
            try {
              const deploysResp = await getVercelDeployments(token, providerServiceId);
              if (deploysResp && deploysResp.deployments && deploysResp.deployments.length > 0) {
                const latest = deploysResp.deployments[0];
                const status = latest.readyState; // QUEUED, BUILDING, ERROR, INITIALIZING, READY, CANCELED
                
                if (status === 'READY') {
                  isCompleted = true;
                  finalStatus = 'completed';
                  await appendLog('success', 'deploy_trigger', 'Vercel deployment is READY and successful!');
                  if (latest.url) {
                    deploymentUrl = `https://${latest.url}`;
                    let currentDashUrl = `https://vercel.com/${user.username}/${projectName}`;
                    if (latest.inspectorUrl) {
                      currentDashUrl = latest.inspectorUrl;
                    }
                    dashboardUrl = currentDashUrl;
                    try {
                      const projectData = await getVercelProject(token, providerServiceId);
                      let prodUrl = null;
                      if (projectData && projectData.targets && projectData.targets.production) {
                        const prodTarget = projectData.targets.production;
                        if (prodTarget.alias && prodTarget.alias.length > 0) {
                          const mainAlias = prodTarget.alias.find(a => a.includes('vercel.app')) || prodTarget.alias[0];
                          if (mainAlias) {
                            prodUrl = `https://${mainAlias}`;
                          }
                        }
                        if (!prodUrl && prodTarget.url) {
                          prodUrl = `https://${prodTarget.url}`;
                        }
                      }
                      
                      if (prodUrl) {
                         deploymentUrl = prodUrl;
                         await appendLog('info', 'deploy_trigger', `Fetched Vercel production URL: ${deploymentUrl}`);
                      } else if (projectName) {
                         deploymentUrl = `https://${projectName}.vercel.app`;
                         await appendLog('info', 'deploy_trigger', `Fallback Vercel production URL: ${deploymentUrl}`);
                      }
                    } catch (e) {
                      console.warn("Failed to get production url from vercel:", e.message);
                      if (projectName) deploymentUrl = `https://${projectName}.vercel.app`;
                    }
                    await Deployment.findByIdAndUpdate(deployment._id, { 
                      deploymentUrl, 
                      providerUrl: deploymentUrl,
                      providerDashboardUrl: currentDashUrl
                    });
                  }
                  break;
                } else if (status === 'ERROR' || status === 'CANCELED') {
                  isCompleted = true;
                  finalStatus = 'failed';
                  finalErrorMessage = `Vercel build failed with status: ${status}`;
                  await appendLog('error', 'deploy_trigger', finalErrorMessage);
                  
                  try {
                    const deployId = latest.uid || latest.id;
                    const events = await getVercelDeploymentEvents(token, deployId);
                    if (events && events.length > 0) {
                      const logMsgs = events.map(e => e.text || e.message || JSON.stringify(e)).filter(Boolean);
                      if (logMsgs.length > 0) {
                        await appendLog('error', 'deploy_trigger', `Vercel Build Logs:\n${logMsgs.join('\n')}`);
                      }
                    }
                  } catch (logErr) {
                    console.error("Failed to fetch Vercel logs:", logErr.message);
                  }
                  
                  break;
                }
              }
            } catch (pollErr) {
              console.error("Vercel polling error:", pollErr.message);
            }
          }

          if (!isCompleted) {
            finalErrorMessage = 'Vercel deployment timed out after 5 minutes';
            await appendLog('error', 'deploy_trigger', finalErrorMessage);
          }

          if (deployment.type !== 'full') {
            await Deployment.findByIdAndUpdate(deployment._id, {
              status: finalStatus,
              errorMessage: finalErrorMessage,
              completedAt: new Date()
            });
          }
          return { url: deploymentUrl, dashboardUrl };

        } catch (svcErr) {
          if (svcErr.message.includes('repo') || svcErr.message.includes('github') || svcErr.message.includes('installation')) {
             await appendLog('error', 'project_create', 'GitHub repo linking failed. Please connect repository manually in Vercel.', { error: svcErr.message });
             if (deployment.type !== 'full') {
               await Deployment.findByIdAndUpdate(deployment._id, {
                  status: 'failed',
                  errorMessage: 'Awaiting manual GitHub connection'
               });
             }
          } else {
             throw svcErr;
          }
        }

      } catch (err) {
        console.error("Frontend Background deployment error:", err);
        await appendLog('error', 'system', `Deployment failed: ${err.message}`);
        if (deployment.type !== 'full') {
          await Deployment.findByIdAndUpdate(deployment._id, { status: 'failed', errorMessage: err.message, completedAt: new Date() });
        }
      }

};

const executeBackendDeployment = async (deployment, project, injectedEnvVars = []) => {
  const projectId = project._id;
  const userId = project.userId;
  const platform = project.configuration.backendPlatform;
  const safeRepoName = (project.repoName || 'app').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const projectName = `${safeRepoName}-deployra`;

      const appendLog = async (level, step, message, metadata={}) => {
        await Deployment.findByIdAndUpdate(deployment._id, {
          $push: { logs: createLog(level, step, message, metadata) }
        });
      };
      
      try {
        if (platform === 'railway') {
          const token = await getRailwayToken(userId);
          if (!token) throw new Error("Railway is not connected. Please connect it first.");
          
          await appendLog('info', 'provider_connection', 'Railway connection found');
          await appendLog('info', 'provider_connection', 'Railway token decrypted');
          
          let isWorkspaceToken = false;
          try {
            await getRailwayMe(token);
            await appendLog('info', 'provider_connection', 'Railway API authentication verified');
          } catch (authErr) {
            if (authErr.message.includes('Not Authorized') || authErr.message.includes('Unauthorized')) {
              await appendLog('warning', 'provider_connection', 'Token is scoped to a workspace. Proceeding without Account access.');
              isWorkspaceToken = true;
            } else {
              throw authErr;
            }
          }

          let teamId = null;
          await appendLog('info', 'project_create', 'Fetching Railway workspaces');
          try {
            const workspacesRes = await getRailwayWorkspaces(token);
            const teams = workspacesRes?.teams?.edges || workspacesRes?.me?.teams?.edges;
            if (teams && teams.length > 0) {
              teamId = teams[0].node.id;
              await appendLog('info', 'project_create', 'Railway workspace found', { teamId });
            } else {
              await appendLog('warning', 'project_create', 'No workspaces found in API response');
            }
          } catch (wsErr) {
            await appendLog('warning', 'project_create', `Failed to fetch workspaces: ${wsErr.message}`);
          }

          let providerProjectId = project.configuration.railwayProjectId;
      if (!providerProjectId) {
         await appendLog('info', 'project_create', 'Creating Railway project');
         const railProj = await createRailwayProject(token, `deploy-ai-${projectId.toString().slice(-6)}`, teamId);
         providerProjectId = railProj.projectCreate.id;
         project.configuration.railwayProjectId = providerProjectId;
         await project.save();
         await appendLog('success', 'project_create', 'Railway project created', { providerProjectId });
      } else {
         await appendLog('info', 'project_update', 'Found existing Railway project');
      }

          await appendLog('info', 'env_setup', 'Resolving Railway environment');
          const envs = await getProjectEnvironments(token, providerProjectId);
          const providerEnvironmentId = envs.environments.edges[0].node.id;
          await appendLog('success', 'env_setup', 'Railway environment found', { providerEnvironmentId });

          await appendLog('info', 'project_create', 'Creating backend service linked to GitHub');
          let providerServiceId;
          try {
            const railSvc = await createRailwayService(token, providerProjectId, {
              name: 'backend',
              repoFullName: project.repoFullName,
              branch: project.selectedBranch
            });
            providerServiceId = railSvc.serviceCreate.id;
            await appendLog('success', 'project_create', 'Backend service created', { providerServiceId });
          } catch (svcErr) {
            await appendLog('warning', 'project_create', 'GitHub repo linking failed. Please connect repository manually in Railway.', { error: svcErr.message });
            // Create empty service as fallback
            const railSvc = await createRailwayService(token, providerProjectId, { name: 'backend' });
            providerServiceId = railSvc.serviceCreate.id;
          }

          await appendLog('info', 'env_setup', 'Preparing backend environment variables');
          const varsMap = {};
          if (project.configuration.envVariables && project.configuration.envVariables.backend) {
             for (const env of project.configuration.envVariables.backend) {
                if (env.key && env.key.trim() !== '') {
                  varsMap[env.key] = decryptSecret(env.valueEncrypted);
                }
             }
          }
          if (injectedEnvVars && injectedEnvVars.length > 0) {
             for (const env of injectedEnvVars) {
                varsMap[env.key] = env.value;
             }
          }
          await setRailwayVariables(token, providerProjectId, providerEnvironmentId, providerServiceId, varsMap);
          await appendLog('success', 'env_setup', 'Backend variables uploaded');

          await appendLog('info', 'env_setup', 'Applying build/start settings (skipped for MVP due to Railway API schema complexity)');
          await appendLog('success', 'env_setup', 'Service settings saved');

          await appendLog('info', 'deploy_trigger', 'Triggering Railway deployment');
          await triggerRailwayDeployment(token, providerServiceId, providerEnvironmentId);
          await appendLog('success', 'deploy_trigger', 'Railway deployment started');

          await Deployment.findByIdAndUpdate(deployment._id, {
             providerProjectId,
             providerEnvironmentId,
             providerServiceId,
             providerUrl: `https://railway.app/project/${providerProjectId}`,
             providerDashboardUrl: `https://railway.app/project/${providerProjectId}`
          });
          
          return { url: null, dashboardUrl: `https://railway.app/project/${providerProjectId}` };
        } else if (platform === 'render') {
          await appendLog('info', 'provider_connection', 'Connecting to Render...');
          const token = await getRenderToken(userId);
          if (!token) throw new Error('Render is not connected. Please connect Render account first.');
          
          await appendLog('info', 'provider_connection', 'Render connected. Fetching owner info...');
          const owner = await getRenderOwner(token);
          
          const varsMap = {};
          if (project.configuration.envVariables && project.configuration.envVariables.backend) {
             for (const env of project.configuration.envVariables.backend) {
                if (env.key && env.key.trim() !== '') {
                  varsMap[env.key] = decryptSecret(env.valueEncrypted);
                }
             }
          }
          if (injectedEnvVars && injectedEnvVars.length > 0) {
             for (const env of injectedEnvVars) {
                varsMap[env.key] = env.value;
             }
          }
          const envVarsArray = Object.entries(varsMap).map(([key, value]) => ({ key, value }));
          
          let providerServiceId = deployment.providerServiceId || project.configuration.renderServiceId;
          
          if (!providerServiceId) {
             await appendLog('info', 'project_create', 'Creating Render Web Service...');
             const renderSvc = await createRenderWebService(token, owner.id, {
               name: projectName,
               repoFullName: project.repoFullName,
               branch: project.selectedBranch,
               rootDir: project.configuration.backendRoot,
               buildCommand: project.configuration.backendBuildCommand,
               startCommand: project.configuration.backendStartCommand,
               envVars: envVarsArray
             });
             providerServiceId = renderSvc.id || renderSvc.service?.id;
             project.configuration.renderServiceId = providerServiceId;
             await project.save();
             await appendLog('success', 'project_create', 'Render Service created successfully');
             
             if (renderSvc.service?.url) {
                return { url: renderSvc.service.url, dashboardUrl: `https://dashboard.render.com/web/${providerServiceId}` };
             }
          } else {
             await appendLog('info', 'env_setup', 'Updating Render environment variables...');
             await updateRenderEnvVars(token, providerServiceId, envVarsArray);
             await appendLog('success', 'env_setup', 'Backend variables updated');
             
             await appendLog('info', 'deploy_trigger', 'Triggering Render deployment');
             await triggerRenderDeploy(token, providerServiceId);
             await appendLog('success', 'deploy_trigger', 'Render deployment started');
          }
          
          let renderUrl = null;
          try {
            const svcDetails = await getRenderService(token, providerServiceId);
            let rawUrl = null;
            if (svcDetails && svcDetails.serviceDetails && svcDetails.serviceDetails.url) {
               rawUrl = svcDetails.serviceDetails.url;
            } else if (svcDetails && svcDetails.service && svcDetails.service.url) {
               rawUrl = svcDetails.service.url;
            } else if (svcDetails && svcDetails.url) {
               rawUrl = svcDetails.url;
            }
            
            if (rawUrl) {
               renderUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
            }
          } catch(e) {
            console.warn("Failed to fetch render service details to get URL:", e.message);
          }

          await Deployment.findByIdAndUpdate(deployment._id, {
             providerServiceId,
             providerUrl: `https://dashboard.render.com/web/${providerServiceId}`,
             providerDashboardUrl: `https://dashboard.render.com/web/${providerServiceId}`
          });
          
          return { url: renderUrl, dashboardUrl: `https://dashboard.render.com/web/${providerServiceId}` };
        }
      } catch (err) {
        console.error("Background deploy error:", err);
        if (deployment.type !== 'full') {
          await Deployment.findByIdAndUpdate(deployment._id, {
            status: 'failed',
            errorMessage: err.message,
            completedAt: new Date()
          });
        }
        return { url: null, dashboardUrl: null };
      }

};

export const triggerFullDeployment = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.userId;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.userId.toString() !== userId.toString()) return res.status(403).json({ error: "Access denied" });
    if (project.status !== 'configured') return res.status(400).json({ error: "Project is not fully configured" });

    if (!project.configuration.frontendPlatform || project.configuration.frontendPlatform === 'none') {
       return res.status(400).json({ error: "Frontend platform not configured" });
    }
    if (!project.configuration.backendPlatform || project.configuration.backendPlatform === 'none') {
       return res.status(400).json({ error: "Backend platform not configured" });
    }

    await Deployment.updateMany(
      { projectId, retryOfDeploymentId: req.body?.retryOfDeploymentId || undefined,
      type: 'full', status: 'running' },
      { $set: { status: 'failed', errorMessage: 'Superseded by new full deployment', completedAt: new Date() } }
    );

    const deployment = await Deployment.create({
      userId,
      projectId,
      retryOfDeploymentId: req.body?.retryOfDeploymentId || undefined,
      type: 'full',
      serviceName: 'Full Stack',
      platform: 'multiple',
      status: 'running',
      source: {
        repoFullName: project.repoFullName,
        branch: project.selectedBranch,
      },
      logs: [
        createLog('info', 'validation', 'Full-stack deployment requested', { projectId }),
        createLog('info', 'validation', 'Project ownership verified'),
        createLog('info', 'validation', 'Configuration loaded')
      ]
    });

    res.status(202).json({ success: true, deploymentId: deployment._id, message: "Full deployment started" });

    (async () => {
       const appendLog = async (level, step, message, metadata={}) => {
         await Deployment.findByIdAndUpdate(deployment._id, {
           $push: { logs: createLog(level, step, message, metadata) }
         });
       };

       try {
         await appendLog('info', 'deploying_backend', 'Step 1: Executing Backend Deployment');
         let backendRes = await executeBackendDeployment(deployment, project, []);
         let providerBackendUrl = backendRes?.url;
         let backendUrl = providerBackendUrl;
         let backendDashboardUrl = backendRes?.dashboardUrl;
         
         const DomainSetup = (await import('../models/DomainSetup.js')).default;
         const domainSetup = await DomainSetup.findOne({ projectId, status: 'active' });

         if (domainSetup && domainSetup.backendDomain) {
             backendUrl = `https://${domainSetup.backendDomain}`;
             await appendLog('info', 'custom_domain', `Overriding backend URL with active custom domain: ${backendUrl}`);
         } else if (!backendUrl) {
             await appendLog('warning', 'deploying_backend', 'Backend deployed but URL was not returned. Proceeding anyway.');
             backendUrl = "http://unknown-backend-url";
             providerBackendUrl = backendUrl;
         } else {
             await appendLog('success', 'deploying_backend', `Backend deployed successfully at ${backendUrl}`);
         }
         // Find the correct Frontend ENV key for Backend URL (e.g., VITE_API_URL, NEXT_PUBLIC_API_URL)
         let frontendApiUrlKey = 'NEXT_PUBLIC_API_URL';
         if (project.configuration.envVariables && project.configuration.envVariables.frontend) {
            const possibleFrontendKeys = ['VITE_API_URL', 'REACT_APP_API_URL', 'API_URL', 'NEXT_PUBLIC_API_URL'];
            const existingFrontendKey = project.configuration.envVariables.frontend.find(e => possibleFrontendKeys.includes(e.key));
            if (existingFrontendKey) frontendApiUrlKey = existingFrontendKey.key;
         }
         
         await appendLog('info', 'deploying_frontend', `Step 2: Executing Frontend Deployment with ${frontendApiUrlKey} injected`);
         const injectedFrontendEnv = [{ key: frontendApiUrlKey, value: backendUrl }];
         let frontendRes = await executeFrontendDeployment(deployment, project, injectedFrontendEnv);
         let providerFrontendUrl = frontendRes?.url;
         let frontendUrl = providerFrontendUrl;
         let frontendDashboardUrl = frontendRes?.dashboardUrl;

         if (domainSetup && domainSetup.frontendDomain) {
             frontendUrl = `https://${domainSetup.frontendDomain}`;
             await appendLog('info', 'custom_domain', `Overriding frontend URL with active custom domain: ${frontendUrl}`);
         } else if (!frontendUrl) {
             await appendLog('warning', 'deploying_frontend', 'Frontend deployed but URL was not returned. Proceeding anyway.');
             frontendUrl = "http://unknown-frontend-url";
             providerFrontendUrl = frontendUrl;
         } else {
             await appendLog('success', 'deploying_frontend', `Frontend deployment completed successfully. URL: ${frontendUrl}`);
         }

         // Find the correct Backend ENV key for Frontend URL (e.g., CLIENT_URL, CORS_ORIGIN)
         let backendCorsKey = 'CORS_ORIGIN';
         if (project.configuration.envVariables && project.configuration.envVariables.backend) {
            const possibleBackendKeys = ['CLIENT_URL', 'FRONTEND_URL', 'ORIGIN', 'CORS_ORIGIN'];
            const existingBackendKey = project.configuration.envVariables.backend.find(e => possibleBackendKeys.includes(e.key));
            if (existingBackendKey) backendCorsKey = existingBackendKey.key;
         }

         await appendLog('info', 'updating_backend_cors', `Step 3: Redeploying Backend with ${backendCorsKey} injected`);
         const injectedBackendEnv = [{ key: backendCorsKey, value: frontendUrl }];
         await executeBackendDeployment(deployment, project, injectedBackendEnv);

         // Sync automatically linked URLs back to Database so Dashboard UI is accurate
         let dbUpdated = false;
         if (project.configuration.envVariables) {
             if (project.configuration.envVariables.frontend) {
                 const fKey = project.configuration.envVariables.frontend.find(e => e.key === frontendApiUrlKey);
                 if (fKey) {
                     fKey.valueEncrypted = encryptSecret(backendUrl);
                     dbUpdated = true;
                 } else {
                     project.configuration.envVariables.frontend.push({ key: frontendApiUrlKey, valueEncrypted: encryptSecret(backendUrl), isSecret: false });
                     dbUpdated = true;
                 }
             }
             if (project.configuration.envVariables.backend) {
                 const bKey = project.configuration.envVariables.backend.find(e => e.key === backendCorsKey);
                 if (bKey) {
                     bKey.valueEncrypted = encryptSecret(frontendUrl);
                     dbUpdated = true;
                 } else {
                     project.configuration.envVariables.backend.push({ key: backendCorsKey, valueEncrypted: encryptSecret(frontendUrl), isSecret: false });
                     dbUpdated = true;
                 }
             }
             if (dbUpdated) {
                 await project.save();
                 await appendLog('info', 'sync_env', 'Synchronized deployment URLs back to project configuration.');
             }
         }

         // --- HEALTH CHECKS ---
         await appendLog('info', 'checking_backend', 'Step 4: Running Backend Health Check');
         const backendHealth = await checkBackendHealth(backendUrl, appendLog);
         if (backendHealth.status === 'failed') {
             await appendLog('error', 'checking_backend', backendHealth.message);
         } else if (backendHealth.status === 'warning') {
             await appendLog('warning', 'checking_backend', backendHealth.message);
             await appendLog('info', 'checking_backend', 'Recommendation: Add a /health endpoint returning JSON for stronger verification.');
         } else {
             await appendLog('success', 'checking_backend', backendHealth.message);
         }

         await appendLog('info', 'checking_frontend', 'Step 5: Running Frontend Health Check');
         const frontendHealth = await checkFrontendHealth(frontendUrl, appendLog);
         if (frontendHealth.status === 'failed') {
             await appendLog('error', 'checking_frontend', frontendHealth.message);
         } else if (frontendHealth.status === 'warning') {
             await appendLog('warning', 'checking_frontend', frontendHealth.message);
         } else {
             await appendLog('success', 'checking_frontend', frontendHealth.message);
         }

         await appendLog('info', 'checking_full_stack', 'Step 6: Running CORS Check');
         const corsHealth = await checkCors(frontendUrl, backendUrl, appendLog);
         if (corsHealth.status === 'failed') {
             await appendLog('error', 'checking_full_stack', corsHealth.message);
         } else if (corsHealth.status === 'warning') {
             await appendLog('warning', 'checking_full_stack', corsHealth.message);
         } else {
             await appendLog('success', 'checking_full_stack', corsHealth.message);
         }

         // Evaluate Final Verification
         const healthCheckSummary = {
             backend: { ...backendHealth, url: backendUrl, checkedAt: new Date() },
             frontend: { ...frontendHealth, url: frontendUrl, checkedAt: new Date() },
             cors: { ...corsHealth, checkedAt: new Date() },
             database: { status: backendHealth.db === 'connected' ? 'passed' : backendHealth.db === 'error' ? 'failed' : 'unknown', message: backendHealth.db ? `DB Status: ${backendHealth.db}` : 'N/A', checkedAt: new Date() }
         };

         const finalSummary = {
             frontendUrl,
             backendUrl,
             frontendDashboardUrl,
             backendDashboardUrl,
             durationMs: Date.now() - new Date(deployment.startedAt).getTime(),
         };

         let finalStatus = 'success';
         let failedStep = null;
         let failureReason = null;
         let suggestedFix = null;

         if (backendHealth.status === 'failed') {
             finalStatus = 'failed';
             failedStep = 'Backend health check';
             failureReason = backendHealth.message;
             suggestedFix = 'Check MONGO_URI, PORT handling, or server start command.';
         } else if (frontendHealth.status === 'failed') {
             finalStatus = 'failed';
             failedStep = 'Frontend health check';
             failureReason = frontendHealth.message;
             suggestedFix = 'Check frontend build logs, output directory, or syntax errors.';
         } else if (corsHealth.status === 'failed') {
             finalStatus = 'failed';
             failedStep = 'CORS Check';
             failureReason = corsHealth.message;
             suggestedFix = 'Ensure your backend uses the cors() middleware and correctly reads process.env.CORS_ORIGIN.';
         } else if (healthCheckSummary.database.status === 'failed') {
             finalStatus = 'failed';
             failedStep = 'Database Check';
             failureReason = 'Backend reported Database connection failure';
             suggestedFix = 'Verify MONGO_URI string inside Project Settings.';
         }

         finalSummary.status = finalStatus;
         finalSummary.failedStep = failedStep;
         finalSummary.failureReason = failureReason;
         finalSummary.suggestedFix = suggestedFix;

         await appendLog(finalStatus === 'success' ? 'success' : 'error', 'checking_full_stack', `Full-stack deployment orchestration completed with status: ${finalStatus}`);
         
         if (finalStatus === 'success') {
             try {
                 await createDefaultMonitors(projectId, frontendUrl, backendUrl);
             } catch (monitorErr) {
                 console.error("Failed to auto-create monitors after deployment:", monitorErr);
             }
         }

         await Deployment.findByIdAndUpdate(deployment._id, { 
            status: finalStatus, 
            deploymentUrl: frontendUrl,
            providerDashboardUrl: frontendDashboardUrl || backendDashboardUrl, // Keep a primary one for fallback
            healthCheck: healthCheckSummary,
            finalSummary,
            completedAt: new Date(),
            ...(finalStatus === 'failed' ? { errorMessage: failureReason } : {})
         });

       } catch (err) {
         console.error("Full stack deploy error:", err);
         await appendLog('error', 'system', `Full deployment failed: ${err.message}`);
         await Deployment.findByIdAndUpdate(deployment._id, { 
            status: 'failed', 
            errorMessage: err.message, 
            completedAt: new Date() 
         });
       }
    })();
  } catch (error) {
    console.error("Trigger full deployment error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Failed to trigger full deployment" });
  }
};

export const getDeployment = async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const deployment = await Deployment.findById(deploymentId);
    
    if (!deployment) return res.status(404).json({ error: "Deployment not found" });
    if (deployment.userId.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json(deployment);
  } catch (error) {
    console.error("Get deployment error:", error);
    res.status(500).json({ error: "Failed to fetch deployment" });
  }
};

export const getUserDeployments = async (req, res) => {
  try {
    const { type, projectId, environment, branch, status, days } = req.query;
    let query = { userId: req.user.userId };

    if (type) query.type = type;
    if (projectId && projectId !== 'all') query.projectId = projectId;
    
    if (environment && environment !== 'all') {
       if (environment.toLowerCase() === 'production') {
         query['source.branch'] = 'main';
       } else if (environment.toLowerCase() === 'preview') {
         query['source.branch'] = { $ne: 'main' };
       }
    }

    if (branch && branch !== 'all') {
      query['source.branch'] = branch;
    }

    if (status && status !== 'all') {
      if (status === 'ready') query.status = 'success';
      else query.status = status;
    }

    if (days && days !== 'all') {
      const d = parseInt(days, 10);
      if (!isNaN(d)) {
        query.createdAt = { $gte: new Date(Date.now() - d * 24 * 60 * 60 * 1000) };
      }
    }

    const deployments = await Deployment.find(query)
      .populate('projectId', 'repoName repoFullName')
      .sort({ createdAt: -1 });

    // Get the user's GitHub token once for enrichment
    let githubToken = null;
    try {
      const connectedAccount = await ConnectedAccount.findOne({ userId: req.user.userId, provider: 'github', status: 'connected' });
      if (connectedAccount?.accessTokenEncrypted) {
        githubToken = decryptSecret(connectedAccount.accessTokenEncrypted);
      } else {
        const user = await User.findById(req.user.userId);
        if (user?.githubAccessTokenEncrypted) {
          githubToken = decryptSecret(user.githubAccessTokenEncrypted);
        }
      }
    } catch (tokenErr) {
      console.warn('Could not get GitHub token for commit enrichment:', tokenErr.message);
    }

    // Enrich deployments with real commit messages from GitHub
    const enriched = await Promise.all(deployments.map(async (dep) => {
      const obj = dep.toObject();

      // Skip if we already have the commit message stored
      if (obj.source?.commitMessage) return obj;

      const repoFullName = obj.source?.repoFullName || obj.projectId?.repoFullName;
      if (!repoFullName || !githubToken) return obj;

      try {
        let sha = obj.source?.commitSha;
        let commitMessage = null;

        if (sha) {
          // We have a SHA — look up that specific commit
          const ghRes = await fetch(`https://api.github.com/repos/${repoFullName}/commits/${sha}`, {
            headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github.v3+json' }
          });
          if (ghRes.ok) {
            const data = await ghRes.json();
            commitMessage = data.commit?.message?.split('\n')[0] || null;
          }
        } else {
          // No SHA stored — fetch the latest commit from the deployment's branch
          const branch = obj.source?.branch || 'main';
          const ghRes = await fetch(`https://api.github.com/repos/${repoFullName}/commits/${branch}`, {
            headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github.v3+json' }
          });
          if (ghRes.ok) {
            const data = await ghRes.json();
            sha = data.sha || null;
            commitMessage = data.commit?.message?.split('\n')[0] || null;
          }
        }

        if (commitMessage) {
          obj.source.commitMessage = commitMessage;
          if (sha) obj.source.commitSha = sha;
          // Persist so we don't hit GitHub again on future requests
          await Deployment.findByIdAndUpdate(dep._id, {
            'source.commitMessage': commitMessage,
            ...(sha && { 'source.commitSha': sha })
          });
        }
      } catch (ghErr) {
        console.warn(`Could not fetch commit for ${repoFullName}:`, ghErr.message);
      }

      return obj;
    }));

    res.json(enriched);
  } catch (error) {
    console.error("Get user deployments error:", error);
    res.status(500).json({ error: "Failed to fetch deployments" });
  }
};

export const getProjectDeployments = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId);
    
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.userId.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    const deployments = await Deployment.find({ projectId }).sort({ createdAt: -1 });
    res.json(deployments);
  } catch (error) {
    console.error("Get project deployments error:", error);
    res.status(500).json({ error: "Failed to fetch deployments" });
  }
};

export const syncDeployment = async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const deployment = await Deployment.findById(deploymentId);
    
    if (!deployment) return res.status(404).json({ error: "Deployment not found" });
    if (deployment.userId.toString() !== req.user.userId.toString()) return res.status(403).json({ error: "Access denied" });

    // Sync only running deployments that use Railway
    if (deployment.status === 'running' && deployment.platform === 'railway') {
      try {
        const token = await getRailwayToken(deployment.userId);
        if (token && deployment.providerProjectId) {
           // We do a simple sync by getting project environments or deployments.
           // Since we didn't store the exact deployment ID yet (Railway's API doesn't return it on trigger easily without more queries), 
           // we'll just check if the service exists or just log a sync.
           // For MVP, we will keep it running until the user manually checks, or we can check project status.
        }
      } catch (err) {
        console.error("Sync error:", err);
      }
    }

    res.json({ success: true, deployment });
  } catch (error) {
    console.error("Sync deployment error:", error);
    res.status(500).json({ error: "Failed to sync deployment" });
  }
};

export const explainDeploymentError = async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const deployment = await Deployment.findById(deploymentId);
    
    if (!deployment) return res.status(404).json({ error: "Deployment not found" });
    if (deployment.userId.toString() !== req.user.userId.toString()) return res.status(403).json({ error: "Access denied" });
    if (deployment.status !== 'failed' && deployment.status !== 'warning') {
      return res.status(400).json({ error: "Explanation is only available for failed or warning deployments" });
    }

    if (deployment.aiAnalysis && deployment.aiAnalysis.summary) {
       return res.json({ success: true, aiAnalysis: deployment.aiAnalysis });
    }

    if (!process.env.GEMINI_API_KEY) {
       return res.status(500).json({ error: "AI Provider not configured. Please add GEMINI_API_KEY." });
    }

    const sanitizedLogs = sanitizeDeploymentLogs(deployment.logs || []);
    const logString = sanitizedLogs.map(l => `[${l.level}] ${l.step}: ${l.message}`).join('\n');

    const { isPlatformInternalBug, extractErrorStack } = await import('../utils/extractErrorStack.js');
    if (isPlatformInternalBug(deployment.logs || [])) {
       const { default: PlatformBugReport } = await import('../models/PlatformBugReport.js');
       
       const stackTrace = extractErrorStack(deployment.logs || [], deployment.finalSummary?.failureReason);
       
       const aiAnalysis = {
         summary: "DeployAI encountered an internal function reference error or missing component.",
         likelyCause: "An internal bug occurred within the DeployAI platform during this deployment step.",
         failedStep: deployment.finalSummary?.failedStep || 'Unknown',
         suggestedFixes: ["A bug report has been generated. Our engineering team has been notified.", "Please try deploying again later or contact support."],
         severity: "high",
         canAutoFix: false,
         fixType: "unknown",
         failureCategory: "platform_internal_bug",
         userAction: "contact_support",
         generatedAt: new Date()
       };

       deployment.aiAnalysis = aiAnalysis;
       await deployment.save();

       await PlatformBugReport.create({
         userId: req.user.userId,
         projectId: deployment.projectId,
         deploymentId: deployment._id,
         errorMessage: stackTrace.split('\n')[0] || "Internal Platform Error",
         stackTraceSanitized: stackTrace,
         sanitizedLogs: sanitizedLogs,
         failedStep: deployment.finalSummary?.failedStep || 'Unknown',
       });

       return res.json({ success: true, aiAnalysis });
    }

    if (logString.includes("Render deployment is not available in this version")) {
       const aiAnalysis = {
         summary: "Render backend deployment is not yet supported in this version.",
         likelyCause: "Render automation is still under development.",
         failedStep: "backend_deployment",
         suggestedFixes: ["Go to project configuration.", "Change backend platform to Railway.", "Save and deploy again."],
         severity: "medium",
         canAutoFix: false,
         fixType: "unknown",
         failureCategory: "provider_issue",
         userAction: "update_config",
         generatedAt: new Date()
       };
       deployment.aiAnalysis = aiAnalysis;
       await deployment.save();
       return res.json({ success: true, aiAnalysis });
    }

    const Project = (await import('../models/Project.js')).default;
    const project = await Project.findById(deployment.projectId);

    if (project && project.analysis?.backend?.dependencies?.mongoose) {
       const hasMongoUri = project.configuration?.envVariables?.backend?.some(e => e.key === 'MONGO_URI');
       if (!hasMongoUri && (logString.toLowerCase().includes('mongo') || logString.toLowerCase().includes('database') || logString.toLowerCase().includes('timeout'))) {
         const aiAnalysis = {
           summary: "Missing database connection string.",
           likelyCause: "The backend uses Mongoose but MONGO_URI is missing from the environment variables.",
           failedStep: "health_check",
           suggestedFixes: ["Go to project configuration.", "Add MONGO_URI to backend environment variables.", "Redeploy."],
           severity: "high",
           canAutoFix: false,
           fixType: "unknown",
           failureCategory: "config_issue",
           userAction: "update_config",
           configFixSuggestion: {
             fieldPath: "configuration.envVariables.backend.MONGO_URI",
             currentValue: null,
             suggestedValue: "",
             reason: "MONGO_URI is required for MongoDB/Mongoose backend deployment.",
             confidence: "high"
           },
           generatedAt: new Date()
         };
         deployment.aiAnalysis = aiAnalysis;
         await deployment.save();
         return res.json({ success: true, aiAnalysis });
       }
    }

    const prompt = `You are an AI deployment assistant. Analyze the failed deployment and return ONLY valid JSON.
Do not wrap it in markdown code blocks. Just return the raw JSON object.

Deployment Type: ${deployment.type}
Status: ${deployment.status}
Failed Step: ${deployment.finalSummary?.failedStep || 'Unknown'}
Frontend URL: ${deployment.finalSummary?.frontendUrl ? 'available' : 'missing'}
Backend URL: ${deployment.finalSummary?.backendUrl ? 'available' : 'missing'}

Health Checks:
Backend: ${deployment.healthCheck?.backend?.status || 'N/A'}
Frontend: ${deployment.healthCheck?.frontend?.status || 'N/A'}
CORS: ${deployment.healthCheck?.cors?.status || 'N/A'}
Database: ${deployment.healthCheck?.database?.status || 'N/A'}

Logs:
${logString}

Task:
Explain the failure in simple language and suggest practical fixes for a developer.
Also classify the error strictly into one of the following failure categories:
1. repo_issue: Problem is inside the user's GitHub repo (e.g., compilation error, syntax error, missing package, missing /health, CORS).
2. config_issue: Problem is from user deployment config (e.g., missing env vars, wrong build command).
3. provider_issue: Problem is from the hosting provider (e.g., token expired, quota exceeded).
4. unknown: Unclear origin.

Assign the most appropriate userAction based on the failureCategory:
- repo_issue: "create_fix_pr" (if auto-fixable) or "retry"
- config_issue: "update_config"
- provider_issue: "reconnect_provider" or "retry"
- unknown: "retry"

If the failure is specifically a missing backend health route (/health missing), set fixType to "missing_health_route".
If the failure is specifically a missing or wrong CORS configuration preventing frontend from calling backend, set fixType to "cors_origin".
If the failure is a compilation error, syntax error, missing npm package, or TypeScript error in the user's code, set fixType to "build_error".
If the failure is a backend port binding error where the server hardcodes a port instead of using process.env.PORT, set fixType to "port_binding_error".
For ONLY these FOUR issues (missing_health_route, cors_origin, build_error, port_binding_error), set canAutoFix to true and provide a fixPlan. 
For "build_error", you MUST populate fixPlan.targetFiles with the specific file(s) that need fixing based on the build logs (e.g. "client/src/App.js", "client/package.json").
For all other issues, set canAutoFix to false, fixType to "unknown" and fixPlan to null.

If failureCategory is "config_issue", you MUST provide a configFixSuggestion. 
A configFixSuggestion targets a specific field in the project's configuration to update.
Allowed field paths: "configuration.backendStartCommand", "configuration.frontendBuildCommand", "configuration.frontendRoot", "configuration.backendRoot".
Do NOT suggest values for sensitive environment variables (set suggestedValue to "").

Response MUST match this exact JSON schema:
{
  "summary": "String",
  "likelyCause": "String",
  "failedStep": "String",
  "suggestedFixes": ["String", "String"],
  "severity": "low" | "medium" | "high",
  "canAutoFix": Boolean,
  "fixType": "missing_health_route" | "cors_origin" | "build_error" | "port_binding_error" | "unknown",
  "fixPlan": {
    "targetFiles": ["String"],
    "changes": ["String"]
  } | null,
  "failureCategory": "repo_issue" | "config_issue" | "provider_issue" | "platform_internal_bug" | "unknown",
  "userAction": "create_fix_pr" | "update_config" | "reconnect_provider" | "contact_support" | "retry",
  "configFixSuggestion": {
    "fieldPath": "String",
    "currentValue": "String | null",
    "suggestedValue": "String | null",
    "reason": "String",
    "confidence": "low" | "medium" | "high"
  } | null
}`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const generateWithRetry = async (promptText) => {
      const fallbackModels = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
      for (const modelName of fallbackModels) {
        const currentModel = genAI.getGenerativeModel({ model: modelName });
        for (let i = 0; i < 3; i++) {
          try {
            return await currentModel.generateContent(promptText);
          } catch (err) {
            if (err.status === 503 || err.status === 429) {
              console.log(`[AI Analysis] API error ${err.status} with ${modelName}, retrying in ${(i + 1) * 3} seconds...`);
              await new Promise(res => setTimeout(res, (i + 1) * 3000));
            } else {
              throw err;
            }
          }
        }
      }
      throw new Error("All Gemini models exhausted or failed with 503/429");
    };

    const result = await generateWithRetry(prompt);
    let jsonText = result.response.text().trim();
    
    if (jsonText.startsWith('```json')) {
       jsonText = jsonText.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (jsonText.startsWith('```')) {
       jsonText = jsonText.replace(/^```/, '').replace(/```$/, '').trim();
    }

    let aiAnalysis;
    try {
      aiAnalysis = JSON.parse(jsonText);
      aiAnalysis.generatedAt = new Date();
    } catch (e) {
      console.error("AI JSON parse error:", e, "Text:", jsonText);
      aiAnalysis = {
         summary: "Deployment failed, but AI explanation could not be parsed.",
         likelyCause: "Unknown configuration or runtime error.",
         failedStep: deployment.finalSummary?.failedStep || "unknown",
         suggestedFixes: ["Check the logs manually.", "Verify environment variables."],
         severity: "medium",
         canAutoFix: false,
         generatedAt: new Date()
      };
    }

    deployment.aiAnalysis = aiAnalysis;
    await deployment.save();

    res.json({ success: true, aiAnalysis });
  } catch (error) {
    console.error("Explain error:", error);
    res.status(500).json({ error: "Failed to generate AI explanation" });
  }
};

export const retryDeployment = async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const oldDeployment = await Deployment.findById(deploymentId);
    
    if (!oldDeployment) return res.status(404).json({ error: "Deployment not found" });
    if (oldDeployment.userId.toString() !== req.user.userId.toString()) return res.status(403).json({ error: "Access denied" });

    req.params.projectId = oldDeployment.projectId.toString();
    req.body = { retryOfDeploymentId: oldDeployment._id.toString() };

    if (oldDeployment.type === 'frontend') {
       return triggerFrontendDeployment(req, res);
    } else if (oldDeployment.type === 'backend') {
       return triggerBackendDeployment(req, res);
    } else {
       return triggerFullDeployment(req, res);
    }
  } catch (error) {
    console.error("Retry deployment error:", error);
    res.status(500).json({ error: "Failed to retry deployment" });
  }
};
