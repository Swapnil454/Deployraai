const { createClient } = require('@clickhouse/client');
const clickhouse = createClient({
  url: 'https://hkv776eruj.ap-south-1.aws.clickhouse.cloud:8443',
  username: 'default',
  password: 'UA~Ac2mV_d0O8',
  database: 'default'
});

async function run() {
  try {
    const rs = await clickhouse.query({
      query: `SELECT span_id, parent_span_id, trace_id, attributes['service.name'] as service, start_time FROM spans WHERE project_id = '6aaaeb61b44c3e52e9fba443' AND attributes['service.name'] = 'FeedBack-Frontend' ORDER BY start_time DESC LIMIT 5`,
      format: 'JSONEachRow'
    });
    console.log(JSON.stringify(await rs.json(), null, 2));
  } catch(e) { console.error(e); }
}
run();
