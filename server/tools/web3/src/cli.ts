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

// ─── LLM Agent config ────────────────────────────────────────────────────────
const LLM_BASE_URL = (process.env.LOKA_AI_BASE_URL || '').replace(/\/$/, '').replace(/\/chat\/completions$/, '');
const LLM_API_KEY = process.env.LOKA_AI_API_KEY || '';
const LLM_WEB3_MODEL = (process.env.LOKA_AI_WEB3_MODEL || process.env.LOKA_AI_MODEL || 'deepseek-v3').trim();
const AGENT_MAX_TURNS = Math.max(2, Number(process.env.WEB3_AGENT_MAX_TURNS || '6'));

type Web3Intent =
  | 'token_quote'
  | 'token_deep_dive'
  | 'multi_asset_compare'
  | 'market_scan'
  | 'category_scan'
  | 'onchain_scan'
  | 'nft_scan'
  | 'global_scan'
  | 'treasury_scan'
  | 'exchange_scan';

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
  image?: { thumb?: string; small?: string; large?: string };
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
    whitepaper?: string;
    twitter_screen_name?: string;
    subreddit_url?: string;
    telegram_channel_identifier?: string;
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
  market_data?: {
    current_price?: { usd?: number };
    market_cap?: { usd?: number };
    fully_diluted_valuation?: { usd?: number };
    total_volume?: { usd?: number };
    high_24h?: { usd?: number };
    low_24h?: { usd?: number };
    price_change_percentage_24h?: number;
    price_change_percentage_7d?: number;
    price_change_percentage_30d?: number;
    price_change_percentage_1y?: number;
    ath?: { usd?: number };
    ath_change_percentage?: { usd?: number };
    ath_date?: { usd?: string };
    atl?: { usd?: number };
    atl_change_percentage?: { usd?: number };
    atl_date?: { usd?: string };
    circulating_supply?: number;
    total_supply?: number | null;
    max_supply?: number | null;
  };
  community_data?: {
    twitter_followers?: number | null;
    reddit_subscribers?: number | null;
    reddit_average_posts_48h?: number | null;
    reddit_average_comments_48h?: number | null;
    telegram_channel_user_count?: number | null;
  };
  developer_data?: {
    forks?: number | null;
    stars?: number | null;
    subscribers?: number | null;
    total_issues?: number | null;
    closed_issues?: number | null;
    pull_requests_merged?: number | null;
    pull_request_contributors?: number | null;
    commit_count_4_weeks?: number | null;
  };
  tickers?: Array<{
    base?: string;
    target?: string;
    market?: { name?: string; identifier?: string };
    converted_volume?: { usd?: number };
    trust_score?: string;
    bid_ask_spread_percentage?: number;
  }>;
};

/** Compact, card-ready snapshot extracted from CoinDetail + market row. */
type TokenSnapshot = {
  id: string;
  symbol: string;
  name: string;
  imageUrl?: string;
  rank?: number;
  categories?: string[];
  description?: string;
  homepage?: string;
  whitepaper?: string;
  twitter?: string;
  telegram?: string;
  reddit?: string;
  github?: string;
  contract?: { chain: string; address: string };
  market: {
    priceUsd?: number;
    change24hPct?: number;
    change7dPct?: number;
    change30dPct?: number;
    change1yPct?: number;
    marketCapUsd?: number;
    fdvUsd?: number;
    fdvOverMcap?: number;
    volume24hUsd?: number;
    high24hUsd?: number;
    low24hUsd?: number;
    athUsd?: number;
    athChangePct?: number;
    athDate?: string;
    atlUsd?: number;
    atlChangePct?: number;
    atlDate?: string;
    circulatingSupply?: number;
    totalSupply?: number;
    maxSupply?: number;
    circulatingPctOfMax?: number;
  };
  community: {
    twitterFollowers?: number;
    redditSubscribers?: number;
    telegramUsers?: number;
    sentimentUpPct?: number;
    sentimentDownPct?: number;
  };
  developer: {
    githubStars?: number;
    githubForks?: number;
    commits4w?: number;
    contributors?: number;
    pullRequestsMerged?: number;
    issuesOpenPct?: number;
  };
  topExchanges?: Array<{
    name: string;
    pair: string;
    volumeUsd?: number;
    trustScore?: string;
    spreadPct?: number;
  }>;
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
  /** Compact card-ready snapshot for the primary token (single-token intents). */
  tokenSnapshot?: TokenSnapshot;
};

type SpotCacheEntry = {
  row: CoinMarketsRow;
  updatedAtMs: number;
  source: 'coingecko' | 'cache' | 'binance' | 'okx';
};

// ─── New endpoint types ──────────────────────────────────────────────────────

type GlobalMarketData = {
  active_cryptocurrencies?: number;
  total_market_cap?: { usd?: number };
  total_volume?: { usd?: number };
  market_cap_percentage?: Record<string, number>;
  market_cap_change_percentage_24h_usd?: number;
};

// [timestamp, open, high, low, close]
type OhlcRow = [number, number, number, number, number];

type NftDetail = {
  id?: string;
  name?: string;
  symbol?: string;
  asset_platform_id?: string;
  contract_address?: string;
  total_supply?: number;
  number_of_unique_addresses?: number;
  floor_price?: { usd?: number };
  market_cap?: { usd?: number };
  volume_24h?: { usd?: number };
  floor_price_24h_percentage_change?: { usd?: number };
  one_day_sales?: number;
  ath?: { usd?: number };
};

