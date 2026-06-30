import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { sseEmitter, subscribeToChannel, unsubscribeFromChannel } from '../utils/sse-manager.js';

export const logsStreamRouter: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/stream', async (req, reply) => {
    const { projectId } = req.query as any;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // Prevent Nginx buffering

    const channel = `logs:${projectId}`;

    const listener = (message: string) => {
      reply.raw.write(`data: ${message}\n\n`);
    };

    sseEmitter.on(channel, listener);
    await subscribeToChannel(channel);

    // Wait until the client disconnects. Wrapping in a Promise is CRITICAL — without it,
    // the async route handler never resolves, and Node.js permanently holds the request
    // context in memory for every open SSE connection, causing a slow guaranteed OOM crash.
    await new Promise<void>((resolve) => {
      req.raw.on('close', () => {
        sseEmitter.off(channel, listener);
        unsubscribeFromChannel(channel);
        resolve();
      });
    });
  });
};
