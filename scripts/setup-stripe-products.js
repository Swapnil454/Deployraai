// scripts/setup-stripe-products.js
const Stripe = require('stripe');

// For script, use the secret key directly if running locally, or replace this string if needed
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');

async function run() {
  try {
    const product = await stripe.products.create({ name: 'Tracepilot Observability' });
    const price = await stripe.prices.create({
      product: product.id,
      currency: 'usd',
      recurring: { interval: 'month', usage_type: 'metered', aggregate_usage: 'sum' },
      unit_amount: 50, // $0.50 per 100k spans = $0.0005 per span
      nickname: 'Per span metered',
    });
    console.log('\n✓ Setup complete. Add this to your .env files:');
    console.log(`STRIPE_PRICE_ID=${price.id}`);
    console.log(`\nAlso add to server/.env and packages/ingestor/.env`);
  } catch (err) {
    console.error('Failed to create Stripe product/price:', err.message);
  }
}

run();
