import { NextRequest, NextResponse } from 'next/server';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const contentSecurityPolicyFor = (nonce: string): string => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      isDevelopment ? " 'unsafe-eval'" : ''
    }`,
    // React style props and the current design system require inline styles.
    // Script execution remains nonce-restricted.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://cdn.discordapp.com https://media.discordapp.net",
    "font-src 'self' data:",
    "connect-src 'self' https://*.vercel.app https://discord.com https://canary.discord.com https://ptb.discord.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors 'self' https://discord.com https://*.discord.com https://discordapp.com https://*.discordapp.com https://staging.discord.co${
      isDevelopment ? ' http://localhost:3333' : ''
    }`,
  ].join('; ');
};

const requestIdFor = (request: NextRequest): string => {
  const supplied = request.headers.get('x-request-id')?.trim();
  if (supplied && REQUEST_ID_PATTERN.test(supplied)) return supplied;
  return crypto.randomUUID();
};

export function proxy(request: NextRequest): NextResponse {
  const requestId = requestIdFor(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const isApiRequest =
    request.nextUrl.pathname.startsWith('/api/') ||
    request.nextUrl.pathname.startsWith('/.proxy/api/');
  const nonce = isApiRequest
    ? null
    : Buffer.from(crypto.randomUUID()).toString('base64');
  const contentSecurityPolicy = nonce
    ? contentSecurityPolicyFor(nonce)
    : null;
  if (nonce && contentSecurityPolicy) {
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-request-id', requestId);
  if (contentSecurityPolicy) {
    response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
