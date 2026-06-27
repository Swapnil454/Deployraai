import { db } from '../db.js';
import { clickhouse } from '../clickhouse.js';
import Stripe from 'stripe';

// Initialize Stripe (placeholder key, should come from env)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

// Assume 1 unit = 100,000 spans
const SPAN_UNIT = 100_000;

export async function aggregateBilling() {
  console.log('Running daily billing aggregation...');
  try {
    // 1. Get all projects that have a Stripe Customer ID and Subscription Item ID
    // (We would add these columns to the `teams` or `projects` table. For now, assume it's on projects)
    // ALTER TABLE projects ADD COLUMN stripe_customer_id TEXT, ADD COLUMN stripe_subscription_item_id TEXT;
    
    const projectsRes = await db.query(`
      SELECT id, team_id, stripe_subscription_item_id, stripe_customer_id 
      FROM projects 
      WHERE stripe_customer_id IS NOT NULL
    `);

    for (const project of projectsRes.rows) {
      // 2. Query ClickHouse for total spans ingested in the last 24 hours for this project
      const chRes = await clickhouse.query({
        query: `
          SELECT sum(request_count) as total_spans
          FROM metrics_minutely_mv
          WHERE project_id = {projectId: String}
            AND bucket >= now() - INTERVAL 1 DAY
        `,
        query_params: { projectId: project.id },
        format: 'JSONEachRow'
      });

      const data = await chRes.json<any[]>();
      const totalSpans = parseInt((data[0] as any)?.total_spans || '0', 10);

      if (totalSpans > 0) {
        // Stripe expects integers for units. If we charge per 100k spans:
        const units = Math.ceil(totalSpans / SPAN_UNIT);

        // 3. Push to Stripe Metered Billing API (V2 Meter Events)
        // Ensure idempotency for the given day to prevent double-billing
        const todayStr = new Date().toISOString().split('T')[0];
        const idempotencyKey = `spans_${project.id}_${todayStr}`;

        await (stripe.billing.meterEvents as any).create({
          event_name: 'spans_ingested',
          payload: {
            stripe_customer_id: project.stripe_customer_id,
            value: units.toString(),
          },
          identifier: idempotencyKey,
        });
        console.log(`Billed project ${project.id} for ${units} units (${totalSpans} spans)`);
      }
    }
  } catch (err) {
    console.error('Failed to aggregate billing:', err);
  }
}

// In production, this would run once a day
if (process.env.RUN_BILLING_WORKER === 'true') {
  setInterval(aggregateBilling, 24 * 60 * 60 * 1000);
  aggregateBilling(); // run on startup if enabled
}
