/**
 * Lokacash Skill API — public surface for external AI agents.
 *
 * All /skill/v1/* endpoints are stateless, unauthenticated (internal testing),
 * and designed to be consumed by AI agents installed via the Anthropic
 * Skills Protocol (e.g. `npx skills add lokacash/lokacash`).
 *
 * Response shape is deliberately white-labeled — no mention of underlying
 * providers (OKX / CoinGecko / CoinMarketCal / Exa / Bird / Aegean).
 *
 * Path structure (three-tier):
 *   /research/*  — generic multi-domain capabilities (consensus, deep research)
 *   /crypto/*    — crypto-specific atomic data
 *   /stock/*     — stock/equity analysis
 */
import { Router, Request, Response } from 'express';
import { runConsensusEngine } from '../services/consensus.service.js';
import { runWeb3RouterQuery, runOkxCli } from '../services/web3Router.service.js';
import { researchService } from '../services/research.service.js';
import { stockAnalysisService } from '../services/stockanalysis.service.js';
import { hedgefundService } from '../services/hedgefund.service.js';
import { getListings, getUpcomingEvents } from './events.js';
import {
  mapConsensusToSkill,
  mapHedgeFundToSkill,
  mapOkxMarketSnapshotToSkill,
  mapOkxNewsBundleToSkill,
  mapResearchResultToSkill,
  mapStockReportToSkill,
  mapWeb3ResultToSkill,
} from '../services/skillMapper.js';

const router = Router();

function errorResponse(res: Response, status: number, error: string, hint?: string) {
  res.status(status).json({ ok: false, error, ...(hint ? { hint } : {}) });
}

function normalizeSymbol(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase();
}

// ════════════════════════════════════════════════════════════════════
//           /research/*  —  generic multi-domain capabilities
// ════════════════════════════════════════════════════════════════════

/**
 * POST /skill/v1/research/consensus
 * Body: { question: string, mode?: 'roundtable' | 'collaborate' }
 *
 * Runs a multi-agent roundtable on ANY topic (crypto, stock, macro, strategy).
 * Specialized analysts debate the question and return a majority verdict.
 */
router.post('/v1/research/consensus', async (req: Request, res: Response) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question) {
    return errorResponse(res, 400, 'missing_question', 'POST body requires `question` (string).');
  }
  const mode = req.body?.mode === 'collaborate' ? 'collaborate' : 'roundtable';
  try {
    const result = await runConsensusEngine('skill:anonymous', mode, question);
    const mapped = mapConsensusToSkill(question, result);
    if (!mapped) {
      return errorResponse(res, 502, 'upstream_empty', 'Consensus engine returned no result.');
    }
    res.json({ ok: true, data: mapped });
  } catch (err) {
    return errorResponse(res, 500, 'consensus_failed', (err as Error).message);
  }
});

/**
 * POST /skill/v1/research/deep
 * Body: { topic: string, days?: number }
 *
 * Runs Lokacash's deep research pipeline over web + social feeds. Works for
 * any topic (crypto news, stock analysis, tech trends, macro events).
 */
router.post('/v1/research/deep', async (req: Request, res: Response) => {
  const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() : '';
  if (!topic) {
    return errorResponse(res, 400, 'missing_topic', 'POST body requires `topic` (string).');
  }
  const daysRaw = Number(req.body?.days);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 90 ? daysRaw : 30;
  try {
    const result = await researchService.runDeepResearch(topic, { deep: false, days });
    const mapped = mapResearchResultToSkill(topic, result);
    if (!mapped) {
      return errorResponse(res, 502, 'upstream_empty', 'Research pipeline returned no result.');
    }
    res.json({ ok: true, data: mapped });
  } catch (err) {
    return errorResponse(res, 500, 'research_failed', (err as Error).message);
  }
});

// ════════════════════════════════════════════════════════════════════
//                /crypto/*  —  crypto-specific data
// ════════════════════════════════════════════════════════════════════

