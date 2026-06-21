import mongoose from "mongoose";
import Deployment from "../models/Deployment.js";
import DomainSetup from "../models/DomainSetup.js";
import Project from "../models/Project.js";
import ConnectedAccount from "../models/ConnectedAccount.js";
import { decryptSecret, encryptSecret } from "../utils/encryption.js";
import User from "../models/User.js";
import { captureDeploymentScreenshot } from "../services/screenshot.service.js";
import { triggerWorkflow } from "../services/workflow.service.js";
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
  getRenderDeployStatus,
  updateRenderEnvVars,
  triggerRenderDeploy,
  getRenderServices,
  getRenderService
} from "../services/providers/render.service.js";
import { createDefaultMonitors } from '../services/monitoring.service.js';
import { trackAiUsage } from '../utils/aiTracker.js';
import {
  getVercelToken,
  getVercelUser,
  createVercelProject,
  updateVercelEnvVars,
  triggerVercelDeploy,
  getVercelDeployments,
  getVercelProjects,
  getVercelProject,
  getVercelDeploymentEvents,
  updateVercelProject
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
      { projectId, retryOfDeploymentId: req.body?.retryOfDeploymentId || undefined, type: 'frontend', status: 'running' },
      { $set: { status: 'failed', errorMessage: 'Superseded', completedAt: new Date() } }
    );

    const frontendPrimary = await DomainSetup.findOne({ projectId, targetService: 'frontend', isPrimary: true, status: 'active' });
    const backendPrimary = await DomainSetup.findOne({ projectId, targetService: 'backend', isPrimary: true, status: 'active' });
    const allFrontendDomains = await DomainSetup.find({ projectId, targetService: 'frontend', status: 'active' });

    const corsOrigins = [...new Set(allFrontendDomains.map(d => `https://${d.frontendDomain || d.rootDomain}`))].map(o => o.trim()).filter(Boolean);
    const domainSnapshot = {
      frontendPrimaryDomain: frontendPrimary ? (frontendPrimary.frontendDomain || frontendPrimary.rootDomain) : undefined,
      backendPrimaryDomain: backendPrimary ? (backendPrimary.backendDomain || backendPrimary.rootDomain) : undefined,
      corsOrigins,
      apiUrl: backendPrimary ? `https://${backendPrimary.backendDomain || backendPrimary.rootDomain}` : undefined
    };

    let deployment = await Deployment.create({
      userId, projectId, type: 'frontend', serviceName: 'frontend', platform, status: 'queued',
      triggerReason: req.body?.triggerReason || 'manual', orchestrationGroupId: req.body?.orchestrationGroupId || undefined,
      domainSnapshot, source: { repoFullName: project.repoFullName, branch: project.selectedBranch, rootDirectory: project.configuration.frontendRoot },
      logs: [createLog('info', 'validation', 'Frontend deployment requested')]
    });

    triggerWorkflow(projectId, 'project-deployment-pipeline', {
      userId, projectId, target: 'frontend', existingFrontendDeploymentId: deployment._id.toString(),
      triggerReason: req.body?.triggerReason || 'manual', orchestrationGroupId: req.body?.orchestrationGroupId
    }).catch(err => console.error("Frontend workflow failed:", err));

    res.status(202).json({
      success: true, message: "Deployment workflow started.", workflowRunId: null,
      deploymentId: deployment._id, // <<<< FIX
      deployments: [{ id: deployment._id, type: "frontend", status: "queued" }]
    });

  } catch (error) {
    console.error(`Trigger frontend deployment error:`, error);
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
      { projectId, retryOfDeploymentId: req.body?.retryOfDeploymentId || undefined, type: 'backend', status: 'running' },
      { $set: { status: 'failed', errorMessage: 'Superseded', completedAt: new Date() } }
    );

    const frontendPrimary = await DomainSetup.findOne({ projectId, targetService: 'frontend', isPrimary: true, status: 'active' });
    const backendPrimary = await DomainSetup.findOne({ projectId, targetService: 'backend', isPrimary: true, status: 'active' });
    const allFrontendDomains = await DomainSetup.find({ projectId, targetService: 'frontend', status: 'active', domainRole: { $in: ['primary', 'alias'] } });

    const corsOrigins = [...new Set(allFrontendDomains.map(d => `https://${d.frontendDomain || d.rootDomain}`))].map(o => o.trim()).filter(Boolean);
    const domainSnapshot = {
      frontendPrimaryDomain: frontendPrimary ? (frontendPrimary.frontendDomain || frontendPrimary.rootDomain) : undefined,
      backendPrimaryDomain: backendPrimary ? (backendPrimary.backendDomain || backendPrimary.rootDomain) : undefined,
      corsOrigins,
      apiUrl: backendPrimary ? `https://${backendPrimary.backendDomain || backendPrimary.rootDomain}` : undefined
    };

    let deployment = await Deployment.create({
      userId, projectId, type: 'backend', serviceName: 'backend', platform, status: 'queued',
      triggerReason: req.body?.triggerReason || 'manual', orchestrationGroupId: req.body?.orchestrationGroupId || undefined,
      domainSnapshot, source: { repoFullName: project.repoFullName, branch: project.selectedBranch, rootDirectory: project.configuration.backendRoot },
      logs: [createLog('info', 'validation', 'Backend deployment requested')]
    });

    triggerWorkflow(projectId, 'project-deployment-pipeline', {
      userId, projectId, target: 'backend', existingBackendDeploymentId: deployment._id.toString(),
      triggerReason: req.body?.triggerReason || 'manual', orchestrationGroupId: req.body?.orchestrationGroupId
    }).catch(err => console.error("Backend workflow failed:", err));

    res.status(202).json({
      success: true, message: "Deployment workflow started.", workflowRunId: null,
      deploymentId: deployment._id, // <<<< FIX
      deployments: [{ id: deployment._id, type: "backend", status: "queued" }]
    });

  } catch (error) {
    console.error(`Trigger backend deployment error:`, error);
    res.status(500).json({ error: "Failed to trigger deployment", details: error.message });
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
      { projectId, retryOfDeploymentId: req.body?.retryOfDeploymentId || undefined, type: { $in: ['frontend', 'backend', 'full'] }, status: 'running' },
      { $set: { status: 'failed', errorMessage: 'Superseded by new full deployment', completedAt: new Date() } }
    );

    const frontendPrimary = await DomainSetup.findOne({ projectId, targetService: 'frontend', isPrimary: true, status: 'active' });
    const backendPrimary = await DomainSetup.findOne({ projectId, targetService: 'backend', isPrimary: true, status: 'active' });
    const allFrontendDomains = await DomainSetup.find({ projectId, targetService: 'frontend', status: 'active' });

    const corsOrigins = [...new Set(allFrontendDomains.map(d => `https://${d.frontendDomain || d.rootDomain}`))].map(o => o.trim()).filter(Boolean);
    const domainSnapshot = {
      frontendPrimaryDomain: frontendPrimary ? (frontendPrimary.frontendDomain || frontendPrimary.rootDomain) : undefined,
      backendPrimaryDomain: backendPrimary ? (backendPrimary.backendDomain || backendPrimary.rootDomain) : undefined,
      corsOrigins, apiUrl: backendPrimary ? `https://${backendPrimary.backendDomain || backendPrimary.rootDomain}` : undefined
    };

    const orchestrationGroupId = req.body?.orchestrationGroupId || `full-${Date.now()}`;

    const fullDeploy = await Deployment.create({
      userId, projectId, type: 'full', serviceName: 'Full Stack', platform: 'multiple', status: 'queued',
      triggerReason: req.body?.triggerReason || 'manual', orchestrationGroupId, domainSnapshot,
      source: { repoFullName: project.repoFullName, branch: project.selectedBranch, rootDirectory: 'multiple' },
      logs: [
        createLog('info', 'validation', 'Full-stack deployment pipeline initialized'),
        createLog('info', 'validation', 'Backend deployment requested as part of full-stack deploy'),
        createLog('info', 'validation', 'Frontend deployment requested as part of full-stack deploy')
      ]
    });

    const backendDeploy = await Deployment.create({
      userId, projectId, type: 'backend', serviceName: 'backend', platform: project.configuration.backendPlatform, status: 'queued',
      triggerReason: req.body?.triggerReason || 'manual', orchestrationGroupId, domainSnapshot,
      source: { repoFullName: project.repoFullName, branch: project.selectedBranch, rootDirectory: project.configuration.backendRoot },
      logs: [createLog('info', 'validation', 'Backend deployment requested as part of full-stack deploy')]
    });

    const frontendDeploy = await Deployment.create({
      userId, projectId, type: 'frontend', serviceName: 'frontend', platform: project.configuration.frontendPlatform, status: 'queued',
      triggerReason: req.body?.triggerReason || 'manual', orchestrationGroupId, domainSnapshot,
      source: { repoFullName: project.repoFullName, branch: project.selectedBranch, rootDirectory: project.configuration.frontendRoot },
      logs: [createLog('info', 'validation', 'Frontend deployment requested as part of full-stack deploy')]
    });

    triggerWorkflow(projectId, 'project-deployment-pipeline', {
      userId, projectId, target: 'fullstack', 
      existingBackendDeploymentId: backendDeploy._id.toString(),
      existingFrontendDeploymentId: frontendDeploy._id.toString(),
      existingFullDeploymentId: fullDeploy._id.toString(),
      triggerReason: req.body?.triggerReason || 'manual', orchestrationGroupId
    }).catch(err => console.error("Fullstack workflow failed:", err));

    res.status(202).json({
      success: true, message: "Fullstack deployment started.", workflowRunId: null, orchestrationGroupId,
      deploymentId: fullDeploy._id, // Focus on the full stack tracker in the UI
      deployments: [
        { id: fullDeploy._id, type: "full", status: "queued" },
        { id: backendDeploy._id, type: "backend", status: "queued" },
        { id: frontendDeploy._id, type: "frontend", status: "queued" }
      ]
    });

  } catch (error) {
    console.error(`Trigger full deployment error:`, error);
    res.status(500).json({ error: "Failed to trigger deployment", details: error.message });
  }
};

