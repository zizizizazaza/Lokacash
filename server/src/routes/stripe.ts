/**
 * Stripe Revenue Verification Routes (Restricted API Key)
 *
 * POST   /api/stripe/connect-key  — Submit & validate a restricted API key
 * DELETE /api/stripe/disconnect   — Remove stored key & data
 * GET    /api/stripe/revenue      — Get cached MRR data for the current user
 */
import { Router, type Response } from 'express';
import Stripe from 'stripe';
import prisma from '../db.js';
import { authRequired, type AuthRequest } from '../middleware/auth.js';
import { encryptApiKey } from '../utils/crypto.js';
import { syncRevenueForAccount } from '../services/stripe-revenue.service.js';

const router = Router();

// ────────────────────────────────────────────────────────────
// POST /api/stripe/connect-key — Submit restricted API key
// ────────────────────────────────────────────────────────────
router.post('/connect-key', authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Format validation: must start with rk_live_ (production keys only)
    if (apiKey.startsWith('rk_test_')) {
      return res.status(400).json({ error: 'Test keys are not allowed. Please provide a live Stripe Restricted API Key (starts with rk_live_)' });
    }
    if (!apiKey.startsWith('rk_live_')) {
      return res.status(400).json({ error: 'Must be a live Stripe Restricted API Key (starts with rk_live_)' });
    }

    // Validate the key by making a test API call (use SDK default API version)
    const testStripe = new Stripe(apiKey);
    let keyValid = false;
    try {
      await testStripe.charges.list({ limit: 1 });
      keyValid = true;
    } catch (stripeErr: any) {
      console.error('[Stripe] charges.list validation error:', stripeErr?.type, stripeErr?.message, stripeErr?.statusCode);
      if (stripeErr?.type === 'StripeAuthenticationError') {
        return res.status(400).json({ error: 'Invalid API key. Please check that the key is correct and your Stripe account is activated for live mode.' });
      }
      // Permission error (key valid but missing charge read scope) — try subscriptions
      try {
        await testStripe.subscriptions.list({ limit: 1 });
        keyValid = true;
      } catch (subErr: any) {
        console.error('[Stripe] subscriptions.list validation error:', subErr?.type, subErr?.message, subErr?.statusCode);
        if (subErr?.type === 'StripeAuthenticationError') {
          return res.status(400).json({ error: 'Invalid API key. Please verify the key in your Stripe Dashboard.' });
        }
        return res.status(400).json({ error: 'API key validation failed. Please check permissions (Charges Read or Subscriptions Read required)' });
      }
    }

    // Encrypt and store
    const encrypted = encryptApiKey(apiKey);

    // Find or create enterprise verification for this user
    let verification = await prisma.enterpriseVerification.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification) {
      return res.status(400).json({ error: 'Please complete enterprise verification first' });
    }

    // Save encrypted key
    verification = await prisma.enterpriseVerification.update({
      where: { id: verification.id },
      data: {
        stripeApiKeyEncrypted: encrypted,
        stripeKeyStatus: 'active',
      },
    });

    console.log(`[Stripe] ✅ API key connected for user: ${userId}`);

    // Trigger initial sync (non-blocking)
    syncRevenueForAccount(verification.id, encrypted).catch(err => {
      console.error('[Stripe] Initial sync failed (non-blocking):', err);
    });

    res.json({ success: true, message: 'Stripe API key verified and connected' });
  } catch (err) {
    console.error('[Stripe] Connect key error:', err);
    res.status(500).json({ error: 'Failed to connect Stripe API key' });
  }
});

// ────────────────────────────────────────────────────────────
// DELETE /api/stripe/disconnect — Remove key & data
// ────────────────────────────────────────────────────────────
router.delete('/disconnect', authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const verification = await prisma.enterpriseVerification.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification) {
      return res.status(404).json({ error: 'No enterprise verification found' });
    }

    await prisma.enterpriseVerification.update({
      where: { id: verification.id },
      data: {
        stripeApiKeyEncrypted: null,
        stripeKeyStatus: null,
        stripeMrr: null,
        stripeLast30dRev: null,
        stripeMomGrowth: null,
        stripeLastSyncAt: null,
      },
    });

    console.log(`[Stripe] 🔌 Disconnected for user: ${userId}`);
    res.json({ success: true, message: 'Stripe disconnected. Remember to delete the key in your Stripe Dashboard.' });
  } catch (err) {
    console.error('[Stripe] Disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect Stripe' });
  }
});

// ────────────────────────────────────────────────────────────
// GET /api/stripe/revenue — Get cached revenue for current user
// ────────────────────────────────────────────────────────────
router.get('/revenue', authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const verification = await prisma.enterpriseVerification.findFirst({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        stripeApiKeyEncrypted: true,
        stripeKeyStatus: true,
        stripeMrr: true,
        stripeLast30dRev: true,
        stripeMomGrowth: true,
        stripeLastSyncAt: true,
      },
    });

    if (!verification || !verification.stripeApiKeyEncrypted) {
      return res.json({ connected: false, mrr: 0, last30dRev: 0, momGrowth: 0, lastSyncAt: null, keyStatus: null });
    }

    res.json({
      connected: true,
      keyStatus: verification.stripeKeyStatus,
      mrr: verification.stripeMrr ?? 0,
      last30dRev: verification.stripeLast30dRev ?? 0,
      momGrowth: verification.stripeMomGrowth ?? 0,
      lastSyncAt: verification.stripeLastSyncAt,
    });
  } catch (err) {
    console.error('[Stripe] Revenue fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch revenue data' });
  }
});

export default router;
