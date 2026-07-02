import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const NOTIFICATION_FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL || 'DeployAI <notifications@tracepilot.com>'; // Fallback if env var missing

const escapeHTML = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export const sendDeploymentSuccess = async (userEmail, project, url) => {
  if (!resend) {
    console.warn('[NotificationService] RESEND_API_KEY is not set. Skipping email.');
    return;
  }
  if (!userEmail) return;

  try {
    await resend.emails.send({
      from: NOTIFICATION_FROM_EMAIL,
      to: userEmail,
      subject: `✅ Deployment Successful: ${project.repoName}`,
      html: `
        <h2>Your deployment is live!</h2>
        <p><strong>Project:</strong> ${escapeHTML(project.repoName)}</p>
        <p><strong>URL:</strong> ${url && url.startsWith('http') ? `<a href="${escapeHTML(url)}">${escapeHTML(url)}</a>` : escapeHTML(url)}</p>
        <p>Your latest changes have been successfully deployed and are now available.</p>
      `,
    });
  } catch (error) {
    console.error(`[NotificationService] Failed to send deployment success email to ${userEmail}:`, error);
  }
};

export const sendDeploymentFailed = async (userEmail, project, errorMessage) => {
  if (!resend) {
    console.warn('[NotificationService] RESEND_API_KEY is not set. Skipping email.');
    return;
  }
  if (!userEmail) return;

  try {
    await resend.emails.send({
      from: NOTIFICATION_FROM_EMAIL,
      to: userEmail,
      subject: `❌ Deployment Failed: ${project.repoName}`,
      html: `
        <h2>Deployment Failed</h2>
        <p><strong>Project:</strong> ${escapeHTML(project.repoName)}</p>
        <p>Unfortunately, your recent deployment failed to complete.</p>
        <p><strong>Error Details:</strong></p>
        <pre style="background-color: #f8f9fa; padding: 10px; border-radius: 5px; color: #d73a49;">${escapeHTML(errorMessage) || 'See dashboard for details.'}</pre>
        <p>Please check your TracePilot dashboard for full deployment logs.</p>
      `,
    });
  } catch (error) {
    console.error(`[NotificationService] Failed to send deployment failure email to ${userEmail}:`, error);
  }
};

export const sendPRCreated = async (userEmail, project, prUrl, exceptionType) => {
  if (!resend) {
    console.warn('[NotificationService] RESEND_API_KEY is not set. Skipping email.');
    return;
  }
  if (!userEmail) return;

  try {
    await resend.emails.send({
      from: NOTIFICATION_FROM_EMAIL,
      to: userEmail,
      subject: `🤖 AI Fix PR Created: ${project.repoName}`,
      html: `
        <h2>TracePilot AI has generated a fix!</h2>
        <p><strong>Project:</strong> ${escapeHTML(project.repoName)}</p>
        <p>An automatic Pull Request has been opened for the recent <code>${escapeHTML(exceptionType)}</code> error.</p>
        <p><strong>Review the PR here:</strong> <a href="${escapeHTML(prUrl)}">${escapeHTML(prUrl)}</a></p>
      `,
    });
  } catch (error) {
    console.error(`[NotificationService] Failed to send PR created email to ${userEmail}:`, error);
  }
};

export const sendIssueArrived = async (userEmail, project, issueTitle, severity) => {
  if (!resend) {
    console.warn('[NotificationService] RESEND_API_KEY is not set. Skipping email.');
    return;
  }
  if (!userEmail) return;

  try {
    await resend.emails.send({
      from: NOTIFICATION_FROM_EMAIL,
      to: userEmail,
      subject: `🚨 New Issue Arrived: ${project.repoName}`,
      html: `
        <h2>A new issue has been detected</h2>
        <p><strong>Project:</strong> ${escapeHTML(project.repoName)}</p>
        <p><strong>Severity:</strong> <span style="text-transform: capitalize;">${escapeHTML(severity)}</span></p>
        <p><strong>Issue:</strong> ${escapeHTML(issueTitle)}</p>
        <p>Check your TracePilot issues dashboard for full stack traces and context.</p>
      `,
    });
  } catch (error) {
    console.error(`[NotificationService] Failed to send issue arrived email to ${userEmail}:`, error);
  }
};
