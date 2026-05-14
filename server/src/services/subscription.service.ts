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
    fast: envInt('PLAN_FREE_FAST', 20),
    roundtable: envInt('PLAN_FREE_ROUNDTABLE', 3),
    windowDays: envInt('PLAN_FREE_WINDOW_DAYS', 7),
  },
  pro: {
    fast: envInt('PLAN_PRO_FAST', 300),
    roundtable: envInt('PLAN_PRO_ROUNDTABLE', 75),
    windowDays: envInt('PLAN_PRO_WINDOW_DAYS', 30),
  },
  max: {
    fast: envInt('PLAN_MAX_FAST', 800),
    roundtable: envInt('PLAN_MAX_ROUNDTABLE', 225),
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
    monthly: envInt('PLAN_PRO_MONTHLY_USD', 49),
    yearly: envInt('PLAN_PRO_YEARLY_USD', 489),
  },
  max: {
    monthly: envInt('PLAN_MAX_MONTHLY_USD', 109),
    yearly: envInt('PLAN_MAX_YEARLY_USD', 1087),
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
 * Sentinel error thrown when the User row doesn't exist yet (e.g. /api/auth/sync
 * hasn't finished). Callers decide whether to retry or degrade to a default
 * snapshot — the FK is a real constraint, but transient during login bootstrap.
 */
export class UserNotSyncedError extends Error {
  constructor(public userId: string) {
    super(`user ${userId} not yet synced to DB`);
    this.name = 'UserNotSyncedError';
  }
}

/**
 * Returns the subscription for `userId`. Creates a default Free row on first
 * access so every authenticated user has exactly one Subscription record.
 *
 * Throws `UserNotSyncedError` if the User row doesn't exist (FK violation on
 * create) — this happens during the login bootstrap race where the frontend
 * fires /quota in parallel with /auth/sync. Callers can catch and either
 * return a transient 425 or render a default snapshot.
 */
export async function getOrCreateSubscription(userId: string): Promise<Subscription> {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (existing) return existing;

  // Pre-check: if the User row doesn't exist, fail fast with a typed error
  // instead of letting Prisma throw a generic FK violation.
  const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!userExists) throw new UserNotSyncedError(userId);

  const defaults = PLAN_DEFAULTS.free;
  const now = new Date();
  try {
    return await prisma.subscription.create({
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
  } catch (err) {
    // Defensive: between the existence check above and the create below the
    // User row could still vanish, or another race could land. Surface as the
    // typed sentinel so the route layer can degrade gracefully.
    const code = (err as { code?: string })?.code;
    if (code === 'P2003' || code === 'P2025') throw new UserNotSyncedError(userId);
    throw err;
  }
}

/**
 * Default snapshot returned when the user's Subscription row can't be created
 * yet (login bootstrap race — User row not synced). Mirrors a fresh free plan
 * so the frontend can render the quota chip without flashing an error.
 */
export function getDefaultQuotaSnapshot(): QuotaSnapshot {
  const defaults = PLAN_DEFAULTS.free;
  const placeholderReset = addDays(new Date(), defaults.windowDays);
  return {
    plan: 'free',
    billingCycle: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    fast: { used: 0, limit: defaults.fast, period: `resets ${placeholderReset.toISOString()}` },
    roundtable: { used: 0, limit: defaults.roundtable, period: `resets ${placeholderReset.toISOString()}` },
  };
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
  // Resolve caps from the live PLAN_DEFAULTS every read instead of reading
  // sub.fastLimit / sub.roundtableLimit from the DB. Those columns get
  // written at create/upgrade/reset time, so changing PLAN_FREE_FAST (or any
  // quota env var) would otherwise take up to one full window (28 days for
  // Pro/Max) to propagate to existing subscribers — not what we want during
  // active pricing/quota tuning. Keeping the DB columns for audit purposes.
  const defaults = PLAN_DEFAULTS[plan];
  const period = `resets ${sub.resetAt.toISOString()}`;
  return {
    plan,
    billingCycle: (sub.billingCycle === 'monthly' || sub.billingCycle === 'yearly') ? sub.billingCycle : null,
    currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    fast: { used: sub.fastUsed, limit: defaults.fast, period },
    roundtable: { used: sub.roundtableUsed, limit: defaults.roundtable, period },
  };
}

/**
 * Check-and-increment in a single atomic step.
 * Returns `{ allowed: true, remaining }` on success, or
 * `{ allowed: false, error: 'quota_exhausted', mode, resetAt }` on failure.
 */
/**
 * Refund one quota slot — inverse of `consumeQuota`. Used by the v2 chitchat
 * post-hoc refund: if a turn was charged Fast quota but the routing LLM
 * produced 0 tool calls + short narration (i.e. it was actually chitchat
 * not a real research request), the slot is refunded so the user isn't
 * billed for what amounts to a single cheap LLM call.
 *
 * Idempotent / safe — clamps at 0 so multiple refund calls or refunds for
 * already-reset users don't go negative.
 */
export async function refundQuota(userId: string, mode: QuotaMode): Promise<{ newRemaining: number } | { error: string }> {
  const usedField = mode === 'fast' ? 'fastUsed' : 'roundtableUsed';
  try {
    const sub = await getOrCreateSubscription(userId);
    const currentUsed = sub[usedField];
    if (currentUsed <= 0) {
      // Nothing to refund — already at 0 (or post-reset). Treat as no-op.
      return { newRemaining: 0 };
    }
    const updated = await prisma.subscription.update({
      where: { id: sub.id },
      data: { [usedField]: { decrement: 1 } },
    });
    const plan = normalizePlan(updated.plan);
    const currentLimit = mode === 'fast' ? PLAN_DEFAULTS[plan].fast : PLAN_DEFAULTS[plan].roundtable;
    const newUsed = mode === 'fast' ? updated.fastUsed : updated.roundtableUsed;
    return { newRemaining: currentLimit - newUsed };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function consumeQuota(userId: string, mode: QuotaMode): Promise<
  | { allowed: true; remaining: number; resetAt: Date }
  | { allowed: false; error: 'quota_exhausted'; mode: QuotaMode; resetAt: Date }
> {
  let sub = await getOrCreateSubscription(userId);
  sub = await lazyReset(sub);

  const usedField = mode === 'fast' ? 'fastUsed' : 'roundtableUsed';
  const currentUsed = sub[usedField];
  // Source the cap from live PLAN_DEFAULTS so env quota changes take effect
  // immediately for all existing subscribers, not after the next resetAt.
  const plan = normalizePlan(sub.plan);
  const currentLimit = mode === 'fast' ? PLAN_DEFAULTS[plan].fast : PLAN_DEFAULTS[plan].roundtable;

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
