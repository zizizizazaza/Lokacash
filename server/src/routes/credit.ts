import { Router } from 'express';
import prisma from '../db.js';
import { authRequired, type AuthRequest } from '../middleware/auth.js';
import { getTier, getTierDetails } from '../services/credit.service.js';

const router = Router();

// Get current user's credit score and tier
router.get('/score', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId as string },
      select: { creditScore: true },
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const tier = getTierDetails(user.creditScore);
    res.json({
      score: user.creditScore,
      tier: tier.name,
      collateralRate: tier.collateralRate,
      feeRate: tier.feeRate,
      nextTier: tier.name === 'Tier3' ? null : {
        name: tier.name === 'Unranked' ? 'Tier1' : tier.name === 'Tier1' ? 'Tier2' : 'Tier3',
        pointsNeeded: tier.name === 'Unranked' ? 200 - user.creditScore
          : tier.name === 'Tier1' ? 500 - user.creditScore
          : 1000 - user.creditScore,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Get credit score change history
router.get('/history', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const history = await prisma.creditScoreHistory.findMany({
      where: { userId: req.userId as string },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(history);
  } catch (err) {
    next(err);
  }
});

// Get credit score events (change reasons)
router.get('/events', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const events = await prisma.creditScoreEvent.findMany({
      where: { userId: req.userId as string },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(events);
  } catch (err) {
    next(err);
  }
});

export default router;
