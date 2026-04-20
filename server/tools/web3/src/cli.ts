/**
 * Loka Web3 tool — CoinGecko MCP + REST hybrid orchestrator.
 * Invoked by the Express server via child process; prints one JSON line to stdout.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const PUBLIC_MCP = 'https://mcp.api.coingecko.com/mcp';
const PRO_MCP = 'https://mcp.pro-api.coingecko.com/mcp';
const PUBLIC_REST = 'https://api.coingecko.com/api/v3';
const PRO_REST = 'https://pro-api.coingecko.com/api/v3';
const TOOL_CACHE_TTL_MS = Number(process.env.COINGECKO_TOOL_CACHE_TTL_MS || '300000');
const REST_RETRY_ATTEMPTS = Math.max(1, Number(process.env.COINGECKO_REST_RETRY_ATTEMPTS || '3'));
const REST_RETRY_BASE_DELAY_MS = Math.max(50, Number(process.env.COINGECKO_REST_RETRY_BASE_DELAY_MS || '350'));
const SPOT_CACHE_TTL_MS = Math.max(1_000, Number(process.env.WEB3_SPOT_CACHE_TTL_MS || '20000'));
const EXCHANGE_FALLBACK_TIMEOUT_MS = Math.max(2_000, Number(process.env.WEB3_EXCHANGE_TIMEOUT_MS || '6000'));

type Web3Intent =
  | 'token_quote'
  | 'token_deep_dive'
  | 'multi_asset_compare'
  | 'market_scan'
  | 'category_scan'
  | 'onchain_scan'
  | 'nft_scan';

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, unknown> };
};

type SearchCoin = {
  id?: string;
  symbol?: string;
  name?: string;
  market_cap_rank?: number | null;
};

type CoinMarketsRow = {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  current_price?: number;
  market_cap?: number;
  market_cap_rank?: number;
  fully_diluted_valuation?: number | null;
  total_volume?: number;
  high_24h?: number;
  low_24h?: number;
  circulating_supply?: number;
  total_supply?: number | null;
  max_supply?: number | null;
  ath?: number;
  atl?: number;
  price_change_percentage_24h?: number | null;
  last_updated?: string;
};

type CoinDetail = {
  id?: string;
  symbol?: string;
  name?: string;
  market_cap_rank?: number | null;
  categories?: string[];
  asset_platform_id?: string | null;
  contract_address?: string;
  genesis_date?: string;
  hashing_algorithm?: string | null;
  sentiment_votes_up_percentage?: number | null;
  sentiment_votes_down_percentage?: number | null;
  description?: { en?: string };
  links?: {
    homepage?: string[];
    twitter_screen_name?: string;
    subreddit_url?: string;
    repos_url?: { github?: string[] };
  };
  platforms?: Record<string, string>;
  detail_platforms?: Record<
    string,
    {
      contract_address?: string;
      decimal_place?: number | null;
      geckoterminal_url?: string;
    }
  >;
};

type ResolvedAsset = {
  id: string;
  symbol?: string;
  name?: string;
  hint?: string;
  source: string;
};

type MarketScanFilters = {
  minMarketCapUsd?: number;
  min24hChangePct?: number;
  topN: number;
  sort: 'market_cap_desc' | 'total_volume_desc' | 'price_change_percentage_24h_desc';
  useTrendingFeed?: boolean;
};

type Web3CliResult = {
  ok: boolean;
  report: string;
  intent: Web3Intent;
  via: 'mcp' | 'rest' | 'hybrid';
  resolvedId?: string;
  spotPriceUsd?: number;
  resolver?: string;
  assets: Array<{ id?: string; symbol?: string; name?: string }>;
  market: Record<string, unknown>;
  discovery: Record<string, unknown>;
  onchain: Record<string, unknown>;
  nft: Record<string, unknown>;
  logs: string[];
  missingData: string[];
};

type SpotCacheEntry = {
  row: CoinMarketsRow;
  updatedAtMs: number;
  source: 'coingecko' | 'cache' | 'binance' | 'okx';
};

const STOP_WORDS = new Set([
  'token',
  'coin',
  'coins',
  'price',
  'market',
  'cap',
  'recent',
  'trends',
  'trend',
  'current',
  'and',
  'the',
  'what',
  'about',
  'how',
  'is',
  'are',
  'of',
  'for',
  'with',
  'news',
  'sentiment',
  'crypto',
  'cryptocurrency',
  'find',
  'search',
  'do',
  'you',
  'your',
  'think',
  'thoughts',
  'opinion',
  'about',
  'tell',
  'me',
  'current',
  'today',
  'now',
  'hot',
  'popular',
  'tokens',
  'over',
  'above',
  'past',
  'hours',
  'hour',
  '24h',
  '24',
  '至少',
  '达到',
  '超过',
  '热门',
  '币种',
  '查找',
  '查询',
  '筛选',
  '一下',
]);

const ZH_NOISE_RE =
  /(这个代币|这个币|代币|币种|币价|现价|价格|行情|走势|怎么样|如何|多少|是什么|是多少|请问|帮我|看一下|一下|目前|现在|呢|啊|呀|的)$/g;

import { CRYPTO_ASSETS } from './cryptoAssets.js';
const KNOWN_ASSET_PATTERNS = CRYPTO_ASSETS;

const KNOWN_CATEGORY_HINTS: Array<{ keywords: RegExp[]; preferredTerms: string[] }> = [
  { keywords: [/ai agent/i, /ai coins?/i, /人工智能|ai赛道|ai板块/], preferredTerms: ['ai', 'agent'] },
  { keywords: [/meme/i, /梗币|meme币/], preferredTerms: ['meme'] },
  { keywords: [/defi/i, /去中心化金融|defi赛道/], preferredTerms: ['defi'] },
  { keywords: [/layer ?1/i, /l1/i, /公链|一层/], preferredTerms: ['layer', '1'] },
  { keywords: [/gaming|gamefi/i, /游戏币|gamefi/], preferredTerms: ['gaming', 'gamefi'] },
  { keywords: [/rwa/i, /现实世界资产|rwa赛道/], preferredTerms: ['rwa'] },
];

let proxyInitialized = false;
let toolCatalogCache: { fetchedAt: number; tools: McpTool[] } | null = null;
const spotCache = new Map<string, SpotCacheEntry>();

function initProxyFromEnv(): void {
  if (proxyInitialized) return;
  const proxyUrl = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
  if (!proxyUrl) return;
  try {
    const agent = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(agent);
    console.error(`[web3-cli] outbound proxy enabled: ${proxyUrl}`);
  } catch (e) {
    console.error(`[web3-cli] proxy init failed: ${(e as Error).message}`);
  } finally {
    proxyInitialized = true;
  }
}

function getArgQuery(): string {
  return process.argv.slice(2).join(' ').trim();
}

function getRestBaseUrl(): string {
  const custom = (process.env.COINGECKO_REST_BASE_URL || '').trim();
  if (custom) return custom.replace(/\/$/, '');
  return process.env.COINGECKO_PRO_API_KEY ? PRO_REST : PUBLIC_REST;
}

function getRestHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const pro = (process.env.COINGECKO_PRO_API_KEY || '').trim();
  const demo = (process.env.COINGECKO_DEMO_API_KEY || '').trim();
  if (pro) headers['x-cg-pro-api-key'] = pro;
  else if (demo) headers['x-cg-demo-api-key'] = demo;
  return headers;
}

async function fetchRestJson(pathOrUrl: string): Promise<unknown> {
  const url = /^https?:\/\//i.test(pathOrUrl)
    ? pathOrUrl
    : `${getRestBaseUrl()}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= REST_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: getRestHeaders(),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const err = new Error(`REST ${res.status} ${url}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return res.json();
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      const message = (err as Error)?.message || '';
      const isTransientHttp = status != null && [408, 425, 429, 500, 502, 503, 504].includes(status);
      const isTransientNetwork =
        /fetch failed|network|timed out|timeout|socket|econnreset|econnrefused|etimedout|enotfound/i.test(message);
      const shouldRetry = attempt < REST_RETRY_ATTEMPTS && (isTransientHttp || isTransientNetwork);
      if (!shouldRetry) break;
      const delayMs = REST_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.error(
        `[web3-cli] rest retry attempt=${attempt}/${REST_RETRY_ATTEMPTS} delay_ms=${delayMs} reason="${truncate(
          message,
          180,
        )}" url="${truncate(url, 160)}"`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`REST request failed: ${String(lastError)}`);
}

function isRest429Error(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const message = (err as Error)?.message || '';
  return status === 429 || /\bREST\s+429\b/.test(message) || /\b429\b/.test(message);
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function getFallbackSymbolCandidates(resolved: ResolvedAsset): string[] {
  const out: string[] = [];
  const push = (v?: string) => {
    const s = (v || '').trim().toUpperCase();
    if (!s || out.includes(s)) return;
    out.push(s);
  };
  push(resolved.symbol);
  const nameSymbol = (resolved.name || '').replace(/[^A-Za-z]/g, '').toUpperCase();
  if (nameSymbol && nameSymbol.length <= 8) push(nameSymbol);
  const idSymbol = (resolved.id || '').replace(/[^A-Za-z]/g, '').toUpperCase();
  if (idSymbol && idSymbol.length <= 8) push(idSymbol);
  if (resolved.id === 'rave-dao') push('RAVE');
  return out.slice(0, 4);
}

async function fetchBinanceSpotUsd(symbol: string): Promise<number | null> {
  const pairs = [`${symbol}USDT`, `${symbol}BUSD`, `${symbol}USDC`];
  for (const pair of pairs) {
    try {
      const raw = (await fetchJsonWithTimeout(
        `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(pair)}`,
        EXCHANGE_FALLBACK_TIMEOUT_MS,
      )) as { price?: string };
      const v = Number(raw?.price);
      if (Number.isFinite(v) && v > 0) return v;
    } catch {
      /* try next pair */
    }
  }
  return null;
}

