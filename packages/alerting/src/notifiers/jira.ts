export async function createJiraIssue(domain: string, email: string, apiToken: string, projectKey: string, alert: any, value: number) {
  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  await fetch(`https://${domain}.atlassian.net/rest/api/3/issue`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        issuetype: { name: 'Bug' },
        summary: `[Tracepilot] ${alert.metric} alert: ${value}`,
        description: {
          type: 'doc', version: 1, // Atlassian Document Format — not plain text
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: `Metric: ${alert.metric} | Value: ${value} | Threshold: ${alert.threshold}` }]
          }]
        }
      }
    }),
    signal: AbortSignal.timeout(5000)
  });
}
