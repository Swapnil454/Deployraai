// packages/alerting/src/notifiers/pagerduty.ts
export async function sendPagerDutyAlert(routingKey: string, alert: any, currentValue: number) {
  // PagerDuty Events API v2
  await fetch('https://events.pagerduty.com/v2/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      routing_key: routingKey,
      event_action: 'trigger',
      dedup_key: `tracepilot-${alert.id}`, // prevents duplicate pages for same alert
      payload: {
        summary: `[Tracepilot] ${alert.metric} alert: ${currentValue} (threshold: ${alert.threshold})`,
        severity: currentValue > alert.threshold * 2 ? 'critical' : 'error',
        source: 'tracepilot',
        custom_details: {
          project_id: alert.projectId,
          metric: alert.metric,
          current_value: currentValue,
          threshold: alert.threshold,
          deploy_id: alert.deployId,
        },
      },
    }),
  }).catch(() => {});
}

// To RESOLVE the alert when metric recovers (critical — without this PagerDuty keeps paging)
export async function resolvePagerDutyAlert(routingKey: string, alertId: string) {
  await fetch('https://events.pagerduty.com/v2/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      routing_key: routingKey,
      event_action: 'resolve',       // ← must send resolve when metric recovers
      dedup_key: `tracepilot-${alertId}`,
    }),
  }).catch(() => {});
}
