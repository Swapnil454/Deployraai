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

// Attach custom attributes to the current active span
// Useful in route handlers: track("user.id", userId)
export function track(key: string, value: string | number | boolean) {
  if (!isEnabled()) return;
  const span = trace.getActiveSpan();
  if (span) span.setAttribute(`app.${key}`, value);
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
