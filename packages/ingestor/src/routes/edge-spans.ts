import { FastifyPluginAsync } from 'fastify';

export const edgeSpansRouter: FastifyPluginAsync = async (app) => {
  // Edge span endpoint placeholder
  app.post('/', async (req, reply) => {
    reply.status(202).send();
  });
};
