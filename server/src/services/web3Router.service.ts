import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  runWeb3ResearchQuery,
  type Web3OkxNewsBundle,
  type Web3OkxSnapshot,
  type Web3ResearchResult,
} from './web3Research.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OKX_ROOT = path.join(__dirname, '../../tools/okx');
const OKX_CLI_JS = path.join(OKX_ROOT, 'dist', 'cli.js');
const OKX_CLI_TS = path.join(OKX_ROOT, 'src', 'cli.ts');

const OKX_ENABLED = (process.env.WEB3_OKX_ENABLED ?? 'true').toLowerCase() !== 'false';
const OKX_NEWS_ENABLED = (process.env.WEB3_OKX_NEWS_ENABLED ?? 'true').toLowerCase() !== 'false';
const OKX_TIMEOUT_MS = Math.max(2_000, Number(process.env.WEB3_OKX_TIMEOUT_MS || '5000'));
const OKX_NEWS_TIMEOUT_MS = Math.max(2_000, Number(process.env.WEB3_OKX_NEWS_TIMEOUT_MS || '7000'));
const ROUTER_BUDGET_MS = Math.max(3_000, Number(process.env.WEB3_ROUTER_BUDGET_MS || '12000'));
const MAX_OKX_ASSETS = Math.max(1, Number(process.env.WEB3_OKX_MAX_ASSETS || '2'));
const NEWS_PER_COIN = Math.max(3, Number(process.env.WEB3_OKX_NEWS_PER_COIN || '6'));
const OKX_BASE_URL = (process.env.OKX_API_BASE || 'https://www.okx.com').replace(/\/$/, '');
const OKX_INSTRUMENTS_TTL_MS = Math.max(60_000, Number(process.env.OKX_INSTRUMENTS_TTL_MS || '86400000'));
const OKX_PARALLEL_ENABLED = (process.env.WEB3_OKX_PARALLEL ?? 'true').toLowerCase() !== 'false';

// ── Server-side OKX base-currency dictionary (A' optimization) ──
// Lives in the long-running server process (not per-spawn), so we can cheaply
// decide at query dispatch time whether to fire OKX in parallel with CG.
let okxBaseSetCache: Set<string> | null = null;
let okxBaseSetLoadedAt = 0;
let okxBaseSetInflight: Promise<Set<string>> | null = null;

export type OkxListingInfo = {
  baseCcy: string;
  instId: string;
  instType: 'SPOT' | 'SWAP';
  quoteCcy?: string;
  listTime: number;   // ms epoch
};

let okxInstrumentsCache: OkxListingInfo[] = [];

