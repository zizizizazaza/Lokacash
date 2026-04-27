/**
 * Subscription API endpoints.
 *
 *   GET  /api/subscription/quota         — current quota snapshot
 *   POST /api/subscription/upgrade       — dev/manual upgrade (no payment)
 *   POST /api/subscription/checkout      — create Stripe checkout session
 *   POST /api/subscription/portal        — Stripe customer portal link
 *   POST /api/subscription/webhook       — Stripe webhook (raw body, no auth)
 */
import { Router, type Response, type Request } from 'express';
import Stripe from 'stripe';
import { authRequired, type AuthRequest } from '../middleware/auth.js';
import prisma from '../db.js';
import {
  applyPlan,
  consumeQuota,
  getOrCreateSubscription,
  getQuota,
  type PlanTier,
} from '../services/subscription.service.js';

const router = Router();

function normalizePlan(raw: unknown): PlanTier | null {
  if (raw === 'free' || raw === 'pro' || raw === 'max') return raw;
  return null;
}

// ─────────────────────────────────────────────────────────────
// GET /api/subscription/quota
// ─────────────────────────────────────────────────────────────
router.get('/quota', authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'not_authenticated' });
    const snapshot = await getQuota(userId);
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'failed to load quota' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/subscription/usage  (internal — called from socket layer)
// Body: { mode: 'fast' | 'roundtable' }
// ─────────────────────────────────────────────────────────────
router.post('/usage', authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'not_authenticated' });
    const mode = req.body?.mode;
    if (mode !== 'fast' && mode !== 'roundtable') {
      return res.status(400).json({ error: 'mode must be "fast" or "roundtable"' });
    }
    const result = await consumeQuota(userId, mode);
    if (result.allowed === false) {
      return res.status(429).json({
        error: result.error,
        mode: result.mode,
        resetAt: result.resetAt,
      });
    }
    res.json({
      ok: true,
      remaining: result.remaining,
      resetAt: result.resetAt,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'failed to record usage' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/subscription/upgrade  (dev/manual — no payment required)
// Body: { plan: 'free' | 'pro' | 'max' }
// Allows admins or dev mode to bump a user's plan without going through Stripe.
// ─────────────────────────────────────────────────────────────
router.post('/upgrade', authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'not_authenticated' });
    const plan = normalizePlan(req.body?.plan);
    if (!plan) return res.status(400).json({ error: 'plan must be "free" | "pro" | "max"' });

    // In production this route should be admin-only OR disabled.
    const allowManual = (process.env.SUBSCRIPTION_ALLOW_MANUAL_UPGRADE || '').toLowerCase() === 'true';
    if (!allowManual && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'manual_upgrade_disabled', hint: 'Use /checkout in production.' });
    }

    const updated = await applyPlan(userId, plan, {
      billingCycle: plan === 'free' ? null : (req.body?.billingCycle === 'yearly' ? 'yearly' : 'monthly'),
    });
    res.json({ ok: true, plan: updated.plan, resetAt: updated.resetAt });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'failed to upgrade' });
  }
});

// ═════════════════════════════════════════════════════════════
//                    Stripe integration
// ═════════════════════════════════════════════════════════════

const STRIPE_SECRET = (process.env.STRIPE_SECRET_KEY || '').trim();
const STRIPE_WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

// Price IDs are configured in Stripe Dashboard (one-time setup) and pasted into .env.
const STRIPE_PRICE_IDS: Record<'pro' | 'max', { monthly: string; yearly: string }> = {
  pro: {
    monthly: (process.env.STRIPE_PRICE_PRO_MONTHLY || '').trim(),
    yearly: (process.env.STRIPE_PRICE_PRO_YEARLY || '').trim(),
  },
  max: {
    monthly: (process.env.STRIPE_PRICE_MAX_MONTHLY || '').trim(),
    yearly: (process.env.STRIPE_PRICE_MAX_YEARLY || '').trim(),
  },
};

let stripeClient: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!STRIPE_SECRET) return null;
  if (!stripeClient) stripeClient = new Stripe(STRIPE_SECRET);
  return stripeClient;
}

/**
 * POST /api/subscription/checkout
 * Body: { plan: 'pro' | 'max', billingCycle: 'monthly' | 'yearly' }
 * Returns: { url } — Stripe Checkout Session redirect URL.
 */
