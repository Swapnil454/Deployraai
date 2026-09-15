import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), 'packages/ingestor/.env'), override: true });

async function run() {
  try {
    const { db } = await import('./packages/ingestor/src/db.js');
    console.log("Seeding mock issues...");
    await db.query('DELETE FROM issues');
    
    const projectId = "6aa6c88d397c2ec071a05583";
    const now = new Date();
    
    const mockIssues = [
      {
        title: "TypeError: Cannot read properties of undefined (reading 'id')",
        message: "Attempted to access user.id but user was undefined in checkout flow",
        fingerprint: "fprint_1",
        status: "open",
        severity: "critical",
        event_count: 145,
        affected_users: 82,
      },
      {
        title: "ConnectionTimeoutError",
        message: "Failed to connect to Redis cache after 5000ms",
        fingerprint: "fprint_2",
        status: "open",
        severity: "warning",
        event_count: 34,
        affected_users: 12,
      },
      {
        title: "Error: Unexpected token < in JSON at position 0",
        message: "Failed to parse API response from payment gateway",
        fingerprint: "fprint_3",
        status: "regressed",
        severity: "error",
        event_count: 890,
        affected_users: 412,
      },
      {
        title: "DatabaseError: Deadlock detected",
        message: "Transaction rollback due to deadlock in orders table",
        fingerprint: "fprint_4",
        status: "resolved",
        severity: "critical",
        event_count: 12,
        affected_users: 5,
      }
    ];

    for (let i = 0; i < mockIssues.length; i++) {
      const issue = mockIssues[i];
      const time = new Date(now.getTime() - i * 3600000); // spread over last few hours
      
      await db.query(`
        INSERT INTO issues (
          project_id, title, message, status, severity, event_count, affected_users,
          first_seen_at, last_seen_at, fingerprint
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
      `, [
        projectId, issue.title, issue.message, issue.status, issue.severity,
        issue.event_count, issue.affected_users,
        new Date(time.getTime() - 86400000), // First seen 1 day ago
        time,
        issue.fingerprint
      ]);
    }

    console.log("Successfully seeded mock issues!");
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();
