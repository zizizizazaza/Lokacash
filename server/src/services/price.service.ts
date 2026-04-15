import { ProxyAgent } from 'undici';

/**
 * Token Price Service — CoinGecko API with local cache fallback
 * 
 * Strategy:
 * 1. On startup and every 60s, fetch prices from CoinGecko free API
 * 2. Cache in memory for quick lookups
 * 3. If CoinGecko fails, fall back to hardcoded defaults
 */

// CoinGecko ID mapping for our supported tokens
const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum', WETH: 'ethereum', WBTC: 'wrapped-bitcoin', BTC: 'bitcoin',
  USDC: 'usd-coin', DAI: 'dai', USDT: 'tether',
  LINK: 'chainlink', UNI: 'uniswap', AAVE: 'aave', COMP: 'compound-governance-token',
  MKR: 'maker', SNX: 'havven', CRV: 'curve-dao-token', SUSHI: 'sushi',
  BAL: 'balancer', YFI: 'yearn-finance', LDO: 'lido-dao',
  AERO: 'aerodrome-finance', WELL: 'moonwell', DEGEN: 'degen-base',
  BRETT: 'brett', PRIME: 'echelon-prime',
  ARB: 'arbitrum', OP: 'optimism', MATIC: 'matic-network', SOL: 'solana',
  PEPE: 'pepe', SHIB: 'shiba-inu', DOGE: 'dogecoin',
  cbETH: 'coinbase-wrapped-staked-eth', rETH: 'rocket-pool-eth', wstETH: 'wrapped-steth',
};

// Fallback prices (used when API is unavailable)
const FALLBACK_PRICES: Record<string, number> = {
  ETH: 2450, WETH: 2450, WBTC: 62500, BTC: 62500,
  USDC: 1.0, DAI: 1.0, USDT: 1.0,
  LINK: 14.5, UNI: 7.2, AAVE: 95.0, COMP: 52.0, MKR: 1450,
  SNX: 2.8, CRV: 0.55, SUSHI: 1.1, BAL: 3.8, YFI: 7200,
  AERO: 1.35, WELL: 0.045, VIRTUAL: 0.82, DEGEN: 0.008,
  BRETT: 0.095, TOSHI: 0.0003, PRIME: 8.5, RSR: 0.008, AXL: 0.72,
  ARB: 1.1, OP: 2.3, MATIC: 0.72, SOL: 145,
  cbETH: 2520, rETH: 2580, wstETH: 2600,
  PEPE: 0.0000085, SHIB: 0.000015, DOGE: 0.12, LDO: 1.9,
};

// In-memory cache
let cachedPrices: Record<string, number> = { ...FALLBACK_PRICES };
let lastFetchAt: Date | null = null;
let fetchInterval: ReturnType<typeof setInterval> | null = null;

/** Node 自带 fetch 不会读 macOS「系统代理」，需与 curl 一致时请设 HTTPS_PROXY / HTTP_PROXY */
let coingeckoProxyAgent: ProxyAgent | null = null;

function getCoingeckoDispatcher(): ProxyAgent | undefined {
  const uri = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
  if (!uri) return undefined;
  if (!coingeckoProxyAgent) {
    coingeckoProxyAgent = new ProxyAgent({ uri });
    console.log('[PriceService] CoinGecko outbound using proxy from env (HTTPS_PROXY or HTTP_PROXY)');
  }
  return coingeckoProxyAgent;
}

function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  let c: unknown = (err as Error & { cause?: unknown }).cause;
  let depth = 0;
  while (c instanceof Error && depth < 4) {
    parts.push(`cause: ${c.message}`);
    c = (c as Error & { cause?: unknown }).cause;
    depth++;
  }
  return parts.join(' | ');
}

function coingeckoFetchTimeoutMs(): number {
  const raw = (process.env.COINGECKO_FETCH_TIMEOUT_MS || '').trim();
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 5000 && n <= 120_000) {
    return n;
  }
  // simple/price with many ids is heavier than /ping; cold start + concurrent boot often needs >10s
  return 25_000;
}

function isTransientNetworkError(err: unknown): boolean {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as Error).name) : '';
  const msg = err instanceof Error ? err.message : String(err);
  return (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    /timeout|aborted|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg)
  );
}

/** Fetch prices from CoinGecko free API (no API key needed) */
async function fetchFromCoinGecko(): Promise<Record<string, number> | null> {
  const ids = [...new Set(Object.values(COINGECKO_IDS))].join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
  const timeoutMs = coingeckoFetchTimeoutMs();

  const dispatcher = getCoingeckoDispatcher();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        ...(dispatcher ? { dispatcher } : {}),
      });

      if (!response.ok) {
        console.warn(`[PriceService] CoinGecko API returned ${response.status}`);
        return null;
      }

      const data = (await response.json()) as Record<string, { usd?: number }>;

      const prices: Record<string, number> = {};
      for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
        const price = data[geckoId]?.usd;
        if (price !== undefined) {
          prices[symbol] = price;
        }
      }

      return prices;
    } catch (err) {
      const transient = isTransientNetworkError(err);
      if (attempt === 0 && transient) {
        console.warn(
          `[PriceService] CoinGecko fetch attempt 1 failed (${formatFetchError(err)}), retrying in 1.5s...`,
        );
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      const hint =
        !dispatcher && /fetch failed|ECONNREFUSED|ENOTFOUND|certificate/i.test(formatFetchError(err))
          ? ' (若本机需代理访问外网，请在 server/.env 设置 HTTPS_PROXY，例如 HTTPS_PROXY=http://127.0.0.1:7890)'
          : '';
      console.warn('[PriceService] CoinGecko fetch failed:', formatFetchError(err) + hint);
      return null;
    }
  }

  return null;
}

/** Refresh cached prices */
async function refreshPrices() {
  const fresh = await fetchFromCoinGecko();
  if (fresh && Object.keys(fresh).length > 0) {
    // Merge with fallback (keep tokens not on CoinGecko like VIRTUAL, TOSHI, RSR, AXL)
    cachedPrices = { ...FALLBACK_PRICES, ...fresh };
    lastFetchAt = new Date();
    console.log(`[PriceService] Updated ${Object.keys(fresh).length} token prices from CoinGecko`);
  }
}

/** Get the current price of a token */
export function getTokenPrice(symbol: string): number | undefined {
  return cachedPrices[symbol.toUpperCase()];
}

/** Get all cached prices */
export function getAllPrices(): Record<string, number> {
  return { ...cachedPrices };
}

/** Get price metadata */
export function getPriceMeta() {
  return {
    source: lastFetchAt ? 'coingecko' : 'fallback',
    lastUpdated: lastFetchAt?.toISOString() || null,
    tokenCount: Object.keys(cachedPrices).length,
  };
}

/** Start auto-refresh (call on server startup) */
export function startPriceService() {
  console.log('[PriceService] Starting price feed...');
  // Fetch immediately then every 60s (CoinGecko free = 10-30 calls/min)
  refreshPrices();
  fetchInterval = setInterval(refreshPrices, 60_000);
}

/** Stop auto-refresh */
export function stopPriceService() {
  if (fetchInterval) clearInterval(fetchInterval);
  console.log('[PriceService] Price feed stopped');
}
