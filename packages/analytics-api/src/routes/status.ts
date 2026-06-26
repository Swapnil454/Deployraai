import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';

export const publicStatusRouter: FastifyPluginAsync = async (app) => {
  // GET /public/status/:projectId
  app.get('/status/:projectId', async (req, reply) => {
    const { projectId } = req.params as any;
    
    // Check if project exists and fetch name
    const projectRes = await db.query('SELECT name FROM projects WHERE id = $1', [projectId]);
    if (projectRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    const projectName = projectRes.rows[0].name;

    // Fetch the last 24 hours of synthetic checks
    const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const checksRes = await db.query(`
      SELECT 
        status_code, 
        latency_ms, 
        checked_at,
        region
      FROM synthetic_checks
      WHERE project_id = $1 AND checked_at >= $2
      ORDER BY checked_at ASC
    `, [projectId, fromDate]);

    const checks = checksRes.rows;

    // Group by region
    const regions: Record<string, any> = {};
    for (const c of checks) {
      if (!regions[c.region]) {
        regions[c.region] = {
          name: c.region,
          totalChecks: 0,
          successfulChecks: 0,
          checks: [],
          currentLatency: 0,
          isUp: true
        };
      }
      
      const isSuccessful = c.status_code >= 200 && c.status_code < 400;
      regions[c.region].totalChecks++;
      if (isSuccessful) regions[c.region].successfulChecks++;
      
      regions[c.region].checks.push({
        time: c.checked_at,
        isUp: isSuccessful,
        latency: c.latency_ms
      });
      
      regions[c.region].isUp = isSuccessful;
      regions[c.region].currentLatency = c.latency_ms;
    }

    const regionsList = Object.values(regions).map(r => {
      r.uptimePercentage = r.totalChecks > 0 ? ((r.successfulChecks / r.totalChecks) * 100).toFixed(2) : '100.00';
      return r;
    });

    const isGlobalUp = regionsList.length > 0 ? regionsList.every(r => r.isUp) : true;

    return {
      project: projectName,
      isUp: isGlobalUp,
      regions: regionsList
    };
  });
};
