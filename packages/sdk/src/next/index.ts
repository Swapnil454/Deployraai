export * from './middleware-wrapper';
export * from './route-handler';
import { initTracer } from '../core/tracer';
import { setupGlobalErrorCapture } from '../core/error-capture';

// Called inside instrumentation.ts
export function registerOTel() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    initTracer();
    setupGlobalErrorCapture();
  }
}