async function rebuildOkxBaseSet(): Promise<Set<string>> {
  const set = new Set<string>();
  const instruments: OkxListingInfo[] = [];
  const instTypes: Array<'SPOT' | 'SWAP'> = ['SPOT', 'SWAP'];
  await Promise.all(instTypes.map(async (instType) => {
    try {
      const url = `${OKX_BASE_URL}/api/v5/public/instruments?instType=${instType}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        code?: string;
        data?: Array<{ instId?: string; baseCcy?: string; quoteCcy?: string; state?: string; listTime?: string }>;
      };
      if (body?.code && body.code !== '0') throw new Error(`code=${body.code}`);
      for (const row of body.data || []) {
        if (row.state && row.state !== 'live') continue;
        let base: string | null = null;
        if (row.baseCcy) {
          base = row.baseCcy.toUpperCase();
        } else if (row.instId) {
          base = row.instId.split('-')[0]?.toUpperCase() || null;
        }
        if (!base) continue;
        set.add(base);
        if (row.instId) {
          const listTime = Number(row.listTime);
          instruments.push({
            baseCcy: base,
            instId: row.instId,
            instType,
            quoteCcy: row.quoteCcy,
            listTime: Number.isFinite(listTime) ? listTime : 0,
          });
        }
      }
    } catch (err) {
      console.warn(`[web3Router] okx instruments ${instType} load failed:`, (err as Error)?.message);
    }
  }));
  okxInstrumentsCache = instruments;
  return set;
}

/** Return recently-listed OKX instruments, sorted by listTime desc.
 * Deduplicates by baseCcy (a coin listed on both SPOT and SWAP shows once, SPOT preferred). */
export async function getRecentOkxListings(limit = 10, options: { instType?: 'SPOT' | 'SWAP' } = {}): Promise<OkxListingInfo[]> {
  await getOkxBaseSet();
  const all = okxInstrumentsCache;
  const filtered = options.instType ? all.filter((i) => i.instType === options.instType) : all;
  // Dedup by baseCcy — if both SPOT and SWAP exist, prefer SPOT then later listTime
  const byBase = new Map<string, OkxListingInfo>();
  for (const inst of filtered) {
    const prev = byBase.get(inst.baseCcy);
    if (!prev) { byBase.set(inst.baseCcy, inst); continue; }
    if (prev.instType !== 'SPOT' && inst.instType === 'SPOT') {
      byBase.set(inst.baseCcy, inst);
    } else if (prev.instType === inst.instType && inst.listTime > prev.listTime) {
      byBase.set(inst.baseCcy, inst);
    }
  }
  return Array.from(byBase.values())
    .filter((i) => i.listTime > 0)
    .sort((a, b) => b.listTime - a.listTime)
    .slice(0, limit);
}

async function getOkxBaseSet(): Promise<Set<string>> {
  if (okxBaseSetCache && Date.now() - okxBaseSetLoadedAt < OKX_INSTRUMENTS_TTL_MS) return okxBaseSetCache;
  if (okxBaseSetInflight) return okxBaseSetInflight;
  okxBaseSetInflight = rebuildOkxBaseSet()
    .then((set) => {
      if (set.size > 0) {
        okxBaseSetCache = set;
        okxBaseSetLoadedAt = Date.now();
      } else {
        // Empty result: keep stale cache if any; retry next call.
        okxBaseSetLoadedAt = Date.now() - OKX_INSTRUMENTS_TTL_MS + 60_000;
      }
      return okxBaseSetCache || set;
    })
    .finally(() => {
      okxBaseSetInflight = null;
    });
  return okxBaseSetInflight;
}

// Fire-and-forget boot prewarm: populate cache so the first $TICKER query
// doesn't pay the ~1-2s instruments fetch cost.
if (OKX_ENABLED && OKX_PARALLEL_ENABLED) {
  void getOkxBaseSet()
    .then((set) => {
      console.log(`[web3Router] okx instruments prewarmed: ${set.size} bases`);
    })
    .catch(() => { /* logged inside rebuild */ });
}

/** Common English words that look like tickers (all-uppercase 2-6 chars).
 * Dropped before baseSet filtering to avoid false positives. The subsequent
 * `candidates ∩ OKX baseSet` filter catches the rest. */
const COMMON_UPPERCASE_STOPWORDS = new Set<string>([
  // 2-char (keep small; most 2-char all-caps strings are not useful signal anyway)
  'IS', 'IT', 'IN', 'ON', 'OF', 'TO', 'BE', 'BY', 'MY', 'WE', 'US', 'OR',
  'AS', 'AT', 'IF', 'SO', 'UP', 'AN', 'NO', 'GO', 'DO', 'HE', 'OK', 'AM', 'PM', 'AI',
  // 3-char
  'THE', 'AND', 'FOR', 'YOU', 'NOT', 'BUT', 'ALL', 'ANY', 'CAN', 'HAS', 'WAS',
  'HAD', 'HIS', 'HER', 'HIM', 'OUR', 'ITS', 'OUT', 'GET', 'USE', 'NOW', 'OLD',
  'WHY', 'HOW', 'WHO', 'SEE', 'DAY', 'WAY', 'TWO', 'MAY', 'SAY', 'ONE', 'LET',
  'TRY', 'YES',
  // 4-char
  'THIS', 'THAT', 'THEY', 'THEM', 'WITH', 'FROM', 'HAVE', 'WHAT', 'WHEN', 'WILL',
  'WERE', 'BEEN', 'YOUR', 'HERE', 'LIKE', 'TIME', 'OVER', 'ONLY', 'MAKE', 'GOOD',
  'EACH', 'JUST', 'WORK', 'LIFE', 'WELL', 'BACK', 'EVEN', 'MOST', 'VERY', 'MUCH',
  'THAN', 'LOOK', 'ABLE', 'SOME', 'MORE', 'MUST', 'SAID', 'MANY', 'DOWN', 'NEED',
  'PART', 'PLAY', 'HAND', 'CALL', 'FIND', 'KNOW', 'BEST', 'YEAR', 'WEEK', 'DATE',
  'HOLD', 'GIVE', 'INTO', 'ONLY', 'STEP',
  // 5-char
  'THINK', 'ABOUT', 'AFTER', 'THOSE', 'THESE', 'OTHER', 'FIRST', 'UNDER', 'WOULD',
  'COULD', 'THERE', 'WHERE', 'MIGHT', 'BEING', 'WHOSE', 'AGAIN', 'WHILE', 'SINCE',
  'WHICH', 'TODAY', 'PRICE', 'MONEY', 'TRADE', 'CHART', 'TREND', 'BULLS', 'BEARS',
  // 6-char
  'SHOULD', 'BEFORE', 'PEOPLE', 'ALREADY', 'BECAUSE', 'MARKET', 'TOKENS',
  // Action verbs / generic crypto jargon (might appear uppercase)
  'BUY', 'SELL', 'LONG', 'TOKEN', 'COIN', 'CRYPTO', 'FOMO', 'HODL',
]);

/** Extract ticker candidates from raw query. Multi-layer extraction:
 *   1. `$TICKER` — always high-confidence
 *   2. `TICKER + coin/token/币/代币` — Chinese+English context hint
 *   3. `分析/买/卖/做多/做空 TICKER` or `analyze/buy/sell TICKER` — action-verb hint
 *   4. Isolated all-caps 3-6 chars (when query isn't all-uppercase)
 *
 * Returns UPPERCASE symbols, dedup'd. Caller further filters via OKX base set
 * so only actually-listed tickers are pre-warmed. */
function extractTickerCandidates(query: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const up = raw.trim().toUpperCase();
    if (up.length < 2 || up.length > 10) return;
    if (!/^[A-Z][A-Z0-9]*$/.test(up)) return;
    if (COMMON_UPPERCASE_STOPWORDS.has(up)) return;
    if (seen.has(up)) return;
    seen.add(up);
    out.push(up);
  };

  // 1. $TICKER syntax
  for (const m of query.matchAll(/\$([A-Za-z][A-Za-z0-9]{1,9})\b/g)) add(m[1]);

  // 2. Context hint: "XYZ coin/token/币/代币". No trailing `\b` because JS \b
  // doesn't fire between two non-ASCII-word chars (Chinese 币 + 为 = no boundary).
  for (const m of query.matchAll(/([A-Za-z][A-Za-z0-9]{1,9})\s*(?:coin|token|币|代币)/gi)) add(m[1]);

  // 3. After action verb (EN + ZH). `\s*` so "分析btc" (no space) also matches.
  for (const m of query.matchAll(
    /(?:analy[zs]e|analysis of|buy|sell|price of|long|short|看好|看空|做多|做空|开多|开空|分析|买|卖|研究|看看|聊聊|觉得)\s*([a-zA-Z][a-zA-Z0-9]{1,9})\b/gi,
  )) add(m[1]);

  // 4. Isolated Latin letter word 2-6 chars. Skip if query is overwhelmingly
  // uppercase (avoids YELLED queries where every word looks like a ticker).
  // This catches both "BTC 怎么样" (all caps word) and "btc 要涨" (lowercase).
  const allLetters = query.replace(/[^a-zA-Z]/g, '');
  const isYelledQuery = allLetters.length >= 8 && allLetters === allLetters.toUpperCase();
  if (!isYelledQuery) {
    for (const m of query.matchAll(/\b([A-Za-z]{2,6})\b/g)) add(m[1]);
  }

  return out;
}

function clip(str: string, max = 200): string {
  const s = (str || '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function getServerRoot(): string {
  return path.join(__dirname, '../..');
}

/** Invoke the OKX subtool as a child process. Exported for skill endpoints
 * that need direct OKX intent dispatch without going through the full router. */
export function runOkxCli(
  payload: object,
  timeoutMs = OKX_TIMEOUT_MS,
): Promise<{ ok: boolean; report?: string; payload?: unknown; error?: string }> {
  return new Promise((resolve) => {
    const useCompiled = fs.existsSync(OKX_CLI_JS);
    let cmd: string;
    let args: string[];
    let cwd: string;
    if (useCompiled) {
      cmd = process.execPath;
      args = [OKX_CLI_JS];
      cwd = OKX_ROOT;
    } else {
      // dev fallback: tsx from server root
      cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      args = ['tsx', OKX_CLI_TS];
      cwd = getServerRoot();
    }

    const child = spawn(cmd, args, {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && !useCompiled,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        /* noop */
      }
      resolve({ ok: false, error: `okx_timeout_${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on('data', (buf) => {
      stdout += buf.toString('utf8');
    });
    child.stderr.on('data', (buf) => {
      stderr += buf.toString('utf8');
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: `okx_spawn_err: ${err.message}` });
    });
    child.on('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const lines = stdout.trim().split('\n').filter(Boolean);
      const last = lines[lines.length - 1];
      if (!last) {
        resolve({ ok: false, error: `okx_no_output stderr="${clip(stderr, 200)}"` });
        return;
      }
      try {
        const parsed = JSON.parse(last) as { ok: boolean; report?: string; payload?: unknown; error?: string };
        resolve(parsed);
      } catch (err) {
        resolve({ ok: false, error: `okx_bad_json: ${(err as Error).message} last="${clip(last, 200)}"` });
      }
    });

    try {
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        /* noop */
      }
      resolve({ ok: false, error: `okx_stdin_err: ${(err as Error).message}` });
    }
  });
}

