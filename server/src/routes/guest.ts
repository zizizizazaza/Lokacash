/**
 * Guest mode REST endpoints.
 *
 *   GET /api/guest/quota  — current guest Auto quota snapshot
 *
 * Identifies the guest via the `x-guest-id` header (client-generated UUID
 * held in localStorage). No auth — this route is intentionally public
 * for unauthenticated users.
 */
import { Router, type Request, type Response } from 'express';
import { getGuestQuota, GUEST_CONFIG } from '../services/guest.service.js';

const router = Router();

router.get('/quota', async (req: Request, res: Response) => {
  if (!GUEST_CONFIG.enabled) {
    return res.status(503).json({ error: 'guest_mode_disabled' });
  }

  const guestIdRaw = req.header('x-guest-id') || (req.query.guestId as string | undefined);
  const guestId = (guestIdRaw || '').trim();
  if (!guestId || guestId.length < 8 || guestId.length > 128) {
    return res.status(400).json({ error: 'invalid_guest_id' });
  }

  try {
    const snapshot = await getGuestQuota(guestId);
    res.json(snapshot);
  } catch (err) {
    console.error('[Guest] quota lookup failed:', err);
    res.status(500).json({ error: (err as Error).message || 'failed to load guest quota' });
  }
});

router.get('/config', (_req: Request, res: Response) => {
  res.json({
    enabled: GUEST_CONFIG.enabled,
    autoLimit: GUEST_CONFIG.autoLimit,
    autoWindowHours: GUEST_CONFIG.autoWindowHours,
  });
});

export default router;
