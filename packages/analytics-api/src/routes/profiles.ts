import { FastifyPluginAsync } from 'fastify';
import { clickhouse } from '../clickhouse.js';
import { requireAuth } from '../middleware/auth.js';
import { buildFlamegraphTrie, ProfileRow } from '../utils/trie.js';

// ─── Zero-Dependency TTL + LRU Cache ────────────────────────────────────────
// Self-contained implementation — no external type resolution issues.
// Caches flamegraph JSON for 60s per unique (project, service, type, window).
interface CacheEntry<V> { value: V; expiresAt: number; }
class TtlCache<V> {
  private map = new Map<string, CacheEntry<V>>();
  constructor(private maxSize: number, private ttlMs: number) {}
  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { this.map.delete(key); return undefined; }
    // LRU: move to end
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }
  set(key: string, value: V): void {
    if (this.map.size >= this.maxSize) {
      // Evict oldest entry (first key in insertion order)
      const first = this.map.keys().next().value;
      if (first) this.map.delete(first);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}
const flamegraphCache = new TtlCache<unknown>(200, 60_000);

// ─── Input Validation Helpers ────────────────────────────────────────────────
const SAFE_NAME_RE = /^[a-zA-Z0-9_\-:./@]+$/;
const VALID_PROFILE_TYPES = new Set(['cpu', 'memory']);

function isValidTimestamp(ts: string): boolean {
  return !isNaN(Date.parse(ts));
}

interface FlamegraphQuery {
  projectId: string;
  serviceName: string;
  profileType?: string;
  startTime: string;
  endTime: string;
}

export const profilesRouter: FastifyPluginAsync = async (app) => {
  // ─── GET /profiles/flamegraph ─────────────────────────────────────────────
  app.get('/flamegraph', {
    preHandler: requireAuth,
  }, async (req, reply) => {
    const {
      projectId,
      serviceName,
      profileType = 'cpu',
      startTime,
      endTime,
    } = req.query as FlamegraphQuery;

    // ── Input Validation ──────────────────────────────────────────────────────
    if (!projectId || !serviceName || !startTime || !endTime) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'projectId, serviceName, startTime, and endTime are required.',
      });
    }

    if (!VALID_PROFILE_TYPES.has(profileType)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `profileType must be one of: ${[...VALID_PROFILE_TYPES].join(', ')}.`,
      });
    }

    if (!SAFE_NAME_RE.test(serviceName)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'serviceName contains invalid characters.',
      });
    }

    if (!isValidTimestamp(startTime) || !isValidTimestamp(endTime)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'startTime and endTime must be valid ISO 8601 timestamps.',
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'startTime must be before endTime.',
      });
    }

    // Max query window guard: reject requests spanning more than 24 hours
    const windowMs = end.getTime() - start.getTime();
    if (windowMs > 24 * 60 * 60 * 1000) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Query window cannot exceed 24 hours. Use a narrower time range.',
      });
    }

    // ── LRU Cache lookup ──────────────────────────────────────────────────────
    // Round timestamps to the nearest minute to maximize cache hits
    const startMin = new Date(Math.floor(start.getTime() / 60_000) * 60_000).toISOString();
    const endMin = new Date(Math.floor(end.getTime() / 60_000) * 60_000).toISOString();
    const cacheKey = `${projectId}::${serviceName}::${profileType}::${startMin}::${endMin}`;

    const cached = flamegraphCache.get(cacheKey);
    if (cached) {
      req.log.info({ cacheKey }, '[Profiles] Serving flamegraph from LRU cache');
      reply.header('X-Cache', 'HIT');
      return reply.status(200).send(cached);
    }

    try {
      // ─── ClickHouse Query (fully parameterized) ────────────────────────────────
      let query = '';
      let queryParams: Record<string, unknown> = {};
      
      if (false) {
        // Removed demo code
      } else {
        query = `
          SELECT stack_trace, sum(value) AS total_value
          FROM profiles
          WHERE project_id = {projectId: String}
            AND service_name = {serviceName: String}
            AND profile_type = {profileType: String}
            AND timestamp >= {startTime: DateTime64}
            AND timestamp <= {endTime: DateTime64}
          GROUP BY stack_trace
          ORDER BY total_value DESC
          LIMIT 5000
        `;
        queryParams = {
          projectId,
          serviceName,
          profileType,
          startTime: Math.floor(start.getTime()),
          endTime: Math.floor(end.getTime())
        };
      }

      const resultSet = await clickhouse.query({
        query,
        query_params: queryParams,
        format: 'JSONEachRow'
      });
      const rows = await resultSet.json<any>();

      if (!rows || rows.length === 0) {
        const empty = { name: 'root', value: 0 };
        return reply.status(200).send(empty);
      }

      const profileRows: ProfileRow[] = rows.map((row) => ({
        stack_trace: (row.stack_trace || '').split(';'),
        total_value: Number(row.total_value),
      }));

      // ── Build Trie ────────────────────────────────────────────────────────────
      const trie = buildFlamegraphTrie(profileRows);

      // ── Cache the result ──────────────────────────────────────────────────────
      flamegraphCache.set(cacheKey, trie);
      reply.header('X-Cache', 'MISS');

      return reply.status(200).send(trie);

    } catch (err: any) {
      req.log.error({ err, projectId, serviceName }, '[Profiles] Failed to generate flamegraph');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to generate flamegraph. Please try again.',
      });
    }
  });

  // ─── GET /profiles/services ───────────────────────────────────────────────
  app.get('/services', {
    preHandler: requireAuth,
  }, async (req, reply) => {
    const { projectId } = req.query as { projectId: string };
    
    if (!projectId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'projectId is required' });
    }
    
    try {
      const query = `
        SELECT DISTINCT service_name
        FROM profiles
        WHERE project_id = {projectId: String}
      `;
      const resultSet = await clickhouse.query({
        query,
        query_params: { projectId },
        format: 'JSONEachRow'
      });
      const rows = await resultSet.json<any>();
      
      const services = rows.map(r => r.service_name);
      
      // Removed demo injection
      
      return reply.status(200).send({ services });
    } catch (err: any) {
      req.log.error({ err, projectId }, '[Profiles] Failed to fetch services');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