type ExchangeEntry = {
  id?: string;
  name?: string;
  country?: string;
  trust_score?: number;
  trust_score_rank?: number;
  trade_volume_24h_btc?: number;
};

type TreasuryCompany = {
  name?: string;
  country?: string;
  total_holdings?: number;
  total_current_value_usd?: number;
};

type TreasuryData = {
  total_holdings?: number;
  total_value_usd?: number;
  market_cap_dominance?: number;
  companies?: TreasuryCompany[];
};

type OnchainPool = {
  id?: string;
  attributes?: {
    name?: string;
    base_token_price_usd?: string;
    volume_usd?: { h24?: string };
    reserve_in_usd?: string;
    price_change_percentage?: { h24?: string };
  };
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
      )}?localization=false&tickers=true&market_data=true&community_data=true&developer_data=true&sparkline=false`,
    )) as CoinDetail;
  } catch {
    return null;
  }
}

/** Pick the primary contract address (Ethereum-first, fall back to first available). */
function pickPrimaryContract(detail: CoinDetail | null): { chain: string; address: string } | undefined {
  if (!detail?.platforms) return undefined;
  const entries = Object.entries(detail.platforms).filter(([k, v]) => k && v);
  if (!entries.length) return undefined;
  const preferOrder = ['ethereum', 'solana', 'binance-smart-chain', 'arbitrum-one', 'base', 'polygon-pos'];
  for (const pref of preferOrder) {
    const hit = entries.find(([k]) => k === pref);
    if (hit) return { chain: hit[0], address: hit[1] };
  }
  return { chain: entries[0][0], address: entries[0][1] };
}

/** Build a compact, card-ready snapshot from CoinDetail (+ optional spot row). */
function buildTokenSnapshot(detail: CoinDetail | null, fallbackRow?: CoinMarketsRow): TokenSnapshot | undefined {
  if (!detail || !detail.id) {
    if (!fallbackRow?.id) return undefined;
    return {
      id: fallbackRow.id,
      symbol: (fallbackRow.symbol || '').toUpperCase(),
      name: fallbackRow.name || fallbackRow.id,
      imageUrl: fallbackRow.image,
      rank: fallbackRow.market_cap_rank,
      market: {
        priceUsd: fallbackRow.current_price,
        change24hPct: fallbackRow.price_change_percentage_24h ?? undefined,
        marketCapUsd: fallbackRow.market_cap,
        fdvUsd: fallbackRow.fully_diluted_valuation ?? undefined,
        volume24hUsd: fallbackRow.total_volume,
        high24hUsd: fallbackRow.high_24h,
        low24hUsd: fallbackRow.low_24h,
        athUsd: fallbackRow.ath,
        atlUsd: fallbackRow.atl,
        circulatingSupply: fallbackRow.circulating_supply,
        totalSupply: fallbackRow.total_supply ?? undefined,
        maxSupply: fallbackRow.max_supply ?? undefined,
      },
      community: {},
      developer: {},
    };
  }

  const md = detail.market_data || {};
  const cd = detail.community_data || {};
  const dd = detail.developer_data || {};
  const links = detail.links || {};

  const mcap = md.market_cap?.usd ?? fallbackRow?.market_cap;
  const fdv = md.fully_diluted_valuation?.usd ?? fallbackRow?.fully_diluted_valuation ?? undefined;
  const fdvOverMcap = fdv && mcap ? fdv / mcap : undefined;
  const circ = md.circulating_supply ?? fallbackRow?.circulating_supply;
  const max = md.max_supply ?? fallbackRow?.max_supply ?? undefined;
  const circPct = circ != null && max ? (circ / max) * 100 : undefined;

  const desc = (detail.description?.en || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const tickersTop = (detail.tickers || [])
    .filter((t) => t.converted_volume?.usd != null)
    .sort((a, b) => (b.converted_volume?.usd || 0) - (a.converted_volume?.usd || 0))
    .slice(0, 5)
    .map((t) => ({
      name: t.market?.name || t.market?.identifier || 'unknown',
      pair: `${(t.base || '').toUpperCase()}/${(t.target || '').toUpperCase()}`,
      volumeUsd: t.converted_volume?.usd,
      trustScore: t.trust_score,
      spreadPct: t.bid_ask_spread_percentage,
    }));

  const totalIssues = dd.total_issues ?? undefined;
  const closedIssues = dd.closed_issues ?? undefined;
  const issuesOpenPct =
    totalIssues != null && totalIssues > 0 && closedIssues != null
      ? ((totalIssues - closedIssues) / totalIssues) * 100
      : undefined;

  return {
    id: detail.id,
    symbol: (detail.symbol || '').toUpperCase(),
    name: detail.name || detail.id,
    imageUrl: detail.image?.large || detail.image?.small || detail.image?.thumb || fallbackRow?.image,
    rank: detail.market_cap_rank ?? fallbackRow?.market_cap_rank ?? undefined,
    categories: (detail.categories || []).filter(Boolean).slice(0, 6),
    description: desc ? desc.slice(0, 500) : undefined,
    homepage: (links.homepage || []).find((u) => u && u.trim()) || undefined,
    whitepaper: links.whitepaper || undefined,
    twitter: links.twitter_screen_name || undefined,
    telegram: links.telegram_channel_identifier || undefined,
    reddit: links.subreddit_url || undefined,
    github: (links.repos_url?.github || []).find((u) => u && u.trim()) || undefined,
    contract: pickPrimaryContract(detail),
    market: {
      priceUsd: md.current_price?.usd ?? fallbackRow?.current_price,
      change24hPct: md.price_change_percentage_24h ?? fallbackRow?.price_change_percentage_24h ?? undefined,
      change7dPct: md.price_change_percentage_7d ?? undefined,
      change30dPct: md.price_change_percentage_30d ?? undefined,
      change1yPct: md.price_change_percentage_1y ?? undefined,
      marketCapUsd: mcap,
      fdvUsd: fdv,
      fdvOverMcap,
      volume24hUsd: md.total_volume?.usd ?? fallbackRow?.total_volume,
      high24hUsd: md.high_24h?.usd ?? fallbackRow?.high_24h,
      low24hUsd: md.low_24h?.usd ?? fallbackRow?.low_24h,
      athUsd: md.ath?.usd ?? fallbackRow?.ath,
      athChangePct: md.ath_change_percentage?.usd ?? undefined,
      athDate: md.ath_date?.usd,
      atlUsd: md.atl?.usd ?? fallbackRow?.atl,
      atlChangePct: md.atl_change_percentage?.usd ?? undefined,
      atlDate: md.atl_date?.usd,
      circulatingSupply: circ,
      totalSupply: md.total_supply ?? fallbackRow?.total_supply ?? undefined,
      maxSupply: max,
      circulatingPctOfMax: circPct,
    },
    community: {
      twitterFollowers: cd.twitter_followers ?? undefined,
      redditSubscribers: cd.reddit_subscribers ?? undefined,
      telegramUsers: cd.telegram_channel_user_count ?? undefined,
      sentimentUpPct: detail.sentiment_votes_up_percentage ?? undefined,
      sentimentDownPct: detail.sentiment_votes_down_percentage ?? undefined,
    },
    developer: {
      githubStars: dd.stars ?? undefined,
      githubForks: dd.forks ?? undefined,
      commits4w: dd.commit_count_4_weeks ?? undefined,
      contributors: dd.pull_request_contributors ?? undefined,
      pullRequestsMerged: dd.pull_requests_merged ?? undefined,
      issuesOpenPct,
    },
    topExchanges: tickersTop.length ? tickersTop : undefined,
  };
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

// ─── New fetch helpers ───────────────────────────────────────────────────────

async function fetchGlobalData(): Promise<GlobalMarketData | null> {
  try {
    const raw = (await fetchRestJson('/global')) as { data?: GlobalMarketData };
    return raw?.data ?? null;
  } catch { return null; }
}

async function fetchOhlcData(geckoId: string, days: number): Promise<OhlcRow[]> {
  try {
    const raw = await fetchRestJson(`/coins/${encodeURIComponent(geckoId)}/ohlc?vs_currency=usd&days=${days}`);
    return Array.isArray(raw) ? (raw as OhlcRow[]) : [];
  } catch { return []; }
}

async function searchNftId(query: string): Promise<string | null> {
  try {
    const raw = (await fetchRestJson(`/search?query=${encodeURIComponent(query)}`)) as {
      nfts?: Array<{ id?: string; name?: string }>;
    };
    return raw?.nfts?.[0]?.id ?? null;
  } catch { return null; }
}

async function fetchNftDetail(nftId: string): Promise<NftDetail | null> {
  try {
    return (await fetchRestJson(`/nfts/${encodeURIComponent(nftId)}`)) as NftDetail;
  } catch { return null; }
}

async function fetchExchanges(limit = 10): Promise<ExchangeEntry[]> {
  try {
    const raw = await fetchRestJson(`/exchanges?per_page=${limit}&page=1`);
    return Array.isArray(raw) ? (raw as ExchangeEntry[]) : [];
  } catch { return []; }
}

async function fetchTreasuryHoldings(coinId: 'bitcoin' | 'ethereum'): Promise<TreasuryData | null> {
  try {
    return (await fetchRestJson(`/companies/public_treasury/${coinId}`)) as TreasuryData;
  } catch { return null; }
}

async function fetchOnchainTopPools(network: string, limit = 5): Promise<OnchainPool[]> {
  try {
    const raw = (await fetchRestJson(`/onchain/networks/${encodeURIComponent(network)}/pools?page=1`)) as { data?: OnchainPool[] };
    return (raw?.data ?? []).slice(0, limit);
  } catch { return []; }
}

async function fetchOnchainTokenPools(network: string, tokenAddress: string, limit = 5): Promise<OnchainPool[]> {
  try {
    const raw = (await fetchRestJson(
      `/onchain/networks/${encodeURIComponent(network)}/tokens/${encodeURIComponent(tokenAddress)}/pools?page=1`,
    )) as { data?: OnchainPool[] };
    return (raw?.data ?? []).slice(0, limit);
  } catch { return []; }
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

  // ── Card-ready snapshot ──
  let tokenSnapshot: TokenSnapshot | undefined;
  try {
    const detail = await fetchCoinDetail(resolved.id);
    tokenSnapshot = buildTokenSnapshot(detail, row);
  } catch {
    if (row) tokenSnapshot = buildTokenSnapshot(null, row);
  }

  return {
    ok: true,
    report,
    intent: 'token_quote',
    via,
    assets: row ? [{ id: row.id, symbol: row.symbol, name: row.name }] : [{ id: resolved.id, symbol: resolved.symbol, name: resolved.name }],
    market: { spot: row || {} },
    discovery: tokenSnapshot ? { tokenSnapshot } : {},
    onchain: {},
    nft: {},
    logs,
    missingData: row ? missingData : [...missingData, 'spot_snapshot_missing'],
    resolvedId: resolved.id,
    spotPriceUsd: row?.current_price,
    resolver,
    tokenSnapshot,
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

// ─── LLM Agent ────────────────────────────────────────────────────────────────

const WEB3_TOOLS = [
  { type: 'function', function: { name: 'search_crypto_asset', description: 'Resolve a crypto token by name, symbol ($BTC), or contract address (0x…) to its CoinGecko ID. Call this first before other token tools.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Token name, ticker, or contract address' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'get_token_price_and_market', description: 'Get real-time price, market cap, 24h volume, 24h % change for one or more tokens. Requires CoinGecko IDs from search_crypto_asset.', parameters: { type: 'object', properties: { ids: { type: 'string', description: 'Comma-separated CoinGecko IDs, e.g. "bitcoin,ethereum"' } }, required: ['ids'] } } },
  { type: 'function', function: { name: 'get_token_detail', description: 'Get detailed token info: description, categories, official website, Twitter, GitHub, contract addresses on all chains, community sentiment.', parameters: { type: 'object', properties: { id: { type: 'string', description: 'CoinGecko ID, e.g. "bitcoin"' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'get_price_history', description: 'Get price history and OHLC candlestick data for a token over N days (7/14/30).', parameters: { type: 'object', properties: { id: { type: 'string', description: 'CoinGecko ID' }, days: { type: 'number', description: 'Number of days: 7, 14, or 30' } }, required: ['id', 'days'] } } },
  { type: 'function', function: { name: 'get_market_rankings', description: 'Get top coins ranked by market cap, volume, or 24h gain. Can filter by minimum market cap.', parameters: { type: 'object', properties: { sort: { type: 'string', enum: ['market_cap_desc', 'total_volume_desc', 'price_change_percentage_24h_desc'] }, top_n: { type: 'number', description: 'Number of results (default 10, max 20)' }, min_market_cap_usd: { type: 'number', description: 'Minimum market cap filter in USD (optional)' } }, required: ['sort'] } } },
  { type: 'function', function: { name: 'get_trending_coins', description: 'Get currently trending/hot coins on CoinGecko.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_global_market_overview', description: 'Get global crypto market: total market cap, BTC/ETH dominance, 24h change, active asset count.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_institutional_holdings', description: 'Get public companies and institutions that hold Bitcoin or Ethereum on their balance sheet (MicroStrategy, Tesla, etc.).', parameters: { type: 'object', properties: { coin: { type: 'string', enum: ['bitcoin', 'ethereum'], description: 'Which coin to check' } }, required: ['coin'] } } },
  { type: 'function', function: { name: 'get_exchange_rankings', description: 'Get top centralized exchanges ranked by trust score and 24h trading volume.', parameters: { type: 'object', properties: { limit: { type: 'number', description: 'Number of exchanges (default 10)' } } } } },
  { type: 'function', function: { name: 'get_nft_collection', description: 'Get NFT collection floor price, market cap, 24h volume, holder count, and sales data.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'NFT collection name or search query' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'get_onchain_pools', description: 'Get DEX/on-chain liquidity pool data for a token via GeckoTerminal. Shows pool TVL, 24h volume, price.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Token name, symbol, or contract address' }, network: { type: 'string', description: 'Chain: eth, base, solana, bsc, arbitrum (optional, auto-detected)' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'get_category_coins', description: 'Get top coins in a crypto sector/category such as DeFi, AI, Gaming, RWA, Meme, Layer-1.', parameters: { type: 'object', properties: { category: { type: 'string', description: 'Category name, e.g. "defi", "ai", "meme", "gaming", "rwa", "layer-1"' }, top_n: { type: 'number', description: 'Number of results (default 10)' } }, required: ['category'] } } },
];

type LLMMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
};

async function callLLMForWeb3(messages: LLMMessage[]): Promise<{
  content: string | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  finish_reason: string;
}> {
  if (!LLM_BASE_URL || !LLM_API_KEY) throw new Error('LOKA_AI_BASE_URL / LOKA_AI_API_KEY not set');
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_API_KEY}` },
    body: JSON.stringify({ model: LLM_WEB3_MODEL, messages, tools: WEB3_TOOLS, tool_choice: 'auto', max_tokens: 2048 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { choices: Array<{ finish_reason: string; message: { content: string | null; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> } }> };
  const choice = data.choices[0];
  return { content: choice.message.content, tool_calls: choice.message.tool_calls, finish_reason: choice.finish_reason };
}

async function executeWeb3Tool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'search_crypto_asset': {
        const r = await resolveAsset(String(args.query || ''));
        return r ? JSON.stringify({ id: r.id, symbol: r.symbol, name: r.name }) : JSON.stringify({ error: 'not_found' });
      }
      case 'get_token_price_and_market': {
        const rows = await fetchCoinsMarkets({ vs_currency: 'usd', ids: String(args.ids || ''), order: 'market_cap_desc', per_page: 10, page: 1, sparkline: 'false', price_change_percentage: '24h' });
        return JSON.stringify(rows.map(r => ({ id: r.id, symbol: r.symbol, name: r.name, price_usd: r.current_price, market_cap_usd: r.market_cap, volume_24h_usd: r.total_volume, change_24h_pct: r.price_change_percentage_24h, rank: r.market_cap_rank, high_24h: r.high_24h, low_24h: r.low_24h, ath: r.ath, circulating_supply: r.circulating_supply, total_supply: r.total_supply })));
      }
      case 'get_token_detail': {
        const d = await fetchCoinDetail(String(args.id || ''));
        if (!d) return JSON.stringify({ error: 'not_found' });
        return JSON.stringify({ id: d.id, symbol: d.symbol, name: d.name, categories: d.categories?.slice(0, 8), description: truncate(d.description?.en || '', 500), website: d.links?.homepage?.[0], twitter: d.links?.twitter_screen_name, github: d.links?.repos_url?.github?.[0], platforms: d.platforms, sentiment_up_pct: d.sentiment_votes_up_percentage, sentiment_down_pct: d.sentiment_votes_down_percentage });
      }
      case 'get_price_history': {
        const days = Math.min(30, Math.max(1, Number(args.days || 7)));
        const id = String(args.id || '');
        const [chart, ohlc] = await Promise.all([fetchCoinChart(id, days), fetchOhlcData(id, days)]);
        const summary = summarizeChart(chart);
        const ohlcSummary = ohlc.length >= 2 ? { period_high_usd: Math.max(...ohlc.map(c => c[2])), period_low_usd: Math.min(...ohlc.map(c => c[3])), candles: ohlc.length } : null;
        return JSON.stringify({ days, summary, ohlc: ohlcSummary });
      }
      case 'get_market_rankings': {
        const topN = Math.min(20, Math.max(1, Number(args.top_n || 10)));
        const sort = String(args.sort || 'market_cap_desc') as 'market_cap_desc' | 'total_volume_desc' | 'price_change_percentage_24h_desc';
        const minCap = args.min_market_cap_usd ? Number(args.min_market_cap_usd) : undefined;
        let rows = await fetchCoinsMarkets({ vs_currency: 'usd', order: sort === 'price_change_percentage_24h_desc' ? 'market_cap_desc' : sort, per_page: 250, page: 1, sparkline: 'false', price_change_percentage: '24h' });
        if (minCap) rows = rows.filter(r => (r.market_cap || 0) >= minCap);
        if (sort === 'price_change_percentage_24h_desc') rows = [...rows].sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0));
        return JSON.stringify(rows.slice(0, topN).map(r => ({ rank: r.market_cap_rank, name: r.name, symbol: r.symbol, price_usd: r.current_price, market_cap_usd: r.market_cap, volume_24h_usd: r.total_volume, change_24h_pct: r.price_change_percentage_24h })));
      }
      case 'get_trending_coins': {
        const rows = await fetchTrendingMarkets(10);
        return JSON.stringify(rows.map(r => ({ name: r.name, symbol: r.symbol, price_usd: r.current_price, change_24h_pct: r.price_change_percentage_24h, market_cap_usd: r.market_cap })));
      }
      case 'get_global_market_overview': {
        const g = await fetchGlobalData();
        if (!g) return JSON.stringify({ error: 'unavailable' });
        return JSON.stringify({ total_market_cap_usd: g.total_market_cap?.usd, total_volume_24h_usd: g.total_volume?.usd, btc_dominance_pct: g.market_cap_percentage?.btc, eth_dominance_pct: g.market_cap_percentage?.eth, market_cap_change_24h_pct: g.market_cap_change_percentage_24h_usd, active_cryptocurrencies: g.active_cryptocurrencies });
      }
      case 'get_institutional_holdings': {
        const coin = args.coin === 'ethereum' ? 'ethereum' : 'bitcoin' as 'bitcoin' | 'ethereum';
        const data = await fetchTreasuryHoldings(coin);
        if (!data) return JSON.stringify({ error: 'unavailable' });
        return JSON.stringify({ coin, total_holdings: data.total_holdings, total_value_usd: data.total_value_usd, dominance_pct: data.market_cap_dominance, top_companies: data.companies?.slice(0, 10).map(c => ({ name: c.name, country: c.country, holdings: c.total_holdings, value_usd: c.total_current_value_usd })) });
      }
      case 'get_exchange_rankings': {
        const limit = Math.min(20, Math.max(1, Number(args.limit || 10)));
        const exchanges = await fetchExchanges(limit);
        return JSON.stringify(exchanges.map(ex => ({ name: ex.name, country: ex.country, trust_score: ex.trust_score, trust_rank: ex.trust_score_rank, volume_24h_btc: ex.trade_volume_24h_btc })));
      }
      case 'get_nft_collection': {
        const nftId = await searchNftId(String(args.query || ''));
        if (!nftId) return JSON.stringify({ error: 'nft_not_found' });
        const d = await fetchNftDetail(nftId);
        if (!d) return JSON.stringify({ error: 'nft_detail_unavailable', nft_id: nftId });
        return JSON.stringify({ id: nftId, name: d.name, symbol: d.symbol, chain: d.asset_platform_id, contract: d.contract_address, floor_price_usd: d.floor_price?.usd, floor_change_24h_pct: d.floor_price_24h_percentage_change?.usd, market_cap_usd: d.market_cap?.usd, volume_24h_usd: d.volume_24h?.usd, unique_holders: d.number_of_unique_addresses, total_supply: d.total_supply, sales_24h: d.one_day_sales, ath_usd: d.ath?.usd });
      }
      case 'get_onchain_pools': {
        const resolved = await resolveAsset(String(args.query || ''));
        const detail = resolved ? await fetchCoinDetail(resolved.id) : null;
        const { network: detectedNet, address } = resolvePrimaryContract(detail);
        const network = String(args.network || detectedNet || 'eth');
        const pools = address ? await fetchOnchainTokenPools(network, address) : await fetchOnchainTopPools(network);
        if (!pools.length) return JSON.stringify({ error: 'no_pools_found', network });
        return JSON.stringify({ token: resolved ? { id: resolved.id, symbol: resolved.symbol, name: resolved.name } : null, network, address: address || null, pools: pools.slice(0, 5).map(p => ({ name: p.attributes?.name, price_usd: p.attributes?.base_token_price_usd, volume_24h_usd: p.attributes?.volume_usd?.h24, liquidity_usd: p.attributes?.reserve_in_usd, price_change_24h_pct: p.attributes?.price_change_percentage?.h24 })) });
      }
      case 'get_category_coins': {
        const topN = Math.min(20, Math.max(1, Number(args.top_n || 10)));
        const resolved = await resolveCategoryId(String(args.category || ''));
        if (!resolved) return JSON.stringify({ error: 'category_not_found', query: args.category });
        const rows = await fetchCoinsMarkets({ vs_currency: 'usd', category: resolved.categoryId, order: 'market_cap_desc', per_page: topN, page: 1, sparkline: 'false', price_change_percentage: '24h' });
        return JSON.stringify({ category: resolved.name, category_id: resolved.categoryId, coins: rows.map(r => ({ name: r.name, symbol: r.symbol, price_usd: r.current_price, market_cap_usd: r.market_cap, change_24h_pct: r.price_change_percentage_24h })) });
      }
      default:
        return JSON.stringify({ error: `unknown_tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

const AGENT_SYSTEM = `You are a Web3 data collection agent for Loka investment research platform.
Use the provided tools to gather cryptocurrency data, then write a structured data report in Chinese markdown.
Rules:
- ALWAYS call search_crypto_asset first to resolve a token before calling any other token tool
- ALWAYS call get_token_price_and_market for every identified token — even for overview/intro queries — to include real-time price, market cap, volume, and 24h change
- Call additional tools as needed for the specific query (e.g. get_token_detail for project info, get_price_history for trend)
- Write your final report starting with "## Web3 数据" in Chinese markdown, with all key metrics
- Do NOT give trading advice — report facts only
- If data is unavailable, state so clearly`;

// PreResolvedHint comes from the upstream "Web3 trending card click" path. When
// the user's chat is started by clicking a known trending coin, the frontend
// already has its CoinGecko id (e.g. PENGU → "pudgy-penguins"), so we hand it
// here via env vars from `runWeb3ResearchQuery`. This lets the agent skip the
// search_crypto_asset turn (~7s saved) and start with a usable resolvedId for
// downstream tokenSnapshot building.
type PreResolvedHint = { coingeckoId: string; symbol?: string; name?: string };

function readHintFromEnv(): PreResolvedHint | null {
  const id = (process.env.LOKA_WEB3_HINT_COINGECKO_ID || '').trim();
  if (!id) return null;
  const symbol = (process.env.LOKA_WEB3_HINT_SYMBOL || '').trim() || undefined;
  const name = (process.env.LOKA_WEB3_HINT_NAME || '').trim() || undefined;
  return { coingeckoId: id, symbol, name };
}

// ─── Stage event emitter ───────────────────────────────────────────────────
// Each tool call becomes a "stage" in the frontend Process panel ("Resolving
// token", "Fetching market data", etc). We emit structured JSON lines on
// stderr; the parent web3Research.service parses them and forwards via socket
// so the user sees real-time agent progress instead of a 30s blank wait.
//
// Format: one line per event, prefixed with `__WEB3_STAGE__ ` so the parent
// can filter from regular log noise.
const STAGE_TITLES: Record<string, { en: string; zh: string }> = {
  search_crypto_asset:        { en: 'Resolving token',           zh: '解析代币身份' },
  get_token_price_and_market: { en: 'Fetching market data',      zh: '获取市场行情' },
  get_token_detail:           { en: 'Reading project profile',   zh: '拉取项目资料' },
  get_price_history:          { en: 'Charting price history',    zh: '整理 K 线历史' },
  get_market_rankings:        { en: 'Reading market rankings',   zh: '查看市场排名' },
  get_trending_coins:         { en: 'Reading trending coins',    zh: '查看热度榜' },
  get_global_market_overview: { en: 'Reading global market',     zh: '查看全市场概览' },
  get_institutional_holdings: { en: 'Checking institutional holdings', zh: '查看机构持仓' },
  get_exchange_rankings:      { en: 'Ranking exchanges',         zh: '梳理交易所排名' },
  get_nft_collection:         { en: 'Reading NFT collection',    zh: '查看 NFT 数据' },
  get_onchain_pools:          { en: 'Scanning on-chain pools',   zh: '扫描链上流动性' },
  get_category_coins:         { en: 'Reading sector coins',      zh: '查看赛道代币' },
};
function titleForTool(name: string): { en: string; zh: string } {
  return STAGE_TITLES[name] || { en: name.replace(/_/g, ' '), zh: name };
}

type StageEvent = {
  _evt: 'web3_stage';
  stage: string;          // tool name (stable id for client-side dedup)
  title_en: string;
  title_zh: string;
  state: 'active' | 'completed' | 'failed' | 'skipped';
  /** ms since stage start, only on completed/failed */
  durationMs?: number;
  /** Compact summary for the user (e.g. "$0.20 +154%"), best-effort */
  summary?: string;
  /** Optional error message when state=failed */
  error?: string;
};

function emitStageEvent(ev: StageEvent): void {
  // The `__WEB3_STAGE__` prefix lets the parent process distinguish event
  // lines from the existing free-form `[web3-agent] ...` log lines.
  process.stderr.write(`__WEB3_STAGE__ ${JSON.stringify(ev)}\n`);
}

/** Best-effort one-line summary for the user-facing stage card. */
function summarizeToolResult(toolName: string, raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw);
    if (toolName === 'search_crypto_asset') {
      return parsed?.id ? `${parsed.symbol?.toUpperCase() || parsed.id} → ${parsed.id}` : undefined;
    }
    if (toolName === 'get_token_price_and_market' && Array.isArray(parsed) && parsed[0]) {
      const p = parsed[0];
      const price = typeof p.price_usd === 'number' ? `$${p.price_usd < 1 ? p.price_usd.toPrecision(3) : p.price_usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '';
      const chg = typeof p.change_24h_pct === 'number' ? `${p.change_24h_pct >= 0 ? '+' : ''}${p.change_24h_pct.toFixed(2)}%` : '';
      return [price, chg].filter(Boolean).join(' · ') || undefined;
    }
    if (toolName === 'get_token_detail') {
      const cats = Array.isArray(parsed?.categories) && parsed.categories.length ? parsed.categories.slice(0, 2).join(', ') : '';
      return cats || (parsed?.name ? `${parsed.name}` : undefined);
    }
    if (toolName === 'get_price_history') {
      const days = parsed?.days;
      const hi = parsed?.ohlc?.period_high_usd;
      const lo = parsed?.ohlc?.period_low_usd;
      if (days && Number.isFinite(hi) && Number.isFinite(lo)) {
        return `${days}d: $${Number(lo).toPrecision(3)} – $${Number(hi).toPrecision(3)}`;
      }
      return days ? `${days}d` : undefined;
    }
    if (toolName === 'get_trending_coins' && Array.isArray(parsed?.coins)) {
      return `${parsed.coins.length} trending`;
    }
    if (toolName === 'get_market_rankings' && Array.isArray(parsed?.coins)) {
      return `top ${parsed.coins.length}`;
    }
    if (toolName === 'get_global_market_overview' && parsed?.total_market_cap_usd) {
      const tc = parsed.total_market_cap_usd;
      return `$${(tc / 1e12).toFixed(2)}T total mcap`;
    }
  } catch { /* ignore */ }
  return undefined;
}