export const getDeployment = async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const deployment = await Deployment.findById(deploymentId).populate('projectId', 'repoName repoFullName');
    
    if (!deployment) return res.status(404).json({ error: "Deployment not found" });
    if (deployment.userId.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    const deploymentObj = deployment.toObject();
    
    // Find the absolute latest successful deployments by type for this project
    const latestTypes = await Deployment.aggregate([
        { $match: { projectId: deployment.projectId._id, 'source.branch': { $in: ['main', 'master'] }, status: { $in: ['success', 'completed'] } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$type", latestDate: { $first: "$createdAt" } } }
    ]);
    const latestMap = {};
    for (const lt of latestTypes) latestMap[lt._id] = lt.latestDate;
    
    const latestFull = latestMap['full'] || new Date(0);
    const latestFront = latestMap['frontend'] || new Date(0);
    const latestBack = latestMap['backend'] || new Date(0);

    const absoluteLatestFrontend = latestFull > latestFront ? latestFull : latestFront;
    const absoluteLatestBackend = latestFull > latestBack ? latestFull : latestBack;

    deploymentObj.isLatestFrontend = false;
    deploymentObj.isLatestBackend = false;

    if (deployment.status === 'success' || deployment.status === 'completed') {
        if (deployment.type === 'full') {
            if (deployment.createdAt >= absoluteLatestFrontend) deploymentObj.isLatestFrontend = true;
            if (deployment.createdAt >= absoluteLatestBackend) deploymentObj.isLatestBackend = true;
        } else if (deployment.type === 'frontend') {
            if (deployment.createdAt >= absoluteLatestFrontend) deploymentObj.isLatestFrontend = true;
        } else if (deployment.type === 'backend') {
            if (deployment.createdAt >= absoluteLatestBackend) deploymentObj.isLatestBackend = true;
        }
    }

    if (deployment.type === 'full') {
        deploymentObj.isLatest = deploymentObj.isLatestFrontend && deploymentObj.isLatestBackend;
    } else if (deployment.type === 'frontend') {
        deploymentObj.isLatest = deploymentObj.isLatestFrontend;
    } else if (deployment.type === 'backend') {
        deploymentObj.isLatest = deploymentObj.isLatestBackend;
    }

    // Fetch custom domains assigned to this project
    const DomainSetup = (await import('../models/DomainSetup.js')).default;
    const domainSetups = await DomainSetup.find({ projectId: deployment.projectId._id, status: { $in: ['active', 'partially_active', 'pending_dns', 'verifying'] } });
    
    deploymentObj.customDomains = [];
    domainSetups.forEach(ds => {
       if (ds.frontendDomain) deploymentObj.customDomains.push({ type: 'frontend', url: `https://${ds.frontendDomain}`, status: ds.frontendVerification });
       if (ds.wwwDomain) deploymentObj.customDomains.push({ type: 'www', url: `https://${ds.wwwDomain}`, status: ds.frontendVerification });
       if (ds.backendDomain) deploymentObj.customDomains.push({ type: 'backend', url: `https://${ds.backendDomain}`, status: ds.backendVerification });
    });

    res.json(deploymentObj);
  } catch (error) {
    console.error("Get deployment error:", error);
    res.status(500).json({ error: "Failed to fetch deployment" });
  }
};

export const getUserDeployments = async (req, res) => {
  try {
    const { type, projectId, environment, branch, status, days, startDate, endDate, author } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 0; // 0 means no limit if not specified to maintain backward compatibility, or we can default to 20 if passed. Wait, if I default to 20, it breaks other pages that expect all deployments.
    // Actually, I'll only apply pagination if limit is provided.
    
    let query = { userId: req.user.userId };

    query.$and = [
      {
        $or: [
          { type: 'full' },
          { orchestrationGroupId: { $exists: false } },
          { orchestrationGroupId: null }
        ]
      }
    ];

    if (type && type !== 'all') {
       query.type = type;
    }

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

    if (author && author !== 'all') {
      query.$and.push({
        $or: [
          { 'source.repoOwner': { $regex: new RegExp(`^${author}$`, 'i') } },
          { 'source.repoFullName': { $regex: new RegExp(`^${author}/`, 'i') } },
        ]
      });
    }

    if (status && status !== 'all') {
      const statusesArray = status.split(',');
      const mappedStatuses = statusesArray.flatMap(s => {
        if (s === 'ready') return ['success', 'completed'];
        if (s === 'building') return ['running'];
        if (s === 'error') return ['failed'];
        return [s];
      });
      query.status = { $in: mappedStatuses };
    }

    if (startDate && endDate) {
      query.createdAt = { 
        $gte: new Date(startDate), 
        $lte: new Date(endDate) 
      };
    } else if (days && days !== 'all') {
      const d = parseInt(days, 10);
      if (!isNaN(d)) {
        query.createdAt = { $gte: new Date(Date.now() - d * 24 * 60 * 60 * 1000) };
      }
    }

    let queryChain = Deployment.find(query)
      .populate('projectId', 'repoName repoFullName')
      .sort({ createdAt: -1 });

    if (limit > 0) {
      const skip = (page - 1) * limit;
      queryChain = queryChain.skip(skip).limit(limit + 1);
    }

    const deploymentsRaw = await queryChain;
    
    let hasMore = false;
    let deployments = deploymentsRaw;
    if (limit > 0 && deploymentsRaw.length > limit) {
      hasMore = true;
      deployments = deploymentsRaw.slice(0, limit);
    }

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

    // Find the latest production deployments by type for each project to calculate isLatestProd accurately
    const projectIds = [...new Set(enriched.map(d => d.projectId?._id?.toString()).filter(Boolean))];
    const latestByType = await Deployment.aggregate([
      { 
        $match: { 
          projectId: { $in: projectIds.map(id => new mongoose.Types.ObjectId(id)) }, 
          'source.branch': { $in: ['main', 'master'] }, 
          status: { $in: ['success', 'completed'] } 
        } 
      },
      { $sort: { createdAt: -1 } },
      { 
        $group: { 
          _id: { projectId: "$projectId", type: "$type" }, 
          latestDate: { $first: "$createdAt" },
          latestId: { $first: "$_id" }
        } 
      }
    ]);

    const latestMap = {};
    for (const item of latestByType) {
      const pId = item._id.projectId.toString();
      const type = item._id.type;
      if (!latestMap[pId]) latestMap[pId] = {};
      latestMap[pId][type] = { date: item.latestDate, id: item.latestId.toString() };
    }

    const finalDeployments = enriched.map(dep => {
      const pId = dep.projectId?._id?.toString();
      const isProd = dep.source?.branch === 'main' || dep.source?.branch === 'master';
      const isSuccess = dep.status === 'success' || dep.status === 'completed';
      
      dep.isLatestProd = false;
      dep.isLatestFrontend = false;
      dep.isLatestBackend = false;
      dep.supersededAt = null;

      if (isProd && isSuccess && pId && latestMap[pId]) {
         const lm = latestMap[pId];
         const latestFull = lm['full']?.date || new Date(0);
         const latestFront = lm['frontend']?.date || new Date(0);
         const latestBack = lm['backend']?.date || new Date(0);

         const absoluteLatestFrontend = latestFull > latestFront ? latestFull : latestFront;
         const absoluteLatestBackend = latestFull > latestBack ? latestFull : latestBack;

         if (dep.type === 'full') {
             if (dep.createdAt >= absoluteLatestFrontend) dep.isLatestFrontend = true;
             if (dep.createdAt >= absoluteLatestBackend) dep.isLatestBackend = true;
         } else if (dep.type === 'frontend') {
             if (dep.createdAt >= absoluteLatestFrontend) dep.isLatestFrontend = true;
         } else if (dep.type === 'backend') {
             if (dep.createdAt >= absoluteLatestBackend) dep.isLatestBackend = true;
         }

         if (dep.type === 'full') {
             dep.isLatestProd = dep.isLatestFrontend && dep.isLatestBackend;
         } else if (dep.type === 'frontend') {
             dep.isLatestProd = dep.isLatestFrontend;
         } else if (dep.type === 'backend') {
             dep.isLatestProd = dep.isLatestBackend;
         }

         // Calculate supersededAt
         if (!dep.isLatestProd) {
             if (dep.type === 'full') {
                 if (!dep.isLatestFrontend && !dep.isLatestBackend) {
                     dep.supersededAt = absoluteLatestFrontend > absoluteLatestBackend ? absoluteLatestFrontend : absoluteLatestBackend;
                 } else if (!dep.isLatestFrontend) {
                     dep.supersededAt = absoluteLatestFrontend;
                 } else if (!dep.isLatestBackend) {
                     dep.supersededAt = absoluteLatestBackend;
                 }
             } else if (dep.type === 'frontend') {
                 dep.supersededAt = absoluteLatestFrontend;
             } else if (dep.type === 'backend') {
                 dep.supersededAt = absoluteLatestBackend;
             }
         }
      }
      return dep;
    });

    if (limit > 0) {
      res.setHeader('X-Has-More', hasMore ? 'true' : 'false');
      // Expose header so the frontend can read it if CORS is enabled
      res.setHeader('Access-Control-Expose-Headers', 'X-Has-More');
    }

    res.json(finalDeployments);
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

    const deployments = await Deployment.find({ 
      projectId,
      $or: [
        { type: 'full' },
        { orchestrationGroupId: { $exists: false } },
        { orchestrationGroupId: null }
      ]
    }).sort({ createdAt: -1 });
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
      const fallbackModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
      for (const modelName of fallbackModels) {
        const currentModel = genAI.getGenerativeModel({ model: modelName });
        for (let i = 0; i < 2; i++) {
          try {
            return await currentModel.generateContent(promptText);
          } catch (err) {
            if (err.status === 503 || err.status === 429) {
              console.log(`[AI Analysis] API error ${err.status} with ${modelName}, retrying in ${(i + 1) * 2} seconds...`);
              await new Promise(res => setTimeout(res, (i + 1) * 2000));
            } else {
              throw err;
            }
          }
        }
      }
      throw new Error("All Gemini models exhausted or failed with 503/429");
    };

    const result = await generateWithRetry(prompt);
    
    await trackAiUsage(req.user.userId, deployment.projectId, 'deployment_analysis');

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

export const deleteDeployment = async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const deployment = await Deployment.findById(deploymentId);
    
    if (!deployment) return res.status(404).json({ error: "Deployment not found" });
    if (deployment.userId.toString() !== req.user.userId.toString()) return res.status(403).json({ error: "Access denied" });

    // Cancel / Delete from Vercel if applicable
    if (deployment.platform === 'vercel' && deployment.providerDeploymentId) {
      try {
        const { getVercelToken, deleteVercelDeployment } = await import('../services/providers/vercel.service.js');
        const token = await getVercelToken(req.user.userId);
        if (token) {
          await deleteVercelDeployment(token, deployment.providerDeploymentId);
        }
      } catch (err) {
        console.error("Vercel delete error:", err.message);
      }
    }

    await Deployment.findByIdAndDelete(deploymentId);
    res.json({ success: true, message: "Deployment deleted successfully" });
  } catch (error) {
    console.error("Delete deployment error:", error);
    res.status(500).json({ error: "Failed to delete deployment" });
  }
};

