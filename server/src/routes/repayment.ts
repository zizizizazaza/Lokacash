import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authRequired, type AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { recordCreditEvent, ISSUER_EVENTS } from '../services/credit.service.js';
import { emitToUser } from '../socket/index.js';
import { notifyMany } from '../services/notification.service.js';

const router = Router();

// Get repayment schedule for a project
router.get('/:projectId/schedule', async (req, res, next) => {
  try {
    const projectId = req.params.projectId as string;
    const schedule = await prisma.repaymentSchedule.findMany({
      where: { projectId },
      orderBy: { periodNumber: 'asc' },
    });
    res.json(schedule);
  } catch (err) {
    next(err);
  }
});

// Create repayment schedule for a project (issuer action)
const scheduleSchema = z.object({
  periods: z.number().int().min(1).max(60),
});

router.post('/:projectId/schedule', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const projectId = req.params.projectId as string;
    const { periods } = scheduleSchema.parse(req.body);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new AppError('Project not found', 404);
    if (!['Funded', 'Sold Out'].includes(project.status)) {
      throw new AppError('Project must be funded to create repayment schedule', 400);
    }

    // Check for existing schedule
    const existing = await prisma.repaymentSchedule.count({ where: { projectId } });
    if (existing > 0) throw new AppError('Schedule already exists for this project', 400);

    // Calculate monthly payments (simple amortization)
    const monthlyRate = project.apy / 100 / 12;
    const totalInterest = project.raisedAmount * monthlyRate * periods;
    const principalPerPeriod = project.raisedAmount / periods;
    const interestPerPeriod = totalInterest / periods;

    const scheduleItems = [];
    const now = new Date();
    for (let i = 1; i <= periods; i++) {
      const dueDate = new Date(now);
      dueDate.setMonth(dueDate.getMonth() + i);

      scheduleItems.push({
        projectId,
        periodNumber: i,
        dueDate,
        principalDue: principalPerPeriod,
        interestDue: interestPerPeriod,
        totalDue: principalPerPeriod + interestPerPeriod,
      });
    }

    await prisma.repaymentSchedule.createMany({ data: scheduleItems });
    const schedule = await prisma.repaymentSchedule.findMany({
      where: { projectId },
      orderBy: { periodNumber: 'asc' },
    });

    res.status(201).json(schedule);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// Helper: count consecutive on-time payments
async function getOnTimeStreak(projectId: string): Promise<number> {
  const paid = await prisma.repaymentSchedule.findMany({
    where: { projectId, status: 'paid' },
    orderBy: { periodNumber: 'desc' },
  });
  let streak = 0;
  for (const p of paid) {
    if (p.paidAt && p.paidAt <= p.dueDate) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// Record a repayment (issuer pays one period)
router.post('/:projectId/pay/:periodNumber', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const projectId = req.params.projectId as string;
    const periodNumber = parseInt(req.params.periodNumber as string, 10);
    const userId = req.userId as string;

    const schedule = await prisma.repaymentSchedule.findUnique({
      where: { projectId_periodNumber: { projectId, periodNumber } },
    });
    if (!schedule) throw new AppError('Schedule period not found', 404);
    if (schedule.status === 'paid') throw new AppError('Already paid', 400);

    const now = new Date();
    const isLate = now > schedule.dueDate;

    const updated = await prisma.repaymentSchedule.update({
      where: { id: schedule.id },
      data: { status: 'paid', paidAmount: schedule.totalDue, paidAt: now },
    });

    // --- Credit scoring for issuer ---
    if (!isLate) {
      // On-time payment bonus
      await recordCreditEvent(
        userId, 'repayment_on_time',
        ISSUER_EVENTS.REPAYMENT_ON_TIME.delta,
        `${ISSUER_EVENTS.REPAYMENT_ON_TIME.reason} (period ${periodNumber})`,
        projectId,
      );

      // Streak bonuses
      const streak = await getOnTimeStreak(projectId);
      if (streak === 3) {
        await recordCreditEvent(
          userId, 'repayment_streak_3',
          ISSUER_EVENTS.REPAYMENT_STREAK_3.delta,
          ISSUER_EVENTS.REPAYMENT_STREAK_3.reason,
          projectId,
        );
      } else if (streak === 6) {
        await recordCreditEvent(
          userId, 'repayment_streak_6',
          ISSUER_EVENTS.REPAYMENT_STREAK_6.delta,
          ISSUER_EVENTS.REPAYMENT_STREAK_6.reason,
          projectId,
        );
      }
    }

    // Check if ALL periods are now paid → early repayment bonus
    const totalPeriods = await prisma.repaymentSchedule.count({ where: { projectId } });
    const paidPeriods = await prisma.repaymentSchedule.count({ where: { projectId, status: 'paid' } });
    if (paidPeriods === totalPeriods) {
      // Check if the last period was paid before its due date
      const lastPeriod = await prisma.repaymentSchedule.findFirst({
        where: { projectId },
        orderBy: { periodNumber: 'desc' },
      });
      if (lastPeriod && lastPeriod.paidAt && lastPeriod.paidAt < lastPeriod.dueDate) {
        await recordCreditEvent(
          userId, 'early_repayment',
          ISSUER_EVENTS.EARLY_REPAYMENT.delta,
          ISSUER_EVENTS.EARLY_REPAYMENT.reason,
          projectId,
        );
      }
    }

    // Create INTEREST transactions for all investors in this project
    const investments = await prisma.investment.findMany({
      where: { projectId, status: 'active' },
    });
    const project = await prisma.project.findUnique({ where: { id: projectId } });

    if (project) {
      for (const inv of investments) {
        const investorShare = inv.amount / project.raisedAmount;
        const interestAmount = schedule.interestDue * investorShare;

        await prisma.transaction.create({
          data: {
            userId: inv.userId,
            type: 'INTEREST',
            amount: interestAmount,
            asset: `AIUSD-${project.title}`,
            status: 'COMPLETED',
          },
        });

        try {
          emitToUser(inv.userId, 'repayment:received', {
            projectId, periodNumber, amount: interestAmount,
          });
        } catch { /* Socket may not be initialized */ }
      }
    }

    // Notify investors about repayment
    const investorUserIds = [...new Set(investments.map((i: any) => i.userId))] as string[];
    if (investorUserIds.length) {
      notifyMany(investorUserIds, {
        type: 'repayment',
        title: 'Repayment Received',
        body: `Period ${periodNumber} repayment has been distributed.`,
        refType: 'project',
        refId: projectId,
      }).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Check and mark overdue payments + apply credit penalties
router.post('/check-overdue', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const now = new Date();

    // Find newly overdue periods (upcoming → overdue)
    const newlyOverdue = await prisma.repaymentSchedule.findMany({
      where: { status: 'upcoming', dueDate: { lt: now } },
      include: {
        project: {
          select: { id: true, investments: { select: { userId: true }, take: 1 } },
        },
      },
    });

    // Mark them overdue
    if (newlyOverdue.length > 0) {
      await prisma.repaymentSchedule.updateMany({
        where: { status: 'upcoming', dueDate: { lt: now } },
        data: { status: 'overdue' },
      });
    }

    // Apply credit penalties per project
    const projectPenalties: Record<string, { count: number; issuerUserId?: string }> = {};
    for (const period of newlyOverdue) {
      const pid = period.projectId;
      if (!projectPenalties[pid]) {
        // Count total overdue periods for this project
        const totalOverdue = await prisma.repaymentSchedule.count({
          where: { projectId: pid, status: 'overdue' },
        });
        const issuerUserId = period.project?.investments[0]?.userId;
        projectPenalties[pid] = { count: totalOverdue, issuerUserId };
      }
    }

    for (const [projectId, info] of Object.entries(projectPenalties)) {
      if (!info.issuerUserId) continue;

      const daysOverdue = info.count * 30; // approximate
      let penaltyEvent;
      if (daysOverdue > 90) {
        penaltyEvent = ISSUER_EVENTS.LATE_90_PLUS;
      } else if (daysOverdue > 30) {
        penaltyEvent = ISSUER_EVENTS.LATE_31_90;
      } else {
        penaltyEvent = ISSUER_EVENTS.LATE_1_30;
      }

      try {
        await recordCreditEvent(
          info.issuerUserId,
          'late_payment',
          penaltyEvent.delta,
          penaltyEvent.reason,
          projectId,
        );
      } catch { /* non-critical */ }
    }

    res.json({ markedOverdue: newlyOverdue.length, projectsAffected: Object.keys(projectPenalties).length });
  } catch (err) {
    next(err);
  }
});

export default router;
