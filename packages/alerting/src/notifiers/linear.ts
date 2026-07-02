export async function createLinearIssue(apiKey: string, teamId: string, alert: any, currentValue: number) {
  await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id url } } }`,
      variables: {
        input: {
          teamId,
          title: `[Tracepilot] ${alert.metric} alert on ${alert.projectId}`,
          description: `**Current value:** ${currentValue}\n**Threshold:** ${alert.threshold}\n**Deploy:** ${alert.deployId}`,
          priority: currentValue > alert.threshold * 2 ? 1 : 2, // 1=urgent, 2=high
        }
      }
    }),
    signal: AbortSignal.timeout(5000)
  });
}
