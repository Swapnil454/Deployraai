import { defineWorkflow } from "../services/workflow.service.js";

// A sample workflow to test durable execution and sleep
defineWorkflow("welcome-email-sequence", 1, async ({ payload, step, sleep }) => {
  const { email, name } = payload;

  // Step 1: Create user (mock)
  const userId = await step.run("create_user_v1", async () => {
    console.log(`[Action] Creating user account for ${email}...`);
    // Simulate DB delay
    await new Promise((res) => setTimeout(res, 1000));
    return `usr_${Math.random().toString(36).substr(2, 9)}`;
  }, { maxAttempts: 3, backoff: '30s', label: 'Create User Account' });

  // Step 2: Send welcome email (mock) - fails 50% of time to test retries
  await step.run("send_welcome_email_v1", async () => {
    console.log(`[Action] Sending welcome email to ${email}...`);
    if (Math.random() > 0.5) {
      throw new Error("SMTP connection timeout");
    }
    await new Promise((res) => setTimeout(res, 500));
    return { sent: true, template: "welcome" };
  }, { maxAttempts: 4, backoff: '10s', label: 'Send Welcome Email' });

  // Sleep for 1 minute (to test the cron awakened replay)
  await sleep("wait_1_minute_v1", "1m");

  // Step 3: Send follow-up
  await step.run("send_followup_email_v1", async () => {
    console.log(`[Action] Sending follow-up email to ${email} (User ID: ${userId})...`);
    await new Promise((res) => setTimeout(res, 500));
    return { sent: true, template: "followup" };
  }, { label: 'Send Follow-up Email' });

  return { success: true, userId };
});
