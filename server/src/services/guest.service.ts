/**
 * Guest mode quota service.
 *
 * Applies a two-layer rate limit to unauthenticated users:
 *   1. per-guestId (client-generated UUID from localStorage)
 *   2. per-IP     (catches guestId hopping via localStorage clears)
 *
 * Only Auto mode is available to guests. Fast and Roundtable are
 * gated behind login on the frontend and double-checked in the
 * socket handler.
 */
import prisma from '../db.js';

export type GuestQuotaSnapshot = {
  autoUsed: number;
  autoLimit: number;
  autoRemaining: number;
  resetAt: string; // ISO
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || '').toLowerCase().trim();
  if (!raw) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

export const GUEST_CONFIG = {
  enabled: envBool('ENABLE_GUEST_MODE', true),
  autoLimit: envInt('GUEST_AUTO_LIMIT', 5),
  autoWindowHours: envInt('GUEST_AUTO_WINDOW_HOURS', 24),
  ipAutoLimit: envInt('GUEST_IP_AUTO_LIMIT', 30),
  ipAutoWindowHours: envInt('GUEST_IP_AUTO_WINDOW_HOURS', 24),
};

function nextReset(hours: number): Date {
  return new Date(Date.now() + hours * 3_600_000);
}

/**
 * Lazily roll the window forward if resetAt is in the past. Idempotent.
 * Returns the up-to-date record.
 */
async function rollGuest(row: { id: string; autoUsed: number; resetAt: Date }): Promise<{ autoUsed: number; resetAt: Date }> {
  if (row.resetAt.getTime() > Date.now()) {
    return { autoUsed: row.autoUsed, resetAt: row.resetAt };
  }
  const fresh = await prisma.guestQuota.update({
    where: { id: row.id },
    data: { autoUsed: 0, resetAt: nextReset(GUEST_CONFIG.autoWindowHours) },
  });
  return { autoUsed: fresh.autoUsed, resetAt: fresh.resetAt };
}

async function rollIp(row: { ip: string; autoUsed: number; resetAt: Date }): Promise<{ autoUsed: number; resetAt: Date }> {
  if (row.resetAt.getTime() > Date.now()) {
    return { autoUsed: row.autoUsed, resetAt: row.resetAt };
  }
  const fresh = await prisma.guestIpQuota.update({
    where: { ip: row.ip },
    data: { autoUsed: 0, resetAt: nextReset(GUEST_CONFIG.ipAutoWindowHours) },
  });
  return { autoUsed: fresh.autoUsed, resetAt: fresh.resetAt };
}

export async function getGuestQuota(guestId: string): Promise<GuestQuotaSnapshot> {
  let row = await prisma.guestQuota.findUnique({ where: { guestId } });
  if (!row) {
    row = await prisma.guestQuota.create({
      data: {
        guestId,
        autoUsed: 0,
        resetAt: nextReset(GUEST_CONFIG.autoWindowHours),
      },
    });
  }
  const rolled = await rollGuest(row);
  return {
    autoUsed: rolled.autoUsed,
    autoLimit: GUEST_CONFIG.autoLimit,
    autoRemaining: Math.max(0, GUEST_CONFIG.autoLimit - rolled.autoUsed),
    resetAt: rolled.resetAt.toISOString(),
  };
}

/**
 * Check-and-increment for a guest Auto turn. Fails the first layer that
 * hits its limit. Returns `{allowed: false}` when either per-guest or
 * per-IP cap is reached.
 */
export async function consumeGuestAuto(
  guestId: string,
  ip: string | null,
): Promise<
  | { allowed: true; remaining: number; resetAt: Date }
  | { allowed: false; error: 'guest_quota_exhausted' | 'guest_ip_quota_exhausted'; resetAt: Date }
> {
  // ── Layer 1: per-guest ─────────────────────────────────────────────
  let guestRow = await prisma.guestQuota.findUnique({ where: { guestId } });
  if (!guestRow) {
    guestRow = await prisma.guestQuota.create({
      data: {
        guestId,
        autoUsed: 0,
        resetAt: nextReset(GUEST_CONFIG.autoWindowHours),
        lastIp: ip,
      },
    });
  }
  {
    const rolled = await rollGuest(guestRow);
    if (rolled.autoUsed >= GUEST_CONFIG.autoLimit) {
      return { allowed: false, error: 'guest_quota_exhausted', resetAt: rolled.resetAt };
    }
  }

  // ── Layer 2: per-IP ────────────────────────────────────────────────
  if (ip) {
    let ipRow = await prisma.guestIpQuota.findUnique({ where: { ip } });
    if (!ipRow) {
      ipRow = await prisma.guestIpQuota.create({
        data: {
          ip,
          autoUsed: 0,
          resetAt: nextReset(GUEST_CONFIG.ipAutoWindowHours),
        },
      });
    }
    const rolledIp = await rollIp(ipRow);
    if (rolledIp.autoUsed >= GUEST_CONFIG.ipAutoLimit) {
      return { allowed: false, error: 'guest_ip_quota_exhausted', resetAt: rolledIp.resetAt };
    }
    await prisma.guestIpQuota.update({
      where: { ip },
      data: { autoUsed: { increment: 1 } },
    });
  }

  // ── Commit guest increment ────────────────────────────────────────
  const updated = await prisma.guestQuota.update({
    where: { guestId },
    data: {
      autoUsed: { increment: 1 },
      lastIp: ip,
    },
  });
  return {
    allowed: true,
    remaining: Math.max(0, GUEST_CONFIG.autoLimit - updated.autoUsed),
    resetAt: updated.resetAt,
  };
}

/**
 * Scheduler sweep: roll forward guest windows whose resetAt has passed.
 * Idle guests would otherwise keep stale resetAt values forever.
 */
export async function sweepGuestQuotas(): Promise<number> {
  const now = new Date();
  let count = 0;

  const staleGuests = await prisma.guestQuota.findMany({
    where: { resetAt: { lt: now } },
    take: 500,
    select: { id: true, autoUsed: true, resetAt: true },
  });
  for (const row of staleGuests) {
    try {
      await rollGuest(row);
      count++;
    } catch (err) {
      console.error('[Guest] sweep roll failed:', (err as Error).message);
    }
  }

  const staleIps = await prisma.guestIpQuota.findMany({
    where: { resetAt: { lt: now } },
    take: 500,
    select: { ip: true, autoUsed: true, resetAt: true },
  });
  for (const row of staleIps) {
    try {
      await rollIp(row);
      count++;
    } catch (err) {
      console.error('[Guest] sweep IP roll failed:', (err as Error).message);
    }
  }

  return count;
}
