import { FastifyPluginAsync } from 'fastify';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { redis } from '../index.js';
import { buildFingerprintContext } from '../context-builder.js';
import { requireAuth } from '../middleware/auth.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');

export const aiRouter: FastifyPluginAsync = async (app) => {
  app.post('/explain', { preHandler: requireAuth }, async (req, reply) => {
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

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    // Support aborting the request if the client disconnects early
    const abortController = new AbortController();
    
    req.raw.on('close', () => {
      app.log.info('Client closed connection early. Aborting Gemini generation.');
      abortController.abort();
    });

    try {
      const result = await model.generateContentStream(
        { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
        { signal: abortController.signal }
      );

      for await (const chunk of result.stream) {
        const text = chunk.text();
        reply.raw.write(`data: ${JSON.stringify({ text })}\n\n`);
      }

      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('abort')) {
        app.log.info('Gemini stream aborted successfully.');
        reply.raw.end();
      } else {
        app.log.error(err, 'AI Stream Error');
        reply.raw.write(`data: ${JSON.stringify({ error: 'AI generation failed' })}\n\n`);
        reply.raw.end();
      }
    }

    // Don't send a standard fastify response since we used reply.raw
    return reply;
  });
};

