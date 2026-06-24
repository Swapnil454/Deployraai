import { NextRequest, NextResponse } from 'next/server';
import { withSpan } from '../core/span';

type Handler = (req: NextRequest, ctx?: any) => Promise<NextResponse>;

export function withRouteObservability(handler: Handler): Handler {
  return async (req: NextRequest, ctx?: any): Promise<NextResponse> => {
    const pathname = req.nextUrl.pathname;
    const method = req.method;

    return withSpan(`${method} ${pathname}`, async (span) => {
      span?.setAttributes({
        'http.method': method,
        'http.url': req.url,
        'http.route': pathname,
        'http.user_agent': req.headers.get('user-agent') ?? '',
      });

      const response = await handler(req, ctx);

      span?.setAttribute('http.status_code', response.status);

      if (response.status >= 400) {
        span?.setAttribute('error', true);
      }

      return response;
    }, { attributes: { 'span.type': 'route_handler' } });
  };
}
