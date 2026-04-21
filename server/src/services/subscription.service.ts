/**
 * Subscription & Quota service.
 *
 * Owns the rolling-window quota logic for Fast / Roundtable modes.
 * Limits and window lengths are driven by env vars; see {@link PLAN_DEFAULTS}.
 *
 * Auto mode does NOT go through quota — callers must explicitly check mode
 * before calling {@link consumeQuota}.
 */
import prisma from '../db.js';
import type { Subscription } from '@prisma/client';

export type PlanTier = 'free' | 'pro' | 'max';
export type QuotaMode = 'fast' | 'roundtable';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Env-driven plan limits. Change values in server/.env — no code edit needed.
// PLAN_{TIER}_FAST / PLAN_{TIER}_ROUNDTABLE / PLAN_{TIER}_WINDOW_DAYS
const PLAN_DEFAULTS: Record<PlanTier, { fast: number; roundtable: number; windowDays: number }> = {
  free: {
    fast: envInt('PLAN_FREE_FAST', 10),
    roundtable: envInt('PLAN_FREE_ROUNDTABLE', 2),
    windowDays: envInt('PLAN_FREE_WINDOW_DAYS', 7),
  },
  pro: {
    fast: envInt('PLAN_PRO_FAST', 200),
    roundtable: envInt('PLAN_PRO_ROUNDTABLE', 50),
    windowDays: envInt('PLAN_PRO_WINDOW_DAYS', 30),
  },
  max: {
    fast: envInt('PLAN_MAX_FAST', 500),
    roundtable: envInt('PLAN_MAX_ROUNDTABLE', 150),
    windowDays: envInt('PLAN_MAX_WINDOW_DAYS', 30),
  },
};

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function planDefaults(plan: PlanTier) {
  return PLAN_DEFAULTS[plan];
}

// USD display pricing — used by the public config endpoint. Stripe is the
// source of truth for actual billing; these mirror the Stripe prices so
// the Settings page can render them without a separate frontend env.
export const PLAN_PRICING_USD: Record<Exclude<PlanTier, 'free'>, { monthly: number; yearly: number }> = {
  pro: {
    monthly: envInt('PLAN_PRO_MONTHLY_USD', 39),
    yearly: envInt('PLAN_PRO_YEARLY_USD', 389),
  },
  max: {
    monthly: envInt('PLAN_MAX_MONTHLY_USD', 99),
    yearly: envInt('PLAN_MAX_YEARLY_USD', 987),
  },
};

/** Snapshot of plan config for the public /api/config endpoint. */
export function getPublicPlanConfig() {
  return {
    free: {
      ...PLAN_DEFAULTS.free,
      monthlyUsd: 0,
      yearlyUsd: 0,
    },
    pro: {
      ...PLAN_DEFAULTS.pro,
      monthlyUsd: PLAN_PRICING_USD.pro.monthly,
      yearlyUsd: PLAN_PRICING_USD.pro.yearly,
    },
    max: {
      ...PLAN_DEFAULTS.max,
      monthlyUsd: PLAN_PRICING_USD.max.monthly,
      yearlyUsd: PLAN_PRICING_USD.max.yearly,
    },
  };
}

function normalizePlan(raw: string | null | undefined): PlanTier {
  const v = (raw || '').toLowerCase();
  if (v === 'pro' || v === 'max') return v;
  return 'free';
}

/**
 * Returns the subscription for `userId`. Creates a default Free row on first
 * access so every authenticated user has exactly one Subscription record.
 */
export async function getOrCreateSubscription(userId: string): Promise<Subscription> {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (existing) return existing;

  const defaults = PLAN_DEFAULTS.free;
  const now = new Date();
  return prisma.subscription.create({
    data: {
      userId,
      plan: 'free',
      billingCycle: null,
      fastUsed: 0,
      fastLimit: defaults.fast,
      roundtableUsed: 0,
      roundtableLimit: defaults.roundtable,
      resetAt: addDays(now, defaults.windowDays),
      activatedAt: now,
    },
  });
}

/**
 * Lazy-reset: if `resetAt` is in the past, zero out the usage counters
 * and roll the window forward. Idempotent. Called before every quota read.
 */
export async function lazyReset(sub: Subscription): Promise<Subscription> {
  const now = Date.now();
  if (sub.resetAt.getTime() > now) return sub;

  const plan = normalizePlan(sub.plan);
  const defaults = PLAN_DEFAULTS[plan];
  const windowMs = defaults.windowDays * 86400_000;

  // Roll forward to the next future window. If the user was inactive for
  // multiple windows we jump straight to the next future one.
  let nextReset = sub.resetAt.getTime();
  while (nextReset <= now) nextReset += windowMs;

  return prisma.subscription.update({
    where: { id: sub.id },
    data: {
      fastUsed: 0,
      roundtableUsed: 0,
      resetAt: new Date(nextReset),
      // Keep the limits in sync with plan (in case of stale data)
      fastLimit: defaults.fast,
      roundtableLimit: defaults.roundtable,
    },
  });
}

