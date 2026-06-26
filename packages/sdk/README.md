# TracePilot React & Node.js SDK

[![npm version](https://badge.fury.io/js/@swapnil454%2Ftracepilot.svg)](https://www.npmjs.com/package/@swapnil454/tracepilot)
![License](https://img.shields.io/npm/l/@swapnil454/tracepilot)
![Types](https://img.shields.io/npm/types/@swapnil454/tracepilot)

The official TracePilot SDK for JavaScript environments. It provides zero-config observability, distributed tracing, and automatic crash reporting for both **Node.js Backends** and **React Frontends**.

This SDK wraps the `@opentelemetry/api` ecosystem to provide a seamless, 1-line installation experience for TracePilot users.

---

## Installation

Install the package using your favorite package manager:

```bash
npm install @swapnil454/tracepilot
# or
yarn add @swapnil454/tracepilot
# or
pnpm add @swapnil454/tracepilot
```

---

## Node.js Backend Usage

Initialize the SDK as early as possible in your application lifecycle (ideally at the very top of `index.ts` or `server.ts`). It automatically instruments your Express servers, HTTP clients, and tracks unhandled exceptions.

```javascript
import { tracepilot } from '@swapnil454/tracepilot';

// 1. Initialize TracePilot BEFORE importing Express/Fastify/etc
tracepilot.init({
  token: process.env.TRACEPILOT_TOKEN, // Found in your TracePilot Project Settings
  ingestorUrl: 'https://ingestor.tracepilot.io/v1/traces' // Optional: for self-hosting
});

// 2. Normal App Code
import express from 'express';
const app = express();

app.get('/api/users', (req, res) => {
    // This route is automatically traced!
    res.json({ users: [] });
});

app.listen(8080);
```

### Backend Features
- **Auto-Instrumentation:** Zero manual spans required. Automatically traces incoming HTTP requests, outgoing `fetch` calls, Express routes, and console logs.
- **Crash Safety:** Installs `uncaughtException` and `unhandledRejection` hooks to guarantee error spans are flushed before Node.js exits.

---

## React Frontend Usage

For frontend web applications, TracePilot provides a specialized Web Provider that captures UI crashes, React Component Stack traces, and browser performance metrics.

Wrap your React application tree with the `TracePilotProvider` and `ErrorBoundary`.

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { TracePilotProvider, ErrorBoundary } from '@swapnil454/tracepilot/react';

// You can create a custom fallback UI for when the app crashes
const CrashScreen = () => (
    <div style={{ padding: 20, color: 'red' }}>
        <h1>Oops! The application crashed.</h1>
        <p>Our engineering team has automatically been notified.</p>
    </div>
);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <TracePilotProvider 
    token="YOUR_PUBLIC_PROJECT_TOKEN" 
    ingestorUrl="https://ingestor.tracepilot.io/v1/traces"
  >
    <ErrorBoundary fallback={<CrashScreen />}>
      <App />
    </ErrorBoundary>
  </TracePilotProvider>
);
```

### Frontend Features
- **React Crash Capture:** Our `ErrorBoundary` hooks into `componentDidCatch`. If a component throws an error during render, it extracts the `react.component_stack`, attaches it to an OpenTelemetry span, and flushes it to the dashboard.
- **Web Vitals:** Tracks core web performance metrics.
- **Graceful Fallbacks:** Prevents white-screen-of-death (WSOD) by displaying your custom fallback UI.

---

## Manual Tracing

If you want to track specific user actions or business logic manually:

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-frontend-app');

function handleCheckout() {
    tracer.startActiveSpan('checkout_process', (span) => {
        span.setAttribute('cart.value', 150.00);
        
        try {
            // Do checkout logic
            span.addEvent('payment_authorized');
        } catch (e) {
            span.recordException(e);
        } finally {
            span.end();
        }
    });
}
```

## License
MIT License. See [LICENSE](LICENSE) for more details.
