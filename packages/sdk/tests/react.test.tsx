import React from 'react';
import { render } from '@testing-library/react';
import { TracePilotProvider, ErrorBoundary } from '../src/react/index';

// Disable React's console.error so our intentional crash doesn't clutter the test output
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalError;
});

afterEach(() => {
  (global.fetch as jest.Mock).mockClear();
});

const BuggyComponent = () => {
  throw new Error("Component render crashed!");
  return <div>Unreachable</div>;
};

describe('React SDK - ErrorBoundary', () => {
  it('catches crashes and sends telemetry', async () => {
    // 1. Render the Provider + ErrorBoundary + BuggyComponent
    const { unmount, getByTestId } = render(
      <TracePilotProvider token="test-token" ingestorUrl="http://localhost:4318/v1/traces">
        <ErrorBoundary fallback={<div data-testid="error-fallback">Fallback UI</div>}>
          <BuggyComponent />
        </ErrorBoundary>
      </TracePilotProvider>
    );

    // Assert fallback UI rendered
    expect(getByTestId('error-fallback')).toBeTruthy();

    // Trigger cleanup
    unmount();

    // Verify fetch was called with correct data
    // Because open telemetry forceFlush is asynchronous and we might not catch it 
    // synchronously in Jest without waiting, let's add a small delay or check it.
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(global.fetch).toHaveBeenCalled();
    const [url, requestOptions] = (global.fetch as jest.Mock).mock.calls[0];
    
    expect(url).toBe("http://localhost:4318/v1/traces");
    expect(requestOptions.method).toBe('POST');
    expect(requestOptions.headers['x-tracepilot-project-id']).toBe('test-token');
    
    // The payload is JSON
    const payload = JSON.parse(requestOptions.body);
    expect(payload.resourceSpans).toBeDefined();
  });
});