/**
 * Quota snapshot shape returned to the frontend. Matches the shape
 * expected by `api.getQuota()` in src/services/api.ts.
 */
export type QuotaSnapshot = {
  plan: PlanTier;
  billingCycle: 'monthly' | 'yearly' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  fast: { used: number; limit: number; period: string };
  roundtable: { used: number; limit: number; period: string };
};

export async function getQuota(userId: string): Promise<QuotaSnapshot> {
  let sub = await getOrCreateSubscription(userId);
  sub = await lazyReset(sub);
  const plan = normalizePlan(sub.plan);
  const period = `resets ${sub.resetAt.toISOString()}`;
  return {
    plan,
    billingCycle: (sub.billingCycle === 'monthly' || sub.billingCycle === 'yearly') ? sub.billingCycle : null,
    currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    fast: { used: sub.fastUsed, limit: sub.fastLimit, period },
    roundtable: { used: sub.roundtableUsed, limit: sub.roundtableLimit, period },
  };
}

/**
 * Check-and-increment in a single atomic step.
 * Returns `{ allowed: true, remaining }` on success, or
 * `{ allowed: false, error: 'quota_exhausted', mode, resetAt }` on failure.
 */
export async function consumeQuota(userId: string, mode: QuotaMode): Promise<
  | { allowed: true; remaining: number; resetAt: Date }
  | { allowed: false; error: 'quota_exhausted'; mode: QuotaMode; resetAt: Date }
> {
  let sub = await getOrCreateSubscription(userId);
  sub = await lazyReset(sub);

  const usedField = mode === 'fast' ? 'fastUsed' : 'roundtableUsed';
  const limitField = mode === 'fast' ? 'fastLimit' : 'roundtableLimit';
  const currentUsed = sub[usedField];
  const currentLimit = sub[limitField];

  if (currentUsed >= currentLimit) {
    return { allowed: false, error: 'quota_exhausted', mode, resetAt: sub.resetAt };
  }

  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: { [usedField]: { increment: 1 } },
  });

  const newUsed = mode === 'fast' ? updated.fastUsed : updated.roundtableUsed;
  return { allowed: true, remaining: currentLimit - newUsed, resetAt: updated.resetAt };
}

/**
 * Apply a plan change to a subscription row (e.g. after a successful upgrade).
 * Resets usage to 0 and re-anchors the rolling window from `now`.
 */
export async function applyPlan(
  userId: string,
  plan: PlanTier,
  opts: {
    billingCycle?: 'monthly' | 'yearly' | null;
    stripeCustomerId?: string | null;
    stripeSubId?: string | null;
    stripeStatus?: string | null;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
  } = {},
): Promise<Subscription> {
  const sub = await getOrCreateSubscription(userId);
  const defaults = PLAN_DEFAULTS[plan];
  const now = new Date();
  return prisma.subscription.update({
    where: { id: sub.id },
    data: {
      plan,
      billingCycle: opts.billingCycle ?? (plan === 'free' ? null : 'monthly'),
      fastUsed: 0,
      fastLimit: defaults.fast,
      roundtableUsed: 0,
      roundtableLimit: defaults.roundtable,
      resetAt: addDays(now, defaults.windowDays),
      activatedAt: now,
      stripeCustomerId: opts.stripeCustomerId ?? sub.stripeCustomerId,
      stripeSubId: opts.stripeSubId ?? sub.stripeSubId,
      stripeStatus: opts.stripeStatus ?? sub.stripeStatus,
      currentPeriodEnd: opts.currentPeriodEnd ?? sub.currentPeriodEnd,
      cancelAtPeriodEnd: opts.cancelAtPeriodEnd ?? sub.cancelAtPeriodEnd,
    },
  });
}

/**
 * Sweep subscriptions whose `resetAt` is in the past and roll the window.
 * Called by the scheduler every hour; lazyReset on read covers the user-facing
 * path, but this keeps resetAt values fresh even for inactive users.
 */
export async function sweepExpiredQuotas(): Promise<number> {
  const now = new Date();
  const stale = await prisma.subscription.findMany({
    where: { resetAt: { lt: now } },
    take: 500, // safety cap per sweep
  });
  let count = 0;
  for (const sub of stale) {
    try {
      await lazyReset(sub);
      count++;
    } catch (err) {
      console.error(`[Subscription] sweep reset failed for user ${sub.userId}:`, (err as Error).message);
    }
  }
  return count;
}