async function fetchOkxSpotUsd(symbol: string): Promise<number | null> {
  const pairs = [`${symbol}-USDT`, `${symbol}-USDC`];
  for (const pair of pairs) {
    try {
      const raw = (await fetchJsonWithTimeout(
        `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(pair)}`,
        EXCHANGE_FALLBACK_TIMEOUT_MS,
      )) as { data?: Array<{ last?: string }> };
      const last = raw?.data?.[0]?.last;
      const v = Number(last);
      if (Number.isFinite(v) && v > 0) return v;
    } catch {
      /* try next pair */
    }
  }
  return null;
}

async function fetchExchangeFallbackSpot(resolved: ResolvedAsset): Promise<{ priceUsd: number; source: 'binance' | 'okx' } | null> {
  const symbols = getFallbackSymbolCandidates(resolved);
  for (const symbol of symbols) {
    const binance = await fetchBinanceSpotUsd(symbol);
    if (binance != null) return { priceUsd: binance, source: 'binance' };
    const okx = await fetchOkxSpotUsd(symbol);
    if (okx != null) return { priceUsd: okx, source: 'okx' };
  }
  return null;
}

function getCachedSpotRow(geckoId: string): CoinMarketsRow | null {
  const cached = spotCache.get(geckoId);
  if (!cached) return null;
  if (Date.now() - cached.updatedAtMs > SPOT_CACHE_TTL_MS) {
    spotCache.delete(geckoId);
    return null;
  }
  return cached.row;
}

function setCachedSpotRow(row: CoinMarketsRow): void {
  if (!row?.id) return;
  spotCache.set(row.id, {
    row,
    updatedAtMs: Date.now(),
    source: 'coingecko',
  });
}

function fmtUsd(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `$${value.toLocaleString('en-US', {
    maximumFractionDigits: value >= 100 ? 2 : 6,
  })}`;
}

function fmtUsdCompact(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return fmtUsd(value);
}

function fmtPct(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function truncate(text: string, max = 260): string {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}...`;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractDollarTicker(query: string): string | undefined {
  const match = query.match(/\$([A-Za-z][A-Za-z0-9-]{1,15})\b/);
  return match?.[1]?.toLowerCase();
}

function extractTokenHint(query: string): string | undefined {
  const words = (query.match(/[A-Za-z][A-Za-z0-9-]{1,20}/g) || [])
    .map((w) => w.toLowerCase())
    .filter((w) => !STOP_WORDS.has(w) && w.length >= 3);
  return words[0];
}

function extractChineseHint(query: string): string | undefined {
  const segs = query.match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const seg of segs) {
    let cleaned = seg.trim();
    let prev = '';
    while (cleaned && cleaned !== prev) {
      prev = cleaned;
      cleaned = cleaned.replace(ZH_NOISE_RE, '').trim();
    }
    if (cleaned.length >= 2) return cleaned;
  }
  return undefined;
}

function buildSearchCandidates(query: string): string[] {
  const out: string[] = [];
  const push = (v?: string) => {
    const s = (v || '').trim();
    if (!s) return;
    if (!out.includes(s)) out.push(s);
  };
  push(extractDollarTicker(query));
  const zh = extractChineseHint(query);
  push(zh);
  if (zh && zh.endsWith('币') && zh.length > 2) push(zh.slice(0, -1));
  push(extractTokenHint(query));
  push(query.replace(ZH_NOISE_RE, ' ').replace(/\s+/g, ' ').trim());
  return out.slice(0, 4);
}

function scoreCoinCandidate(coin: SearchCoin, term: string): number {
  const symbol = (coin.symbol || '').toLowerCase();
  const name = (coin.name || '').toLowerCase();
  const id = (coin.id || '').toLowerCase();
  const t = term.toLowerCase();
  let score = 0;

  if (symbol === t || name === t || id === t) score += 120;
  if (name.includes(t) || symbol.includes(t) || id.includes(t)) score += 70;
  if (name.startsWith(t) || symbol.startsWith(t) || id.startsWith(t)) score += 40;
  if (/[\u4e00-\u9fff]/.test(term) && coin.name?.includes(term)) score += 80;

  const rank = coin.market_cap_rank;
  if (typeof rank === 'number' && rank > 0) {
    if (rank <= 50) score += 35;
    else if (rank <= 200) score += 25;
    else if (rank <= 1000) score += 12;
  }
  return score;
}

function rankScore(rank?: number | null): number {
  if (typeof rank !== 'number' || rank <= 0) return 0;
  if (rank <= 20) return 4;
  if (rank <= 100) return 3;
  if (rank <= 400) return 2;
  return 1;
}

async function resolveAssetByExplicitTicker(ticker: string): Promise<ResolvedAsset | null> {
  const t = (ticker || '').trim().toLowerCase();
  if (!t) return null;
  try {
    const raw = (await fetchRestJson(`/search?query=${encodeURIComponent(t)}`)) as { coins?: SearchCoin[] };
    const coins = (raw.coins || []).slice(0, 50);
    const exactSymbol = coins.filter((coin) => (coin.symbol || '').toLowerCase() === t);
    if (!exactSymbol.length) return null;
    const scored = exactSymbol
      .map((coin) => {
        const id = (coin.id || '').toLowerCase();
        const name = (coin.name || '').toLowerCase();
        let score = 0;
        if (id === t || name === t) score += 120;
        if (id.includes(t) || name.includes(t)) score += 35;
        score += rankScore(coin.market_cap_rank) * 20;
        return { coin, score };
      })
      .sort((a, b) => b.score - a.score);
    const pick = scored[0]?.coin;
    if (!pick?.id) return null;
    return {
      id: pick.id,
      symbol: pick.symbol,
      name: pick.name,
      hint: `$${t}`,
      source: 'coingecko-symbol',
    };
  } catch {
    return null;
  }
}

function inferKnownAsset(query: string): ResolvedAsset | null {
  for (const asset of KNOWN_ASSET_PATTERNS) {
    if (asset.patterns.some((pattern) => pattern.test(query))) {
      return {
        id: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        source: 'quick-map',
      };
    }
  }
  return null;
}

const EVM_ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/;
const SOLANA_ADDRESS_RE = /(?:^|[^A-Za-z0-9])([1-9A-HJ-NP-Za-km-z]{43,44})(?=$|[^A-Za-z0-9])/;
const EVM_PLATFORMS = [
  'ethereum',
  'base',
  'arbitrum-one',
  'polygon-pos',
  'binance-smart-chain',
  'optimistic-ethereum',
  'avalanche',
];

function extractContractAddress(query: string): { address: string; chain: 'evm' | 'solana' } | null {
  const evm = query.match(EVM_ADDRESS_RE);
  if (evm?.[0]) return { address: evm[0], chain: 'evm' };
  const sol = query.match(SOLANA_ADDRESS_RE);
  if (sol?.[1]) return { address: sol[1], chain: 'solana' };
  return null;
}

async function resolveByContract(address: string, chain: 'evm' | 'solana'): Promise<ResolvedAsset | null> {
  const platforms = chain === 'evm' ? EVM_PLATFORMS : ['solana'];
  const normalized = chain === 'evm' ? address.toLowerCase() : address;
  for (const platform of platforms) {
    try {
      const raw = (await fetchRestJson(
        `/coins/${platform}/contract/${encodeURIComponent(normalized)}`,
      )) as { id?: string; symbol?: string; name?: string } | null;
      if (raw?.id) {
        return {
          id: raw.id,
          symbol: raw.symbol,
          name: raw.name,
          hint: `${platform}:${normalized.slice(0, 10)}…`,
          source: `coingecko-contract-${platform}`,
        };
      }
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status && status !== 404) {
        console.error(
          `[web3-cli] contract lookup non-404 error platform=${platform} status=${status} msg="${truncate(
            (err as Error)?.message || '',
            140,
          )}"`,
        );
      }
    }
  }
  return null;
}

