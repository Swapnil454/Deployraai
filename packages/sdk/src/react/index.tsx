import React, { createContext, useContext, useEffect, useState } from 'react';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { Resource } from '@opentelemetry/resources';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import * as rrweb from 'rrweb';
import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals';

interface TracePilotContextValue {
  provider: WebTracerProvider | null;
}

const TracePilotContext = createContext<TracePilotContextValue>({ provider: null });

interface TracePilotProviderProps {
  children: React.ReactNode;
  token: string;
  serviceName?: string;
  ingestorUrl?: string;
  rumUrl?: string;
  enableSessionReplay?: boolean;
  allowedCorsUrls?: (string | RegExp)[];
}

let currentSessionId = crypto.randomUUID();
let rumSequenceNum = 0;
let __flushRRWebEvents: (() => void) | null = null;

function canRegisterWebVitals() {
  return (
    typeof window !== 'undefined' &&
    typeof performance !== 'undefined' &&
    typeof performance.getEntriesByType === 'function' &&
    typeof PerformanceObserver !== 'undefined'
  );
}

export function TracePilotProvider({ 
  children, 
  token, 
  serviceName = 'browser-app',
  ingestorUrl = 'https://ingest.tracepilot.ai/v1/traces',
  rumUrl = 'https://ingest.tracepilot.ai/v1/rum',
  enableSessionReplay = false,
  allowedCorsUrls = [/.*/] // By default allow context propagation to any backend
}: TracePilotProviderProps) {
  const [provider, setProvider] = useState<WebTracerProvider | null>(null);
  
  useEffect(() => {
    if (!token) return;

    // --- 1. OTLP TRACING ---
    const resource = new Resource({
      'service.name': serviceName,
      'tracepilot.project.id': token,
    });

    const webProvider = new WebTracerProvider({ resource });

    const exporter = new OTLPTraceExporter({
      url: ingestorUrl,
      headers: {
        'x-tracepilot-project-id': token,
      },
    });

    webProvider.addSpanProcessor(new BatchSpanProcessor(exporter, {
      maxQueueSize: 100,
      scheduledDelayMillis: 5000,
    }) as any);

    webProvider.register();

    registerInstrumentations({
      tracerProvider: webProvider,
      instrumentations: [
        new FetchInstrumentation({
          propagateTraceHeaderCorsUrls: allowedCorsUrls,
        }),
        new XMLHttpRequestInstrumentation({
          propagateTraceHeaderCorsUrls: allowedCorsUrls,
        }),
      ],
    });

    setProvider(webProvider);

    // --- 2. WEB VITALS ---
    // IMPORTANT: Capture route INSIDE the callback, not outside.
    // The SDK mounts once but the user navigates to many routes (SPA).
    // Capturing outside means every metric gets tagged with the first page's route.
    const reportVitals = (metric: any) => {
      // Capture the route at the exact moment the metric fires, not at SDK mount time.
      const currentRoute = typeof window !== 'undefined' ? window.location.pathname : '';
      const globalTracer = trace.getTracer('tracepilot-web-vitals');
      globalTracer.startActiveSpan('web-vitals', span => {
        span.setAttribute('web.vital.name', metric.name);
        // Ensure value is sent as a float64, not a string. Some OTEL encoding paths
        // may coerce numbers; using parseFloat ensures it's always numeric.
        span.setAttribute('web.vital.value', parseFloat(String(metric.value)));
        span.setAttribute('web.vital.rating', metric.rating);
        // Use the live pathname at measurement time for correct route breakdown.
        span.setAttribute('http.route', currentRoute);
        span.setAttribute('session_id', currentSessionId);
        span.end();
      });
    };
    if (canRegisterWebVitals()) {
      // reportAllChanges: true enables metrics to fire on soft navigations (Next.js SPA page changes)
      // Without this, LCP/CLS/INP only fire once on initial page load and never again.
      onLCP(reportVitals, { reportAllChanges: true });
      onINP(reportVitals, { reportAllChanges: true });
      onCLS(reportVitals, { reportAllChanges: true });
      onFCP(reportVitals, { reportAllChanges: true });
      onTTFB(reportVitals, { reportAllChanges: true });
    }

    // --- 2.5 ALWAYS FLUSH TRACES ON VISIBILITY CHANGE ---
    const handleTraceFlushOnHide = () => {
      if (document.visibilityState === 'hidden') {
        webProvider.forceFlush().catch(console.error);
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleTraceFlushOnHide);
    }

    // --- 3. SESSION REPLAY (rrweb) ---
    let stopFn: (() => void) | undefined;
    let flushInterval: any;
    let handleVisibilityChange: (() => void) | undefined;
    
    if (enableSessionReplay && typeof window !== 'undefined' && token) {
      let events: any[] = [];
      const rumKey = token;
      
      const recordOptions = {
        emit(event: any) {
          events.push(event); // Storing purely as object format events
        },
        maskAllInputs: true,
        maskInputOptions: {
          password: true,
          email: true,
          tel: true,
          text: true,
          number: true,
          search: true,
        },
        // Optimize payload size using sampling (reduces event size drastically)
        sampling: {
          mousemove: true,      // Throttles mouse movements
          mouseInteraction: true,
          scroll: 150,          // Throttle scroll events to 150ms
          input: 'last' as const, // Only capture the final input string rather than every keystroke
        },
        blockClass: 'tracepilot-block',
        ignoreClass: 'tracepilot-ignore',
        maskTextClass: 'tracepilot-mask',
        // Specifically block sensitive PII like credit cards and passwords
        blockSelector: 'input[type="password"], input[name*="cc-"], input[name*="card"], input[autocomplete="cc-number"], [data-sensitive]',
      };
      
      stopFn = rrweb.record(recordOptions);

      handleVisibilityChange = () => {
        if (document.hidden) {
          if (stopFn) {
            stopFn();
            stopFn = undefined;
          }
        } else {
          if (!stopFn) {
            stopFn = rrweb.record(recordOptions);
          }
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      const flush = () => {
        if (events.length > 0) {
          const payload = events.splice(0, events.length);
          const currentUrl = window.location.href;
          
          fetch(rumUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${rumKey}`
            },
            body: JSON.stringify({ 
              sessionId: currentSessionId, 
              sequence_num: rumSequenceNum++, 
              events: payload,
              url: currentUrl 
            })
          }).catch(err => console.error('TracePilot RUM flush failed', err));
        }
      };

      __flushRRWebEvents = flush;
      flushInterval = setInterval(flush, 10000);
    }

    return () => {
      webProvider.forceFlush().catch(console.error);
      if (stopFn) stopFn();
      if (flushInterval) clearInterval(flushInterval);
      if (typeof document !== 'undefined') {
        if (handleVisibilityChange) {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
        document.removeEventListener('visibilitychange', handleTraceFlushOnHide);
      }
      __flushRRWebEvents = null;
    };
  }, [token, serviceName, ingestorUrl, rumUrl, enableSessionReplay, allowedCorsUrls]);

  return (
    <TracePilotContext.Provider value={{ provider }}>
      {children}
    </TracePilotContext.Provider>
  );
}

export function useTracePilot() {
  return useContext(TracePilotContext);
}

// Error Boundary
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (__flushRRWebEvents) {
      __flushRRWebEvents();
    }

    // We get the global tracer
    const tracer = trace.getTracer('tracepilot-react-error-boundary');
    
    // Start a new unparented span for the UI crash
    tracer.startActiveSpan('React Component Crash', span => {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.setAttribute('error.stack', error.stack || '');
      span.setAttribute('react.component_stack', errorInfo.componentStack || '');
      span.setAttribute('session_id', currentSessionId);
      span.end();
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <h1>Something went wrong.</h1>;
    }

    return this.props.children;
  }
}
