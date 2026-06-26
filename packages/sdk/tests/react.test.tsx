import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { TracePilotProvider, ErrorBoundary } from '../src/react/index';

const mockExport = jest.fn((spans, callback) => callback({ code: 0 }));

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => {
  return {
    OTLPTraceExporter: jest.fn().mockImplementation((config) => {
      return {
        export: mockExport,
        shutdown: jest.fn(() => Promise.resolve()),
        forceFlush: jest.fn(() => Promise.resolve()),
      };
    })
  };
});

describe('React SDK - ErrorBoundary', () => {
  afterEach(() => {
    mockExport.mockClear();
    jest.clearAllMocks();
  });

  it('catches crashes and sends telemetry', async () => {
    // Suppress console.error for the intentional crash
    const originalError = console.error;
    console.error = jest.fn();

    const TestComponent = ({ crash }: { crash?: boolean }) => {
      if (crash) throw new Error("Component render crashed!");
      return <div data-testid="healthy">Healthy</div>;
    };

    const { unmount, findByTestId, rerender } = render(
      <TracePilotProvider token="test-token" ingestorUrl="http://localhost:4318/v1/traces">
        <ErrorBoundary fallback={<div data-testid="error-fallback">Fallback UI</div>}>
          <TestComponent crash={false} />
        </ErrorBoundary>
      </TracePilotProvider>
    );

    // Wait for initial mount to finish so TracePilotProvider registers the tracer
    await findByTestId('healthy');

    // Now trigger the crash
    rerender(
      <TracePilotProvider token="test-token" ingestorUrl="http://localhost:4318/v1/traces">
        <ErrorBoundary fallback={<div data-testid="error-fallback">Fallback UI</div>}>
          <TestComponent crash={true} />
        </ErrorBoundary>
      </TracePilotProvider>
    );

    // Wait for fallback UI (ensures ErrorBoundary handled the render error)
    await findByTestId('error-fallback');

    // Trigger cleanup (wrap unmount in act to flush React effects)
    await act(async () => {
      unmount();
    });

    // Wait for the telemetry exporter to have been invoked
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalled();
    }, { timeout: 2000 });

    const spans = mockExport.mock.calls[0][0];
    expect(spans).toBeDefined();
    expect(spans.length).toBe(1);
    expect(spans[0].name).toBe('React Component Crash');
    expect(spans[0].status.message).toBe('Component render crashed!');

    console.error = originalError;
  });
});