/** Extract base currency codes from CG assets for OKX lookup. */
function extractBaseCurrencies(cg: Web3ResearchResult): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const asset of cg.raw.assets || []) {
    const sym = String(asset.symbol || '').trim().toUpperCase();
    if (!sym || seen.has(sym)) continue;
    // only plausible tickers: 2-10 alnum
    if (!/^[A-Z0-9]{2,10}$/.test(sym)) continue;
    seen.add(sym);
    out.push(sym);
    if (out.length >= MAX_OKX_ASSETS) break;
  }
  return out;
}

function shouldSkipOkxForIntent(intent?: string): boolean {
  // market / category / onchain / nft scans are CG-only
  return intent === 'market_scan' || intent === 'category_scan' || intent === 'onchain_scan' || intent === 'nft_scan';
}

function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 2 : 6 })}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

type CandleSummary = {
  range7d: { high: number; low: number; pct: number } | null;
  range30d: { high: number; low: number; pct: number } | null;
  latestClose: number;
};

function summarizeCandles(
  candles: Array<[ts: number, o: number, h: number, l: number, c: number]> | undefined,
): CandleSummary | null {
  if (!candles || candles.length === 0) return null;
  // OKX candles are newest-first. Each row: [ts, o, h, l, c]
  const rows = [...candles].sort((a, b) => b[0] - a[0]);
  const latestClose = rows[0][4];

  const summarizeWindow = (n: number) => {
    const window = rows.slice(0, Math.min(n, rows.length));
    if (!window.length) return null;
    let high = -Infinity;
    let low = Infinity;
    for (const row of window) {
      if (row[2] > high) high = row[2];
      if (row[3] < low) low = row[3];
    }
    const oldestOpen = window[window.length - 1][1];
    const pct = oldestOpen > 0 ? ((latestClose - oldestOpen) / oldestOpen) * 100 : NaN;
    return { high, low, pct };
  };

  return {
    latestClose,
    range7d: summarizeWindow(7),
    range30d: summarizeWindow(30),
  };
}

