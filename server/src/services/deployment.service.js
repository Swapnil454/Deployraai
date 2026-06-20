import { triggerBackendDeployment, triggerFrontendDeployment } from "../controllers/deployment.controller.js";
import Deployment from "../models/Deployment.js";
import Project from "../models/Project.js";

/**
 * Triggers a backend deployment programmatically.
 */
export const triggerBackendService = async (projectId, userId, triggerReason = "manual", orchestrationGroupId = undefined) => {
  try {
    let deploymentId = null;
    const reqMock = { 
      params: { projectId: projectId.toString() }, 
      user: { userId: userId.toString() }, 
      body: { triggerReason, orchestrationGroupId } 
    };
    const resMock = { 
      status: () => resMock, 
      json: (data) => { if (data.deploymentId) deploymentId = data.deploymentId; } 
    };

    await triggerBackendDeployment(reqMock, resMock);

    if (!deploymentId) return null;
    
    const dep = await Deployment.findById(deploymentId);
    if (!dep) return null;

    return { 
      id: dep._id, 
      type: dep.type, 
      status: dep.status, 
      triggerReason: dep.triggerReason 
    };
  } catch (error) {
    console.error("Failed to trigger backend service deployment:", error);
    return null;
  }
};

/**
 * Triggers a frontend deployment programmatically.
 */
export const triggerFrontendService = async (projectId, userId, triggerReason = "manual", existingDeploymentId = null, orchestrationGroupId = undefined) => {
  try {
    let deploymentId = null;
    const reqMock = { 
      params: { projectId: projectId.toString() }, 
      user: { userId: userId.toString() }, 
      body: { triggerReason, existingDeploymentId, orchestrationGroupId } 
    };
    const resMock = { 
      status: () => resMock, 
      json: (data) => { if (data.deploymentId) deploymentId = data.deploymentId; } 
    };

    await triggerFrontendDeployment(reqMock, resMock);

    if (!deploymentId) return null;
    
    const dep = await Deployment.findById(deploymentId);
    if (!dep) return null;

    return { 
      id: dep._id, 
      type: dep.type, 
      status: dep.status, 
      triggerReason: dep.triggerReason 
    };
  } catch (error) {
    console.error("Failed to trigger frontend service deployment:", error);
    return null;
  }
};

/**
 * Creates a queued frontend deployment that waits for the backend deployment to finish
 * before executing its build. Useful for Make Primary orchestration.
 */
export const createQueuedFrontendDeployment = async (projectId, userId, triggerReason = "manual", orchestrationGroupId = undefined) => {
  try {
    const project = await Project.findById(projectId);
    if (!project) return null;
    
    const deployment = await Deployment.create({
      userId,
      projectId,
      type: 'frontend',
      serviceName: 'frontend',
      platform: project.configuration.frontendPlatform || 'vercel',
      status: 'queued',
      triggerReason,
      orchestrationGroupId,
      source: { repoFullName: project.repoFullName, branch: project.selectedBranch, rootDirectory: project.configuration.frontendRoot }
    });

    return {
      id: deployment._id,
      type: deployment.type,
      status: deployment.status,
      triggerReason: deployment.triggerReason
    };
  } catch (err) {
    console.error("Failed to create queued frontend deployment:", err);
    return null;
  }
};
