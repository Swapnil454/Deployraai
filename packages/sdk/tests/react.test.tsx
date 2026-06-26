import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { TracePilotProvider, ErrorBoundary } from '../src/react/index';

// Keep a reference to restore originals
const originalError = console.error;
const originalFetch = global.fetch;

beforeAll(() => {
  // Silence React's error output for this test
  console.error = jest.fn();

  // Provide a safe fetch mock for all tests in this file
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    // If your code reads response.json(), provide it
    json: async () => ({})
  }) as unknown as typeof fetch;
});

afterAll(() => {
  console.error = originalError;
  global.fetch = originalFetch;
});

afterEach(() => {
  // Clear any recorded calls between tests
  if ((global.fetch as jest.Mock)?.mockClear) {
    (global.fetch as jest.Mock).mockClear();
  }
});

const BuggyComponent = () => {
  throw new Error("Component render crashed!");
  return <div>Unreachable</div>;
};

describe('React SDK - ErrorBoundary', () => {
  it('catches crashes and sends telemetry', async () => {
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

    // Wait for the telemetry fetch to have been invoked instead of using a fixed timeout
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    }, { timeout: 3000 });

    const [url, requestOptions] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://localhost:4318/v1/traces");
    expect(requestOptions.method).toBe('POST');
    expect(requestOptions.headers['x-tracepilot-project-id']).toBe('test-token');

    const payload = JSON.parse(requestOptions.body);
    expect(payload.resourceSpans).toBeDefined();
  });
});
