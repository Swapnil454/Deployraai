import { SpanRecord } from '../writers/spans.js';

export function parseOTLPSpans(body: any, ctx: { projectId: string, deployId: string }): SpanRecord[] {
  const spans: SpanRecord[] = [];
  
  if (!body.resourceSpans || !Array.isArray(body.resourceSpans)) {
    return spans;
  }

  for (const resourceSpan of body.resourceSpans) {
    if (!resourceSpan.scopeSpans) continue;
    
    for (const scopeSpan of resourceSpan.scopeSpans) {
      if (!scopeSpan.spans) continue;
      
      for (const otelSpan of scopeSpan.spans) {
        // Enforce the projectId and deployId from the authenticated context (JWT)
        // Never trust the project ID from the raw payload
        
        // Extract attributes into a simple key-value map
        const attributes: Record<string, any> = {};
        if (Array.isArray(otelSpan.attributes)) {
          for (const attr of otelSpan.attributes) {
            // OTLP attributes have different value types (stringValue, intValue, etc.)
            const value = attr.value?.stringValue ?? 
                          attr.value?.intValue ?? 
                          attr.value?.boolValue ?? 
                          attr.value?.doubleValue ?? 
                          null;
            attributes[attr.key] = value;
          }
        }

        // Add resource attributes as well if they exist
        if (Array.isArray(resourceSpan.resource?.attributes)) {
          for (const attr of resourceSpan.resource.attributes) {
             const value = attr.value?.stringValue ?? 
                           attr.value?.intValue ?? 
                           attr.value?.boolValue ?? 
                           attr.value?.doubleValue ?? 
                           null;
             attributes[attr.key] = value;
          }
        }

        spans.push({
          projectId: ctx.projectId,
          deployId: ctx.deployId || attributes['deployment.id'] || 'unknown',
          traceId: otelSpan.traceId,
          spanId: otelSpan.spanId,
          parentSpanId: otelSpan.parentSpanId || null,
          name: otelSpan.name || 'unnamed',
          // OTLP sends time in unix nano format (string or number depending on version)
          startTime: new Date(Number(otelSpan.startTimeUnixNano) / 1_000_000),
          endTime: new Date(Number(otelSpan.endTimeUnixNano) / 1_000_000),
          durationMs: (Number(otelSpan.endTimeUnixNano) - Number(otelSpan.startTimeUnixNano)) / 1_000_000,
          // OTLP Status Code: 0 = UNSET, 1 = OK, 2 = ERROR
          statusCode: otelSpan.status?.code || 0,
          attributes,
          events: otelSpan.events || [],
        });
      }
    }
  }

  return spans;
}
