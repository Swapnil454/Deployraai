import { FastifyRequest, FastifyReply } from 'fastify';

export function verifyWebhookSecret(platform: 'vercel' | 'netlify') {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    // Placeholder for webhook signature verification
    // For Vercel, check x-vercel-signature
  };
}
