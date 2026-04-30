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
 * Optional hint to short-circuit the web3 agent's search_crypto_asset turn.
 * Comes from the frontend Web3 trending-card click flow: when the user clicks
 * a known trending coin, the frontend already knows its CoinGecko id. The
 * agent reads this hint via env vars and starts directly at price/detail/history.
 */
export type Web3PreResolvedHint = { coingeckoId: string; symbol?: string; name?: string };

/**
 * Real-time stage event emitted by the web3 CLI agent for each tool call.
 * The Process panel renders these as sub-stages so the user can see what
 * the agent is doing during the 20-30s window the ReAct loop runs.
 */
export type Web3StageEvent = {
  /** Stable id (= tool name). Same id for active + completed pairs. */
  stage: string;
  /** Human-readable bilingual titles (frontend picks based on user lang). */
  title_en: string;
  title_zh: string;
  state: 'active' | 'completed' | 'failed' | 'skipped';
  /** Wall-clock duration in ms; only set on completed/failed. */
  durationMs?: number;
  /** Compact one-line summary, e.g. "$0.20 +154%". */
  summary?: string;
  /** Error message when state=failed. */
  error?: string;
  /** Tool input args (the LLM's tool_call.arguments). Powers ToolCallPills. */
  argsData?: any;
  /** Raw tool output (parsed JSON). Powers per-tool inline cards. Trimmed
   *  server-side to bound payload size. */
  rawData?: any;
};

/**
 * Runs the CoinGecko web3 CLI (`tools/web3`) and returns report + structured payload.
 */
export async function runWeb3ResearchQuery(
  userQuery: string,
  opts?: {
    hint?: Web3PreResolvedHint | null;
    /** Real-time stage events from the agent's ReAct loop. Called once per
     *  active/completed transition; ordering matches what the user should
     *  see chronologically. Best-effort — exceptions in the callback are
     *  swallowed so a misbehaving subscriber can't kill the agent run. */
    onStage?: (event: Web3StageEvent) => void;
  },
): Promise<Web3ResearchResult> {
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

    // Hand the optional pre-resolved hint to the CLI via env vars so the
    // agent's user prompt can include "skip search_crypto_asset" guidance.
    const hint = opts?.hint;
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      ...(hint?.coingeckoId
        ? {
            LOKA_WEB3_HINT_COINGECKO_ID: hint.coingeckoId,
            ...(hint.symbol ? { LOKA_WEB3_HINT_SYMBOL: hint.symbol } : {}),
            ...(hint.name ? { LOKA_WEB3_HINT_NAME: hint.name } : {}),
          }
        : {}),
    };

    if (hint?.coingeckoId) {
      console.log(
        `[web3Research] spawning CLI with pre-resolved hint: id=${hint.coingeckoId} sym=${hint.symbol || '∅'} name=${hint.name || '∅'} (agent should skip search_crypto_asset turn)`,
      );
    }

    const child = spawn(execPath, args, {
      cwd: WEB3_ROOT,
      env: childEnv,
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

    // Stderr carries two streams of content interleaved:
    //   1. Free-form `[web3-agent] ...` log lines (kept in `stderr` for diagnostics)
    //   2. Structured `__WEB3_STAGE__ {json}` event lines that we forward live
    //      to the frontend Process panel via `opts.onStage`.
    // We line-buffer both because Node's child stderr arrives in arbitrary
    // chunks; partial lines must wait for the next chunk to complete.
    let stderrBuf = '';
    const STAGE_PREFIX = '__WEB3_STAGE__ ';
    const onStage = opts?.onStage;
    child.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      stderrBuf += chunk;
      let nl: number;
      while ((nl = stderrBuf.indexOf('\n')) !== -1) {
        const line = stderrBuf.slice(0, nl);
        stderrBuf = stderrBuf.slice(nl + 1);
        // Stage-event lines (frontend Process panel timeline)
        if (line.startsWith(STAGE_PREFIX)) {
          if (!onStage) continue;
          try {
            const ev = JSON.parse(line.slice(STAGE_PREFIX.length));
            if (ev && ev._evt === 'web3_stage' && typeof ev.stage === 'string') {
              try {
                onStage({
                  stage: ev.stage,
                  title_en: String(ev.title_en || ev.stage),
                  title_zh: String(ev.title_zh || ev.stage),
                  state: (ev.state || 'active') as Web3StageEvent['state'],
                  durationMs: typeof ev.durationMs === 'number' ? ev.durationMs : undefined,
                  summary: typeof ev.summary === 'string' ? ev.summary : undefined,
                  error: typeof ev.error === 'string' ? ev.error : undefined,
                  argsData: ev.argsData ?? undefined,
                  rawData: ev.rawData ?? undefined,
                });
              } catch (cbErr) {
                // Subscriber raised — log and keep the agent run alive.
                console.warn(`[web3Research] onStage subscriber threw: ${(cbErr as Error).message}`);
              }
            }
          } catch {
            /* malformed JSON line, skip */
          }
          continue;
        }
        // Diagnostic lines from the child process (web3-cli / web3-agent
        // namespaces). Forward to parent stdout so they show up in log files
        // and ops dashboards — without this, the child's reasoning trace
        // (active expansion, parallel batches, prompt-following warnings,
        // etc.) is invisible because stderr is only retained in-memory.
        if (line.startsWith('[web3-agent]') || line.startsWith('[web3-cli]')) {
          console.log(line);
        }
      }
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
