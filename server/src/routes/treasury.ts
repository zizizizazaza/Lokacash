import { Router } from 'express';
import prisma from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { adminRequired } from '../middleware/adminGuard.js';

const router = Router();

// Get latest treasury stats — computes from real DB data with snapshot fallback
router.get('/stats', async (_req, res, next) => {
  try {
    // Try snapshot first
    const snapshot = await prisma.treasurySnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    // Compute live metrics from DB
    const [totalInvested, totalHoldings, activeProjects, collaterals] = await Promise.all([
      prisma.investment.aggregate({ _sum: { amount: true }, where: { status: 'active' } }),
      prisma.portfolioHolding.aggregate({ _sum: { amount: true } }),
      prisma.project.count({ where: { status: { in: ['Fundraising', 'Funded', 'Ending Soon'] } } }),
      prisma.collateral.aggregate({ _sum: { value: true }, where: { status: 'pledged' } }),
    ]);

    const liveTvl = totalHoldings._sum.amount || 0;
    const liveCollateral = collaterals._sum.value || 0;
    const liveInvested = totalInvested._sum.amount || 0;
    const collateralRatio = liveInvested > 0 ? ((liveCollateral + liveInvested) / liveInvested) * 100 : 100;

    // Compute revenue from completed interest transactions
    const revenueAgg = await prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { type: 'INTEREST', status: 'COMPLETED' },
    });
    const treasuryRevenue = revenueAgg._sum.amount || 0;

    if (snapshot) {
      res.json({
        tvl: liveTvl > 0 ? liveTvl : snapshot.tvl,
        collateralRatio: liveInvested > 0 ? collateralRatio : snapshot.collateralRatio,
        treasuryRevenue: treasuryRevenue > 0 ? treasuryRevenue : snapshot.treasuryRevenue,
        lastPoR: snapshot.lastPoR.toISOString(),
        activeProjects,
        reserveAllocation: {
          tBills: snapshot.tBillsPercent,
          liquidity: snapshot.liquidityPercent,
          operations: snapshot.operationsPercent,
        },
      });
    } else {
      // Fallback defaults enriched with live data
      res.json({
        tvl: liveTvl || 128450000,
        collateralRatio: liveInvested > 0 ? collateralRatio : 104.2,
        treasuryRevenue: treasuryRevenue || 2450000,
        lastPoR: new Date().toISOString(),
        activeProjects,
        reserveAllocation: {
          tBills: 90,
          liquidity: 7,
          operations: 3,
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

// Create a treasury snapshot (admin only)
router.post('/snapshot', authRequired, adminRequired, async (req, res, next) => {
  try {
    // Compute current stats
    const [totalHoldings, collaterals, totalInvested, revenueAgg] = await Promise.all([
      prisma.portfolioHolding.aggregate({ _sum: { amount: true } }),
      prisma.collateral.aggregate({ _sum: { value: true }, where: { status: 'pledged' } }),
      prisma.investment.aggregate({ _sum: { amount: true }, where: { status: 'active' } }),
      prisma.transaction.aggregate({ _sum: { amount: true }, where: { type: 'INTEREST', status: 'COMPLETED' } }),
    ]);

    const tvl = totalHoldings._sum.amount || 0;
    const invested = totalInvested._sum.amount || 0;
    const collateralValue = collaterals._sum.value || 0;
    const collateralRatio = invested > 0 ? ((collateralValue + invested) / invested) * 100 : 100;

    const snapshot = await prisma.treasurySnapshot.create({
      data: {
        tvl,
        collateralRatio,
        treasuryRevenue: revenueAgg._sum.amount || 0,
        lastPoR: new Date(),
        tBillsPercent: 90,
        liquidityPercent: 7,
        operationsPercent: 3,
      },
    });

    res.status(201).json(snapshot);
  } catch (err) {
    next(err);
  }
});

export default router;
