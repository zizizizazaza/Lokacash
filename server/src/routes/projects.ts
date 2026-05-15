import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
type Tx = Omit<typeof prisma, '$transaction' | '$connect' | '$disconnect' | '$on' | '$extends'>;
import { authOptional, authRequired, type AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { financialLimiter } from '../middleware/rateLimiter.js';
import { idempotency } from '../middleware/idempotency.js';
import { emitToUser, getIO } from '../socket/index.js';
import { recordCreditEvent, INVESTOR_EVENTS } from '../services/credit.service.js';
import { notify } from '../services/notification.service.js';

const router = Router();

const MIN_INVEST_AMOUNT = 10; // Minimum $10

const investSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
});

// List all projects
router.get('/', authOptional, async (req: AuthRequest, res, next) => {
  try {
    const { category, status, sortBy, order, page, limit: limitStr } = req.query;

    const where: Record<string, string> = {};
    if (typeof category === 'string') where.category = category;
    if (typeof status === 'string') where.status = status;

    // Pagination
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr as string, 10) || 50));
    const skip = (pageNum - 1) * limit;

    // Sorting
    type SortField = 'apy' | 'raisedAmount' | 'durationDays' | 'createdAt' | 'targetAmount';
    const validSortFields: SortField[] = ['apy', 'raisedAmount', 'durationDays', 'createdAt', 'targetAmount'];
    const sortField: SortField = validSortFields.includes(sortBy as SortField) ? (sortBy as SortField) : 'createdAt';
    const sortOrder = order === 'asc' ? 'asc' as const : 'desc' as const;

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: { monthlyRevenue: true },
        orderBy: { [sortField]: sortOrder },
        take: limit,
        skip,
      }),
      prisma.project.count({ where }),
    ]);

    // Backward compatible: if no page param, return flat array (legacy)
    // If page param is present, return { data, pagination } format
    if (page) {
      res.json({
        data: projects,
        pagination: { page: pageNum, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } else {
      res.json(projects);
    }
  } catch (err) {
    next(err);
  }
});

// Get single project
router.get('/:id', authOptional, async (req: AuthRequest, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id as string },
      include: {
        monthlyRevenue: true,
        investments: { select: { id: true, amount: true, createdAt: true } },
      },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(project);
  } catch (err) {
    next(err);
  }
});

