import { FastifyInstance } from 'fastify';
import { parsePprof } from '../utils/pprof-parser.js';
import { validateProjectToken } from '../middleware/auth.js';
import { checkUsageCap } from '../middleware/usage-check.js';
import { profileWriter, ProfileRecord } from '../writers/profiles.js';

export async function profilesRouter(app: FastifyInstance) {
  const handler = async (req: any, reply: any) => {
    console.log('[Ingestor] Received profiles payload:', {
      projectId: req.auth?.projectId,
      serviceName: req.headers['x-service-name'],
      profileType: req.headers['x-profile-type'],
      contentLength: req.headers['content-length']
    });
    const { projectId } = req.auth;
    const serviceName = (req.headers['x-service-name'] as string) || 'unknown';
    const profileType = (req.headers['x-profile-type'] as string) || 'cpu'; // 'cpu' or 'memory'

    const buffer = req.body as Buffer;
    if (!buffer || !Buffer.isBuffer(buffer)) {
      console.error('[Ingestor] Bad request: body is not a buffer', typeof req.body);
      return reply.status(400).send({ error: 'Body must be a valid protobuf buffer' });
    }

    // Defer the heavy CPU parsing and DB formatting to a microtask 
    // so we can respond instantly to the telemetry SDK.
    const processProfilesAsync = async () => {
      try {
        // 1. Parse the pprof protobuf into flattened samples
        let parsedSamples = await parsePprof(buffer);
        if (parsedSamples.length === 0) return;

        // 2. Prepare ProfileRecords
        const timestamp = new Date(); // Standardize timestamp per payload flush
        const records: ProfileRecord[] = parsedSamples.map(s => ({
          projectId,
          serviceName,
          profileType,
          timestamp,
          stackTrace: s.stackTrace.join(';'),
          value: s.value
        }));

        // 3. Hand off to the buffered async writer
        await profileWriter.write(records);
      } catch (err: any) {
        req.log.error({ err, projectId }, '[Profiles] Failed to parse and buffer profile payload');
      }
    };

    // Fire and forget
    processProfilesAsync();

    // 4. Return immediately to prevent SDK connection timeouts
    return reply.status(202).send({ status: 'accepted' });
  };

  app.post('/', { preHandler: [validateProjectToken, checkUsageCap] }, handler);
}