/**
 * POST /skill/v1/crypto/deep-research
 * Body: { query: string }
 *
 * Crypto-specific cross-source pipeline: price + derivatives + sentiment
 * + news, resolved to specific token(s). For non-crypto topics, use
 * /research/deep instead.
 */
router.post('/v1/crypto/deep-research', async (req: Request, res: Response) => {
  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  if (!query) {
    return errorResponse(res, 400, 'missing_query', 'POST body requires `query` (string).');
  }
  try {
    const raw = await runWeb3RouterQuery(query);
    (raw as unknown as { query: string }).query = query;
    const mapped = mapWeb3ResultToSkill(raw);
    if (!mapped) {
      return errorResponse(res, 502, 'upstream_empty', 'Research pipeline returned no result.');
    }
    res.json({ ok: true, data: mapped });
  } catch (err) {
    return errorResponse(res, 500, 'crypto_research_failed', (err as Error).message);
  }
});

/**
 * GET /skill/v1/crypto/sentiment/:symbol
 * Returns bull/bear/neutral ratios + hotness score + catalyst news.
 */
router.get('/v1/crypto/sentiment/:symbol', async (req: Request, res: Response) => {
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol || !/^[A-Z0-9]{2,10}$/.test(symbol)) {
    return errorResponse(res, 400, 'invalid_symbol', 'Path param must be an uppercase ticker, e.g. BTC.');
  }
  try {
    const result = await runOkxCli({ intent: 'news_bundle', baseCcy: symbol, limit: 8 }, 10_000);
    if (!result.ok) {
      return errorResponse(res, 502, 'upstream_failed', result.error || 'no sentiment data');
    }
    const mapped = mapOkxNewsBundleToSkill(result.payload);
    if (!mapped) {
      return errorResponse(res, 502, 'upstream_empty', 'No sentiment data for this symbol.');
    }
    res.json({ ok: true, data: mapped });
  } catch (err) {
    return errorResponse(res, 500, 'sentiment_failed', (err as Error).message);
  }
});

/**
 * GET /skill/v1/crypto/market/:symbol
 * Spot price + 24h + 7D history.
 */
router.get('/v1/crypto/market/:symbol', async (req: Request, res: Response) => {
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol || !/^[A-Z0-9]{2,10}$/.test(symbol)) {
    return errorResponse(res, 400, 'invalid_symbol', 'Path param must be an uppercase ticker.');
  }
  try {
    const result = await runOkxCli({ intent: 'market_snapshot', baseCcy: symbol, limit: 7 }, 8_000);
    if (!result.ok) {
      return errorResponse(res, 502, 'upstream_failed', result.error || 'no market data');
    }
    const mapped = mapOkxMarketSnapshotToSkill(result.payload);
    if (!mapped?.spot) {
      return errorResponse(res, 404, 'not_found', `No market data available for ${symbol}.`);
    }
    res.json({
      ok: true,
      data: {
        symbol: mapped.symbol,
        spot: mapped.spot,
        priceHistory: mapped.priceHistory,
        asOf: mapped.asOf,
      },
    });
  } catch (err) {
    return errorResponse(res, 500, 'market_failed', (err as Error).message);
  }
});

/**
 * GET /skill/v1/crypto/derivatives/:symbol
 * Funding rate + OI + orderbook depth.
 */
router.get('/v1/crypto/derivatives/:symbol', async (req: Request, res: Response) => {
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol || !/^[A-Z0-9]{2,10}$/.test(symbol)) {
    return errorResponse(res, 400, 'invalid_symbol', 'Path param must be an uppercase ticker.');
  }
  try {
    const result = await runOkxCli({ intent: 'market_snapshot', baseCcy: symbol, limit: 30 }, 8_000);
    if (!result.ok) {
      return errorResponse(res, 502, 'upstream_failed', result.error || 'no derivatives data');
    }
    const mapped = mapOkxMarketSnapshotToSkill(result.payload);
    if (!mapped?.derivatives) {
      return errorResponse(res, 404, 'not_found', `No perpetual futures data for ${symbol}.`);
    }
    res.json({
      ok: true,
      data: {
        symbol: mapped.symbol,
        derivatives: mapped.derivatives,
        priceHistory: mapped.priceHistory,
        asOf: mapped.asOf,
      },
    });
  } catch (err) {
    return errorResponse(res, 500, 'derivatives_failed', (err as Error).message);
  }
});

