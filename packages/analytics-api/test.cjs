const { Client } = require('pg'); 
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_XUQPAHSI5ep7@ep-soft-unit-aoevty2w-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' }); 
client.connect().then(() => 
  client.query(`SELECT * FROM (
    SELECT session_id, url, user_agent, MAX(duration_ms) as duration_ms, 
    SUM(error_count) as error_count, MIN(created_at) as start_time, 
    MAX(created_at) as last_activity, SUM(jsonb_array_length(events)) as event_count 
    FROM rum_events 
    WHERE project_id = $1 AND created_at >= NOW() - INTERVAL '24 hours' 
    GROUP BY session_id, url, user_agent
  ) as grouped_sessions ORDER BY last_activity DESC LIMIT 50`, ['test'])
).then(res => { 
  console.log('success', res.rows); 
  process.exit(0); 
}).catch(err => { 
  console.error('DB ERROR:', err.message, err.position); 
  process.exit(1); 
});
