const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_XUQPAHSI5ep7@ep-soft-unit-aoevty2w-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });
pool.query("SELECT token_hash FROM projects WHERE id = '6aaaeb61b44c3e52e9fba443'").then(async res => {
  const hash = res.rows[0].token_hash;
  console.log("Hash:", hash);
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm9qZWN0SWQiOiI2YWFhZWI2MWI0NGMzZTUyZTlmYmE0NDMiLCJ0eXBlIjoiaW5nZXN0b3IiLCJpYXQiOjE3ODk1ODYyNzUsImV4cCI6MTc5NzM2MjI3NX0._qolfywX2LkGPzpOiMa9dcZCGLAAGgzCksrUcwobmyE';
  console.log("Match:", await bcrypt.compare(token, hash));
  pool.end();
}).catch(console.error);
