import { defineWorkflow } from '../services/workflow.service.js';
import Deployment from '../models/Deployment.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import { sendDeploymentSuccess, sendDeploymentFailed } from '../services/notification.service.js';
import { injectSdkViaGithub } from '../services/githubSdkInjector.js';
import { 
  startBackendProviderDeployment, 
  checkBackendProviderStatus,
  startFrontendProviderDeployment,
  checkFrontendProviderStatus,
  appendLog,
  updateBackendEnvAndRedeploy
} from '../services/deploymentProvider.service.js';
import { encryptSecret } from '../utils/encryption.js';
import { captureDeploymentScreenshot } from '../services/screenshot.service.js';
import { createDefaultMonitors } from '../services/monitoring.service.js';

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

  // Run GitHub SDK Auto-Injector before triggering providers
  await step.run("auto_inject_sdk_v1", async () => {
    await injectSdkViaGithub(project);
    return { status: "ok" };
  });

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
    try {
      backendProviderCtx = await step.run("init_backend_deploy_v1", async () => {
        await Deployment.findByIdAndUpdate(existingBackendDeploymentId, { status: 'running' });
        return await startBackendProviderDeployment(backendDeploy, project, injectedEnvVars);
      });
    } catch (err) {
      await step.run("mark_backend_init_failed_v1", async () => {
        await Deployment.findByIdAndUpdate(existingBackendDeploymentId, { status: 'failed', completedAt: new Date(), errorMessage: err.message });
        await appendLog(existingBackendDeploymentId, 'error', 'deploy_trigger', `Backend deployment failed: ${err.message}`);
        if (target === 'fullstack' && payload.existingFullDeploymentId) {
          await Deployment.findByIdAndUpdate(payload.existingFullDeploymentId, { status: 'failed', completedAt: new Date(), errorMessage: `Backend deployment failed: ${err.message}` });
        }
      });
      throw err;
    }

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
        
        const user = await User.findById(userId);
        if (user && user.notificationPreferences?.emailEnabled !== false) {
          await sendDeploymentSuccess(user.email, project, backendUrl || 'provider dashboard');
        }
      });
    } else {
      await step.run("finalize_backend_failure_v1", async () => {
        await Deployment.findByIdAndUpdate(existingBackendDeploymentId, { status: 'failed', completedAt: new Date() });
        await appendLog(existingBackendDeploymentId, 'error', 'deploy_trigger', 'Backend deployment failed or did not complete successfully.');
        
        const user = await User.findById(userId);
        if (user && user.notificationPreferences?.emailEnabled !== false) {
          await sendDeploymentFailed(user.email, project, 'Backend deployment failed or timed out.');
        }

        if (target === 'fullstack' && payload.existingFullDeploymentId) {
          await Deployment.findByIdAndUpdate(payload.existingFullDeploymentId, { status: 'failed', completedAt: new Date(), errorMessage: "Backend deployment failed" });
        }
      });
      
      // Auto-create monitors even if failed so that any succeeded service is monitored
      await step.run("auto_create_monitors_failed_backend_v1", async () => {
        try { await createDefaultMonitors(projectId); } catch (err) { console.error("Monitor create failed:", err); }
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
      const targetEnv = project.configuration.envVariables.frontend?.find(e => e.isBackendUrlTarget);
      if (targetEnv) {
        const injected = await step.run("inject_frontend_env_vars_v1", async () => {
          await appendLog(existingFrontendDeploymentId, 'info', 'env_setup', `Injecting ${targetEnv.key}=${backendUrl}`);
          
          // Refetch project to avoid VersionError since the workflow has been waiting for minutes
          const latestProject = await Project.findById(project._id);
          const latestTargetEnv = latestProject.configuration.envVariables.frontend?.find(e => e.isBackendUrlTarget);
          
          if (latestTargetEnv) {
            latestTargetEnv.valueEncrypted = encryptSecret(backendUrl);
            latestProject.markModified('configuration.envVariables');
            await latestProject.save();
          }
          
          return { key: targetEnv.key, value: backendUrl };
        });
        finalInjectedVars.push(injected);
      }
    }

    // 7. init_frontend_deploy
    let frontendProviderCtx = null;
    try {
      frontendProviderCtx = await step.run("init_frontend_deploy_v1", async () => {
        await Deployment.findByIdAndUpdate(existingFrontendDeploymentId, { status: 'running' });
        return await startFrontendProviderDeployment(frontendDeploy, project, finalInjectedVars);
      });
    } catch (err) {
      await step.run("mark_frontend_init_failed_v1", async () => {
        await Deployment.findByIdAndUpdate(existingFrontendDeploymentId, { status: 'failed', completedAt: new Date(), errorMessage: err.message });
        await appendLog(existingFrontendDeploymentId, 'error', 'deploy_trigger', `Frontend deployment failed: ${err.message}`);
        if (target === 'fullstack' && payload.existingFullDeploymentId) {
          await Deployment.findByIdAndUpdate(payload.existingFullDeploymentId, { status: 'failed', completedAt: new Date(), errorMessage: `Frontend deployment failed: ${err.message}` });
        }
      });
      throw err;
    }

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
        
        const user = await User.findById(userId);
        if (user && user.notificationPreferences?.emailEnabled !== false) {
          await sendDeploymentSuccess(user.email, project, frontendUrl || 'provider dashboard');
        }

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

      if (target === 'fullstack' && frontendUrl && backendProviderCtx) {
        await step.run("update_backend_env_with_frontend_url_v1", async () => {
           const backendDeploy = await Deployment.findById(existingBackendDeploymentId);
           await updateBackendEnvAndRedeploy(backendDeploy, project, frontendUrl, backendProviderCtx);
        });
      }

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
        
        const user = await User.findById(userId);
        if (user && user.notificationPreferences?.emailEnabled !== false) {
          await sendDeploymentFailed(user.email, project, 'Frontend deployment failed or timed out.');
        }

        if (target === 'fullstack' && payload.existingFullDeploymentId) {
          await Deployment.findByIdAndUpdate(payload.existingFullDeploymentId, { status: 'failed', completedAt: new Date(), errorMessage: "Frontend deployment failed" });
        }
      });
      
      // Auto-create monitors even if failed so that any succeeded service is monitored
      await step.run("auto_create_monitors_failed_frontend_v1", async () => {
        try { await createDefaultMonitors(projectId); } catch (err) { console.error("Monitor create failed:", err); }
      });
      
      throw new Error("Frontend deployment failed");
    }
  }

  // Auto-create monitors when everything completes successfully
  await step.run("auto_create_monitors_v1", async () => {
     try {
       await createDefaultMonitors(projectId);
     } catch (err) {
       console.error("Monitor auto-creation failed:", err);
     }
  });

  return {
    target,
    backendStatus: finalBackendStatus,
    backendUrl,
    frontendStatus: finalFrontendStatus,
    frontendUrl
  };
});
