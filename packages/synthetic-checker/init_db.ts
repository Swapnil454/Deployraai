import { db } from './src/db.js';
import fs from 'fs';
import path from 'path';

async function run() {
  const files = [
    '../infrastructure/postgres/init.sql',
    '../infrastructure/postgres/patch_step4.sql',
    '../infrastructure/postgres/patch_step5.sql',
    '../infrastructure/postgres/phase4_rbac.sql',
    '../infrastructure/postgres/phase4_slo.sql',
    '../infrastructure/postgres/migrations/002_add_deployment_url.sql'
  ];
  for (const file of files) {
    const p = path.resolve(process.cwd(), file);
    if (fs.existsSync(p)) {
      console.log('Running ' + file);
      const sql = fs.readFileSync(p, 'utf8');
      await db.query(sql);
    } else {
      console.error('Missing ' + file);
    }
  }
  process.exit(0);
}
run();