function buildOkxSection(snaps: Web3OkxSnapshot[]): string {
  if (!snaps.length) return '';
  const lines: string[] = ['\n## 衍生品与资金费（CEX 直连数据）'];
  for (const snap of snaps) {
    lines.push(`\n### ${snap.baseCcy}`);
    if (snap.spot) {
      lines.push(
        `现货 ${snap.spotInstId}: 最新 ${fmtUsd(snap.spot.last)} | 24h ${fmtPct(snap.spot.change24hPct)} | 区间 ${fmtUsd(snap.spot.low24h)} — ${fmtUsd(snap.spot.high24h)}`,
      );
      lines.push(`24h 成交额(quote): ${fmtUsd(snap.spot.volume24hQuote)}`);
    } else {
      lines.push('现货: 未在 OKX 上架');
    }
    if (snap.derivatives) {
      const fr = snap.derivatives.fundingRate;
      const frStr = fr == null ? 'n/a' : `${(fr * 100).toFixed(4)}% / 8h`;
      const frAnnualStr = fr == null ? '' : ` (年化约 ${(fr * 3 * 365 * 100).toFixed(2)}%)`;
      lines.push(
        `永续 ${snap.swapInstId}: funding ${frStr}${frAnnualStr} | OI ${fmtUsd(snap.derivatives.openInterestUsd)}`,
      );
    }
    if (snap.orderbookDepthUsd != null) {
      lines.push(`Orderbook 深度（±10 档合计）: ${fmtUsd(snap.orderbookDepthUsd)}`);
    }
    const candleStats = summarizeCandles(snap.candles);
    if (candleStats) {
      const parts: string[] = [];
      if (candleStats.range7d) {
        parts.push(
          `7d 高 ${fmtUsd(candleStats.range7d.high)} / 低 ${fmtUsd(candleStats.range7d.low)} / 涨跌 ${fmtPct(candleStats.range7d.pct)}`,
        );
      }
      if (candleStats.range30d) {
        parts.push(
          `30d 高 ${fmtUsd(candleStats.range30d.high)} / 低 ${fmtUsd(candleStats.range30d.low)} / 涨跌 ${fmtPct(candleStats.range30d.pct)}`,
        );
      }
      if (parts.length) lines.push(`K 线趋势: ${parts.join(' | ')}`);
    }
  }
  return lines.join('\n');
}

