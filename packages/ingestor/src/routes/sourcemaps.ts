import { FastifyPluginAsync } from 'fastify';
import { validateProjectToken } from '../middleware/auth.js';
import { db } from '../db.js';

export const sourcemapsRouter: FastifyPluginAsync = async (app) => {
  app.post('/', {
    preHandler: validateProjectToken,
    // @ts-ignore - rawBody is a custom fastify plugin config
    config: { rawBody: false },
    bodyLimit: 10 * 1024 * 1024, // 10MB limit per map file
  }, async (req, reply) => {
    const { projectId } = (req as any).auth;
    const { deployId, fileName, sourceUrl, sizeBytes, mapContent } = req.body as any;

    if (!deployId || !fileName || !mapContent) {
      return reply.status(400).send({ error: 'Missing required fields: deployId, fileName, mapContent' });
    }

    // Validate it's actually a source map
    try {
      const parsed = JSON.parse(mapContent);
      if (!parsed.version || !Array.isArray(parsed.sources) || typeof parsed.mappings !== 'string') {
        return reply.status(400).send({ error: 'Invalid source map format (missing version/sources/mappings)' });
      }
    } catch {
      return reply.status(400).send({ error: 'mapContent must be valid JSON string' });
    }

    // Optional fields
    const safeSourceUrl = sourceUrl || null;
    const safeSizeBytes = sizeBytes || Buffer.byteLength(mapContent, 'utf8');

    try {
      await db.query(`
        INSERT INTO sourcemaps (project_id, deploy_id, file_name, source_url, size_bytes, map_content)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (project_id, deploy_id, file_name)
        DO UPDATE SET 
          source_url = EXCLUDED.source_url,
          size_bytes = EXCLUDED.size_bytes,
          map_content = EXCLUDED.map_content, 
          created_at = NOW()
      `, [projectId, deployId, fileName, safeSourceUrl, safeSizeBytes, mapContent]);

      reply.status(201).send({ uploaded: fileName });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to save sourcemap to database');
      reply.status(500).send({ error: 'Internal server error saving sourcemap' });
    }
  });
};
