/**
 * Events / Calendar endpoints — public-surface market events for the home page.
 *
 * Primary source: CoinGecko `/coins/list/new` — exchange-neutral, covers
 * all CG-tracked new tokens across CEX / DEX / L2s. Prefer this over single-
 * exchange sources (OKX) to avoid looking like we're sponsored by one venue.
 */
import { Router, Request, Response } from 'express';

const router = Router();

const CG_PRO_REST = 'https://pro-api.coingecko.com/api/v3';
const CG_PUBLIC_REST = 'https://api.coingecko.com/api/v3';
// Trending/listings cache — shorter than events because prices change fast.
// 10min keeps prices reasonably fresh without hammering CG's 30 req/min free tier.
const CACHE_TTL_MS = Math.max(60_000, Number(process.env.EVENTS_NEW_LISTINGS_TTL_MS || '600000')); // 10min

type NewCoinItem = {
  id: string;
  symbol: string;
  name: string;
  /** Unix ms. For /coins/list/new this is activation time; for /search/trending
   * this is a synthetic marker based on list position (staircase). */
  activatedAt: number;
  /** Optional icon URL (from CoinGecko). */
  thumb?: string;
  /** Optional market cap rank (from trending). */
  rank?: number;
  /** USD spot price (trending items only; from CG `data.price`). */
  priceUsd?: number;
  /** 24h percent change in USD (trending items only). */
  change24hPct?: number;
  /** Provenance for debugging. */
  source: 'cg-new' | 'cg-trending';
};

let cache: { items: NewCoinItem[]; loadedAt: number } | null = null;
let inflight: Promise<NewCoinItem[]> | null = null;

function getCgHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const pro = (process.env.COINGECKO_PRO_API_KEY || '').trim();
  const demo = (process.env.COINGECKO_DEMO_API_KEY || '').trim();
  if (pro) headers['x-cg-pro-api-key'] = pro;
  else if (demo) headers['x-cg-demo-api-key'] = demo;
  return headers;
}

function getCgBaseUrl(): string {
  return (process.env.COINGECKO_PRO_API_KEY || '').trim() ? CG_PRO_REST : CG_PUBLIC_REST;
}

