/**
 * Multi-Agent Consensus Gateway
 * Proxies requests to the Python consensus engine (http://173.249.5.203:8000)
 * 
 * Flow:
 *   1. Create group (with mode: consensus | collaboration)
 *   2. Add preset agents as members
 *   3. Post user message
 *   4. Execute consensus → return result
 */
import { Router, Request, Response } from 'express';
import { authRequired, AuthRequest } from '../middleware/auth.js';
import { pyFetch, runConsensusEngine } from '../services/consensus.service.js';

const router = Router();

/**
 * POST /api/agents/consensus
 * Body: { mode: 'collaborate' | 'roundtable', message: string }
 */
router.post('/consensus', authRequired, async (req: AuthRequest, res: Response) => {
  const { mode, message } = req.body;
  const userId = req.userId || 'anonymous';

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const result = await runConsensusEngine(userId, mode, message);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[Consensus Route] Orchestration failed:', err.message);
    res.status(502).json({
      error: 'Multi-agent consensus failed',
      detail: err.message,
    });
  }
});

/**
 * GET /api/agents/consensus/:groupId/history
 * Fetches consensus history for a group.
 */
router.get('/consensus/:groupId/history', authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const limit = req.query.limit || 10;
    const result = await pyFetch(`/groups/${groupId}/consensus/history?limit=${limit}`);
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
