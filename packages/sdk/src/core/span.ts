import { trace, SpanStatusCode, SpanKind, context } from '@opentelemetry/api';
import { isEnabled } from './config';

const tracer = trace.getTracer('@yourplatform/sdk', '0.1.0');

// The main helper your user can call (or your framework wrappers use internally)
export async function withSpan<T>(
  name: string,
  fn: (span: ReturnType<typeof tracer.startSpan>) => Promise<T>,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  }
): Promise<T> {
  if (!isEnabled()) return fn(null as any);

  return tracer.startActiveSpan(name, { kind: options?.kind ?? SpanKind.INTERNAL }, async (span) => {
    if (options?.attributes) {
      span.setAttributes(options.attributes);
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      // Record the full exception on the span
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (err as Error).message,
      });
      throw err; // re-throw — don't swallow errors
    } finally {
      span.end();
    }
  });
}

// Overload signatures
export function track(key: string, value: string | number | boolean): void;
export function track(eventName: string, payload: Record<string, string | number | boolean>): void;

// Implementation
export function track(
  nameOrKey: string,
  valueOrPayload: string | number | boolean | Record<string, string | number | boolean>
): void {
  if (!isEnabled()) return;

  if (typeof valueOrPayload === 'object' && valueOrPayload !== null) {
    // Custom business event — create its own span
    const span = tracer.startSpan(nameOrKey);
    span.setAttribute('custom.event', true);
    span.setAttribute('event.name', nameOrKey);
    // Flatten payload as span attributes
    for (const [k, v] of Object.entries(valueOrPayload)) {
      span.setAttribute(`event.${k}`, v);
    }
    span.end(); // end immediately — it's an instantaneous event
  } else {
    // Original behavior — attribute on active span
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) activeSpan.setAttribute(`app.${nameOrKey}`, valueOrPayload);
  }
}

// Record an error on the current span without throwing
export function captureError(err: Error, context?: Record<string, string>) {
  if (!isEnabled()) return;
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    if (context) span.setAttributes(context);
  }
}