async function fetchCgNewCoins(): Promise<NewCoinItem[]> {
  const url = `${getCgBaseUrl()}/coins/list/new`;
  const res = await fetch(url, {
    headers: getCgHeaders(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`CG new coins HTTP ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) {
    console.warn('[events] /coins/list/new returned non-array (likely Pro-only endpoint):', JSON.stringify(raw).slice(0, 200));
    throw new Error('CG new coins: unexpected shape (endpoint may require Pro key)');
  }
  const rows = (raw as Array<{ id: string; symbol: string; name: string; activated_at?: number }>)
    .map((r) => ({
      id: r.id,
      symbol: (r.symbol || '').toUpperCase(),
      name: r.name,
      activatedAt: typeof r.activated_at === 'number' ? r.activated_at * 1000 : 0,
      source: 'cg-new' as const,
    }))
    .filter((r) => r.id && r.symbol && r.activatedAt > 0)
    .sort((a, b) => b.activatedAt - a.activatedAt);
  console.log(`[events] /coins/list/new fetched rows=${rows.length}`);
  return rows;
}

async function fetchCgTrending(): Promise<NewCoinItem[]> {
  const url = `${getCgBaseUrl()}/search/trending`;
  const res = await fetch(url, {
    headers: getCgHeaders(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`CG trending HTTP ${res.status}`);
  type TrendingItem = {
    id: string;
    symbol: string;
    name: string;
    thumb?: string;
    small?: string;
    market_cap_rank?: number;
    data?: {
      price?: number;
      price_change_percentage_24h?: { usd?: number };
    };
  };
  const body = (await res.json()) as { coins?: Array<{ item?: TrendingItem }> };
  const coins = Array.isArray(body?.coins) ? body.coins : [];
  const now = Date.now();
  const rows: NewCoinItem[] = [];
  coins.forEach((c, idx) => {
    const it = c?.item;
    if (!it?.id || !it?.symbol) return;
    const price = typeof it.data?.price === 'number' ? it.data.price : undefined;
    const chgUsd = it.data?.price_change_percentage_24h?.usd;
    const change24hPct = typeof chgUsd === 'number' && Number.isFinite(chgUsd) ? chgUsd : undefined;
    rows.push({
      id: it.id,
      symbol: it.symbol.toUpperCase(),
      name: it.name,
      // Synthetic timestamp: trending #1 treated as "now", each subsequent ~1h older.
      activatedAt: now - idx * 3600_000,
      thumb: it.small || it.thumb,
      rank: typeof it.market_cap_rank === 'number' ? it.market_cap_rank : undefined,
      priceUsd: price,
      change24hPct,
      source: 'cg-trending',
    });
  });
  console.log(`[events] /search/trending fetched rows=${rows.length}`);
  return rows;
}

export type { NewCoinItem, UpcomingEvent };
export async function getListings(): Promise<NewCoinItem[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.items;
  if (inflight) return inflight;
  inflight = (async () => {
    // Primary: /search/trending — matches the UI's "Hot now" label with actual
    // trending coins (BTC, ETH, PEPE when hot), not newly-listed micro-caps.
    try {
      const items = await fetchCgTrending();
      if (items.length > 0) {
        cache = { items, loadedAt: Date.now() };
        return items;
      }
      console.log('[events] /search/trending empty, falling back to /coins/list/new');
    } catch (err) {
      console.warn('[events] /search/trending failed, falling back to new listings:', (err as Error).message);
    }
    // Fallback: /coins/list/new — newly-listed coins (Pro-tier endpoint).
    // Only reachable if trending actually fails, so UI stays close to its label.
    try {
      const items = await fetchCgNewCoins();
      if (items.length > 0) {
        cache = { items, loadedAt: Date.now() };
        return items;
      }
    } catch (err) {
      console.warn('[events] /coins/list/new also failed:', (err as Error).message);
    }
    return cache?.items || [];
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

// ─── CoinMarketCal — upcoming crypto events ─────────────────────────────
const CMC_BASE = 'https://developers.coinmarketcal.com/v1';
const CMC_TTL_MS = Math.max(60_000, Number(process.env.EVENTS_CMC_TTL_MS || '1800000')); // 30min

type UpcomingEvent = {
  id: number;
  title: string;
  dateEvent: number;          // ms epoch
  displayedDate: string;      // "20 Apr 2026"
  categoryName: string;
  coinSymbols: string[];      // ["ETH", "LINK"]
  coinNames: string[];        // ["Ethereum", "Chainlink"]
  source: string;             // coinmarketcal.com URL
};

let cmcCache: { items: UpcomingEvent[]; loadedAt: number } | null = null;
let cmcInflight: Promise<UpcomingEvent[]> | null = null;

type CmcEventRaw = {
  id: number;
  title?: { en?: string };
  date_event?: string;
  displayed_date?: string;
  can_occur_before?: boolean;
  categories?: Array<{ id: number; name: string }>;
  coins?: Array<{ id: string; name: string; symbol: string; rank: number; fullname: string }>;
  source?: string;
};

async function fetchCmcEvents(): Promise<UpcomingEvent[]> {
  const key = (process.env.COINMARKETCAL_API_KEY || '').trim();
  if (!key) throw new Error('COINMARKETCAL_API_KEY not set');

  const params = new URLSearchParams({
    max: '30',
    page: '1',
    sortBy: 'created_desc',
    // NOTE: do NOT add `showOnly=hot_events` — that filters for high-vote
    // community events only and returns 0 results on low-activity days.
    // We let the API return all events, then sort/filter client-side.
  });
  const url = `${CMC_BASE}/events?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'x-api-key': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`CMC HTTP ${res.status}`);
  const body = (await res.json()) as { status?: { error_code: number }; body?: CmcEventRaw[] };
  if (body?.status?.error_code && body.status.error_code !== 0) {
    throw new Error(`CMC error_code=${body.status.error_code}`);
  }
  // Low-signal categories — community/social events without clear market impact.
  // Drop these to keep the home feed focused on price-moving catalysts.
  const LOW_SIGNAL_CATEGORIES = new Set(['Other', 'Community', 'AMA', 'Meetup']);

  const rows = Array.isArray(body?.body) ? body.body : [];
  const now = Date.now();
  const events: UpcomingEvent[] = [];
  for (const raw of rows) {
    const title = raw.title?.en;
    if (!title || !raw.id || !raw.date_event) continue;
    const ts = Date.parse(raw.date_event);
    if (!Number.isFinite(ts)) continue;
    // Skip events that already passed >3 days ago
    if (ts < now - 3 * 86400000) continue;
    const categoryName = raw.categories?.[0]?.name || 'Event';
    if (LOW_SIGNAL_CATEGORIES.has(categoryName)) continue;
    const coins = (raw.coins || []).filter(
      (c) => c.symbol && c.symbol.toUpperCase() !== 'CRYPTO',
    );
    // Require at least one concrete coin association — generic market events
    // are too abstract for a home-page card.
    if (coins.length === 0) continue;
    // Dedupe by symbol — CMC sometimes returns the same symbol twice (e.g. a token
    // and its derivative / re-deployment share the same ticker). Keep the first name
    // encountered per symbol so the UI doesn't show "NIGHT NIGHT" chips.
    const seenSyms = new Set<string>();
    const uniqueCoins: typeof coins = [];
    for (const c of coins) {
      const sym = c.symbol.toUpperCase();
      if (seenSyms.has(sym)) continue;
      seenSyms.add(sym);
      uniqueCoins.push(c);
    }
    events.push({
      id: raw.id,
      title: title.trim(),
      dateEvent: ts,
      displayedDate: raw.displayed_date || new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
      categoryName,
      coinSymbols: uniqueCoins.slice(0, 5).map((c) => c.symbol.toUpperCase()),
      coinNames: uniqueCoins.slice(0, 5).map((c) => c.name),
      source: raw.source || '',
    });
  }
  // Sort by event date ascending (soonest first)
  events.sort((a, b) => a.dateEvent - b.dateEvent);
  console.log(`[events] CMC events fetched rows=${events.length}`);
  return events;
}

export async function getUpcomingEvents(): Promise<UpcomingEvent[]> {
  if (cmcCache && Date.now() - cmcCache.loadedAt < CMC_TTL_MS) return cmcCache.items;
  if (cmcInflight) return cmcInflight;
  cmcInflight = fetchCmcEvents()
    .then((items) => {
      if (items.length > 0) {
        cmcCache = { items, loadedAt: Date.now() };
      }
      return cmcCache?.items || items;
    })
    .catch((err) => {
      console.warn('[events] CMC fetch failed:', (err as Error).message);
      return cmcCache?.items || [];
    })
    .finally(() => {
      cmcInflight = null;
    });
  return cmcInflight;
}

/**
 * GET /api/events/home-feed?trendingLimit=9&eventsLimit=8
 * Combined feed for home page: Trending (CG) + Upcoming Events (CoinMarketCal).
 */
router.get('/home-feed', async (req: Request, res: Response) => {
  const trendingLimit = Math.max(1, Math.min(20, Number(req.query.trendingLimit) || 9));
  const eventsLimit = Math.max(1, Math.min(20, Number(req.query.eventsLimit) || 8));
  try {
    const [trendingAll, eventsAll] = await Promise.all([
      getListings(),
      getUpcomingEvents(),
    ]);
    res.json({
      ok: true,
      trending: trendingAll.slice(0, trendingLimit),
      trendingSource: trendingAll[0]?.source || 'empty',
      events: eventsAll.slice(0, eventsLimit),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message || 'failed to load home feed' });
  }
});

/**
 * GET /api/events/recent-listings?limit=10 (legacy — trending-only)
 * Kept for backward compat until all callers migrate to /home-feed.
 */
router.get('/recent-listings', async (req: Request, res: Response) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 50 ? limitRaw : 10;
  try {
    const all = await getListings();
    const items = all.slice(0, limit);
    const source = items[0]?.source || 'empty';
    res.json({ ok: true, items, source });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message || 'failed to load listings' });
  }
});

export default router;
