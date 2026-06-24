import { FastifyPluginAsync } from 'fastify';
import { validateProjectToken } from '../middleware/auth.js';
import { parseOTLPSpans } from '../parsers/otlp.js';
import { spanWriter } from '../writers/spans.js';

export const tracesRouter: FastifyPluginAsync = async (app) => {
  app.post('/', {
    preHandler: validateProjectToken,
  }, async (req, reply) => {
    const { projectId, deployId } = (req as any).auth;

    // OTEL sends protobuf or JSON — we accept JSON (easier to start)
    const body = req.body as any;
    const spans = parseOTLPSpans(body, { projectId, deployId });

    // Write to DB asynchronously — don't make the SDK wait
    spanWriter.write(spans).catch(err => {
      req.log.error({ err }, 'Failed to write spans');
    });

    // Respond immediately — 202 Accepted
    reply.status(202).send({ accepted: spans.length });
  });
};
