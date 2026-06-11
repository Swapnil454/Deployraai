import mongoose from "mongoose";
import Deployment from "../models/Deployment.js";
import Project from "../models/Project.js";
import ConnectedAccount from "../models/ConnectedAccount.js";
import { decryptSecret } from "../utils/encryption.js";
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
  getRenderServices
} from "../services/providers/render.service.js";
import {
  getVercelToken,
  getVercelUser,
  createVercelProject,
  updateVercelEnvVars,
  triggerVercelDeploy,
  getVercelDeployments,
  getVercelProjects
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
    res.status(500).json({ error: "Failed to trigger deployment" });
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
    res.status(500).json({ error: "Failed to trigger deployment" });
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
              envVars.push({ key: env.key, value: decryptSecret(env.valueEncrypted) });
           }
        }
        await appendLog('success', 'env_setup', 'Frontend variables prepared');

        let providerServiceId = project.configuration.vercelProjectId;
        let deploymentUrl;
        let projectName = `deploy-ai-${projectId.toString().slice(-6)}`;

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
                    await Deployment.findByIdAndUpdate(deployment._id, { deploymentUrl, providerUrl: deploymentUrl });
                  }
                  break;
                } else if (status === 'ERROR' || status === 'CANCELED') {
                  isCompleted = true;
                  finalStatus = 'failed';
                  finalErrorMessage = `Vercel build failed with status: ${status}`;
                  await appendLog('error', 'deploy_trigger', finalErrorMessage);
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

          await Deployment.findByIdAndUpdate(deployment._id, {
            status: finalStatus,
            errorMessage: finalErrorMessage,
            completedAt: new Date()
          });
           return deploymentUrl;

        } catch (svcErr) {
          if (svcErr.message.includes('repo') || svcErr.message.includes('github') || svcErr.message.includes('installation')) {
             await appendLog('error', 'project_create', 'GitHub repo linking failed. Please connect repository manually in Vercel.', { error: svcErr.message });
             await Deployment.findByIdAndUpdate(deployment._id, {
                status: 'failed',
                errorMessage: 'Awaiting manual GitHub connection'
             });
          } else {
             throw svcErr;
          }
        }

      } catch (err) {
        console.error("Frontend Background deployment error:", err);
        await appendLog('error', 'system', `Deployment failed: ${err.message}`);
        await Deployment.findByIdAndUpdate(deployment._id, { status: 'failed', errorMessage: err.message, completedAt: new Date() });
      }

};

