import React, { createContext, useContext, useEffect, useState } from 'react';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import * as rrweb from 'rrweb';
import { onLCP, onINP, onCLS } from 'web-vitals';

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
}

export function TracePilotProvider({ 
  children, 
  token, 
  serviceName = 'browser-app',
  ingestorUrl = 'https://ingest.tracepilot.ai/v1/traces',
  rumUrl = 'https://ingest.tracepilot.ai/v1/rum'
}: TracePilotProviderProps) {
  const [provider, setProvider] = useState<WebTracerProvider | null>(null);
  
  // Session Replay Events Buffer
  const [sessionId] = useState(() => crypto.randomUUID());
  
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
    const reportVitals = (metric: any) => {
      const globalTracer = trace.getTracer('tracepilot-web-vitals');
      globalTracer.startActiveSpan('web-vitals', span => {
        span.setAttribute('web.vital.name', metric.name);
        span.setAttribute('web.vital.value', metric.value);
        span.setAttribute('web.vital.rating', metric.rating);
        span.setAttribute('session_id', sessionId);
        span.end();
      });
    };
    onLCP(reportVitals);
    onINP(reportVitals);
    onCLS(reportVitals);

    // --- 3. SESSION REPLAY (rrweb) ---
    let events: any[] = [];
    const stopFn = rrweb.record({
      emit(event) {
        events.push(event);
      },
    });

    // Flush RUM events every 10 seconds
    const flushInterval = setInterval(() => {
      if (events.length > 0) {
        const payload = events.splice(0, events.length);
        fetch(rumUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ sessionId, events: payload })
        }).catch(err => console.error('TracePilot RUM flush failed', err));
      }
    }, 10000);

    return () => {
      webProvider.forceFlush().catch(console.error);
      if (stopFn) stopFn();
      clearInterval(flushInterval);
    };
  }, [token, serviceName, ingestorUrl, rumUrl, sessionId]);

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