async function resolveAsset(query: string): Promise<ResolvedAsset | null> {
  const contract = extractContractAddress(query);
  if (contract) {
    const byContract = await resolveByContract(contract.address, contract.chain);
    if (byContract) return byContract;
  }
  const explicitTicker = extractDollarTicker(query);
  if (explicitTicker) {
    const tickerResolved = await resolveAssetByExplicitTicker(explicitTicker);
    if (tickerResolved) return tickerResolved;
  }
  const hints = buildSearchCandidates(query);
  const quick = inferKnownAsset(query);
  if (quick && quick.symbol) {
    const symbolRe = new RegExp(`\\$?${escapeRegExp(quick.symbol)}\\b`, 'i');
    if (symbolRe.test(query)) {
      return { ...quick, source: 'quick-map-explicit' };
    }
  }
  if (!hints.length) return quick;

  try {
    let bestCoin: SearchCoin | null = null;
    let bestHint: string | undefined;
    let bestScore = -1;
    let secondBestScore = -1;
    for (const hint of hints) {
      const raw = (await fetchRestJson(`/search?query=${encodeURIComponent(hint)}`)) as { coins?: SearchCoin[] };
      const coins = raw.coins || [];
      for (const coin of coins.slice(0, 20)) {
        let s = scoreCoinCandidate(coin, hint);
        if (quick?.id && coin.id === quick.id) s += 260;
        if (quick?.symbol && (coin.symbol || '').toLowerCase() === quick.symbol.toLowerCase()) s += 160;
        if (s > bestScore) {
          secondBestScore = bestScore;
          bestScore = s;
          bestCoin = coin;
          bestHint = hint;
        } else if (s > secondBestScore) {
          secondBestScore = s;
        }
      }
    }
    if (!bestCoin?.id) return quick;
    const dynamicMinScore = explicitTicker ? 35 : quick ? 75 : 55;
    const minMargin = explicitTicker ? 6 : 14;
    const margin = bestScore - secondBestScore;
    const lowConfidence = bestScore < dynamicMinScore || (secondBestScore >= 0 && margin < minMargin && bestScore < 150);
    if (lowConfidence) return quick;
    return {
      id: bestCoin.id,
      symbol: bestCoin.symbol,
      name: bestCoin.name,
      hint: bestHint,
      source: 'coingecko-search',
    };
  } catch {
    return quick;
  }
}

function extractAssetTerms(query: string): string[] {
  const inferred = KNOWN_ASSET_PATTERNS
    .filter((asset) => asset.patterns.some((pattern) => pattern.test(query)))
    .map((asset) => asset.name);
  const rawWords = (query.match(/[A-Za-z][A-Za-z0-9-]{1,20}/g) || [])
    .map((w) => w.toLowerCase())
    .filter((w) => !STOP_WORDS.has(w));
  const contractTerms: string[] = [];
  const evmMatches = query.match(/\b0x[a-fA-F0-9]{40}\b/g) || [];
  contractTerms.push(...evmMatches);
  const solanaMatches = query.match(/(?:^|[^A-Za-z0-9])([1-9A-HJ-NP-Za-km-z]{43,44})(?=$|[^A-Za-z0-9])/g) || [];
  for (const raw of solanaMatches) {
    const m = raw.match(/[1-9A-HJ-NP-Za-km-z]{43,44}/);
    if (m?.[0]) contractTerms.push(m[0]);
  }
  return unique([...contractTerms, ...inferred, ...rawWords]).slice(0, 6);
}

async function resolveAssets(query: string, limit = 3): Promise<ResolvedAsset[]> {
  const terms = extractAssetTerms(query);
  const resolved: ResolvedAsset[] = [];
  for (const term of terms) {
    const asset = await resolveAsset(term);
    if (asset && !resolved.some((item) => item.id === asset.id)) {
      resolved.push(asset);
    }
    if (resolved.length >= limit) break;
  }
  if (!resolved.length) {
    const fallback = await resolveAsset(query);
    if (fallback) resolved.push(fallback);
  }
  return resolved.slice(0, limit);
}

function classifyWeb3Intent(query: string): Web3Intent {
  const lower = query.toLowerCase();
  const compareLike = /(\bvs\b|compare|comparison|对比|比较|哪个好|哪个更强)/i.test(query);
  const marketScanLike =
    /top\b|trending|gainer|loser|scan|filter|筛选|榜单|热门|涨幅|跌幅|市值.*(超过|高于)|market\s*cap.*(above|over|greater)|24\s*h|24h/i.test(
      query,
    );
  const categoryLike = /category|sector|theme|赛道|板块|生态|meme|defi|rwa|gamefi|layer\s*1|layer1|ai/i.test(lower);
  const onchainLike = /onchain|dex|pool|liquidity|geckoterminal|链上|池子|流动性|dex/i.test(lower) || /链上|池子|流动性/.test(query);
  const nftLike = /\bnft\b|floor price|floor|collection|nft地板价|nft合集/.test(lower) || /地板价|合集/.test(query);
  const resolvedTerms = extractAssetTerms(query);

  if (nftLike) return 'nft_scan';
  if (onchainLike) return 'onchain_scan';
  if (compareLike && resolvedTerms.length >= 2) return 'multi_asset_compare';
  if (marketScanLike) return categoryLike && !/24\s*h|24h|涨幅|跌幅|市值/.test(lower) ? 'category_scan' : 'market_scan';
  if (categoryLike && !resolvedTerms.length) return 'category_scan';
  if (/price|quote|spot|市值|价格|现价|多少钱|多少/.test(lower) || /市值|价格|现价|多少钱|多少/.test(query)) {
    return 'token_quote';
  }
  return 'token_deep_dive';
}

