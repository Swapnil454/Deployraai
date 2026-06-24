import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isEnabled } from './config';

// Sets up global uncaught exception handlers.
// Called once at SDK init — captures things like unhandled Promise rejections.
export function setupGlobalErrorCapture() {
  if (!isEnabled()) return;

  process.on('uncaughtException', (err) => {
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.setAttribute('error.type', 'uncaughtException');
    }
    // Don't call process.exit() — let the framework handle it
  });

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.setAttribute('error.type', 'unhandledRejection');
    }
  });
}
