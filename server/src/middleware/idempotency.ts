import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.js';
import prisma from '../db.js';

/**
 * Idempotency middleware for financial operations.
 * Client sends `Idempotency-Key` header. If the same key was used before,
 * returns the cached response instead of processing again.
 */
export async function idempotency(req: AuthRequest, res: Response, next: NextFunction) {
  const key = req.headers['idempotency-key'] as string | undefined;
  if (!key) {
    // No key provided — proceed normally (idempotency is opt-in)
    return next();
  }

  const userId = req.userId;
  if (!userId) return next();

  // Check if we've seen this key before
  const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
  if (existing) {
    if (existing.userId !== userId) {
      res.status(422).json({ error: 'Idempotency key belongs to another user' });
      return;
    }
    // Return cached response
    const cached = JSON.parse(existing.response);
    res.status(cached._status || 200).json(cached.body);
    return;
  }

  // Intercept the response to cache it
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    // Store the response (non-blocking)
    prisma.idempotencyKey.create({
      data: {
        key,
        userId,
        response: JSON.stringify({ _status: res.statusCode, body }),
      },
    }).catch(() => {}); // Don't fail the request if caching fails

    return originalJson(body);
  };

  next();
}
