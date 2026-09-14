const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { pool } = require('./src/config/postgres.js');

async function run() {
  try {
    const projectId = '6aa6c88d397c2ec071a05583';
    const serviceName = 'go-profiler-test (Demo)';
    
    // Check columns
    const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles'");
    console.log("Columns in 'profiles':", res.rows.map(r => r.column_name));

    // Add mock data for CPU profiling
    const mockData = [
      { type: 'cpu', stack: 'main;http_handler;process_request', value: 450 },
      { type: 'cpu', stack: 'main;http_handler;process_request;json_parse', value: 120 },
      { type: 'cpu', stack: 'main;http_handler;process_request;db_query', value: 250 },
      { type: 'cpu', stack: 'main;background_worker;garbage_collect', value: 80 },
      { type: 'cpu', stack: 'main;background_worker;sync_state', value: 60 },
      { type: 'cpu', stack: 'main;http_handler;auth_middleware', value: 90 },
      
      // Add memory profiling data as well
      { type: 'memory', stack: 'main;http_handler;process_request;json_parse', value: 1024 * 1024 * 50 }, // 50MB
      { type: 'memory', stack: 'main;http_handler;process_request;db_results', value: 1024 * 1024 * 120 }, // 120MB
      { type: 'memory', stack: 'main;cache_manager;in_memory_store', value: 1024 * 1024 * 400 } // 400MB
    ];

    for (let i = 0; i < 50; i++) {
        for (const data of mockData) {
            // Distribute over the last 30 minutes
            const timestamp = new Date(Date.now() - Math.random() * 30 * 60 * 1000);
            const value = Math.round(data.value + (Math.random() * data.value * 0.2)); // Add some variance
            
            await pool.query(
              'INSERT INTO profiles (project_id, service_name, profile_type, timestamp, stack_trace, value) VALUES ($1, $2, $3, $4, $5, $6)',
              [projectId, serviceName, data.type, timestamp, data.stack, value]
            );
        }
    }
    console.log('Successfully inserted mock profiling data');
  } catch (err) {
    console.error('Error inserting data:', err);
  } finally {
    await pool.end();
  }
}
run();
