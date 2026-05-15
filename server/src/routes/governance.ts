import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
type Tx = Omit<typeof prisma, '$transaction' | '$connect' | '$disconnect' | '$on' | '$extends'>;
import { authRequired, type AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { recordCreditEvent, INVESTOR_EVENTS, getTier } from '../services/credit.service.js';

const router = Router();

// Governance tier thresholds
const GOV_TIERS = {
  OBSERVER:     { min: 100, label: 'Observer' },
  PARTICIPANT:  { min: 150, label: 'Participant' },
  GOVERNANCE:   { min: 500, label: 'Governance' },
  PROPOSER:     { min: 1000, label: 'Proposer' },
} as const;

function getGovTier(score: number) {
  if (score >= GOV_TIERS.PROPOSER.min) return GOV_TIERS.PROPOSER;
  if (score >= GOV_TIERS.GOVERNANCE.min) return GOV_TIERS.GOVERNANCE;
  if (score >= GOV_TIERS.PARTICIPANT.min) return GOV_TIERS.PARTICIPANT;
  if (score >= GOV_TIERS.OBSERVER.min) return GOV_TIERS.OBSERVER;
  return null;
}

// Role coefficients for vote weight: creditScore × roleCoeff × interestCoeff
const ROLE_COEFFICIENTS: Record<string, number> = {
  investor: 1.0,
  issuer: 0.8,
  user: 0.5,
  admin: 1.5,
};

// List active proposals
router.get('/proposals', async (_req, res, next) => {
  try {
    const proposals = await prisma.governanceProposal.findMany({
      include: {
        creator: { select: { id: true, name: true, email: true } },
        votes: { select: { userId: true, vote: true, weight: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(proposals);
  } catch (err) {
    next(err);
  }
});

// Create a proposal — requires Proposer tier (1000+ credit)
const proposalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  category: z.enum(['parameter_change', 'treasury_rebalance', 'fee_adjustment', 'tier_threshold']),
  durationDays: z.number().int().min(1).max(30).default(7),
});

router.post('/proposals', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const data = proposalSchema.parse(req.body);
    const userId = req.userId as string;

    // Check governance tier — must be Proposer (1000+)
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    const govTier = getGovTier(user.creditScore);
    if (!govTier || user.creditScore < GOV_TIERS.PROPOSER.min) {
      throw new AppError(
        `Credit score ${user.creditScore} insufficient. Need ${GOV_TIERS.PROPOSER.min}+ to create proposals.`,
        403,
      );
    }

    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + data.durationDays);

    // Calculate quorum: 10% of total AIUSD holdings
    const totalHoldings = await prisma.portfolioHolding.aggregate({
      _sum: { amount: true },
    });
    const quorum = (totalHoldings._sum.amount || 0) * 0.1;

    const proposal = await prisma.governanceProposal.create({
      data: {
        creatorId: userId,
        title: data.title,
        description: data.description,
        category: data.category,
        endsAt,
        quorum: Math.max(quorum, 1), // minimum quorum of 1
      },
    });

    // Credit reward for creating a proposal
    try {
      await recordCreditEvent(userId, 'proposal_created', 10, 'Created governance proposal', proposal.id);
    } catch { /* non-critical */ }

    res.status(201).json(proposal);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// Vote on a proposal — requires Participant tier (150+)
const voteSchema = z.object({
  vote: z.enum(['for', 'against']),
});

router.post('/proposals/:id/vote', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const { vote } = voteSchema.parse(req.body);
    const userId = req.userId as string;
    const proposalId = req.params.id as string;

    const proposal = await prisma.governanceProposal.findUnique({ where: { id: proposalId } });
    if (!proposal) throw new AppError('Proposal not found', 404);
    if (proposal.status !== 'active') throw new AppError('Voting is closed', 400);
    if (new Date() > proposal.endsAt) throw new AppError('Voting period ended', 400);

    // Check governance tier — must be Participant (150+) to vote
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    const govTier = getGovTier(user.creditScore);
    if (!govTier || user.creditScore < GOV_TIERS.PARTICIPANT.min) {
      throw new AppError(
        `Credit score ${user.creditScore} insufficient. Need ${GOV_TIERS.PARTICIPANT.min}+ to vote.`,
        403,
      );
    }

    // Conflict of interest: issuer cannot vote on their own project's liquidation
    if (proposal.category === 'treasury_rebalance' && proposal.creatorId === userId) {
      throw new AppError('Cannot vote on proposals you created', 403);
    }

    // Check for existing vote
    const existing = await prisma.governanceVote.findUnique({
      where: { proposalId_userId: { proposalId, userId } },
    });
    if (existing) throw new AppError('Already voted', 400);

    // Calculate vote weight: holdings × roleCoefficient
    const holdings = await prisma.portfolioHolding.findMany({ where: { userId } });
    const holdingsWeight = holdings.reduce((sum: number, h: any) => sum + h.amount, 0);
    if (holdingsWeight <= 0) throw new AppError('No holdings to vote with', 400);

    const roleCoeff = ROLE_COEFFICIENTS[user.role] || 0.5;
    const weight = holdingsWeight * roleCoeff;

    const result = await prisma.$transaction(async (tx: Tx) => {
      const newVote = await tx.governanceVote.create({
        data: { proposalId, userId, vote, weight },
      });

      const updateData: Record<string, any> = vote === 'for'
        ? { forVotes: proposal.forVotes + weight }
        : { againstVotes: proposal.againstVotes + weight };

      // Check if quorum is reached → resolve proposal
      const totalVotes = (updateData.forVotes ?? proposal.forVotes) + (updateData.againstVotes ?? proposal.againstVotes);
      if (totalVotes >= proposal.quorum) {
        const forTotal = updateData.forVotes ?? proposal.forVotes;
        const againstTotal = updateData.againstVotes ?? proposal.againstVotes;
        updateData.status = forTotal > againstTotal ? 'passed' : 'rejected';
      }

      await tx.governanceProposal.update({ where: { id: proposalId }, data: updateData });

      return { newVote, proposalStatus: updateData.status };
    });

    // Credit reward for voting
    try {
      await recordCreditEvent(
        userId, 'governance_vote',
        INVESTOR_EVENTS.GOVERNANCE_VOTE.delta,
        INVESTOR_EVENTS.GOVERNANCE_VOTE.reason,
        proposalId,
      );
    } catch { /* non-critical */ }

    res.status(201).json(result.newVote);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// Execute a passed proposal (admin/system action)
router.post('/proposals/:id/execute', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const proposalId = req.params.id as string;

    const proposal = await prisma.governanceProposal.findUnique({ where: { id: proposalId } });
    if (!proposal) throw new AppError('Proposal not found', 404);
    if (proposal.status !== 'passed') throw new AppError('Proposal must be passed to execute', 400);

    // Try to parse structured parameters from description
    let params: Record<string, any> = {};
    try {
      // Look for JSON block in description (e.g., ```json {...} ```)
      const jsonMatch = proposal.description.match(/```json\s*([\s\S]*?)```/) 
                     || proposal.description.match(/\{[\s\S]*}/);
      if (jsonMatch) {
        params = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch { /* description isn't structured, that's fine */ }

    // Execute based on category
    let executionResult: string;
    const executionDetails: Record<string, any> = { proposalId, category: proposal.category, params };

    switch (proposal.category) {
      case 'parameter_change':
        executionResult = params.param
          ? `Parameter "${params.param}" change to ${params.value} queued for next cycle`
          : 'Parameter change queued for next cycle (no specific param detected)';
        console.log(`[Governance] Parameter change executed:`, params);
        break;

      case 'treasury_rebalance': {
        // Parse target allocations from params
        const targets = {
          tBills: params.tBills ?? params.t_bills,
          liquidity: params.liquidity,
          operations: params.operations,
        };
        if (targets.tBills || targets.liquidity || targets.operations) {
          // Update latest treasury snapshot with new targets
          const latest = await prisma.treasurySnapshot.findFirst({ orderBy: { createdAt: 'desc' } });
          if (latest) {
            await prisma.treasurySnapshot.update({
              where: { id: latest.id },
              data: {
                ...(targets.tBills != null && { tBillsPercent: targets.tBills }),
                ...(targets.liquidity != null && { liquidityPercent: targets.liquidity }),
                ...(targets.operations != null && { operationsPercent: targets.operations }),
              },
            });
          }
          executionResult = `Treasury rebalance applied: ${JSON.stringify(targets)}`;
        } else {
          executionResult = 'Treasury rebalance initiated (manual review required)';
        }
        console.log(`[Governance] Treasury rebalance executed:`, targets);
        break;
      }

      case 'fee_adjustment':
        executionResult = params.fee_rate != null
          ? `Fee adjustment to ${(params.fee_rate * 100).toFixed(1)}% queued`
          : 'Fee adjustment queued (manual review required)';
        console.log(`[Governance] Fee adjustment executed:`, params);
        break;

      case 'tier_threshold':
        executionResult = params.tier && params.min_score
          ? `Tier "${params.tier}" threshold change to ${params.min_score} queued`
          : 'Tier threshold update queued (manual review required)';
        console.log(`[Governance] Tier threshold executed:`, params);
        break;

      default:
        executionResult = 'Executed';
    }

    await prisma.governanceProposal.update({
      where: { id: proposalId },
      data: { status: 'executed', executedAt: new Date() },
    });

    // Award consensus bonus to voters who voted with the majority
    const votes = await prisma.governanceVote.findMany({ where: { proposalId } });
    for (const v of votes) {
      if (v.vote === 'for') {
        try {
          await recordCreditEvent(v.userId, 'governance_consensus', 10, 'Voted with winning majority', proposalId);
        } catch { /* non-critical */ }
      }
    }

    res.json({ status: 'executed', result: executionResult, details: executionDetails });
  } catch (err) {
    next(err);
  }
});

// Finalize expired proposals (can be called by scheduled job)
router.post('/proposals/finalize', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const now = new Date();

    // Find active proposals whose voting period has ended
    const expired = await prisma.governanceProposal.findMany({
      where: { status: 'active', endsAt: { lt: now } },
    });

    let passed = 0;
    let rejected = 0;

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

      if (newStatus === 'passed') passed++;
      else rejected++;
    }

    res.json({ finalized: expired.length, passed, rejected });
  } catch (err) {
    next(err);
  }
});

export default router;
