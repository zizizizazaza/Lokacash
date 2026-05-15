import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.js';
import prisma from '../db.js';

/** Requires authRequired to run first. Checks user role is 'admin'. */
export async function adminRequired(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { role: true },
  });

  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}
