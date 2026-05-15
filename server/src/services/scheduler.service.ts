import prisma from '../db.js';
import { recordCreditEvent, ISSUER_EVENTS, INVESTOR_EVENTS } from './credit.service.js';
import { notifyMany } from './notification.service.js';
import { getIO } from '../socket/index.js';
import { sweepExpiredQuotas } from './subscription.service.js';
import { sweepGuestQuotas } from './guest.service.js';

// Interval handles for cleanup
let overdueInterval: ReturnType<typeof setInterval> | null = null;
let holdTimeInterval: ReturnType<typeof setInterval> | null = null;
let proposalInterval: ReturnType<typeof setInterval> | null = null;
let fundraiseInterval: ReturnType<typeof setInterval> | null = null;
let endingSoonInterval: ReturnType<typeof setInterval> | null = null;
let redemptionInterval: ReturnType<typeof setInterval> | null = null;
let subscriptionResetInterval: ReturnType<typeof setInterval> | null = null;
let guestQuotaSweepInterval: ReturnType<typeof setInterval> | null = null;

// ==================== Expired Fundraise Detection ====================
// Auto-fail fundraises that pass durationDays without reaching Soft Cap
// Auto-fund fundraises that pass durationDays and have reached Soft Cap
async function checkExpiredFundraises() {
  try {
    const now = new Date();

    // Get all active fundraising projects
    const projects = await prisma.project.findMany({
      where: { status: { in: ['Fundraising', 'Ending Soon'] } },
    });

    for (const project of projects) {
      // Calculate end date: createdAt + durationDays
      const endDate = new Date(project.createdAt);
      endDate.setDate(endDate.getDate() + project.durationDays);

      if (now < endDate) continue; // Not expired yet

      const softCap = project.targetAmount * 0.5;
      const reachedSoftCap = project.raisedAmount >= softCap;

      if (reachedSoftCap) {
        // Soft cap reached → mark as Funded
        await prisma.project.update({
          where: { id: project.id },
          data: { status: 'Funded' },
        });

        console.log(`[Scheduler] Project "${project.title}" ended with soft cap reached → Funded ($${project.raisedAmount}/$${project.targetAmount})`);

        // Notify investors of success
        const investments = await prisma.investment.findMany({
          where: { projectId: project.id, status: 'active' },
          select: { userId: true },
        });
        const investorIds = [...new Set(investments.map(i => i.userId))];
        if (investorIds.length) {
          notifyMany(investorIds, {
            type: 'investment',
            title: 'Fundraise Successful',
            body: `"${project.title}" has been funded! Your investment is now locked.`,
            refType: 'project',
            refId: project.id,
          }).catch(() => {});
        }

        // Broadcast project update
        try { getIO().emit('project:updated', { projectId: project.id, status: 'Funded' }); } catch {}
      } else {
        // Soft cap NOT reached → Failed, refund all investors
        await refundFailedProject(project);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Expired fundraise check failed:', err);
  }
}

// Refund all investors and mark project as Failed
async function refundFailedProject(project: any) {
  try {
    const investments = await prisma.investment.findMany({
      where: { projectId: project.id, status: 'active' },
    });

    if (investments.length === 0) {
      // No investors, just mark failed
      await prisma.project.update({
        where: { id: project.id },
        data: { status: 'Failed', raisedAmount: 0, remainingCap: project.targetAmount, backersCount: 0 },
      });
      return;
    }

    // Process refunds in a transaction
    await prisma.$transaction(async (tx) => {
      // Create REDEEM transactions for each investor
      for (const inv of investments) {
        await tx.transaction.create({
          data: {
            userId: inv.userId,
            type: 'REDEEM',
            amount: inv.amount,
            asset: `AIUSD-${project.title}`,
            status: 'COMPLETED',
          },
        });

        // Remove portfolio holding
        const holdingAsset = `AIUSD-${project.title}`;
        const holding = await tx.portfolioHolding.findUnique({
          where: { userId_asset: { userId: inv.userId, asset: holdingAsset } },
        });
        if (holding) {
          if (holding.amount <= inv.shares) {
            await tx.portfolioHolding.delete({ where: { id: holding.id } });
          } else {
            await tx.portfolioHolding.update({
              where: { id: holding.id },
              data: { amount: holding.amount - inv.shares },
            });
          }
        }
      }

      // Mark all investments as refunded (use 'sold' status to indicate closed)
      await tx.investment.updateMany({
        where: { projectId: project.id, status: 'active' },
        data: { status: 'sold' },
      });

      // Mark project as Failed
      await tx.project.update({
        where: { id: project.id },
        data: {
          status: 'Failed',
          raisedAmount: 0,
          remainingCap: project.targetAmount,
          backersCount: 0,
        },
      });
    });

    // Credit penalty for issuer (find via enterprise verification)
    const enterprise = await prisma.enterpriseVerification.findFirst({
      where: { status: 'verified' },
    });
    if (enterprise) {
      try {
        await recordCreditEvent(
          enterprise.userId,
          'fundraise_failed',
          ISSUER_EVENTS.FUNDRAISE_FAILED.delta,
          `${ISSUER_EVENTS.FUNDRAISE_FAILED.reason}: "${project.title}"`,
          project.id,
        );
      } catch { /* non-critical */ }
    }

    // Notify investors
    const investorIds = [...new Set(investments.map((i: any) => i.userId))] as string[];
    if (investorIds.length) {
      notifyMany(investorIds, {
        type: 'investment',
        title: 'Fundraise Failed — Refund Issued',
        body: `"${project.title}" did not reach its funding goal. Your investment of has been refunded.`,
        refType: 'project',
        refId: project.id,
      }).catch(() => {});
    }

    // Broadcast project failure
    try { getIO().emit('project:updated', { projectId: project.id, status: 'Failed' }); } catch {}

    console.log(`[Scheduler] Project "${project.title}" failed (${project.raisedAmount}/${project.targetAmount * 0.5} soft cap). Refunded ${investments.length} investors.`);
  } catch (err) {
    console.error(`[Scheduler] Refund failed for project ${project.id}:`, err);
  }
}

// ==================== Ending Soon Detection ====================
// Auto-mark Fundraising projects as "Ending Soon" when endDate is within 3 days
async function markEndingSoon() {
  try {
    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const projects = await prisma.project.findMany({
      where: { status: 'Fundraising' },
    });

    let marked = 0;
    for (const project of projects) {
      // Use explicit endDate if available, otherwise compute from createdAt + durationDays
      const endDate = project.endDate
        ?? new Date(project.createdAt.getTime() + project.durationDays * 24 * 60 * 60 * 1000);

      // If endDate is within 3 days from now (and still in the future) → Ending Soon
      if (endDate <= threeDaysLater && endDate > now) {
        await prisma.project.update({
          where: { id: project.id },
          data: { status: 'Ending Soon' },
        });
        marked++;

        const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        console.log(`[Scheduler] "${project.title}" → Ending Soon (${daysLeft} day(s) left)`);

        // Notify existing investors
        const investments = await prisma.investment.findMany({
          where: { projectId: project.id, status: 'active' },
          select: { userId: true },
        });
        const investorIds = [...new Set(investments.map(i => i.userId))];
        if (investorIds.length) {
          notifyMany(investorIds, {
            type: 'investment',
            title: '⏳ Campaign Ending Soon',
            body: `"${project.title}" ends in ${daysLeft} day(s). Last chance to invest!`,
            refType: 'project',
            refId: project.id,
          }).catch(() => {});
        }

        // WebSocket broadcast
        try {
          getIO().emit('project:updated', { projectId: project.id, status: 'Ending Soon' });
        } catch { /* Socket may not be initialized */ }
      }
    }

    if (marked > 0) {
      console.log(`[Scheduler] Marked ${marked} project(s) as Ending Soon`);
    }
  } catch (err) {
    console.error('[Scheduler] Ending Soon check failed:', err);
  }
}

// ==================== Overdue Detection ====================
// Mark overdue payments + apply credit penalties
async function checkOverduePayments() {
  try {
    const now = new Date();

    const newlyOverdue = await prisma.repaymentSchedule.findMany({
      where: { status: 'upcoming', dueDate: { lt: now } },
      select: { id: true, projectId: true },
    });

    if (newlyOverdue.length === 0) return;

    // Mark as overdue
    await prisma.repaymentSchedule.updateMany({
      where: { status: 'upcoming', dueDate: { lt: now } },
      data: { status: 'overdue' },
    });

    // Group by project and apply penalties
    const projectIds = [...new Set(newlyOverdue.map((r: any) => r.projectId))] as string[];
    for (const projectId of projectIds as string[]) {
      const totalOverdue = await prisma.repaymentSchedule.count({
        where: { projectId, status: 'overdue' },
      });

      // Find issuer (first investment creator as proxy)
      const firstInvestment = await prisma.investment.findFirst({
        where: { projectId },
        select: { userId: true },
      });
      if (!firstInvestment) continue;

      let penaltyEvent;
      if (totalOverdue > 3) penaltyEvent = ISSUER_EVENTS.LATE_90_PLUS;
      else if (totalOverdue > 1) penaltyEvent = ISSUER_EVENTS.LATE_31_90;
      else penaltyEvent = ISSUER_EVENTS.LATE_1_30;

      try {
        await recordCreditEvent(
          firstInvestment.userId,
          'late_payment_auto',
          penaltyEvent.delta,
          `${penaltyEvent.reason} (auto-detected)`,
          projectId,
        );
      } catch { /* non-critical */ }

      // Notify investors about overdue
      const investments = await prisma.investment.findMany({
        where: { projectId, status: 'active' },
        select: { userId: true },
      });
      const investorIds = [...new Set(investments.map(i => i.userId))];
      if (investorIds.length) {
        notifyMany(investorIds, {
          type: 'repayment',
          title: 'Payment Overdue',
          body: `A project you invested in has ${totalOverdue} overdue payment(s).`,
          refType: 'project',
          refId: projectId,
        }).catch(() => {});
      }
    }

    console.log(`[Scheduler] Marked ${newlyOverdue.length} payments overdue across ${projectIds.length} projects`);
  } catch (err) {
    console.error('[Scheduler] Overdue check failed:', err);
  }
}

// ==================== Hold Time Milestones ====================
// Check investments for 30/90/180/360-day hold bonuses
const HOLD_MILESTONES = [
  { days: 360, eventType: 'hold_360_days', event: INVESTOR_EVENTS.HOLD_360_DAYS },
  { days: 180, eventType: 'hold_180_days', event: INVESTOR_EVENTS.HOLD_180_DAYS },
  { days: 90, eventType: 'hold_90_days', event: INVESTOR_EVENTS.HOLD_90_DAYS },
  { days: 30, eventType: 'hold_30_days', event: INVESTOR_EVENTS.HOLD_30_DAYS },
] as const;

async function checkHoldTimeMilestones() {
  try {
    const now = new Date();
    let totalAwarded = 0;

    for (const milestone of HOLD_MILESTONES) {
      const threshold = new Date(now.getTime() - milestone.days * 24 * 60 * 60 * 1000);

      const investments = await prisma.investment.findMany({
        where: {
          status: 'active',
          createdAt: { lt: threshold },
        },
        select: { id: true, userId: true, projectId: true },
      });

      for (const inv of investments) {
        // Check if already awarded
        const existing = await prisma.creditScoreEvent.findFirst({
          where: { userId: inv.userId, eventType: milestone.eventType, refId: inv.id },
        });
        if (!existing) {
          try {
            await recordCreditEvent(
              inv.userId, milestone.eventType,
              milestone.event.delta,
              milestone.event.reason,
              inv.id,
            );
            totalAwarded++;
          } catch { /* non-critical */ }
        }
      }
    }

    if (totalAwarded > 0) {
      console.log(`[Scheduler] Awarded ${totalAwarded} hold-time milestone bonuses`);
    }
  } catch (err) {
    console.error('[Scheduler] Hold time check failed:', err);
  }
}

// ==================== Proposal Finalization ====================
// Auto-finalize expired governance proposals
async function finalizeExpiredProposals() {
  try {
    const now = new Date();

    const expired = await prisma.governanceProposal.findMany({
      where: { status: 'active', endsAt: { lt: now } },
    });

    for (const proposal of expired) {
      const totalVotes = proposal.forVotes + proposal.againstVotes;
      let newStatus: string;

      if (totalVotes < proposal.quorum) {
        newStatus = 'rejected'; // quorum not met
      } else {
        newStatus = proposal.forVotes > proposal.againstVotes ? 'passed' : 'rejected';
      }

      await prisma.governanceProposal.update({
        where: { id: proposal.id },
        data: { status: newStatus },
      });
    }

    if (expired.length > 0) {
      console.log(`[Scheduler] Finalized ${expired.length} expired proposals`);
    }
  } catch (err) {
    console.error('[Scheduler] Proposal finalization failed:', err);
  }
}

// ==================== Redemption Queue Processing ====================
// Process queued large AIUSD redemptions that have passed T+7
async function processRedemptionQueue() {
  try {
    const now = new Date();

    const ready = await prisma.redemptionQueue.findMany({
      where: { status: 'queued', processAfter: { lte: now } },
    });

    if (ready.length === 0) return;

    for (const entry of ready) {
      await prisma.$transaction(async (tx) => {
        // Mark as completed
        await tx.redemptionQueue.update({
          where: { id: entry.id },
          data: { status: 'completed', completedAt: now },
        });

        // Update associated QUEUED transaction to COMPLETED
        await tx.transaction.updateMany({
          where: { userId: entry.userId, type: 'REDEEM', status: 'QUEUED', asset: 'AIUSD' },
          data: { status: 'COMPLETED' },
        });
      });

      // Notify user
      try {
        const { notify } = await import('./notification.service.js');
        await notify({
          userId: entry.userId,
          type: 'system',
          title: 'Redemption Complete',
          body: `Your AIUSD redemption of $${entry.netAmount.toFixed(2)} has been processed.`,
          refType: 'redemption',
          refId: entry.id,
        });
      } catch { /* non-critical */ }
    }

    console.log(`[Scheduler] Processed ${ready.length} queued redemptions`);
  } catch (err) {
    console.error('[Scheduler] Redemption queue processing failed:', err);
  }
}

// ==================== Start / Stop ====================
export function startScheduler() {
  console.log('[Scheduler] Starting background jobs...');

  // Check expired fundraises every 30 minutes
  fundraiseInterval = setInterval(checkExpiredFundraises, 30 * 60 * 1000);

  // Check for ending-soon projects every 15 minutes
  endingSoonInterval = setInterval(markEndingSoon, 15 * 60 * 1000);

  // Check overdue payments every hour
  overdueInterval = setInterval(checkOverduePayments, 60 * 60 * 1000);

  // Check hold-time milestones every 6 hours
  holdTimeInterval = setInterval(checkHoldTimeMilestones, 6 * 60 * 60 * 1000);

  // Finalize expired proposals every 30 minutes
  proposalInterval = setInterval(finalizeExpiredProposals, 30 * 60 * 1000);

  // Process redemption queue every 30 minutes
  redemptionInterval = setInterval(processRedemptionQueue, 30 * 60 * 1000);

  // Roll subscription quota windows forward for idle users every hour.
  // Active users get lazy-reset on read; this handles the inactive tail.
  subscriptionResetInterval = setInterval(async () => {
    try {
      const count = await sweepExpiredQuotas();
      if (count > 0) console.log(`[Scheduler] Rolled subscription quota windows for ${count} users`);
    } catch (err) {
      console.error('[Scheduler] Subscription quota sweep failed:', err);
    }
  }, 60 * 60 * 1000);

  // Same idea for guest quota windows (per-guest and per-IP tables).
  guestQuotaSweepInterval = setInterval(async () => {
    try {
      const count = await sweepGuestQuotas();
      if (count > 0) console.log(`[Scheduler] Rolled guest quota windows for ${count} records`);
    } catch (err) {
      console.error('[Scheduler] Guest quota sweep failed:', err);
    }
  }, 60 * 60 * 1000);

  // Run once immediately on startup (after 5s delay for DB warmup)
  setTimeout(() => {
    checkExpiredFundraises();
    markEndingSoon();
    checkOverduePayments();
    checkHoldTimeMilestones();
    finalizeExpiredProposals();
    processRedemptionQueue();
    sweepExpiredQuotas().catch((err) => console.error('[Scheduler] Initial quota sweep failed:', err));
    sweepGuestQuotas().catch((err) => console.error('[Scheduler] Initial guest quota sweep failed:', err));
  }, 5000);
}

export function stopScheduler() {
  if (fundraiseInterval) clearInterval(fundraiseInterval);
  if (endingSoonInterval) clearInterval(endingSoonInterval);
  if (overdueInterval) clearInterval(overdueInterval);
  if (holdTimeInterval) clearInterval(holdTimeInterval);
  if (proposalInterval) clearInterval(proposalInterval);
  if (redemptionInterval) clearInterval(redemptionInterval);
  if (subscriptionResetInterval) clearInterval(subscriptionResetInterval);
  if (guestQuotaSweepInterval) clearInterval(guestQuotaSweepInterval);
  console.log('[Scheduler] Background jobs stopped');
}
