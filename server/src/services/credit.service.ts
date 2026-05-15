import prisma from '../db.js';
type Tx = Omit<typeof prisma, '$transaction' | '$connect' | '$disconnect' | '$on' | '$extends'>;

// Tier thresholds
const TIERS = [
  { name: 'Tier1', minScore: 200, collateralRate: 0.30, feeRate: 0.025 },
  { name: 'Tier2', minScore: 500, collateralRate: 0.10, feeRate: 0.015 },
  { name: 'Tier3', minScore: 1000, collateralRate: 0.10, feeRate: 0.010 },
] as const;

export function getTier(score: number): string {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (score >= TIERS[i].minScore) return TIERS[i].name;
  }
  return 'Unranked';
}

export function getTierDetails(score: number) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (score >= TIERS[i].minScore) return TIERS[i];
  }
  return { name: 'Unranked', minScore: 0, collateralRate: 0.50, feeRate: 0.030 };
}

// Record a credit score event and update the user's score
export async function recordCreditEvent(
  userId: string,
  eventType: string,
  delta: number,
  reason: string,
  refId?: string,
) {
  return prisma.$transaction(async (tx: Tx) => {
    // Create the event
    const event = await tx.creditScoreEvent.create({
      data: { userId, eventType, delta, reason, refId },
    });

    // Update user's credit score
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const newScore = Math.max(0, user.creditScore + delta);

    await tx.user.update({
      where: { id: userId },
      data: { creditScore: newScore },
    });

    // Record history snapshot
    await tx.creditScoreHistory.create({
      data: { userId, score: newScore, tier: getTier(newScore) },
    });

    return { event, newScore, tier: getTier(newScore) };
  });
}

// Issuer credit scoring rules
export const ISSUER_EVENTS = {
  ENTERPRISE_VERIFY_STEP: { delta: 25, reason: 'Enterprise verification step completed' },
  FUNDRAISE_ROUND_1: { delta: 20, reason: 'First fundraise completed' },
  FUNDRAISE_ROUND_2: { delta: 30, reason: 'Second fundraise completed' },
  FUNDRAISE_ROUND_3: { delta: 40, reason: 'Third+ fundraise completed' },
  REPAYMENT_ON_TIME: { delta: 15, reason: 'On-time monthly repayment' },
  REPAYMENT_STREAK_3: { delta: 30, reason: '3-month repayment streak bonus' },
  REPAYMENT_STREAK_6: { delta: 50, reason: '6-month repayment streak bonus' },
  EARLY_REPAYMENT: { delta: 40, reason: 'Early full repayment' },
  REFERRAL_REPAID: { delta: 30, reason: 'Referred project repaid successfully' },
  LATE_1_30: { delta: -30, reason: 'Payment overdue 1-30 days' },
  LATE_31_90: { delta: -80, reason: 'Payment overdue 31-90 days' },
  LATE_90_PLUS: { delta: -150, reason: 'Payment overdue >90 days (liquidation trigger)' },
  FUNDRAISE_FAILED: { delta: -10, reason: 'Fundraise failed' },
  FRAUD: { delta: -9999, reason: 'Fraud detected — score reset to zero' },
} as const;

// Investor credit scoring rules
export const INVESTOR_EVENTS = {
  KYC_COMPLETE: { delta: 50, reason: 'KYC verification completed' },
  FIRST_INVESTMENT: { delta: 20, reason: 'First investment made' },
  INVESTMENT_ACTIVE: { delta: 10, reason: 'Active investment participation' },
  DIVERSIFIED_3: { delta: 15, reason: 'Portfolio diversified (3+ projects)' },
  DIVERSIFIED_5: { delta: 25, reason: 'Portfolio diversified (5+ projects)' },
  HOLD_30_DAYS: { delta: 10, reason: '30-day hold bonus' },
  HOLD_90_DAYS: { delta: 20, reason: '90-day hold bonus' },
  HOLD_180_DAYS: { delta: 40, reason: '180-day hold bonus' },
  HOLD_360_DAYS: { delta: 80, reason: '360-day hold bonus' },
  GOVERNANCE_VOTE: { delta: 5, reason: 'Participated in governance vote' },
  REFERRAL: { delta: 15, reason: 'Successful referral' },
  EARLY_REVOKE: { delta: -5, reason: 'Early investment revocation' },
} as const;
