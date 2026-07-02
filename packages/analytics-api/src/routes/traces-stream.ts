import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { sseEmitter, subscribeToChannel, unsubscribeFromChannel } from '../utils/sse-manager.js';

export const tracesStreamRouter: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  app.get('/stream', async (req, reply) => {
    const { projectId } = req.query as any;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    // Ensure we handle CORS correctly for stream
    reply.raw.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // Prevent Nginx buffering

    // Send an initial heartbeat
    reply.raw.write(':\n\n');

    const channel = `traces:${projectId}`;

    const listener = (message: string) => {
      // message is a JSON array string of root spans published by SpanWriter
      reply.raw.write(`data: ${message}\n\n`);
    };

    sseEmitter.on(channel, listener);
    await subscribeToChannel(channel);

    // Wait until the client disconnects. Wrapping in a Promise is CRITICAL — without it,
    // the async route handler never resolves, and Node.js permanently holds the request 
    // context (headers, closure, stack frame) in memory. Over thousands of SSE connections 
    // this causes a slow but guaranteed OOM crash.
    await new Promise<void>((resolve) => {
      req.raw.on('close', () => {
        sseEmitter.off(channel, listener);
        unsubscribeFromChannel(channel);
        resolve();
      });
    });
  });
};
