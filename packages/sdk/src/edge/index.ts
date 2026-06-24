declare var EdgeRuntime: string | undefined;

export function withEdgeTracepilot(handler: any) {
  return async function (request: Request, ...args: any[]) {
    const token = process.env.TRACEPILOT_TOKEN;
    const ingestorUrl = process.env.TRACEPILOT_INGESTOR_URL || 'https://ingestor.deployai.in';

    if (!token) {
      return handler(request, ...args);
    }

    const startTime = Date.now();
    const isEdge = typeof EdgeRuntime !== 'undefined' || 'worker' in request;
    
    try {
      const response = await handler(request, ...args);
      
      const durationMs = Date.now() - startTime;
      
      // Async flush using fetch
      // We don't await this so it doesn't block the response
      fetch(`${ingestorUrl}/v1/traces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          resourceSpans: [
            {
              resource: { attributes: [{ key: 'service.name', value: { stringValue: 'edge-function' } }] },
              scopeSpans: [
                {
                  spans: [
                    {
                      traceId: crypto.randomUUID().replace(/-/g, ''),
                      spanId: crypto.randomUUID().replace(/-/g, '').substring(0, 16),
                      name: new URL(request.url).pathname,
                      startTimeUnixNano: (startTime * 1_000_000).toString(),
                      endTimeUnixNano: (Date.now() * 1_000_000).toString(),
                      status: { code: response.status >= 400 ? 2 : 1 },
                      attributes: [
                        { key: 'http.method', value: { stringValue: request.method } },
                        { key: 'http.url', value: { stringValue: request.url } },
                        { key: 'http.status_code', value: { intValue: response.status } },
                        { key: 'runtime', value: { stringValue: isEdge ? 'edge' : 'node' } }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        })
      }).catch(err => console.error('Tracepilot Edge flush failed', err));

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      fetch(`${ingestorUrl}/v1/traces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          resourceSpans: [
            {
              resource: { attributes: [{ key: 'service.name', value: { stringValue: 'edge-function' } }] },
              scopeSpans: [
                {
                  spans: [
                    {
                      traceId: crypto.randomUUID().replace(/-/g, ''),
                      spanId: crypto.randomUUID().replace(/-/g, '').substring(0, 16),
                      name: new URL(request.url).pathname,
                      startTimeUnixNano: (startTime * 1_000_000).toString(),
                      endTimeUnixNano: (Date.now() * 1_000_000).toString(),
                      status: { code: 2 },
                      attributes: [
                        { key: 'http.method', value: { stringValue: request.method } },
                        { key: 'http.url', value: { stringValue: request.url } },
                        { key: 'runtime', value: { stringValue: isEdge ? 'edge' : 'node' } }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        })
      }).catch(err => console.error('Tracepilot Edge flush failed', err));

      throw error;
    }
  };
}