router.post('/checkout', authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'not_authenticated' });

    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ error: 'stripe_not_configured', hint: 'Set STRIPE_SECRET_KEY in server/.env' });
    }

    const planRaw: unknown = req.body?.plan;
    const billingCycle: 'monthly' | 'yearly' = req.body?.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    if (planRaw !== 'pro' && planRaw !== 'max') {
      return res.status(400).json({ error: 'plan must be "pro" or "max"' });
    }
    const plan: 'pro' | 'max' = planRaw;
    const priceId = STRIPE_PRICE_IDS[plan][billingCycle];
    if (!priceId) {
      return res.status(503).json({
        error: 'stripe_price_not_configured',
        hint: `Set STRIPE_PRICE_${plan.toUpperCase()}_${billingCycle.toUpperCase()} in server/.env`,
      });
    }

    // Ensure Stripe Customer exists and persist its id on the Subscription row.
    const sub = await getOrCreateSubscription(userId);
    let customerId = sub.stripeCustomerId || undefined;
    if (!customerId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const customer = await stripe.customers.create({
        email: user?.email || undefined,
        name: user?.name || undefined,
        metadata: { userId },
      });
      customerId = customer.id;
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      success_url: `${APP_URL}/settings?checkout=success`,
      cancel_url: `${APP_URL}/settings?checkout=cancelled`,
      metadata: { userId, plan, billingCycle },
      subscription_data: {
        metadata: { userId, plan, billingCycle },
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Subscription] checkout failed:', err);
    res.status(500).json({ error: (err as Error).message || 'failed to create checkout session' });
  }
});

/**
 * POST /api/subscription/portal
 * Returns: { url } — Stripe Customer Portal link for managing/cancelling sub.
 */
router.post('/portal', authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'not_authenticated' });

    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'stripe_not_configured' });

    const sub = await getOrCreateSubscription(userId);
    if (!sub.stripeCustomerId) {
      return res.status(400).json({ error: 'no_stripe_customer', hint: 'User must complete checkout first.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${APP_URL}/settings`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'failed to create portal session' });
  }
});

/**
 * POST /api/subscription/webhook  (no auth — verified via Stripe signature)
 * IMPORTANT: must receive raw body, see app.ts mount.
 */
router.post('/webhook', async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'stripe_not_configured' });

  let event: Stripe.Event;
  try {
    const sig = req.headers['stripe-signature'];
    if (!STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET not set');
    event = stripe.webhooks.constructEvent(
      (req as unknown as { rawBody: Buffer }).rawBody || req.body,
      sig as string,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.warn('[Subscription] webhook signature verify failed:', (err as Error).message);
    return res.status(400).json({ error: `webhook_bad_signature: ${(err as Error).message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || (session.metadata?.userId as string | undefined);
        const plan = normalizePlan(session.metadata?.plan);
        const billingCycle = session.metadata?.billingCycle === 'yearly' ? 'yearly' : 'monthly';
        if (userId && plan && plan !== 'free') {
          await applyPlan(userId, plan, {
            billingCycle,
            stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
            stripeSubId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null,
            stripeStatus: 'active',
          });
          console.log(`[Subscription] upgraded ${userId} to ${plan}/${billingCycle}`);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = (sub.metadata?.userId as string | undefined);
        const plan = normalizePlan(sub.metadata?.plan);
        if (userId && plan) {
          // current_period_end exists on the Subscription object at runtime but
          // newer SDK type definitions have relocated it. Cast through unknown.
          const cpe = (sub as unknown as { current_period_end?: number }).current_period_end;
          await applyPlan(userId, plan, {
            stripeSubId: sub.id,
            stripeStatus: sub.status,
            currentPeriodEnd: typeof cpe === 'number' ? new Date(cpe * 1000) : undefined,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = (sub.metadata?.userId as string | undefined);
        if (userId) {
          // Downgrade to free on cancellation
          await applyPlan(userId, 'free', {
            stripeStatus: 'canceled',
            stripeSubId: null,
            cancelAtPeriodEnd: false,
          });
          console.log(`[Subscription] downgraded ${userId} to free (stripe cancellation)`);
        }
        break;
      }
      default:
        // ignore other event types
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[Subscription] webhook handler error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
