import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
type Tx = Omit<typeof prisma, '$transaction' | '$connect' | '$disconnect' | '$on' | '$extends'>;
import { authRequired, type AuthRequest } from '../middleware/auth.js';
import { adminRequired } from '../middleware/adminGuard.js';
import { AppError } from '../middleware/errorHandler.js';
import { recordCreditEvent, ISSUER_EVENTS } from '../services/credit.service.js';
import { emitToUser, getIO } from '../socket/index.js';
import { notifyMany } from '../services/notification.service.js';

const router = Router();

// Waterfall priority tiers with recovery discount factors
const WATERFALL_TIERS = [
  { tier: 'senior', label: 'Senior Secured (Collateral)', recoveryRate: 0.90 },
  { tier: 'unsecured', label: 'Unsecured Claims', recoveryRate: 0.50 },
  { tier: 'equity', label: 'Equity Residual', recoveryRate: 0.20 },
] as const;

// Get collaterals for a project
router.get('/:projectId/collateral', async (req, res, next) => {
  try {
    const collaterals = await prisma.collateral.findMany({
      where: { projectId: req.params.projectId as string },
    });
    res.json(collaterals);
  } catch (err) {
    next(err);
  }
});

// Add collateral to a project
const collateralSchema = z.object({
  type: z.enum(['physical_asset', 'receivable', 'deposit', 'ip_lien']),
  description: z.string().min(1),
  value: z.number().positive(),
});