function parseUsdThreshold(query: string): number | undefined {
  const lower = query.toLowerCase();
  const english =
    lower.match(/market\s*cap[^$\d]{0,30}(?:above|over|greater than|at least|>=?)\s*\$?\s*(\d+(?:\.\d+)?)\s*(billion|bn|b|million|mn|m|thousand|k)?/i) ||
    lower.match(/over\s*\$?\s*(\d+(?:\.\d+)?)\s*(billion|bn|b|million|mn|m|thousand|k)\s*(?:market\s*cap)?/i);
  if (english) {
    const value = Number(english[1]);
    const unit = (english[2] || '').toLowerCase();
    if (unit === 'billion' || unit === 'bn' || unit === 'b') return value * 1e9;
    if (unit === 'million' || unit === 'mn' || unit === 'm') return value * 1e6;
    if (unit === 'thousand' || unit === 'k') return value * 1e3;
    return value;
  }
  const chinese = query.match(/市值[^0-9]{0,20}(?:超过|高于|不少于|至少|大于|>=?)\s*(\d+(?:\.\d+)?)\s*(亿|万)?\s*(美元|美金|刀|usd)?/i);
  if (chinese) {
    const value = Number(chinese[1]);
    const unit = chinese[2] || '';
    if (unit === '亿') return value * 1e8;
    if (unit === '万') return value * 1e4;
    return value;
  }
  const standaloneChinese = query.match(/(\d+(?:\.\d+)?)\s*亿\s*(美元|美金)/i);
  if (standaloneChinese && /市值/.test(query)) {
    return Number(standaloneChinese[1]) * 1e8;
  }
  return undefined;
}

function parsePctThreshold(query: string): number | undefined {
  const english =
    query.match(/24\s*h(?:ours?)?[^%\d]{0,30}(?:gain|change|increase|rise|up)[^%\d]{0,30}(?:above|over|at least|>=?)\s*(\d+(?:\.\d+)?)%/i) ||
    query.match(/24\s*h(?:ours?)?[^%\d]{0,30}(?:\+|>=?)\s*(\d+(?:\.\d+)?)%/i);
  if (english) return Number(english[1]);
  const chinese =
    query.match(/24\s*(?:小时|h)[^%\d]{0,24}(?:涨幅|涨跌|涨跌幅)[^%\d]{0,24}(?:至少|达到|超过|高于|不低于|>=?)?[^%\d]{0,8}(\d+(?:\.\d+)?)%/i) ||
    query.match(/过去24小时[^%\d]{0,24}(?:涨幅|涨跌幅)[^%\d]{0,24}(?:至少|达到|超过|高于|不低于|>=?)?[^%\d]{0,8}(\d+(?:\.\d+)?)%/i);
  if (chinese) return Number(chinese[1]);
  return undefined;
}

function parseTopN(query: string): number {
  const english = query.match(/\btop\s*(\d{1,2})\b/i);
  if (english) return Math.max(1, Math.min(20, Number(english[1])));
  const chinese = query.match(/前\s*(\d{1,2})\s*(个|只|种)?/);
  if (chinese) return Math.max(1, Math.min(20, Number(chinese[1])));
  return 10;
}

function buildMarketScanFilters(query: string): MarketScanFilters {
  const lower = query.toLowerCase();
  const minMarketCapUsd = parseUsdThreshold(query);
  const min24hChangePct = parsePctThreshold(query);
  const useTrendingFeed = /\btrending\b|热门|hot|热度/i.test(query) && minMarketCapUsd == null && min24hChangePct == null;
  let sort: MarketScanFilters['sort'] = 'total_volume_desc';
  if (/\bmarket\s*cap\b|市值/.test(lower)) sort = 'market_cap_desc';
  if (/涨幅|gainer|gain|涨得最多/.test(lower)) sort = 'price_change_percentage_24h_desc';
  return {
    minMarketCapUsd,
    min24hChangePct,
    topN: parseTopN(query),
    sort,
    useTrendingFeed,
  };
}

async function fetchCoinsMarkets(params: Record<string, string | number | undefined>): Promise<CoinMarketsRow[]> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  });
  const raw = (await fetchRestJson(`/coins/markets?${qs.toString()}`)) as CoinMarketsRow[];
  return Array.isArray(raw) ? raw : [];
}

async function fetchCoinDetail(geckoId: string): Promise<CoinDetail | null> {
  try {
    return (await fetchRestJson(
      `/coins/${encodeURIComponent(
        geckoId,
      )}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`,
    )) as CoinDetail;
  } catch {
    return null;
  }
}

async function fetchCoinChart(
  geckoId: string,
  days: number,
): Promise<{ prices?: number[][]; total_volumes?: number[][] } | null> {
  try {
    return (await fetchRestJson(
      `/coins/${encodeURIComponent(geckoId)}/market_chart?vs_currency=usd&days=${days}&interval=daily`,
    )) as { prices?: number[][]; total_volumes?: number[][] };
  } catch {
    return null;
  }
}

function pickChartDays(query: string): number {
  const d30 = /\b30d\b|30\s*day|30天/i.test(query);
  if (d30) return 30;
  const d14 = /\b14d\b|14\s*day|14天|两周/i.test(query);
  if (d14) return 14;
  return 7;
}

function summarizeChart(chart: { prices?: number[][]; total_volumes?: number[][] } | null): Record<string, unknown> {
  const prices = chart?.prices || [];
  if (!prices.length) return {};
  const values = prices.map((entry) => Number(entry[1])).filter((n) => Number.isFinite(n));
  if (!values.length) return {};
  const first = values[0];
  const last = values[values.length - 1];
  const changePct = first ? ((last - first) / first) * 100 : undefined;
  return {
    samples: values.length,
    startUsd: first,
    endUsd: last,
    minUsd: Math.min(...values),
    maxUsd: Math.max(...values),
    changePct,
  };
}

async function fetchTrendingMarkets(topN: number): Promise<CoinMarketsRow[]> {
  const trending = (await fetchRestJson('/search/trending')) as {
    coins?: Array<{ item?: { id?: string } }>;
  };
  const ids = unique(
    (trending.coins || [])
      .map((entry) => entry.item?.id)
      .filter((id): id is string => Boolean(id))
      .slice(0, Math.max(topN, 15)),
  );
  if (!ids.length) return [];
  return fetchCoinsMarkets({
    vs_currency: 'usd',
    ids: ids.join(','),
    order: 'market_cap_desc',
    per_page: ids.length,
    page: 1,
        sparkline: 'false',
    price_change_percentage: '24h',
  });
}

