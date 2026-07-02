import React, { createContext, useContext, useEffect, useState } from 'react';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
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
  enableSessionReplay = false
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
    setProvider(webProvider);

    // --- 2. WEB VITALS ---
    const capturedRoute = typeof window !== 'undefined' ? window.location.pathname : '';
    
    const reportVitals = (metric: any) => {
      const globalTracer = trace.getTracer('tracepilot-web-vitals');
      globalTracer.startActiveSpan('web-vitals', span => {
        span.setAttribute('web.vital.name', metric.name);
        span.setAttribute('web.vital.value', metric.value);
        span.setAttribute('web.vital.rating', metric.rating);
        span.setAttribute('http.route', capturedRoute);
        span.setAttribute('session_id', currentSessionId);
        span.end();
      });
    };
    if (canRegisterWebVitals()) {
      onLCP(reportVitals);
      onINP(reportVitals);
      onCLS(reportVitals);
      onFCP(reportVitals);
      onTTFB(reportVitals);
    }

    // --- 3. SESSION REPLAY (rrweb) ---
    let stopFn: (() => void) | undefined;
    let flushInterval: any;
    let handleVisibilityChange: (() => void) | undefined;
    
    if (enableSessionReplay && typeof window !== 'undefined' && process.env.NEXT_PUBLIC_TRACEPILOT_RUM_KEY) {
      let events: any[] = [];
      const rumKey = process.env.NEXT_PUBLIC_TRACEPILOT_RUM_KEY;
      
      const recordOptions = {
        emit(event: any) {
          events.push(event);
        },
        maskInputOptions: {
          password: true,
          email: true,
          tel: true,
          text: true,
          number: true,
          search: true,
        },
        blockClass: 'tracepilot-block',
        maskTextClass: 'tracepilot-mask',
        blockSelector: 'input[type="password"], [data-sensitive]',
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
      if (typeof document !== 'undefined' && handleVisibilityChange) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      __flushRRWebEvents = null;
    };
  }, [token, serviceName, ingestorUrl, rumUrl, enableSessionReplay]);

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
