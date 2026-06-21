import { defineWorkflow } from '../services/workflow.service.js';
import Deployment from '../models/Deployment.js';
import Project from '../models/Project.js';
import { 
  startBackendProviderDeployment, 
  checkBackendProviderStatus,
  startFrontendProviderDeployment,
  checkFrontendProviderStatus,
  appendLog
} from '../services/deploymentProvider.service.js';
import { captureDeploymentScreenshot } from '../services/screenshot.service.js';

export default defineWorkflow("project-deployment-pipeline", 1, async ({ payload, step, sleep }) => {
  const {
    userId,
    projectId,
    target, // 'frontend' | 'backend' | 'fullstack'
    injectedEnvVars = [],
    existingBackendDeploymentId,
    existingFrontendDeploymentId
  } = payload;

  // 1. resolve_project_context
  const context = await step.run("resolve_project_context_v1", async () => {
    const project = await Project.findById(projectId);
    if (!project) throw new Error("Project not found");
    
    if (target === 'fullstack' && payload.existingFullDeploymentId) {
      await Deployment.findByIdAndUpdate(payload.existingFullDeploymentId, { status: 'running' });
    }

    return { project: project.toObject() };
  });

  const project = context.project;
  let backendUrl = null;
  let finalBackendStatus = null;
  let backendProviderCtx = null;

  // ---------------------------------------------------------
  // BACKEND DEPLOYMENT
  // ---------------------------------------------------------
  if (target === 'backend' || target === 'fullstack') {
    if (!existingBackendDeploymentId) throw new Error("existingBackendDeploymentId is required");

    const backendDeploy = await Deployment.findById(existingBackendDeploymentId);

    // 2. init_backend_deploy
    backendProviderCtx = await step.run("init_backend_deploy_v1", async () => {
      await Deployment.findByIdAndUpdate(existingBackendDeploymentId, { status: 'running' });
      return await startBackendProviderDeployment(backendDeploy, project, injectedEnvVars);
    });

    // 3. wait_backend_deploy
    let backendDone = false;
    let backendStatus = null;
    let backendPollAttempts = 0;

    while (!backendDone && backendPollAttempts < 40) { // Max 10 minutes (15s * 40)
      const pollRes = await step.run(`wait_backend_deploy_poll_v1_${backendPollAttempts}`, async () => {
        return await checkBackendProviderStatus(
          existingBackendDeploymentId, 
          backendProviderCtx.token, 
          backendProviderCtx.platform, 
          backendProviderCtx.providerServiceId, 
          backendProviderCtx.newDeployId,
          backendDeploy.domainSnapshot
        );
      }, { cache: false });

      backendDone = pollRes.done;
      backendStatus = pollRes.status;
      if (pollRes.url) backendUrl = pollRes.url;

      if (!backendDone) {
        await new Promise(resolve => setTimeout(resolve, 15000));
        backendPollAttempts++;
      }
    }

    if (!backendDone) {
      await step.run("mark_backend_timeout_v1", async () => {
        await appendLog(existingBackendDeploymentId, 'error', 'deploy_trigger', 'Backend deployment timed out');
      });
      backendStatus = 'failed';
    }

    finalBackendStatus = backendStatus;

    // 4. check_backend_health & 5. resolve_backend_public_url (merged/simulated for now)
    if (finalBackendStatus === 'completed') {
      await step.run("finalize_backend_success_v1", async () => {
        await Deployment.findByIdAndUpdate(existingBackendDeploymentId, {
          status: 'completed',
          completedAt: new Date(),
          ...(backendUrl ? { deploymentUrl: backendUrl, 'finalSummary.backendUrl': backendUrl } : {})
        });
        await appendLog(existingBackendDeploymentId, 'success', '', `==> Your backend service is live 🎉`);
        await appendLog(existingBackendDeploymentId, 'success', '', `==> Available at ${backendUrl || 'provider dashboard'}`);
      });
    } else {
      await step.run("finalize_backend_failure_v1", async () => {
        await Deployment.findByIdAndUpdate(existingBackendDeploymentId, { status: 'failed', completedAt: new Date() });
        await appendLog(existingBackendDeploymentId, 'error', 'deploy_trigger', 'Backend deployment failed or did not complete successfully.');
        if (target === 'fullstack' && payload.existingFullDeploymentId) {
          await Deployment.findByIdAndUpdate(payload.existingFullDeploymentId, { status: 'failed', completedAt: new Date(), errorMessage: "Backend deployment failed" });
        }
      });
      throw new Error("Backend deployment failed");
    }
  }

  // ---------------------------------------------------------
  // FRONTEND DEPLOYMENT
  // ---------------------------------------------------------
  let frontendUrl = null;
  let finalFrontendStatus = null;

  if (target === 'frontend' || target === 'fullstack') {
    if (!existingFrontendDeploymentId) throw new Error("existingFrontendDeploymentId is required");
    const frontendDeploy = await Deployment.findById(existingFrontendDeploymentId);
    
    // 6. inject_frontend_env_vars
    const finalInjectedVars = [...injectedEnvVars];
    if (target === 'fullstack' && backendUrl) {
      const injected = await step.run("inject_frontend_env_vars_v1", async () => {
        await appendLog(existingFrontendDeploymentId, 'info', 'env_setup', `Injecting NEXT_PUBLIC_API_URL=${backendUrl}`);
        return { key: 'NEXT_PUBLIC_API_URL', value: backendUrl };
      });
      finalInjectedVars.push(injected);
    }

    // 7. init_frontend_deploy
    const frontendProviderCtx = await step.run("init_frontend_deploy_v1", async () => {
      await Deployment.findByIdAndUpdate(existingFrontendDeploymentId, { status: 'running' });
      return await startFrontendProviderDeployment(frontendDeploy, project, finalInjectedVars);
    });

    const pollStartTime = Date.now() - 30000;

    // 8. wait_frontend_deploy
    let frontendDone = false;
    let frontendStatus = null;
    let frontendPollAttempts = 0;

    while (!frontendDone && frontendPollAttempts < 60) { // Max 5 minutes (5s * 60)
      const pollRes = await step.run(`wait_frontend_deploy_poll_v1_${frontendPollAttempts}`, async () => {
        return await checkFrontendProviderStatus(
          existingFrontendDeploymentId, 
          frontendProviderCtx.token, 
          frontendProviderCtx.providerServiceId, 
          pollStartTime,
          frontendProviderCtx.username,
          frontendProviderCtx.projectName,
          frontendDeploy.domainSnapshot
        );
      }, { cache: false });

      frontendDone = pollRes.done;
      frontendStatus = pollRes.status;
      if (pollRes.url) frontendUrl = pollRes.url;

      if (!frontendDone) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        frontendPollAttempts++;
      }
    }

    if (!frontendDone) {
      await step.run("mark_frontend_timeout_v1", async () => {
        await appendLog(existingFrontendDeploymentId, 'error', 'deploy_trigger', 'Frontend deployment timed out');
      });
      frontendStatus = 'failed';
    }

    finalFrontendStatus = frontendStatus;

    // 9. check_frontend_health & 10. finalize
    if (finalFrontendStatus === 'completed') {
      await step.run("finalize_frontend_success_v1", async () => {
        await Deployment.findByIdAndUpdate(existingFrontendDeploymentId, {
          status: 'completed',
          completedAt: new Date(),
          ...(frontendUrl ? { deploymentUrl: frontendUrl, 'finalSummary.frontendUrl': frontendUrl } : {})
        });
        await appendLog(existingFrontendDeploymentId, 'success', '', `==> Your frontend is live 🎉`);
        await appendLog(existingFrontendDeploymentId, 'success', '', `==> Available at ${frontendUrl || 'provider dashboard'}`);
        
        if (target === 'fullstack' && payload.existingFullDeploymentId) {
          await Deployment.findByIdAndUpdate(payload.existingFullDeploymentId, { 
            status: 'completed', 
            completedAt: new Date(),
            deploymentUrl: frontendUrl,
            'finalSummary.frontendUrl': frontendUrl,
            'finalSummary.backendUrl': backendUrl
          });
        }
      });

      await step.run("capture_screenshot_v1", async () => {
        if (frontendUrl) {
          const screenshotUrl = await captureDeploymentScreenshot(existingFrontendDeploymentId, frontendUrl);
          if (screenshotUrl && target === 'fullstack' && payload.existingFullDeploymentId) {
            await Deployment.findByIdAndUpdate(payload.existingFullDeploymentId, {
              'finalSummary.screenshotUrl': screenshotUrl
            });
          }
        }
      });
    } else {
      await step.run("finalize_frontend_failure_v1", async () => {
        await Deployment.findByIdAndUpdate(existingFrontendDeploymentId, { status: 'failed', completedAt: new Date() });
        await appendLog(existingFrontendDeploymentId, 'error', 'deploy_trigger', 'Frontend deployment failed or did not complete successfully.');
        if (target === 'fullstack' && payload.existingFullDeploymentId) {
          await Deployment.findByIdAndUpdate(payload.existingFullDeploymentId, { status: 'failed', completedAt: new Date(), errorMessage: "Frontend deployment failed" });
        }
      });
      throw new Error("Frontend deployment failed");
    }
  }

  return {
    target,
    backendStatus: finalBackendStatus,
    backendUrl,
    frontendStatus: finalFrontendStatus,
    frontendUrl
  };
});
