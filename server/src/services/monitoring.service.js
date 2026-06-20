import { Resend } from 'resend';
import Monitor from '../models/Monitor.js';
import MonitorCheck from '../models/MonitorCheck.js';
import Project from '../models/Project.js';
import DomainSetup from '../models/DomainSetup.js';
import Deployment from '../models/Deployment.js';
import User from '../models/User.js';
import { v4 as uuidv4 } from 'uuid';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL || 'DeployAI <alerts@deployai.test>';

export const createDefaultMonitors = async (projectId, passedFrontendUrl = null, passedBackendUrl = null) => {
  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found");

  const domainSetup = await DomainSetup.findOne({ projectId, status: 'active' }).sort({ createdAt: -1 });
  const latestFrontendDeploy = await Deployment.findOne({ projectId, status: { $in: ['success', 'completed'] }, type: { $in: ['frontend', 'full'] } }).sort({ createdAt: -1 });
  const latestBackendDeploy = await Deployment.findOne({ projectId, status: { $in: ['success', 'completed'] }, type: { $in: ['backend', 'full'] } }).sort({ createdAt: -1 });

  let frontendUrl = passedFrontendUrl;
  let backendUrl = passedBackendUrl;

  if (!frontendUrl && domainSetup && domainSetup.targetService !== 'backend') {
    frontendUrl = `https://${domainSetup.frontendDomain || domainSetup.rootDomain}`;
  } else if (!frontendUrl && latestFrontendDeploy) {
    frontendUrl = latestFrontendDeploy.finalSummary?.frontendUrl || latestFrontendDeploy.frontendUrl;
  }

  if (!backendUrl && domainSetup && domainSetup.targetService !== 'frontend') {
    backendUrl = `https://${domainSetup.backendDomain || domainSetup.rootDomain}`;
  } else if (!backendUrl && latestBackendDeploy) {
    backendUrl = latestBackendDeploy.finalSummary?.backendUrl || latestBackendDeploy.backendUrl;
  }
  
  if (frontendUrl && !frontendUrl.startsWith('http')) frontendUrl = `https://${frontendUrl}`;
  if (backendUrl && !backendUrl.startsWith('http')) backendUrl = `https://${backendUrl}`;

  if (!frontendUrl && !backendUrl) {
    return { created: 0, message: "No URLs available to monitor" };
  }

  let createdCount = 0;

  if (frontendUrl) {
    // Check if exists
    let feMonitor = await Monitor.findOne({ projectId, type: 'frontend', url: frontendUrl });
    if (!feMonitor) {
      feMonitor = new Monitor({
        userId: project.userId,
        projectId,
        domainSetupId: domainSetup?._id,
        name: `${project.name} Frontend`,
        type: 'frontend',
        url: frontendUrl,
        healthPath: '/'
      });
      await feMonitor.save();
      createdCount++;
    }
  }

  if (backendUrl) {
    let beMonitor = await Monitor.findOne({ projectId, type: 'backend', url: backendUrl });
    if (!beMonitor) {
      beMonitor = new Monitor({
        userId: project.userId,
        projectId,
        domainSetupId: domainSetup?._id,
        name: `${project.name} Backend`,
        type: 'backend',
        url: backendUrl,
        healthPath: '/health'
      });
      await beMonitor.save();
      createdCount++;
    }
  }

  return { created: createdCount, frontendUrl, backendUrl };
};

const sendAlertEmail = async (monitor, user, type = 'down') => {
  if (!resend) return;
  
  const idempotencyKey = uuidv4();
  
  let subject = '';
  let html = '';
  
  if (type === 'down') {
    subject = `DeployAI Alert: ${monitor.name} is offline`;
    html = `
      <h3>DeployAI Monitoring Alert</h3>
      <p><strong>Service:</strong> ${monitor.name} (${monitor.type})</p>
      <p><strong>URL:</strong> ${monitor.url}${monitor.healthPath !== '/' ? monitor.healthPath : ''}</p>
      <p><strong>Failures:</strong> ${monitor.consecutiveFailures} consecutive checks</p>
      <p><strong>Last error:</strong> ${monitor.lastErrorMessage}</p>
      <p><strong>Last checked:</strong> ${monitor.lastCheckedAt}</p>
      <p>Please check your application dashboard.</p>
    `;
  } else if (type === 'up') {
    subject = `DeployAI Recovery: ${monitor.name} is back online`;
    html = `
      <h3>DeployAI Monitoring Recovery</h3>
      <p><strong>Service:</strong> ${monitor.name} (${monitor.type})</p>
      <p><strong>URL:</strong> ${monitor.url}${monitor.healthPath !== '/' ? monitor.healthPath : ''}</p>
      <p>Your service is now responding correctly.</p>
    `;
  }

  try {
    await resend.emails.send({
      from: ALERT_FROM_EMAIL,
      to: user.email,
      subject,
      html,
      headers: {
        'Idempotency-Key': idempotencyKey
      }
    });
  } catch (error) {
    console.error("Failed to send alert email:", error);
  }
};

