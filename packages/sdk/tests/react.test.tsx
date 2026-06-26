import { render, waitFor, act } from '@testing-library/react';
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

  // OpenTelemetry browser exporter uses XHR, not fetch.
  // We bridge XHR back to global.fetch so the test assertions work perfectly.
  global.XMLHttpRequest = class {
    _method = '';
    _url = '';
    _headers: any = {};
    readyState = 4;
    status = 200;
    onreadystatechange: any = null;

    open(method: string, url: string) {
      this._method = method;
      this._url = url;
    }

    setRequestHeader(key: string, value: string) {
      this._headers[key] = value;
    }

    send(body: any) {
      global.fetch(this._url, {
        method: this._method,
        headers: this._headers,
        body
      });
      if (this.onreadystatechange) {
        this.onreadystatechange();
      }
    }
  } as any;
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
    const { unmount, findByTestId } = render(
      <TracePilotProvider token="test-token" ingestorUrl="http://localhost:4318/v1/traces">
        <ErrorBoundary fallback={<div data-testid="error-fallback">Fallback UI</div>}>
          <BuggyComponent />
        </ErrorBoundary>
      </TracePilotProvider>
    );

    // Wait for fallback UI (ensures ErrorBoundary handled the render error)
    await findByTestId('error-fallback');

    // Trigger cleanup (wrap unmount in act to flush React effects)
    await act(async () => {
      unmount();
    });

    // Wait for the telemetry fetch to have been invoked
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    }, { timeout: 5000 });

    const [url, requestOptions] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://localhost:4318/v1/traces");
    expect(requestOptions.method).toBe('POST');
    expect(requestOptions.headers['x-tracepilot-project-id']).toBe('test-token');

    const payload = JSON.parse(requestOptions.body);
    expect(payload.resourceSpans).toBeDefined();
  });
});
