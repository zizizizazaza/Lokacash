/**
 * CoinGecko-backed ticker validator. Layer-2 fallback for the routing pipeline.
 *
 * The router LLM occasionally puts long-tail crypto symbols (PENGU, ONDO, JUP,
 * TAO, PYTH, WIF…) into analysis.tickers because the hardcoded crypto whitelist
 * in `cryptoAssets.ts` only covers ~40 majors. CoinGecko has 14K+ tokens — we
 * can't keep up by hand-editing a list. So instead, when we see an unfamiliar
 * ticker after Layer 1 stripping, we ask CoinGecko's /search whether the symbol
 * is actually a tradeable crypto. If it returns an exact symbol match with a
 * reasonable market cap rank, we promote the ticker to web3 so the equity data
 * sources don't waste 30+s returning invalid_symbol (see log.md PENGU case).
 *
 * Caching: 5-minute LRU keyed by lowercased symbol. A user repeating the same
 * query in the same session pays ~150ms once, then 0.
 */

const CG_PUBLIC_REST = 'https://api.coingecko.com/api/v3';
const CG_PRO_REST = 'https://pro-api.coingecko.com/api/v3';

function cgBase(): string {
  return (process.env.COINGECKO_PRO_API_KEY || '').trim() ? CG_PRO_REST : CG_PUBLIC_REST;
}

function cgHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const pro = (process.env.COINGECKO_PRO_API_KEY || '').trim();
  const demo = (process.env.COINGECKO_DEMO_API_KEY || '').trim();
  if (pro) headers['x-cg-pro-api-key'] = pro;
  else if (demo) headers['x-cg-demo-api-key'] = demo;
  return headers;
}

export interface CryptoTickerMatch {
  /** CoinGecko slug, e.g. "pudgy-penguins" */
  id: string;
  /** Uppercased symbol, e.g. "PENGU" */
  symbol: string;
  /** Display name, e.g. "Pudgy Penguins" */
  name: string;
  /** Lower number = more popular. null when CoinGecko has no rank (sketchy). */
  marketCapRank: number | null;
}

export interface ValidatorResult {
  ticker: string;
  cgMatch: CryptoTickerMatch | null;
}

const cache = new Map<string, { result: CryptoTickerMatch | null; at: number }>();
const TTL_MS = 5 * 60_000;
const MAX_CACHE = 500;

function pruneCache() {
  if (cache.size <= MAX_CACHE) return;
  const entries = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  const drop = entries.slice(0, cache.size - MAX_CACHE);
  for (const [k] of drop) cache.delete(k);
}

interface CgSearchCoin {
  id?: string;
  symbol?: string;
  name?: string;
  market_cap_rank?: number | null;
}

/**
 * Resolve one ticker via CoinGecko /search. Returns the highest-ranked exact
 * symbol match, or null. Mirrors the scoring used by the web3 CLI's
 * `resolveAssetByExplicitTicker` (cli.ts:672) but lives in the main process so
 * routing can use it before deciding which agent to dispatch.
 */
async function resolveTicker(ticker: string): Promise<CryptoTickerMatch | null> {
  const t = (ticker || '').trim().toLowerCase();
  if (!t) return null;
  const now = Date.now();
  const hit = cache.get(t);
  if (hit && now - hit.at < TTL_MS) return hit.result;

  try {
    const url = `${cgBase()}/search?query=${encodeURIComponent(t)}`;
    const r = await fetch(url, { headers: cgHeaders(), signal: AbortSignal.timeout(3500) });
    if (!r.ok) return null;
    const json = (await r.json()) as { coins?: CgSearchCoin[] };
    const exact = (json.coins || []).filter(
      (c) => (c.symbol || '').toLowerCase() === t,
    );
    if (!exact.length) {
      cache.set(t, { result: null, at: now });
      pruneCache();
      return null;
    }
    // Highest-ranked = lowest market_cap_rank value. Unranked sorts last.
    exact.sort((a, b) => {
      const ra = typeof a.market_cap_rank === 'number' ? a.market_cap_rank : Number.POSITIVE_INFINITY;
      const rb = typeof b.market_cap_rank === 'number' ? b.market_cap_rank : Number.POSITIVE_INFINITY;
      return ra - rb;
    });
    const pick = exact[0];
    if (!pick.id) {
      cache.set(t, { result: null, at: now });
      pruneCache();
      return null;
    }
    const match: CryptoTickerMatch = {
      id: pick.id,
      symbol: (pick.symbol || t).toUpperCase(),
      name: pick.name || pick.id,
      marketCapRank: typeof pick.market_cap_rank === 'number' ? pick.market_cap_rank : null,
    };
    cache.set(t, { result: match, at: now });
    pruneCache();
    return match;
  } catch {
    // Network blip / CoinGecko 429 / timeout — fail open, let routing
    // proceed with whatever the LLM said. We return null (no validation
    // happened) rather than caching, so the next attempt can retry.
    return null;
  }
}

/**
 * Validate every ticker in parallel. Per-call timeout already inside
 * resolveTicker so a single slow lookup can't stall the whole batch.
 */
export async function validateTickersAgainstCoinGecko(
  tickers: string[],
): Promise<ValidatorResult[]> {
  const unique = [...new Set(tickers.map((t) => (t || '').trim()).filter(Boolean))];
  const results = await Promise.all(
    unique.map(async (ticker) => ({
      ticker,
      cgMatch: await resolveTicker(ticker),
    })),
  );
  return results;
}

/**
 * Confidence cutoff. CoinGecko has 14K+ assets — anything beyond rank ~1500 is
 * dead/scam/illiquid and we shouldn't promote it over a stock route. Top-1500
 * still covers the long tail people actually trade (PENGU rank ~80, ONDO ~50,
 * JUP ~40, TAO ~30, WIF ~140, etc).
 *
 * Match without a marketCapRank is rejected — CoinGecko strips the rank for
 * unlisted/dormant tokens, which are not the case we want to route on.
 */
const RANK_CONFIDENCE_CUTOFF = 1500;

export function isHighConfidenceCryptoMatch(
  match: CryptoTickerMatch | null,
): match is CryptoTickerMatch {
  if (!match) return false;
  if (match.marketCapRank == null) return false;
  return match.marketCapRank <= RANK_CONFIDENCE_CUTOFF;
}