export const runMonitorCheck = async (monitorId) => {
  const monitor = await Monitor.findById(monitorId);
  if (!monitor || !monitor.isEnabled) return null;

  const targetUrl = monitor.healthPath !== '/' 
    ? (monitor.url.endsWith('/') ? monitor.url.slice(0, -1) + monitor.healthPath : monitor.url + monitor.healthPath) 
    : monitor.url;

  const startTime = Date.now();
  let statusCode = null;
  let status = 'offline';
  let errorMessage = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, 10000);
    
    // Add retry for /health -> /api/health then /
    let res = await fetch(targetUrl, { 
      headers: { 'User-Agent': 'DeployAI-Monitor/1.0' },
      signal: controller.signal
    });

    if (monitor.type === 'backend' && res.status === 404 && monitor.healthPath === '/health') {
       // Retry with /api/health
       const apiHealthUrl = monitor.url.endsWith('/') ? monitor.url + 'api/health' : monitor.url + '/api/health';
       res = await fetch(apiHealthUrl, { 
         headers: { 'User-Agent': 'DeployAI-Monitor/1.0' },
         signal: controller.signal
       });
       if (res.status === 404) {
         // Fallback to /
         res = await fetch(monitor.url, { 
           headers: { 'User-Agent': 'DeployAI-Monitor/1.0' },
           signal: controller.signal
         });
       }
    }

    clearTimeout(timeout);
    statusCode = res.status;
    
    if (res.status >= 200 && res.status < 400) {
      status = 'online';
    } else if (res.status >= 400 && res.status < 500) {
      status = 'degraded';
    } else if (res.status >= 500) {
      status = 'offline';
    }
  } catch (err) {
    errorMessage = err.name === 'AbortError' ? 'Request timeout' : err.message;
    status = 'offline';
  }

  const responseTimeMs = Date.now() - startTime;
  
  if (status === 'online' && responseTimeMs > 3000) {
    status = 'degraded';
  }

  const check = new MonitorCheck({
    userId: monitor.userId,
    projectId: monitor.projectId,
    monitorId: monitor._id,
    url: targetUrl,
    status,
    statusCode,
    responseTimeMs,
    errorMessage
  });
  await check.save();

  monitor.lastCheckedAt = new Date();
  monitor.lastStatusCode = statusCode;
  monitor.lastResponseTimeMs = responseTimeMs;
  monitor.lastErrorMessage = errorMessage;
  monitor.totalChecks += 1;

  if (status === 'online' || status === 'degraded') {
    monitor.successfulChecks += 1;
    monitor.consecutiveFailures = 0;
    
    if (monitor.alertStatus === 'sent') {
      const user = await User.findById(monitor.userId);
      await sendAlertEmail(monitor, user, 'up');
      monitor.alertStatus = 'recovered';
    }
  } else {
    monitor.failedChecks += 1;
    monitor.consecutiveFailures += 1;
    
    if (monitor.consecutiveFailures >= 3) {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60000);
      if (!monitor.lastAlertSentAt || monitor.lastAlertSentAt < thirtyMinsAgo) {
        const user = await User.findById(monitor.userId);
        await sendAlertEmail(monitor, user, 'down');
        monitor.lastAlertSentAt = new Date();
        monitor.alertCount += 1;
        monitor.alertStatus = 'sent';
      }
    }
  }

  monitor.status = status;
  monitor.uptimePercentage = (monitor.successfulChecks / monitor.totalChecks) * 100;
  
  await monitor.save();
  return monitor;
};

export const runProjectMonitors = async (projectId) => {
  const monitors = await Monitor.find({ projectId, isEnabled: true });
  const results = [];
  for (const m of monitors) {
    const res = await runMonitorCheck(m._id);
    results.push(res);
  }
  return results;
};

export const runAllMonitors = async () => {
  const monitors = await Monitor.find({ isEnabled: true });
  // Process in batches or parallel
  await Promise.all(monitors.map(m => runMonitorCheck(m._id).catch(console.error)));
};
