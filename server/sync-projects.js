import mongoose from 'mongoose';
import 'dotenv/config';
import bcrypt from 'bcrypt';
import pg from 'pg';

const { Pool } = pg;

async function syncAll() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected.");

  console.log("Connecting to Postgres...");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      platform VARCHAR(255),
      token_hash TEXT,
      user_id VARCHAR(255),
      rum_write_key VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Connect directly to the 'projects' collection
  const projects = await mongoose.connection.collection('projects').find({}).toArray();
  console.log(`Found ${projects.length} projects in MongoDB.`);

  for (const project of projects) {
    if (!project.analytics?.trackingId) {
        console.log(`Skipping project ${project._id} (no trackingId)`);
        continue;
    }
    const tokenHash = await bcrypt.hash(project.analytics.trackingId, 10);
    
    const query = `
      INSERT INTO projects (id, name, platform, token_hash, user_id, rum_write_key)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        token_hash = EXCLUDED.token_hash,
        name = EXCLUDED.name
    `;
    const values = [
      project._id.toString(),
      project.repoName || 'Unnamed',
      'vercel',
      tokenHash,
      project.userId?.toString() || null,
      project.analytics?.rumWriteKey || null
    ];
    await pool.query(query, values);
    console.log(`Successfully synced project ${project._id} to Postgres.`);
  }

  console.log("Done.");
  process.exit(0);
}

syncAll().catch(console.error);
