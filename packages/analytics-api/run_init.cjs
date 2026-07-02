import fs from 'fs';
import { createClient } from '@clickhouse/client';
import path from 'path';

const clickhouse = createClient({
  url: 'http://localhost:8123',
  username: 'default',
  password: '',
  database: 'default',
});

async function main() {
  try {
    const sqlPath = path.join(process.cwd(), 'packages', 'infrastructure', 'clickhouse', 'init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split on double newlines or simply execute the missing statements.
    // ClickHouse client doesn't support multiple statements per query natively, so we have to split them.
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    
    for (const stmt of statements) {
      console.log('Executing:', stmt.substring(0, 50) + '...');
      await clickhouse.command({ query: stmt });
    }
    console.log('Done!');
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
