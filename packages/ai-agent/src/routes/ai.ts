import { FastifyPluginAsync } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import { redis } from '../index.js';
import { buildFingerprintContext } from '../context-builder.js';

const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'dummy_key',
});

export const aiRouter: FastifyPluginAsync = async (app) => {
  app.post('/explain', async (req, reply) => {
    const { projectId, fingerprint } = req.body as { projectId: string, fingerprint: string };
    if (!projectId || !fingerprint) {
      return reply.status(400).send({ error: 'Missing projectId or fingerprint' });
    }

    // Rate Limiting: 10 calls/day per project
    if (redis) {
      const today = new Date().toISOString().slice(0, 10);
      const key = `ai:explain:${projectId}:${today}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, 86400); // EXPIRE 86400 on first SET
      }
      if (count > 10) {
        return reply.status(429).send({ error: 'Daily AI explain limit reached for this project (10/day).' });
      }
    }

    const context = await buildFingerprintContext(projectId, fingerprint);
    if (!context) {
      return reply.status(404).send({ error: 'Error fingerprint not found' });
    }

    const prompt = `
You are an expert developer analyzing an application error. Here is the observability data for this specific error group:

EXCEPTION TYPE: ${context.exceptionType}
STACK TRACE:
${context.stackTrace}

ERROR LOGS (most recent for this fingerprint):
${context.errorLogs.slice(0, 10).map(l => l.message).join('\n')}

Based on this data, provide a clear, concise explanation of what likely caused this error. Do not write a code fix, just the explanation.
`;

    // SSE Headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // Prevent Nginx buffering

    const stream = await anthropicClient.messages.stream({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    stream.on('text', (text) => {
      reply.raw.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    stream.on('end', () => {
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
    });

    stream.on('error', (err) => {
      app.log.error(err, 'AI Stream Error');
      reply.raw.write(`data: ${JSON.stringify({ error: 'AI generation failed' })}\n\n`);
      reply.raw.end();
    });

    // Don't send a standard fastify response since we used reply.raw
    return reply;
  });
};