async function runMarketScan(query: string): Promise<Web3CliResult> {
  const filters = buildMarketScanFilters(query);
  const logs = [
    `intent=market_scan`,
    `filters.min_market_cap=${filters.minMarketCapUsd ?? 'n/a'}`,
    `filters.min_24h_change=${filters.min24hChangePct ?? 'n/a'}`,
    `filters.sort=${filters.sort}`,
  ];

  let rows: CoinMarketsRow[] = [];
  if (filters.useTrendingFeed) {
    rows = await fetchTrendingMarkets(filters.topN);
    logs.push(`source=trending_feed count=${rows.length}`);
  } else {
    const pages = [1, 2];
    for (const page of pages) {
      const batch = await fetchCoinsMarkets({
        vs_currency: 'usd',
        order: filters.sort === 'price_change_percentage_24h_desc' ? 'market_cap_desc' : filters.sort,
        per_page: 250,
        page,
        sparkline: 'false',
        price_change_percentage: '24h',
      });
      rows.push(...batch);
      if (rows.length >= 250 && filters.topN <= 10) break;
    }
    logs.push(`source=coins_markets scanned=${rows.length}`);
  }

  const filtered = rows.filter((row) => {
    if (filters.minMarketCapUsd != null && (row.market_cap || 0) < filters.minMarketCapUsd) return false;
    if (filters.min24hChangePct != null && (row.price_change_percentage_24h || -Infinity) < filters.min24hChangePct) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (filters.sort === 'market_cap_desc') return (b.market_cap || 0) - (a.market_cap || 0);
    if (filters.sort === 'price_change_percentage_24h_desc') {
      return (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0);
    }
    const volDelta = (b.total_volume || 0) - (a.total_volume || 0);
    return volDelta !== 0 ? volDelta : (b.market_cap || 0) - (a.market_cap || 0);
  });

  const matches = sorted.slice(0, filters.topN);
  const reportLines = [
    '## Web3 市场扫描（CoinGecko）',
    `Query: ${query}`,
    `意图: market_scan`,
    `筛选条件: 市值 >= ${fmtUsdCompact(filters.minMarketCapUsd)} | 24h 涨幅 >= ${
      filters.min24hChangePct != null ? `${filters.min24hChangePct}%` : 'n/a'
    } | 排序=${filters.sort}`,
    '',
  ];
  if (!matches.length) {
    reportLines.push('未找到满足条件的币种。');
  } else {
    matches.forEach((row, index) => {
      reportLines.push(
        `${index + 1}. ${row.name} (${row.symbol.toUpperCase()}) — 价格 ${fmtUsd(row.current_price)} | 24h ${fmtPct(
          row.price_change_percentage_24h,
        )} | 市值 ${fmtUsdCompact(row.market_cap)} | 24h 交易量 ${fmtUsdCompact(row.total_volume)}`,
      );
    });
  }

  return {
    ok: true,
    report: reportLines.join('\n'),
    intent: 'market_scan',
    via: 'rest',
    assets: matches.map((row) => ({ id: row.id, symbol: row.symbol, name: row.name })),
    market: {
      scan: {
        filters,
        matches,
        scannedCount: rows.length,
      },
    },
    discovery: {},
    onchain: {},
    nft: {},
    logs,
    missingData: matches.length ? [] : ['market_scan_no_matches'],
    resolvedId: matches[0]?.id,
    spotPriceUsd: matches[0]?.current_price,
    resolver: 'coins_markets_scan',
  };
}

async function runMultiAssetCompare(query: string): Promise<Web3CliResult> {
  const resolved = await resolveAssets(query, 4);
  const ids = resolved.map((item) => item.id).filter(Boolean);
  const rows = ids.length
    ? await fetchCoinsMarkets({
        vs_currency: 'usd',
        ids: ids.join(','),
        order: 'market_cap_desc',
        per_page: ids.length,
        page: 1,
        sparkline: 'false',
        price_change_percentage: '24h',
      })
    : [];

  const reportLines = ['## Web3 多币对比（CoinGecko）', `Query: ${query}`, ''];
  if (!rows.length) {
    reportLines.push('未解析到可对比的加密资产。');
  } else {
    rows.forEach((row, index) => {
      reportLines.push(
        `${index + 1}. ${row.name} (${row.symbol.toUpperCase()}) — 价格 ${fmtUsd(row.current_price)} | 24h ${fmtPct(
          row.price_change_percentage_24h,
        )} | 市值 ${fmtUsdCompact(row.market_cap)} | 排名 #${row.market_cap_rank || 'n/a'}`,
      );
    });
  }

  return {
    ok: true,
    report: reportLines.join('\n'),
    intent: 'multi_asset_compare',
    via: 'rest',
    assets: rows.map((row) => ({ id: row.id, symbol: row.symbol, name: row.name })),
    market: { compare: rows },
    discovery: {},
    onchain: {},
    nft: {},
    logs: [`intent=multi_asset_compare`, `resolved_assets=${resolved.map((item) => item.id).join(',') || 'none'}`],
    missingData: rows.length ? [] : ['multi_asset_compare_no_assets'],
    resolvedId: rows[0]?.id,
    spotPriceUsd: rows[0]?.current_price,
    resolver: resolved[0]?.source,
  };
}

async function runTokenQuote(query: string): Promise<Web3CliResult> {
  const resolved = await resolveAsset(query);
  if (!resolved) {
    return {
      ok: true,
      report: `## Web3 数据\n未能从查询中解析出明确币种：${query}`,
      intent: 'token_quote',
      via: 'rest',
      assets: [],
      market: {},
      discovery: {},
      onchain: {},
      nft: {},
      logs: ['intent=token_quote', 'resolver=none'],
      missingData: ['token_unresolved'],
    };
  }
  let row: CoinMarketsRow | undefined;
  const logs: string[] = [`intent=token_quote`, `resolved_id=${resolved.id}`, `resolver=${resolved.source}`];
  const missingData: string[] = [];
  let via: 'rest' | 'hybrid' = 'rest';
  let resolver = resolved.source;
  let errorMessage = '';

  try {
    const rows = await fetchCoinsMarkets({
      vs_currency: 'usd',
      ids: resolved.id,
      order: 'market_cap_desc',
      per_page: 1,
      page: 1,
      sparkline: 'false',
      price_change_percentage: '24h',
    });
    row = rows[0];
    if (row) setCachedSpotRow(row);
  } catch (e) {
    errorMessage = (e as Error).message;
    logs.push(`coingecko_error=${truncate(errorMessage, 180)}`);
    const cached = getCachedSpotRow(resolved.id);
    if (cached) {
      row = cached;
      via = 'hybrid';
      resolver = 'coingecko-cache';
      logs.push(`fallback=cache ttl_ms=${SPOT_CACHE_TTL_MS}`);
      missingData.push('coingecko_live_unavailable');
    } else {
      const fallback = await fetchExchangeFallbackSpot(resolved);
      if (fallback) {
        row = {
          id: resolved.id,
          symbol: (resolved.symbol || '').toLowerCase(),
          name: resolved.name || resolved.id,
          current_price: fallback.priceUsd,
          market_cap_rank: undefined,
        } as CoinMarketsRow;
        via = 'hybrid';
        resolver = `${fallback.source}-fallback`;
        logs.push(`fallback=${fallback.source}`);
        missingData.push('coingecko_live_unavailable', 'market_cap_missing', 'volume_missing');
      }
    }
  }

  if (!row && isRest429Error(new Error(errorMessage))) {
    missingData.push('coingecko_rate_limited');
  }

  const report = row
    ? [
        via === 'hybrid' ? '## Web3 资产快照（多源兜底）' : '## Web3 资产快照（CoinGecko）',
        `资产: ${row.name} (${row.symbol.toUpperCase()}) / ${resolved.id}`,
        `现价: ${fmtUsd(row.current_price)}`,
        `24h 涨跌: ${fmtPct(row.price_change_percentage_24h)}`,
        `市值: ${fmtUsdCompact(row.market_cap)}`,
        `24h 交易量: ${fmtUsdCompact(row.total_volume)}`,
        `排名: #${row.market_cap_rank || 'n/a'}`,
        via === 'hybrid' ? `数据说明: CoinGecko 实时接口不可用，已使用 ${resolver} 兜底。` : '',
      ].join('\n')
    : `## Web3 数据\n未获取到 ${resolved.id} 的现货快照。${errorMessage ? `\n原因: ${errorMessage}` : ''}`;

  return {
    ok: true,
    report,
    intent: 'token_quote',
    via,
    assets: row ? [{ id: row.id, symbol: row.symbol, name: row.name }] : [{ id: resolved.id, symbol: resolved.symbol, name: resolved.name }],
    market: { spot: row || {} },
    discovery: {},
    onchain: {},
    nft: {},
    logs,
    missingData: row ? missingData : [...missingData, 'spot_snapshot_missing'],
    resolvedId: resolved.id,
    spotPriceUsd: row?.current_price,
    resolver,
  };
}

