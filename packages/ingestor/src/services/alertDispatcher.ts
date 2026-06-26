import { db } from '../db.js';
import { validateWebhookUrl } from '../utils/webhook-validator.js';

export interface AlertEvent {
  id: string;
  projectId: string;
  title: string;
  message: string;
  severity: string;
  fingerprint: string;
  routeType: string;
  routeTarget: string | null;
}

export async function dispatchAlert(alert: AlertEvent) {
  try {
    if (alert.routeType === 'email') {
      await sendEmailAlert(alert);
    } else if (alert.routeType === 'slack_webhook') {
      await sendSlackAlert(alert);
    } else if (alert.routeType === 'webhook') {
      await sendWebhookAlert(alert);
    }
    // 'dashboard' routeType inherently succeeds if saved

    await markAlertStatus(alert.id, 'sent', null);
  } catch (error: any) {
    console.error(`Failed to dispatch alert ${alert.id}:`, error);
    await markAlertStatus(alert.id, 'failed', String(error));
  }
}

async function sendEmailAlert(alert: AlertEvent) {
  if (!alert.routeTarget) throw new Error('Missing route target for email');
  
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.ALERT_FROM_EMAIL || 'alerts@tracepilot.com',
      to: alert.routeTarget,
      subject: alert.title,
      html: `
        <h2>${alert.title}</h2>
        <p>${alert.message}</p>
        <p><strong>Severity:</strong> ${alert.severity}</p>
        <p><strong>Fingerprint:</strong> ${alert.fingerprint}</p>
      `,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend failed: ${text}`);
  }
}

async function sendSlackAlert(alert: AlertEvent) {
  if (!alert.routeTarget) throw new Error('Missing route target for Slack');
  await validateWebhookUrl(alert.routeTarget);

  const res = await fetch(alert.routeTarget, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🚨 *${alert.title}*\n${alert.message}\n*Severity*: ${alert.severity}\n*Fingerprint*: \`${alert.fingerprint}\``
    }),
    redirect: 'manual',
    signal: AbortSignal.timeout(5000), // 5s timeout
  });

  if (!res.ok && res.type !== 'opaqueredirect') {
    throw new Error(`Slack webhook failed with status ${res.status}`);
  }
}

async function sendWebhookAlert(alert: AlertEvent) {
  if (!alert.routeTarget) throw new Error('Missing route target for Webhook');
  await validateWebhookUrl(alert.routeTarget);

  const res = await fetch(alert.routeTarget, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(alert),
    redirect: 'manual',
    signal: AbortSignal.timeout(5000), // 5s timeout
  });

  if (!res.ok && res.type !== 'opaqueredirect') {
    throw new Error(`Generic webhook failed with status ${res.status}`);
  }
}

async function markAlertStatus(id: string, status: string, errorMessage: string | null) {
  await db.query(`
    UPDATE alert_events 
    SET status = $1, error_message = $2, delivered_at = CASE WHEN $1 = 'sent' THEN NOW() ELSE NULL END
    WHERE id = $3
  `, [status, errorMessage, id]);
}