router.post('/:projectId/collateral', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const data = collateralSchema.parse(req.body);
    const projectId = req.params.projectId as string;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new AppError('Project not found', 404);

    const collateral = await prisma.collateral.create({
      data: { projectId, ...data },
    });

    res.status(201).json(collateral);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// Get liquidation events for a project
router.get('/:projectId/events', async (req, res, next) => {
  try {
    const events = await prisma.liquidationEvent.findMany({
      where: { projectId: req.params.projectId as string },
      include: { collateral: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(events);
  } catch (err) {
    next(err);
  }
});

// Get liquidation summary for a project (collateral value, outstanding debt, recovery estimate)
router.get('/:projectId/summary', async (req, res, next) => {
  try {
    const projectId = req.params.projectId as string;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new AppError('Project not found', 404);

    const collaterals = await prisma.collateral.findMany({
      where: { projectId },
    });

    const totalCollateralValue = collaterals
      .filter((c: any) => c.status === 'pledged' || c.status === 'seized')
      .reduce((sum: number, c: any) => sum + c.value, 0);

    // Outstanding debt = total unpaid repayments
    const unpaid = await prisma.repaymentSchedule.findMany({
      where: { projectId, status: { in: ['upcoming', 'overdue', 'due'] } },
    });
    const outstandingDebt = unpaid.reduce((sum: number, p: any) => sum + p.totalDue, 0);

    // Active investors
    const investments = await prisma.investment.findMany({
      where: { projectId, status: 'active' },
    });

    // Waterfall estimate
    const waterfallEstimate = WATERFALL_TIERS.map(tier => {
      let recoverable = 0;
      if (tier.tier === 'senior') {
        recoverable = Math.min(totalCollateralValue * tier.recoveryRate, outstandingDebt);
      } else if (tier.tier === 'unsecured') {
        const seniorRecovered = Math.min(totalCollateralValue * WATERFALL_TIERS[0].recoveryRate, outstandingDebt);
        const remaining = outstandingDebt - seniorRecovered;
        recoverable = remaining * tier.recoveryRate;
      } else {
        recoverable = 0; // equity gets remainder after all claims
      }
      return { ...tier, recoverable };
    });

    const totalRecoverable = waterfallEstimate.reduce((sum, t) => sum + t.recoverable, 0);

    res.json({
      outstandingDebt,
      totalCollateralValue,
      totalRecoverable,
      recoveryRate: outstandingDebt > 0 ? totalRecoverable / outstandingDebt : 0,
      investorCount: investments.length,
      totalInvested: investments.reduce((sum: number, i: any) => sum + i.amount, 0),
      waterfall: waterfallEstimate,
      collaterals,
    });
  } catch (err) {
    next(err);
  }
});

// Trigger liquidation (admin/system action for overdue>30 days or fraud)
const triggerSchema = z.object({
  reason: z.enum(['overdue_30', 'overdue_90', 'fraud']).optional(),
});

router.post('/:projectId/trigger', authRequired, adminRequired, async (req: AuthRequest, res, next) => {
  try {
    const projectId = req.params.projectId as string;
    const { reason: manualReason } = triggerSchema.parse(req.body || {});

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new AppError('Project not found', 404);

    // Determine trigger reason
    const overdueCount = await prisma.repaymentSchedule.count({
      where: { projectId, status: 'overdue' },
    });

    let triggerReason = manualReason;
    if (!triggerReason) {
      if (overdueCount === 0) {
        throw new AppError('No overdue payments — liquidation not warranted', 400);
      }
      triggerReason = overdueCount >= 3 ? 'overdue_90' : 'overdue_30';
    }

    // Check if liquidation is already in progress
    const existingLiq = await prisma.liquidationEvent.findFirst({
      where: { projectId, status: { in: ['initiated', 'in_progress'] } },
    });
    if (existingLiq) throw new AppError('Liquidation already in progress', 400);

    const result = await prisma.$transaction(async (tx: Tx) => {
      // Find all pledged collateral
      const collaterals = await tx.collateral.findMany({
        where: { projectId, status: 'pledged' },
      });

      // Seize all collateral
      if (collaterals.length > 0) {
        await tx.collateral.updateMany({
          where: { projectId, status: 'pledged' },
          data: { status: 'seized' },
        });
      }

      // Calculate total collateral value
      const totalCollateralValue = collaterals.reduce((sum: number, c: any) => sum + c.value, 0);

      // Calculate outstanding debt
      const unpaidSchedule = await tx.repaymentSchedule.findMany({
        where: { projectId, status: { in: ['upcoming', 'overdue', 'due'] } },
      });
      const outstandingDebt = unpaidSchedule.reduce((sum: number, p: any) => sum + p.totalDue, 0);

      // Waterfall distribution calculation
      const seniorRecovery = Math.min(totalCollateralValue * 0.90, outstandingDebt);
      const remainingAfterSenior = outstandingDebt - seniorRecovery;
      const unsecuredRecovery = remainingAfterSenior > 0
        ? Math.min((totalCollateralValue - seniorRecovery) * 0.5, remainingAfterSenior)
        : 0;
      const totalRecovered = seniorRecovery + unsecuredRecovery;

      // Create liquidation events for each collateral
      const events = [];
      for (const col of collaterals) {
        const share = totalCollateralValue > 0 ? col.value / totalCollateralValue : 0;
        const event = await tx.liquidationEvent.create({
          data: {
            projectId,
            collateralId: col.id,
            triggerReason,
            status: 'in_progress',
            waterfallTier: 'senior',
            recoveredAmount: totalRecovered * share,
          },
        });
        events.push(event);
      }

      // If no collateral, create a single event
      if (collaterals.length === 0) {
        const event = await tx.liquidationEvent.create({
          data: {
            projectId,
            triggerReason,
            status: 'in_progress',
            waterfallTier: 'senior',
            recoveredAmount: 0,
          },
        });
        events.push(event);
      }

      // Mark all unpaid periods as defaulted
      await tx.repaymentSchedule.updateMany({
        where: { projectId, status: { in: ['upcoming', 'overdue', 'due'] } },
        data: { status: 'defaulted' },
      });

      // Update project status
      await tx.project.update({
        where: { id: projectId },
        data: { status: 'Failed' },
      });

      // Mark all active investments as defaulted
      await tx.investment.updateMany({
        where: { projectId, status: 'active' },
        data: { status: 'defaulted' },
      });

      return { events, totalRecovered, outstandingDebt, totalCollateralValue };
    });

    // Credit penalties for issuer (find via investments)
    const investments = await prisma.investment.findMany({
      where: { projectId },
      select: { userId: true },
    });
    // Find the issuer (project creator) — get from enterprise verification
    const enterprise = await prisma.enterpriseVerification.findFirst({
      where: { userId: { in: investments.map((i: any) => i.userId) } },
    });
    if (enterprise) {
      const penaltyEvent = triggerReason === 'fraud'
        ? ISSUER_EVENTS.FRAUD
        : triggerReason === 'overdue_90'
          ? ISSUER_EVENTS.LATE_90_PLUS
          : ISSUER_EVENTS.LATE_1_30;
      try {
        await recordCreditEvent(enterprise.userId, 'liquidation_penalty', penaltyEvent.delta, penaltyEvent.reason, projectId);
      } catch { /* non-critical */ }
    }

    // Distribute recovered funds to investors
    const allInvestments = await prisma.investment.findMany({ where: { projectId } });
    const totalInvested = allInvestments.reduce((sum: number, i: any) => sum + i.amount, 0);

    for (const inv of allInvestments) {
      if (result.totalRecovered > 0 && totalInvested > 0) {
        const investorShare = inv.amount / totalInvested;
        const payout = result.totalRecovered * investorShare;

        await prisma.transaction.create({
          data: {
            userId: inv.userId,
            type: 'REDEEM',
            amount: payout,
            asset: `AIUSD-${project.title}-recovery`,
            status: 'COMPLETED',
          },
        });

        try {
          emitToUser(inv.userId, 'liquidation:payout', { projectId, amount: payout });
        } catch { /* non-critical */ }
      }
    }

    // Broadcast project failure
    try {
      getIO().emit('project:updated', { projectId, status: 'Failed' });
    } catch { /* non-critical */ }

    // Notify all investors about liquidation
    const investorIds = [...new Set(allInvestments.map((i: any) => i.userId))] as string[];
    if (investorIds.length) {
      notifyMany(investorIds, {
        type: 'liquidation',
        title: 'Liquidation Event',
        body: `A project you invested in has been liquidated. Recovery proceeds are being distributed.`,
        refType: 'project',
        refId: projectId,
      }).catch(() => {});
    }

    res.status(201).json({
      events: result.events,
      summary: {
        totalRecovered: result.totalRecovered,
        outstandingDebt: result.outstandingDebt,
        totalCollateralValue: result.totalCollateralValue,
        recoveryRate: result.outstandingDebt > 0 ? result.totalRecovered / result.outstandingDebt : 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Complete a liquidation (mark as completed after asset disposal)
router.post('/:projectId/complete', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const projectId = req.params.projectId as string;

    const updated = await prisma.liquidationEvent.updateMany({
      where: { projectId, status: 'in_progress' },
      data: { status: 'completed' },
    });

    // Release or liquidate collateral
    await prisma.collateral.updateMany({
      where: { projectId, status: 'seized' },
      data: { status: 'liquidated' },
    });

    res.json({ completed: updated.count });
  } catch (err) {
    next(err);
  }
});

export default router;