async function runTokenDeepDive(query: string): Promise<Web3CliResult> {
  const resolved = await resolveAsset(query);
  if (!resolved) {
    return {
      ok: true,
      report: `## Web3 数据\n未能从查询中解析出明确币种：${query}`,
      intent: 'token_deep_dive',
      via: 'rest',
      assets: [],
      market: {},
      discovery: {},
      onchain: {},
      nft: {},
      logs: ['intent=token_deep_dive', 'resolver=none'],
      missingData: ['token_unresolved'],
    };
  }

  const days = pickChartDays(query);
  let rows: CoinMarketsRow[] = [];
  const deepDiveLogs: string[] = [];
  let deepDiveVia: 'rest' | 'hybrid' = 'rest';
  let deepDiveResolver = resolved.source;
  try {
    rows = await fetchCoinsMarkets({
      vs_currency: 'usd',
      ids: resolved.id,
      order: 'market_cap_desc',
      per_page: 1,
      page: 1,
      sparkline: 'false',
      price_change_percentage: '24h',
    });
    if (rows[0]) setCachedSpotRow(rows[0]);
  } catch (e) {
    const msg = (e as Error).message;
    deepDiveLogs.push(`coingecko_spot_error=${truncate(msg, 180)}`);
    const cached = getCachedSpotRow(resolved.id);
    if (cached) {
      rows = [cached];
      deepDiveVia = 'hybrid';
      deepDiveResolver = 'coingecko-cache';
      deepDiveLogs.push('fallback=cache');
    } else {
      const fallback = await fetchExchangeFallbackSpot(resolved);
      if (fallback) {
        rows = [
          {
            id: resolved.id,
            symbol: (resolved.symbol || '').toLowerCase(),
            name: resolved.name || resolved.id,
            current_price: fallback.priceUsd,
          } as CoinMarketsRow,
        ];
        deepDiveVia = 'hybrid';
        deepDiveResolver = `${fallback.source}-fallback`;
        deepDiveLogs.push(`fallback=${fallback.source}`);
      }
    }
  }
  const [detail, chart] = await Promise.all([fetchCoinDetail(resolved.id), fetchCoinChart(resolved.id, days)]);

  const row = rows[0];
  const chartSummary = summarizeChart(chart);
  const homepage = detail?.links?.homepage?.find((link) => typeof link === 'string' && link.trim()) || '';
  const description = truncate(detail?.description?.en || '', 280);

  const reportLines = [
    deepDiveVia === 'hybrid' ? '## Web3 深度快照（多源兜底）' : '## Web3 深度快照（CoinGecko）',
    `资产: ${(row?.name || detail?.name || resolved.name || resolved.id) ?? resolved.id} (${(
      row?.symbol ||
      detail?.symbol ||
      resolved.symbol ||
      ''
    ).toUpperCase()}) / ${resolved.id}`,
    `现价: ${fmtUsd(row?.current_price)}`,
    `24h 涨跌: ${fmtPct(row?.price_change_percentage_24h)}`,
    `市值: ${fmtUsdCompact(row?.market_cap)}`,
    `24h 交易量: ${fmtUsdCompact(row?.total_volume)}`,
    `排名: #${row?.market_cap_rank || detail?.market_cap_rank || 'n/a'}`,
  ];
  if (deepDiveVia === 'hybrid') {
    reportLines.push(`数据说明: CoinGecko 实时接口不可用，已使用 ${deepDiveResolver} 兜底现价。`);
  }
  if (Object.keys(chartSummary).length) {
    reportLines.push(
      `${days}d 区间: ${fmtUsd(chartSummary.minUsd as number)} -> ${fmtUsd(chartSummary.maxUsd as number)} | 期间涨跌 ${fmtPct(
        chartSummary.changePct as number,
      )}`,
    );
  }
  if (detail?.categories?.length) {
    reportLines.push(`分类: ${detail.categories.slice(0, 5).join(', ')}`);
  }
  if (detail?.links?.twitter_screen_name) {
    reportLines.push(`Twitter/X: @${detail.links.twitter_screen_name}`);
  }
  if (homepage) {
    reportLines.push(`官网: ${homepage}`);
  }
  if (description) {
    reportLines.push(`简介: ${description}`);
  }

  const missingData: string[] = [];
  if (!row) missingData.push('spot_snapshot_missing');
  if (!detail) missingData.push('coin_detail_missing');
  if (!Object.keys(chartSummary).length) missingData.push('chart_missing');

  return {
    ok: true,
    report: reportLines.join('\n'),
    intent: 'token_deep_dive',
    via: deepDiveVia,
    assets: [{ id: resolved.id, symbol: row?.symbol || resolved.symbol, name: row?.name || resolved.name }],
    market: {
      spot: row || {},
      detail: detail || {},
      history: chartSummary,
    },
    discovery: {},
    onchain: {},
    nft: {},
    logs: [
      `intent=token_deep_dive`,
      `resolved_id=${resolved.id}`,
      `resolver=${resolved.source}`,
      `history_days=${days}`,
      ...deepDiveLogs,
    ],
    missingData,
    resolvedId: resolved.id,
    spotPriceUsd: row?.current_price,
    resolver: deepDiveResolver,
  };
}

