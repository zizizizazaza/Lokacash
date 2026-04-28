import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** server/src/services → server/tools/web3 */
const WEB3_ROOT = path.join(__dirname, '../../tools/web3');
const CLI_JS = path.join(WEB3_ROOT, 'dist', 'cli.js');
const CLI_TS = path.join(WEB3_ROOT, 'src', 'cli.ts');

/**
 * Wall-clock budget for the web3 LLM-agent CLI subprocess.
 *
 * The agent runs a multi-turn loop: each turn is one LLM call + one CG REST
 * call (or OKX/news/etc.). For a `token_deep_dive` intent it typically spends
 * 4-5 turns (search → market → detail → history → final synthesis), each
 * ~8-12s on DeepSeek-V3, so a healthy run lands around 45-60s. The earlier
 * hard-coded 45s ceiling killed legitimate runs mid-loop and produced empty
 * web3 results — the worst kind of failure since the user gets a half-formed
 * report without realizing the on-chain data was missing.
 *
 * Default 90s gives 5-6 full turns of headroom; override with
 * `WEB3_MCP_TIMEOUT_MS` if your model / network is consistently slower.
 */
function web3CliTimeoutMs(): number {
  const raw = (process.env.WEB3_MCP_TIMEOUT_MS || '').trim();
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 15_000 && n <= 600_000) return n;
  return 90_000;
}

export type Web3OkxSnapshot = {
  baseCcy: string;
  spotInstId: string | null;
  swapInstId: string | null;
  spot: {
    last: number;
    open24h: number;
    high24h: number;
    low24h: number;
    change24hPct: number;
    volume24hBase: number;
    volume24hQuote: number;
    ts: number;
  } | null;
  derivatives: {
    fundingRate: number | null;
    nextFundingTs: number | null;
    openInterest: number | null;
    openInterestUsd: number | null;
    ts: number | null;
  } | null;
  candles?: Array<[ts: number, o: number, h: number, l: number, c: number]>;
  orderbookDepthUsd?: number | null;
  logs?: string[];
};

export type Web3OkxNewsItem = {
  id?: string;
  title?: string;
  summary?: string;
  url?: string;
  publishedAt?: string;
  source?: string;
  importance?: string;
  sentiment?: string;
  coins?: string[];
};

export type Web3OkxSentiment = {
  baseCcy: string;
  label?: string;
  bullishRatio?: number | null;
  bearishRatio?: number | null;
  neutralRatio?: number | null;
  hotness?: number | null;
  newsMentionCnt?: number | null;
  xMentionCnt?: number | null;
  trend?: Array<{ ts: number; bullish: number; bearish: number; neutral: number }>;
  ts?: number;
};

export type Web3OkxNewsBundle = {
  baseCcy: string;
  latestNews: Web3OkxNewsItem[];
  sentiment: Web3OkxSentiment | null;
};

/**
 * Compact, card-ready snapshot for the primary token of a crypto query.
 * Mirrors what the web3 CLI emits in `tokenSnapshot`.
 * Used by the TokenCard UI and as inline data context in the crypto-analysis prompt.
 */
