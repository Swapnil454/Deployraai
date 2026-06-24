# @swapnil454/tracepilot

<p align="center">
  <strong>Zero-configuration Application Performance Monitoring (APM) and OpenTelemetry auto-instrumentation for modern Node.js frameworks.</strong>
</p>

---

## What is Tracepilot?

Tracepilot is an incredibly lightweight, high-performance observability SDK designed exclusively to trace applications deployed on the AI_Agents PaaS platform. 

It intercepts HTTP requests, captures latencies, extracts stack traces, and bundles everything into W3C OpenTelemetry compliant Spans. These spans are automatically beamed directly into your platform's high-speed ingestion pipeline.

## Features

- **Zero-Config Installation**: Works entirely out of the box. No manual tracer setup required.
- **Non-Blocking**: Uses asynchronous hooks and bulk-flushing to ensure 0% impact on your event loop.
- **Framework Agnostic**: Native wrappers for both Next.js (App Router) and Express.js.
- **AI-Ready Context**: Captures highly detailed execution traces specifically designed to feed into Large Language Models for autonomous bug fixing.

---

## Installation

```bash
npm install @swapnil454/tracepilot
```

> **Note:** If you are deploying via the AI_Agents platform, this package is actually **auto-injected** into your build pipeline. You do not need to install it manually!

---

## Quick Start

### 1. Next.js (App Router)

Tracepilot seamlessly wraps your Next.js API handlers. Simply wrap your `GET`, `POST`, or `PUT` functions with `withTracepilot`.

```typescript
// app/api/checkout/route.ts
import { withTracepilot } from '@swapnil454/tracepilot/next';
import { NextResponse } from 'next/server';

async function handler(req: Request) {
  // Your business logic here
  const data = await processPayment(req);
  return NextResponse.json({ success: true, data });
}

export const POST = withTracepilot(handler);
```

### 2. Express.js

For Express applications, simply drop the `tracepilotMiddleware` at the very top of your middleware stack, before your routes are defined.

```typescript
// server.ts
import express from 'express';
import { tracepilotMiddleware } from '@swapnil454/tracepilot/express';

const app = express();

// 1. Inject Tracepilot first!
app.use(tracepilotMiddleware);

// 2. Define your routes
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(8080, () => {
  console.log('Server is running and fully instrumented!');
});
```

---

## Configuration (Environment Variables)

Tracepilot requires zero configuration in the code itself. It is fully driven by environment variables injected by the AI_Agents platform during deployment.

- `TRACEPILOT_PROJECT_ID`: The unique UUID of your project (Required).
- `TRACEPILOT_TOKEN`: The cryptographic access token (Required).
- `INGESTOR_URL`: The destination to beam the traces (Defaults to `http://localhost:4317` in local development).

## Security & Privacy (Private Repositories)

**Yes! Tracepilot is perfectly safe for private repositories.** 
Even though this NPM package is publicly available on the NPM registry (so your CI/CD pipelines can easily run `npm install`), the actual observability data it collects is heavily encrypted and sent directly to your private, isolated ingestion cluster. No code or sensitive data is ever exposed to the public registry.

---

## License
MIT © Swapnil