async function resolveCategoryId(query: string): Promise<{ categoryId: string; name: string } | null> {
  const raw = (await fetchRestJson('/coins/categories/list')) as Array<{ category_id?: string; name?: string }>;
  const categories = Array.isArray(raw) ? raw : [];
  const terms =
    KNOWN_CATEGORY_HINTS.find((entry) => entry.keywords.some((keyword) => keyword.test(query)))?.preferredTerms ||
    (query.match(/[A-Za-z][A-Za-z0-9-]{1,20}/g) || []).map((term) => term.toLowerCase());
  let best: { categoryId: string; name: string; score: number } | null = null;
  for (const cat of categories) {
    const hay = `${cat.category_id || ''} ${cat.name || ''}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (!term || STOP_WORDS.has(term)) continue;
      if (hay === term) score += 120;
      else if (hay.includes(term)) score += 40;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = {
        categoryId: cat.category_id || '',
        name: cat.name || cat.category_id || '',
        score,
      };
    }
  }
  return best?.categoryId ? { categoryId: best.categoryId, name: best.name } : null;
}

async function runCategoryScan(query: string): Promise<Web3CliResult> {
  const resolvedCategory = await resolveCategoryId(query);
  if (!resolvedCategory) {
    return {
      ok: true,
      report: `## Web3 分类扫描\n未能从查询中识别出明确赛道：${query}`,
      intent: 'category_scan',
      via: 'rest',
      assets: [],
      market: {},
      discovery: {},
      onchain: {},
      nft: {},
      logs: ['intent=category_scan', 'category=none'],
      missingData: ['category_unresolved'],
    };
  }

  const rows = await fetchCoinsMarkets({
    vs_currency: 'usd',
    category: resolvedCategory.categoryId,
    order: 'market_cap_desc',
    per_page: parseTopN(query),
    page: 1,
    sparkline: 'false',
    price_change_percentage: '24h',
  });

  const reportLines = [
    '## Web3 分类扫描（CoinGecko）',
    `Query: ${query}`,
    `分类: ${resolvedCategory.name} (${resolvedCategory.categoryId})`,
    '',
  ];
  if (!rows.length) {
    reportLines.push('该分类下未获取到币种列表。');
  } else {
    rows.forEach((row, index) => {
      reportLines.push(
        `${index + 1}. ${row.name} (${row.symbol.toUpperCase()}) — 价格 ${fmtUsd(row.current_price)} | 24h ${fmtPct(
          row.price_change_percentage_24h,
        )} | 市值 ${fmtUsdCompact(row.market_cap)}`,
      );
    });
  }

  return {
    ok: true,
    report: reportLines.join('\n'),
    intent: 'category_scan',
    via: 'rest',
    assets: rows.map((row) => ({ id: row.id, symbol: row.symbol, name: row.name })),
    market: { category: rows },
    discovery: { category: resolvedCategory },
    onchain: {},
    nft: {},
    logs: [`intent=category_scan`, `category=${resolvedCategory.categoryId}`, `count=${rows.length}`],
    missingData: rows.length ? [] : ['category_empty'],
    resolvedId: rows[0]?.id,
    spotPriceUsd: rows[0]?.current_price,
    resolver: 'category_scan',
  };
}

function scoreTool(name: string, desc: string): number {
  const t = `${name} ${desc || ''}`.toLowerCase();
  let s = 0;
  if (/price|simple|quote|spot/.test(t)) s += 5;
  if (/coin|token|asset/.test(t)) s += 3;
  if (/market|trend|search|lookup|id/.test(t)) s += 2;
  if (/gecko|terminal|pool|dex|nft|category|history|ohlc|chart/.test(t)) s += 1;
  return s;
}

function isOnchainLikeTool(name: string, desc: string): boolean {
  const t = `${name} ${desc || ''}`.toLowerCase();
  return /(onchain|dex|pool|liquidity|geckoterminal|terminal|trade|volume|ohlc|ticker|network)/.test(t);
}

function scoreToolForIntent(name: string, desc: string, intent: Web3Intent): number {
  const t = `${name} ${desc || ''}`.toLowerCase();
  let s = scoreTool(name, desc);
  if (intent === 'onchain_scan') {
    if (isOnchainLikeTool(name, desc)) s += 12;
    if (/search|lookup|get_id|id_coins|simple price|coin list/.test(t)) s -= 6;
  }
  if (intent === 'nft_scan') {
    if (/nft|collection|floor/.test(t)) s += 12;
    if (/search|lookup|get_id|id_coins/.test(t)) s -= 4;
  }
  return s;
}

function buildToolArgs(tool: McpTool, query: string, geckoId?: string): Record<string, unknown> {
  const props = tool.inputSchema?.properties ?? {};
  const keys = Object.keys(props);
  const args: Record<string, unknown> = {};
  const q = query.trim();
  if (keys.includes('query')) args.query = q;
  else if (keys.includes('q')) args.q = q;
  else if (geckoId && keys.includes('ids')) args.ids = geckoId;
  else if (geckoId && keys.includes('id')) args.id = geckoId;
  else if (geckoId && keys.includes('coin_id')) args.coin_id = geckoId;
  else if (keys.includes('vs_currency')) {
    args.vs_currency = 'usd';
    if (geckoId && keys.includes('ids')) args.ids = geckoId;
  }
  if (Object.keys(args).length === 0 && keys.length) {
    const first = keys[0];
    args[first] = geckoId || q;
  }
  return args;
}

