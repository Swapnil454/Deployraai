import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';

export function verifyWebhookSecret(platform: 'vercel' | 'netlify') {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const secret = process.env.LOG_DRAIN_SECRET;
    
    if (!secret) {
      // In local dev, if not configured, pass through
      return;
    }

    if (platform === 'vercel') {
      const signature = req.headers['x-vercel-signature'] as string;
      if (!signature) {
        reply.status(401).send({ error: 'Missing Vercel signature' });
        return;
      }
      const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
      if (signature !== expected) {
        reply.status(401).send({ error: 'Invalid Vercel signature' });
        return;
      }
    } else if (platform === 'netlify') {
      const signature = req.headers['x-webhook-signature'] as string;
      if (!signature) {
        reply.status(401).send({ error: 'Missing Netlify signature' });
        return;
      }
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      if (signature !== expected) {
        reply.status(401).send({ error: 'Invalid Netlify signature' });
        return;
      }
    }
  };
}
