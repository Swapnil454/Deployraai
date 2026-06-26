import express from 'express';
import Stripe from 'stripe';
import User from '../models/User.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');

router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'invoice.payment_failed') {
    const customerId = event.data.object.customer;
    // Suspend all projects for this customer
    await User.findOneAndUpdate(
      { stripeCustomerId: customerId },
      { billingStatus: 'suspended' }
    );
    console.log(`[Billing] Suspended user with Stripe Customer ID: ${customerId}`);
  }

  if (event.type === 'invoice.payment_succeeded') {
    const customerId = event.data.object.customer;
    await User.findOneAndUpdate(
      { stripeCustomerId: customerId },
      { billingStatus: 'active' }
    );
    console.log(`[Billing] Activated user with Stripe Customer ID: ${customerId}`);
  }

  res.json({ received: true });
});

export default router;
