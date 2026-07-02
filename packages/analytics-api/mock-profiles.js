import 'dotenv/config';
import pg from 'pg';

async function run() {
  const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const projectId = '6a2c3b57d3a51ae19d6450da';
  const serviceName = 'go-profiler-test';
  
  const samples = [
    {stack_trace: 'root;main;app_init', value: 50},
    {stack_trace: 'root;main;handle_request;db_query', value: 120},
    {stack_trace: 'root;main;handle_request;render_ui', value: 80},
    {stack_trace: 'root;main;background_task;gc', value: 40}
  ];
  
  try {
    // Insert mock data for every 10 minutes for the past 24 hours AND the next 24 hours!
    // This guarantees we hit the 30-minute window regardless of local timezone skew.
    for (let i = -144; i <= 144; i++) {
      const d = new Date();
      d.setMinutes(d.getMinutes() + (i * 10));
      const ts = d.toISOString();
      
      for (const s of samples) {
        await p.query('INSERT INTO profiles (project_id, service_name, profile_type, "timestamp", stack_trace, "value") VALUES ($1, $2, $3, $4, $5, $6)', [projectId, serviceName, 'cpu', ts, s.stack_trace, s.value]);
        await p.query('INSERT INTO profiles (project_id, service_name, profile_type, "timestamp", stack_trace, "value") VALUES ($1, $2, $3, $4, $5, $6)', [projectId, serviceName, 'memory', ts, s.stack_trace, s.value * 1024 * 1024]);
      }
    }
    console.log('Massive spread of mock profiles inserted!');
  } catch (err) {
    console.error(err);
  } finally {
    p.end();
  }
}

run();
