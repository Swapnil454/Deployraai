// packages/sdk/src/index.ts
// This is what users import when they manually use the SDK

export { initTracer, flushTraces } from './core/tracer';
export { setupGlobalErrorCapture } from './core/error-capture';
export { withSpan, track, captureError } from './core/span';
export { getConfig } from './core/config';
export { ContinuousProfiler, ProfilerOptions } from './core/profiler';