export type Web3TokenSnapshot = {
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

export type Web3ResearchResult = {
  report: string;
  raw: {
    intent?: string;
    via?: 'mcp' | 'rest' | 'hybrid';
    resolvedId?: string;
    spotPriceUsd?: number;
    resolver?: string;
    assets?: Array<{ id?: string; symbol?: string; name?: string }>;
    market?: Record<string, unknown>;
    discovery?: Record<string, unknown>;
    onchain?: Record<string, unknown>;
    nft?: Record<string, unknown>;
    logs?: string[];
    missingData?: string[];
    okx?: Web3OkxSnapshot[];
    okxNews?: Web3OkxNewsBundle[];
    providers?: Array<'coingecko' | 'okx-market' | 'okx-news'>;
    /** Card-ready snapshot for primary token (single-asset intents). */
    tokenSnapshot?: Web3TokenSnapshot;
  };
};

type Web3CacheEntry = {
  value: Web3ResearchResult;
  updatedAtMs: number;
};

const WEB3_RESULT_CACHE_TTL_MS = Math.max(5_000, Number(process.env.WEB3_RESULT_CACHE_TTL_MS || '30000'));
const web3ResultCache = new Map<string, Web3CacheEntry>();

function serverRootFromHere(): string {
  return path.join(__dirname, '../..');
}

function cacheKey(query: string): string {
  return query.replace(/\s+/g, ' ').trim().toLowerCase();
}

function getCachedResult(query: string): Web3ResearchResult | null {
  const key = cacheKey(query);
  const entry = web3ResultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.updatedAtMs > WEB3_RESULT_CACHE_TTL_MS) {
    web3ResultCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedResult(query: string, value: Web3ResearchResult): void {
  web3ResultCache.set(cacheKey(query), {
    value,
    updatedAtMs: Date.now(),
  });
}

/**
 * Runs the CoinGecko web3 CLI (`tools/web3`) and returns report + structured payload.
 */
export async function runWeb3ResearchQuery(userQuery: string): Promise<Web3ResearchResult> {
  const q = (userQuery || '').trim();
  if (!q) {
    return {
      report: '## Web3\n(空查询)',
      raw: {
        intent: 'empty',
        via: 'rest',
        logs: ['empty_query'],
      },
    };
  }

  const serverRoot = serverRootFromHere();
  const tsxCli = path.join(serverRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const useCompiled = fs.existsSync(CLI_JS);
  const useTsx = !useCompiled && fs.existsSync(tsxCli) && fs.existsSync(CLI_TS);

  const execPath = process.execPath;
  const args: string[] = useCompiled
    ? [CLI_JS, q]
    : useTsx
      ? [tsxCli, CLI_TS, q]
      : [];

  if (args.length === 0) {
    return {
      report: `## Web3\n未找到 \`tools/web3/dist/cli.js\`（且无法回退到 tsx）。请在 \`server\` 目录执行：\`npm run build:web3\`。`,
      raw: {
        intent: 'build_missing',
        via: 'rest',
        logs: ['missing_cli_build'],
      },
    };
  }

  return new Promise((resolve, reject) => {
    const clip = (s: string, max: number) => {
      const t = s.replace(/\s+/g, ' ').trim();
      if (t.length <= max) return t;
      return `${t.slice(0, max)}…`;
    };

    const child = spawn(execPath, args, {
      cwd: WEB3_ROOT,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timeoutMs = web3CliTimeoutMs();
    const timeoutSec = Math.round(timeoutMs / 1000);
    const timer = setTimeout(() => {
      console.warn(
        `[web3Research] timeout after ${timeoutSec}s query="${clip(q, 120)}" cli=${useCompiled ? 'dist' : useTsx ? 'tsx' : 'none'}`,
      );
      child.kill('SIGTERM');
      reject(new Error(`Web3 MCP tool timeout (${timeoutSec}s)`));
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      console.warn(`[web3Research] spawn error query="${clip(q, 120)}" err=${(err as Error).message}`);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const stdoutLine = stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
        let parsedCliError = '';
        try {
          const parsed = JSON.parse(stdoutLine) as { error?: string };
          parsedCliError = String(parsed?.error || '').trim();
        } catch {
          /* ignore parse failures; keep fallback paths */
        }
        console.warn(
          `[web3Research] cli non-zero exit code=${code} query="${clip(q, 120)}" parsed_error="${clip(
            parsedCliError,
            200,
          )}" stderr="${clip(stderr, 400)}" stdout_tail="${clip(stdout, 400)}"`,
        );
        const finalError = parsedCliError || stderr.trim() || stdoutLine || `web3 cli exited ${code}`;
        if (/\bREST\s+429\b/i.test(finalError) || /\b429\b/.test(finalError)) {
          const cached = getCachedResult(q);
          if (cached) {
            console.log(`[web3Research] serving cached result after 429 query="${clip(q, 120)}" ttl_ms=${WEB3_RESULT_CACHE_TTL_MS}`);
            resolve({
              report: `${cached.report}\n\n> 注：上游实时接口限流（429），当前结果来自 ${Math.floor(WEB3_RESULT_CACHE_TTL_MS / 1000)} 秒内缓存。`,
              raw: {
                ...cached.raw,
                via: cached.raw.via || 'rest',
                logs: [...(cached.raw.logs || []), 'served_from_cache_after_429'],
                missingData: [...(cached.raw.missingData || []), 'live_rate_limited_used_cache'],
              },
            });
            return;
          }
        }
        reject(new Error(finalError));
        return;
      }
      let line = '';
      try {
        line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? stdout.trim();
        const parsed = JSON.parse(line) as {
          ok?: boolean;
          report?: string;
          error?: string;
          intent?: string;
          resolvedId?: string;
          spotPriceUsd?: number;
          via?: 'mcp' | 'rest' | 'hybrid';
          resolver?: string;
          assets?: Array<{ id?: string; symbol?: string; name?: string }>;
          market?: Record<string, unknown>;
          discovery?: Record<string, unknown>;
          onchain?: Record<string, unknown>;
          nft?: Record<string, unknown>;
          logs?: string[];
          missingData?: string[];
          tokenSnapshot?: Web3TokenSnapshot;
        };
        if (!parsed.ok) {
          console.warn(
            `[web3Research] cli ok:false query="${clip(q, 120)}" error="${clip(String(parsed.error || ''), 200)}"`,
          );
          reject(new Error(parsed.error || 'web3 tool returned ok:false'));
          return;
        }
        console.log(
          `[web3Research] query="${q}" intent=${parsed.intent || 'n/a'} asset_count=${parsed.assets?.length || 0} resolved_id=${parsed.resolvedId || 'n/a'} spot_usd=${parsed.spotPriceUsd ?? 'n/a'} via=${parsed.via || 'n/a'} resolver=${parsed.resolver || 'n/a'}`,
        );
        if (parsed.logs?.length) {
          console.log(`[web3Research:logs] ${parsed.logs.join(' | ')}`);
        }
        if (parsed.assets?.length) {
          const assetPreview = parsed.assets
            .slice(0, 5)
            .map((asset) => `${asset.name || asset.id || 'unknown'}(${asset.symbol || '-'})`)
            .join(', ');
          console.log(`[web3Research:assets] ${assetPreview}`);
        }
        if (parsed.missingData?.length) {
          console.log(`[web3Research:missing] ${parsed.missingData.join(',')}`);
        }
        resolve({
          report: parsed.report || '',
          raw: {
            intent: parsed.intent,
            via: parsed.via,
            resolvedId: parsed.resolvedId,
            spotPriceUsd: parsed.spotPriceUsd,
            resolver: parsed.resolver,
            assets: parsed.assets || [],
            market: parsed.market || {},
            discovery: parsed.discovery || {},
            onchain: parsed.onchain || {},
            nft: parsed.nft || {},
            logs: parsed.logs || [],
            missingData: parsed.missingData || [],
            tokenSnapshot: parsed.tokenSnapshot,
          },
        });
        setCachedResult(q, {
          report: parsed.report || '',
          raw: {
            intent: parsed.intent,
            via: parsed.via,
            resolvedId: parsed.resolvedId,
            spotPriceUsd: parsed.spotPriceUsd,
            resolver: parsed.resolver,
            assets: parsed.assets || [],
            market: parsed.market || {},
            discovery: parsed.discovery || {},
            onchain: parsed.onchain || {},
            nft: parsed.nft || {},
            logs: parsed.logs || [],
            missingData: parsed.missingData || [],
            tokenSnapshot: parsed.tokenSnapshot,
          },
        });
      } catch (e) {
        console.warn(
          `[web3Research] invalid JSON from cli query="${clip(q, 120)}" lastLine="${clip(line, 200)}" stdoutTail="${clip(stdout, 400)}" stderr="${clip(stderr, 400)}"`,
        );
        reject(new Error(`Invalid web3 CLI JSON: ${(e as Error).message} | stderr=${stderr.slice(0, 500)}`));
      }
    });
  });
}

export const web3ResearchService = {
  runQuery: runWeb3ResearchQuery,
};