function formatHistoryDate(date = new Date()): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}-${m}-${y}`;
}

function resolvePrimaryContract(detail: CoinDetail | null): { network?: string; address?: string } {
  if (!detail) return {};
  const platforms = detail.platforms || {};
  const detailPlatforms = detail.detail_platforms || {};
  const preferred = ['ethereum', 'base', 'binance-smart-chain'];
  const allNetworks = [...preferred, ...Object.keys(platforms), ...Object.keys(detailPlatforms)];
  for (const network of unique(allNetworks)) {
    const fromDetail = detailPlatforms[network]?.contract_address;
    const fromPlatforms = platforms[network];
    const address = (fromDetail || fromPlatforms || '').trim();
    if (address) return { network, address };
  }
  return {};
}

function injectOnchainArgs(
  args: Record<string, unknown>,
  tool: McpTool,
  detail: CoinDetail | null,
  geckoId?: string,
): Record<string, unknown> {
  const out = { ...args };
  const props = tool.inputSchema?.properties ?? {};
  const keys = Object.keys(props);
  const nowSec = Math.floor(Date.now() / 1000);
  const weekAgoSec = nowSec - 7 * 24 * 3600;
  const historyDate = formatHistoryDate();
  const { network, address } = resolvePrimaryContract(detail);

  if (geckoId) {
    if (keys.includes('id') && out.id == null) out.id = geckoId;
    if (keys.includes('coin_id') && out.coin_id == null) out.coin_id = geckoId;
    if (keys.includes('ids') && out.ids == null) out.ids = geckoId;
  }
  if (address) {
    if (keys.includes('contract_address') && out.contract_address == null) out.contract_address = address;
    if (keys.includes('address') && out.address == null) out.address = address;
    if (keys.includes('token_address') && out.token_address == null) out.token_address = address;
  }
  if (network) {
    if (keys.includes('network') && out.network == null) out.network = network;
    if (keys.includes('chain') && out.chain == null) out.chain = network;
    if (keys.includes('network_id') && out.network_id == null) out.network_id = network;
  }
  if (keys.includes('date') && out.date == null) out.date = historyDate;
  if (keys.includes('from') && out.from == null) out.from = weekAgoSec;
  if (keys.includes('to') && out.to == null) out.to = nowSec;
  if (keys.includes('from_timestamp') && out.from_timestamp == null) out.from_timestamp = weekAgoSec;
  if (keys.includes('to_timestamp') && out.to_timestamp == null) out.to_timestamp = nowSec;
  if (keys.includes('days') && out.days == null) out.days = 7;
  if (keys.includes('interval') && out.interval == null) out.interval = 'daily';
  if (keys.includes('vs_currency') && out.vs_currency == null) out.vs_currency = 'usd';
  return out;
}

async function loadToolCatalog(client: Client): Promise<McpTool[]> {
  const now = Date.now();
  if (toolCatalogCache && now - toolCatalogCache.fetchedAt < TOOL_CACHE_TTL_MS) {
    return toolCatalogCache.tools;
  }
  const { tools } = await client.listTools();
  toolCatalogCache = {
    fetchedAt: now,
    tools: (tools || []) as McpTool[],
  };
  return toolCatalogCache.tools;
}

function pickTool(
  tools: McpTool[],
  intent: Web3Intent,
  query: string,
  geckoId?: string,
): { name: string; args: Record<string, unknown> } | null {
  if (!tools.length) return null;
  const ranked = [...tools].sort(
    (a, b) => scoreToolForIntent(b.name, b.description ?? '', intent) - scoreToolForIntent(a.name, a.description ?? '', intent),
  );
  const best = ranked[0];
  if (!best) return null;
  const args = buildToolArgs(best, query, geckoId);
  return { name: best.name, args };
}

function pickToolBatch(
  tools: McpTool[],
  intent: Web3Intent,
  query: string,
  geckoId?: string,
): Array<{ name: string; args: Record<string, unknown>; onchainLike: boolean }> {
  if (!tools.length) return [];
  const ranked = [...tools].sort(
    (a, b) => scoreToolForIntent(b.name, b.description ?? '', intent) - scoreToolForIntent(a.name, a.description ?? '', intent),
  );
  const max = intent === 'onchain_scan' ? 4 : intent === 'nft_scan' ? 3 : 1;
  return ranked.slice(0, max).map((tool) => ({
    name: tool.name,
    args: buildToolArgs(tool, query, geckoId),
    onchainLike: isOnchainLikeTool(tool.name, tool.description ?? ''),
  }));
}

function formatToolResult(result: { content?: { type: string; text?: string }[]; isError?: boolean }): string {
  const parts: string[] = [];
  if (result.isError) parts.push('(tool returned isError)');
  for (const c of result.content ?? []) {
    if (c.type === 'text' && c.text) parts.push(c.text);
  }
  const body = parts.join('\n\n').trim();
  return body || JSON.stringify(result, null, 2);
}

async function runLegacyMcpQuery(query: string, intent: Web3Intent): Promise<Web3CliResult> {
  const usePro = Boolean(process.env.COINGECKO_PRO_API_KEY);
  const base = (process.env.COINGECKO_MCP_URL || (usePro ? PRO_MCP : PUBLIC_MCP)).trim();
  const url = new URL(base);
  const resolved = await resolveAsset(query);
  const headers: Record<string, string> = { Accept: 'application/json, text/event-stream' };
  if (usePro && process.env.COINGECKO_PRO_API_KEY) {
    headers.Authorization = `Bearer ${process.env.COINGECKO_PRO_API_KEY}`;
  }

  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers },
  });
  const client = new Client({ name: 'loka-web3', version: '0.2.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
    const tools = await loadToolCatalog(client);
    const coreSpot = resolved ? await runTokenQuote(query) : null;
    const coinDetail = intent === 'onchain_scan' && resolved?.id ? await fetchCoinDetail(resolved.id) : null;
    const picks = pickToolBatch(tools, intent, query, resolved?.id);
    const pick = picks[0] || pickTool(tools, intent, query, resolved?.id);
    if (!pick) {
      throw new Error('no_suitable_tool');
    }
    const chunks: string[] = [];
    const successfulTools: string[] = [];
    const attemptedTools: string[] = [];
    let gotOnchainLike = false;
    for (const item of picks.length ? picks : [{ ...pick, onchainLike: false }]) {
      try {
        attemptedTools.push(item.name);
        const toolMeta = tools.find((t) => t.name === item.name);
        const enrichedArgs =
          intent === 'onchain_scan' && toolMeta ? injectOnchainArgs(item.args, toolMeta, coinDetail, resolved?.id) : item.args;
        const outTyped = (await client.callTool({ name: item.name, arguments: enrichedArgs })) as {
          content?: { type: string; text?: string }[];
          isError?: boolean;
        };
        let text = formatToolResult(outTyped);
        if (!text) continue;
        if (text.length > 8_000) {
          text = `${text.slice(0, 8_000)}\n\n...(truncated)`;
        }
        chunks.push(`### MCP Tool: ${item.name}\n参数: ${JSON.stringify(enrichedArgs)}\n\n${text}`);
        if (!outTyped.isError) {
          successfulTools.push(item.name);
          if (item.onchainLike) gotOnchainLike = true;
        }
      } catch (err) {
        chunks.push(`### MCP Tool: ${item.name}\n调用失败: ${(err as Error).message}`);
      }
    }
    let text = chunks.join('\n\n');
    if (text.length > 16_000) {
      text = `${text.slice(0, 16_000)}\n\n...(truncated for downstream synthesis)`;
    }
    const reportSections: string[] = [];
    if (coreSpot) {
      reportSections.push('## 资产现货快照（强制）');
      reportSections.push(coreSpot.report);
    }
    reportSections.push(`## Web3 专项数据（CoinGecko MCP）\n意图: ${intent}\n工具数: ${successfulTools.length || 0}`);
    reportSections.push(text || 'MCP未返回可读内容。');
    const missingData = [...(coreSpot?.missingData || [])];
    if (intent === 'onchain_scan' && !gotOnchainLike) {
      missingData.push('onchain_metrics_unavailable');
    }
    return {
      ok: true,
      report: reportSections.join('\n\n'),
      intent,
      via: coreSpot ? 'hybrid' : 'mcp',
      resolvedId: coreSpot?.resolvedId || resolved?.id,
      spotPriceUsd: coreSpot?.spotPriceUsd,
      resolver: coreSpot?.resolver || resolved?.source,
      assets: coreSpot?.assets?.length
        ? coreSpot.assets
        : resolved
          ? [{ id: resolved.id, symbol: resolved.symbol, name: resolved.name }]
          : [],
      market: coreSpot ? { spot: coreSpot.market?.spot || {} } : {},
      discovery: {},
      onchain: intent === 'onchain_scan' ? { tools: successfulTools } : {},
      nft: intent === 'nft_scan' ? { tools: successfulTools } : {},
      logs: [
        `intent=${intent}`,
        `mcp_tools_success=${successfulTools.join(',') || 'none'}`,
        `mcp_tools_attempted=${attemptedTools.join(',') || 'none'}`,
        `tool_catalog_size=${tools.length}`,
        ...(coreSpot ? ['forced_market_snapshot=true'] : []),
      ],
      missingData,
    };
  } catch (e) {
      return {
        ok: true,
      report: `## Web3 数据\nCoinGecko MCP 调用失败（${(e as Error).message}）。`,
      intent,
        via: 'rest',
      resolvedId: resolved?.id,
      spotPriceUsd: undefined,
      resolver: resolved?.source,
      assets: resolved ? [{ id: resolved.id, symbol: resolved.symbol, name: resolved.name }] : [],
      market: {},
      discovery: {},
      onchain: {},
      nft: {},
      logs: [`intent=${intent}`, `mcp_error=${(e as Error).message}`],
      missingData: ['mcp_query_failed'],
    };
  } finally {
    try {
      await transport.close();
    } catch {
      /* ignore */
    }
  }
}

async function runWeb3Pipeline(query: string): Promise<Web3CliResult> {
  const intent = classifyWeb3Intent(query);
  console.error(`[web3-cli] intent=${intent} query="${truncate(query, 140)}"`);
  if (intent === 'market_scan') return runMarketScan(query);
  if (intent === 'multi_asset_compare') return runMultiAssetCompare(query);
  if (intent === 'category_scan') return runCategoryScan(query);
  if (intent === 'token_quote') {
    const deepDive = await runTokenDeepDive(query);
    return {
      ...deepDive,
      logs: [...deepDive.logs, 'upgraded_from=token_quote'],
    };
  }
  if (intent === 'token_deep_dive') return runTokenDeepDive(query);
  return runLegacyMcpQuery(query, intent);
}

async function main() {
  initProxyFromEnv();
  const query = getArgQuery();
  if (!query) {
    console.log(JSON.stringify({ ok: false, error: 'missing_query', report: '' }));
    process.exit(1);
  }
  try {
    const result = await runWeb3Pipeline(query);
    console.log(JSON.stringify(result));
  } catch (e) {
    console.error(`[web3-cli] fatal error: ${(e as Error).message}`);
    console.log(
      JSON.stringify({
        ok: false,
        error: (e as Error).message,
        report: '',
      }),
    );
    process.exit(1);
  }
}

main();
