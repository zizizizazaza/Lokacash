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
  // Top-cap majors used by the market-brief snapshot fallback. Synthesis
  // pulls these from cache when the web3 agent didn't run a token-deep-dive
  // on them (e.g. user asked about niche tokens but expects a generic
  // "today's market" row at the top of the brief).
  BNB: 'binancecoin', XRP: 'ripple', ADA: 'cardano', TRX: 'tron', TON: 'the-open-network',
  AVAX: 'avalanche-2', DOT: 'polkadot', LTC: 'litecoin', BCH: 'bitcoin-cash',
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
/** Per-symbol 24h change % from the most recent CoinGecko refresh. Sparse —
 *  only populated for symbols where CoinGecko returned a value. Used by the
 *  market-brief synthesis fallback to render major-coin rows even when the
 *  web3 agent didn't fetch them. */
let cachedChange24h: Record<string, number> = {};
let lastFetchAt: Date | null = null;
let fetchInterval: ReturnType<typeof setInterval> | null = null;

/** Symbols treated as "majors" for the market-brief fallback. Order matters —
 *  this is the row order in the injected snapshot. */
const MAJORS_FOR_BRIEF = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE'] as const;

function parseEnvBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value === '') return defaultValue;
  const v = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return defaultValue;
}

function priceServicePollIntervalMs(): number | null {
  const raw = (process.env.PRICE_SERVICE_POLL_INTERVAL_MS || '').trim();
  if (!raw) return 60_000;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 60_000;
  if (n <= 0) return null;
  if (n < 10_000) return 10_000;
  if (n > 3_600_000) return 3_600_000;
  return n;
}

function priceServiceBootFetch(): boolean {
  return parseEnvBool(process.env.PRICE_SERVICE_BOOT_FETCH, true);
}

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

function coingeckoCreds(): { baseUrl: string; headers: Record<string, string>; tier: 'pro' | 'demo' | 'public'; keyPreview: string } {
  const pro = (process.env.COINGECKO_PRO_API_KEY || '').trim();
  const demo = (process.env.COINGECKO_DEMO_API_KEY || '').trim();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (pro) {
    headers['x-cg-pro-api-key'] = pro;
    return { baseUrl: 'https://pro-api.coingecko.com/api/v3', headers, tier: 'pro', keyPreview: pro.slice(0, 8) + '…' };
  }
  if (demo) {
    headers['x-cg-demo-api-key'] = demo;
    return { baseUrl: 'https://api.coingecko.com/api/v3', headers, tier: 'demo', keyPreview: demo.slice(0, 8) + '…' };
  }
  return { baseUrl: 'https://api.coingecko.com/api/v3', headers, tier: 'public', keyPreview: 'none' };
}

/** Fetch prices from CoinGecko (Pro if key set, else Public) */
async function fetchFromCoinGecko(): Promise<Record<string, number> | null> {
  const ids = [...new Set(Object.values(COINGECKO_IDS))].join(',');
  const { baseUrl, headers } = coingeckoCreds();
  // include_24hr_change=true is needed so the market-brief snapshot can show
  // a percent-change column. Adds zero cost to the existing call (same row,
  // extra field).
  const url = `${baseUrl}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
  const timeoutMs = coingeckoFetchTimeoutMs();

  const dispatcher = getCoingeckoDispatcher();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        ...(dispatcher ? { dispatcher } : {}),
      });

      if (!response.ok) {
        console.warn(`[PriceService] CoinGecko API returned ${response.status}`);
        return null;
      }

      const data = (await response.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;

      const prices: Record<string, number> = {};
      const change24h: Record<string, number> = {};
      for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
        const row = data[geckoId];
        if (row?.usd !== undefined) {
          prices[symbol] = row.usd;
        }
        if (typeof row?.usd_24h_change === 'number' && Number.isFinite(row.usd_24h_change)) {
          change24h[symbol] = row.usd_24h_change;
        }
      }

      // Side-effect: refresh the 24h-change cache used by getMajorsSnapshot().
      cachedChange24h = change24h;

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

/**
 * Snapshot of major coins for the market-brief synthesis fallback.
 * Returns a pre-formatted markdown table (or null if no real data is
 * available — i.e. the cache is still on FALLBACK_PRICES with no live fetch).
 *
 * This lets synthesis render the standard "Market Overview" row even when
 * the web3 agent's tool calls focused on long-tail tokens from an image
 * digest and never queried BTC/ETH/SOL/etc.
 */
export function getMajorsSnapshotForSynthesis(): string | null {
  // Skip injection until at least one live CoinGecko fetch has succeeded —
  // the fallback dictionary is months-stale and would mislead synthesis.
  if (!lastFetchAt) return null;
  const rows: Array<{ symbol: string; price: number; change?: number }> = [];
  for (const sym of MAJORS_FOR_BRIEF) {
    const price = cachedPrices[sym];
    if (price === undefined) continue;
    rows.push({ symbol: sym, price, change: cachedChange24h[sym] });
  }
  if (rows.length === 0) return null;

  const fmtPrice = (n: number): string => {
    if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    if (n >= 1) return `$${n.toFixed(2)}`;
    if (n >= 0.01) return `$${n.toFixed(4)}`;
    return `$${n.toPrecision(3)}`;
  };
  const fmtChange = (c?: number): string => {
    if (c === undefined) return '—';
    const sign = c >= 0 ? '+' : '';
    return `${sign}${c.toFixed(2)}%`;
  };

  const table = [
    '| Symbol | Price (USD) | 24h % |',
    '|--------|-------------|-------|',
    ...rows.map((r) => `| ${r.symbol} | ${fmtPrice(r.price)} | ${fmtChange(r.change)} |`),
  ].join('\n');

  return `Source: CoinGecko cache (last refreshed ${lastFetchAt.toISOString()})\n${table}`;
}

/** Start auto-refresh (call on server startup) */
export function startPriceService() {
  const enabled = parseEnvBool(process.env.PRICE_SERVICE_ENABLED, true);
  if (!enabled) {
    console.log('[PriceService] Disabled via PRICE_SERVICE_ENABLED=false — using static fallback prices only');
    return;
  }
  const intervalMs = priceServicePollIntervalMs();
  const creds = coingeckoCreds();
  console.log(
    `[CoinGecko] Tier=${creds.tier.toUpperCase()} baseUrl=${creds.baseUrl} key=${creds.keyPreview}`,
  );
  console.log('[PriceService] Starting price feed...');
  if (intervalMs == null) {
    if (priceServiceBootFetch()) {
      console.log(
        '[PriceService] Polling disabled (PRICE_SERVICE_POLL_INTERVAL_MS<=0); one boot fetch only (set PRICE_SERVICE_BOOT_FETCH=false to skip)',
      );
      refreshPrices();
    } else {
      console.log(
        '[PriceService] Polling disabled (PRICE_SERVICE_POLL_INTERVAL_MS<=0) and boot fetch off — no CoinGecko requests',
      );
    }
    return;
  }
  // First fetch after boot, then on interval (CoinGecko free tier is easy to 429 if too aggressive)
  refreshPrices();
  fetchInterval = setInterval(refreshPrices, intervalMs);
  console.log(
    `[PriceService] Poll interval: ${Math.round(intervalMs / 1000)}s (PRICE_SERVICE_POLL_INTERVAL_MS; use 0 to disable polling)`,
  );
}

/** Stop auto-refresh */
export function stopPriceService() {
  if (fetchInterval) clearInterval(fetchInterval);
  console.log('[PriceService] Price feed stopped');
}