async function runAgentLoop(query: string, hint?: PreResolvedHint | null): Promise<Web3CliResult> {
  // When the upstream caller has already resolved the token (trending-card
  // path), we prepend an explicit instruction at the user-message level. This
  // overrides the system prompt's "ALWAYS call search_crypto_asset first" rule
  // because the user message gives concrete state. DeepSeek V3 with tool-calling
  // honours this and goes straight to price/detail/history with the known id.
  if (hint) {
    console.error(
      `[web3-agent] pre-resolved hint consumed: id=${hint.coingeckoId} sym=${hint.symbol || '∅'} name=${hint.name || '∅'} — instructing LLM to skip search_crypto_asset`,
    );
  }
  const userContent = hint
    ? `[Pre-resolved by frontend] ${hint.symbol ?? 'token'}${hint.name ? ' (' + hint.name + ')' : ''} → CoinGecko id = "${hint.coingeckoId}". Do NOT call search_crypto_asset; use this id directly with get_token_price_and_market / get_token_detail / get_price_history as needed.\n\nUser query: ${query}`
    : query;
  const messages: LLMMessage[] = [
    { role: 'system', content: AGENT_SYSTEM },
    { role: 'user', content: userContent },
  ];
  let inferredIntent: Web3Intent = 'token_deep_dive';
  let resolvedId: string | undefined = hint?.coingeckoId;
  let spotPriceUsd: number | undefined;
  const resolvedAssets: Array<{ id?: string; symbol?: string; name?: string }> = [];
  if (hint) resolvedAssets.push({ id: hint.coingeckoId, symbol: hint.symbol, name: hint.name });
  const toolsUsed: string[] = [];
  let finalReport = '';

  for (let turn = 0; turn < AGENT_MAX_TURNS; turn++) {
    let resp: Awaited<ReturnType<typeof callLLMForWeb3>>;
    try {
      resp = await callLLMForWeb3(messages);
    } catch (err) {
      console.error(`[web3-agent] LLM call failed turn=${turn}: ${(err as Error).message}`);
      return runLegacyMcpQuery(query, inferredIntent);
    }

    const assistantMsg: LLMMessage = { role: 'assistant', content: resp.content };
    if (resp.tool_calls?.length) assistantMsg.tool_calls = resp.tool_calls;
    messages.push(assistantMsg);

    if (resp.finish_reason === 'stop' || !resp.tool_calls?.length) {
      finalReport = resp.content || '';
      break;
    }

    const toolMsgs: LLMMessage[] = [];
    for (const tc of resp.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
      // Detect the case where DeepSeek ignored our "skip search_crypto_asset"
      // instruction and called it anyway. Useful for spotting prompt-following
      // regressions when the model is upgraded.
      if (hint && tc.function.name === 'search_crypto_asset') {
        console.error(
          `[web3-agent] WARN: LLM called search_crypto_asset despite pre-resolved hint (id=${hint.coingeckoId}). Optimization missed; check user-prompt wording.`,
        );
      }
      console.error(`[web3-agent] turn=${turn} tool="${tc.function.name}" args=${JSON.stringify(args)}`);
      // Frontend Process panel stage event: 'active' before the tool runs.
      const stageTitle = titleForTool(tc.function.name);
      emitStageEvent({
        _evt: 'web3_stage',
        stage: tc.function.name,
        title_en: stageTitle.en,
        title_zh: stageTitle.zh,
        state: 'active',
      });
      const stageStartMs = Date.now();
      let toolFailed = false;
      let result = '';
      try {
        result = await executeWeb3Tool(tc.function.name, args);
        try {
          const parsedCheck = JSON.parse(result);
          if (parsedCheck && typeof parsedCheck === 'object' && parsedCheck.error) {
            toolFailed = true;
          }
        } catch { /* non-JSON result is fine */ }
      } catch (toolErr) {
        toolFailed = true;
        result = JSON.stringify({ error: (toolErr as Error).message });
      }
      const stageDurMs = Date.now() - stageStartMs;
      emitStageEvent({
        _evt: 'web3_stage',
        stage: tc.function.name,
        title_en: stageTitle.en,
        title_zh: stageTitle.zh,
        state: toolFailed ? 'failed' : 'completed',
        durationMs: stageDurMs,
        summary: toolFailed ? undefined : summarizeToolResult(tc.function.name, result),
      });
      toolsUsed.push(tc.function.name);

      try {
        const parsed = JSON.parse(result);
        if (tc.function.name === 'search_crypto_asset' && parsed.id) {
          resolvedId = resolvedId || parsed.id;
          resolvedAssets.push({ id: parsed.id, symbol: parsed.symbol, name: parsed.name });
        }
        if (tc.function.name === 'get_token_price_and_market' && Array.isArray(parsed) && parsed[0]?.price_usd) {
          spotPriceUsd = spotPriceUsd ?? parsed[0].price_usd;
          if (!resolvedId && parsed[0].id) { resolvedId = parsed[0].id; resolvedAssets.push({ id: parsed[0].id, symbol: parsed[0].symbol, name: parsed[0].name }); }
        }
      } catch { /* ignore */ }

      if (tc.function.name === 'get_global_market_overview') inferredIntent = 'global_scan';
      else if (tc.function.name === 'get_institutional_holdings') inferredIntent = 'treasury_scan';
      else if (tc.function.name === 'get_exchange_rankings') inferredIntent = 'exchange_scan';
      else if (tc.function.name === 'get_market_rankings' || tc.function.name === 'get_trending_coins') inferredIntent = 'market_scan';
      else if (tc.function.name === 'get_category_coins') inferredIntent = 'category_scan';
      else if (tc.function.name === 'get_onchain_pools') inferredIntent = 'onchain_scan';
      else if (tc.function.name === 'get_nft_collection') inferredIntent = 'nft_scan';

      toolMsgs.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
    messages.push(...toolMsgs);
  }

  if (!finalReport) finalReport = '## Web3 数据\n数据收集完成，但未能生成最终报告。';

  // ── Always attach a card-ready snapshot for the resolved primary token ──
  // Independent of which tools the LLM picked: gives downstream a stable
  // structured payload (price / market / community / developer / exchanges)
  // for the TokenCard + crypto-analysis prompt context.
  let tokenSnapshot: TokenSnapshot | undefined;
  if (resolvedId) {
    try {
      const detail = await fetchCoinDetail(resolvedId);
      tokenSnapshot = buildTokenSnapshot(detail, getCachedSpotRow(resolvedId) ?? undefined);
    } catch {
      /* best-effort */
    }
  }

  return {
    ok: true,
    report: finalReport,
    intent: inferredIntent,
    via: 'rest',
    resolvedId,
    spotPriceUsd,
    resolver: 'llm-agent',
    assets: resolvedAssets,
    market: {},
    discovery: tokenSnapshot ? { tokenSnapshot } : {},
    onchain: inferredIntent === 'onchain_scan' ? { agent: true } : {},
    nft: inferredIntent === 'nft_scan' ? { agent: true } : {},
    logs: [`mode=agent`, `intent=${inferredIntent}`, `tools=${toolsUsed.join(',') || 'none'}`, `turns=${toolsUsed.length}`, `tokenSnapshot=${tokenSnapshot ? 'yes' : 'no'}`],
    missingData: [],
    tokenSnapshot,
  };
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
      discovery: coreSpot?.tokenSnapshot ? { tokenSnapshot: coreSpot.tokenSnapshot } : {},
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
      tokenSnapshot: coreSpot?.tokenSnapshot,
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
  const hint = readHintFromEnv();
  if (LLM_BASE_URL && LLM_API_KEY) {
    console.error(`[web3-cli] mode=agent model=${LLM_WEB3_MODEL} query="${truncate(query, 140)}"${hint ? ` hint_id=${hint.coingeckoId}` : ''}`);
    return runAgentLoop(query, hint);
  }
  // Fallback when LLM is not configured
  console.error(`[web3-cli] mode=mcp_fallback query="${truncate(query, 140)}"`);
  return runLegacyMcpQuery(query, 'token_deep_dive');
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