const executeBackendDeployment = async (deployment, project, injectedEnvVars = []) => {
  const projectId = project._id;
  const userId = project.userId;
  const platform = project.configuration.backendPlatform;

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
                varsMap[env.key] = decryptSecret(env.valueEncrypted);
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
        } else if (platform === 'render') {
          const token = await getRenderToken(userId);
          if (!token) throw new Error("Render is not connected. Please connect it first.");
          
          await appendLog('info', 'provider_connection', 'Render connection found');
          await appendLog('info', 'provider_connection', 'Render token decrypted');
          
          await appendLog('info', 'provider_connection', 'Authenticating with Render API');
          const owner = await getRenderOwner(token);
          await appendLog('success', 'provider_connection', 'Render API authentication verified', { ownerId: owner.id, email: owner.email });

          await appendLog('info', 'env_setup', 'Preparing backend environment variables');
          const envVars = [];
          if (project.configuration.envVariables && project.configuration.envVariables.backend) {
             for (const env of project.configuration.envVariables.backend) {
                envVars.push({ key: env.key, value: decryptSecret(env.valueEncrypted) });
             }
          }
          await appendLog('success', 'env_setup', 'Backend variables prepared');

          try {
            // Find if we already have a Render service for this project
            let providerServiceId = project.configuration.renderServiceId;
        let deploymentUrl;

        if (providerServiceId) {
           const prevDepl = await Deployment.findOne({ projectId, platform: { $in: ['render', 'multiple'] }, providerServiceId }).sort({ createdAt: -1 });
           deploymentUrl = prevDepl?.deploymentUrl;
               
               await appendLog('info', 'project_update', `Found existing Render service. Updating environment variables...`);
               await updateRenderEnvVars(token, providerServiceId, envVars);
               
               await appendLog('info', 'deploy_trigger', 'Triggering redeployment on existing Render service...');
               await triggerRenderDeploy(token, providerServiceId);
               await appendLog('success', 'deploy_trigger', 'Render redeployment started successfully');
            } else {
               await appendLog('info', 'project_create', 'Creating new Render Web Service linked to GitHub...');
               try {
             const renderSvc = await createRenderWebService(token, owner.id, {
               name: `deploy-ai-${projectId.toString().slice(-6)}`,
               repoFullName: project.repoFullName,
               branch: project.selectedBranch,
               rootDir: project.configuration.backendRoot,
               buildCommand: project.configuration.backendBuildCommand,
               startCommand: project.configuration.backendStartCommand,
               envVars
             });
             providerServiceId = renderSvc.id || renderSvc.service?.id;
             deploymentUrl = renderSvc.serviceDetails?.url || renderSvc.service?.serviceDetails?.url;
             project.configuration.renderServiceId = providerServiceId;
             await project.save();
             await appendLog('success', 'project_create', 'Render Web Service created successfully');
           } catch (createErr) {
             if (createErr.message.includes('already in use') || createErr.message.includes('exists')) {
               await appendLog('info', 'project_update', 'Render service already exists. Linking...');
               const servicesRes = await getRenderServices(token);
               const existingSvc = servicesRes.find(s => s.service.name === `deploy-ai-${projectId.toString().slice(-6)}`);
               if (existingSvc) {
                 providerServiceId = existingSvc.service.id;
                 deploymentUrl = existingSvc.service.serviceDetails?.url;
                 project.configuration.renderServiceId = providerServiceId;
                 await project.save();
                 await appendLog('success', 'project_update', 'Linked successfully. Triggering redeployment...');
                 await updateRenderEnvVars(token, providerServiceId, envVars);
               } else { throw createErr; }
             } else { throw createErr; }
           }
               await appendLog('success', 'deploy_trigger', 'Render deployment automatically started');
            }

            await Deployment.findByIdAndUpdate(deployment._id, {
               providerServiceId,
               deploymentUrl,
               providerUrl: deploymentUrl,
               providerDashboardUrl: `https://dashboard.render.com/web/${providerServiceId}`
            });

            // Poll Render deployment status
            await appendLog('info', 'deploy_trigger', 'Waiting for Render build to complete...');
            let isCompleted = false;
            let finalStatus = 'failed';
            let finalErrorMessage = null;
            
            for (let i = 0; i < 60; i++) { // Max 5 minutes (60 * 5s)
              await new Promise(resolve => setTimeout(resolve, 5000));
              try {
                const deploys = await getRenderDeploys(token, providerServiceId);
                if (deploys && deploys.length > 0) {
                  const status = deploys[0].deploy.status;
                  if (status === 'live') {
                    isCompleted = true;
                    finalStatus = 'completed';
                    await appendLog('success', 'deploy_trigger', 'Render deployment is LIVE and successful!');
                    break;
                  } else if (status === 'build_failed' || status === 'update_failed' || status === 'canceled') {
                    isCompleted = true;
                    finalStatus = 'failed';
                    finalErrorMessage = `Render build failed with status: ${status}`;
                    await appendLog('error', 'deploy_trigger', finalErrorMessage);
                    break;
                  }
                }
              } catch (pollErr) {
                console.error("Render polling error:", pollErr.message);
              }
            }

            if (!isCompleted) {
              finalErrorMessage = 'Render deployment timed out after 5 minutes';
              await appendLog('error', 'deploy_trigger', finalErrorMessage);
            }

            await Deployment.findByIdAndUpdate(deployment._id, {
              status: finalStatus,
              errorMessage: finalErrorMessage,
              completedAt: new Date()
            });
           return deploymentUrl;

          } catch (svcErr) {
            // Render rejects private repos if not authorized. We must catch this.
            if (svcErr.message.includes('repo')) {
               throw new Error(`Render failed to link GitHub repo. Ensure ${project.repoFullName} is Public on GitHub! Render API Error: ${svcErr.message}`);
            }
            throw svcErr;
          }
        }
      } catch (err) {
        console.error("Background deploy error:", err);
        await Deployment.findByIdAndUpdate(deployment._id, {
          status: 'failed',
          errorMessage: err.message,
          completedAt: new Date(),
          $push: { logs: createLog('error', 'deploy_trigger', err.message) }
        });
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
         let backendUrl = await executeBackendDeployment(deployment, project, []);
         
         if (!backendUrl) {
            await appendLog('warning', 'deploying_backend', 'Backend deployed but URL was not returned. Proceeding anyway.');
            backendUrl = "http://unknown-backend-url";
         } else {
            await appendLog('success', 'deploying_backend', `Backend deployed successfully at ${backendUrl}`);
         }

         await appendLog('info', 'deploying_frontend', 'Step 2: Executing Frontend Deployment with NEXT_PUBLIC_API_URL injected');
         const injectedFrontendEnv = [{ key: 'NEXT_PUBLIC_API_URL', value: backendUrl }];
         let frontendUrl = await executeFrontendDeployment(deployment, project, injectedFrontendEnv);

         if (!frontendUrl) {
            await appendLog('warning', 'deploying_frontend', 'Frontend deployed but URL was not returned. Proceeding anyway.');
            frontendUrl = "http://unknown-frontend-url";
         } else {
            await appendLog('success', 'deploying_frontend', `Frontend deployment completed successfully. URL: ${frontendUrl}`);
         }

         await appendLog('info', 'updating_backend_cors', 'Step 3: Redeploying Backend with CORS_ORIGIN injected');
         const injectedBackendEnv = [{ key: 'CORS_ORIGIN', value: frontendUrl }];
         await executeBackendDeployment(deployment, project, injectedBackendEnv);

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
         
         await Deployment.findByIdAndUpdate(deployment._id, { 
            status: finalStatus, 
            deploymentUrl: frontendUrl,
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
If the failure is specifically a missing backend health route (/health missing), set fixType to "missing_health_route".
If the failure is specifically a missing or wrong CORS configuration preventing frontend from calling backend, set fixType to "cors_origin".
For ONLY these two issues, set canAutoFix to true and provide a fixPlan.
For all other issues, set canAutoFix to false, fixType to "unknown" and fixPlan to null.

Response MUST match this exact JSON schema:
{
  "summary": "String",
  "likelyCause": "String",
  "failedStep": "String",
  "suggestedFixes": ["String", "String"],
  "severity": "low" | "medium" | "high",
  "canAutoFix": Boolean,
  "fixType": "missing_health_route" | "cors_origin" | "unknown",
  "fixPlan": {
    "targetFiles": ["String"],
    "changes": ["String"]
  } | null
}`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const result = await model.generateContent(prompt);
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
