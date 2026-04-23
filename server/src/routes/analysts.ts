/**
 * Analyst catalog endpoint.
 *
 *   GET /api/analysts — returns the 18-persona roundtable catalog (public
 *   fields only, no systemPrompt). The frontend SUMMON_POOL in
 *   src/components/SuperAgentChat.tsx mirrors this shape.
 *
 * Unauthenticated. This is display metadata; the real persona prompts live
 * server-side (in catalogs/analysts.ts + aegean personas.json) and are never
 * sent to the browser.
 */
import { Router, type Request, type Response } from 'express';
import { getPublicCatalog } from '../catalogs/analysts.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  // Catalog is compile-time constant → cache aggressively.
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    analysts: getPublicCatalog(),
  });
});

export default router;
