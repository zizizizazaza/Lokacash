import { Router } from 'express';
import prisma from '../db.js';
import { authRequired, type AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';

const router = Router();

// Get user profile
router.get('/profile', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });
    if (!user) throw new AppError('User not found', 404);

    const { ...profile } = user;
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

// Update user profile
const updateProfileSchema = z.object({
  name: z.string().max(100).optional(),
  avatar: z.string().url().optional(),
  walletAddress: z.string().optional(),
  bio: z.string().max(500).optional(),
  twitter: z.string().max(200).optional(),
  linkedin: z.string().max(200).optional(),
  personalWebsite: z.string().max(200).optional(),
  isPublic: z.boolean().optional(),
});

router.patch('/profile', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const data = updateProfileSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.userId },
      data,
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ============ Discover public users (square) ============
router.get('/discover', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const me = req.userId!;

    const users = await prisma.user.findMany({
      where: {
        id: { not: me },
        isPublic: true,
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        bio: true,
        role: true,
        twitter: true,
        linkedin: true,
        personalWebsite: true,
        creditScore: true,
        createdAt: true,
      },
      orderBy: { creditScore: 'desc' },
      take: 50,
    });

    // Get friendship statuses in bulk
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: me, addresseeId: { in: users.map(u => u.id) } },
          { addresseeId: me, requesterId: { in: users.map(u => u.id) } },
        ],
      },
      select: { requesterId: true, addresseeId: true, status: true },
    });

    const friendshipMap = new Map<string, string>();
    for (const f of friendships) {
      const otherId = f.requesterId === me ? f.addresseeId : f.requesterId;
      friendshipMap.set(otherId, f.status); // 'pending' | 'accepted'
    }

    const result = users.map(u => ({
      ...u,
      friendshipStatus: friendshipMap.get(u.id) || 'none', // 'none' | 'pending' | 'accepted'
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
