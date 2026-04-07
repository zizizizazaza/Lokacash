import { Router, Request, Response } from 'express';
import { getCachedStartups, getStartupDetail, getCacheStats } from '../services/trustmrr.service.js';
import { getStartupInsight, getInsightCacheStats } from '../services/startup-insights.service.js';
import prisma from '../db.js';

const router = Router();

/**
 * GET /api/trustmrr/startups
 * Returns the cached list of startups (instant, no external API call).
 * Merges Loka-verified enterprises.
 * Query params: category, limit
 */
router.get('/startups', async (_req: Request, res: Response) => {
  try {
    // 1. Get TrustMRR cached data
    let tmrrData = getCachedStartups().map((s: any) => ({ ...s, source: 'trustmrr' }));

    // 2. Get Loka-verified enterprises from DB
    const verified = await prisma.enterpriseVerification.findMany({
      where: { status: 'verified' },
      include: { user: { select: { name: true, avatar: true } } }
    });

    const lokaData = verified.map((v: any, i: number) => ({
      name: v.companyName,
      slug: `loka-${v.companyName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`,
      icon: v.companyLogo || null,
      description: v.description || '',
      website: v.website || null,
      country: v.country || null,
      foundedDate: v.foundedYear ? `${v.foundedYear}-01-01` : null,
      category: (v.categories || '').split(',')[0]?.trim()?.toLowerCase() || 'saas',
      paymentProvider: v.stripeKeyStatus === 'active' ? 'stripe' : '',
      targetAudience: null,
      revenue: {
        last30Days: v.stripeLast30dRev || 0,
        mrr: v.stripeMrr || 0,
        total: 0,
      },
      customers: 0,
      activeSubscriptions: 0,
      askingPrice: null,
      profitMarginLast30Days: null,
      growth30d: v.stripeMomGrowth || null,
      growthMRR30d: null,
      multiple: null,
      rank: undefined, // Let the frontend sort it naturally based on selected metric
      visitorsLast30Days: null,
      revenuePerVisitor: null,
      onSale: false,
      xHandle: null,
      // Loka-specific fields
      source: 'loka',
      lokaVerified: true,
      founderName: v.user?.name || null,
      founderAvatar: v.user?.avatar || null,
    }));

    // 3. Merge: Mix them naturally into the TrustMRR list
    let data = [...tmrrData, ...lokaData];

    // 4. Category filter
    const category = _req.query.category as string | undefined;
    if (category && category !== 'All') {
      if (category.toLowerCase() === 'loka') {
        // Special: only show Loka-verified companies
        data = data.filter((s: any) => s.source === 'loka');
      } else {
        data = data.filter((s: any) => s.category.toLowerCase() === category.toLowerCase());
      }
    }

    // 5. Limit
    const limit = parseInt(_req.query.limit as string) || 5000;
    data = data.slice(0, limit);

    res.json({ data, meta: { total: data.length, cached: true, lokaCount: lokaData.length } });
  } catch (err) {
    // Fallback to TrustMRR-only if DB fails
    console.error('[Market] Failed to merge enterprise data:', err);
    let data = getCachedStartups();
    const category = _req.query.category as string | undefined;
    if (category && category !== 'All') {
      data = data.filter(s => s.category.toLowerCase() === category.toLowerCase());
    }
    const limit = parseInt(_req.query.limit as string) || 5000;
    data = data.slice(0, limit);
    res.json({ data, meta: { total: data.length, cached: true } });
  }
});

/**
 * GET /api/trustmrr/startups/:slug
 * Returns full detail for a single startup. Uses dedup + queue + fallback.
 * AI-generates valueProposition & problemSolved if missing.
 */
router.get('/startups/:slug', async (req: Request, res: Response) => {
  const slug = req.params.slug as string;

  if (!slug) {
    res.status(400).json({ error: 'Slug is required' });
    return;
  }

  const { data, partial } = await getStartupDetail(slug);

  if (!data) {
    res.status(404).json({ error: 'Startup not found' });
    return;
  }

  // Enrich with AI-generated insights if missing
  let enrichedData = { ...data } as any;
  if (!enrichedData.valueProposition || !enrichedData.problemSolved) {
    const insight = await getStartupInsight({
      slug,
      name: data.name,
      description: data.description,
      category: data.category,
      targetAudience: data.targetAudience,
      paymentProvider: data.paymentProvider,
      customers: data.customers,
      revenue: data.revenue,
    });
    if (insight) {
      enrichedData.valueProposition = enrichedData.valueProposition || insight.valueProposition;
      enrichedData.problemSolved = enrichedData.problemSolved || insight.problemSolved;
    }
  }

  res.json({ data: enrichedData, partial });
});

/**
 * GET /api/trustmrr/stats
 * Cache health check for monitoring.
 */
router.get('/stats', (_req: Request, res: Response) => {
  res.json({ ...getCacheStats(), insights: getInsightCacheStats() });
});

export default router;
