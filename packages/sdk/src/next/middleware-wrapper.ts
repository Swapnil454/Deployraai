import { NextRequest, NextResponse } from 'next/server';
import { getConfig, isEnabled } from '../core/config';

// Wraps the user's middleware function to add a span
export function withObservability(
  middleware: (req: NextRequest) => Promise<NextResponse> | NextResponse
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    if (!isEnabled()) return middleware(req);

    const start = Date.now();
    let statusCode = 200;

    try {
      const res = await middleware(req);
      statusCode = res.status;
      return res;
    } catch (err) {
      statusCode = 500;
      throw err;
    } finally {
      // Edge runtime can't use OTEL SDK — send a simple fetch instead
      const config = getConfig();
      fetch(`${config.collectorUrl}/v1/edge-spans`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'middleware',
          path: req.nextUrl.pathname,
          method: req.method,
          statusCode,
          durationMs: Date.now() - start,
          region: (req as any).geo?.region ?? 'unknown',
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {}); // fire-and-forget, never throw
    }
  };
}
