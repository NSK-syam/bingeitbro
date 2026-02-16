import { NextResponse, type NextRequest } from 'next/server';

type RateLimitRule = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const globalRateStore = globalThis as typeof globalThis & {
  __bibRateLimitStore?: Map<string, RateLimitBucket>;
};

const rateLimitStore = globalRateStore.__bibRateLimitStore ?? new Map<string, RateLimitBucket>();
globalRateStore.__bibRateLimitStore = rateLimitStore;

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': "base-uri 'self'; form-action 'self'; frame-ancestors 'none';",
};

function getClientIp(request: NextRequest): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

function getRateLimitRule(request: NextRequest): RateLimitRule | null {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  if (!pathname.startsWith('/api/')) return null;
  if (method === 'OPTIONS') return null;

  if (method === 'POST' && pathname === '/api/signup') {
    return { key: 'signup', limit: 5, windowMs: 10 * 60 * 1000 };
  }

  if (method === 'GET' && pathname === '/api/username-available') {
    return { key: 'username-available', limit: 120, windowMs: 60 * 1000 };
  }

  if (
    method === 'POST' &&
    (pathname === '/api/send-friend-recommendations' ||
      pathname === '/api/notifications/friend-recommendations')
  ) {
    return { key: 'friend-mail', limit: 40, windowMs: 60 * 1000 };
  }

  if (method === 'POST' && pathname === '/api/watch-reminders/dispatch-emails') {
    return { key: 'dispatch-emails', limit: 30, windowMs: 5 * 60 * 1000 };
  }

  if (
    method === 'POST' &&
    (pathname === '/api/watch-reminders' ||
      pathname === '/api/watch-reminders/poll' ||
      pathname === '/api/friend-recommendation-reminders/poll')
  ) {
    return { key: 'reminders', limit: 120, windowMs: 60 * 1000 };
  }

  if (pathname.startsWith('/api/tmdb/')) {
    return { key: 'tmdb-proxy', limit: 180, windowMs: 60 * 1000 };
  }

  return null;
}

function consumeRateLimit(
  requestKey: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; retryAfterSec: number; resetAt: number } {
  const now = Date.now();
  const existing = rateLimitStore.get(requestKey);
  let bucket: RateLimitBucket;

  if (!existing || existing.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
  } else {
    bucket = existing;
  }

  bucket.count += 1;
  rateLimitStore.set(requestKey, bucket);

  if (rateLimitStore.size > 5000) {
    for (const [key, value] of rateLimitStore) {
      if (value.resetAt <= now) {
        rateLimitStore.delete(key);
      }
      if (rateLimitStore.size <= 3500) break;
    }
  }

  const allowed = bucket.count <= limit;
  const remaining = Math.max(0, limit - bucket.count);
  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  return {
    allowed,
    remaining,
    retryAfterSec,
    resetAt: Math.ceil(bucket.resetAt / 1000),
  };
}

function applySecurityHeaders(response: NextResponse) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(name)) {
      response.headers.set(name, value);
    }
  }
  return response;
}

export async function middleware(request: NextRequest) {
  // Keep auth/session on a single origin so users stay signed in consistently.
  const host = request.headers.get('host')?.toLowerCase() ?? '';
  if (host === 'www.bingeitbro.com') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.host = 'bingeitbro.com';
    redirectUrl.protocol = 'https';
    return applySecurityHeaders(NextResponse.redirect(redirectUrl, 308));
  }

  const rule = getRateLimitRule(request);
  if (rule) {
    const ip = getClientIp(request);
    const routeKey = `${rule.key}:${ip}`;
    const result = consumeRateLimit(routeKey, rule.limit, rule.windowMs);

    if (!result.allowed) {
      const blocked = NextResponse.json(
        {
          message: 'Too many requests. Please try again shortly.',
          code: 'RATE_LIMITED',
        },
        { status: 429 },
      );
      blocked.headers.set('Retry-After', String(result.retryAfterSec));
      blocked.headers.set('X-RateLimit-Limit', String(rule.limit));
      blocked.headers.set('X-RateLimit-Remaining', String(result.remaining));
      blocked.headers.set('X-RateLimit-Reset', String(result.resetAt));
      return applySecurityHeaders(blocked);
    }
  }

  const response = NextResponse.next({ request });
  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    '/api/:path*',
    // App pages (excluding static assets)
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)',
  ],
};
