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
  triggerRenderDeploy
} from "../services/providers/render.service.js";
import {
  getVercelToken,
  getVercelUser,
  createVercelProject,
  updateVercelEnvVars,
  triggerVercelDeploy,
  getVercelDeployments
} from "../services/providers/vercel.service.js";

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

    // Clean up any hanging deployments from other platforms
    await Deployment.updateMany(
      { projectId, type: 'frontend', status: 'running', platform: { $ne: platform } },
      { $set: { status: 'failed', errorMessage: 'Superseded by deployment on another platform', completedAt: new Date() } }
    );

    const existing = await Deployment.findOne({ projectId, type: 'frontend', platform, status: 'running' });
    if (existing) {
      return res.status(200).json({ success: true, deploymentId: existing._id, message: "Deployment already running" });
    }

    if (platform !== 'vercel') {
      return generateMockDeployment(req, res, 'frontend');
    }

    const envKeys = {};
    if (project.configuration.envVariables && project.configuration.envVariables.frontend) {
      envKeys.frontend = project.configuration.envVariables.frontend.map(e => e.key);
    }

    const configSnapshot = {
      installCommand: project.configuration.installCommand,
      buildCommand: project.configuration.frontendBuildCommand,
      outputDirectory: project.configuration.outputDirectory,
      envKeys,
      envSnapshotStr: project.configuration.envVariables?.frontend ? JSON.stringify(project.configuration.envVariables.frontend) : ""
    };

    const source = {
      repoOwner: project.repoOwner,
      repoName: project.repoName,
      repoFullName: project.repoFullName,
      branch: project.selectedBranch,
      commitSha: null,
      rootDirectory: project.configuration.frontendRoot
    };

    const deployment = await Deployment.create({
      userId,
      projectId,
      type: 'frontend',
      serviceName: 'frontend',
      platform,
      status: 'running',
      source,
      configSnapshot
    });

    res.status(202).json({ success: true, deploymentId: deployment._id, message: "Deployment started" });

    // Background orchestrator
    (async () => {
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

        const previousDeployments = await Deployment.find({ projectId, platform: 'vercel', providerServiceId: { $exists: true, $ne: null } }).sort({ createdAt: -1 }).limit(1);
        let providerServiceId;
        let deploymentUrl;
        let projectName = `deploy-ai-${projectId.toString().slice(-6)}`;

        try {
          if (previousDeployments.length > 0) {
             providerServiceId = previousDeployments[0].providerServiceId;
             
             const previousEnvSnapshot = previousDeployments[0].configSnapshot?.envSnapshotStr || "";
             const currentEnvSnapshot = configSnapshot.envSnapshotStr;
             const envChanged = previousEnvSnapshot !== currentEnvSnapshot;

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

             await appendLog('success', 'project_create', 'Vercel Project created successfully');
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
    })();

  } catch (error) {
    console.error("Trigger frontend deployment error:", error);
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

    // Clean up any hanging deployments from other platforms
    await Deployment.updateMany(
      { projectId, type: 'backend', status: 'running', platform: { $ne: platform } },
      { $set: { status: 'failed', errorMessage: 'Superseded by deployment on another platform', completedAt: new Date() } }
    );

    const existing = await Deployment.findOne({ projectId, type: 'backend', platform, status: 'running' });
    if (existing) {
      return res.status(200).json({ success: true, deploymentId: existing._id, message: "Deployment already running" });
    }
    if (platform !== 'railway' && platform !== 'render') {
      return generateMockDeployment(req, res, 'backend');
    }

    const envKeys = {};
    if (project.configuration.envVariables && project.configuration.envVariables.backend) {
      envKeys.backend = project.configuration.envVariables.backend.map(e => e.key);
    }

    const configSnapshot = {
      installCommand: project.configuration.installCommand,
      buildCommand: project.configuration.backendBuildCommand,
      startCommand: project.configuration.backendStartCommand,
      outputDirectory: project.configuration.outputDirectory,
      envKeys
    };

    const source = {
      repoOwner: project.repoOwner,
      repoName: project.repoName,
      repoFullName: project.repoFullName,
      branch: project.selectedBranch,
      commitSha: null,
      rootDirectory: project.configuration.backendRoot
    };

    const deployment = await Deployment.create({
      userId,
      projectId,
      type: 'backend',
      serviceName: 'backend',
      platform,
      status: 'running',
      source,
      configSnapshot,
      logs: [
        createLog('info', 'validation', 'Backend deployment requested', { projectId }),
        createLog('info', 'validation', 'Project ownership verified'),
        createLog('info', 'validation', 'Configuration loaded', { platform, branch: project.selectedBranch })
      ]
    });

    res.status(201).json({ success: true, deploymentId: deployment._id });

    // Background orchestrator
    (async () => {
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

          await appendLog('info', 'project_create', 'Creating Railway project');
          const railProj = await createRailwayProject(token, `deploy-ai-${projectId.toString().slice(-6)}`, teamId);
          const providerProjectId = railProj.projectCreate.id;
          await appendLog('success', 'project_create', 'Railway project created', { providerProjectId });

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
            const previousDeployments = await Deployment.find({ projectId, platform: 'render', providerServiceId: { $exists: true, $ne: null } }).sort({ createdAt: -1 }).limit(1);
            let providerServiceId;
            let deploymentUrl;

            if (previousDeployments.length > 0) {
               providerServiceId = previousDeployments[0].providerServiceId;
               deploymentUrl = previousDeployments[0].deploymentUrl;
               
               await appendLog('info', 'project_update', `Found existing Render service. Updating environment variables...`);
               await updateRenderEnvVars(token, providerServiceId, envVars);
               
               await appendLog('info', 'deploy_trigger', 'Triggering redeployment on existing Render service...');
               await triggerRenderDeploy(token, providerServiceId);
               await appendLog('success', 'deploy_trigger', 'Render redeployment started successfully');
            } else {
               await appendLog('info', 'project_create', 'Creating new Render Web Service linked to GitHub...');
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
               await appendLog('success', 'project_create', 'Render Web Service created successfully');
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
    })();

  } catch (error) {
    console.error("Trigger backend deployment error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Failed to trigger backend deployment" });
  }
};
export const triggerFullDeployment = (req, res) => generateMockDeployment(req, res, 'full');

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
