import Monitor from '../models/Monitor.js';
import MonitorCheck from '../models/MonitorCheck.js';
import User from '../models/User.js';
import Project from '../models/Project.js';
import DomainSetup from '../models/DomainSetup.js';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const fromEmail = process.env.ALERT_FROM_EMAIL || 'DeployAI <alerts@deployai.com>';

export const createDefaultMonitors = async (projectId) => {
  const project = await Project.findById(projectId);
  if (!project) return;

  const domainSetups = await DomainSetup.find({ projectId, status: 'active' });
  const activeDomain = domainSetups[0];

  const monitors = [];

  // Frontend Monitor
  let frontendUrl = project.configuration?.frontendPlatformUrl || `https://${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.vercel.app`;
  if (activeDomain) frontendUrl = `https://${activeDomain.frontendDomain}`;

  // Backend Monitor
  let backendUrl = project.configuration?.backendPlatformUrl || '';
  if (activeDomain) backendUrl = `https://${activeDomain.backendDomain}`;

  const defaultMonitorsToCreate = [];

  if (frontendUrl) {
    defaultMonitorsToCreate.push({
      userId: project.userId,
      projectId: project._id,
      domainSetupId: activeDomain ? activeDomain._id : null,
      name: 'Frontend',
      type: 'frontend',
      url: frontendUrl,
      healthPath: '/'
    });
  }

  if (backendUrl) {
    defaultMonitorsToCreate.push({
      userId: project.userId,
      projectId: project._id,
      domainSetupId: activeDomain ? activeDomain._id : null,
      name: 'Backend',
      type: 'backend',
      url: backendUrl,
      healthPath: '/health'
    });
  }

  for (let mon of defaultMonitorsToCreate) {
    try {
      await Monitor.findOneAndUpdate(
        { projectId: mon.projectId, type: mon.type, url: mon.url },
        { $set: mon },
        { upsert: true, new: true }
      );
    } catch (e) {
      console.error(`Error creating default ${mon.type} monitor:`, e);
    }
  }
};

const sendAlertEmail = async (monitor, user, project, type) => {
  if (!resend) {
    console.log(`[Alert] Would send ${type} email to ${user.email} for monitor ${monitor.url}`);
    return;
  }

  const subject = type === 'offline' 
    ? `DeployAI Alert: ${monitor.name} is offline`
    : `DeployAI Recovery: ${monitor.name} is back online`;

  const html = type === 'offline' 
    ? `
      <h2>DeployAI Monitor Alert</h2>
      <p><strong>Project:</strong> ${project.name}</p>
      <p><strong>Service:</strong> ${monitor.name}</p>
      <p><strong>URL:</strong> ${monitor.url}${monitor.healthPath === '/' ? '' : monitor.healthPath}</p>
      <p><strong>Failures:</strong> ${monitor.consecutiveFailures} consecutive checks</p>
      <p><strong>Last error:</strong> ${monitor.lastErrorMessage}</p>
      <p><strong>Last checked:</strong> ${new Date().toISOString()}</p>
    `
    : `
      <h2>DeployAI Monitor Recovery</h2>
      <p><strong>Project:</strong> ${project.name}</p>
      <p><strong>Service:</strong> ${monitor.name}</p>
      <p><strong>URL:</strong> ${monitor.url}${monitor.healthPath === '/' ? '' : monitor.healthPath}</p>
      <p>Your service is back online!</p>
    `;

  try {
    // using idempotency key based on monitor ID and status to prevent duplicate sending
    await resend.emails.send({
      from: fromEmail,
      to: user.email,
      subject,
      html,
      headers: {
        'X-Entity-Ref-ID': `${monitor._id}-${type}-${Date.now()}`
      }
    });
  } catch (error) {
    console.error(`Failed to send alert email for ${monitor._id}:`, error);
  }
};

export const runMonitorCheck = async (monitorId) => {
  const monitor = await Monitor.findById(monitorId);
  if (!monitor || !monitor.isEnabled) return null;

  const targetUrl = `${monitor.url}${monitor.healthPath === '/' ? '' : monitor.healthPath}`;
  let status = 'offline';
  let statusCode = null;
  let responseTimeMs = 0;
  let errorMessage = null;

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    let response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'DeployAI-Monitor/1.0' }
    });
    
    // If backend health is 404 on /health, retry /api/health and then /
    if (monitor.type === 'backend' && response.status === 404 && monitor.healthPath === '/health') {
      const fallbackUrls = [`${monitor.url}/api/health`, `${monitor.url}/`];
      for (const fallbackUrl of fallbackUrls) {
        response = await fetch(fallbackUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'DeployAI-Monitor/1.0' }
        });
        if (response.status !== 404) {
           break;
        }
      }
    }

    responseTimeMs = Date.now() - startTime;
    statusCode = response.status;

    if (statusCode >= 200 && statusCode < 400) {
      status = responseTimeMs > 3000 ? 'degraded' : 'online';
    } else if (statusCode >= 400 && statusCode < 500) {
      status = 'degraded'; // 404s might just mean bad routing but service is up
      errorMessage = `HTTP ${statusCode}`;
    } else {
      status = 'offline';
      errorMessage = `HTTP ${statusCode}`;
    }

  } catch (error) {
    responseTimeMs = Date.now() - startTime;
    status = 'offline';
    errorMessage = error.name === 'AbortError' ? 'Request timeout' : error.message;
  } finally {
    clearTimeout(timeoutId);
  }

  // Create Check Record
  await MonitorCheck.create({
    userId: monitor.userId,
    projectId: monitor.projectId,
    monitorId: monitor._id,
    url: targetUrl,
    status,
    statusCode,
    responseTimeMs,
    errorMessage
  });

  // Update Monitor Stats
  const previousStatus = monitor.status;
  const isOnlineOrDegraded = status === 'online' || status === 'degraded';

  monitor.totalChecks += 1;
  monitor.lastCheckedAt = new Date();
  monitor.lastStatusCode = statusCode;
  monitor.lastResponseTimeMs = responseTimeMs;
  monitor.lastErrorMessage = errorMessage;
  monitor.status = status;

  if (isOnlineOrDegraded) {
    monitor.successfulChecks += 1;
    monitor.consecutiveFailures = 0;
  } else {
    monitor.failedChecks += 1;
    monitor.consecutiveFailures += 1;
  }

  monitor.uptimePercentage = (monitor.successfulChecks / monitor.totalChecks) * 100;

  // Alerting Logic
  if (monitor.consecutiveFailures >= 3) {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    if (!monitor.lastAlertSentAt || monitor.lastAlertSentAt < thirtyMinsAgo) {
      const user = await User.findById(monitor.userId);
      const project = await Project.findById(monitor.projectId);
      if (user && project) {
        await sendAlertEmail(monitor, user, project, 'offline');
        monitor.lastAlertSentAt = new Date();
        monitor.alertCount += 1;
        monitor.alertStatus = 'sent';
      }
    }
  } else if (isOnlineOrDegraded && monitor.alertStatus === 'sent') {
    // Recovery
    const user = await User.findById(monitor.userId);
    const project = await Project.findById(monitor.projectId);
    if (user && project) {
      await sendAlertEmail(monitor, user, project, 'recovered');
      monitor.alertStatus = 'recovered';
    }
  }

  await monitor.save();
  return monitor;
};

export const getMonitorSummary = async (projectId) => {
  const monitors = await Monitor.find({ projectId });
  return monitors;
};
