import { FastifyPluginAsync } from 'fastify';
import { verifyWebhookSecret } from '../middleware/webhook.js';
import { logWriter } from '../writers/logs.js';

export const logsRouter: FastifyPluginAsync = async (app) => {
  // Vercel log drain
  app.post('/vercel/:projectId', {
    preHandler: verifyWebhookSecret('vercel'),
  }, async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const lines = req.body as any[];

    const logs = lines.map(line => ({
      projectId,
      source: 'vercel',
      timestamp: new Date(line.timestamp),
      message: line.message,
      level: detectLogLevel(line.message),
      requestId: line.requestId,
      region: line.proxy?.region ?? 'unknown',
      deployId: line.deploymentId,
      raw: line,
    }));

    logWriter.write(logs).catch(() => {});
    reply.status(202).send();
  });

  // Netlify log drain
  app.post('/netlify/:projectId', {
    preHandler: verifyWebhookSecret('netlify'),
  }, async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const payload = req.body as any;
    // Netlify sends different shape — normalize to same internal format
    const logs = normalizeNetlifyLogs(payload, projectId);
    logWriter.write(logs).catch(() => {});
    reply.status(202).send();
  });

  // Railway log drain
  app.post('/railway/:projectId', {
    preHandler: verifyRailwayWebhook,
  }, async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const payload = req.body as any[];

    const logs = payload.map(line => ({
      projectId,
      source: 'railway',
      timestamp: new Date(line.timestamp),
      message: line.message,
      level: detectLogLevel(line.message),
      requestId: null,
      region: line.attributes?.region ?? 'unknown',
      deployId: line.attributes?.deploymentId ?? 'unknown',
      raw: line,
    }));

    logWriter.write(logs).catch(() => {});
    reply.status(202).send();
  });
};

function detectLogLevel(message: string): 'error' | 'warn' | 'info' | 'debug' {
  if (!message) return 'info';
  const lower = message.toLowerCase();
  if (lower.includes('error') || lower.includes('exception') || lower.includes('fatal')) return 'error';
  if (lower.includes('warn')) return 'warn';
  if (lower.includes('debug')) return 'debug';
  return 'info';
}

function normalizeNetlifyLogs(payload: any, projectId: string) {
  // Stub for Netlify normalization
  return [];
}

// --- Railway Integration ---

export async function registerRailwayLogDrain(
  railwayToken: string,
  serviceId: string,
  environmentId: string,
  internalProjectId: string
) {
  const res = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${railwayToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        mutation CreateLogDrain($input: LogDrainCreateInput!) {
          logDrainCreate(input: $input) { id }
        }
      `,
      variables: {
        input: {
          serviceId,
          environmentId,
          url: `https://ingestor.yourplatform.com/logs/railway/${internalProjectId}`,
          token: process.env.RAILWAY_WEBHOOK_SECRET,
        },
      },
    }),
  });

  const data = await res.json();
  return data.data?.logDrainCreate?.id;
}

import crypto from 'crypto';

async function verifyRailwayWebhook(req: any, reply: any) {
  const auth = req.headers['authorization'];
  const secret = Buffer.from(process.env.RAILWAY_WEBHOOK_SECRET ?? '');
  const incoming = Buffer.from(auth?.replace('Bearer ', '') ?? '');

  if (secret.length === 0 || !crypto.timingSafeEqual(secret, incoming)) {
    return reply.status(401).send({ error: 'Invalid Railway webhook secret' });
  }
}

