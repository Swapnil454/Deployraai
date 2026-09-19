import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isEnabled } from './config';

// Sets up global uncaught exception handlers.
// Called once at SDK init — captures things like unhandled Promise rejections.
export function setupGlobalErrorCapture() {
  if (!isEnabled()) return;

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.setAttribute('error.type', 'uncaughtException');
    }
    // We must exit the process because the application state is undefined.
    // Hanging the process causes deployment timeouts on platforms like Render.
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    const err = reason instanceof Error ? reason : new Error(String(reason));
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.setAttribute('error.type', 'unhandledRejection');
    }
  });
}