/**
 * GET /skill/v1/crypto/events?limit=10
 * Upcoming crypto catalysts.
 */
router.get('/v1/crypto/events', async (req: Request, res: Response) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 50 ? limitRaw : 10;
  try {
    const events = await getUpcomingEvents();
    res.json({
      ok: true,
      data: {
        events: events.slice(0, limit).map((ev) => ({
          id: ev.id,
          title: ev.title,
          dateEvent: new Date(ev.dateEvent).toISOString(),
          category: ev.categoryName,
          coins: ev.coinSymbols,
          coinNames: ev.coinNames,
          detailsUrl: ev.source,
        })),
        asOf: Date.now(),
      },
    });
  } catch (err) {
    return errorResponse(res, 500, 'events_failed', (err as Error).message);
  }
});

/**
 * GET /skill/v1/crypto/trending?limit=10
 * Top-searched coins right now.
 */
router.get('/v1/crypto/trending', async (req: Request, res: Response) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 20 ? limitRaw : 10;
  try {
    const items = await getListings();
    res.json({
      ok: true,
      data: {
        trending: items.slice(0, limit).map((item) => ({
          id: item.id,
          symbol: item.symbol,
          name: item.name,
          marketCapRank: item.rank ?? null,
          priceUsd: item.priceUsd ?? null,
          change24hPct: item.change24hPct ?? null,
          iconUrl: item.thumb ?? null,
        })),
        asOf: Date.now(),
      },
    });
  } catch (err) {
    return errorResponse(res, 500, 'trending_failed', (err as Error).message);
  }
});

/**
 * POST /skill/v1/crypto/portfolio-analysis
 * Body: {
 *   tickers: string[],         // 1..3 tickers, e.g. ["AAPL", "TSLA", "BTC-USD"]
 *   analysts?: string[],       // optional: subset of analyst personas
 *   showReasoning?: boolean    // default true (include full reasoning per analyst)
 * }
 *
 * Multi-analyst portfolio decision pipeline (AI Hedge Fund). Each analyst persona
 * issues an independent BUY / SELL / HOLD signal per ticker; the framework then
 * fuses them into a final trading decision with quantity + confidence.
 *
 * Heavy operation: 30s-5min depending on ticker count + analyst count.
 */
router.post('/v1/crypto/portfolio-analysis', async (req: Request, res: Response) => {
  const tickersRaw = req.body?.tickers;
  if (!Array.isArray(tickersRaw) || tickersRaw.length === 0) {
    return errorResponse(res, 400, 'missing_tickers', 'POST body requires `tickers` (non-empty string array).');
  }
  if (tickersRaw.length > 3) {
    return errorResponse(res, 400, 'too_many_tickers', 'Limit 3 tickers per request to keep latency under 5min.');
  }
  const tickers: string[] = [];
  for (const t of tickersRaw) {
    if (typeof t !== 'string' || !/^[A-Za-z0-9.\-]{1,12}$/.test(t.trim())) {
      return errorResponse(res, 400, 'invalid_ticker', `Each ticker must be 1-12 alphanumeric chars. Got: ${t}`);
    }
    tickers.push(t.trim().toUpperCase());
  }

  const analystsRaw = req.body?.analysts;
  const analysts: string[] | undefined = Array.isArray(analystsRaw)
    ? analystsRaw.filter((a) => typeof a === 'string' && a.length > 0).slice(0, 10)
    : undefined;

  const showReasoning = req.body?.showReasoning !== false; // default true

  try {
    const result = await hedgefundService.runAnalysis({
      tickers,
      analysts,
      showReasoning,
    });
    const formatted = hedgefundService.formatReport(result, showReasoning);
    const mapped = mapHedgeFundToSkill(result, formatted);
    if (!mapped) {
      return errorResponse(res, 502, 'upstream_empty', 'Hedge fund pipeline returned no result.');
    }
    res.json({ ok: true, data: mapped });
  } catch (err) {
    return errorResponse(res, 500, 'portfolio_analysis_failed', (err as Error).message);
  }
});

