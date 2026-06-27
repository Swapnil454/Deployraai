import bcrypt from 'bcrypt';

export async function syncProjectToPostgres(project) {
  try {
    const { pool } = await import('../config/postgres.js');
    
    let tokenHash = 'disabled';
    if (project.analytics?.trackingId) {
      // The Ingestor uses bcrypt.compare(token, token_hash)
      tokenHash = await bcrypt.hash(project.analytics.trackingId, 10);
    }
    
    const query = `
      INSERT INTO projects (id, name, platform, token_hash, user_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        platform = EXCLUDED.platform,
        token_hash = EXCLUDED.token_hash,
        user_id = EXCLUDED.user_id
    `;
    const values = [
      project._id.toString(),
      project.repoName || 'Unnamed Project',
      'vercel',
      tokenHash,
      project.userId?.toString() || null
    ];

    await pool.query(query, values);
    console.log("[PostgresSync] Successfully synced project: " + project._id.toString());
  } catch (err) {
    console.error("[PostgresSync] Error syncing project to Postgres:", err);
  }
}
