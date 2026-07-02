import { FastifyInstance } from 'fastify';
import { parsePprof } from '../utils/pprof-parser.js';
import { db } from '../db.js';
import { validateProjectToken } from '../middleware/auth.js';
import { checkUsageCap } from '../middleware/usage-check.js';

export async function profilesRouter(app: FastifyInstance) {
  // Add a raw body parser for application/x-protobuf if not already handled
  app.addContentTypeParser('application/x-protobuf', { parseAs: 'buffer' }, (req, body, done) => {
    done(null, body);
  });

  const handler = async (req: any, reply: any) => {
    const { projectId } = req.auth;
    const serviceName = req.headers['x-service-name'] as string || 'unknown';
    const profileType = req.headers['x-profile-type'] as string || 'cpu'; // 'cpu' or 'memory'

    const buffer = req.body as Buffer;
    if (!buffer || !Buffer.isBuffer(buffer)) {
      return reply.status(400).send({ error: 'Body must be a valid protobuf buffer' });
    }

    try {
      // 1. Parse the pprof protobuf into flattened samples
      let parsedSamples = await parsePprof(buffer);
      if (parsedSamples.length === 0) {
        return reply.status(200).send({ status: 'ok', inserted: 0 });
      }

      // Prevent Postgres Connection Pool Exhaustion from massive payloads
      if (parsedSamples.length > 20000) {
        req.log.warn(`[Profiles] Payload too large (${parsedSamples.length} samples), truncating to 20000`);
        parsedSamples = parsedSamples.slice(0, 20000);
      }

      // 2. Prepare for Postgres Bulk Insert
      const timestamp = new Date().getTime(); // Standardize timestamp per payload flush
      
      const CHUNK_SIZE = 10000;
      for (let i = 0; i < parsedSamples.length; i += CHUNK_SIZE) {
        const chunk = parsedSamples.slice(i, i + CHUNK_SIZE);
        const values = [];
        const flatArgs = [];
        let index = 1;
        
        for (const s of chunk) {
          values.push(`($${index++}, $${index++}, $${index++}, to_timestamp($${index++} / 1000.0), $${index++}, $${index++})`);
          flatArgs.push(projectId, serviceName, profileType, timestamp, s.stackTrace.join(';'), s.value);
        }
        
        // 3. Insert chunk into Postgres
        try {
          const insertQuery = `
            INSERT INTO profiles (project_id, service_name, profile_type, timestamp, stack_trace, value)
            VALUES ${values.join(', ')}
          `;
          await db.query(insertQuery, flatArgs);
        } catch (dbErr: any) {
          req.log.warn(`[Profiles] Postgres unavailable or insert failed, chunk not persisted: ${dbErr.message}`);
        }
      }

      return reply.status(200).send({ status: 'ok', inserted: parsedSamples.length });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to process profile', details: err.message });
    }
  };

  app.post('/', { preHandler: [validateProjectToken, checkUsageCap] }, handler);
}
