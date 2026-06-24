import { Request, Response, NextFunction, RequestHandler } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { initTracer } from '../core/tracer';
import { setupGlobalErrorCapture } from '../core/error-capture';
import { getConfig } from '../core/config';

// Call this once in app.ts / server.ts — BEFORE creating the Express app
export function initExpressObservability() {
  initTracer();
  setupGlobalErrorCapture();
}

// Express middleware — add with app.use(observabilityMiddleware())
export function observabilityMiddleware(): RequestHandler {
  const tracer = trace.getTracer('@yourplatform/sdk');

  return (req: Request, res: Response, next: NextFunction) => {
    const span = tracer.startSpan(`${req.method} ${req.path}`, {
      attributes: {
        'http.method': req.method,
        'http.url': req.url,
        'http.route': req.route?.path ?? req.path,
        'http.user_agent': req.headers['user-agent'] ?? '',
        'http.request_id': req.headers['x-request-id'] as string ?? crypto.randomUUID(),
      },
    });

    // Attach span to request so route handlers can access it
    (req as any).__span = span;

    const startTime = Date.now();

    res.on('finish', () => {
      span.setAttribute('http.status_code', res.statusCode);
      span.setAttribute('http.duration_ms', Date.now() - startTime);

      if (res.statusCode >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute('error', true);
      }
      span.end();
    });

    next();
  };
}

// Error-capturing middleware — add LAST with app.use(errorObservabilityMiddleware())
export function errorObservabilityMiddleware() {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    const span = (req as any).__span;
    if (span) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    }
    next(err);
  };
}