// ════════════════════════════════════════════════════════════════════
//              /stock/*  —  stock / equity analysis
// ════════════════════════════════════════════════════════════════════

/**
 * GET /skill/v1/stock/analysis/:ticker
 *
 * Full stock analysis: fundamentals, technical indicators, valuation.
 * Typical latency: 30-60 seconds (Python analysis pipeline).
 */
router.get('/v1/stock/analysis/:ticker', async (req: Request, res: Response) => {
  const ticker = normalizeSymbol(req.params.ticker);
  if (!ticker || !/^[A-Z0-9.]{1,10}$/.test(ticker)) {
    return errorResponse(res, 400, 'invalid_ticker', 'Path param must be a ticker like AAPL, TSLA, or 700.HK.');
  }
  try {
    const sessionId = `skill:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const report = await new Promise<string>((resolve, reject) => {
      let finalReport = '';
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('stock_analysis_timeout_120s'));
      }, 120_000);

      stockAnalysisService.runStreamAnalysis(
        `Analyze: ${ticker}`,
        sessionId,
        'skill:anonymous',
        () => { /* ignore intermediate steps */ },
        (rpt: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          finalReport = rpt;
          resolve(finalReport);
        },
        (err: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(new Error(err || 'stock_analysis_failed'));
        },
      );
    });
    res.json({ ok: true, data: mapStockReportToSkill(ticker, report) });
  } catch (err) {
    return errorResponse(res, 500, 'stock_analysis_failed', (err as Error).message);
  }
});

// ════════════════════════════════════════════════════════════════════
//                            Meta
// ════════════════════════════════════════════════════════════════════

/**
 * GET /skill/v1/crypto/pulse-meta
 *
 * Live "vibe" metrics for the home banner — Fear & Greed index +
 * Ethereum gas price. Cached server-side for 30s so a refresh storm
 * from many tabs doesn't pound the upstream APIs.
 *
 * Sources (no API key needed):
 *   - alternative.me  → Crypto Fear & Greed Index
 *   - ethgas.watch    → ETH gas oracle (fast/standard/slow gwei)
 *
 * Both are free, public, and well-known. We swallow individual
 * failures so a flaky upstream just leaves that field null instead
 * of breaking the whole banner.
 */
type PulseMeta = {
  fearGreed: { value: number; label: string; updatedAt: number } | null;
  ethGas: { fastGwei: number; standardGwei: number; slowGwei: number; updatedAt: number } | null;
  asOf: number;
};
let pulseMetaCache: PulseMeta | null = null;
let pulseMetaCachedAt = 0;
const PULSE_META_TTL_MS = 30_000;

async function fetchFearGreed(): Promise<PulseMeta['fearGreed']> {
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: Array<{ value: string; value_classification: string; timestamp: string }> };
    const item = j?.data?.[0];
    if (!item) return null;
    const v = Number(item.value);
    if (!Number.isFinite(v)) return null;
    return {
      value: Math.round(v),
      label: item.value_classification || '',
      updatedAt: Number(item.timestamp) ? Number(item.timestamp) * 1000 : Date.now(),
    };
  } catch {
    return null;
  }
}

async function fetchEthGas(): Promise<PulseMeta['ethGas']> {
  // Strategy: try Blocknative's free public block-prices endpoint first
  // (no API key, returns confidence-tiered estimates), then fall back to
  // ethgas.watch. Most public eth_gasPrice RPCs are now gated behind keys.
  try {
    const r = await fetch('https://api.blocknative.com/gasprices/blockprices', {
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: 'application/json' },
    });
    if (r.ok) {
      const j = (await r.json()) as {
        blockPrices?: Array<{
          baseFeePerGas?: number;
          estimatedPrices?: Array<{ confidence?: number; price?: number }>;
        }>;
      };
      const prices = j?.blockPrices?.[0]?.estimatedPrices;
      if (Array.isArray(prices) && prices.length > 0) {
        const byConfidence = (c: number) => prices.find((p) => p.confidence === c)?.price;
        // Confidence 99 = fast (most likely to be included next block).
        // 90 = standard. 70 = slow / cost-saving.
        const fast = Number(byConfidence(99) ?? prices[0]?.price);
        const standard = Number(byConfidence(90) ?? byConfidence(95) ?? prices[1]?.price ?? fast);
        const slow = Number(byConfidence(70) ?? prices[prices.length - 1]?.price ?? standard);
        if ([fast, standard, slow].every((v) => Number.isFinite(v) && v > 0)) {
          return {
            fastGwei: Math.max(1, Math.round(fast)),
            standardGwei: Math.max(1, Math.round(standard)),
            slowGwei: Math.max(1, Math.round(slow)),
            updatedAt: Date.now(),
          };
        }
      }
    }
  } catch {
    /* fall through */
  }

  // Fallback: ethgas.watch (occasionally flaky but fine when up).
  try {
    const r = await fetch('https://www.ethgas.watch/api/gas', {
      signal: AbortSignal.timeout(4_000),
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      fast?: { gwei?: number };
      normal?: { gwei?: number };
      slow?: { gwei?: number };
    };
    const fast = Number(j?.fast?.gwei);
    const normal = Number(j?.normal?.gwei);
    const slow = Number(j?.slow?.gwei);
    if (![fast, normal, slow].every(Number.isFinite)) return null;
    return {
      fastGwei: Math.round(fast),
      standardGwei: Math.round(normal),
      slowGwei: Math.round(slow),
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

router.get('/v1/crypto/pulse-meta', async (_req: Request, res: Response) => {
  const now = Date.now();
  if (pulseMetaCache && now - pulseMetaCachedAt < PULSE_META_TTL_MS) {
    return res.json({ ok: true, data: pulseMetaCache, cached: true });
  }
  try {
    const [fearGreed, ethGas] = await Promise.all([fetchFearGreed(), fetchEthGas()]);
    pulseMetaCache = { fearGreed, ethGas, asOf: now };
    pulseMetaCachedAt = now;
    res.json({ ok: true, data: pulseMetaCache, cached: false });
  } catch (err) {
    return errorResponse(res, 500, 'pulse_meta_failed', (err as Error).message);
  }
});

/**
 * GET /skill/v1/info
 * Self-describing endpoint for skill discovery.
 */
router.get('/v1/info', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    data: {
      name: 'lokacash',
      version: '1.2.0',
      description: 'Lokacash investment intelligence — multi-agent consensus, deep research, crypto market data, stock analysis.',
      endpoints: [
        // /research/*
        { method: 'POST', path: '/skill/v1/research/consensus', description: 'Multi-agent roundtable on any investment question' },
        { method: 'POST', path: '/skill/v1/research/deep', description: 'Deep web + social research on any topic' },
        // /crypto/*
        { method: 'POST', path: '/skill/v1/crypto/deep-research', description: 'Crypto-focused research synthesizing market + sentiment + news' },
        { method: 'POST', path: '/skill/v1/crypto/portfolio-analysis', description: 'Multi-analyst hedge-fund decision (BUY/SELL/HOLD per ticker, with quantity + confidence)' },
        { method: 'GET', path: '/skill/v1/crypto/sentiment/:symbol', description: 'Per-coin sentiment + catalyst news' },
        { method: 'GET', path: '/skill/v1/crypto/market/:symbol', description: 'Spot price + 24h stats + 7D history' },
        { method: 'GET', path: '/skill/v1/crypto/derivatives/:symbol', description: 'Perpetual funding + OI + orderbook' },
        { method: 'GET', path: '/skill/v1/crypto/events', description: 'Upcoming crypto catalyst events' },
        { method: 'GET', path: '/skill/v1/crypto/trending', description: 'Top-searched coins right now' },
        // /stock/*
        { method: 'GET', path: '/skill/v1/stock/analysis/:ticker', description: 'Full stock analysis: fundamentals, technical, valuation' },
      ],
    },
  });
});

export default router;
