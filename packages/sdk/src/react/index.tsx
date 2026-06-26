import React, { createContext, useContext, useEffect, useState } from 'react';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

interface TracePilotContextValue {
  provider: WebTracerProvider | null;
}

const TracePilotContext = createContext<TracePilotContextValue>({ provider: null });

interface TracePilotProviderProps {
  children: React.ReactNode;
  token: string;
  serviceName?: string;
  ingestorUrl?: string;
}

export function TracePilotProvider({ 
  children, 
  token, 
  serviceName = 'browser-app',
  ingestorUrl = 'https://ingest.tracepilot.ai/v1/traces'
}: TracePilotProviderProps) {
  const [provider, setProvider] = useState<WebTracerProvider | null>(null);

  useEffect(() => {
    if (!token) return;

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

    return () => {
      webProvider.forceFlush().catch(console.error);
    };
  }, [token, serviceName, ingestorUrl]);

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
