/**
 * Public config endpoint.
 *
 *   GET /api/config/public — plan quotas, USD pricing, and guest mode settings.
 *
 * Unauthenticated. The frontend hits this once on boot so the Settings page
 * and ModeSelector can render without duplicating env values in both
 * server/.env and the Vite bundle.
 *
 * DO NOT leak secrets here. Only values safe to show every visitor.
 */
import { Router, type Request, type Response } from 'express';
import { getPublicPlanConfig } from '../services/subscription.service.js';
import { GUEST_CONFIG } from '../services/guest.service.js';

const router = Router();

router.get('/public', (_req: Request, res: Response) => {
  // Lightweight cache — config is read-lite and env-driven, so 60s is fine.
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({
    plans: getPublicPlanConfig(),
    guest: {
      enabled: GUEST_CONFIG.enabled,
      autoLimit: GUEST_CONFIG.autoLimit,
      autoWindowHours: GUEST_CONFIG.autoWindowHours,
    },
  });
});

export default router;