async function gatherOkxSnapshots(bases: string[]): Promise<Web3OkxSnapshot[]> {
  if (!bases.length) return [];
  const tasks = bases.map((base) =>
    runOkxCli({ intent: 'market_snapshot', baseCcy: base }).then((res) => {
      if (!res.ok || !res.payload) return null;
      return res.payload as Web3OkxSnapshot;
    }),
  );
  const settled = await Promise.all(tasks);
  return settled.filter((x): x is Web3OkxSnapshot => !!x && (!!x.spot || !!x.derivatives));
}

async function gatherOkxNewsBundles(bases: string[]): Promise<Web3OkxNewsBundle[]> {
  if (!bases.length) return [];
  const tasks = bases.map((base) =>
    runOkxCli({ intent: 'news_bundle', baseCcy: base, limit: NEWS_PER_COIN }, OKX_NEWS_TIMEOUT_MS).then((res) => {
      if (!res.ok || !res.payload) return null;
      return res.payload as Web3OkxNewsBundle;
    }),
  );
  const settled = await Promise.all(tasks);
  return settled.filter((x): x is Web3OkxNewsBundle => !!x && (!!x.sentiment || x.latestNews?.length > 0));
}

function buildOkxNewsSection(bundles: Web3OkxNewsBundle[]): string {
  if (!bundles.length) return '';
  const lines: string[] = ['\n## 新闻与市场情绪（24h 聚合）'];
  for (const b of bundles) {
    lines.push(`\n### ${b.baseCcy} 情绪快照`);
    if (b.sentiment) {
      const s = b.sentiment;
      const fmt = (n?: number | null) => (n == null || !Number.isFinite(n) ? 'n/a' : `${n.toFixed(1)}%`);
      lines.push(
        `标签: ${s.label || 'n/a'} | 多头 ${fmt(s.bullishRatio)} / 空头 ${fmt(s.bearishRatio)} / 中性 ${fmt(s.neutralRatio)}`,
      );
      const sources: string[] = [];
      if (s.newsMentionCnt != null) sources.push(`news=${s.newsMentionCnt}`);
      if (s.xMentionCnt != null) sources.push(`X=${s.xMentionCnt}`);
      if (s.hotness != null) sources.push(`总提及=${s.hotness}`);
      if (sources.length) lines.push(`24h 提及分布: ${sources.join(' / ')}`);
    } else {
      lines.push('情绪: 暂无数据');
    }
    if (b.latestNews && b.latestNews.length) {
      lines.push(`\n近期高重要性新闻 (top ${Math.min(5, b.latestNews.length)})：`);
      for (const n of b.latestNews.slice(0, 5)) {
        const when = n.publishedAt ? n.publishedAt.replace(/T.*$/, '') : '';
        const tag = n.sentiment ? ` [${n.sentiment}]` : '';
        const src = n.source ? ` (${n.source})` : '';
        lines.push(`- ${when} ${n.title || 'Untitled'}${tag}${src}`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * Unified entry point: runs CoinGecko web3 research, in parallel fetches OKX market
 * snapshots for resolved base currencies, and merges the reports.
 *
 * Safe drop-in for `runWeb3ResearchQuery` (same return type).
 */
export async function runWeb3RouterQuery(userQuery: string): Promise<Web3ResearchResult> {
  const q = (userQuery || '').trim();
  if (!q) {
    return runWeb3ResearchQuery(q);
  }

  const startMs = Date.now();
  const logs: string[] = [];
  const providers: Array<'coingecko' | 'okx-market' | 'okx-news'> = ['coingecko'];

  // ── A' optimization: pre-warm OKX in parallel when query has $TICKER and ticker is listed on OKX ──
  // This lets OKX market+news run concurrently with CG, instead of waiting for CG to resolve assets first.
  let preWarmBases: string[] = [];
  let preWarmMarketTask: Promise<Web3OkxSnapshot[]> | null = null;
  let preWarmNewsTask: Promise<Web3OkxNewsBundle[]> | null = null;
  if (OKX_ENABLED && OKX_PARALLEL_ENABLED) {
    const candidates = extractTickerCandidates(q).slice(0, MAX_OKX_ASSETS);
    if (candidates.length > 0) {
      try {
        const baseSet = await getOkxBaseSet();
        preWarmBases = candidates.filter((c) => baseSet.has(c));
      } catch {
        /* prewarm optional, fall through */
      }
      if (preWarmBases.length > 0) {
        preWarmMarketTask = gatherOkxSnapshots(preWarmBases);
        preWarmNewsTask = OKX_NEWS_ENABLED
          ? gatherOkxNewsBundles(preWarmBases)
          : Promise.resolve([] as Web3OkxNewsBundle[]);
        logs.push(`okx_prewarm:${preWarmBases.join(',')}`);
      }
    }
  }

  const cgTask = runWeb3ResearchQuery(q);
  const cg = await cgTask;
  if (Array.isArray(cg.raw.logs)) logs.unshift(...cg.raw.logs);

  if (!OKX_ENABLED) {
    cg.raw.providers = providers;
    logs.push('okx_disabled');
    cg.raw.logs = logs;
    console.log(`[web3Router] okx=disabled intent=${cg.raw.intent ?? 'n/a'} q="${clip(q, 80)}"`);
    return cg;
  }

  if (shouldSkipOkxForIntent(cg.raw.intent)) {
    cg.raw.providers = providers;
    logs.push(`okx_skipped_intent:${cg.raw.intent}`);
    cg.raw.logs = logs;
    console.log(`[web3Router] okx=skipped reason=intent intent=${cg.raw.intent} q="${clip(q, 80)}"`);
    return cg;
  }

  const cgBases = extractBaseCurrencies(cg);
  if (!cgBases.length && preWarmBases.length === 0) {
    cg.raw.providers = providers;
    logs.push('okx_skipped_no_bases');
    cg.raw.logs = logs;
    console.log(`[web3Router] okx=skipped reason=no_bases intent=${cg.raw.intent ?? 'n/a'} q="${clip(q, 80)}"`);
    return cg;
  }

  const remaining = ROUTER_BUDGET_MS - (Date.now() - startMs);
  if (remaining <= 500) {
    cg.raw.providers = providers;
    logs.push('okx_skipped_budget_exhausted');
    cg.raw.logs = logs;
    return cg;
  }

  // Bases to fetch now: CG-resolved bases NOT already pre-warmed.
  const lateBases = cgBases.filter((b) => !preWarmBases.includes(b));
  const allRequestedBases = [...preWarmBases, ...lateBases];

  let snapshots: Web3OkxSnapshot[] = [];
  let newsBundles: Web3OkxNewsBundle[] = [];
  try {
    const marketTask = Promise.all([
      preWarmMarketTask ?? Promise.resolve([] as Web3OkxSnapshot[]),
      lateBases.length > 0 ? gatherOkxSnapshots(lateBases) : Promise.resolve([] as Web3OkxSnapshot[]),
    ]).then(([a, b]) => [...a, ...b]);

    const newsTask = OKX_NEWS_ENABLED
      ? Promise.all([
          preWarmNewsTask ?? Promise.resolve([] as Web3OkxNewsBundle[]),
          lateBases.length > 0 ? gatherOkxNewsBundles(lateBases) : Promise.resolve([] as Web3OkxNewsBundle[]),
        ]).then(([a, b]) => [...a, ...b])
      : Promise.resolve([] as Web3OkxNewsBundle[]);

    const timeoutTask = new Promise<void>((resolve) =>
      setTimeout(() => {
        logs.push('okx_budget_timeout');
        resolve();
      }, remaining),
    );

    await Promise.race([Promise.all([marketTask, newsTask]).then(() => {}), timeoutTask]);

    const [snapSettled, newsSettled] = await Promise.allSettled([marketTask, newsTask]);
    snapshots = snapSettled.status === 'fulfilled' ? snapSettled.value : [];
    newsBundles = newsSettled.status === 'fulfilled' ? newsSettled.value : [];
    if (snapSettled.status === 'rejected') {
      logs.push(`okx_market_err:${clip((snapSettled.reason as Error)?.message || '', 80)}`);
    }
    if (newsSettled.status === 'rejected') {
      logs.push(`okx_news_err:${clip((newsSettled.reason as Error)?.message || '', 80)}`);
    }
  } catch (err) {
    logs.push(`okx_gather_err:${clip((err as Error)?.message || '', 80)}`);
  }

  if (snapshots.length) {
    providers.push('okx-market');
    const section = buildOkxSection(snapshots);
    if (section) {
      cg.report = `${cg.report.trimEnd()}\n${section}`;
    }
    cg.raw.okx = snapshots;
  } else {
    logs.push('okx_no_snapshots');
  }

  if (newsBundles.length) {
    providers.push('okx-news');
    const newsSection = buildOkxNewsSection(newsBundles);
    if (newsSection) {
      cg.report = `${cg.report.trimEnd()}\n${newsSection}`;
    }
    cg.raw.okxNews = newsBundles;
  } else if (OKX_NEWS_ENABLED) {
    logs.push('okx_news_empty');
  }

  const elapsed = Date.now() - startMs;
  const marketSummary = snapshots
    .map((s) => {
      const parts = [
        s.spot ? `spot=${s.spot.last.toFixed(4)}` : 'spot=na',
        s.derivatives?.fundingRate != null ? `funding=${(s.derivatives.fundingRate * 100).toFixed(4)}%` : 'funding=na',
        s.derivatives?.openInterestUsd != null ? `oiUsd=${Math.round(s.derivatives.openInterestUsd / 1e6)}M` : 'oiUsd=na',
        s.orderbookDepthUsd != null ? `depthUsd=${Math.round(s.orderbookDepthUsd / 1e3)}K` : 'depthUsd=na',
        s.candles?.length ? `candles=${s.candles.length}` : 'candles=0',
      ];
      return `${s.baseCcy}(${parts.join('/')})`;
    })
    .join(' | ');
  const newsSummary = newsBundles
    .map((b) => `${b.baseCcy}(news=${b.latestNews.length}/sent=${b.sentiment?.label || 'na'})`)
    .join(' | ');
  const basesLog = [
    preWarmBases.length > 0 ? `prewarm=${preWarmBases.join(',')}` : null,
    lateBases.length > 0 ? `late=${lateBases.join(',')}` : null,
  ].filter(Boolean).join(' ');
  console.log(
    `[web3Router] okx=${snapshots.length > 0 ? 'ok' : 'empty'} news=${newsBundles.length > 0 ? 'ok' : 'empty'} bases=${allRequestedBases.join(',')}${basesLog ? ` (${basesLog})` : ''} elapsed_ms=${elapsed} intent=${cg.raw.intent ?? 'n/a'}${marketSummary ? ` market:${marketSummary}` : ''}${newsSummary ? ` news:${newsSummary}` : ''}`,
  );

  cg.raw.providers = providers;
  cg.raw.logs = logs;
  return cg;
}

export const web3RouterService = {
  runQuery: runWeb3RouterQuery,
};
