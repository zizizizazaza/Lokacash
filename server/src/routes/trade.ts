import { Router } from 'express';
import prisma from '../db.js';
type Tx = Omit<typeof prisma, '$transaction' | '$connect' | '$disconnect' | '$on' | '$extends'>;
import { authRequired, authOptional, type AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { recordCreditEvent, INVESTOR_EVENTS } from '../services/credit.service.js';
import { financialLimiter } from '../middleware/rateLimiter.js';
import { idempotency } from '../middleware/idempotency.js';

const router = Router();

// List trade orders
router.get('/', authOptional, async (req: AuthRequest, res, next) => {
  try {
    const { projectId, status } = req.query;

    const where: Record<string, string> = {};
    if (typeof projectId === 'string') where.projectId = projectId;
    if (typeof status === 'string') where.status = status;

    const orders = await prisma.tradeOrder.findMany({
      where,
      include: {
        project: {
          select: {
            title: true,
            coverImage: true,
            issuer: true,
            issuerLogo: true,
            apy: true,
            durationDays: true,
          },
        },
      },
      orderBy: { listedAt: 'desc' },
    });

    res.json(orders);
  } catch (err) {
    next(err);
  }
});

// Place a sell order
const createOrderSchema = z.object({
  projectId: z.string(),
  listPrice: z.number().positive(),
  shares: z.number().positive(),
});

router.post('/', authRequired, financialLimiter, async (req: AuthRequest, res, next) => {
  try {
    const { projectId, listPrice, shares } = createOrderSchema.parse(req.body);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const totalValue = listPrice * shares;
    const originalPrice = project.askPrice;
    const expectedReturn = totalValue - (originalPrice * shares);
    const expectedYield = ((listPrice - originalPrice) / originalPrice) * 100;

    const order = await prisma.tradeOrder.create({
      data: {
        projectId,
        sellerId: req.userId!,
        listPrice,
        originalPrice,
        shares,
        totalValue,
        expectedReturn,
        expectedYield,
      },
    });

    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

// Buy an existing trade order
router.post('/:id/buy', authRequired, financialLimiter, idempotency, async (req: AuthRequest, res, next) => {
  try {
    const orderId = req.params.id as string;
    const buyerId = req.userId as string;

    const result = await prisma.$transaction(async (tx: Tx) => {
      const order = await tx.tradeOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new Error('Order not found');
      if (order.status !== 'Listed') throw new Error('Order is no longer available');
      if (order.sellerId === buyerId) throw new Error('Cannot buy your own order');

      // Mark order as sold
      const updated = await tx.tradeOrder.update({
        where: { id: orderId },
        data: { buyerId, status: 'Sold', soldAt: new Date() },
      });

      // Transfer holding: create or update buyer's portfolio
      const project = await tx.project.findUnique({ where: { id: order.projectId } });
      const holdingAsset = `AIUSD-${project?.title || order.projectId}`;

      const existingHolding = await tx.portfolioHolding.findUnique({
        where: { userId_asset: { userId: buyerId, asset: holdingAsset } },
      });

      if (existingHolding) {
        const totalShares = existingHolding.amount + order.shares;
        const totalCost = existingHolding.avgCost * existingHolding.amount + order.listPrice * order.shares;
        await tx.portfolioHolding.update({
          where: { id: existingHolding.id },
          data: { amount: totalShares, avgCost: totalCost / totalShares },
        });
      } else {
        await tx.portfolioHolding.create({
          data: {
            userId: buyerId,
            asset: holdingAsset,
            amount: order.shares,
            avgCost: order.listPrice,
            currentApy: project?.apy || 0,
          },
        });
      }

      // Create transaction records for both parties
      await tx.transaction.create({
        data: { userId: buyerId, type: 'MINT', amount: order.totalValue, asset: holdingAsset, status: 'COMPLETED' },
      });
      await tx.transaction.create({
        data: { userId: order.sellerId, type: 'REDEEM', amount: order.totalValue, asset: holdingAsset, status: 'COMPLETED' },
      });

      return updated;
    });

    // Credit event for buyer (non-blocking)
    try {
      await recordCreditEvent(buyerId, 'investment_active', INVESTOR_EVENTS.INVESTMENT_ACTIVE.delta, 'Secondary market purchase', orderId);
    } catch { /* non-critical */ }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