export const rollbackDeployment = async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const oldDeployment = await Deployment.findById(deploymentId).populate('projectId');
    
    if (!oldDeployment) return res.status(404).json({ error: "Deployment not found" });
    if (oldDeployment.userId.toString() !== req.user.userId.toString()) return res.status(403).json({ error: "Access denied" });
    
    if (oldDeployment.platform === 'vercel') {
      if (!oldDeployment.providerDeploymentId) {
        return res.status(400).json({ error: "Cannot rollback: the Vercel deployment ID is missing from our records for this deployment." });
      }

      try {
        const { getVercelToken, rollbackVercelDeployment, promoteVercelDeployment, getVercelProject, assignVercelAlias } = await import('../services/providers/vercel.service.js');
        const token = await getVercelToken(req.user.userId);
        const vercelProjectId = oldDeployment.projectId?.configuration?.vercelProjectId;
        
        if (token && vercelProjectId) {
          let rollbackRes;
          let isPromote = false;
          let isAlias = false;
          
          try {
             rollbackRes = await rollbackVercelDeployment(token, vercelProjectId, oldDeployment.providerDeploymentId);
          } catch (vercelErr) {
             console.log("Vercel Rollback API failed:", vercelErr.message);
             try {
                 console.log("Attempting PROMOTE API fallback...");
                 // Send empty object as payload just in case Vercel requires it
                 rollbackRes = await promoteVercelDeployment(token, vercelProjectId, oldDeployment.providerDeploymentId);
                 isPromote = true;
             } catch (promoteErr) {
                 console.log("Vercel Promote API failed:", promoteErr.message);
                 console.log("Attempting ALIAS assignment fallback...");
                 
                 // If both Rollback and Promote fail, manually assign the production aliases to this deployment
                 const projectData = await getVercelProject(token, vercelProjectId);
                 if (projectData && projectData.targets && projectData.targets.production && projectData.targets.production.alias) {
                    const aliases = projectData.targets.production.alias;
                    let successCount = 0;
                    for (const alias of aliases) {
                       try {
                           await assignVercelAlias(token, oldDeployment.providerDeploymentId, alias);
                           successCount++;
                       } catch (aliasErr) {
                           if (aliasErr.message && aliasErr.message.includes('already associated with this deployment')) {
                               console.log(`Alias ${alias} is already associated with this deployment. Skipping.`);
                               successCount++;
                           } else {
                               throw aliasErr;
                           }
                       }
                    }
                    if (successCount === 0) {
                        throw new Error("Failed to assign any production aliases to this deployment.");
                    }
                    rollbackRes = { url: aliases[0] };
                    isAlias = true;
                 } else {
                    throw new Error("Could not fallback to Aliasing because no production domains were found on Vercel.");
                 }
             }
          }
          
          let actionText = "Rolled back";
          if (isPromote) actionText = "Promoted preview";
          if (isAlias) actionText = "Aliased domain";

          const newDeployment = await Deployment.create({
            userId: req.user.userId,
            projectId: oldDeployment.projectId._id,
            type: oldDeployment.type,
            serviceName: oldDeployment.serviceName,
            platform: oldDeployment.platform,
            status: 'success',
            source: oldDeployment.source,
            providerDeploymentId: rollbackRes.id || oldDeployment.providerDeploymentId,
            providerUrl: rollbackRes.url || oldDeployment.providerUrl,
            deploymentUrl: oldDeployment.deploymentUrl,
            finalSummary: {
               ...oldDeployment.finalSummary,
               message: `Instantly ${actionText} to Production`,
               screenshotUrl: oldDeployment.finalSummary?.screenshotUrl
            },
            logs: [{
               level: "info", step: "rollback", message: `${actionText} to ${oldDeployment.providerDeploymentId}`, timestamp: new Date()
            }]
          });

          return res.json({ success: true, deploymentId: newDeployment._id });
        } else {
           return res.status(400).json({ error: "Vercel configuration missing" });
        }
      } catch (err) {
        console.error("Vercel rollback error:", err.message);
        return res.status(500).json({ error: `Vercel API failed to rollback: ${err.message}` });
      }
    } else {
       return res.status(400).json({ error: "Instant rollback is only supported for Vercel at this time" });
    }
  } catch (error) {
    console.error("Rollback deployment error:", error);
    res.status(500).json({ error: "Failed to rollback deployment" });
  }
};
