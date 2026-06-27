const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_XUQPAHSI5ep7@ep-soft-unit-aoevty2w-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' });
c.connect()
  .then(() => c.query(`SELECT events->0 as first_event FROM rum_events WHERE session_id = 'sess_i9ur55gamqwrtutf'`))
  .then(r => { 
    console.log('First event:', JSON.stringify(r.rows[0]?.first_event)); 
    process.exit(0); 
  })
  .catch(e => { console.error(e.message); process.exit(1); });
