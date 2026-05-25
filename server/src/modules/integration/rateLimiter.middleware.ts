// E2.15b: In-memory sliding-window rate limiter for API key and OAuth client routes.
// Store: Map keyed by tenant+actor combo — good for single-process. Redis is the
// correct answer for multi-instance deployments (replace the Map with a Redis INCR/EXPIRE).

import type { Request, Response, NextFunction } from 'express';

interface WindowState {
  count: number;
  windowStart: number; // epoch ms
}

const HOUR_MS = 60 * 60 * 1000;

function makeRateLimiter(limit: number, keyExtractor: (req: Request) => string | null) {
  const store = new Map<string, WindowState>();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const key = keyExtractor(req);
    if (!key) {
      next();
      return;
    }

    const now = Date.now();
    let state = store.get(key);

    if (!state || now - state.windowStart > HOUR_MS) {
      state = { count: 0, windowStart: now };
    }

    state.count += 1;
    store.set(key, state);

    if (state.count > limit) {
      const retryAfter = Math.ceil((state.windowStart + HOUR_MS - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
      });
      return;
    }

    next();
  };
}

export const rateLimitByApiKey = makeRateLimiter(
  1000,
  (req) => {
    const tenantId = req.user?.tenantId;
    const keyId = req.params.keyId ?? 'list';
    return tenantId ? `apikey:${tenantId}:${keyId}` : null;
  },
);

export const rateLimitByOAuthClient = makeRateLimiter(
  2000,
  (req) => {
    const tenantId = req.user?.tenantId;
    const clientId = req.params.id ?? 'list';
    return tenantId ? `oauth:${tenantId}:${clientId}` : null;
  },
);
