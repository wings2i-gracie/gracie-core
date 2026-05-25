// E2.15b: Optional idempotency middleware for POST endpoints.
// If the Idempotency-Key header is present, caches the response for 24 hours
// and replays it for duplicate requests with the same key + tenant.
// If the header is absent the request proceeds without caching.

import type { Request, Response, NextFunction } from 'express';

interface CachedResponse {
  status: number;
  body: unknown;
  timestamp: number; // epoch ms
}

const DAY_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, CachedResponse>();

export function requireIdempotency(req: Request, res: Response, next: NextFunction): void {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  if (!idempotencyKey) {
    next();
    return;
  }

  const tenantId = req.user?.tenantId ?? 'anon';
  const cacheKey = `${tenantId}:${idempotencyKey}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < DAY_MS) {
    res.status(cached.status).json(cached.body);
    return;
  }

  // Intercept res.json to capture response before it is sent
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    cache.set(cacheKey, { status: res.statusCode, body, timestamp: Date.now() });
    return originalJson(body);
  };

  next();
}
