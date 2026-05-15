/**
 * Stripe Revenue Sync Service (Restricted API Key Mode)
 *
 * Background service that periodically fetches MRR and revenue data
 * using each user's encrypted restricted API key.
 */
import Stripe from 'stripe';
import { config } from '../config.js';
import prisma from '../db.js';
import { decryptApiKey } from '../utils/crypto.js';

const SCFG = config.stripe;

let syncTimer: ReturnType<typeof setInterval> | null = null;

// ─── Revenue Calculation ────────────────────────────────────

/**
 * Fetch and calculate MRR for a connected Stripe account.
 * Uses the user's own restricted API key (decrypted from DB).
 */
export async function syncRevenueForAccount(
  verificationId: string,
  encryptedKey: string,
): Promise<void> {
  let decryptedKey: string;
  try {
    decryptedKey = decryptApiKey(encryptedKey);
  } catch (err) {
    console.error(`[StripeRevenue] ❌ Failed to decrypt key for verification ${verificationId}`);
    await prisma.enterpriseVerification.update({
      where: { id: verificationId },
      data: { stripeKeyStatus: 'invalid' },
    });
    return;
  }

  const stripe = new Stripe(decryptedKey, { apiVersion: '2025-03-31.basil' as any });

  try {
    // ── 1. Calculate MRR from active subscriptions ──
    let mrr = 0;
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: Stripe.SubscriptionListParams = {
        status: 'active',
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      };

      const subscriptions = await stripe.subscriptions.list(params);

      for (const sub of subscriptions.data) {
        for (const item of sub.items.data) {
          const price = item.price;
          const quantity = item.quantity ?? 1;
          const amount = (price.unit_amount ?? 0) / 100; // cents to dollars

          // Normalize to monthly
          if (price.recurring) {
            switch (price.recurring.interval) {
              case 'month':
                mrr += amount * quantity;
                break;
              case 'year':
                mrr += (amount * quantity) / 12;
                break;
              case 'week':
                mrr += (amount * quantity * 52) / 12;
                break;
              case 'day':
                mrr += (amount * quantity * 365) / 12;
                break;
            }
          }
        }
      }

      hasMore = subscriptions.has_more;
      if (subscriptions.data.length > 0) {
        startingAfter = subscriptions.data[subscriptions.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    // ── 2. Calculate last 30 days revenue from charges ──
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60;
    let last30dRev = 0;
    let chargeStartingAfter: string | undefined;
    let chargesHasMore = true;

    while (chargesHasMore) {
      const chargeParams: Stripe.ChargeListParams = {
        created: { gte: thirtyDaysAgo },
        limit: 100,
        ...(chargeStartingAfter ? { starting_after: chargeStartingAfter } : {}),
      };

      const charges = await stripe.charges.list(chargeParams);

      for (const charge of charges.data) {
        if (charge.status === 'succeeded' && !charge.refunded) {
          last30dRev += charge.amount / 100; // cents to dollars
        }
      }

      chargesHasMore = charges.has_more;
      if (charges.data.length > 0) {
        chargeStartingAfter = charges.data[charges.data.length - 1].id;
      } else {
        chargesHasMore = false;
      }
    }

    // ── 3. Calculate previous month revenue for MoM growth ──
    const sixtyDaysAgo = now - 60 * 24 * 60 * 60;
    let prev30dRev = 0;
    let prevStartingAfter: string | undefined;
    let prevHasMore = true;

    while (prevHasMore) {
      const prevParams: Stripe.ChargeListParams = {
        created: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        limit: 100,
        ...(prevStartingAfter ? { starting_after: prevStartingAfter } : {}),
      };

      const charges = await stripe.charges.list(prevParams);

      for (const charge of charges.data) {
        if (charge.status === 'succeeded' && !charge.refunded) {
          prev30dRev += charge.amount / 100;
        }
      }

      prevHasMore = charges.has_more;
      if (charges.data.length > 0) {
        prevStartingAfter = charges.data[charges.data.length - 1].id;
      } else {
        prevHasMore = false;
      }
    }

    // ── 4. Calculate MoM Growth ──
    const momGrowth = prev30dRev > 0
      ? ((last30dRev - prev30dRev) / prev30dRev) * 100
      : 0;

    // ── 5. Persist to database ──
    await prisma.enterpriseVerification.update({
      where: { id: verificationId },
      data: {
        stripeMrr: Math.round(mrr * 100) / 100,
        stripeLast30dRev: Math.round(last30dRev * 100) / 100,
        stripeMomGrowth: Math.round(momGrowth * 10) / 10,
        stripeLastSyncAt: new Date(),
        stripeKeyStatus: 'active',
      },
    });

    console.log(
      `[StripeRevenue] ✅ Synced verification ${verificationId}: MRR=$${mrr.toFixed(2)}, ` +
      `30d=$${last30dRev.toFixed(2)}, MoM=${momGrowth.toFixed(1)}%`
    );
  } catch (err: any) {
    // If auth error, mark key as invalid
    if (err?.type === 'StripeAuthenticationError') {
      console.error(`[StripeRevenue] ❌ API key invalid for ${verificationId} — marking as invalid`);
      await prisma.enterpriseVerification.update({
        where: { id: verificationId },
        data: { stripeKeyStatus: 'invalid' },
      });
    } else {
      console.error(`[StripeRevenue] ❌ Sync failed for ${verificationId}:`, err?.message || err);
    }
  }
}

// ─── Batch Sync (Cron Job) ──────────────────────────────────

async function syncAllAccounts(): Promise<void> {
  try {
    // Find all accounts with an active encrypted key
    const accounts = await prisma.enterpriseVerification.findMany({
      where: {
        stripeApiKeyEncrypted: { not: null },
        stripeKeyStatus: 'active',
      },
      select: {
        id: true,
        stripeApiKeyEncrypted: true,
      },
    });

    if (accounts.length === 0) {
      console.log('[StripeRevenue] No connected accounts to sync');
      return;
    }

    console.log(`[StripeRevenue] 🔄 Syncing ${accounts.length} connected account(s)...`);

    for (const account of accounts) {
      if (account.stripeApiKeyEncrypted) {
        await syncRevenueForAccount(account.id, account.stripeApiKeyEncrypted);
        // Small delay between accounts to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`[StripeRevenue] ✅ Batch sync complete`);
  } catch (err) {
    console.error('[StripeRevenue] Batch sync error:', err);
  }
}

// ─── Lifecycle ──────────────────────────────────────────────

export async function startStripeRevenueService(): Promise<void> {
  if (!SCFG.encryptionKey) {
    console.warn('[StripeRevenue] ⚠️  No encryption key configured — service disabled');
    return;
  }

  console.log('[StripeRevenue] 🚀 Starting service...');

  // Run initial sync after a short delay (let server boot first)
  setTimeout(() => {
    syncAllAccounts().catch(console.error);
  }, 10_000);

  // Set up periodic sync
  syncTimer = setInterval(() => {
    syncAllAccounts().catch(console.error);
  }, SCFG.syncIntervalMs);

  console.log(`[StripeRevenue] ⏰ Auto-sync every ${SCFG.syncIntervalMs / 1000 / 60}min`);
}

export function stopStripeRevenueService(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  console.log('[StripeRevenue] Service stopped');
}