// Get user's investment in a specific project
router.get('/:id/my-investment', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId as string;
    const projectId = req.params.id as string;

    const investments = await prisma.investment.findMany({
      where: { userId, projectId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    const totalAmount = investments.reduce((sum, inv) => sum + inv.amount, 0);
    const totalShares = investments.reduce((sum, inv) => sum + inv.shares, 0);

    res.json({
      invested: investments.length > 0,
      totalAmount,
      totalShares,
      count: investments.length,
      investments,
    });
  } catch (err) {
    next(err);
  }
});

// ============ Invest in a project ============
router.post('/:id/invest', authRequired, financialLimiter, idempotency, async (req: AuthRequest, res, next) => {
  try {
    const { amount } = investSchema.parse(req.body);
    const userId = req.userId as string;
    const projectId = req.params.id as string;

    if (amount < MIN_INVEST_AMOUNT) {
      throw new AppError(`Minimum investment is $${MIN_INVEST_AMOUNT}`, 400);
    }

    // Use a transaction for atomicity
    const result = await prisma.$transaction(async (tx: Tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) throw new AppError('Project not found', 404);

      // Only allow investing in Fundraising or Ending Soon projects
      if (!['Fundraising', 'Ending Soon'].includes(project.status)) {
        throw new AppError(`Project is not open for investment (status: ${project.status})`, 400);
      }

      // Check remaining capacity
      if (amount > project.remainingCap) {
        throw new AppError(
          `Amount exceeds remaining capacity ($${project.remainingCap.toFixed(2)} available)`,
          400,
        );
      }

      // Calculate shares based on askPrice
      const shares = amount / project.askPrice;

      // Create investment record
      const investment = await tx.investment.create({
        data: { userId, projectId, amount, shares },
      });

      // Update project fundraising stats
      const newRaised = project.raisedAmount + amount;
      const newRemaining = project.targetAmount - newRaised;

      // Count distinct backers
      const distinctBackers = await tx.investment.groupBy({
        by: ['userId'],
        where: { projectId },
      });

      // Determine new status — auto-close if hard cap reached
      let newStatus = project.status;
      if (newRemaining <= 0) {
        newStatus = 'Funded';
      }

      await tx.project.update({
        where: { id: projectId },
        data: {
          raisedAmount: newRaised,
          remainingCap: Math.max(0, newRemaining),
          backersCount: distinctBackers.length,
          status: newStatus,
        },
      });

      // Upsert portfolio holding
      const holdingAsset = `AIUSD-${project.title}`;
      const existing = await tx.portfolioHolding.findUnique({
        where: { userId_asset: { userId, asset: holdingAsset } },
      });

      if (existing) {
        const totalAmount = existing.amount + shares;
        const totalCost = existing.avgCost * existing.amount + project.askPrice * shares;
        await tx.portfolioHolding.update({
          where: { id: existing.id },
          data: {
            amount: totalAmount,
            avgCost: totalCost / totalAmount,
            currentApy: project.apy,
          },
        });
      } else {
        await tx.portfolioHolding.create({
          data: {
            userId,
            asset: holdingAsset,
            amount: shares,
            avgCost: project.askPrice,
            currentApy: project.apy,
          },
        });
      }

      // Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: 'MINT',
          amount,
          asset: holdingAsset,
          status: 'COMPLETED',
        },
      });

      return { investment, transaction, newStatus, newRaised, newRemaining: Math.max(0, newRemaining) };
    });

    // --- Credit event hooks (non-blocking) ---
    try {
      // Check if this is user's first investment
      const investmentCount = await prisma.investment.count({ where: { userId } });
      if (investmentCount === 1) {
        await recordCreditEvent(userId, 'first_investment', INVESTOR_EVENTS.FIRST_INVESTMENT.delta, INVESTOR_EVENTS.FIRST_INVESTMENT.reason, projectId);
      }
      // Active investment credit
      await recordCreditEvent(userId, 'investment_active', INVESTOR_EVENTS.INVESTMENT_ACTIVE.delta, INVESTOR_EVENTS.INVESTMENT_ACTIVE.reason, projectId);
      // Diversification check
      const distinctProjects = await prisma.investment.groupBy({ by: ['projectId'], where: { userId } });
      if (distinctProjects.length === 3) {
        await recordCreditEvent(userId, 'diversified_3', INVESTOR_EVENTS.DIVERSIFIED_3.delta, INVESTOR_EVENTS.DIVERSIFIED_3.reason);
      } else if (distinctProjects.length === 5) {
        await recordCreditEvent(userId, 'diversified_5', INVESTOR_EVENTS.DIVERSIFIED_5.delta, INVESTOR_EVENTS.DIVERSIFIED_5.reason);
      }
    } catch {
      // Credit scoring is non-critical
    }

    // WebSocket: notify the investor
    emitToUser(userId, 'investment:created', {
      investmentId: result.investment.id,
      projectId,
      amount,
    });

    // In-app notification
    notify({
      userId,
      type: 'investment',
      title: 'Investment Confirmed',
      body: `You invested $${amount.toFixed(2)} in a project.`,
      refType: 'project',
      refId: projectId,
    }).catch(() => {});

    // Broadcast project update to all connected clients
    try {
      getIO().emit('project:updated', {
        projectId,
        raisedAmount: result.newRaised,
        remainingCap: result.newRemaining,
        status: result.newStatus,
      });
    } catch {
      // Socket may not be initialized in tests
    }

    // Fetch the updated project so we can include endDate/discount in response
    const updatedProject = await prisma.project.findUnique({ where: { id: projectId } });
    const discount = updatedProject && updatedProject.faceValue > 0
      ? ((updatedProject.faceValue - updatedProject.askPrice) / updatedProject.faceValue * 100)
      : 0;

    res.status(201).json({
      investment: result.investment,
      transaction: result.transaction,
      project: {
        status: result.newStatus,
        raisedAmount: result.newRaised,
        remainingCap: result.newRemaining,
        backersCount: updatedProject?.backersCount,
        endDate: updatedProject?.endDate,
        discount: parseFloat(discount.toFixed(1)),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// ============ Revoke investment (during fundraising only) ============
router.delete('/:id/revoke-investment', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId as string;
    const projectId = req.params.id as string;

    const result = await prisma.$transaction(async (tx: Tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) throw new AppError('Project not found', 404);

      // Only allow revocation during fundraising
      if (!['Fundraising', 'Ending Soon'].includes(project.status)) {
        throw new AppError('Investment can only be revoked during fundraising period', 400);
      }

      // Find user's active investments in this project
      const investments = await tx.investment.findMany({
        where: { userId, projectId, status: 'active' },
      });

      if (investments.length === 0) {
        throw new AppError('No active investment found for this project', 404);
      }

      const totalAmount = investments.reduce((sum: number, inv: any) => sum + inv.amount, 0);
      const totalShares = investments.reduce((sum: number, inv: any) => sum + inv.shares, 0);

      // Delete all investments for this user on this project
      await tx.investment.deleteMany({
        where: { userId, projectId, status: 'active' },
      });

      // Update project stats
      const newRaised = Math.max(0, project.raisedAmount - totalAmount);
      const newRemaining = project.targetAmount - newRaised;

      const distinctBackers = await tx.investment.groupBy({
        by: ['userId'],
        where: { projectId },
      });

      // If project was Funded and now has capacity, revert to Fundraising
      let newStatus = project.status;
      if (project.status === 'Funded' && newRemaining > 0) {
        newStatus = 'Fundraising';
      }

      await tx.project.update({
        where: { id: projectId },
        data: {
          raisedAmount: newRaised,
          remainingCap: newRemaining,
          backersCount: distinctBackers.length,
          status: newStatus,
        },
      });

      // Remove or decrease portfolio holding
      const holdingAsset = `AIUSD-${project.title}`;
      const holding = await tx.portfolioHolding.findUnique({
        where: { userId_asset: { userId, asset: holdingAsset } },
      });

      if (holding) {
        if (holding.amount <= totalShares) {
          await tx.portfolioHolding.delete({ where: { id: holding.id } });
        } else {
          await tx.portfolioHolding.update({
            where: { id: holding.id },
            data: { amount: holding.amount - totalShares },
          });
        }
      }

      // Create refund transaction
      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: 'REDEEM',
          amount: totalAmount,
          asset: holdingAsset,
          status: 'COMPLETED',
        },
      });

      return { totalAmount, transaction, newStatus, newRaised, newRemaining };
    });

    // WebSocket notifications
    emitToUser(userId, 'investment:revoked', { projectId, amount: result.totalAmount });

    try {
      getIO().emit('project:updated', {
        projectId,
        raisedAmount: result.newRaised,
        remainingCap: result.newRemaining,
        status: result.newStatus,
      });
    } catch {
      // Socket may not be initialized in tests
    }

    res.json({
      message: 'Investment revoked successfully',
      refundAmount: result.totalAmount,
      transaction: result.transaction,
      project: {
        status: result.newStatus,
        raisedAmount: result.newRaised,
        remainingCap: result.newRemaining,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
