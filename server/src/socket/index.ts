import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { verifyToken } from '../middleware/auth.js';
import prisma from '../db.js';
import { researchService, type XProfileSnapshot } from '../services/research.service.js';
import { type Web3ResearchResult } from '../services/web3Research.service.js';
import { web3RouterService } from '../services/web3Router.service.js';
import { stockAnalysisService } from '../services/stockanalysis.service.js';
import { runHtmlGeneration as runHtmlGenerationService } from '../services/reportHtml.service.js';
import { hedgefundService } from '../services/hedgefund.service.js';
import { LokaAIService, getGlobalTimeContext } from '../services/ai.service.js';
import { isCryptoSymbol, isAmbiguousSymbol, filterOutCryptoTickers } from '../constants/cryptoAssets.js';
import {
  validateTickersAgainstCoinGecko,
  isHighConfidenceCryptoMatch,
  type CryptoTickerMatch,
} from '../services/routingValidator.service.js';
import {
  formatConsensusAgentLabel,
  runConsensusEngine,
  sortConsensusAgentEntries,
} from '../services/consensus.service.js';
import {
  getAnalystById,
  SYSTEM_ANALYST_IDS,
  validateAnalystSelection,
  type PublicAnalystPersona,
} from '../catalogs/analysts.js';
import { extractAsset } from '../services/assetExtractor.js';
import { runAegeanDeepAnalysis } from '../services/aegeanDeepAnalysis.service.js';
import { transformAegeanDeepAnalysis } from '../services/aegeanDeepAnalysisTransform.js';
import { consumeQuota } from '../services/subscription.service.js';
import { consumeGuestAuto, GUEST_CONFIG } from '../services/guest.service.js';
import * as crypto from 'crypto';
import {
  createModuleEmitter,
  startChatReplayBuffer,
  finishChatReplayBuffer,
  getChatReplayBuffer,
  recordChatToolTraceStep,
  recordChatTokenCard,
  recordChatRoutedMode,
  recordChatRtEvent,
} from '../services/moduleEmitter.js';
import {
  mergeSignalSources,
  sourcesFromSignalRadarLogLine,
  sourcesFromSignalRadarSummary,
  sourcesFromLast30DaysCompact,
  type SignalSearchSource,
} from '../services/signalRadarThinking.js';

let io: Server;
const aiService = new LokaAIService();

// ── Online status tracking ──
const onlineUsers = new Set<string>();
const activeResearchSessions = new Set<string>();
const activeHedgeFundSessions = new Set<string>();
const activeStockAnalysisSessions = new Set<string>();
const activeChatSessions = new Map<string, string>();
/** Abort controllers keyed by sessionId — used to cancel a previous agent:chat run when a new one arrives */
const chatAbortControllers = new Map<string, AbortController>();
/** Dedup map keyed by sessionId::content — prevents duplicate messages from queue flush + direct emit race */
const chatDedupMap = new Map<string, number>();
/** Per-socket rate limiter: tracks agent:chat timestamps to enforce max 3 messages per 10 seconds */
const socketRateLimiter = new Map<string, number[]>();
/** Session start timestamps — used by the orphan sweep to identify stale sessions */
const chatSessionStartTimes = new Map<string, number>();

interface AgentChatImage {
  url: string;
  mime?: string;
  name?: string;
}

/** Fallback when the router omits `search.showXAccountProfile` (language-agnostic hints only). */
function wantsTwitterProjectProfileHint(q: string): boolean {
  return /推特|Twitter|推文|X平台|[\s，、]X[\s，、]|x\.com|社交平台.*(项目|账号)|调研.*(推特|Twitter|推文)|分析.*(推特|Twitter|推文)|twitter.*project/i.test(
    q,
  );
}

const SOCIAL_HANDLE_STOPWORDS = new Set([
  'twitter',
  'x',
  'com',
  'project',
  'account',
  'profile',
  'analysis',
  'research',
  'about',
  'the',
  'and',
  'for',
  'with',
  'what',
  'how',
]);

function toSafeNumber(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * Decide which execution tier a user's Auto-mode query should use.
 *
 * Returns one of:
 *   'simple'     — plain LLM answer, no tools (free, or both buckets exhausted)
 *   'fast'       — standard Super Agent: search + Web3 + synthesis (default complex path)
 *   'roundtable' — multi-agent debate + deep research report (expensive)
 *
 * Design principle: Roundtable is OPT-IN. A single-agent Fast response
 * already gives users a well-reasoned directional call. We only escalate
 * to the 5x-more-expensive Roundtable when the user **explicitly** signals
 * they want multi-perspective depth. Three scenarios:
 *
 *   1. Multi-entity comparison  — "A vs B", "对比 A 和 B" — inherently
 *      needs multiple specialists weighing in.
 *   2. Explicit deep-analysis ask — "deep dive", "full analysis",
 *      "多视角", "深度分析" — user is literally requesting depth.
 *   3. Explicit bull-vs-bear / debate framing — "bull case AND bear case",
 *      "多空博弈", "正反观点", "辩论" — the query is shaped as a debate.
 *
 * Single-asset directional asks ("能不能追多 SOL", "该不该抄底 BTC",
 * "是否开多", "should I buy Tesla") stay on Fast. Directional calls are
 * Fast's sweet spot; Roundtable adds minutes of latency for an answer
 * Fast already gives well.
 */
type AutoPlanLike = {
  isSimpleChat?: boolean;
  queryType?: string;
};

export function decideAutoMode(plan: AutoPlanLike, userContent: string): 'simple' | 'fast' | 'roundtable' {
  if (plan.isSimpleChat) return 'simple';

  // Guru Council is LITERALLY a debate panel — user explicitly chose it.
  if (plan.queryType === 'guru-council') return 'roundtable';

  const msg = userContent || '';

  // ── Trigger 1: Multi-entity comparison structure ──────────────────
  // "X vs Y", "X versus Y", "compare X and Y", "which is better between X and Y"
  // "对比 X 和 Y", "X 与 Y 哪个更好", "X 和 Y 谁更强"
  const enMultiEntity =
    /\b(vs\.?|versus)\b/i.test(msg) ||
    /\bcompare\s+[\w$]+\s+(and|with|to|vs)\s+[\w$]+\b/i.test(msg) ||
    /\bwhich\s+(is|one is|would be)\s+(better|stronger|safer|preferable|the\s+better)\b/i.test(msg);
  const zhMultiEntity =
    /(对比|比较).{1,30}(和|与)/.test(msg) ||                               // "对比 A 和 B"
    /(和|与).{1,15}(对比|比较|相比)/.test(msg) ||                           // "A 和 B 对比"
    /(和|与).{1,15}(哪个|谁)\s?(更|比较)\s?(好|强|合适)/.test(msg) ||          // "A 和 B 哪个更好"
    /(哪个|谁)\s?(更|比较)\s?(好|强|稳|合适|值得|靠谱|适合投资)/.test(msg);   // "谁更值得投资"

  // ── Trigger 2: Explicit deep-analysis request ─────────────────────
  const enDeep =
    /\b(deep[- ]?dive|thorough\s+(analysis|review)|comprehensive\s+(analysis|review|breakdown)|full\s+analysis|in[- ]?depth|multi[- ]?perspective|multi[- ]?angle|all\s+angles|roundtable|panel\s+analysis)\b/i.test(msg);
  const zhDeep =
    /(深入分析|深度分析|全面分析|完整分析|详细分析|多视角|多方(?:观点|视角|意见)|多角度|全方位分析|专家(?:团|组|小组|会诊)|圆桌|roundtable)/i.test(msg);

  // ── Trigger 3: Explicit bull-vs-bear / debate / consensus framing ──
  const enDebate =
    /\b(pros and cons|bull\s+case\s+(and|vs\.?|versus)\s+bear\s+case|bear\s+case\s+(and|vs\.?|versus)\s+bull\s+case|bull\s+vs\.?\s+bear|bear\s+vs\.?\s+bull|debate|divergent\s+views)\b/i.test(msg);
  const zhDebate =
    /(多空(?:博弈|分歧|对决|争议)|正反(?:观点|分析|论据|面)|多方博弈|辩论|(?:多|空)头(?:观点|视角|论据|立场)(?:和|与|vs)(?:多|空)头(?:观点|视角|论据|立场)|多空(?:观点|视角))/i.test(msg);

  if (
    enMultiEntity || zhMultiEntity ||
    enDeep || zhDeep ||
    enDebate || zhDebate
  ) {
    return 'roundtable';
  }

  return 'fast';
}

function candidateTokensFromQuery(userContent: string): string[] {
  const q = (userContent || '').toLowerCase();
  const explicit = Array.from(new Set((q.match(/@([a-z0-9_]{1,15})\b/gi) || [])
    .map((x) => x.replace(/^@/, '').toLowerCase())));
  if (explicit.length) return explicit;

  const words = Array.from(new Set((q.match(/\b[a-z][a-z0-9_]{2,30}\b/g) || [])
    .map((w) => w.toLowerCase())
    .filter((w) => !SOCIAL_HANDLE_STOPWORDS.has(w))));
  return words.slice(0, 8);
}

function explicitHandlesFromText(text: string): string[] {
  const q = (text || '').toLowerCase();
  return Array.from(
    new Set(
      (q.match(/@([a-z0-9_]{1,15})\b/gi) || [])
        .map((x) => x.replace(/^@/, '').toLowerCase()),
    ),
  );
}

function pickXProfileForUser(profiles: XProfileSnapshot[], userContent: string): XProfileSnapshot | null {
  if (!profiles.length) return null;
  const q = (userContent || '').toLowerCase();
  const explicitHandles = Array.from(new Set((q.match(/@([a-z0-9_]{1,15})\b/gi) || [])
    .map((x) => x.replace(/^@/, '').toLowerCase())));
  const normalizedProfiles = profiles.map((p) => ({
    profile: p,
    handle: (p.handle || '').trim().toLowerCase(),
    followers: toSafeNumber(p.followers),
  })).filter((x) => x.handle.length > 0);

  // High-confidence path: explicit @handle must match exactly, otherwise do not show card.
  if (explicitHandles.length > 0) {
    const exactMatches = normalizedProfiles.filter((p) => explicitHandles.includes(p.handle));
    if (!exactMatches.length) return null;
    exactMatches.sort((a, b) => b.followers - a.followers);
    return exactMatches[0].profile;
  }

  // Soft path (e.g. "twitter 的 Erebor"): try token containment, pick highest-followers candidate.
  const tokens = candidateTokensFromQuery(userContent);
  if (!tokens.length) return null;
  const softMatches = normalizedProfiles.filter((p) =>
    tokens.some((t) => p.handle.includes(t) || t.includes(p.handle)),
  );
  if (!softMatches.length) return null;
  softMatches.sort((a, b) => b.followers - a.followers);
  return softMatches[0].profile;
}

const MARKET_HEAVY_WEB3_INTENTS = new Set([
  'token_quote',
  'multi_asset_compare',
  'market_scan',
  'category_scan',
]);

function isMarketHeavyWeb3Intent(intent?: string): boolean {
  return typeof intent === 'string' && MARKET_HEAVY_WEB3_INTENTS.has(intent);
}

function buildWeb3ProviderSources(raw: Web3ResearchResult['raw'] | undefined): SignalSearchSource[] {
  if (!raw) return [];
  const assets = (raw.assets || []).filter((a) => a && (a.name || a.id));
  const assetLabel = assets
    .slice(0, 4)
    .map((a) => a.symbol ? `${a.name || a.id} (${String(a.symbol).toUpperCase()})` : (a.name || a.id || ''))
    .filter(Boolean)
    .join(', ');
  const intent = raw.intent || 'web3';
  const intentLabelMap: Record<string, string> = {
    token_quote: 'CoinGecko Market Data',
    multi_asset_compare: 'CoinGecko Compare Data',
    market_scan: 'CoinGecko Market Scanner',
    category_scan: 'CoinGecko Category Data',
    token_deep_dive: 'CoinGecko Asset Data',
    onchain_scan: 'CoinGecko / GeckoTerminal',
    nft_scan: 'CoinGecko NFT Data',
  };
  const snippetBase = assetLabel
    ? `Structured ${intent.replace(/_/g, ' ')} data for ${assetLabel}.`
    : `Structured ${intent.replace(/_/g, ' ')} data returned by CoinGecko.`;
  const out: SignalSearchSource[] = [
    {
      favicon: 'web',
      title: intentLabelMap[intent] || 'CoinGecko Data',
      domain: 'coingecko.com',
      url: 'https://www.coingecko.com/en/api/documentation',
      snippet: snippetBase,
    },
  ];
  if (raw.via === 'rest') {
    out.push({
      favicon: 'web',
      title: 'CoinGecko REST API',
      domain: 'api.coingecko.com',
      url: 'https://www.coingecko.com/en/api/documentation',
      snippet: 'REST market snapshot used by the Web3 pipeline for deterministic filtering and comparison.',
    });
  }
  const okxSnapshots = Array.isArray(raw.okx) ? raw.okx : [];
  if (okxSnapshots.length) {
    const bases = okxSnapshots.map((s) => s.baseCcy).filter(Boolean).slice(0, 4).join(', ');
    out.push({
      favicon: 'web',
      title: 'Exchange Market Data',
      domain: 'market-data',
      snippet: bases
        ? `Spot and perpetual snapshot (funding, open interest, orderbook depth) for ${bases}.`
        : 'Spot and perpetual market snapshot used by the Web3 pipeline.',
    });
  }
  const okxNewsBundles = Array.isArray(raw.okxNews) ? raw.okxNews : [];
  if (okxNewsBundles.length) {
    const bases = okxNewsBundles.map((b) => b.baseCcy).filter(Boolean).slice(0, 4).join(', ');
    out.push({
      favicon: 'web',
      title: 'News & Sentiment',
      domain: 'news-sentiment',
      snippet: bases
        ? `Aggregated crypto news + sentiment snapshot for ${bases}.`
        : 'Aggregated crypto news + sentiment feed.',
    });
  }
  return out;
}

function web3FocusTokens(raw: Web3ResearchResult['raw'] | undefined): string[] {
  const tokens = new Set<string>();
  for (const asset of raw?.assets || []) {
    const id = String(asset.id || '').trim().toLowerCase();
    const symbol = String(asset.symbol || '').trim().toLowerCase();
    const name = String(asset.name || '').trim().toLowerCase();
    if (id) tokens.add(id);
    if (symbol) tokens.add(symbol);
    if (name) {
      name.split(/\s+/).filter(Boolean).forEach((part) => tokens.add(part.toLowerCase()));
      tokens.add(name);
    }
  }
  return Array.from(tokens).filter((t) => /^[a-z0-9][a-z0-9\s_-]{1,30}$/.test(t));
}

/**
 * Local crypto fallback report — used when the LLM synthesis fails (e.g. quota
 * exhausted) but we already have a real `tokenSnapshot` from CoinGecko.
 *
 * Pure formatting, no LLM call. Every number comes from `snap.market`. This
 * is NOT a substitute for the real cryptoMemoPrompt output — it's a
 * deterministic skeleton so the user can verify the end-to-end flow
 * (TokenCard render + adaptive markdown + <details> blocks + risk bullets)
 * without an AI provider being available.
 */
function buildLocalCryptoFallback(
  snap: any,
  userQuery: string,
  isZh: boolean,
  cause: string,
): string {
  const m = snap.market || {};
  const c = snap.community || {};
  const d = snap.developer || {};
  const sym = String(snap.symbol || '').toUpperCase();
  const name = String(snap.name || sym);
  const today = new Date().toISOString().slice(0, 10);

  const fUsd = (v?: number): string => {
    if (v == null || !Number.isFinite(v)) return 'n/a';
    const a = Math.abs(v);
    if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
    if (a >= 1) return `$${v.toFixed(3)}`;
    return `$${v.toPrecision(3)}`;
  };
  const fNum = (v?: number): string => {
    if (v == null || !Number.isFinite(v)) return 'n/a';
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return String(Math.round(v));
  };
  const fPct = (v?: number): string => {
    if (v == null || !Number.isFinite(v)) return 'n/a';
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  };
  const sign = (v?: number): '偏多' | '偏空' | '中性' | 'bullish' | 'bearish' | 'neutral' => {
    if (v == null) return isZh ? '中性' : 'neutral';
    if (isZh) return v > 2 ? '偏多' : v < -2 ? '偏空' : '中性';
    return v > 2 ? 'bullish' : v < -2 ? 'bearish' : 'neutral';
  };

  const ch24 = m.change24hPct;
  const ch7 = m.change7dPct;
  const ch30 = m.change30dPct;
  const fdvMc = m.fdvOverMcap;
  const circPct = m.circulatingPctOfMax;

  const supplyAngleEn = circPct != null && circPct < 50
    ? `Only ${circPct.toFixed(1)}% of max supply is in circulation — the remaining ${(100 - circPct).toFixed(1)}% is real overhang.`
    : 'No major supply pressure inferred from circulating data.';
  const supplyAngleZh = circPct != null && circPct < 50
    ? `仅 ${circPct.toFixed(1)}% 流通，剩余 ${(100 - circPct).toFixed(1)}% 是真实抛压。`
    : '从流通数据看暂无明显供应压力。';

  const fdvAngleEn = fdvMc != null && fdvMc > 2
    ? `FDV/MC ${fdvMc.toFixed(2)}× — material dilution risk vs sector median (~1.5×).`
    : fdvMc != null
      ? `FDV/MC ${fdvMc.toFixed(2)}× — within healthy range.`
      : 'FDV/MC ratio unavailable.';
  const fdvAngleZh = fdvMc != null && fdvMc > 2
    ? `FDV/MC ${fdvMc.toFixed(2)}×，相对板块中位（~1.5×）存在显著稀释风险。`
    : fdvMc != null
      ? `FDV/MC ${fdvMc.toFixed(2)}×，处合理区间。`
      : 'FDV/MC 数据缺失。';

  const exchanges = (snap.topExchanges || []).slice(0, 5);

  // Stop-loss heuristic: 5% below 24h low, target = 24h high
  const stopUsd = m.low24hUsd != null ? m.low24hUsd * 0.95 : undefined;
  const targetUsd = m.high24hUsd;

  const banner = isZh
    ? `> ⚠️ **降级输出**：实时 LLM 暂时不可用（${cause.slice(0, 80)}）。下面这份报告由后端基于 CoinGecko 实时数据本地生成，结构与正常 crypto-analysis prompt 一致，但**没有调用 AI**——所以缺少叙事性分析。换上有效 AI key 后即恢复完整 LLM 输出。\n`
    : `> ⚠️ **Degraded output**: live LLM unavailable (${cause.slice(0, 80)}). This report was assembled locally from CoinGecko data with the same structure as the normal crypto-analysis prompt, but **no AI was called** — narrative analysis is missing. Restore a valid AI key to get the full LLM output.\n`;

  if (isZh) {
    return [
      banner,
      `**立场** ${sign(ch24)} / **建议** 等待 AI 恢复后获取可执行结论 / **置信度** 中（数据完整但缺叙事） / **关键触发** 24h 涨跌穿越 ${fPct(ch24)}`,
      '',
      `${name}（${sym}）当前 ${fUsd(m.priceUsd)}，24h ${fPct(ch24)}（CoinGecko ${today}）。7 天 ${fPct(ch7)}、30 天 ${fPct(ch30)}。${supplyAngleZh}${fdvAngleZh}`,
      '',
      '## 真实数据快照',
      '',
      '| 指标 | 数值 | 来源 |',
      '|---|---|---|',
      `| 现价 | ${fUsd(m.priceUsd)} | CoinGecko ${today} |`,
      `| 市值 | ${fUsd(m.marketCapUsd)}（#${snap.rank ?? 'n/a'}） | CoinGecko |`,
      `| FDV | ${fUsd(m.fdvUsd)}（FDV/MC ${fdvMc != null ? fdvMc.toFixed(2) + '×' : 'n/a'}） | CoinGecko |`,
      `| 24h 量 | ${fUsd(m.volume24hUsd)} | CoinGecko |`,
      `| 24h 高/低 | ${fUsd(m.high24hUsd)} / ${fUsd(m.low24hUsd)} | CoinGecko |`,
      `| 7d / 30d / 1y | ${fPct(ch7)} / ${fPct(ch30)} / ${fPct(m.change1yPct)} | CoinGecko |`,
      `| 流通 / 上限 | ${fNum(m.circulatingSupply)} / ${fNum(m.maxSupply)}（${circPct != null ? circPct.toFixed(1) + '%' : 'n/a'}） | CoinGecko |`,
      `| ATH | ${fUsd(m.athUsd)}（${fPct(m.athChangePct)}） | CoinGecko |`,
      '',
      '## 社区与开发活跃度',
      '',
      `Twitter ${fNum(c.twitterFollowers)} 粉 · Reddit ${fNum(c.redditSubscribers)} · Telegram ${fNum(c.telegramUsers)}（CoinGecko ${today}）。GitHub 4 周提交 ${d.commits4w ?? 'n/a'} 次，${d.contributors ?? 'n/a'} 位贡献者，star ${fNum(d.githubStars)}。`,
      '',
      '<details><summary>详细数据：主要交易所 / 链接</summary>',
      '',
      exchanges.length
        ? '| 交易所 | 交易对 | 24h 量 (USD) | Trust |\n|---|---|---|---|\n' +
          exchanges.map((e: any) => `| ${e.name} | ${e.pair} | ${fUsd(e.volumeUsd)} | ${e.trustScore || '-'} |`).join('\n')
        : '_暂无交易所数据_',
      '',
      `链接：${snap.homepage ? `[官网](${snap.homepage}) · ` : ''}${snap.twitter ? `[Twitter](https://x.com/${snap.twitter}) · ` : ''}${snap.github ? `[GitHub](${snap.github}) · ` : ''}${snap.whitepaper ? `[白皮书](${snap.whitepaper})` : ''}`,
      '</details>',
      '',
      '## Risks / Kill-switch',
      '',
      `- 跌破 24h 低 ${fUsd(m.low24hUsd)} → 短线结构破坏，止损线建议 ${fUsd(stopUsd)}`,
      `- 突破 24h 高 ${fUsd(targetUsd)} → 上行结构确认，可考虑加仓 / 止盈`,
      `- BTC dominance 上行 + 山寨同步下挫 → 资金离场板块，全平观望`,
      '',
      '## Tags',
      `**重要性**：中 · **分类**：${(snap.categories || []).slice(0, 3).join(' / ') || 'crypto'}`,
      '',
      '**值得关注的问题：**',
      `- 24h 量 ${fUsd(m.volume24hUsd)} 是否能延续到下一个交易日？`,
      `- ${fdvMc != null && fdvMc > 2 ? '剩余 ' + (100 - (circPct ?? 0)).toFixed(1) + '% 锁仓何时进入解锁窗口？' : '社区热度 (Twitter ' + fNum(c.twitterFollowers) + ' 粉) 是否有持续增长？'}`,
      `- 交易所深度（top exchanges 总量）能否承接潜在 1% 流通量的卖盘？`,
    ].join('\n');
  }

  // English version
  return [
    banner,
    `**Bias** ${sign(ch24)} / **Action** Wait for AI to come back online for an actionable verdict / **Confidence** Medium (data complete, narrative missing) / **Trigger** 24h move crosses ${fPct(ch24)}`,
    '',
    `${name} (${sym}) is at ${fUsd(m.priceUsd)}, 24h ${fPct(ch24)} (CoinGecko ${today}). 7d ${fPct(ch7)}, 30d ${fPct(ch30)}. ${supplyAngleEn} ${fdvAngleEn}`,
    '',
    '## Real-data snapshot',
    '',
    '| Metric | Value | Source |',
    '|---|---|---|',
    `| Price | ${fUsd(m.priceUsd)} | CoinGecko ${today} |`,
    `| Market cap | ${fUsd(m.marketCapUsd)} (#${snap.rank ?? 'n/a'}) | CoinGecko |`,
    `| FDV | ${fUsd(m.fdvUsd)} (FDV/MC ${fdvMc != null ? fdvMc.toFixed(2) + '×' : 'n/a'}) | CoinGecko |`,
    `| 24h volume | ${fUsd(m.volume24hUsd)} | CoinGecko |`,
    `| 24h high/low | ${fUsd(m.high24hUsd)} / ${fUsd(m.low24hUsd)} | CoinGecko |`,
    `| 7d / 30d / 1y | ${fPct(ch7)} / ${fPct(ch30)} / ${fPct(m.change1yPct)} | CoinGecko |`,
    `| Circulating / Max | ${fNum(m.circulatingSupply)} / ${fNum(m.maxSupply)} (${circPct != null ? circPct.toFixed(1) + '%' : 'n/a'}) | CoinGecko |`,
    `| ATH | ${fUsd(m.athUsd)} (${fPct(m.athChangePct)}) | CoinGecko |`,
    '',
    '## Community & developer activity',
    '',
    `Twitter ${fNum(c.twitterFollowers)} followers · Reddit ${fNum(c.redditSubscribers)} · Telegram ${fNum(c.telegramUsers)} (CoinGecko ${today}). GitHub: ${d.commits4w ?? 'n/a'} commits in last 4w, ${d.contributors ?? 'n/a'} contributors, ${fNum(d.githubStars)} stars.`,
    '',
    '<details><summary>Details: top exchanges / links</summary>',
    '',
    exchanges.length
      ? '| Exchange | Pair | 24h Vol (USD) | Trust |\n|---|---|---|---|\n' +
        exchanges.map((e: any) => `| ${e.name} | ${e.pair} | ${fUsd(e.volumeUsd)} | ${e.trustScore || '-'} |`).join('\n')
      : '_No exchange data._',
    '',
    `Links: ${snap.homepage ? `[Site](${snap.homepage}) · ` : ''}${snap.twitter ? `[Twitter](https://x.com/${snap.twitter}) · ` : ''}${snap.github ? `[GitHub](${snap.github}) · ` : ''}${snap.whitepaper ? `[Whitepaper](${snap.whitepaper})` : ''}`,
    '</details>',
    '',
    '## Risks / Kill-switch',
    '',
    `- Break below 24h low ${fUsd(m.low24hUsd)} → short-term structure broken, suggested stop ${fUsd(stopUsd)}`,
    `- Break above 24h high ${fUsd(targetUsd)} → upside confirmed, scale in / take profit`,
    `- BTC dominance up + alts down → capital rotating out, flatten`,
    '',
    '## Tags',
    `**Importance**: Medium · **Categories**: ${(snap.categories || []).slice(0, 3).join(' / ') || 'crypto'}`,
    '',
    '**Questions to watch:**',
    `- Will the 24h volume of ${fUsd(m.volume24hUsd)} carry into the next session?`,
    `- ${fdvMc != null && fdvMc > 2 ? 'When does the remaining ' + (100 - (circPct ?? 0)).toFixed(1) + '% locked supply enter unlock windows?' : 'Is community engagement (Twitter ' + fNum(c.twitterFollowers) + ' followers) trending up?'}`,
    `- Can top-exchange depth absorb a 1%-of-float sell?`,
  ].join('\n');
}

function xAuthorFromSource(source: SignalSearchSource): string {
  const url = (source.url || '').trim();
  const m = url.match(/^https?:\/\/(?:www\.)?x\.com\/([A-Za-z0-9_]{1,15})\//i);
  return m?.[1]?.toLowerCase() || '';
}

function tokenizeSourceText(source: SignalSearchSource): string[] {
  return `${source.title || ''} ${source.snippet || ''}`
    .toLowerCase()
    .match(/\b[a-z][a-z0-9_]{1,20}\b/g) || [];
}

function xSourceTemplateFamily(source: SignalSearchSource): string {
  if ((source.domain || '').toLowerCase() !== 'x.com') return '';
  const text = `${source.title || ''} ${source.snippet || ''}`.toLowerCase();
  if (/crypto prices? update|current cryptocurrency prices?|crypto prices?\s+\|/.test(text)) return 'price_update';
  if (/fear\s*&\s*greed|btc dom|market movements|market snapshot/.test(text)) return 'market_snapshot';
  if (/trending:|top gainers|top losers|most volatile/.test(text)) return 'trending_board';
  if (/etf|netflow|net flow/.test(text)) return 'etf_flow';
  return '';
}

function sourceMentionsCount(source: SignalSearchSource, focusTokens: string[]): number {
  if (!focusTokens.length) return 0;
  const text = `${source.title || ''} ${source.snippet || ''}`.toLowerCase();
  return focusTokens.filter((token) => token && new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)).length;
}

function looksLikeLowValuePriceBotSource(source: SignalSearchSource): boolean {
  if ((source.domain || '').toLowerCase() !== 'x.com') return false;
  const text = `${source.title || ''} ${source.snippet || ''}`.toLowerCase();
  const boilerplatePatterns = [
    /crypto prices? update/,
    /current cryptocurrency prices?/,
    /fear\s*&\s*greed/,
    /trending:/,
    /\b\d{1,2}:\d{2}\s*(am|pm)\b/,
    /% Δ/,
  ];
  const distinctTickers = new Set(
    (text.match(/\b(btc|eth|sol|xrp|bnb|dot|mog|pepe|doge|ada|trx|link|usdc|usdt|ordi|based|rave)\b/g) || [])
      .map((m) => m.toLowerCase()),
  ).size;
  return boilerplatePatterns.some((pattern) => pattern.test(text)) || distinctTickers >= 4;
}

function rankAndLimitSources(
  sources: SignalSearchSource[],
  options: { web3Intent?: string; max?: number; focusTokens?: string[] } = {},
): SignalSearchSource[] {
  const max = options.max || 20;
  const marketHeavy = isMarketHeavyWeb3Intent(options.web3Intent);
  const seen = new Set<string>();
  const domainCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  const templateCounts = new Map<string, number>();
  const focusTokens = Array.from(new Set((options.focusTokens || []).map((t) => t.toLowerCase()).filter(Boolean)));
  const ranked = [...sources]
    .map((source, idx) => {
      const domain = (source.domain || '').toLowerCase();
      const text = `${source.title || ''} ${source.snippet || ''}`.toLowerCase();
      const author = xAuthorFromSource(source);
      const templateFamily = xSourceTemplateFamily(source);
      const tokenList = tokenizeSourceText(source);
      const distinctTickers = new Set(
        tokenList.filter((m) => /^(btc|bitcoin|eth|ethereum|sol|solana|xrp|bnb|dot|mog|pepe|doge|ada|trx|link|usdc|usdt|ordi|based|rave|siren)$/i.test(m)),
      ).size;
      const focusHits = sourceMentionsCount(source, focusTokens);
      let score = 0;
      if (domain === 'coingecko.com' || domain === 'api.coingecko.com') score += 120;
      if (/coinmarketcap|kraken|okx|binance|coindesk|theblock|cointelegraph|decrypt|blockworks/.test(domain)) score += 60;
      if (domain === 'exa.ai') score -= 10;
      if (marketHeavy && domain === 'x.com') score -= 35;
      if (marketHeavy && looksLikeLowValuePriceBotSource(source)) score -= 35;
      if (marketHeavy && templateFamily) score -= 20;
      if (marketHeavy && distinctTickers >= 5) score -= 20;
      if (marketHeavy && focusTokens.length > 0) {
        if (focusHits === 0) score -= 30;
        else score += Math.min(18, focusHits * 6);
        if (distinctTickers > Math.max(3, focusHits + 1)) score -= 15;
      }
      if (marketHeavy && /price|market cap|24h|compare|comparison|scanner|structured/i.test(text)) score += 12;
      if (!marketHeavy && domain === 'x.com') score += 15;
      return { source, idx, score, author, templateFamily };
    })
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  const out: SignalSearchSource[] = [];
  for (const entry of ranked) {
    const source = entry.source;
    const key = `${source.domain}|${source.url || source.title}`;
    if (seen.has(key)) continue;
    const domain = (source.domain || '').toLowerCase();
    const count = domainCounts.get(domain) || 0;
    const domainLimit = marketHeavy
      ? (domain === 'x.com' ? 2 : domain === 'exa.ai' ? 1 : 4)
      : (domain === 'x.com' ? 6 : 4);
    if (count >= domainLimit) continue;
    if (marketHeavy && domain === 'x.com') {
      if (entry.author) {
        const authorCount = authorCounts.get(entry.author) || 0;
        if (authorCount >= 1) continue;
        authorCounts.set(entry.author, authorCount + 1);
      }
      if (entry.templateFamily) {
        const templateCount = templateCounts.get(entry.templateFamily) || 0;
        if (templateCount >= 1) continue;
        templateCounts.set(entry.templateFamily, templateCount + 1);
      }
    }
    seen.add(key);
    domainCounts.set(domain, count + 1);
    out.push(source);
    if (out.length >= max) break;
  }
  return out;
}

function combinePreferredSources(
  searchSources: SignalSearchSource[],
  web3Sources: SignalSearchSource[],
  options: { web3Intent?: string; max?: number; focusTokens?: string[] } = {},
): SignalSearchSource[] {
  const merged = mergeSignalSources(web3Sources, searchSources, Math.max(options.max || 20, 30));
  return rankAndLimitSources(merged, options);
}

function normalizeIncomingImages(images: unknown): AgentChatImage[] {
  if (!Array.isArray(images)) return [];
  const normalized: AgentChatImage[] = [];
  for (const img of images) {
    if (!img || typeof img !== 'object') continue;
    const candidate = img as { url?: unknown; mime?: unknown; name?: unknown };
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
    if (!url) continue;
    normalized.push({
      url,
      mime: typeof candidate.mime === 'string' ? candidate.mime : undefined,
      name: typeof candidate.name === 'string' ? candidate.name : undefined,
    });
    if (normalized.length >= 4) break;
  }
  return normalized;
}

type ChatMeta = {
  images?: AgentChatImage[];
  /** Text-only image understanding for the current user turn, produced before routing. */
  routeImageDigest?: string;
  /** ISO timestamp when routeImageDigest was generated */
  routeImageDigestAt?: string;
  /** Textual memory of prior user image turns (vision stripped from model context). */
  imageSummary?: string;
  /** ISO timestamp when imageSummary was generated */
  imageSummaryAt?: string;
  /** Original images archived when converting a user image turn to summary-only */
  archivedImages?: AgentChatImage[];
  [key: string]: unknown;
};

function safeParseChatMeta(raw: string | null | undefined): ChatMeta | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ChatMeta;
  } catch {
    return null;
  }
}

function stringifyChatMeta(meta: ChatMeta): string {
  return JSON.stringify(meta);
}

function appendImageArchiveToUserText(userText: string, urls: string[]): string {
  const unique = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean)));
  if (unique.length === 0) return userText;
  const isZh = /[\u4e00-\u9fff]/.test(userText);
  const header = isZh ? '【历史图片链接】' : '[Earlier image links]';
  const lines = unique.map((u, i) => (isZh ? `${i + 1}. ${u}` : `${i + 1}. ${u}`)).join('\n');
  const block = `${header}\n${lines}`;
  if (!userText.trim()) return block;
  return `${userText.trim()}\n\n${block}`;
}

function buildModelUserContent(originalText: string, meta: ChatMeta | null): string {
  const urls = (meta?.archivedImages || []).map((i) => i.url).filter(Boolean);
  const summary = typeof meta?.imageSummary === 'string' ? meta.imageSummary.trim() : '';
  const routeImageDigest = typeof meta?.routeImageDigest === 'string' ? meta.routeImageDigest.trim() : '';
  let text = originalText || '';
  if (routeImageDigest) {
    const isZh = /[\u4e00-\u9fff]/.test(originalText) || /[\u4e00-\u9fff]/.test(routeImageDigest);
    const header = isZh ? '【图片理解】' : '[Image understanding]';
    text = text.trim() ? `${text.trim()}\n\n${header}\n${routeImageDigest}` : `${header}\n${routeImageDigest}`;
  }
  if (summary) {
    const isZh = /[\u4e00-\u9fff]/.test(originalText) || /[\u4e00-\u9fff]/.test(summary);
    const header = isZh ? '【历史图片摘要】' : '[Earlier image summary]';
    text = text.trim() ? `${text.trim()}\n\n${header}\n${summary}` : `${header}\n${summary}`;
  }
  if (urls.length) {
    text = appendImageArchiveToUserText(text, urls);
  }
  return text;
}

async function summarizeImagesForUserTurn(args: {
  ai: LokaAIService;
  userText: string;
  images: AgentChatImage[];
}): Promise<string> {
  const { ai, userText, images } = args;
  if (!images.length) return '';
  if (!ai.isConfigured) return '';

  const isZh = /[\u4e00-\u9fff]/.test(userText);

  const prompt = `You are extracting durable chat memory from images for a multi-turn assistant.
Return JSON ONLY (no markdown) with this schema:
{"summary":"..."}

Rules:
- Write the summary in ${isZh ? 'Chinese' : 'English'}.
- Be faithful; if unreadable, say so briefly.
- Focus on text, numbers, charts, UI labels, logos, and any task implied by the image(s).
- Keep it compact: <= 900 characters.
- Do not include chain-of-thought.

User message text (may be empty):
${userText || '(empty)'}`;

  const res = await ai.chat([{ role: 'user', content: prompt, images }], 'system', undefined);
  const raw = (res.content || '').trim();
  try {
    const parsed = JSON.parse(raw) as { summary?: string };
    return typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return '';
    try {
      const parsed = JSON.parse(m[0]) as { summary?: string };
      return typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    } catch {
      return '';
    }
  }
}

async function archivePriorUserImageTurns(args: {
  ai: LokaAIService;
  userId: string;
  sessionId: string;
  currentMessageId: string;
}) {
  const { ai, userId, sessionId, currentMessageId } = args;
  try {
    const prior = await prisma.chatMessage.findMany({
      where: { userId, sessionId, role: 'user' },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, content: true, metadata: true, createdAt: true },
    });

    for (const row of prior) {
      if (row.id === currentMessageId) continue;
      const meta = safeParseChatMeta(row.metadata);
      const imgs = normalizeIncomingImages(meta?.images);
      if (!imgs.length) continue;
      if (meta?.imageSummary && String(meta.imageSummary).trim()) continue;

      const summary = await summarizeImagesForUserTurn({ ai, userText: row.content || '', images: imgs });
      const nextMeta: ChatMeta = { ...(meta || {}) };
      nextMeta.archivedImages = imgs;
      delete nextMeta.images;
      nextMeta.imageSummary = summary || (imgs.length ? '（图片内容摘要生成失败：已保留链接）' : '');
      nextMeta.imageSummaryAt = new Date().toISOString();

      await prisma.chatMessage.update({
        where: { id: row.id },
        data: { metadata: stringifyChatMeta(nextMeta) },
      });
    }
  } catch (e: any) {
    console.warn('[agent:chat] archivePriorUserImageTurns failed:', e?.message || e);
  }
}

export function setupSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: [config.frontendUrl, 'https://www.loka.cash', 'https://loka.cash', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'https://localhost', 'capacitor://localhost'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/api/socket.io',
  });

  // Safety-net: sweep orphaned session state every 5 minutes.
  // Only removes sessions that have been "active" for more than 30 minutes —
  // those are definitively orphaned (longest Roundtable run is ~5 min).
  const SESSION_MAX_AGE_MS = 30 * 60 * 1000;
  setInterval(() => {
    const now = Date.now();
    let swept = 0;

    for (const [sid, startedAt] of chatSessionStartTimes) {
      if (now - startedAt > SESSION_MAX_AGE_MS) {
        const ctrl = chatAbortControllers.get(sid);
        if (ctrl) { ctrl.abort(); chatAbortControllers.delete(sid); }
        activeChatSessions.delete(sid);
        chatSessionStartTimes.delete(sid);
        swept++;
      }
    }

    // Prune dedup map entries older than 30s regardless of size
    for (const [k, v] of chatDedupMap) {
      if (now - v > 30_000) chatDedupMap.delete(k);
    }

    if (swept > 0) {
      console.warn(`[sweep] Cleaned ${swept} orphaned chat session(s)`);
    }
  }, 5 * 60 * 1000);

  // JWT authentication middleware for WebSocket.
  // Tokenless connections are accepted as guests when ENABLE_GUEST_MODE is on;
  // guests are limited to Auto mode in the agent:chat handler below.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const guestIdRaw = socket.handshake.auth?.guestId || socket.handshake.query?.guestId;

    if (token) {
      try {
        const payload = await verifyToken(token as string);
        (socket as any).userId = payload.userId || payload.sub?.replace('did:privy:', '');
        (socket as any).isGuest = false;
        return next();
      } catch {
        return next(new Error('Invalid or expired token'));
      }
    }

    if (!GUEST_CONFIG.enabled) {
      return next(new Error('Authentication required'));
    }

    const guestId = typeof guestIdRaw === 'string' && guestIdRaw.trim() ? guestIdRaw.trim() : null;
    if (!guestId) {
      return next(new Error('Missing guestId for unauthenticated connection'));
    }
    // Length sanity — client uses crypto.randomUUID() (36 chars).
    if (guestId.length < 8 || guestId.length > 128) {
      return next(new Error('Invalid guestId'));
    }

    // Synthetic userId so downstream socket.join/emitToUser/emitters work
    // without per-call branching. Any DB write that uses this as a FK must
    // be guarded by `if (!isGuest)` — see agent:chat handler.
    (socket as any).userId = `guest:${guestId}`;
    (socket as any).isGuest = true;
    (socket as any).guestId = guestId;
    // Best-effort IP from handshake; proxies may require X-Forwarded-For handling upstream.
    (socket as any).guestIp =
      (socket.handshake.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      socket.handshake.address ||
      null;
    next();
  });

  io.on('connection', (socket) => {
    const userId = (socket as any).userId as string;
    const isGuest = Boolean((socket as any).isGuest);
    const guestId = (socket as any).guestId as string | undefined;
    const guestIp = (socket as any).guestIp as string | undefined;

    if (process.env.SOCKET_VERBOSE_LOG === '1') {
      if (isGuest) {
        console.log(`🔌 Guest connected: ${socket.id} (guestId=${guestId} synth=${userId})`);
      } else {
        console.log(`🔌 Client connected: ${socket.id} (user: ${userId})`);
      }
    }

    // Every socket joins its own room so emitToUser routes correctly.
    // For guests this is `user:guest:<uuid>` — isolated from real users.
    socket.join(`user:${userId}`);

    if (!isGuest) {
      // ── Online status (authenticated users only) ──
      onlineUsers.add(userId);
      socket.broadcast.emit('user:online', { userId });

      // ── Auto-join group rooms from DB ──
      prisma.groupMember.findMany({ where: { userId } })
        .then(members => {
          members.forEach(m => socket.join(`group:${m.groupId}`));
        })
        .catch(err => console.error('Failed to auto-join DB groups:', err));
    }

    // Join group chat room (validated - userId is already authenticated)
    socket.on('join-group', (groupId: string) => {
      if (typeof groupId === 'string' && groupId.length < 100) {
        socket.join(`group:${groupId}`);
      }
    });

    socket.on('leave-group', (groupId: string) => {
      if (typeof groupId === 'string') {
        socket.leave(`group:${groupId}`);
      }
    });

    // ── DM: typing indicator ──
    socket.on('dm:typing', (data: { conversationId: string; recipientId: string }) => {
      if (data?.recipientId && data?.conversationId) {
        emitToUser(data.recipientId, 'dm:typing', {
          userId,
          conversationId: data.conversationId,
        });
      }
    });

    // ── Get online users (client request) ──
    socket.on('get-online-users', (callback: (ids: string[]) => void) => {
      if (typeof callback === 'function') {
        callback(Array.from(onlineUsers));
      }
    });

    socket.on('agent:research:check', (data: { sessionId: string }, callback: (res: { isRunning: boolean }) => void) => {
      if (typeof callback === 'function') {
        callback({ isRunning: activeResearchSessions.has(data.sessionId) });
      }
    });

    // ── Deep Research Agent ──
    socket.on('agent:research', async (data: { topic: string; deep?: boolean; days?: number; sessionId?: string }) => {
      if (!data?.topic) return;
      socket.emit('agent:research:started', { topic: data.topic });

      const sessionId = data.sessionId || crypto.randomUUID();
      activeResearchSessions.add(sessionId);

      try {
        await prisma.chatMessage.create({
          data: {
            userId,
            sessionId,
            role: 'user',
            content: data.topic,
            agentId: 'research'
          }
        });
      } catch (dbErr) {
        console.error('Failed to save user message:', dbErr);
      }

      try {
        const result = await researchService.runDeepResearch(
          data.topic,
          { deep: data.deep, days: data.days },
          (log) => {
            emitToUser(userId, 'agent:research:progress', { topic: data.topic, sessionId, log });
          }
        );

        try {
          await prisma.chatMessage.create({
            data: {
              userId,
              sessionId,
              role: 'assistant',
              content: result.summary,
              agentId: 'research'
            }
          });
        } catch (dbErr) {
          console.error('Failed to save assistant message:', dbErr);
        }

        emitToUser(userId, 'agent:research:done', { ...result, sessionId });
        activeResearchSessions.delete(sessionId);
      } catch (err: any) {
        emitToUser(userId, 'agent:research:error', { topic: data.topic, sessionId, error: err.message });
        activeResearchSessions.delete(sessionId);
      }
    });

    // ── AI Hedge Fund Agent ──
    socket.on('agent:hedgefund:check', (data: { sessionId: string }, callback: (res: { isRunning: boolean }) => void) => {
      if (typeof callback === 'function') {
        callback({ isRunning: activeHedgeFundSessions.has(data.sessionId) });
      }
    });

    socket.on('agent:hedgefund', async (data: { tickers: string[]; sessionId?: string; showReasoning?: boolean }) => {
      if (!data?.tickers?.length) return;

      const sessionId = data.sessionId || crypto.randomUUID();
      activeHedgeFundSessions.add(sessionId);

      let processedTickers = [...data.tickers];

      // Extraction for natural language queries
      if (processedTickers.length === 1) {
        const query = processedTickers[0];
        const hasActionVerb = /^(分析|看|查|帮|对比|能不能)/.test(query);
        const isSentence = hasActionVerb || (query.length > 5 && /[\u4e00-\u9fa5]/.test(query)) || query.split(' ').length > 2;
        if (isSentence) {
          emitToUser(userId, 'agent:hedgefund:progress', { sessionId, log: '[NameResolver] AI is extracting stock codes from your query...' });
          try {
            const extPrompt = `You are a strict Named Entity Recognition (NER) system for finance.
Extract ONLY company names, stock tickers, or cryptocurrency symbols from the user's text.
Rules:
1. Return ONLY a comma-separated list of the recognized entities.
2. Strip out all conversational words, verbs, and punctuation.
3. If no companies, tickers, or assets are found, return the word "NONE". Do NOT return the original text.

Examples:
"能简单帮我分析腾讯么" -> 腾讯
"看看AAPL和特斯拉" -> AAPL,特斯拉
"你能做什么？" -> NONE
"帮我查一下BTC最新的情况" -> BTC

Text: "${query}"`;
            const extResponse = await aiService.chat([{ role: 'user', content: extPrompt }], 'system');
            const extracted = extResponse.content?.trim() || 'NONE';
            if (extracted !== 'NONE' && extracted !== query) {
              processedTickers = extracted.split(',').map(s => s.trim());
              emitToUser(userId, 'agent:hedgefund:progress', { sessionId, log: `[NameResolver] AI Extracted: ${processedTickers.join(', ')}` });
            }
          } catch (e) {
            console.error('AI Extraction failed', e);
          }
        }
      }

      const tickerStr = processedTickers.join(', ');
      emitToUser(userId, 'agent:hedgefund:started', { tickers: processedTickers, sessionId });

      // Save user message
      try {
        await prisma.chatMessage.create({
          data: {
            userId,
            sessionId,
            role: 'user',
            content: `Analyze ${tickerStr} using AI Hedge Fund`,
            agentId: 'hedgefund'
          }
        });
      } catch (dbErr) {
        console.error('Failed to save hedgefund user message:', dbErr);
      }

      try {
        const result = await hedgefundService.runAnalysis(
          {
            tickers: processedTickers,
            showReasoning: data.showReasoning ?? true,
          },
          (log) => {
            emitToUser(userId, 'agent:hedgefund:progress', { sessionId, log });
          }
        );

        const report = hedgefundService.formatReport(result);

        // Save assistant message
        try {
          await prisma.chatMessage.create({
            data: {
              userId,
              sessionId,
              role: 'assistant',
              content: report,
              agentId: 'hedgefund'
            }
          });
        } catch (dbErr) {
          console.error('Failed to save hedgefund assistant message:', dbErr);
        }

        emitToUser(userId, 'agent:hedgefund:done', { sessionId, report });
        activeHedgeFundSessions.delete(sessionId);
      } catch (err: any) {
        emitToUser(userId, 'agent:hedgefund:error', { sessionId, error: err.message });
        activeHedgeFundSessions.delete(sessionId);
      }
    });

    // ── Stock Analysis Agent (Structured Stream + Reconnection) ──
    socket.on('agent:stockanalysis:check', (data: { sessionId: string }, callback: (res: { isRunning: boolean; steps?: any[]; report?: string }) => void) => {
      if (typeof callback === 'function') {
        const buffer = stockAnalysisService.getSessionBuffer(data.sessionId);
        if (buffer) {
          callback({
            isRunning: buffer.status === 'running',
            steps: buffer.steps,
            report: buffer.finalReport,
          });
        } else {
          callback({ isRunning: activeStockAnalysisSessions.has(data.sessionId) });
        }
      }
    });

    socket.on('agent:stockanalysis', async (data: { tickers: string[]; sessionId?: string; message?: string }) => {
      if (!data?.tickers?.length && !data?.message) return;

      const sessionId = data.sessionId || crypto.randomUUID();
      activeStockAnalysisSessions.add(sessionId);

      // Use raw message if provided (natural language), else join tickers
      const rawQuery = data.message || (data.tickers || []).join(', ');
      const userContent = data.message || `Analyze ${(data.tickers || []).join(', ')} using Stock Analysis Agent`;

      emitToUser(userId, 'agent:stockanalysis:started', { sessionId, query: rawQuery });

      // Save user message
      try {
        await prisma.chatMessage.create({
          data: {
            userId,
            sessionId,
            role: 'user',
            content: userContent,
            agentId: 'stockanalysis'
          }
        });
      } catch (dbErr) {
        console.error('Failed to save stockanalysis user message:', dbErr);
      }

      // Use the new stream-based analysis (structured JSONL events)
      stockAnalysisService.runStreamAnalysis(
        rawQuery,
        sessionId,
        userId,
        // onStep: forward structured step events
        (step) => {
          emitToUser(userId, 'agent:stockanalysis:step', { sessionId, ...step });
        },
        // onDone: save report + notify
        async (report: string) => {
          try {
            await prisma.chatMessage.create({
              data: {
                userId,
                sessionId,
                role: 'assistant',
                content: report,
                agentId: 'stockanalysis'
              }
            });
          } catch (dbErr) {
            console.error('Failed to save stockanalysis assistant message:', dbErr);
          }
          emitToUser(userId, 'agent:stockanalysis:done', { sessionId, report });
          activeStockAnalysisSessions.delete(sessionId);
        },
        // onError
        (error: string) => {
          emitToUser(userId, 'agent:stockanalysis:error', { sessionId, error });
          activeStockAnalysisSessions.delete(sessionId);
        }
      );
    });

    // ── SuperAgent Chat (Streaming & Consensus) ──
    socket.on('agent:chat:check', (data: { sessionId: string }, callback: (res: { isRunning: boolean; mode?: string }) => void) => {
      if (typeof callback === 'function') {
        callback({ isRunning: activeChatSessions.has(data.sessionId), mode: activeChatSessions.get(data.sessionId) });
      }
    });

    /**
     * Reconnect: return buffered stock-analysis steps + optional final report (session + buffer + search).
     */
    socket.on(
      'agent:chat:replay',
      (
        data: { sessionId: string },
        callback?: (res: {
          ok: boolean;
          isRunning?: boolean;
          steps?: unknown[];
          report?: string;
          status?: string;
        }) => void,
      ) => {
        if (typeof callback !== 'function') return;
        const sid = data?.sessionId;
        if (!sid) {
          callback({ ok: false });
          return;
        }
        const chatBuffer = getChatReplayBuffer(sid);
        if (chatBuffer) {
          callback({
            ok: true,
            isRunning: chatBuffer.status === 'running',
            steps: chatBuffer.toolTraceSteps,
            modules: chatBuffer.modules,
            mode: chatBuffer.mode,
            // Actual post-routing mode (e.g. Auto resolved to 'roundtable').
            // Drives the 5-stage pipeline + Workbench UI on replay.
            routedMode: chatBuffer.routedMode,
            report: chatBuffer.content || undefined,
            status: chatBuffer.status,
            // Round-trip the most recent TokenCard snapshot so a client that
            // navigated away mid-stream restores the card immediately, instead
            // of waiting for the next history fetch.
            tokenCard: chatBuffer.tokenCard,
            // Roundtable agent-debate event stream — replayed in order on the
            // client to rebuild rtRounds + rtConsensus + Workbench UI.
            rtEvents: chatBuffer.rtEvents || [],
          } as any);
          return;
        }
        const buffer = stockAnalysisService.getSessionBuffer(sid);
        if (buffer) {
          callback({
            ok: true,
            isRunning: buffer.status === 'running',
            steps: buffer.steps,
            report: buffer.finalReport,
            status: buffer.status,
          });
          return;
        }
        if (activeChatSessions.has(sid) || activeStockAnalysisSessions.has(sid)) {
          callback({ ok: true, isRunning: true, steps: [], status: 'running' });
          return;
        }
        callback({ ok: false, isRunning: false, steps: [], status: 'unknown' });
      },
    );

    socket.on('agent:chat:stop', (data: { sessionId?: string }) => {
      const sid = data?.sessionId;
      if (!sid) return;
      const ctrl = chatAbortControllers.get(sid);
      if (ctrl) {
        console.log(`[agent:chat:stop] User-initiated abort for session ${sid}`);
        ctrl.abort();
        chatAbortControllers.delete(sid);
        // Acknowledge to ALL listening clients (chat thread + sidebar) so
        // their loading indicators clear immediately. The downstream abort
        // branches in agent:chat will also call emitStreamCancelled when they
        // wind down — duplicate emission is harmless (the client treats this
        // as idempotent).
        const sockUserId = (socket as any).userId as string | undefined;
        if (sockUserId) {
          emitToUser(sockUserId, 'agent:chat:cancelled', {
            sessionId: sid,
            reason: 'user_stop',
          });
        }
      }
    });

    socket.on('agent:chat', async (data: { content?: string; mode: string; sessionId?: string; agentId?: string; hidden?: boolean; images?: AgentChatImage[]; analystIds?: string[]; assetHint?: { sym?: string; name?: string; kind?: string; coingeckoId?: string }; domain?: 'stocks' | 'web3' }) => {
      const userContent = typeof data?.content === 'string' ? data.content : '';
      const images = normalizeIncomingImages(data?.images);
      const hasImages = images.length > 0;
      if (!userContent.trim() && !hasImages) return;

      // Preserve the user's original mode choice — `data.mode` may be mutated
      // downstream by the Auto-routing block so we can't rely on it later.
      const requestedMode: 'auto' | 'fast' | 'roundtable' =
        data.mode === 'fast' || data.mode === 'roundtable' ? data.mode : 'auto';

      const sessionId = data.sessionId || crypto.randomUUID();
      const dedupImageKey = images.map((img) => img.url).join('|');

      // ── Rate limit: max 3 agent:chat events per 10 seconds per socket ──
      {
        const now = Date.now();
        const recent = (socketRateLimiter.get(socket.id) || []).filter(t => now - t < 10_000);
        if (recent.length >= 3) {
          const retryAfter = Math.ceil((recent[0] + 10_000 - now) / 1000);
          socket.emit('agent:chat:error', {
            sessionId,
            error: 'rate_limited',
            retryAfter,
            hint: `Sending too fast. Please wait ${retryAfter}s.`,
          });
          return;
        }
        recent.push(now);
        socketRateLimiter.set(socket.id, recent);
      }

      // ── Dedup guard: skip identical content for the same session within 3s ──
      const dedupKey = `${sessionId}::${userContent}::${dedupImageKey}`;
      const now = Date.now();
      const lastSeen = chatDedupMap.get(dedupKey);
      if (lastSeen && now - lastSeen < 3000) {
        console.log(`[agent:chat] Dedup: skipping duplicate message for session ${sessionId}`);
        return;
      }
      chatDedupMap.set(dedupKey, now);
      // Prune old entries periodically
      if (chatDedupMap.size > 100) {
        for (const [k, v] of chatDedupMap) {
          if (now - v > 10000) chatDedupMap.delete(k);
        }
      }

      // ── Guest gate: only Auto is available without login ──
      if (isGuest) {
        if (data.mode !== 'auto') {
          socket.emit('agent:chat:error', {
            sessionId,
            error: 'login_required',
            mode: data.mode,
            hint: 'Sign in to unlock Fast and Roundtable modes.',
          });
          return;
        }
        try {
          const guestResult = await consumeGuestAuto(guestId as string, guestIp || null);
          if (!guestResult.allowed) {
            socket.emit('agent:chat:error', {
              sessionId,
              error: guestResult.error,
              mode: 'auto',
              resetAt: guestResult.resetAt.toISOString(),
              hint: 'Sign in for a free account — you\'ll get more Auto turns plus Fast and Roundtable.',
            });
            console.log(`[agent:chat] Guest quota exhausted: guestId=${guestId} err=${guestResult.error} resetAt=${guestResult.resetAt.toISOString()}`);
            return;
          }
          console.log(`[agent:chat] Guest auto consumed: guestId=${guestId} remaining=${guestResult.remaining}`);
        } catch (err) {
          console.error('[agent:chat] Guest quota check failed, allowing through:', (err as Error).message);
          // Fail-open so a DB blip doesn't block the free tier.
        }
      }

      // ── Quota guard: Fast and Roundtable modes are metered; Auto is free. ──
      // User-facing PRD rule: selecting Fast or Roundtable consumes exactly one
      // quota credit up-front, regardless of downstream routing decisions. If
      // the user is out of quota, abort before any work starts.
      if (!isGuest && (data.mode === 'fast' || data.mode === 'roundtable')) {
        try {
          const quotaResult = await consumeQuota(userId, data.mode);
          if (!quotaResult.allowed) {
            socket.emit('agent:chat:error', {
              sessionId,
              error: 'quota_exhausted',
              mode: quotaResult.mode,
              resetAt: quotaResult.resetAt.toISOString(),
              hint: 'Upgrade your plan or switch to Auto mode.',
            });
            console.log(`[agent:chat] Quota exhausted: user=${userId} mode=${data.mode} resetAt=${quotaResult.resetAt.toISOString()}`);
            return;
          }
          console.log(`[agent:chat] Quota consumed: user=${userId} mode=${data.mode} remaining=${quotaResult.remaining}`);
        } catch (err) {
          console.error('[agent:chat] Quota check failed, allowing through:', (err as Error).message);
          // Fail-open on quota-service errors so a DB blip doesn't block users.
        }
      }

      // ── Cancel any previous in-flight run for the same session ──
      const prevAbort = chatAbortControllers.get(sessionId);
      if (prevAbort) {
        console.log(`[agent:chat] Aborting previous run for session ${sessionId}`);
        prevAbort.abort();
      }
      const abortController = new AbortController();
      chatAbortControllers.set(sessionId, abortController);
      const isAborted = () => abortController.signal.aborted;

      console.log('[agent:chat]', {
        sessionId,
        contentPreview: userContent.slice(0, 80),
        images: images.length,
      });

      const emitter = createModuleEmitter(userId, sessionId);

      let latestUserMessageId: string | null = null;
      // Guests have no DB presence (no User row, no ChatMessage history).
      // Their conversation lives entirely in localStorage on the client.
      if (!data.hidden && !isGuest) {
        try {
          const userMeta = hasImages ? JSON.stringify({ images }) : null;
          const createdUser = await prisma.chatMessage.create({
            data: { userId, sessionId, role: 'user', content: userContent, agentId: 'superagent', metadata: userMeta },
            select: { id: true },
          });
          latestUserMessageId = createdUser.id;
        } catch (dbErr) { }
      }

      // When a new user image turn arrives, archive prior user image turns into summary+links
      // so subsequent model calls only keep the latest round as true vision input.
      if (latestUserMessageId) {
        await archivePriorUserImageTurns({
          ai: aiService,
          userId,
          sessionId,
          currentMessageId: latestUserMessageId,
        });
      }

      // ── Query session history for multi-turn context ──
      const MAX_HISTORY_FOR_ROUTING = 6;
      const MAX_HISTORY_FOR_SYNTHESIS = 8;
      const ASSISTANT_CONTENT_CAP = 300;

      const sessionHistory = await prisma.chatMessage.findMany({
        where: { userId, sessionId },
        orderBy: { createdAt: 'asc' },
        take: MAX_HISTORY_FOR_SYNTHESIS,
        select: { role: true, content: true, metadata: true },
      });

      const formatHistory = (messages: { role: string; content: string; metadata: string | null }[], limit: number): string => {
        return messages
          .slice(-limit)
          .map(m => {
            const label = m.role === 'user' ? 'User' : 'Assistant';
            const meta = m.role === 'user' ? safeParseChatMeta(m.metadata) : null;
            const baseText = m.role === 'user' ? buildModelUserContent(m.content || '', meta) : m.content;
            const text = m.role === 'assistant' && baseText.length > ASSISTANT_CONTENT_CAP
              ? baseText.slice(0, ASSISTANT_CONTENT_CAP) + '...(truncated)'
              : baseText;
            return `[${label}]: ${text}`;
          })
          .join('\n');
      };

      activeChatSessions.set(sessionId, 'running');
      chatSessionStartTimes.set(sessionId, Date.now());
      startChatReplayBuffer(sessionId, data.mode);
      emitter.emitStarted('auto', 'Super Agent', data.hidden);
      socket.emit('agent:chat:routing', { sessionId });
      const requestStartedAt = Date.now();
      const sinceRequestStart = () => Date.now() - requestStartedAt;
      const asSeconds = (ms: number) => (ms / 1000).toFixed(3);

      // ══════════════════════════════════════════════════════════════════
      //   Aegean Deep-Dive early gate (feature-flag gated; OFF by default)
      //   See: docs/aegean-deep-analysis-migration.md
      //
      //   When ENABLE_AEGEAN_DEEP_ANALYSIS=true and user picks Roundtable
      //   with a single-asset question → route to aegean /investment/analyze.
      //   Non-single-asset → silent fallback to Fast mode.
      //   Flag OFF (default) or asset extraction failure → flow through to
      //   legacy Roundtable path (zero behavioral change).
      // ══════════════════════════════════════════════════════════════════
      if (
        process.env.ENABLE_AEGEAN_DEEP_ANALYSIS === 'true' &&
        data.mode === 'roundtable' &&
        !hasImages
      ) {
        try {
          const asset = await extractAsset(userContent);
          if (asset) {
            // ── Single-asset → route to aegean deep-dive ──
            console.log(
              `[deep-dive] routing to aegean: symbol=${asset.symbol} market=${asset.market} type=${asset.asset_type}`,
            );

            // Minimal stepper progression so the Workbench UI animates.
            // Phase 2 will emit fine-grained events from aegean's event_sink;
            // for v1 we just bookend the stepper around the single HTTP call.
            emitter.emitModule('route', 'done', { mode: 'roundtable', route: 'aegean-deep-dive' });
            emitter.emitModule('summon', 'done', { roster: asset.symbol });
            emitter.emitModule('research', 'active', { provider: 'aegean' });

            const aegeanRaw = await runAegeanDeepAnalysis(userId, asset, userContent);

            emitter.emitModule('research', 'done', { provider: 'aegean' });
            emitter.emitModule('debate', 'done', {
              roundsUsed: aegeanRaw.consensus?.rounds_used ?? 1,
            });
            emitter.emitModule('consensus', 'done', {
              action: aegeanRaw.recommendation?.action,
              confidence: aegeanRaw.recommendation?.confidence,
            });

            const transformed = transformAegeanDeepAnalysis(aegeanRaw, userContent);
            const finalMarkdown = transformed.consensus.finalAnswer;

            // Persist assistant message with the transformed result so history
            // replay shows the same content.
            if (!isGuest) {
              try {
                await prisma.chatMessage.create({
                  data: {
                    userId,
                    sessionId,
                    role: 'assistant',
                    content: finalMarkdown,
                    metadata: stringifyChatMeta({
                      consensusResult: transformed,
                      deepDive: transformed.deepDive,
                      mode: 'roundtable',
                      provider: 'aegean-investment-analyze',
                      assetSymbol: asset.symbol,
                      assetMarket: asset.market,
                      assetType: asset.asset_type,
                    }),
                  },
                });
              } catch (dbErr) {
                console.warn('[deep-dive] DB persist failed:', (dbErr as Error).message);
              }
            }

            const dur = Math.round(sinceRequestStart() / 1000);
            emitter.emitModule('report', 'done', { duration: dur });
            emitter.emitModule('done', 'completed', { duration: dur });
            emitter.emitStreamDone(finalMarkdown, { sources: [] });

            // Session cleanup — mirror legacy paths so sweep doesn't flag as stale.
            activeChatSessions.delete(sessionId);
            chatSessionStartTimes.delete(sessionId);
            finishChatReplayBuffer(sessionId);
            chatAbortControllers.delete(sessionId);

            console.log(
              `[deep-dive] ✅ completed: symbol=${asset.symbol} elapsed_s=${asSeconds(sinceRequestStart())}`,
            );
            return;
          }

          // ── No single asset → silent fallback to Fast mode ──
          console.log(`[deep-dive] no asset detected, falling back to Fast mode`);
          data.mode = 'fast';
          socket.emit('agent:chat:info', {
            sessionId,
            hint: '未识别到具体资产，已切换到 Fast 模式',
          });
          // Flow through to legacy handler (now in Fast branch)
        } catch (err) {
          // Aegean call failure → flow through to legacy Roundtable. User
          // still gets an answer; we just lose the deep-dive enhancement.
          console.warn(
            '[deep-dive] failed, falling through to legacy Roundtable:',
            (err as Error).message,
          );
        }
      }

      let routeImageDigest = '';
      if (hasImages) {
        const digestStartedAt = Date.now();
        try {
          routeImageDigest = await aiService.analyzeImagesForRouting(userContent, images);
          if (latestUserMessageId && routeImageDigest) {
            await prisma.chatMessage.update({
              where: { id: latestUserMessageId },
              data: {
                metadata: stringifyChatMeta({
                  images,
                  routeImageDigest,
                  routeImageDigestAt: new Date().toISOString(),
                }),
              },
            });
          }
          console.log(
            `[agent:chat:timing] image_digest_s=${asSeconds(Date.now() - digestStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId} digest_len=${routeImageDigest.length}`,
          );
        } catch (digestErr: any) {
          console.warn('[agent:chat] route image digest failed:', digestErr?.message || digestErr);
        }
      }

      let plan: any;
      const routingStartedAt = Date.now();
      try {
        const routingHistory = formatHistory(sessionHistory, MAX_HISTORY_FOR_ROUTING);
        const routingDigest =
          routeImageDigest && routeImageDigest.length > 180
            ? `${routeImageDigest.slice(0, 180)}...(truncated)`
            : routeImageDigest;
        const routingDigestBlock = routeImageDigest
          ? `\n\n【Latest Image Digest】\n${routingDigest}`
          : '';
        const routingQuery = routingHistory
          ? `【Conversation Context】\n${routingHistory}\n\n【Latest User Message】\n${userContent}${routingDigestBlock}`
          : `${userContent}${routingDigestBlock}`;
        plan = await aiService.evaluateRouting(routingQuery);
        if (routeImageDigest) {
          plan.imageDigest = routeImageDigest;
        }
        console.log(
          `[agent:chat:timing] routing_s=${asSeconds(Date.now() - routingStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId} digest_len=${routeImageDigest.length}`,
        );
      } catch (routingErr: any) {
        console.error('evaluateRouting failed:', routingErr.message);
        plan = {
          isSimpleChat: true,
          queryType: 'general',
          imageDigest: routeImageDigest,
          capabilities: { analysis: { needed: false }, search: { needed: false }, simulate: { needed: false }, web3: { needed: false } },
        };
      }

      if (!hasImages && data.mode === 'roundtable') {
        plan.isSimpleChat = false;
      }

      // ── assetHint override (Web3 trending-card click) ──
      // When the user starts a chat by clicking a Web3 trending card on the
      // home page, the frontend already KNOWS the asset is crypto. The LLM
      // router can still misclassify it (e.g. BLEND token vs Blend Labs Inc.
      // NYSE:BLND), which sets web3.needed=false and skips the entire web3
      // pipeline (no TokenCard). Trust the frontend signal here: force web3 on,
      // strip stock-side analysis to keep the response focused, and unset
      // simpleChat so the synth pipeline runs.
      const incomingHint = data.assetHint;
      const hintSym = typeof incomingHint?.sym === 'string' ? incomingHint.sym.trim().toUpperCase() : '';
      const hintName = typeof incomingHint?.name === 'string' ? incomingHint.name.trim() : '';
      // CoinGecko id is propagated all the way into the web3 CLI subprocess so
      // the agent can skip its search_crypto_asset turn (~7s saved per query).
      const hintCgId =
        typeof (incomingHint as any)?.coingeckoId === 'string'
          ? ((incomingHint as any).coingeckoId as string).trim()
          : '';
      // Mutable so Layer 2 (CoinGecko ticker validator) can populate it when the
      // LLM router put a long-tail crypto into analysis.tickers without triggering
      // the frontend assetHint path (e.g. user typed "分析pengu").
      let web3Hint:
        | { coingeckoId: string; symbol?: string; name?: string }
        | null =
        incomingHint?.kind === 'crypto' && hintCgId
          ? { coingeckoId: hintCgId, symbol: hintSym || undefined, name: hintName || undefined }
          : null;
      if (incomingHint?.kind === 'crypto' && hintSym) {
        plan.isSimpleChat = false;
        plan.capabilities = plan.capabilities || {};
        plan.capabilities.web3 = {
          needed: true,
          query: hintName ? `${hintSym} ${hintName} price market analysis` : `${hintSym} crypto price market analysis`,
        };
        // Stocks-side capability is meaningless for a crypto symbol — clear
        // any tickers the router may have hallucinated (e.g. BLND for BLEND).
        plan.capabilities.analysis = { needed: false, tickers: undefined };
        if (plan.capabilities.simulate) {
          plan.capabilities.simulate = { needed: false, tickers: undefined };
        }
        // Keep search ON so the Debate panel still gets news/sentiment context,
        // but rewrite the search query to favor the resolved crypto asset.
        const searchOn = !!plan.capabilities.search?.needed;
        plan.capabilities.search = {
          needed: true,
          query: hintName ? `${hintName} ${hintSym} crypto market sentiment news` : `${hintSym} crypto market sentiment news`,
          showXAccountProfile: !!plan.capabilities.search?.showXAccountProfile,
        };
        // queryType defaults to market-brief for "what's driving X today?"-style
        // prompts; only override clearly-wrong types so guru-council / multi-turn
        // continuations stay intact.
        if (plan.queryType === 'general' || !plan.queryType) {
          plan.queryType = 'market-brief';
        }
        console.log(
          `[agent:chat] assetHint override applied: sym=${hintSym} name=${hintName || '∅'} cgId=${hintCgId || '∅'} → web3.needed=true, analysis=false${searchOn ? '' : ', search=on'}${web3Hint ? ' [will skip search_crypto_asset]' : ' [no cgId — agent will call search]'}`,
        );
      }

      // ── domain override (explicit Stocks/Web3 page selection) ─────────────
      // The home page Stocks⇆Web3 toggle is an explicit user signal: whatever
      // the user is asking, they want it answered as a {stocks|web3} query.
      // This trumps the LLM router's guess. Without this, "分析 PENGU" in the
      // Web3 tab still got routed to the equity datasource pipeline (PENGU is
      // not in the hardcoded crypto whitelist), wasting 30+s on invalid_symbol
      // before falling back to web search. Symmetric: a small-cap A-share
      // asked in the Stocks tab won't get mis-routed to web3 just because
      // the LLM doesn't recognize the ticker.
      //
      // Skipped when:
      //   - no domain provided (older clients, direct API, history restore)
      //   - assetHint already forced web3 (frontend trending click)
      //   - simpleChat path
      const incomingDomain = data.domain === 'stocks' || data.domain === 'web3' ? data.domain : null;
      // Collected by domain override (web3 branch) for downstream Layer 2 to
      // resolve. Empty when domain is stocks / unset / when domain didn't
      // need to lift any tickers.
      let liftedWeb3Tickers: string[] = [];
      if (incomingDomain && !plan.isSimpleChat && !web3Hint) {
        const cleanDomainSearchQuery = (raw: string | undefined): string => {
          if (!raw) return '';
          if (incomingDomain === 'web3') {
            // Strip equity-flavored words the LLM may have injected.
            return raw
              .replace(/\bstocks?\b/gi, '')
              .replace(/\bequit(?:y|ies)\b/gi, '')
              .replace(/\bshares?\b/gi, '')
              .replace(/\s+/g, ' ')
              .trim();
          }
          // domain === 'stocks'
          return raw
            .replace(/\bcrypto(?:currency|currencies)?\b/gi, '')
            .replace(/\btokens?\b/gi, '')
            .replace(/\bcoins?\b/gi, '')
            .replace(/\bweb3\b/gi, '')
            .replace(/\bon[-\s]?chain\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        };

        if (incomingDomain === 'web3') {
          // Pull any tickers the LLM put into analysis/simulate into the web3
          // query so the downstream web3 agent has something to resolve.
          const liftedTickers = [
            ...(plan.capabilities.analysis.tickers || []),
            ...(plan.capabilities.simulate?.tickers || []),
          ].map((t) => t.toUpperCase()).filter(Boolean);
          const uniqueLifted = [...new Set(liftedTickers)];
          liftedWeb3Tickers = uniqueLifted;

          const existingWeb3Query = (plan.capabilities.web3?.query || '').trim();
          const liftedHint = uniqueLifted.length > 0 ? uniqueLifted.join(' ') + ' crypto price market' : '';
          const fallbackQuery = existingWeb3Query || liftedHint || `${userContent} crypto price market`;

          plan.capabilities.web3 = {
            needed: true,
            query: fallbackQuery,
          };
          plan.capabilities.analysis = { needed: false, tickers: undefined };
          if (plan.capabilities.simulate) {
            plan.capabilities.simulate = { needed: false, tickers: undefined };
          }
          // Keep search on for sentiment/news, but scrub equity-flavored words.
          const dirtySearch = plan.capabilities.search.query;
          const cleanSearch = cleanDomainSearchQuery(dirtySearch);
          plan.capabilities.search = {
            needed: true,
            query: cleanSearch || (uniqueLifted.length > 0 ? `${uniqueLifted.join(' ')} crypto sentiment news` : `${userContent} crypto sentiment news`),
            showXAccountProfile: !!plan.capabilities.search?.showXAccountProfile,
          };
          if (plan.queryType === 'general' || !plan.queryType) {
            plan.queryType = 'market-brief';
          }
          console.log(
            `[agent:chat] domain override → web3: lifted_tickers=[${uniqueLifted.join(',') || '∅'}] analysis=off simulate=off web3.query="${(plan.capabilities.web3.query || '').slice(0, 80)}"`,
          );
        } else {
          // domain === 'stocks'
          plan.capabilities.web3 = { needed: false };
          // search stays on but scrub web3-flavored words.
          const dirtySearch = plan.capabilities.search.query;
          const cleanSearch = cleanDomainSearchQuery(dirtySearch);
          if (plan.capabilities.search.needed) {
            plan.capabilities.search = {
              needed: true,
              query: cleanSearch || userContent,
              showXAccountProfile: !!plan.capabilities.search?.showXAccountProfile,
            };
          }
          console.log(
            `[agent:chat] domain override → stocks: web3=off, analysis untouched (tickers=[${(plan.capabilities.analysis.tickers || []).join(',') || '∅'}])`,
          );
        }
      }

      // Guests are capped at the simple-chat path regardless of what the
      // orchestrator decided. The 5/day guest quota pays for a plain LLM
      // answer, not search + Web3 + synthesis.
      if (isGuest) {
        plan.isSimpleChat = true;
      }

      // ═════════════════════════════════════════════════════════════════
      // Auto mode: semantic routing + dual-bucket quota cascade.
      //
      // Per product spec: Auto analyzes the query semantically and picks
      // Fast or Roundtable. It charges the corresponding bucket. If the
      // preferred bucket is empty, it tries the other. If BOTH are empty,
      // it gracefully degrades to a simple no-agent LLM answer so the
      // user is never blocked — just gets a lighter response.
      //
      // Guests and explicit Fast/Roundtable picks skip this block entirely.
      // ═════════════════════════════════════════════════════════════════
      let autoResolvedTier: 'simple' | 'fast' | 'roundtable' | null = null;
      let autoDegraded = false;
      if (!isGuest && requestedMode === 'auto') {
        const preferredTier = decideAutoMode(plan, userContent);

        if (preferredTier === 'simple') {
          console.log(`[agent:chat] Auto routed → simple (no quota charged) sessionId=${sessionId} queryType=${plan.queryType}`);
          autoResolvedTier = 'simple';
          // plan.isSimpleChat already true; nothing to change.
        } else {
          // Try preferred bucket, then the other, then degrade to simple.
          let consumedTier: 'fast' | 'roundtable' | null = null;

          try {
            const primary = await consumeQuota(userId, preferredTier);
            if (primary.allowed) {
              consumedTier = preferredTier;
              console.log(`[agent:chat] Auto→${preferredTier} (preferred) user=${userId} remaining=${primary.remaining} queryType=${plan.queryType}`);
            } else {
              const fallbackTier = preferredTier === 'fast' ? 'roundtable' : 'fast';
              const secondary = await consumeQuota(userId, fallbackTier);
              if (secondary.allowed) {
                consumedTier = fallbackTier;
                console.log(`[agent:chat] Auto→${fallbackTier} (fallback, ${preferredTier} exhausted) user=${userId} remaining=${secondary.remaining}`);
              } else {
                console.log(`[agent:chat] Auto→simple (both buckets exhausted) user=${userId} primary_reset=${primary.resetAt.toISOString()} fallback_reset=${secondary.resetAt.toISOString()}`);
              }
            }
          } catch (err) {
            // Fail-open: if the quota/subscription tables aren't ready
            // (e.g. Prisma migrations not yet applied in dev), let the
            // request run the full Fast pipeline instead of silently
            // degrading to a tiny simple-chat reply.
            console.error('[agent:chat] Auto quota cascade failed, falling through as fast:', (err as Error).message);
            consumedTier = 'fast';
          }

          if (consumedTier === 'roundtable') {
            data.mode = 'roundtable'; // flip downstream checks into deep-research path
            plan.isSimpleChat = false;
            autoResolvedTier = 'roundtable';
          } else if (consumedTier === 'fast') {
            data.mode = 'fast';
            plan.isSimpleChat = false;
            autoResolvedTier = 'fast';
          } else {
            // Both exhausted — degrade to simple chat (no agent, no tools).
            plan.isSimpleChat = true;
            autoResolvedTier = 'simple';
            autoDegraded = true;
            // Tell the client so UI can show a subtle "running in lite mode" hint.
            socket.emit('agent:chat:quota_degraded', {
              sessionId,
              reason: 'both_buckets_exhausted',
              hint: "You're out of Fast and Roundtable quota — running in lite mode (no agents). Upgrade to restore full analysis.",
            });
          }
        }
      }

      // Guardrail: image-heavy stock questions can be misrouted as general when digest is terse.
      // If user explicitly asks about stocks and routing says simple chat, force analysis/search.
      if (hasImages && routeImageDigest && plan.isSimpleChat) {
        const stockIntent = /股票|A股|港股|美股|个股|标的|行情|涨停|跌停|分析|估值|stock|stocks|share|ticker|equity|price/i.test(
          `${userContent}\n${routeImageDigest}`,
        );
        if (stockIntent) {
          const tickersFromDigest = Array.from(
            new Set((routeImageDigest.match(/\b\d{6}\b/g) || []).slice(0, 5)),
          );
          const digestForSearch = routeImageDigest.replace(/\s+/g, ' ').trim().slice(0, 220);
          const isZhIntent = /[\u4e00-\u9fff]/.test(userContent || routeImageDigest || '');
          const fallbackSearchQuery = isZhIntent
            ? `${digestForSearch} 股票分析 最新消息`
            : `${digestForSearch} stock analysis latest news`;
          plan = {
            ...plan,
            isSimpleChat: false,
            queryType: 'investment-analysis',
            capabilities: {
              ...plan.capabilities,
              analysis: {
                ...plan.capabilities.analysis,
                needed: true,
                tickers: tickersFromDigest.length > 0 ? tickersFromDigest : plan.capabilities.analysis?.tickers,
              },
              search: {
                ...plan.capabilities.search,
                needed: true,
                query: plan.capabilities.search?.query || fallbackSearchQuery,
              },
              simulate: { ...plan.capabilities.simulate, needed: false },
              web3: { ...plan.capabilities.web3, needed: false },
            },
          };
          console.warn(
            `[agent:chat:routing] image-stock safeguard activated. digest_len=${routeImageDigest.length} tickers=${tickersFromDigest.join(',') || 'none'}`,
          );
        }
      }

      // Guru Council mode: always trigger simulation + search (including with images)
      if (data.agentId === 'guru-council') {
        plan.isSimpleChat = false;
        plan.queryType = 'guru-council';
        plan.capabilities.simulate.needed = true;
        // Always search so gurus have real-world context and sources to cite
        if (!plan.capabilities.search.needed) {
          plan.capabilities.search.needed = true;
          plan.capabilities.search.query = plan.capabilities.search.query || data.content;
        }
        // Use tickers from routing if available, otherwise default to broad market
        if (!plan.capabilities.simulate.tickers?.length) {
          plan.capabilities.simulate.tickers = plan.capabilities.analysis?.tickers?.length
            ? plan.capabilities.analysis.tickers
            : ['SPY', 'QQQ'];
        }
      }

      // Detect if user mentioned specific named gurus (works in ALL modes, not just guru-council agent)
      const GURU_NAME_MAP: Record<string, string> = {
        // English
        'damodaran': 'aswath_damodaran', 'aswath damodaran': 'aswath_damodaran',
        'ben graham': 'ben_graham', 'graham': 'ben_graham', 'benjamin graham': 'ben_graham',
        'bill ackman': 'bill_ackman', 'ackman': 'bill_ackman',
        'cathie wood': 'cathie_wood', 'cathie': 'cathie_wood',
        'charlie munger': 'charlie_munger', 'munger': 'charlie_munger',
        'michael burry': 'michael_burry', 'burry': 'michael_burry', 'dr. burry': 'michael_burry',
        'mohnish pabrai': 'mohnish_pabrai', 'pabrai': 'mohnish_pabrai',
        'nassim taleb': 'nassim_taleb', 'taleb': 'nassim_taleb',
        'peter lynch': 'peter_lynch', 'lynch': 'peter_lynch',
        'phil fisher': 'phil_fisher', 'fisher': 'phil_fisher', 'philip fisher': 'phil_fisher',
        'rakesh jhunjhunwala': 'rakesh_jhunjhunwala', 'rakesh': 'rakesh_jhunjhunwala', 'jhunjhunwala': 'rakesh_jhunjhunwala',
        'stanley druckenmiller': 'stanley_druckenmiller', 'druckenmiller': 'stanley_druckenmiller',
        'warren buffett': 'warren_buffett', 'buffett': 'warren_buffett', 'warren': 'warren_buffett',
        // Chinese
        '达摩达兰': 'aswath_damodaran', '阿斯沃思': 'aswath_damodaran',
        '格雷厄姆': 'ben_graham', '本·格雷厄姆': 'ben_graham', '本杰明·格雷厄姆': 'ben_graham',
        '阿克曼': 'bill_ackman', '比尔·阿克曼': 'bill_ackman',
        '凯茜·伍德': 'cathie_wood', '木头姐': 'cathie_wood', '凯西·伍德': 'cathie_wood',
        '芒格': 'charlie_munger', '查理·芒格': 'charlie_munger', '查理芒格': 'charlie_munger',
        '伯里': 'michael_burry', '迈克尔·伯里': 'michael_burry', '大空头': 'michael_burry',
        '帕布莱': 'mohnish_pabrai', '莫尼什·帕布莱': 'mohnish_pabrai',
        '塔勒布': 'nassim_taleb', '纳西姆·塔勒布': 'nassim_taleb', '黑天鹅': 'nassim_taleb',
        '彼得·林奇': 'peter_lynch', '林奇': 'peter_lynch', '彼得林奇': 'peter_lynch',
        '费雪': 'phil_fisher', '菲利普·费雪': 'phil_fisher', '菲利普费雪': 'phil_fisher',
        '德鲁肯米勒': 'stanley_druckenmiller', '斯坦利·德鲁肯米勒': 'stanley_druckenmiller',
        '巴菲特': 'warren_buffett', '沃伦·巴菲特': 'warren_buffett', '沃伦巴菲特': 'warren_buffett', '股神': 'warren_buffett',
      };

      const queryLowerForGuru = userContent.toLowerCase();
      const mentionedGuruSet = new Set<string>();
      const sortedGuruKeys = Object.keys(GURU_NAME_MAP).sort((a, b) => b.length - a.length);
      for (const phrase of sortedGuruKeys) {
        if (queryLowerForGuru.includes(phrase.toLowerCase())) {
          mentionedGuruSet.add(GURU_NAME_MAP[phrase]);
        }
      }

      // Check if user asked about an investor but none in our roster matched
      // Heuristic patterns: "X怎么看" / "X的观点" / "X 说" / "what does X think" / "X's view" etc.
      const investorIntentPattern = /(怎么看|的观点|的看法|会怎么|如何看待|的建议|的策略|what does .+ (think|say)|.+'s (view|take|opinion|thought))/i;
      const hasInvestorIntent = investorIntentPattern.test(userContent);
      if (hasInvestorIntent && mentionedGuruSet.size === 0 && data.agentId !== 'guru-council') {
        // Try to detect a person-like name that's NOT in our list
        // Simple check: capital-case English name OR Chinese person-like name (2-4 chars around investor terms)
        const hasNonRosterInvestorName =
          /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/.test(userContent) ||
          /[\u4e00-\u9fff]{2,4}(?=(怎么看|的观点|的看法|会怎么|如何看待))/.test(userContent);
        if (hasNonRosterInvestorName) {
          const availableList = [
            'Warren Buffett (巴菲特)', 'Charlie Munger (芒格)', 'Peter Lynch (彼得·林奇)',
            'Ben Graham (格雷厄姆)', 'Phil Fisher (费雪)', 'Bill Ackman (阿克曼)',
            'Cathie Wood (木头姐)', 'Michael Burry (大空头)', 'Stanley Druckenmiller',
            'Mohnish Pabrai', 'Nassim Taleb (黑天鹅)', 'Aswath Damodaran', 'Rakesh Jhunjhunwala',
          ];
          const isZh = /[\u4e00-\u9fff]/.test(userContent);
          const msg = isZh
            ? `你提到的这位投资人暂不在 Loka 的大师名单里。目前可用的大师有：\n\n${availableList.map(n => '- ' + n).join('\n')}\n\n你可以换一位再问，或者切换到 Roundtable 模式听一轮集体观点。`
            : `The investor you mentioned isn't in Loka's guru roster yet. Available gurus:\n\n${availableList.map(n => '- ' + n).join('\n')}\n\nTry asking about one of them, or switch to Roundtable mode for a collective view.`;
          emitter.emitModule('search', 'active', { variant: 'data_providers', providers: [] });
          emitter.emitProgress(msg);
          emitter.emitModule('done', 'completed', { duration: 0 });
          emitter.emitStreamDone(msg);
          try {
            await prisma.chatMessage.create({
              data: { userId, sessionId, role: 'assistant', content: msg, agentId: 'superagent' }
            });
          } catch (_) {}
          activeChatSessions.delete(sessionId);
          finishChatReplayBuffer(sessionId);
          chatAbortControllers.delete(sessionId);
          return;
        }
      }

      if (mentionedGuruSet.size > 0) {
        plan.specificGurus = Array.from(mentionedGuruSet);
        // In non-roundtable modes, auto-promote to guru-council flow so the single-guru prompt kicks in
        if (data.agentId !== 'guru-council' && data.mode !== 'roundtable') {
          plan.isSimpleChat = false;
          plan.queryType = 'guru-council';
          plan.capabilities.simulate.needed = true;
          if (!plan.capabilities.search.needed) {
            plan.capabilities.search.needed = true;
            plan.capabilities.search.query = plan.capabilities.search.query || data.content;
          }
          if (!plan.capabilities.simulate.tickers?.length) {
            plan.capabilities.simulate.tickers = plan.capabilities.analysis?.tickers?.length
              ? plan.capabilities.analysis.tickers
              : ['SPY'];
          }
          console.log(`[agent:chat:guru] auto-promoted to guru-council for mentioned gurus: ${plan.specificGurus.join(',')}`);
        }
      }

      // Ensure search is always enabled for non-simple queries so sources are available for citations
      if (!plan.isSimpleChat && !plan.capabilities.search.needed) {
        plan.capabilities.search.needed = true;
        plan.capabilities.search.query = plan.capabilities.search.query || data.content;
      }

      // ── Layer 1: strip known crypto symbols from analysis.tickers ──────────
      // Skipped when an explicit domain is set: the home toggle is the source
      // of truth, not the hardcoded whitelist. In stocks mode the user wants
      // BTC asked as "what's BTC doing to equities" answered as a stocks
      // query (search-only fallback); in web3 mode the domain override above
      // already moved everything to web3, so Layer 1 has nothing to do.
      if (
        !incomingDomain &&
        plan.capabilities.analysis.needed &&
        plan.capabilities.analysis.tickers?.length
      ) {
        const cryptoHits = plan.capabilities.analysis.tickers.filter(isCryptoSymbol);
        if (cryptoHits.length > 0) {
          const filtered = filterOutCryptoTickers(plan.capabilities.analysis.tickers);
          console.log(`[routing:layer1] Stripped crypto tickers from analysis: [${cryptoHits.join(', ')}] → remaining: [${filtered.join(', ') || 'none'}]`);
          if (filtered.length === 0) {
            plan.capabilities.analysis.needed = false;
          } else {
            plan.capabilities.analysis.tickers = filtered;
          }
          // Auto-enable web3 if not already set
          if (!plan.capabilities.web3?.needed) {
            plan.capabilities.web3 = {
              needed: true,
              query: cryptoHits.map((t: string) => t.toUpperCase()).join(' ') + ' ' + (plan.capabilities.search.query || userContent),
            };
            console.log(`[routing:layer1] Auto-enabled web3 for stripped crypto tickers: ${cryptoHits.join(', ')}`);
          }
        }
      }

      // ── Layer 2: web3 token resolver / hint accelerator ────────────────────
      // After the domain override (or a frontend assetHint), web3.needed is
      // true but we may still lack a CoinGecko id for the target token. The
      // web3 agent would otherwise spend ~7s on its own search_crypto_asset
      // turn. Resolve here in parallel with the rest of the routing pipeline
      // and inject the result into web3Hint so the agent can skip that turn.
      //
      // Sources of candidate tickers, in priority order:
      //   a) liftedWeb3Tickers — symbols moved out of analysis/simulate by
      //      the domain override (most authoritative, the LLM already named
      //      these as the subject).
      //   b) analysis.tickers — when no domain was provided (legacy/API),
      //      fall back to the same logic the previous Layer 2 used.
      //
      // Skip when:
      //   - simpleChat / guest path
      //   - assetHint already supplied a CoinGecko id (web3Hint set)
      //   - web3 not needed (stocks domain or LLM said no crypto)
      //   - no candidates to resolve
      if (
        !plan.isSimpleChat &&
        !isGuest &&
        !web3Hint &&
        plan.capabilities.web3?.needed
      ) {
        const candidates: string[] =
          liftedWeb3Tickers.length > 0
            ? liftedWeb3Tickers
            : (plan.capabilities.analysis.tickers || []);

        if (candidates.length > 0) {
          const layer2Started = Date.now();
          const checks = await validateTickersAgainstCoinGecko(candidates);
          const matched = checks.find((c) => isHighConfidenceCryptoMatch(c.cgMatch));
          if (matched && matched.cgMatch) {
            const top: CryptoTickerMatch = matched.cgMatch;
            web3Hint = { coingeckoId: top.id, symbol: top.symbol, name: top.name };
            // Tighten web3.query around the resolved token so the agent has a
            // clean handle even if the LLM's original query was vague.
            plan.capabilities.web3 = {
              needed: true,
              query: `${top.symbol} ${top.name} crypto price market analysis`,
            };
            console.log(
              `[routing:layer2] CoinGecko resolver hit: ${matched.ticker} → ${top.id} (rank=${top.marketCapRank}, elapsed=${Date.now() - layer2Started}ms) — web3Hint injected`,
            );
          } else {
            console.log(
              `[routing:layer2] CoinGecko resolver miss for [${candidates.join(', ')}] (elapsed=${Date.now() - layer2Started}ms) — web3 agent will run search_crypto_asset itself`,
            );
          }
        }
      }

      // ── Layer 3: ambiguous ticker → ask user to clarify (crypto vs stock) ──
      // Skipped when an explicit domain is set: the user already chose the
      // domain on the home page, so COIN/MSTR-style ambiguity is resolved.
      const allMentionedTickers = !incomingDomain
        ? [
            ...(plan.capabilities.analysis.tickers || []),
            ...(plan.capabilities.simulate?.tickers || []),
          ]
        : [];
      const ambiguous = allMentionedTickers.find(t => isAmbiguousSymbol(t) && !plan.capabilities.web3?.needed);
      if (ambiguous) {
        const asset = ambiguous.toUpperCase();
        const clarification = `I noticed you mentioned **${asset}** — did you mean the **${asset} cryptocurrency** or the **${asset} stock ticker**? Please clarify so I can route your query to the right tool.`;
        console.log(`[routing:layer3] Ambiguous ticker detected: ${asset} → sending clarification`);
        emitter.emitModule('search', 'active', { variant: 'data_providers', providers: [] });
        emitter.emitProgress(clarification);
        emitter.emitModule('done', 'completed', { duration: 0 });
        emitter.emitStreamDone(clarification);
        if (!isGuest) {
          try {
            await prisma.chatMessage.create({
              data: { userId, sessionId, role: 'assistant', content: clarification, agentId: 'superagent' }
            });
          } catch (_) {}
        }
        activeChatSessions.delete(sessionId);
        chatSessionStartTimes.delete(sessionId);
        finishChatReplayBuffer(sessionId);
        chatAbortControllers.delete(sessionId);
        return;
      }

      // Emit the mode that actually ran. `mode` is the ChatMode the UI
      // can render (must stay compatible: 'roundtable' | 'fast' | 'auto').
      // `actualTier` + `requested` + `autoResolved` + `degraded` are the
      // new source-of-truth fields for accurate badges / telemetry.
      const actualTier: 'simple' | 'fast' | 'roundtable' =
        (!hasImages && data.mode === 'roundtable') ? 'roundtable' :
        plan.isSimpleChat ? 'simple' :
        'fast';
      // Legacy-compatible mode label for existing UI paths. Simple collapses
      // to 'auto' here because the UI has no separate 'simple' chip and
      // 'auto' matches how users perceive a model-only reply.
      const legacyMode: 'roundtable' | 'fast' | 'auto' =
        actualTier === 'roundtable' ? 'roundtable' :
        actualTier === 'simple' ? 'auto' :
        'fast';
      // Mirror into the replay buffer so a client navigating away mid-stream
      // can still restore the Roundtable/Fast UI (5-stage pipeline, Workbench)
      // when it returns. Without this, replay only sees the originally
      // requested mode (e.g. 'auto'), which can't drive routedMode-gated UI.
      recordChatRoutedMode(sessionId, legacyMode);
      socket.emit('agent:chat:routed', {
        sessionId,
        mode: legacyMode,
        actualTier,
        requested: requestedMode,
        autoResolved: requestedMode === 'auto' ? autoResolvedTier : null,
        degraded: autoDegraded,
      });

      const streamToChat = (chunk: string) => {
        if (isAborted()) return;
        emitter.emitProgress(chunk);
      };

      if (plan.isSimpleChat && data.mode !== 'roundtable') {
        const simpleStart = Date.now();
        emitter.emitModule('search', 'active', { variant: 'data_providers', providers: [] });
        try {
          const context = await prisma.chatMessage.findMany({ where: { userId, sessionId }, orderBy: { createdAt: 'asc' }, take: 10 });
          const mappedContext = context.map((m) => {
            const meta = safeParseChatMeta(m.metadata);
            if (m.role === 'user') {
              return { role: m.role, content: buildModelUserContent(m.content || '', meta), agentId: m.agentId };
            }

            return { role: m.role, content: m.content, agentId: m.agentId };
          });
          const stream = await aiService.chatStream(mappedContext, 'superagent', undefined, 2560);
          emitter.emitModule('search', 'completed');

          const reader = stream.getReader();
          const decoder = new TextDecoder();
          let fullContent = '';
          let streamBuffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done || isAborted()) break;
            streamBuffer += decoder.decode(value, { stream: true });
            const lines = streamBuffer.split('\n');
            streamBuffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const sseData = trimmed.slice(6).trim();
                if (sseData === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(sseData);
                  const delta = parsed.choices?.[0]?.delta?.content || '';
                  if (delta) {
                    fullContent += delta;
                    streamToChat(delta);
                  }
                } catch (e) { }
              }
            }
          }

          const simpleFlow = {
            modules: [
              { type: 'search', status: 'completed', data: { variant: 'data_providers', providers: [] } },
              { type: 'done', status: 'completed' }
            ],
            isActive: false,
            route: 'Super Agent'
          };

          const simpleDur = Math.round((Date.now() - simpleStart) / 1000);
          if (isAborted()) {
            emitter.emitStreamCancelled();
            activeChatSessions.delete(sessionId);
        chatSessionStartTimes.delete(sessionId);
        finishChatReplayBuffer(sessionId);
            chatAbortControllers.delete(sessionId);
            return;
          }
          if (!isGuest) {
            try {
              await prisma.chatMessage.create({
                data: { userId, sessionId, role: 'assistant', content: fullContent, agentId: 'superagent', metadata: JSON.stringify({ thinkingFlow: simpleFlow }) }
              });
            } catch (e) { }
          }
          emitter.emitModule('done', 'completed', { duration: simpleDur });
          emitter.emitStreamDone(fullContent);
        } catch (streamErr: any) {
          console.error('[agent:chat] simple chat stream failed:', streamErr.message);

          // ── Crypto rescue path ───────────────────────────────────────────
          // The LLM is unreachable (e.g. quota 403). If the user's query
          // looks crypto-related, try to salvage the request by hitting
          // CoinGecko directly and emitting a deterministic local report
          // built from real market data — same path used when the
          // advanced flow's synthesis fails.
          const cryptoRegex = /\b(btc|bitcoin|eth|ethereum|sol|solana|usdt|usdc|bnb|xrp|ada|doge|dot|avax|matic|hype|sui|ton|trx|link|ltc|near|atom|apt|arb|op|inj|tia|sei|jto|wif|pepe|shib)\b|比特币|以太坊|以太币|加密货币|代币|tokenomics|defi|链上|altcoin|memecoin|stablecoin/i;
          if (cryptoRegex.test(userContent)) {
            console.log(`[agent:chat] simple chat crypto-rescue triggered sessionId=${sessionId}`);
            try {
              const web3Result = await web3RouterService.runQuery(userContent.trim(), web3Hint ? { hint: web3Hint } : undefined);
              const snap = web3Result.raw.tokenSnapshot;
              if (snap && snap.id) {
                // Mirror into the replay buffer so a client that navigates away
                // mid-stream can still get the card on `agent:chat:replay`.
                recordChatTokenCard(sessionId, snap);
                emitToUser(userId, 'agent:chat:token', { sessionId, token: snap });
                console.log(
                  `[token_card] (rescue) emitted id=${snap.id} symbol=${snap.symbol} price=${snap.market.priceUsd ?? 'n/a'}`,
                );
                const isZh = /[\u4e00-\u9fff]/.test(userContent);
                const fallbackMd = buildLocalCryptoFallback(
                  snap,
                  userContent,
                  isZh,
                  streamErr.message || 'AI provider unavailable',
                );
                streamToChat(fallbackMd);
                emitter.emitModule('search', 'completed');
                emitter.emitModule('done', 'completed', {});
                if (!isGuest) {
                  try {
                    await prisma.chatMessage.create({
                      data: {
                        userId,
                        sessionId,
                        role: 'assistant',
                        content: fallbackMd,
                        agentId: 'superagent',
                        metadata: JSON.stringify({ tokenCard: snap, degraded: true, cause: 'ai_unavailable' }),
                      },
                    });
                  } catch (_) {}
                }
                emitter.emitStreamDone(fallbackMd);
                activeChatSessions.delete(sessionId);
                chatSessionStartTimes.delete(sessionId);
                finishChatReplayBuffer(sessionId);
                chatAbortControllers.delete(sessionId);
                return;
              }
              console.warn('[agent:chat] crypto-rescue: web3 returned no tokenSnapshot');
            } catch (rescueErr: any) {
              console.warn('[agent:chat] crypto-rescue failed:', rescueErr?.message || rescueErr);
            }
          }

          emitter.emitModule('search', 'completed');
          emitter.emitModule('done', 'completed', {});
          emitToUser(userId, 'agent:chat:error', { sessionId, error: 'Connection failed, please try again.' });
          emitter.emitStreamDone('');
        }
        activeChatSessions.delete(sessionId);
        chatSessionStartTimes.delete(sessionId);
        finishChatReplayBuffer(sessionId);
        chatAbortControllers.delete(sessionId);
        return;
      }

      const promises: Promise<{ type: string; data: any }>[] = [];
      const startTime = Date.now();
      const toolDispatchStartedAt = Date.now();

      let finalSocialSources: SignalSearchSource[] = [];
      let finalSearchSourcesRaw: SignalSearchSource[] = [];
      let finalWeb3Sources: SignalSearchSource[] = [];
      let finalWeb3Intent: string | undefined;
      let finalWeb3Okx: NonNullable<Web3ResearchResult['raw']['okx']> | undefined;
      let finalWeb3OkxNews: NonNullable<Web3ResearchResult['raw']['okxNews']> | undefined;
      let finalWeb3Providers: NonNullable<Web3ResearchResult['raw']['providers']> | undefined;
      let finalWeb3Assets: NonNullable<Web3ResearchResult['raw']['assets']> | undefined;
      let finalWeb3Via: Web3ResearchResult['raw']['via'];
      // Snapshot of the per-tool sub-stage timeline (one entry per stage:
      // title, state, duration, summary, rawData). Surfaced both at runtime
      // (live updates while tools run) and persisted into thinkingFlow so
      // history-restored sessions can rebuild the Process panel + recompute
      // the LangGraph-style "X tools · Y sources" pill correctly.
      let finalWeb3Stages: any[] = [];
      let finalAnalysisStages: any[] = [];
      let finalPanelists: any[] = [];
      let savedQuoteCard: any = null;
      let savedTokenCard: any = null;
      let savedXProfileCard: Record<string, unknown> | null = null;

      if (plan.capabilities.search.needed) {
        emitter.emitModule('search', 'active', {
          variant: 'social',
          sources: [],
          providers: [
            { name: 'Yahoo Finance' }, { name: 'Bloomberg API' }, { name: 'Alpha Vantage' },
            { name: 'Polygon.io' }, { name: 'CoinGecko' }, { name: 'TradingView' }
          ]
        });
        const signalResearchLogLines: string[] = [];
        let logHintSources: any[] = [];
        // Faster default for SuperAgent chat: focus on X + web, skip slower auxiliary sources unless overridden.
        const superagentSearchSources = (process.env.SUPERAGENT_LAST30DAYS_SEARCH || 'x,web').trim();
        const routedSearchQuery = plan.capabilities.search.query || [userContent, plan.imageDigest].filter(Boolean).join(' ; ');
        const explicitHandles = explicitHandlesFromText(userContent);
        let effectiveSearchQuery = routedSearchQuery;
        if (explicitHandles.length > 0) {
          const missingHandles = explicitHandles.filter(
            (h) => !new RegExp(`@?${h}\\b`, 'i').test(routedSearchQuery),
          );
          if (missingHandles.length > 0) {
            effectiveSearchQuery = `${routedSearchQuery} ${missingHandles.map((h) => `@${h}`).join(' ')}`.trim();
            console.log(
              `[search_query] patched handles into routed query. original="${routedSearchQuery}" patched="${effectiveSearchQuery}"`,
            );
          }
        }

        promises.push(
          researchService.runDeepResearch(
            effectiveSearchQuery,
            {
              deep: false,
              searchSources: superagentSearchSources || undefined,
              // Skip last30days internal synthesis to avoid double summarization latency;
              // SuperAgent already performs final synthesis after all tools settle.
              skipInnerSynthesis: true,
            },
            {
              onResearchLine: (line) => {
                const cleanLine = line.replace(/\u001b\[[0-9;]*m/g, '');
                emitToUser(userId, 'agent:chat:thinking_log', { sessionId, line: cleanLine });
                const fromLog = sourcesFromSignalRadarLogLine(cleanLine);
                if (fromLog.length) {
                  logHintSources = mergeSignalSources(logHintSources, fromLog);
                  emitter.emitModule('search', 'active', {
                    variant: 'social',
                    sources: logHintSources,
                  });
                }
              },
              onSynthesisToken: () => { },
            }
          ).then(res => {
            const PANEL_MAX = 20;
            // Extract structured sources from raw Python stdout (has bare URLs per item)
            console.log(`[sources] rawStdout length: ${res.rawStdout?.length || 0}, has URLs: ${(res.rawStdout?.match(/https?:\/\//g) || []).length}`);
            let socialSources = sourcesFromLast30DaysCompact(res.rawStdout, PANEL_MAX);
            console.log(`[sources] compact extraction: ${socialSources.length} sources, snippets: ${socialSources.filter(s => s.snippet).length}`);
            // Fallback: try URLs from synthesized summary
            if (socialSources.length === 0) {
              socialSources = sourcesFromSignalRadarSummary(res.summary, PANEL_MAX);
              console.log(`[sources] summary fallback: ${socialSources.length} sources`);
            }
            // Fallback: log-based platform hints
            if (socialSources.length === 0) socialSources = mergeSignalSources([], logHintSources, PANEL_MAX);
            finalSearchSourcesRaw = socialSources;
            const preferredSources = combinePreferredSources(finalSearchSourcesRaw, finalWeb3Sources, {
              web3Intent: finalWeb3Intent,
              max: PANEL_MAX,
            });
            const sourceDomains = Array.from(new Set((preferredSources || []).map((s) => s.domain).filter(Boolean)));
            const sourcePreview = (preferredSources || [])
              .slice(0, 3)
              .map((s) => `${s.domain || 'unknown'}|${(s.title || '').slice(0, 60)}|${s.url || ''}`)
              .join(' || ');
            console.log(
              `[sources] final extraction: raw_count=${socialSources.length} preferred_count=${preferredSources.length} unique_domains=${sourceDomains.length} domains=${sourceDomains.join(',') || 'none'}`,
            );
            if (sourcePreview) {
              console.log(`[sources] final extraction preview: ${sourcePreview}`);
            }

            finalSocialSources = preferredSources;
            emitter.emitModule('search', 'completed', {
              variant: 'social',
              sources: preferredSources,
              providers: [
                { name: 'Yahoo Finance' }, { name: 'Bloomberg API' }, { name: 'Alpha Vantage' },
                { name: 'Polygon.io' }, { name: 'CoinGecko' }, { name: 'TradingView' }
              ]
            });
            const xProfiles = res.xProfiles || [];
            const routerXProfileFlag = plan?.capabilities?.search?.showXAccountProfile;
            const shouldShowXProfileCard =
              xProfiles.length &&
              (routerXProfileFlag === true ||
                (routerXProfileFlag !== false && wantsTwitterProjectProfileHint(userContent)));
            if (shouldShowXProfileCard) {
              const picked = pickXProfileForUser(xProfiles, userContent);
              if (picked && (picked.followers != null || picked.following != null || picked.joinedDisplay || picked.joinedRaw)) {
                const payload = {
                  handle: picked.handle,
                  profileUrl: `https://x.com/${encodeURIComponent(picked.handle)}`,
                  followers: picked.followers,
                  following: picked.following,
                  joinedDisplay: picked.joinedDisplay || picked.joinedRaw || '',
                  avatarUrl: picked.avatarUrl || '',
                };
                savedXProfileCard = payload;
                emitToUser(userId, 'agent:chat:x_profile', { sessionId, profile: payload });
                console.log(
                  `[x_profile] selected handle=@${payload.handle} followers=${payload.followers ?? 'n/a'} following=${payload.following ?? 'n/a'} query="${userContent.slice(0, 120)}"`,
                );
              } else {
                console.log(
                  `[x_profile] skipped: no high-confidence profile match for query="${userContent.slice(0, 120)}" profiles=${xProfiles.length}`,
                );
              }
            }
              return { type: 'SEARCH', data: res.summary, sources: preferredSources };
          }).catch(e => {
            emitter.emitModule('search', 'completed', {});
            return { type: 'SEARCH', data: 'Error: ' + e.message };
          })
        );
      }

      if (plan.capabilities.web3?.needed) {
        emitter.emitModule('web3', 'active', {
          variant: 'coingecko_mcp',
          label: 'CoinGecko MCP',
          stages: [],
        });
        const routedWeb3Q = (plan.capabilities.web3.query || '').trim();
        const originalQ = userContent.trim();
        const web3Q =
          routedWeb3Q && originalQ && routedWeb3Q !== originalQ
            ? `${originalQ} ; ${routedWeb3Q}`
            : routedWeb3Q || originalQ;

        // ── Real-time sub-stages for the Process panel ──
        // Each tool call inside the web3 ReAct loop emits an 'active' event
        // before it runs and a 'completed'/'failed' event after. We accumulate
        // them here and re-emit the entire web3 module on every transition so
        // the client always sees a consistent ordered list.
        const web3Stages: Array<{
          stage: string;
          title_en: string;
          title_zh: string;
          state: 'active' | 'completed' | 'failed' | 'skipped';
          startedAt: number;
          durationMs?: number;
          summary?: string;
          error?: string;
          argsData?: any;
          rawData?: any;
        }> = [];
        const web3OnStage = (event: import('../services/web3Research.service.js').Web3StageEvent) => {
          const idx = web3Stages.findIndex((s) => s.stage === event.stage && s.state === 'active');
          if (event.state === 'active') {
            // New stage. Replace any prior failed/skipped entry with the same
            // id (the agent can retry, especially on transient CoinGecko errors).
            const dupIdx = web3Stages.findIndex((s) => s.stage === event.stage);
            const entry = {
              stage: event.stage,
              title_en: event.title_en,
              title_zh: event.title_zh,
              state: 'active' as const,
              startedAt: Date.now(),
              argsData: event.argsData,
            };
            if (dupIdx >= 0) web3Stages[dupIdx] = entry;
            else web3Stages.push(entry);
          } else if (idx >= 0) {
            web3Stages[idx] = {
              ...web3Stages[idx],
              state: event.state,
              durationMs: event.durationMs,
              summary: event.summary,
              error: event.error,
              rawData: event.rawData ?? web3Stages[idx].rawData,
            };
          } else {
            // Completion event without a matching active (shouldn't happen, but
            // be lenient — push as-is).
            web3Stages.push({
              stage: event.stage,
              title_en: event.title_en,
              title_zh: event.title_zh,
              state: event.state,
              startedAt: Date.now(),
              durationMs: event.durationMs,
              summary: event.summary,
              error: event.error,
              argsData: event.argsData,
              rawData: event.rawData,
            });
          }
          emitter.emitModule('web3', 'active', {
            variant: 'coingecko_mcp',
            label: 'CoinGecko MCP',
            stages: web3Stages.map((s) => ({
              stage: s.stage,
              title_en: s.title_en,
              title_zh: s.title_zh,
              state: s.state,
              durationMs: s.durationMs,
              summary: s.summary,
              error: s.error,
              argsData: s.argsData,
              rawData: s.rawData,
            })),
          });
        };

        promises.push(
          web3RouterService
            .runQuery(web3Q, {
              ...(web3Hint ? { hint: web3Hint } : {}),
              onStage: web3OnStage,
            })
            .then((result) => {
              finalWeb3Intent = result.raw.intent || undefined;
              finalWeb3Sources = buildWeb3ProviderSources(result.raw);
              finalWeb3Okx = result.raw.okx;
              finalWeb3OkxNews = result.raw.okxNews;
              finalWeb3Providers = result.raw.providers;
              finalWeb3Assets = result.raw.assets;
              finalWeb3Via = result.raw.via;
              // Snapshot the stage timeline for persistence + tools-count
              // recomputation on history restore.
              finalWeb3Stages = web3Stages.map((s) => ({
                stage: s.stage,
                title_en: s.title_en,
                title_zh: s.title_zh,
                state: s.state,
                durationMs: s.durationMs,
                summary: s.summary,
                error: s.error,
                argsData: s.argsData,
                rawData: s.rawData,
              }));
              const focusTokens = web3FocusTokens(result.raw);

              // ── Push TokenCard to client (single-asset crypto intents) ──
              const snap = result.raw.tokenSnapshot;
              if (snap && snap.id) {
                savedTokenCard = snap;
                // Mirror into the replay buffer so a client that navigates away
                // mid-stream can still get the card on `agent:chat:replay`.
                recordChatTokenCard(sessionId, snap);
                emitToUser(userId, 'agent:chat:token', { sessionId, token: snap });
                console.log(
                  `[token_card] emitted id=${snap.id} symbol=${snap.symbol} price=${snap.market.priceUsd ?? 'n/a'} mcap=${snap.market.marketCapUsd ?? 'n/a'} fdv/mcap=${snap.market.fdvOverMcap?.toFixed(2) ?? 'n/a'}`,
                );
              }

              if (plan.capabilities.search.needed) {
                const preferredSources = combinePreferredSources(finalSearchSourcesRaw, finalWeb3Sources, {
                  web3Intent: finalWeb3Intent,
                  max: 20,
                  focusTokens,
                });
                if (preferredSources.length > 0) {
                  finalSocialSources = preferredSources;
                  emitter.emitModule('search', 'completed', {
                    variant: 'social',
                    sources: preferredSources,
                    providers: [
                      { name: 'Yahoo Finance' }, { name: 'Bloomberg API' }, { name: 'Alpha Vantage' },
                      { name: 'Polygon.io' }, { name: 'CoinGecko' }, { name: 'TradingView' }
                    ]
                  });
                }
              } else if (finalWeb3Sources.length > 0) {
                finalSocialSources = combinePreferredSources([], finalWeb3Sources, {
                  web3Intent: finalWeb3Intent,
                  max: 20,
                  focusTokens,
                });
              }
              console.log(
                `[web3Sources] injected=${finalWeb3Sources.length} intent=${finalWeb3Intent || 'n/a'} final_sources=${finalSocialSources.length}`,
              );
              emitter.emitModule('web3', 'completed', {
                variant: 'coingecko_mcp',
                intent: result.raw.intent || 'unknown',
                assets: result.raw.assets?.length || 0,
                via: result.raw.via || 'n/a',
                okx: result.raw.okx || [],
                okxNews: result.raw.okxNews || [],
                providers: result.raw.providers || [],
                // Preserve the live stage timeline on the completion event so
                // the persisted thinkingFlow can be restored on history reload.
                stages: web3Stages.map((s) => ({
                  stage: s.stage,
                  title_en: s.title_en,
                  title_zh: s.title_zh,
                  state: s.state,
                  durationMs: s.durationMs,
                  summary: s.summary,
                  error: s.error,
                  argsData: s.argsData,
                  rawData: s.rawData,
                })),
              });
              return { type: 'WEB3', data: result.report };
            })
            .catch((e) => {
              console.warn(
                `[web3Research] failed sessionId=${sessionId} err=${(e as Error).message}`,
              );
              emitter.emitModule('web3', 'completed', { stages: web3Stages });
              return { type: 'WEB3', data: 'Error: ' + (e as Error).message };
            }),
        );
      }

      if (plan.capabilities.analysis.needed) {
        let activeSections = [{ id: 'data_providers', label: 'Fetching market data', status: 'pending', providers: [] }];
        let analysisStages = [
          { id: 'fundamental', label: 'Fundamental analysis', status: 'pending', result: [] as any[] },
          { id: 'technical', label: 'Technical analysis', status: 'pending', result: [] as any[] },
          { id: 'sentiment', label: 'Sentiment analysis', status: 'pending' }
        ];
        // Per-tool stages — mirrors web3's `Web3ModuleData.stages`. Each tool
        // call emits one entry that progresses 'active' → 'completed'/'failed'
        // with argsData/rawData, so the frontend can render per-tool pills +
        // result cards (Web3ToolPill / Web3ToolResultCard) just like web3
        // mode. The legacy 3-section `stages` array stays alongside for the
        // aggregated fundamental/technical/sentiment summary view.
        const stocksToolStages: Array<{
          stage: string;
          title_en: string;
          title_zh: string;
          state: 'active' | 'completed' | 'failed' | 'skipped';
          durationMs?: number;
          argsData?: any;
          rawData?: any;
        }> = [];
        // Pretty stage titles — mirrors web3 cli.ts STAGE_TITLES table.
        const stocksStageTitle = (toolName: string): { en: string; zh: string } => {
          const t: Record<string, { en: string; zh: string }> = {
            get_realtime_quote:           { en: 'Realtime quote',           zh: '获取实时行情' },
            get_daily_history:            { en: 'Daily history',            zh: '日 K 历史' },
            get_chip_distribution:        { en: 'Chip distribution',        zh: '筹码分布' },
            get_analysis_context:         { en: 'Analysis context',         zh: '分析上下文' },
            get_stock_info:               { en: 'Stock profile',            zh: '股票资料' },
            get_portfolio_snapshot:       { en: 'Portfolio snapshot',       zh: '组合快照' },
            get_capital_flow:             { en: 'Capital flow',             zh: '资金流向' },
            analyze_trend:                { en: 'Trend analysis',           zh: '趋势分析' },
            calculate_ma:                 { en: 'Moving averages',          zh: '均线计算' },
            get_volume_analysis:          { en: 'Volume analysis',          zh: '成交量分析' },
            analyze_pattern:              { en: 'Pattern recognition',      zh: '形态识别' },
            search_stock_news:            { en: 'Stock news search',        zh: '搜索新闻' },
            search_comprehensive_intel:   { en: 'Comprehensive intel',      zh: '综合情报搜索' },
            get_market_indices:           { en: 'Market indices',           zh: '大盘指数' },
            get_sector_rankings:          { en: 'Sector rankings',          zh: '板块排名' },
            get_skill_backtest_summary:   { en: 'Skill backtest',           zh: '技能回测' },
            get_strategy_backtest_summary:{ en: 'Strategy backtest',        zh: '策略回测' },
            get_stock_backtest_summary:   { en: 'Stock backtest',           zh: '个股回测' },
          };
          return t[toolName] || { en: toolName.replace(/_/g, ' '), zh: toolName };
        };
        emitter.emitModule('analysis', 'active', { stages: analysisStages, toolStages: stocksToolStages });

        promises.push(
          new Promise(resolve => {
            // Use a derived sub-session ID to avoid replay handler returning
            // the raw analysis buffer instead of the final synthesized content
            const analysisSubSessionId = `${sessionId}:analysis`;
            stockAnalysisService.runStreamAnalysis(
              "Analyze: " + (plan.capabilities.analysis.tickers?.join(', ') || userContent),
              analysisSubSessionId,
              userId,
              (step: any) => {
                recordChatToolTraceStep(sessionId, step);
                emitToUser(userId, 'agent:chat:tool_trace', { sessionId, step });

                // ── Per-tool stages: mirror web3's __WEB3_STAGE__ pattern.
                // Each tool_start/tool_done from Python becomes one entry in
                // stocksToolStages that progresses active → completed/failed,
                // carrying argsData/rawData. Pushed under analysis.toolStages
                // so the frontend can render the same pill+card UI as web3.
                if (step.type === 'tool_start' && typeof step.tool === 'string') {
                  const title = stocksStageTitle(step.tool);
                  // De-dup: same tool may be called twice if the agent retries.
                  // Match by (toolName, args) to keep the Promise.race-style
                  // transition unambiguous; if the existing entry is already
                  // 'completed' just append a new one (rare).
                  // Note: findLast isn't in our TS lib target — walk backwards.
                  let existing: typeof stocksToolStages[number] | undefined;
                  const argsKey = JSON.stringify(step.args);
                  for (let k = stocksToolStages.length - 1; k >= 0; k--) {
                    const s = stocksToolStages[k];
                    if (s.stage === step.tool && JSON.stringify(s.argsData) === argsKey) {
                      existing = s;
                      break;
                    }
                  }
                  if (!existing || existing.state !== 'active') {
                    stocksToolStages.push({
                      stage: step.tool,
                      title_en: title.en,
                      title_zh: title.zh,
                      state: 'active',
                      argsData: step.args,
                    });
                    emitter.emitModule('analysis', 'active', { stages: analysisStages, toolStages: stocksToolStages });
                  }
                } else if (step.type === 'tool_done' && typeof step.tool === 'string') {
                  // DEBUG: log all keys present in the step + whether result is set.
                  // Will remove once we confirm rawData flows end-to-end.
                  console.log(
                    `[stocks:tool_done] tool=${step.tool} success=${step.success} duration=${step.duration} ` +
                    `keys=[${Object.keys(step).join(',')}] hasResult=${step.result != null} ` +
                    `resultPreview=${step.result ? JSON.stringify(step.result).slice(0, 200) : 'null'}`,
                  );
                  // Find the most recent 'active' entry for this tool and
                  // promote it. Python may emit tool_done out of order in
                  // parallel-batch mode, so we walk back to find the right one.
                  for (let i = stocksToolStages.length - 1; i >= 0; i--) {
                    const s = stocksToolStages[i];
                    if (s.stage === step.tool && s.state === 'active') {
                      s.state = step.success === false ? 'failed' : 'completed';
                      s.durationMs = typeof step.duration === 'number' ? Math.round(step.duration * 1000) : undefined;
                      // Trim large rawData payloads (e.g. 60-row OHLC) so the
                      // event stream + replay buffer don't bloat. Keep meta
                      // fields and a head sample of array data.
                      let raw = step.result;
                      // Fallback: older/failed Python emit paths may only carry
                      // `rawText` (JSON string) without `result`. Parse it here
                      // so cards still render instead of disappearing.
                      if ((raw == null) && typeof (step as any).rawText === 'string' && (step as any).rawText.trim()) {
                        const rawText = (step as any).rawText.trim();
                        try {
                          raw = JSON.parse(rawText);
                        } catch {
                          raw = { rawText };
                        }
                      }
                      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                        const trimmed: Record<string, any> = {};
                        for (const [k, v] of Object.entries(raw as Record<string, any>)) {
                          if (Array.isArray(v) && v.length > 8) {
                            trimmed[k] = { _truncated: true, sample: v.slice(0, 8), total: v.length };
                          } else {
                            trimmed[k] = v;
                          }
                        }
                        s.rawData = trimmed;
                      } else {
                        s.rawData = raw;
                      }
                      break;
                    }
                  }
                  emitter.emitModule('analysis', 'active', { stages: analysisStages, toolStages: stocksToolStages });
                }

                if (step.type === 'generating' && step.message === '[UI_METADATA]' && step.content) {
                  try {
                    const meta = JSON.parse(step.content);
                    if (meta.fundamental) {
                      analysisStages[0].status = 'done';
                      // Merge into existing result array (multiple tools may contribute)
                      const fr = analysisStages[0].result || [];
                      const set = (label: string, raw: any, fmt?: (v: any) => string, color?: string) => {
                        if (raw == null) return;
                        const idx = fr.findIndex((r: any) => r.label === label);
                        const entry = { label, value: fmt ? fmt(raw) : String(raw), color: color || 'text-gray-600' };
                        if (idx >= 0) fr[idx] = entry; else fr.push(entry);
                      };
                      set('PE', meta.fundamental.PE, v => typeof v === 'number' ? v.toFixed(1) + 'x' : v, 'text-blue-600');
                      set('PB', meta.fundamental.PB, v => typeof v === 'number' ? v.toFixed(2) + 'x' : v, 'text-indigo-600');
                      set('Turnover', meta.fundamental.Turnover, v => typeof v === 'number' ? v.toFixed(2) + '%' : v, 'text-amber-600');
                      analysisStages[0].result = fr;
                    }
                    if (meta.technical) {
                      analysisStages[1].status = 'done';
                      const tr = analysisStages[1].result || [];
                      const set = (label: string, raw: any, color?: string) => {
                        if (raw == null) return;
                        const idx = tr.findIndex((r: any) => r.label === label);
                        const entry = { label, value: String(raw), color: color || 'text-gray-600' };
                        if (idx >= 0) tr[idx] = entry; else tr.push(entry);
                      };
                      // Translate known Chinese values to English
                      const zhEn: Record<string, string> = {
                        '牛市排列': 'Bullish', '多头排列': 'Bullish', '空头排列': 'Bearish', '熊市排列': 'Bearish',
                        '多头': 'Bullish', '空头': 'Bearish', '震荡': 'Sideways', '盘整': 'Consolidating',
                        '上升趋势': 'Uptrend', '下降趋势': 'Downtrend', '横盘': 'Sideways',
                        '买入': 'Buy', '卖出': 'Sell', '持有': 'Hold', '观望': 'Wait',
                        '强烈买入': 'Strong Buy', '强烈卖出': 'Strong Sell',
                        '看涨': 'Bullish', '看跌': 'Bearish', '中性': 'Neutral',
                      };
                      const t = (v: string) => { if (!v) return v; for (const [zh, en] of Object.entries(zhEn)) { if (v.includes(zh)) return en; } return v; };
                      const trend = meta.technical.Trend ? t(meta.technical.Trend) : meta.technical.Trend;
                      const ma = meta.technical.MA_Alignment ? t(meta.technical.MA_Alignment) : meta.technical.MA_Alignment;
                      const signal = meta.technical.Signal ? t(meta.technical.Signal) : meta.technical.Signal;
                      const trendColor = (v: string) => v.includes('Up') || v.includes('Bull') ? 'text-emerald-600' : v.includes('Down') || v.includes('Bear') ? 'text-red-600' : 'text-amber-600';
                      set('Trend', trend, trend ? trendColor(trend) : undefined);
                      set('MA', ma, 'text-violet-600');
                      set('Signal', signal, signal === 'Buy' || signal === 'Strong Buy' ? 'text-emerald-600' : signal === 'Sell' || signal === 'Strong Sell' ? 'text-red-600' : 'text-gray-600');
                      analysisStages[1].result = tr;
                    }
                    if (meta.social) {
                      analysisStages[2].status = 'done';
                      const sr = analysisStages[2].result || [];
                      if (meta.social.results && Array.isArray(meta.social.results)) {
                        const count = meta.social.results.length;
                        const prov = meta.social.provider || 'Web';
                        const idx = sr.findIndex((r: any) => r.label === 'Sources');
                        const entry = { label: 'Sources', value: `${count} from ${prov}`, color: 'text-cyan-600' };
                        if (idx >= 0) sr[idx] = entry; else sr.push(entry);
                      }
                      (analysisStages[2] as any).result = sr;
                    }
                    // IMPORTANT: include toolStages on every emit — leaving
                    // it off would overwrite the per-tool stages collected
                    // from tool_start/tool_done events upstream, causing
                    // the cards (rawData) to disappear from the chat thread.
                    emitter.emitModule('analysis', 'active', { stages: analysisStages, toolStages: stocksToolStages });
                    // Forward stock quote card data to frontend
                    if (meta.quote && meta.quote.symbol && meta.quote.price != null) {
                      const q = meta.quote;
                      // Only show card if price is a real number (not "365 (analyst target)" etc.)
                      const numPrice = typeof q.price === 'number' ? q.price : parseFloat(String(q.price));
                      if (!isNaN(numPrice)) {
                      // Detect language from user's original message
                      const isZh = /[\u4e00-\u9fff]/.test(userContent);
                      const fmtVol = (v: number | null) => {
                        if (v == null) return undefined;
                        if (isZh) {
                          if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
                          if (v >= 1e4) return (v / 1e4).toFixed(1) + '万';
                        } else {
                          if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
                          if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
                          if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
                        }
                        return String(v);
                      };
                      const fmtMv = (v: number | null) => {
                        if (v == null) return undefined;
                        if (isZh) {
                          if (v >= 1e8) return (v / 1e8).toFixed(0) + '亿';
                          if (v >= 1e4) return (v / 1e4).toFixed(1) + '万';
                        } else {
                          if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
                          if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
                        }
                        return String(v);
                      };
                      // Detect market from symbol code, router tickers, and user query
                      const detectMarket = (sym: string) => {
                        if (!sym) return undefined;
                        // Check the symbol itself
                        if (/^\d{6}\.(SH|SZ|SS)$/i.test(sym) || /^(sh|sz)\d{6}$/i.test(sym) || /^[0-368]\d{5}$/.test(sym))
                          return isZh ? 'A股' : 'A-Share';
                        if (/\.HK$/i.test(sym) || /^\d{4,5}\.HK$/i.test(sym))
                          return isZh ? '港股' : 'HK';
                        if (/\.(US|NASDAQ|NYSE)$/i.test(sym))
                          return isZh ? '美股' : 'US';
                        // Check router tickers for market suffix (more reliable than agent's raw code)
                        const routerTickers = plan.capabilities.analysis.tickers || [];
                        for (const t of routerTickers) {
                          if (/\.(SH|SZ|SS)$/i.test(t)) return isZh ? 'A股' : 'A-Share';
                          if (/\.HK$/i.test(t)) return isZh ? '港股' : 'HK';
                          if (/\.(US|NASDAQ|NYSE)$/i.test(t)) return isZh ? '美股' : 'US';
                        }
                        // Check user query for market hints
                        const query = (userContent || '').toLowerCase();
                        if (/港股|hk\b|恒生|腾讯|美团|小米|阿里巴巴|京东|网易|百度/.test(query))
                          return isZh ? '港股' : 'HK';
                        if (/a\s*股|沪深|上证|深证|创业板|科创板|茅台|平安|招商/.test(query))
                          return isZh ? 'A股' : 'A-Share';
                        // Default: 1-5 uppercase letters = US
                        if (/^[A-Z]{1,5}$/.test(sym))
                          return isZh ? '美股' : 'US';
                        return undefined;
                      };
                      const quotePayload = {
                          symbol: q.symbol,
                          name: q.name || undefined,
                          market: detectMarket(q.symbol),
                          lang: isZh ? 'zh' : 'en',
                          price: numPrice.toFixed(2),
                          change: q.change_pct != null
                            ? (q.change_pct >= 0 ? '+' : '') + Number(q.change_pct).toFixed(2) + '%'
                            : undefined,
                          volume: fmtVol(q.volume),
                          amount: fmtVol(q.amount),
                          high: q.high != null ? Number(q.high).toFixed(2) : undefined,
                          low: q.low != null ? Number(q.low).toFixed(2) : undefined,
                          open: q.open != null ? Number(q.open).toFixed(2) : undefined,
                          prevClose: q.prev_close != null ? Number(q.prev_close).toFixed(2) : undefined,
                          marketCap: fmtMv(q.total_mv || q.circ_mv),
                          pe: q.pe != null ? Number(q.pe).toFixed(2) : undefined,
                          pb: q.pb != null ? Number(q.pb).toFixed(2) : undefined,
                          turnover: q.turnover != null ? Number(q.turnover).toFixed(2) + '%' : undefined,
                      };
                      savedQuoteCard = quotePayload;
                      // Validate: only emit the quote card if the stock name or symbol
                      // reasonably matches the user's query (prevent wrong-stock cards)
                      const queryLower = (userContent || '').toLowerCase();
                      const nameMatch = q.name && queryLower.includes(q.name.toLowerCase());
                      const symMatch = q.symbol && queryLower.includes(q.symbol.toLowerCase());
                      const tickerMatch = (plan.capabilities.analysis.tickers || []).some(
                        (t: string) => t.toLowerCase().replace(/\.\w+$/, '') === (q.symbol || '').toLowerCase()
                      );
                      if (nameMatch || symMatch || tickerMatch) {
                        emitToUser(userId, 'agent:chat:quote', {
                          sessionId,
                          quote: quotePayload,
                        });
                      }
                      } // end !isNaN(numPrice)
                    }
                  } catch (e) { }
                }
              },
              (report) => {
                analysisStages.forEach(s => { s.status = 'done'; });
                finalAnalysisStages = analysisStages;
                emitter.emitModule('analysis', 'completed', { stages: analysisStages, toolStages: stocksToolStages });
                const compactFromStages = () => {
                  const completed = stocksToolStages.filter((s) => s.state === 'completed');
                  const byTool = new Map<string, any>();
                  for (const s of completed) {
                    if (s.rawData != null) byTool.set(s.stage, s.rawData);
                  }

                  const quote = byTool.get('get_realtime_quote');
                  const history = byTool.get('get_daily_history');
                  const trend = byTool.get('analyze_trend');
                  const news = byTool.get('search_stock_news') || byTool.get('search_comprehensive_intel');

                  const summary: Record<string, any> = {
                    market_snapshot: {
                      code: quote?.code ?? history?.code ?? null,
                      name: quote?.name ?? null,
                      source: quote?.source ?? history?.source ?? null,
                      price: quote?.price ?? null,
                      change_pct: quote?.change_pct ?? null,
                      open: quote?.open ?? null,
                      high: quote?.high ?? null,
                      low: quote?.low ?? null,
                      pre_close: quote?.pre_close ?? null,
                      pe_ratio: quote?.pe_ratio ?? null,
                      pb_ratio: quote?.pb_ratio ?? null,
                    },
                    trend_context: {
                      total_records: history?.total_records ?? (Array.isArray(history?.data) ? history.data.length : null),
                      latest_kline: Array.isArray(history?.data) ? history.data[0] ?? null : null,
                      kline_sample: Array.isArray(history?.data) ? history.data.slice(0, 8) : null,
                      trend_status: trend?.trend_status ?? null,
                      buy_signal: trend?.buy_signal ?? null,
                      ma_alignment: trend?.ma_alignment ?? null,
                    },
                    news_context: {
                      provider: news?.provider ?? null,
                      items_sample: Array.isArray(news?.results) ? news.results.slice(0, 5) : null,
                      total_items: Array.isArray(news?.results) ? news.results.length : null,
                    },
                    tool_coverage: completed.map((s) => ({
                      tool: s.stage,
                      duration_ms: s.durationMs,
                      has_raw_data: s.rawData != null,
                    })),
                  };

                  return [
                    'Structured stock dataset for final synthesis:',
                    '- This is data-first output (no inner stock narrative).',
                    '- Use these fields as primary evidence for your final investment summary.',
                    '',
                    JSON.stringify(summary, null, 2),
                  ].join('\n');
                };
                const normalizedReport = (report || '').trim() || compactFromStages();
                resolve({ type: 'ANALYSIS', data: normalizedReport });
              },
              (error) => {
                analysisStages.forEach(s => { s.status = 'done'; });
                finalAnalysisStages = analysisStages;
                emitter.emitModule('analysis', 'completed', { stages: analysisStages, toolStages: stocksToolStages });
                resolve({ type: 'ANALYSIS', data: 'Error: ' + error });
              }
            );
          })
        );
      }

      if (plan.capabilities.simulate.needed) {
        emitter.emitModule('simulation', 'active', { panelists: [{ name: 'Simulating...', status: 'active', verdict: 'Pending' }] });
        let tickers = plan.capabilities.simulate.tickers || [];
        if (!tickers.length) tickers = ['SPY', 'QQQ'];

        const GENERIC_ANALYST_KEYS = new Set(['technical_analyst', 'fundamentals_analyst', 'growth_analyst', 'news_sentiment_analyst', 'sentiment_analyst', 'valuation_analyst']);

        const analysisOptions: any = { tickers, showReasoning: true };
        if (plan.specificGurus?.length > 0) {
          analysisOptions.analysts = plan.specificGurus;
        }
        console.log(
          `[agent:chat:simulation] planned_requested=${analysisOptions.analysts?.join(',') || '(tool_default)'} tickers=${tickers.join(',')} sessionId=${sessionId}`,
        );

        promises.push(
          hedgefundService.runAnalysis(analysisOptions, () => {})
            .then(hfResult => {
              const toDisplayName = (name: string) => name.replace(/_agent$/i, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              const plannedAnalysts = (hfResult.analysts || []).map(toDisplayName);
              const producedAnalysts = Object.keys(hfResult.analyst_signals || {});
              const missingAnalysts = plannedAnalysts.filter((name) => !producedAnalysts.includes(name));
              const panelists = Object.keys(hfResult.analyst_signals || {}).map(p => ({
                name: p,
                avatar: 'L',
                status: 'done',
                verdict: Object.values(hfResult.analyst_signals[p] || {})[0]?.signal || 'Hold',
                confidence: Object.values(hfResult.analyst_signals[p] || {})[0]?.confidence || 0,
                group: GENERIC_ANALYST_KEYS.has(p) ? 'analyst' : 'guru'
              }));
              console.log(
                `[agent:chat:simulation] planned_effective=${plannedAnalysts.join(',') || '(none)'} produced=${producedAnalysts.join(',') || '(none)'} missing=${missingAnalysts.join(',') || '(none)'} sessionId=${sessionId}`,
              );
              console.log(
                `[agent:chat:simulation] frontend_panelists=${panelists.map((x) => x.name).join(',') || '(none)'} count=${panelists.length} sessionId=${sessionId}`,
              );
              finalPanelists = panelists;
              emitter.emitModule('simulation', 'completed', { panelists });
              const isGuruCouncil = plan.queryType === 'guru-council';
              const rep = hedgefundService.formatReport(hfResult, isGuruCouncil);
              return { type: 'SIMULATION', data: rep };
            })
            .catch(e => {
              emitter.emitModule('simulation', 'completed', { panelists: [] });
              return { type: 'SIMULATION', data: 'Error: ' + e.message };
            })
        );
      }

      console.log(
        `[agent:chat:timing] tool_dispatch_s=${asSeconds(Date.now() - toolDispatchStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId} tools=${promises.length}`,
      );

      const toolsWaitStartedAt = Date.now();
      const results = await Promise.allSettled(promises);
      // Capture the tools-phase duration (from request start through tools
      // completion, NOT including the synthesis stream that follows). This
      // is the "honest" wait number we want shown in the trigger pill on
      // history restore — frontend's live timer freezes at this exact moment
      // when synthesis kicks off, so persisting it keeps history sessions
      // consistent with their original live display.
      const toolsPhaseDurationS = Math.max(0, Math.round((Date.now() - requestStartedAt) / 1000));
      console.log(
        `[agent:chat:timing] tools_parallel_wait_s=${asSeconds(Date.now() - toolsWaitStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId}`,
      );
      if (isAborted()) {
        console.log(`[agent:chat] Aborted after Promise.allSettled for session ${sessionId}`);
        emitter.emitStreamCancelled();
        activeChatSessions.delete(sessionId);
        chatSessionStartTimes.delete(sessionId);
        finishChatReplayBuffer(sessionId);
        chatAbortControllers.delete(sessionId);
        return;
      }
      console.log('[agent:chat] Promise.allSettled completed:', results.map(r => r.status === 'fulfilled' ? `✅ ${r.value.type}` : `❌ ${(r as any).reason?.message}`).join(', '));
      
      const contextBuildStartedAt = Date.now();
      const synthHistory = formatHistory(sessionHistory, MAX_HISTORY_FOR_SYNTHESIS);
      let contextString = "";
      if (synthHistory) {
        contextString += "【CONVERSATION HISTORY — for continuity, do NOT repeat old findings】\n" + synthHistory + "\n\n";
      }
      contextString += "【User Original Request】\n" + userContent + "\n\n";
      if (plan.imageDigest) {
        contextString += `【IMAGE_DIGEST】\n${plan.imageDigest}\n\n`;
      }
      
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          contextString += `【${r.value.type} REPORT】\n${r.value.data}\n\n`;
        }
      });

      // Append structured source URLs so the report LLM can produce inline citations
      if (finalSocialSources.length > 0) {
        contextString += "【VERIFIED SOURCE URLs — CITE THESE INLINE】\n";
        contextString += "Copy-paste the markdown link after relevant claims. Each source MUST appear at least once in your report.\n";
        finalSocialSources.forEach((s, i) => {
          // Give the LLM ready-to-paste markdown links
          const displayName = s.domain.replace(/^www\./, '').replace(/\.\w+$/, '');
          const capitalName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
          contextString += `  ${i + 1}. Ready-to-paste: [${capitalName}](${s.url}) — "${s.title}"\n`;
        });
        contextString += "\n";
      }

      const isDeepResearch = data.mode === 'roundtable';

      const buildDeepResearchPrompt = (inputContext: string) => getGlobalTimeContext() + `You are a senior research director at a top-tier investment research firm.

Your task is to produce a professional-grade DEEP RESEARCH REPORT — the kind that institutional investors, fund managers, and sophisticated traders actually pay for and act on.

This is NOT a quick take or trader memo. This is a thorough, multi-dimensional research product that synthesizes all available evidence into a coherent investment thesis with rigorous supporting analysis.

=== INPUT ===
Topic: ${userContent}
${inputContext}

=== REPORT STRUCTURE ===

Report Title (MANDATORY)
- Format: # (single hash) for clear, professional framing
- Must convey the core thesis and asset/topic in one line
- Example: "# NVDA: AI Capex Cycle Peaks — Re-rating Risk Rising"
- Example: "# 英伟达深度研究：AI资本开支周期见顶，估值重评风险上升"

---

Research Overview (MANDATORY — NO HEADING, start directly)
A compact, high-density executive brief:
- **Verdict**: Bullish / Bearish / Neutral + Conviction Level (High/Medium/Low)
- **Core Thesis**: 2-3 sentences — What is the key insight the market is missing?
- **Key Catalysts**: Next 3-6 month triggers (with approximate dates if known)
- **Risk/Reward**: Quantified upside vs downside ratio

---

Methodology & Data Scope (MANDATORY) — Use ## heading
Brief statement of:
- What data sources were analyzed (news, social sentiment, on-chain/financial data, technical indicators)
- Time horizon of the analysis
- Any limitations or data gaps
- This builds credibility and helps the reader calibrate confidence

---

Core Analysis Modules (3-5 sections, DEEP)
Choose the most relevant modules from:

**A. Fundamental & Business Analysis**
- Revenue structure, growth drivers, segment-level breakdown
- Competitive positioning, moat analysis, TAM/SAM
- Management quality, capital allocation track record
- Key operating metrics and trends (not just latest quarter)

**B. Financial Deep-Dive**
- Multi-quarter/year financial trend analysis (margins, FCF, leverage)
- Balance sheet health, cash runway, debt maturity profile
- ROE/ROIC decomposition, working capital efficiency
- Quality of earnings assessment

**C. Valuation Framework**
- Multiple valuation approaches (relative + absolute if possible)
- Historical valuation range context
- Peer comparison table with key multiples
- Sensitivity analysis on key assumptions
- Analyst consensus vs your view

**D. Technical & Flow Analysis**
- Multi-timeframe price structure (daily/weekly)
- Key support/resistance levels with volume confirmation
- Institutional flow data, smart money positioning
- Options flow / derivatives positioning if relevant
- Trend strength and momentum indicators

**E. Sentiment & Narrative Analysis**
- Social media sentiment trends and shifts
- KOL/influencer positioning changes
- News flow analysis — what's priced in vs what's not
- Retail vs institutional sentiment divergence

**F. Macro & Thematic Context**
- Sector rotation dynamics
- Policy and regulatory environment
- Supply chain / industry cycle positioning
- Cross-market correlations and contagion risks

**G. Catalyst Calendar**
- Time-ordered list of upcoming events
- Expected impact and probability assessment
- Pre-positioning recommendations for each catalyst

Guidelines for modules:
- Each module MUST contain original analysis, not data recitation
- Use tables for comparative data (peer comps, financial trends, scenario modeling)
- Include specific numbers: growth rates, margins, multiples, price levels
- Cross-reference between modules — show how fundamental changes map to technical levels
- Challenge consensus view — identify where market pricing diverges from evidence

---

Risk Matrix (MANDATORY) — Use ## heading
Professional risk assessment table:

| Risk Factor | Probability | Impact | Mitigation / Monitor |
|-------------|------------|--------|---------------------|
| [specific risk] | High/Med/Low | [quantified if possible] | [what to watch] |

Include minimum 4 risks across different categories (fundamental, technical, macro, sentiment).

---

Scenario Analysis (MANDATORY) — Use ## heading
Expanded scenario modeling with more granularity than a simple bull/base/bear:

| Scenario | Probability | Price Target | Timeline | Key Assumption | Trigger to Confirm |
|----------|------------|-------------|----------|----------------|-------------------|
| Aggressive Bull | ~% | $X | Xm | [assumption] | [observable trigger] |
| Base Bull | ~% | $X | Xm | [assumption] | [observable trigger] |
| Neutral | ~% | $X | Xm | [assumption] | [observable trigger] |
| Bear | ~% | $X | Xm | [assumption] | [observable trigger] |
| Tail Risk | ~% | $X | Xm | [assumption] | [observable trigger] |

---

Expert Debate Analysis (MANDATORY when expert debate data is provided) — Use ## heading
This section is the SIGNATURE of this report — it showcases the multi-expert roundtable process.

Structure:
**a) Key Debate Points** — What did the experts focus on? What angles did each expert bring?
  - Summarize each expert's core viewpoint in 1-2 sentences with their confidence level
  - Use a table format:
  | Expert | Core View | Confidence | Key Argument |
  |--------|-----------|------------|-------------|
  | [name] | Bullish/Bearish/Neutral | X% | [1-line argument] |

**b) Points of Agreement** — Where did experts converge? What does consensus tell us?
  - List 2-3 points where most experts agreed, and explain why this convergence strengthens conviction

**c) Points of Contention** — Where did experts DISAGREE? This is the most valuable part.
  - List 2-4 specific disagreements between experts
  - For each: which experts, what they disagreed on, what data would resolve it
  - Format: "FA vs QT on [topic]: FA argues [X], QT counters [Y]. Resolution: watch [metric]"

**d) Synthesis Verdict** — How the debate shaped the final thesis
  - Did the debate change the initial analysis? If so, how?
  - What new insights emerged from the multi-perspective review?
  - Final confidence level after incorporating expert debate

If no expert debate data is provided, SKIP this section entirely.

---

Actionable Strategy (MANDATORY) — Use ## heading
Concrete implementation plan:
- **Position sizing**: % of portfolio, scaling plan
- **Entry strategy**: Specific levels, order types, timing
- **Stop loss**: Hard stop + mental stop levels with logic
- **Take profit**: Staged exits with rationale
- **Hedging**: Options overlay or pair trade recommendations if applicable
- **Timeline**: Hold period expectation
- **Review triggers**: What would make you reassess (both positive and negative)

---

Key Monitoring Dashboard (THIS MUST BE THE VERY LAST SECTION)
- Translate heading to user's language (e.g. "关键监控指标")
- 5-8 specific, quantifiable metrics/events to track going forward
- Each item: what to monitor, current value → threshold that changes thesis, frequency of check
- Format as a structured list with bold metric names

═══ ABSOLUTE RULES ═══
1. HEADING LEVELS: # for report title. ## for section headings. **Bold** for subsections within. No ### or ####. NEVER prefix headings with numbers like "1.", "2.", "3." — the frontend auto-generates numbering.
2. Section titles MUST be specific and analytical — not generic. Create proper research section titles (e.g. "收入放缓与利润弹性的博弈", "估值锚定：DCF vs 可比公司的分歧").
3. Synthesize evidence across ALL data sources. Highlight where different data dimensions agree (conviction) and where they conflict (uncertainty).
4. Never fabricate data. If exact numbers aren't available, state the directional finding and name the missing metric.
5. END-OF-PARAGRAPH CITATIONS: After a paragraph or sentence with key claims/data, place citation tags at the END of that paragraph or line, never in the middle of a sentence. Format: [Source Name](url). If multiple sources support the same paragraph, group them together at the paragraph end like: [Bloomberg](...) [Reuters](...). Do NOT place citation tags between words. Do NOT list source URLs in a separate references section. NEVER wrap citations in parentheses or add words like "数据"/"来源".
6. LANGUAGE CONSISTENCY (CRITICAL): If user wrote in Chinese, ENTIRE output in Chinese — all headings, labels, table headers, body text, metrics. No English mixed in. Vice versa for English. Non-negotiable.
7. Length: 3000-6000 words. This is a deep research product — completeness and depth are expected. But every sentence must add analytical value. No filler.
8. End with "Key Monitoring Dashboard" — this MUST be the absolute last section. Nothing after it.
12. EXPERT DEBATE: If the input contains expert debate data, the "Expert Debate Analysis" section is MANDATORY and should be one of the most detailed sections. This is the unique value of this report.
9. QUANTITATIVE DENSITY: The report should feel data-rich. Include specific numbers wherever possible. Tables are encouraged for comparative data.
10. SECTION FLEXIBILITY: For non-stock topics (macro, crypto, general), adapt modules naturally. Skip stock-specific modules. Focus on what matters for the topic.
11. CROSS-REFERENCING: Explicitly connect insights across sections. "The deteriorating margin trend (Section 3B) supports the bearish technical breakdown below $X (Section 3D)" style references add analytical rigor.

═══ STYLE RULES ═══
- Authoritative but evidence-based. Present findings with conviction backed by data.
- Professional research tone — not academic, not casual. Think Goldman Sachs equity research meets hedge fund strategy note.
- Use precise language: "15% probability of…" not "unlikely". "Support at $142 with 2.3M share volume cluster" not "there's support nearby".
- Tables and data visualization take priority over prose when data supports it.
- Each section should build the thesis progressively — the report should read as one coherent argument, not disconnected modules.

═══ INTERNAL (DO NOT OUTPUT) ═══
Before writing, build your internal thesis:
1. Clear directional stance + conviction level
2. The key variable the market is mispricing
3. 3 specific numbers that anchor your thesis
4. The one thing that would make you wrong
Do NOT output this reasoning. Begin the report directly.
`;

      const traderMemoPrompt = getGlobalTimeContext() + `You are a top-tier macro + equity research analyst with strong opinions.

Your job is NOT to summarize information.
Your job is to form a clear, tradeable view and guide decision-making — grounded in rigorous fundamental, valuation, financial, and technical analysis.

Write like a sharp internal memo or trader note — not a formal report.

=== INPUT ===
Topic: ${userContent}
Context:
${contextString}

=== OUTPUT STRUCTURE ===

Title (OPTIONAL, HIGH-SIGNAL)
- Only include a title if it helps someone decide what to do.
- Format: use # (single hash) for the title — visually larger than ## section headings. Do NOT use ##, ###, or ####.

If you include a title, it MUST:
- Reflect the core trade or decision
- Anchor on ONE key variable (not abstract themes)
- Be consistent with the Executive Snapshot Bias and Action

Good titles: highlight one key driver, challenge a specific market assumption, or define a conditional trade (e.g. "TSLA: Short Until $280 Breaks")
Avoid: abstract phrases ("paradox", "battle", "era"), generic contrasts ("growth vs valuation"), patterns like "not X, but Y"

If not included: start directly with Quote Snapshot or the Executive Snapshot (no heading).

---

0.5. Quote Snapshot (MANDATORY when analyzing a specific stock/asset)
- If the analysis involves a specific ticker, output a structured quote block BEFORE the TL;DR.
- Use the heading "## Quote Snapshot" (English) or "## 标的信息" (Chinese, following language rule).
- Format as a bullet list with bold keys. Include ONLY data available in the raw reports — do NOT fabricate numbers.
- Required fields (use whatever is available):
  - **Symbol**: TICKER
  - **Name**: Company name
  - **Last Price**: current price from the raw report
  - **Change (%)**: percentage change if available
  - **Volume**: trading volume if available
- Chinese equivalents: **证券代码**, **股票名称**, **最新价**, **涨跌幅**, **成交量**
- If no specific price data is available in the raw reports, SKIP this section entirely.

---

Executive Snapshot (MANDATORY — NO HEADING AT ALL)
- NEVER output a heading like "TL;DR", "Summary", "结论", "总结", "Executive Summary", or any variant. Start the content directly without any heading.
- First, a compact snapshot:
  Bias / Action / Confidence / Key Trigger (one line each)
- Then 2-3 sentences maximum:
  What's happening now? What is the market getting wrong? What's my unique edge?
- If writing in Chinese, translate ALL labels to Chinese. No English mixed in.

---

Deep-Dive Sections (2-4 sections, FLEXIBLE)
Pick 2-4 angles that matter MOST for this specific topic. Each section gets its own vivid, specific ## heading. Do NOT use generic titles — create headlines a reader would actually click.

Choose from (but don't feel obligated to cover all):
- **Business & Fundamentals**: revenue structure, growth drivers, segment breakdown, competitive moat, management quality
- **Valuation**: PE/PS/PEG vs peers and history, analyst targets, implied upside/downside. Use tables when data supports it
- **Financial Quality**: margins, cash flow, balance sheet, ROE — focus on inflection points and trends, not encyclopedic coverage
- **Technical & Flow**: price action, support/resistance, moving averages, fund flows, short interest, institutional positioning
- **Macro / Thematic**: sector rotation, policy tailwinds/headwinds, supply chain dynamics — when relevant
- **Catalyst Calendar**: upcoming earnings, product launches, regulatory decisions — time-sensitive events

Guidelines:
- Each section should have a POINT OF VIEW, not just describe data. "Revenue grew 15%" is description. "Ad revenue is masking a gaming collapse" is analysis.
- Use narrative paragraphs with tables where data supports it. NOT bullet-point dumps.
- If exact numbers aren't in the raw data, discuss qualitatively without fabricating.
- Cover fundamental + valuation + technical dimensions across your chosen sections. Don't skip all quantitative angles.

---

Signal vs Noise (MANDATORY) — Table format with your own creative ## heading:

| Noise (over-weighted by market) | Signal (under-weighted by market) |
|-------------------------------|----------------------------------|
| [thing + why it's noise] | [thing + why it matters] |

Positioning (MANDATORY) — Use your own creative ## heading.
Concrete: entry level, stop loss, target, position sizing logic. What to do NOW vs what to wait for. If no clear trade, say "wait for [specific catalyst]."

Stress Test (MANDATORY) — Use your own creative ## heading. NOT a disclaimer. Model 2-3 scenarios with probability and price impact:

| Scenario | Probability | Price Impact | Key Assumption |
|----------|------------|-------------|----------------|
| Bull | ~% | $X → $Y | [assumption] |
| Base | ~% | $X → $Y | [assumption] |
| Bear | ~% | $X → $Y | [assumption] |

Identify the floor price under panic conditions.

---

Tags (translate to user's language)
- Importance: High / Medium / Low · Categories: 2-3 tags

Questions to watch (THIS MUST BE THE VERY LAST SECTION — nothing after it)
- Translate heading to user's language (e.g. "值得关注的问题：")
- Format as **bold heading** followed by 3-5 bullet points
- Each bullet: ONE standalone question only — a single interrogative sentence ending with ? (English) or ？ (Chinese). Embed the metric or time horizon inside the question wording if needed.
- Do NOT add answers, explanations, "If… then…" clauses, second sentences, or any text after the question mark.
- Do NOT put markdown links, bare URLs, or [Source](url) in this section (no citations here).
- CRITICAL: No text, tags, or sections may appear after this list

═══ ABSOLUTE RULES ═══
1. HEADING LEVELS: # for report title only. ## for all section headings. No ### or ####. Use **bold** for subsections and key terms throughout the text. NEVER prefix headings with numbers like "1.", "2.", "3." — the frontend auto-generates numbering.
2. Section titles MUST be unique and topic-specific. NEVER use generic titles like "Fundamental Analysis", "Valuation", "Financial Health", "Signal vs Noise", "Positioning", "Stress Test" etc. — these are internal labels, not output headings. Create engaging, specific headings (e.g. "广告引擎点火，但游戏拖了后腿", "23倍PE：贵还是便宜？", "多空交锋：谁在买？谁在跑？").
3. Synthesize, do not concatenate. Surface agreements, contradictions, and emergent insights across agents.
4. Never fabricate data. Only use information present in the raw reports. If a quantitative threshold is useful but not in the data, name the metric and explain its importance without inventing numbers.
5. END-OF-PARAGRAPH CITATIONS: After a paragraph or sentence with key claims/data, place citation tags at the END of that paragraph or line, never in the middle of a sentence. Format: [Source Name](url). If multiple sources support the same paragraph, group them together at the paragraph end like: [Bloomberg](...) [Reuters](...). Do NOT place citation tags between words. Do NOT list source URLs in a separate references section. NEVER wrap citations in parentheses or add words like "数据"/"来源".
6. LANGUAGE CONSISTENCY (CRITICAL): If user wrote in Chinese, ENTIRE output in Chinese — all headings, labels, table headers, body text. No English mixed in. Vice versa for English. Non-negotiable.
7. Length: 1500-3500 words. Depth over brevity, but no padding. Every sentence must earn its place. Cover ALL analysis dimensions — fundamental, valuation, financial, technical, and actionable trade setup.
8. End with "Questions to watch" — 3-5 forward-looking questions with specific data triggers; each bullet question-only (one sentence, ? or ？), no follow-on prose and no links.
9. REDUCE qualitative statements, INCREASE quantitative data. "Margins are important" is worthless. "Margin below 72% = thesis broken" is actionable.
10. SECTION FLEXIBILITY: For non-stock topics (macro, crypto, general questions), adapt sections naturally — skip stock-specific sections like Quote Snapshot, Valuation, Financial Health. Focus on sections that fit the topic.

═══ STYLE RULES ═══
- Be opinionated, not neutral. Use "My take:" for direct assessments.
- No fluff, no textbook tone. Write like a trader thinking out loud.
- Short, punchy paragraphs. Each section adds NEW insight (no repetition).
- Do NOT just summarize news. Do NOT hedge excessively. Do NOT default to "it depends".
- MUST produce clear Bias + Action. MUST include Signal vs Noise table. MUST include Positioning with levels. MUST include Stress Test scenarios. Deep-dive sections are flexible — pick the angles that matter most.

═══ INTERNAL (DO NOT OUTPUT) ═══
Before writing, internally decide:
- A clear stance (bullish / bearish / neutral)
- The specific variable the market is mispricing
- Whether a title is necessary
- The quantitative thresholds that would flip your thesis

Do NOT reveal this reasoning. Begin writing directly.
`;

      // ─── Research Report Prompt ───
      const researchPrompt = `You are a senior research analyst at a top-tier consulting firm (McKinsey / Bain / BCG caliber).

Your job is NOT to summarize search results. Your job is to synthesize information into a structured, insightful research report that helps decision-makers understand a topic deeply.

Write like an internal research brief — clear, structured, data-driven, with strong conclusions.

=== INPUT ===
Topic: ${userContent}
Context:
${contextString}

=== OUTPUT STRUCTURE ===

Title
- Use # (single hash). Reflect the core research question or finding.
- Good: "东南亚外卖市场：Grab 与 GoTo 的补贴战谁能赢？"
- Avoid: generic titles like "市场研究报告"

Executive Summary (NO ## HEADING, NO numbering — start the summary text directly after the title)
- 3-5 sentences. Core findings + key conclusion. What should the reader take away?

Analysis Sections (3-5 sections, each with a ## heading)
Pick sections that best fit the topic. Each gets a vivid, specific ## heading.
Choose from:
- **Market Overview**: market size, growth rate, key trends, geographic breakdown
- **Competitive Landscape**: key players, market share, positioning, moat analysis
- **Technology & Product**: tech stack, product comparison, feature matrix, architecture
- **Business Model**: revenue model, unit economics, pricing, cost structure
- **Team & Organization**: founding team, key hires, org structure, culture
- **Funding & Financials**: funding history, valuation, revenue, burn rate, runway
- **Supply Chain / Industry Structure**: upstream/downstream, dependencies, bottlenecks
- **Regulatory & Macro**: policy environment, regulatory risks, macro factors

Guidelines:
- Each section must have a POINT OF VIEW. "Revenue grew 15%" is data. "Revenue growth is decelerating because of market saturation" is insight.
- Use tables and comparison matrices where data supports it.
- Cite sources with inline Markdown links when available.
- Do NOT fabricate data. If specific numbers aren't available, discuss qualitatively.

Key Findings — Summary table or bullet list of the most important discoveries.

Risks & Challenges — What could go wrong? What are the unknowns?

Conclusion & Recommendations — Clear, actionable takeaways. What should the reader do with this information?

Questions to Watch (LAST SECTION)
- 3-5 forward-looking questions with specific triggers or data points to monitor.
- Each bullet: one question sentence only (? or ？). No explanations, answers, or markdown links/URLs in this section.

═══ ABSOLUTE RULES ═══
1. HEADING LEVELS: # for title only. ## for sections. Use **bold** for subsections and key terms, figures, and conclusions throughout the text. NEVER prefix headings with numbers like "1.", "2.", "3." — the frontend auto-generates numbering in the Table of Contents.
2. Section titles MUST be specific and engaging, not generic labels.
3. Synthesize across sources. Surface contradictions and emergent patterns.
4. Never fabricate data. Use qualitative discussion when numbers are unavailable.
5. END-OF-PARAGRAPH CITATIONS: After a paragraph or sentence with key claims/data, place citation tags at the END of that paragraph or line, never in the middle of a sentence. Format: [Source Name](url). If multiple sources support the same paragraph, group them together at the paragraph end.
6. LANGUAGE: Match user's language entirely. Chinese query = all Chinese. English = all English.
7. Length: 1500-3000 words. Depth over breadth.
8. Tables for comparisons, bullet lists for key points, narrative for analysis.
`;

      // ─── Market Brief Prompt ───
      const marketBriefPrompt = `You are a senior market strategist writing a concise daily market briefing.

Your job is to deliver a fast, scannable overview of what happened in the market — not deep analysis. Think: morning market email that a trader reads in 2 minutes.

=== INPUT ===
Topic: ${userContent}
Context:
${contextString}

=== OUTPUT STRUCTURE ===

# [Market/Sector] Brief — [Date or Context]

## Market Overview
- Major index movements (S&P 500, Nasdaq, Dow, or relevant regional indices)
- Overall sentiment: risk-on / risk-off / mixed
- Key numbers in a compact table:

| Index | Price | Change | % |
|-------|-------|--------|---|

## Top Movers
- Top 5 gainers and losers (sectors or individual names)
- Brief reason for each major move (1 sentence max)

## Key Catalysts
- 2-4 bullet points: the events driving today's market action
- Each bullet: what happened + market reaction

## Earnings / Events Calendar
- Notable earnings released today + market reaction (beat/miss, stock move)
- Upcoming events in next 1-3 days

## Tomorrow's Watch
- 3-5 items to watch: upcoming data releases, earnings, events, technical levels

═══ RULES ═══
1. LANGUAGE: Match user's language entirely.
2. Be CONCISE. No fluff. Every sentence earns its place.
3. Use tables for data, bullets for events. Minimal narrative paragraphs.
4. Cite sources with inline links when available.
5. Never fabricate data. If specific numbers aren't in the context, say "data pending" or skip.
6. Length: 500-1200 words. This is a brief, not a report.
7. Focus on "what happened" and "what's next", not "deep analysis".
`;

      // ─── Guru Council Prompt ───
      // Named-guru mode: user explicitly mentioned 1+ gurus outside of Roundtable. Answer only those gurus, no council framing.
      const isNamedGurusOnly =
        plan.queryType === 'guru-council'
        && plan.specificGurus?.length > 0
        && data.mode !== 'roundtable';
      const namedGuruList: string[] = isNamedGurusOnly
        ? plan.specificGurus.map((k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()))
        : [];
      const namedGurusPrompt = `You are channeling the voice of specific investors the user explicitly asked about. Answer as each named investor in their own style, optimized for SCANNABLE reading.

The user named these investors: ${namedGuruList.join(', ')}. Do NOT include any other investors. Do NOT frame this as a "roundtable" or "council". Do NOT produce consensus/disagreement/synthesis sections. Only the named investor${namedGuruList.length > 1 ? 's speak' : ' speaks'}.

=== INPUT ===
Question: ${userContent}
Context (may include simulation signals, fundamental metrics, and search results):
${contextString}

=== OUTPUT STRUCTURE ===

# ${namedGuruList.length === 1 ? `${namedGuruList[0]}'s Take on [Asset/Topic]` : `${namedGuruList.join(' vs ')}: on [Asset/Topic]`}

${namedGuruList.length > 1
  ? 'For EACH named investor, produce ONE self-contained section below using the scaffolding. Each investor is fully independent — no cross-references, no "they agree/disagree" text anywhere.\n\n---\n'
  : ''}${namedGuruList.map((name) => `## ${name}

**🟢 Bullish / 🔴 Bearish / 🟡 Neutral · Conviction XX%** *(one line, pick one signal and the conviction % from simulation data)*

> **Bottom line (${name})** — ONE punchy sentence in ${name}'s voice that captures the verdict. No fluff.

### The Framework
2-3 tight sentences on ${name}'s specific methodology. Name the mental models (e.g. "margin of safety", "circle of competence", "tail risk", "PEG < 1"). This is NOT generic investing — speak to what makes ${name} distinctive.

### Key Numbers at a Glance
A compact markdown table with 4-6 rows of the most important metrics from the context. Format:

| Metric | Value | ${name}'s Read |
|---|---|---|
| (metric) | (value) | (one-phrase read: ✅ good / ⚠️ watch / 🚫 red flag) |

Pick metrics that MATTER to ${name} specifically — not a generic dump. Buffett cares about ROIC + moat; Burry cares about debt + insider activity; Lynch cares about PEG + growth category; Taleb cares about tail exposure + antifragility.

### The Analysis
3-5 labeled mini-paragraphs, each starting with a **bolded lead-in** for scannability. Each is 2-4 sentences max. Example structure:

**Valuation tension** — ${name}'s take on the price vs. fundamentals story, with specific numbers. [Source](url)

**Growth signals** — Is the top-line thesis still intact? What do the numbers say? [Source](url)

**The [distinctive factor]** — The ${name}-specific angle (moat, key-man risk, tail exposure, etc.). [Source](url)

Keep each block focused on ONE idea. No walls of prose.

### Risks on the Radar
3-5 concise bullets, each **bolded** lead phrase + explanation. Frame them the way ${name} actually thinks about risk — not generic "macro uncertainty" boilerplate.

### What Would Change ${name}'s Mind
2-3 CONCRETE, measurable triggers. Each bullet starts with a condition ("If revenue growth returns to double digits…" / "If the stock trades below \$X…"). Quantify wherever possible.
`).join('\n\n---\n\n')}

═══ RULES ═══
1. ONLY the named investor${namedGuruList.length > 1 ? 's' : ''}: ${namedGuruList.join(', ')}. No other guru names. No roundtable/council/consensus framing.
2. STRUCTURE IS NON-NEGOTIABLE: every named investor gets the six sub-sections in this exact order: verdict line → bottom line quote → Framework → Key Numbers table → Analysis (with bolded lead-ins) → Risks on the Radar → What Would Change Their Mind.
3. TABLE is REQUIRED. Use real numbers from the context. If a specific metric is missing, write "data pending" — do not fabricate.
4. SCANNABILITY > COMPLETENESS: short paragraphs, bold lead-ins, bullets. No wall-of-text analysis blocks.
5. VOICE: Use each investor's actual published frameworks and characteristic phrases. "I do not short stories, but I do not pay full price for them either" (Damodaran). "Price is what you pay, value is what you get" (Buffett). Etc.
6. LANGUAGE: Match the user's language entirely. Chinese query = all Chinese (including table headers and signal labels). English query = all English.
7. CITATIONS: At the END of a paragraph or table cell, format [Source](url). Never mid-sentence. Never wrap in parentheses. Never list URLs separately.
8. LENGTH: 500-900 words per investor. Total: ${namedGuruList.length * 600}-${namedGuruList.length * 900} words.
9. HEADINGS: # for title only. ## for each investor name. ### for sub-sections within. **bold** for metric leads, numbers, and emphasis. NEVER prefix headings with numbers like "1.", "2.".
`;

      const guruCouncilPrompt = isNamedGurusOnly ? namedGurusPrompt : `You are moderating a roundtable of legendary investors analyzing a specific asset or market question.

Your job is to present each guru's perspective through their known investment framework, then synthesize a consensus recommendation. This is NOT a generic summary — each guru must speak in character with their known methodology.

IMPORTANT: The raw simulation data below contains only short signal summaries (1-2 sentences per analyst). Your job is to EXPAND each guru's view into a full analysis paragraph by applying their well-known investment framework to the available data. Use the signal direction (bullish/bearish/neutral) and confidence as anchors, then reason through HOW that guru would arrive at that conclusion based on their published methodology.

=== INPUT ===
Topic: ${userContent}
Context:
${contextString}

=== OUTPUT STRUCTURE ===

# [Asset/Topic]: Guru Council Roundtable

## Asset Overview
- Asset name, ticker, current price (if available from context)
- Brief context: what makes this worth analyzing now (use search data if available)

## Guru Perspectives

For each guru in the simulation data, create a detailed subsection. If the user named specific gurus, prioritize those. Otherwise use all gurus from the simulation results.

**[Guru Name]**

- **Investment Framework**: 2-3 sentences explaining their known methodology (e.g., Buffett = circle of competence + economic moat + margin of safety; Lynch = PEG ratio + growth categories; Dalio = All Weather + macro cycles)
- **Analysis**: 4-8 sentences. This is the core — apply their specific framework to this asset using ALL available data (fundamental metrics, search results, technicals, news). Reference specific numbers when available. Explain WHY this guru would reach their signal conclusion.
- **Signal**: 🟢 Bullish / 🔴 Bearish / 🟡 Neutral (match the simulation data)
- **Conviction**: X% (match the simulation data)

## Key Disagreements
- Where do the gurus disagree? What's the core tension?
- 3-4 bullet points highlighting specific debates with data backing

## Consensus Decision
- Weighted consensus: summarize the majority view
- Recommended action with confidence level
- Key conditions or price levels that would change the recommendation

## Risk Factors
- 3-5 risk factors the gurus collectively flag
- What scenario would make them ALL wrong?

## Questions to Watch
- 3-5 forward-looking questions with specific data triggers and time horizons
- Each line: one interrogative sentence only; no answers or citations (no [Name](url), no URLs) in this section

═══ RULES ═══
1. Each guru MUST use their actual known framework — not generic "analysis". Buffett talks about moats and margin of safety. Lynch talks about PEG and growth categories. Burry talks about asymmetric bets and overlooked data.
2. EXPAND the short simulation signals into full analysis paragraphs. The raw data is just direction — you provide the reasoning depth.
3. LANGUAGE: Match user's language entirely. Chinese query = all Chinese.
4. Use actual data from context. Integrate search results + simulation signals + any financial data.
5. Gurus can and should DISAGREE. Don't force consensus where data doesn't support it.
6. END-OF-PARAGRAPH CITATIONS: After a paragraph or sentence with key claims/data, place citation tags at the END of that paragraph or line, never in the middle of a sentence. Format: [Source Name](url). If multiple sources support the same paragraph, group them together at the paragraph end like: [Bloomberg](...) [Reuters](...). Do NOT place citation tags between words. Do NOT list source URLs separately at the end. NEVER wrap citations in parentheses or add words like "数据"/"来源".
7. Length: 2000-4000 words. Each guru section should be substantial (150-300 words).
8. # for title, ## for sections, **bold** for guru names and subsections. Use markdown formatting generously: **bold** for emphasis, key numbers, and important terms. NEVER prefix headings with numbers like "1.", "2.", "3.".
`;

      // ─── Crypto Analysis Prompt (adaptive, question-driven, data-backed) ───
      // Used when web3 capability fired. Differs from traderMemoPrompt:
      //  • No fixed section list — model picks 2-5 ## headings that fit the question.
      //  • Every claim must inline a number from raw context (price/funding/OI/follower/etc).
      //  • First-pass report stays tight; granular tables go inside <details> blocks.
      //  • No Token Snapshot section in markdown — UI renders the TokenCard from metadata.
      const cryptoIsZh = /[\u4e00-\u9fff]/.test(userContent || '');
      const cryptoLangDirective = cryptoIsZh
        ? `\n\n=== LANGUAGE LOCK (HIGHEST PRIORITY) ===\n用户问题是中文。整篇回答必须 100% 用简体中文：所有标题（# / ## / ###）、所有正文段落、所有列表项、所有表格表头、所有 <strong> 加粗标签、所有 <details><summary>。\n禁止出现任何英文句子或英文短语作为正文/标题。专有名词（BTC / ETH / FDV / OKX / RSI 等指标缩写、币种 ticker、交易所名）保持英文原文，但说明性文字必须中文。\n如 Context 里的资料是英文，你必须翻译成中文后再写入回答；不要照抄英文段落。\n`
        : `\n\n=== LANGUAGE LOCK (HIGHEST PRIORITY) ===\nThe user's question is in English. The entire response must be 100% English: every heading (# / ## / ###), every paragraph, every list item, every table header, every <strong>, every <details><summary>.\nDo NOT emit any Chinese characters anywhere in the output. Tickers (BTC, ETH, etc.) and exchange names stay as-is.\nIf the Context contains Chinese-language material, summarize it in English — never quote it raw.\n`;
      const cryptoMemoPrompt = getGlobalTimeContext() + cryptoLangDirective + `You are a senior crypto trader-analyst writing for an experienced trader who already knows the basics. Your edge is connecting on-chain + derivatives + tokenomics + sentiment to call out what the market is mispricing. NEVER write filler. NEVER write tutorials. NEVER fabricate numbers.

=== INPUT ===
User question: ${userContent}
Context (raw research, may be partial — read carefully, every datum below is fair game):
${contextString}

=== ABSOLUTE RULES ===

1. NO FABRICATION. Every number must come from the Context block. If a number isn't there, write "(no data)" or skip the claim. Do NOT guess prices, supplies, percentages, dates, holder counts, funding rates, or volume.

2. EVERY CONCLUSION CARRIES A NUMBER. Format inline:
   <claim> · <number> <unit> (<source>, <date if available>)
   Example: "Funding overheated · +0.012%/8h ≈ 13% APR (OKX, ${new Date().toISOString().slice(0,10)})"
   Bare assertions like "市场情绪偏多" are NOT acceptable — back them with a number.

3. ANSWER THE QUESTION FIRST. Re-read the user question above. Make the dominant section answer THAT question:
   • Question about tokenomics / unlock / supply → tokenomics-focused output.
   • Question about price action / "should I long/short" → tape + positioning focused.
   • Question about news / "what's happening" → news-impact + tape focused.
   • Question comparing multiple tokens → comparison table dominant.
   Do NOT pad with sections the user didn't ask about.

4. NO FIXED HEADINGS. After the executive snapshot, pick 2-5 ## section headings that you invent based on the question. Each ## heading must be a sharp, specific angle — NOT a generic label.
   Good: "## Funding 透支了 v2 利好"  /  "## FDV 3× 是真实抛压不是叙事"
   Bad:  "## Market Analysis"  /  "## Technicals"  /  "## Conclusion"  /  "## 总结"

5. LAYERED DETAIL. Default report = scannable conclusions + the key numbers. Long raw tables (full holder list, complete exchange listings, detailed candles, full vesting schedule beyond next 90 days) go INSIDE <details><summary>详细数据</summary>...</details> blocks so they don't bloat the main report. Use <details> liberally for anything beyond the headline numbers.

6. NO Token Snapshot block. The UI renders the ticker card from structured metadata. Do NOT output a "## Token Snapshot" / "## 标的信息" / "## 资产快照" section in markdown. Do NOT echo basic metadata (name / symbol / contract / website / Twitter handle) — the card already shows those.

7. LANGUAGE: Match the user's language end-to-end. Chinese question → all Chinese (headings, labels, table headers). English → all English. No mixing.

8. CITATIONS: When you cite an external source (news, research note, exchange), put the link at the END of the paragraph as [Source Name](url). Do NOT inline mid-sentence. Do NOT list sources separately at the end.

=== STRUCTURE (FLEXIBLE) ===

A. Executive Snapshot (no heading — first thing in the output):
   - Line 1: **Bias** / **Action** / **Confidence** / **Trigger** (one line, slash-separated, translate labels to user's language).
   - Then 2-3 sentences: what's happening · what the market is mispricing · why now.
   - Every sentence carries at least 1 datum from Context.

B. Body (2-5 ## sections, headings YOU invent based on the user question):
   Pick ONLY the angles that answer the question. Examples (DO NOT use as a checklist):
   • Tape Read — price + volume + funding + OI vs 7d/30d
   • Tokenomics & Supply Pressure — FDV/MC, unlocks, vesting, circulating %
   • What the Market Missed — news vs price reaction
   • Underwater Scenarios — 2-3 trigger → path → invalidation
   • Holder Concentration / On-chain Flows
   • Catalyst Calendar — upcoming dates
   • Comparison vs peers (only if user asked to compare)
   • Tradeable Levels — entry / stop / target

C. Risks / Kill-switch (always, ## with your own creative heading):
   3 bullets. Each bullet: an OBSERVABLE threshold that invalidates the thesis. Format: "<observable> → <action>". E.g. "BTC -8% intraday → close all longs".

D. Tags + Questions to watch (always last, no heading after):
   - **Tags** line: Importance: High/Medium/Low · Categories: 2-3 tags
   - **Bold sub-heading** in user's language ("值得关注的问题：" / "Questions to watch:")
   - 3-5 bullets, each one ONE standalone question only (single sentence ending in ? or ？). No follow-on prose. No links.
   - This MUST be the very last block — nothing after it.

=== HOW TO HANDLE SPARSE DATA ===

If Context lacks a needed field (e.g. no holder data, no unlock schedule, no derivatives data because token isn't on OKX):
- DO NOT guess. DO NOT pad with generic statements.
- Write one short line in the relevant section: "数据缺口：暂无 X，无法判断 Y。需要 Z 接入。"
- Then move on. A short, honest report is better than a long fabricated one.

=== WORD BUDGET ===

- Simple question (e.g. "BTC 今天怎么了") → 400-700 words.
- Single-token deep angle (e.g. "HYPE tokenomics 有什么坑") → 700-1200 words main + <details> for raw tables.
- Multi-token comparison or full DD → 1200-2000 words main + <details>.
Reserve granular data for follow-up — don't over-deliver on first pass.

=== HEADINGS ===

- # for the report title (optional; only if it sharpens the takeaway). Format like "HYPE: 12-07 解锁前的真实抛压" — angle-driven, never generic.
- ## for body sections (2-5 of them, YOU invent the wording).
- **bold** for sub-points and key numbers within paragraphs.
- NEVER use ###. NEVER number headings ("1.", "2.").
`;

      // Route synthesis prompt by queryType
      // Auto-promote to crypto-analysis when web3 fired: better quality output
      // for crypto questions than the equity-shaped traderMemoPrompt.
      let queryType = plan.queryType || 'investment-analysis';
      if (
        plan.capabilities.web3?.needed &&
        (queryType === 'investment-analysis' || queryType === 'general' || queryType === 'research')
      ) {
        queryType = 'crypto-analysis';
      }
      let synthesizePrompt: string;
      switch (queryType) {
        case 'crypto-analysis':
          synthesizePrompt = cryptoMemoPrompt;
          break;
        case 'research':
          synthesizePrompt = researchPrompt;
          break;
        case 'market-brief':
          synthesizePrompt = marketBriefPrompt;
          break;
        case 'guru-council':
          synthesizePrompt = guruCouncilPrompt;
          break;
        case 'investment-analysis':
        default:
          synthesizePrompt = traderMemoPrompt;
          break;
      }
      const synthesisMaxTokens = queryType === 'market-brief' ? 4096 : 8192;
      const synthesisModelOverride = config.lokaAi.synthesisModel || undefined;

      // ── Helper: run HTML generation stream and return the result ──
      // Full implementation (prompts, CSS, stream parsing, sanitization) now
      // lives in services/reportHtml.service.ts. This wrapper keeps the two
      // existing call sites untouched.
      const runHtmlGeneration = (htmlInput: string) =>
        runHtmlGenerationService({ userContent, contextString: htmlInput, queryType });

      // ── Emit HTML result to frontend + persist to DB ──
      const emitHtmlResult = async (htmlContent: string) => {
        if (htmlContent.length <= 100) {
          console.log(`[agent:chat:html] ⚠️ HTML content too short (${htmlContent.length}), skipping`);
          return;
        }
        const msgCount = await prisma.chatMessage.count({ where: { sessionId } });
        const msgIdx = msgCount - 1;
        console.log(`[agent:chat:html] msgCount=${msgCount}, msgIdx=${msgIdx}`);
        const lastMsg = await prisma.chatMessage.findFirst({ where: { sessionId, role: 'assistant' }, orderBy: { createdAt: 'desc' } });
        if (lastMsg) {
          const existingMeta = lastMsg.metadata ? JSON.parse(lastMsg.metadata as string) : {};
          existingMeta.htmlReport = htmlContent;
          await prisma.chatMessage.update({ where: { id: lastMsg.id }, data: { metadata: JSON.stringify(existingMeta) } });
          console.log(`[agent:chat:html] DB updated with htmlReport`);
        }
        emitToUser(userId, 'agent:chat:html_ready', { sessionId, msgIdx, html: htmlContent });
        console.log(`[agent:chat:html] ✅ HTML report emitted for session ${sessionId}, msgIdx=${msgIdx}, length=${htmlContent.length}`);
      };

      // ── Start REAL-PARALLEL HTML generation (runs concurrently with synthesis) ──
      // Input is `contextString` (research data) instead of waiting for synthesis output.
      // The resulting promise is awaited AFTER synthesis completes, so HTML is ready
      // immediately (or near-immediately) rather than starting a fresh 148s round trip.
      const htmlEligible = queryType === 'investment-analysis' || queryType === 'crypto-analysis' || queryType === 'guru-council' || isDeepResearch;
      const htmlReportEnabled = htmlEligible && !config.superAgentDisableHtmlReport;
      if (htmlEligible && config.superAgentDisableHtmlReport) {
        console.log('[agent:chat:html] Skipped (SUPERAGENT_DISABLE_HTML_REPORT is set)');
      }
      const parallelHtmlStartedAt = Date.now();
      let parallelHtmlPromise: Promise<string> | null = null;
      // Enable parallel HTML for ALL eligible queries including roundtable.
      // For roundtable, the parallel HTML uses contextString (raw research data)
      // and gets overlapped with consensus + deep-research second pass. If the
      // result quality is unacceptable, the sequential fallback using
      // finalDbContent still runs after synthesis completes.
      if (htmlReportEnabled && contextString.length > 200) {
        const mode = isDeepResearch ? 'roundtable' : 'standard';
        // ── Roundtable mode: skip parallel HTML ──
        // Parallel HTML would launch BEFORE consensus runs, so its input
        // (contextString) never contains the agent debate journey. The
        // resulting HTML silently drops the Expert Debate Panel — section 7
        // of the prompt is "MANDATORY when expert debate data is in the
        // input", and that data only exists after consensus completes.
        // For roundtable we wait for finalDbContent (which has the debate
        // already woven in) and run HTML sequentially. Costs ~30s wall but
        // doubles the HTML report's information density.
        if (mode === 'roundtable') {
          console.log('[agent:chat:html] Roundtable mode → skipping PARALLEL HTML, sequential pass will use finalDbContent (with debate journey)');
        } else {
          console.log(`[agent:chat:html] Starting REAL-PARALLEL HTML generation (queryType=${queryType}, mode=${mode}), contextString length=${contextString.length}`);
          emitToUser(userId, 'agent:chat:html_generating', { sessionId, msgIdx: -1 });
          parallelHtmlPromise = runHtmlGeneration(contextString).catch(err => {
            console.error('[agent:chat:html] ❌ Parallel HTML generation failed:', err.message);
            return '';
          });
        }
      }

      const buildLocalSynthesisFallback = (cause: string): string => {
        const isZh = /[\u4e00-\u9fff]/.test(userContent || '');
        // ── Crypto fallback: when AI is down but we have a TokenCard,
        //    produce a real-data report so the user can still validate the
        //    end-to-end flow (TokenCard + adaptive crypto markdown).
        //    Every number below comes from savedTokenCard.market — no AI,
        //    no fabrication.
        if (savedTokenCard && (queryType === 'crypto-analysis' || plan.capabilities.web3?.needed)) {
          return buildLocalCryptoFallback(savedTokenCard, userContent, isZh, cause);
        }
        // Count useful data fetched so the user knows their quota wasn't wasted,
        // WITHOUT leaking the raw prompt / conversation history / raw post bodies.
        const sourceCount = finalSocialSources?.length || 0;
        // Short, human-readable upstream hint — avoid dumping HTML or stack traces.
        const shortCause = (() => {
          const raw = String(cause || '').trim();
          if (/502\b|Bad Gateway/i.test(raw)) return isZh ? '上游网关暂时不可用 (502)' : 'upstream gateway unavailable (502)';
          if (/504\b|Gateway Time-?out/i.test(raw)) return isZh ? '上游响应超时 (504)' : 'upstream timeout (504)';
          if (/429\b|rate limit/i.test(raw)) return isZh ? '模型限流 (429)' : 'rate limited (429)';
          if (/terminated|ECONNRESET|socket hang up/i.test(raw)) return isZh ? '连接中断' : 'connection dropped';
          // Strip HTML tags and collapse whitespace so "terminated …<html>…502 Bad Gateway…" becomes readable.
          return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 120) || (isZh ? '未知错误' : 'unknown error');
        })();

        if (isZh) {
          return [
            '## 合成失败',
            '',
            `刚才生成最终总结时模型返回错误（${shortCause}），已重试 2 次仍未成功。`,
            sourceCount > 0
              ? `本次搜索/抓取已成功获取 **${sourceCount}** 条数据（保留在上下文中）。`
              : '',
            '',
            '### 建议',
            '- 直接回复「**继续**」或「**重试总结**」即可基于已抓取数据再次合成，不需要重新搜索。',
            '- 如连续失败，稍后重试或在输入栏左下切换模型。',
          ].filter(Boolean).join('\n');
        }
        return [
          '## Synthesis Failed',
          '',
          `The final summarizer returned an error (${shortCause}) after 2 retry attempts.`,
          sourceCount > 0
            ? `Search/fetch succeeded — **${sourceCount}** sources are preserved in context.`
            : '',
          '',
          '### Next Step',
          '- Reply **"continue"** or **"retry synthesis"** to re-run on the fetched data (no re-fetching needed).',
          '- If this keeps failing, retry later or switch model from the input bar.',
        ].filter(Boolean).join('\n');
      };

      const synthesizeFallbackContent = async (cause: string): Promise<string> => {
        const compact = contextString
          .replace(/\r/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
          .slice(0, 10000);
        const isZh = /[\u4e00-\u9fff]/.test(userContent || '');
        const fallbackPrompt = isZh
          ? `你是投资研究助手的“故障降级总结器”。上游流式模型暂时失败，请基于已完成的工具结果生成一份简明、可执行的中文结论。\n\n要求：\n1) 先给结论（偏多/偏空/观望）和置信度（高/中/低）\n2) 给出3-5条关键依据（来自上下文，不编造）\n3) 给出主要风险与接下来1-2个验证动作\n4) 保持精炼（500-900字），不要输出JSON\n\n用户问题：${userContent}\n查询类型：${queryType}\n\n已获取上下文：\n${compact}`
          : `You are a fallback synthesizer for an investment research assistant. Streaming synthesis failed upstream. Generate a concise actionable summary using ONLY the fetched context.\n\nRequirements:\n1) Start with verdict (bullish/bearish/neutral) + confidence (high/medium/low)\n2) Provide 3-5 key evidence points grounded in context\n3) List major risks and 1-2 next validation steps\n4) Keep it concise (300-600 words), no JSON\n\nUser query: ${userContent}\nQuery type: ${queryType}\n\nFetched context:\n${compact}`;

        const attempts = 2;
        for (let i = 1; i <= attempts; i += 1) {
          try {
            const fallbackResp = await aiService.chat(
              [{ role: 'user', content: fallbackPrompt }],
              'superagent',
              undefined,
              synthesisModelOverride,
            );
            const content = (fallbackResp.content || '').trim();
            if (content) {
              console.log(`[agent:chat:fallback] ✅ fallback synthesis succeeded (attempt=${i})`);
              return content;
            }
          } catch (fallbackErr: any) {
            console.warn(
              `[agent:chat:fallback] attempt=${i} failed:`,
              fallbackErr?.message || String(fallbackErr),
            );
          }
          if (i < attempts) {
            await new Promise((resolve) => setTimeout(resolve, 1200 * i));
          }
        }
        console.warn('[agent:chat:fallback] all fallback attempts failed; using local degraded message');
        return buildLocalSynthesisFallback(cause);
      };

      const synthStartedAt = Date.now();
      const shouldLogSynthesisText =
        /^(1|true|yes|on)$/i.test(String(process.env.SUPERAGENT_LOG_SYNTHESIS_TEXT || '').trim());
      const logSynthesisFinalText = (kind: 'primary' | 'fallback', content: string) => {
        if (!shouldLogSynthesisText) return;
        const text = String(content ?? '');
        console.log(
          `[agent:chat:synthesis_text] kind=${kind} sessionId=${sessionId} chars=${text.length} BEGIN`,
        );
        console.log(text);
        console.log(
          `[agent:chat:synthesis_text] kind=${kind} sessionId=${sessionId} END`,
        );
      };
      try {
        // ──────────────────────────────────────────────────────────────────
        // Phase 1 synthesis: turn raw tool output (contextString) into a
        // polished markdown draft streamed to the user (Fast mode) or used
        // as input to the consensus debate (legacy Roundtable).
        //
        // ⚡ Optimization (2026-04-23): in Roundtable mode we skip this LLM
        // call entirely. The consensus debate + final Deep Research pass
        // already consume the raw contextString — running a pre-synthesis
        // burns 10-20s with no material quality gain. synFullContent stays
        // as an empty string; downstream blocks treat that as "no draft".
        // ──────────────────────────────────────────────────────────────────
        let synFullContent = '';
        let synthesisFirstTokenAt: number | null = null;
        if (!isDeepResearch) {
          console.log('[agent:chat] Starting synthesis stream (queryType=%s), prompt length:', queryType, synthesizePrompt.length);
          // Tell the client the agent has moved into the synthesis phase.
          // Without this, the inline trigger has no `active` module after
          // tools complete and falls back to the default "Searching the web"
          // label — making it look like the run is stuck for the 10-15s
          // it takes Claude to prefill a 20k-token prompt.
          emitter.emitModule('synthesis', 'active', { phase: 'drafting_response' });
          const synthesisStream = await aiService.chatStream(
            [{ role: 'user', content: synthesizePrompt }],
            'superagent',
            undefined,
            synthesisMaxTokens,
            synthesisModelOverride,
          );
          console.log('[agent:chat] Synthesis stream obtained, reading...');
          const synReader = synthesisStream.getReader();
          const synDecoder = new TextDecoder();
          let synBuffer = '';

          while (true) {
            const { done, value } = await synReader.read();
            if (done || isAborted()) {
              if (!isAborted() && synBuffer.trim().startsWith('data: ') && synBuffer.trim() !== 'data: [DONE]') {
                try {
                  const parsed = JSON.parse(synBuffer.trim().slice(6).trim());
                  const delta = parsed.choices?.[0]?.delta?.content || '';
                  if (delta) {
                    if (synthesisFirstTokenAt === null) synthesisFirstTokenAt = Date.now();
                    synFullContent += delta;
                    streamToChat(delta);
                  }
                } catch (e) { }
              }
              break;
            }
            synBuffer += synDecoder.decode(value, { stream: true });
            const lines = synBuffer.split('\n');
            synBuffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const sseData = trimmed.slice(6).trim();
                if (sseData === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(sseData);
                  const delta = parsed.choices?.[0]?.delta?.content || '';
                  if (delta) {
                    if (synthesisFirstTokenAt === null) {
                      synthesisFirstTokenAt = Date.now();
                      // First token: drop the inline pills/cards on the
                      // client. Marking `synthesis` complete here lets the
                      // inline trigger label switch from "Synthesizing
                      // report" to a generic "Drafting…" tail and the chat
                      // thread's hasStreamedContent gate kicks in to hide
                      // the cards.
                      emitter.emitModule('synthesis', 'completed', {});
                    }
                    synFullContent += delta;
                    streamToChat(delta);
                  }
                } catch (e) { }
              }
            }
          }
        } else {
          console.log(
            `[agent:chat] Roundtable mode: skipping Phase 1 LLM synthesis (saves ~10-20s); ` +
              `consensus + deep-research will consume raw contextString directly (${contextString.length} chars)`,
          );
        }

        if (isAborted()) {
          console.log(`[agent:chat] Aborted after synthesis stream for session ${sessionId}`);
          emitter.emitStreamCancelled();
          activeChatSessions.delete(sessionId);
        chatSessionStartTimes.delete(sessionId);
        finishChatReplayBuffer(sessionId);
          chatAbortControllers.delete(sessionId);
          return;
        }

        const flowModules: Array<{ type: string; status: string; data?: Record<string, unknown> }> = [];
        if (plan.capabilities.search.needed) flowModules.push({ type: 'search', status: 'completed', data: { variant: 'social', sources: finalSocialSources } });
        if (plan.capabilities.web3.needed) {
          flowModules.push({
            type: 'web3',
            status: 'completed',
            data: {
              variant: 'coingecko_mcp',
              intent: finalWeb3Intent || 'unknown',
              via: finalWeb3Via || 'n/a',
              assets: finalWeb3Assets?.length || 0,
              okx: finalWeb3Okx || [],
              okxNews: finalWeb3OkxNews || [],
              providers: finalWeb3Providers || [],
              // Persist the per-tool stage timeline so history restore can
              // rebuild the Process panel + recompute toolsCount correctly.
              stages: finalWeb3Stages,
            },
          });
        }
        if (plan.capabilities.analysis.needed) flowModules.push({ type: 'analysis', status: 'completed', data: { stages: finalAnalysisStages } });
        if (plan.capabilities.simulate.needed) flowModules.push({ type: 'simulation', status: 'completed', data: { panelists: finalPanelists } });

        let finalDbContent = synFullContent;
        /** Matches frontend ConsensusModuleData for Thinking Process + DB replay */
        let consensusFlowData: {
          status: 'concluded';
          round: number;
          maxRounds: number;
          conclusion: { verdict: string; confidence: number };
        } | null = null;
        /** Full consensus result for DB persistence — restored on session history load */
        let savedConsensusResult: any = null;
        /**
         * Flat per-agent-per-round debate log captured from aegean's live SSE
         * stream. We persist this alongside `consensusResult` because aegean's
         * synchronous response (`discussion_rounds`) compresses the debate
         * down to "agents who actually changed position", losing rounds where
         * everyone held their stance. The live log preserves every round and
         * every agent verbatim, so on history restore we can rebuild the
         * complete rtRounds the user saw mid-conversation (18 turns) instead
         * of the compressed structured result (often 9 turns).
         */
        let savedLiveDebateLog: Array<{
          round: number;
          agentId: string;
          answer: string;
          confidence: number;
        }> | null = null;

        if (data.mode === 'roundtable') {
          // Phase 1: Initial draft is already generated silently (not streamed)
          emitter.emitModule('consensus', 'active', { status: 'building', round: 1, maxRounds: 3 });
          const roundtableStartedAt = Date.now();

          try {
            // Phase 2: Expert debate — send initial draft to consensus engine
            emitter.emitModule('consensus', 'active', { status: 'discussing', round: 1, maxRounds: 3 });
            // Detect language so experts respond consistently
            const isZhTask = /[\u4e00-\u9fff]/.test(userContent);
            // Force ALL persona answers to English regardless of the user's
            // question language. Mixed-language output (some personas Chinese,
            // others English) was confusing in earlier tests, and personas'
            // own system prompts are English-native (Buffett "owner-earnings",
            // Burry "EV vs liquidation", etc.) so English is their natural
            // mode. The final report synthesis (Claude Deep Research pass)
            // will translate to the user's language if needed.
            void isZhTask;  // detection still useful for downstream report
            const langHeader =
              '[LANGUAGE LOCK] Your entire answer MUST be in English. ' +
              'This applies to every field: SIGNAL / CONFIDENCE / KEY_EVIDENCE / ' +
              'RATIONALE / WOULD_CHANGE_MY_MIND. Keep tickers as-is. ' +
              'Do not switch to Chinese or any other language at any point.\n\n';
            const langFooter =
              '\n\nReminder: respond entirely in English. Follow the system ' +
              'prompt schema strictly.';
            const consensusTask = `${langHeader}Question: "${userContent}"

Raw research context (from upstream tools — search / stock data / web3):
${synFullContent || contextString}${langFooter}`;
            // Pull analyst roster from frontend (Roundtable UI ≥5 selection).
            const analystIdsRaw = Array.isArray(data.analystIds) && data.analystIds.length > 0
              ? data.analystIds
              : undefined;
            // Stage 6 validation: strict reject if analystIds is present but
            // invalid (<5, >max, missing system, unknown IDs). If analystIds
            // is entirely absent → legacy fallback to 4 system (covers Auto
            // mode routed to Roundtable where UI didn't build a roster).
            let analystIds = analystIdsRaw;
            if (analystIdsRaw) {
              const v = validateAnalystSelection(analystIdsRaw);
              if (!v.ok) {
                console.warn(
                  `[agent:chat] REJECT invalid analystIds (${v.error}) sessionId=${sessionId}`,
                );
                socket.emit('agent:chat:error', {
                  sessionId,
                  error: v.error ?? 'Invalid analyst selection',
                  code: 'invalid_analyst_selection',
                });
                // Cleanup & short-circuit
                activeChatSessions.delete(sessionId);
                chatSessionStartTimes.delete(sessionId);
                finishChatReplayBuffer(sessionId);
                chatAbortControllers.delete(sessionId);
                return;
              }
              analystIds = v.normalizedIds;
            }
            const effectiveRosterIds: string[] = analystIds ?? [...SYSTEM_ANALYST_IDS];
            console.log(
              `[agent:chat] roundtable consensus: analystIds=${effectiveRosterIds.join(',')} ` +
                `task_len=${consensusTask.length}`,
            );

            // ▶ NEW EVENT: tell the frontend which analysts are in this run,
            // with enough metadata to render the AgentRoom column without
            // needing another round-trip to /api/analysts.
            const rosterPayload: PublicAnalystPersona[] = effectiveRosterIds
              .map((id) => {
                const p = getAnalystById(id);
                return p
                  ? {
                      id: p.id,
                      displayName: p.displayName,
                      role: p.role,
                      initials: p.initials,
                      color: p.color,
                      category: p.category,
                    }
                  : null;
              })
              .filter((x): x is PublicAnalystPersona => x !== null);
            // Mirror to replay buffer so a reconnecting client can rebuild the
            // Workbench (Agent Room + Graph + Debate) without waiting for a new
            // emission of this one-shot event.
            recordChatRtEvent(sessionId, 'analysts_selected', { analysts: rosterPayload });
            socket.emit('agent:chat:analysts_selected', {
              sessionId,
              analysts: rosterPayload,
            });

            // Real-time live events: each persona's LLM completion is
            // forwarded to the frontend Debate Tab the moment it arrives,
            // not after the whole consensus finishes. Powered by aegean's
            // /groups/:id/consensus/stream SSE endpoint added 2026-04-24.
            // Track which (round, agentId) pairs we've already emitted so
            // duplicate refinement events don't fan out twice.
            const seenAgentRound = new Set<string>();
            // Accumulate per-agent per-round answers so we can later surface
            // each expert's STRONGEST stance across rounds, not just their
            // post-convergence (often all-Neutral) final round. Aegean's
            // consensusResult.agentResponses only carries the final round.
            const perAgentRounds = new Map<string, Array<{ round: number; answer: string; confidence: number }>>();
            const consensusResult = await runConsensusEngine(
              userId,
              'roundtable',
              consensusTask,
              {
                analystIds,
                onLiveEvent: (evt) => {
                  if (isAborted()) return;
                  // Round transitions
                  if (evt.type === 'round_started') {
                    recordChatRtEvent(sessionId, 'round_started', {
                      round: evt.round_number,
                      maxRounds: evt.round_number,
                    });
                    socket.emit('agent:chat:round_started', {
                      sessionId,
                      round: evt.round_number,
                      maxRounds: evt.round_number,
                    });
                    return;
                  }
                  if (evt.type === 'round_completed') {
                    recordChatRtEvent(sessionId, 'round_completed', {
                      round: evt.round_number,
                      maxRounds: evt.round_number,
                    });
                    socket.emit('agent:chat:round_completed', {
                      sessionId,
                      round: evt.round_number,
                      maxRounds: evt.round_number,
                    });
                    return;
                  }
                  if (evt.type === 'agent_completed') {
                    const key = `${evt.round_number}:${evt.agent_id}`;
                    if (seenAgentRound.has(key)) return;
                    seenAgentRound.add(key);
                    const answer = evt.answer || '';
                    // Track this round's answer for the post-debate
                    // "strongest stance" picker.
                    const list = perAgentRounds.get(evt.agent_id) || [];
                    list.push({
                      round: evt.round_number,
                      answer,
                      confidence: evt.confidence ?? 0,
                    });
                    perAgentRounds.set(evt.agent_id, list);
                    recordChatRtEvent(sessionId, 'agent_responded', {
                      analystId: evt.agent_id,
                      round: evt.round_number,
                      confidence: evt.confidence ?? 0,
                      summary: answer.slice(0, 400),
                      answer,
                    });
                    socket.emit('agent:chat:agent_responded', {
                      sessionId,
                      analystId: evt.agent_id,
                      round: evt.round_number,
                      confidence: evt.confidence ?? 0,
                      summary: answer.slice(0, 400),
                      answer,
                    });
                    return;
                  }
                  // (We ignore consensus_started / leader_elected / agent_failed
                  //  for now — frontend doesn't render them yet.)
                },
              },
            );
            savedConsensusResult = consensusResult;

            // Flatten the per-agent-per-round map into a chronological array
            // for DB persistence. This is the source-of-truth for the Debate
            // tab's full message list — sorted by round, then by agent id so
            // history restore is deterministic.
            const flattened: Array<{ round: number; agentId: string; answer: string; confidence: number }> = [];
            for (const [agentId, list] of perAgentRounds.entries()) {
              for (const r of list) {
                flattened.push({
                  round: r.round,
                  agentId,
                  answer: r.answer,
                  confidence: r.confidence,
                });
              }
            }
            flattened.sort((a, b) => (a.round - b.round) || a.agentId.localeCompare(b.agentId));
            savedLiveDebateLog = flattened;
            console.log(
              `[agent:chat:rt-debate-log] captured ${flattened.length} live turns across ${new Set(flattened.map(t => t.round)).size} rounds (vs aegean structured discussion_rounds = ${consensusResult.consensus?.discussionRounds?.length ?? 0})`,
            );

            const finalAnswerText = consensusResult.consensus?.finalAnswer || '';

            // Collect individual expert perspectives with structured debate context
            let expertDebateContext = '';
            const agentResponses = consensusResult.consensus?.agentResponses || [];
            // Resolve agent IDs to their real catalog names so the synthesis
            // LLM cites "Warren Buffett / Fundamental Analyst" etc. instead of
            // falling back to "Expert 1 / 专家1" generic placeholders. The prior
            // nameMap only covered the 4 legacy IDs (agent_0..agent_3); every
            // modern persona like fundamental_specialist / buffett_style /
            // munger_style dropped through to the numeric fallback.
            const isZhQuery = /[一-鿿]/.test(userContent || '');
            const resolveAgentName = (agentId: string, idx: number): string => {
              const persona = getAnalystById(agentId);
              if (persona) {
                return isZhQuery ? persona.displayName.zh : persona.displayName.en;
              }
              // Legacy aegean IDs that predate the catalog
              const legacy: Record<string, string> = {
                agent_0: 'Fundamental Analyst',
                agent_1: 'Macro Strategist',
                agent_2: 'Sentiment Engine',
                agent_3: 'Quant Tracker',
              };
              return legacy[agentId] || `Expert ${idx + 1}`;
            };
            const roundsUsed = Number(consensusResult.consensus?.roundsUsed ?? 1) || 1;
            const consensusReached = consensusResult.consensus?.consensusReached !== false;

            // Emit round-by-round progress so the frontend graph updates progressively
            for (let r = 1; r <= roundsUsed; r++) {
              emitter.emitModule('consensus', 'active', { status: 'discussing', round: r, maxRounds: 3 });
            }

            // (Per-agent reveals are now emitted live via onLiveEvent above —
            // we no longer post-fan-out from the synchronous result, since
            // that lost per-round identity and caused the "all rounds
            // identical" bug. The streaming SSE fires one event per real
            // LLM completion, so the Debate Tab updates as agents finish.)

            // Canonical expert verdict table — built deterministically from
            // agentResponses, then injected into the deep-research prompt as a
            // pre-rendered markdown block. The synthesis LLM is told to emit a
            // placeholder marker; we substitute the real table after streaming
            // ends. This guarantees the rendered "专家立场汇总" table always
            // reflects the actual VERDICT / CONFIDENCE per agent — the LLM
            // physically cannot drift them to "Neutral 65%" anymore because
            // it never gets to write that table.
            const EXPERT_TABLE_PLACEHOLDER = '<!--AEGEAN_EXPERT_VERDICT_TABLE-->';
            let canonicalExpertTable = '';
            if (agentResponses.length > 0) {
              // Robust verdict parser. Aegean personas don't all emit the same
              // schema — some use "SIGNAL: bullish", some "VERDICT: …", others
              // a markdown header "**Verdict:** …", a few rely on prose alone.
              // The earlier single-regex implementation defaulted to Neutral
              // whenever SIGNAL: was missing, silently dropping real Bearish /
              // Bullish stances into the Neutral bucket and producing the
              // "everyone is Neutral 80%" symptom in the Expert Summary table.
              const parseSignal = (answer: string): 'Bullish' | 'Bearish' | 'Neutral' => {
                const text = answer || '';
                const tagPatterns = [
                  /SIGNAL\s*[:：]\s*\**\s*(bullish|bearish|neutral)/i,
                  /VERDICT\s*[:：]\s*\**\s*(bullish|bearish|neutral)/i,
                  /POSITION\s*[:：]\s*\**\s*(bullish|bearish|neutral)/i,
                  /STANCE\s*[:：]\s*\**\s*(bullish|bearish|neutral)/i,
                  /\*\*Verdict\*\*\s*[:：]?\s*(bullish|bearish|neutral)/i,
                  /\*\*Signal\*\*\s*[:：]?\s*(bullish|bearish|neutral)/i,
                  /\*\*Position\*\*\s*[:：]?\s*(bullish|bearish|neutral)/i,
                  /^\s*(?:Verdict|Signal|Position|Stance)\b[^\n]*?\b(bullish|bearish|neutral)\b/im,
                ];
                for (const pat of tagPatterns) {
                  const m = text.match(pat);
                  if (m) {
                    const raw = m[1].toLowerCase();
                    return raw === 'bullish' ? 'Bullish' : raw === 'bearish' ? 'Bearish' : 'Neutral';
                  }
                }
                // Fallback: keyword frequency. Asymmetric thresholds — only
                // commit to Bullish/Bearish when one side is clearly dominant
                // (>= 2 net mentions). Otherwise prose tone is mixed → Neutral.
                const lower = text.toLowerCase();
                const bullCount = (lower.match(/\b(bullish|long(?!\s*\/?\s*short)|squeeze|upside|breakout|accumulat|rally|reversal\s+up|short\s+covering|buy\b)\b/g) || []).length;
                const bearCount = (lower.match(/\b(bearish|short(?!\s*\/?\s*long)|downside|breakdown|distribut|sell-?off|sell\b|crash|tail\s+risk|drawdown|liquidat)\b/g) || []).length;
                if (bullCount >= bearCount + 2) return 'Bullish';
                if (bearCount >= bullCount + 2) return 'Bearish';
                return 'Neutral';
              };

              // Confidence parser. PROSE TAKES PRIORITY over structured
              // because aegean's `resp.confidence` is a post-consensus
              // agreement metric (often a uniform 0.8 once agents converge),
              // NOT each agent's self-reported certainty. The agent itself
              // emits the real number in "CONFIDENCE: 0.65" inside its
              // answer schema. Using the structured value would paint every
              // expert at 80% even when their own prose says 65% / 70%.
              const parseConfidence = (answer: string, structured: number | undefined | null): number => {
                // Match both decimal (0.65) and percent (65 / 65%) forms.
                const m = (answer || '').match(
                  /(?:CONFIDENCE|信心|置信度)\s*[:：]?\s*(0?\.\d+|\d{1,3}(?:\.\d+)?)\s*%?/i,
                );
                if (m) {
                  const val = parseFloat(m[1]);
                  if (Number.isFinite(val)) {
                    // 0.65 → 65, 65 → 65, 0.7 → 70
                    const pct = val <= 1 ? val * 100 : val;
                    return Math.max(0, Math.min(100, Math.round(pct)));
                  }
                }
                // Fallback only when the answer didn't include the field at all.
                if (typeof structured === 'number' && structured > 0) {
                  return Math.max(0, Math.min(100, Math.round(structured * 100)));
                }
                return 50;
              };

              // ── Strongest-Stance Picker ────────────────────────────
              // For each agent, walk all rounds we accumulated during the
              // SSE stream and pick the answer with the strongest (most
              // directional) verdict. Roundtable consensus tends to
              // converge to Neutral by the final round, which makes the
              // table look uniformly hedged — this preserves each
              // expert's actual lean during the debate.
              //
              // Selection order:
              //   1. Highest |Bullish - Bearish| score across rounds.
              //      (Bullish/Bearish > Neutral; ties broken by confidence.)
              //   2. If every round was Neutral, fall back to the final-
              //      round answer (which is what agentResponses already has).
              type RoundPick = { round: number; answer: string; confidence: number; verdict: 'Bullish' | 'Bearish' | 'Neutral' };
              const pickStrongestStance = (agentId: string, fallback: { answer: string; confidence: number }): RoundPick => {
                const rounds = perAgentRounds.get(agentId) || [];
                let best: RoundPick | null = null;
                for (const r of rounds) {
                  const verdict = parseSignal(r.answer);
                  const conf = parseConfidence(r.answer, r.confidence);
                  // Score: 100 for non-Neutral, 0 for Neutral; tiebreaker is conf.
                  const directional = verdict !== 'Neutral' ? 1 : 0;
                  const candidate: RoundPick = { round: r.round, answer: r.answer, confidence: conf / 100, verdict };
                  if (!best) { best = candidate; continue; }
                  const bestDirectional = best.verdict !== 'Neutral' ? 1 : 0;
                  if (directional > bestDirectional) { best = candidate; continue; }
                  if (directional === bestDirectional && conf > Math.round((best.confidence || 0) * 100)) {
                    best = candidate;
                  }
                }
                if (!best) {
                  // No streamed rounds (shouldn't happen but defensive) — use final answer.
                  return {
                    round: roundsUsed,
                    answer: fallback.answer,
                    confidence: fallback.confidence,
                    verdict: parseSignal(fallback.answer),
                  };
                }
                return best;
              };

              // Diagnostic: log final-round + strongest-stance per agent.
              console.log('[agent:chat:rt-parse] expert verdicts/confidences (final | strongest)');
              agentResponses.forEach((resp: any, idx: number) => {
                const finalV = parseSignal(resp.answer);
                const finalC = parseConfidence(resp.answer, resp.confidence);
                const strongest = pickStrongestStance(resp.agentId, { answer: resp.answer, confidence: resp.confidence });
                const strongestC = parseConfidence(strongest.answer, strongest.confidence);
                const name = resolveAgentName(resp.agentId, idx);
                console.log(`  [${idx}] ${name} → final=${finalV} ${finalC}%  |  strongest=R${strongest.round} ${strongest.verdict} ${strongestC}%`);
              });

              // Pull a 1-2 sentence "rationale" tagline from each answer.
              // Prefer an explicit RATIONALE: section, fall back to the first
              // non-trivial sentence; cap the length so the table stays compact.
              const extractTagline = (answer: string): string => {
                if (!answer) return '';
                const m = answer.match(/RATIONALE:\s*([\s\S]+?)(?:\n[A-Z_]+:|\n\n|$)/i);
                let raw = (m && m[1].trim()) ? m[1].trim() : answer.trim();
                raw = raw.replace(/SIGNAL:\s*\w+/gi, '').replace(/CONFIDENCE:\s*[\d.]+%?/gi, '').trim();
                // First sentence in latin or CJK
                const firstSentence = raw.match(/^[^.。!?！？\n]{4,180}[.。!?！？]?/);
                let snippet = firstSentence ? firstSentence[0].trim() : raw.split('\n')[0].trim();
                snippet = snippet.replace(/\s+/g, ' ');
                if (snippet.length > 120) snippet = snippet.slice(0, 117).replace(/[\s,。,]+$/, '') + '…';
                return snippet || (isZhQuery ? '(无核心论据)' : '(no rationale)');
              };

              // Localized verdict label
              const verdictLabel = (v: 'Bullish' | 'Bearish' | 'Neutral'): string => {
                if (!isZhQuery) return v;
                return v === 'Bullish' ? '看多' : v === 'Bearish' ? '看空' : '中性';
              };

              // Build the canonical markdown table that will replace the placeholder.
              // The table now reflects each expert's STRONGEST stance (the round
              // where they were most directional), not their post-convergence
              // final position. Otherwise every expert ends up "Neutral 65%"
              // after Aegean smooths the debate down — which throws away the
              // most valuable signal: who was actually pushing what view.
              const tableHeader = isZhQuery
                ? '| 专家 | 核心观点 | 信心 | 核心论据 |\n|---|---|---|---|'
                : '| Expert | Stance | Confidence | Key Rationale |\n|---|---|---|---|';
              const tableRows = agentResponses.map((resp: any, idx: number) => {
                const name = resolveAgentName(resp.agentId, idx);
                const pick = pickStrongestStance(resp.agentId, { answer: resp.answer, confidence: resp.confidence });
                const verdict = pick.verdict;
                const conf = parseConfidence(pick.answer, pick.confidence);
                const tagline = extractTagline(pick.answer)
                  // Markdown-escape pipes so they don't break the table cell
                  .replace(/\|/g, '\\|');
                return `| ${name} | ${verdictLabel(verdict)} | ${conf}% | ${tagline} |`;
              });
              // Section title chosen to communicate the table's semantics —
              // "辩论核心立场" makes clear it's the strongest debate stance,
              // not necessarily the final consensus (which is shown separately).
              const sectionTitle = isZhQuery ? '## 辩论核心立场' : '## Core Debate Positions';
              const subtitle = isZhQuery
                ? `*下表展示每位专家在辩论中给出的最具方向性立场;**最终共识结论**见上文 Verdict 段。*`
                : `*Each row shows each expert's strongest directional stance during debate; the **final consensus verdict** is summarized above.*`;
              canonicalExpertTable = `${sectionTitle}\n\n${subtitle}\n\n${tableHeader}\n${tableRows.join('\n')}\n`;

              expertDebateContext += `\n\n【EXPERT ROUNDTABLE DEBATE】\n`;
              expertDebateContext += `Rounds of debate: ${roundsUsed}\n`;
              expertDebateContext += `Consensus reached: ${consensusReached ? 'Yes' : 'No'}\n`;
              expertDebateContext += `Consensus confidence: ${Math.round(Number(consensusResult.consensus?.confidence ?? 0) * 100)}%\n\n`;
              expertDebateContext += `Final Consensus Verdict:\n${finalAnswerText}\n\n`;
              // IMPORTANT naming rule — each position below is labelled with a
              // specific analyst name (e.g. "Warren Buffett", "Fundamental
              // Analyst"). The report MUST cite these exact names when
              // referencing a position. Do NOT replace them with generic
              // placeholders like "Expert 1 / 专家1 / Analyst A" — the reader
              // picked these personas and needs to see them by name.
              expertDebateContext += isZhQuery
                ? `【命名规则】下方每一位专家的名字都必须在正文中原样引用(如"沃伦·巴菲特视角认为…"),禁止替换成"专家1/专家2"等匿名编号。\n\n`
                : `[NAMING RULE] Each position below is labelled with a specific analyst name. Your report MUST reference them by these exact names when attributing views (e.g. "Warren Buffett's lens argues…"). Do NOT substitute with "Expert 1 / Analyst A / 专家1" or any numeric placeholder.\n\n`;
              // ── Hard rule: the expert verdict table is system-generated ────
              expertDebateContext += isZhQuery
                ? `【表格规则·硬性】关于"专家立场汇总"这张表,请**不要自己写**任何 markdown 表格。系统已经渲染好了一份权威表(verdict + confidence + 核心论据 全部基于结构化数据)。在你需要插入此表的位置,**只输出这一行占位符**(单独一行,不带任何其他符号或说明):\n\n${EXPERT_TABLE_PLACEHOLDER}\n\n后处理会自动把这行替换为真表。如果你写了自己的表,系统会把它整段删掉,等于白写。\n\n`
                : `[TABLE RULE — HARD] For the "Expert Position Summary" table, do NOT write a markdown table yourself. The system has pre-rendered an authoritative table (verdict + confidence + rationale all from structured data). Where you would insert that table, output ONLY this placeholder on its own line, no other text:\n\n${EXPERT_TABLE_PLACEHOLDER}\n\nPost-processing will substitute it with the real table. If you write your own table the system will strip it.\n\n`;
              // CRITICAL — per-expert verdict + confidence still go into the
              // prompt so the synthesis LLM can reference values in prose.
              // (The table itself is no longer LLM-generated — see TABLE RULE.)
              expertDebateContext += isZhQuery
                ? `【数据参考】每位专家下方明确给出 VERDICT(立场)与 CONFIDENCE(信心 %),正文引用专家观点时请用这些数值,不要自己重新推断。\n\n`
                : `[DATA REFERENCE] Each expert below has explicit VERDICT and CONFIDENCE values. When citing them in prose, use these values verbatim — do not re-infer from the rationale.\n\n`;
              // ── Per-expert "debate journey" ─────────────────────────
              // For each expert, surface BOTH (a) their initial / strongest
              // directional stance AND (b) their final (often converged)
              // stance, so the synthesis LLM can write a proper "they
              // started here, debated, ended there" narrative instead of
              // the boring "everyone agrees Neutral" summary.
              expertDebateContext += isZhQuery
                ? `【辩论旅程】下方为每位专家的"最强立场"和"最终立场"对比。请在分析里讲清楚:谁起初看多/看空、被什么论据说服、最终收敛到哪 —— 这才是圆桌辩论的真正价值。\n\n`
                : `[DEBATE JOURNEY] Each expert below is shown with their STRONGEST stance during debate and their FINAL stance after consensus. Use this to narrate who started where, what convinced whom, and where positions converged — that journey is what makes a roundtable analysis valuable.\n\n`;
              expertDebateContext += `Individual Expert Journey:\n`;
              agentResponses.forEach((resp: any, idx: number) => {
                const name = resolveAgentName(resp.agentId, idx);
                const finalConf = parseConfidence(resp.answer, resp.confidence);
                const finalVerdict = parseSignal(resp.answer);
                const strongest = pickStrongestStance(resp.agentId, { answer: resp.answer, confidence: resp.confidence });
                const strongestConf = parseConfidence(strongest.answer, strongest.confidence);
                expertDebateContext += `=== ${name} ===\n`;
                if (strongest.verdict !== finalVerdict || strongest.round !== roundsUsed) {
                  expertDebateContext += `[Round ${strongest.round} STRONGEST stance] VERDICT: ${strongest.verdict} | CONFIDENCE: ${strongestConf}%\n`;
                  expertDebateContext += `${strongest.answer}\n\n`;
                  expertDebateContext += `[Round ${roundsUsed} FINAL stance after debate] VERDICT: ${finalVerdict} | CONFIDENCE: ${finalConf}%\n`;
                  expertDebateContext += `${resp.answer}\n\n`;
                } else {
                  // Stance didn't change across rounds — only show one block.
                  expertDebateContext += `[Stance held across all rounds] VERDICT: ${finalVerdict} | CONFIDENCE: ${finalConf}%\n`;
                  expertDebateContext += `${resp.answer}\n\n`;
                }
              });
            }

            // ── Immediately send consensus_done so frontend shows full RoundTable graph ──
            // This happens BEFORE Phase 3 (deep research), so the graph appears while the report streams.
            const conf = Number(consensusResult.consensus?.confidence ?? 0);
            const reached = consensusResult.consensus?.consensusReached !== false;
            const verdictMatch = finalAnswerText.match(/\*\*Verdict:\*\*\s*([^\n*]+)/i);
            const verdictLabel = verdictMatch
              ? verdictMatch[1].trim().slice(0, 120)
              : reached
                ? 'Consensus reached'
                : 'No consensus';

            consensusFlowData = {
              status: 'concluded',
              round: Math.min(3, roundsUsed || 3),
              maxRounds: 3,
              conclusion: { verdict: verdictLabel, confidence: conf },
            };
            emitter.emitModule('consensus', 'completed', consensusFlowData);
            recordChatRtEvent(sessionId, 'consensus_done', { result: consensusResult });
            socket.emit('agent:chat:consensus_done', {
              sessionId,
              result: consensusResult
            });

            // Phase 3: Deep Research synthesis — integrate raw data + initial draft + expert debate.
            // IMPORTANT: do NOT emit 'consensus active' here — that would overwrite the just-emitted
            // 'consensus completed' state with status='synthesizing', causing the right-side Process
            // panel's ConsensusModule to revert to "Building consensus group" (step 0) for the entire
            // 100s+ Claude streaming phase. Consensus IS done; the next phase is report-writing.
            emitter.emitModule('report', 'active', { phase: 'deep_research_synthesis' });
            // In Roundtable mode synFullContent is empty (Phase 1 skipped),
            // so fold the "Initial Analysis Draft" section only when it exists.
            const deepResearchInput = synFullContent
              ? `Raw Research Data:\n${contextString}\n\nInitial Analysis Draft:\n${synFullContent}${expertDebateContext}`
              : `Raw Research Data:\n${contextString}${expertDebateContext}`;
            const deepResearchFinalPrompt = buildDeepResearchPrompt(deepResearchInput);

            // ── Roundtable: kick off HTML generation NOW (in parallel with
            // deep research second pass). Earlier we deliberately skipped
            // `parallelHtmlPromise` for roundtable because contextString
            // alone misses the debate journey. But we now have the full
            // expertDebateContext baked into deepResearchInput, so HTML can
            // run with the same rich material AND overlap the ~90s deep
            // research streaming. Net wall-time saving: ~60-80s vs the pure
            // sequential HTML fallback. Awaited at the existing emit site.
            if (htmlReportEnabled && isDeepResearch && !parallelHtmlPromise) {
              console.log('[agent:chat:html] Roundtable: starting HTML in parallel with deep research, input length=', deepResearchInput.length);
              emitToUser(userId, 'agent:chat:html_generating', { sessionId, msgIdx: -1 });
              parallelHtmlPromise = runHtmlGeneration(deepResearchInput).catch(err => {
                console.error('[agent:chat:html] ❌ Roundtable parallel HTML failed:', err.message);
                return '';
              });
            }

            console.log('[agent:chat] Starting Deep Research second pass, prompt length:', deepResearchFinalPrompt.length);
            const deepSecondPassStartedAt = Date.now();

            const deepStream = await aiService.chatStream(
              [{ role: 'user', content: deepResearchFinalPrompt }],
              'superagent',
              undefined,
              8192,
              synthesisModelOverride,
            );
            const deepReader = deepStream.getReader();
            const deepDecoder = new TextDecoder();
            let deepFullContent = '';
            let deepBuffer = '';

            while (true) {
              const { done, value } = await deepReader.read();
              if (done || isAborted()) {
                if (!isAborted() && deepBuffer.trim().startsWith('data: ') && deepBuffer.trim() !== 'data: [DONE]') {
                  try {
                    const parsed = JSON.parse(deepBuffer.trim().slice(6).trim());
                    const delta = parsed.choices?.[0]?.delta?.content || '';
                    if (delta) { deepFullContent += delta; }
                  } catch (e) { }
                }
                break;
              }
              deepBuffer += deepDecoder.decode(value, { stream: true });
              const lines = deepBuffer.split('\n');
              deepBuffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (!trimmed.startsWith('data: ')) continue;
                try {
                  const parsed = JSON.parse(trimmed.slice(6).trim());
                  const delta = parsed.choices?.[0]?.delta?.content || '';
                  if (delta) {
                    deepFullContent += delta;
                    // Stream directly — initial draft was never shown to user
                    streamToChat(delta);
                  }
                } catch (e) { }
              }
            }

            // Force-substitute the canonical expert verdict table.
            // The LLM was told to emit `EXPERT_TABLE_PLACEHOLDER` in place of
            // a hand-written "专家立场汇总" table. We do three layers here:
            //   1) replace the placeholder with the canonical table verbatim;
            //   2) if the LLM ignored the placeholder rule and wrote its own
            //      table anyway, strip that rogue table and inject ours;
            //   3) if neither happened (LLM forgot the section entirely),
            //      append the canonical table near the end so the data is
            //      never lost.
            if (canonicalExpertTable) {
              if (deepFullContent.includes(EXPERT_TABLE_PLACEHOLDER)) {
                deepFullContent = deepFullContent.split(EXPERT_TABLE_PLACEHOLDER).join(canonicalExpertTable);
              } else {
                // Find a markdown table whose header row contains both 专家|Expert
                // and 核心观点|Verdict (or 信心|Confidence). This catches LLM-authored
                // expert tables in both languages without nuking unrelated tables.
                const rogueTable = deepFullContent.match(
                  /(?:^|\n)(?:#{1,4}\s+[^\n]*(?:专家立场|专家观点|辩论核心立场|核心立场|Expert\s+Position|Expert\s+Summary|Core\s+Debate\s+Positions?|Debate\s+Positions?)[^\n]*\n+)?(\|[^\n]*(?:专家|Expert)[^\n]*\|[^\n]*(?:核心观点|信心|Verdict|Stance|Confidence)[^\n]*\|\s*\n\|[\s\-:|]+\|\s*\n(?:\|[^\n]*\|\s*\n?)+)/i,
                );
                if (rogueTable && rogueTable.index != null) {
                  const before = deepFullContent.slice(0, rogueTable.index);
                  const after = deepFullContent.slice(rogueTable.index + rogueTable[0].length);
                  deepFullContent = `${before}\n\n${canonicalExpertTable}\n\n${after}`.replace(/\n{3,}/g, '\n\n');
                  console.log('[agent:chat:rt-table] LLM ignored placeholder, replaced rogue expert table with canonical');
                } else {
                  // No table at all — append before any "## 风险" or final closing section
                  const insertBefore = deepFullContent.search(/\n#{1,3}\s+(?:风险|Risk|结论|Conclusion|附录|Appendix)/i);
                  if (insertBefore > 0) {
                    deepFullContent = deepFullContent.slice(0, insertBefore) + `\n\n${canonicalExpertTable}\n` + deepFullContent.slice(insertBefore);
                  } else {
                    deepFullContent = deepFullContent.trimEnd() + `\n\n${canonicalExpertTable}\n`;
                  }
                  console.log('[agent:chat:rt-table] LLM omitted expert section entirely, appended canonical table');
                }
              }
            }

            // Use the deep research output as final content
            finalDbContent = deepFullContent;
            console.log(
              `[agent:chat:timing] deep_second_pass_s=${asSeconds(Date.now() - deepSecondPassStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId}`,
            );

            if (consensusResult.consensus) {
              consensusResult.consensus.finalAnswer = finalDbContent;
            }
          } catch (e: any) {
            finalDbContent = synFullContent + `\n\n---\n\n## ⚠️ Consensus Error\n${e.message}`;
            streamToChat(`\n\n---\n\n## ⚠️ Consensus Error\n${e.message}`);
            consensusFlowData = {
              status: 'concluded',
              round: 1,
              maxRounds: 3,
              conclusion: { verdict: 'Consensus failed', confidence: 0 },
            };
            emitter.emitModule('consensus', 'completed', consensusFlowData);
            const failedConsensusResult = { consensus: { finalAnswer: finalDbContent, confidence: 0, executionTime: 0, agentResponses: [] } };
            recordChatRtEvent(sessionId, 'consensus_done', { result: failedConsensusResult });
            socket.emit('agent:chat:consensus_done', {
              sessionId,
              result: failedConsensusResult
            });
          } finally {
            console.log(
              `[agent:chat:timing] roundtable_total_s=${asSeconds(Date.now() - roundtableStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId}`,
            );
          }
        }

        if (consensusFlowData) {
          flowModules.push({ type: 'consensus', status: 'completed', data: consensusFlowData as unknown as Record<string, unknown> });
        }
        const dur = Math.max(0, Math.round((Date.now() - startTime) / 1000));
        flowModules.push({ type: 'done', status: 'completed', data: { duration: dur } });

        if (!isGuest) {
          await prisma.chatMessage.create({
            data: {
              userId,
              sessionId,
              role: 'assistant',
              content: finalDbContent,
              agentId: 'superagent',
              metadata: JSON.stringify({
                thinkingFlow: {
                  modules: flowModules,
                  isActive: false,
                  route: 'Super Agent Orchestrator',
                  ...(isDeepResearch ? { routedMode: 'roundtable' } : {}),
                  // Persist the tools-phase duration (request → tools done,
                  // NOT including the synthesis stream). On history restore
                  // the trigger pill renders "Done · X tools · Y sources · Zs"
                  // using this Z, so the displayed seconds matches what the
                  // user originally saw mid-stream — instead of the inflated
                  // end-to-end duration `done.duration` records.
                  toolsPhaseDurationS,
                },
                consensusResult: savedConsensusResult ?? undefined,
                // Live SSE debate log — every per-agent-per-round event
                // captured during the run. On history restore the frontend
                // prefers this over the structured discussionRounds because
                // aegean's structured output frequently drops rounds where
                // no one shifted position. Optional — old chat messages
                // saved before this field existed will fall back to the
                // legacy reconstruction path.
                ...(savedLiveDebateLog && savedLiveDebateLog.length > 0
                  ? { liveDebateLog: savedLiveDebateLog }
                  : {}),
                // Persist the roster separately from consensusResult so the
                // session history page can replay AgentRoom / Debate Tab
                // without re-parsing consensusResult.agentResponses.
                ...(isDeepResearch && data.analystIds?.length
                  ? { analystIds: data.analystIds }
                  : {}),
                quoteCard: savedQuoteCard ?? undefined,
                tokenCard: savedTokenCard ?? undefined,
                xProfileCard: savedXProfileCard ?? undefined,
                sources: finalSocialSources.length > 0 ? finalSocialSources : undefined,
              })
            }
          });
        }
        logSynthesisFinalText('primary', finalDbContent);

        emitter.emitModule('done', 'completed', { duration: dur });
        const streamDoneSources = finalSocialSources.length > 0 ? finalSocialSources : undefined;
        console.log(
          `[agent:chat:sources] stream_done_sources_count=${streamDoneSources?.length || 0} sessionId=${sessionId}`,
        );
        emitter.emitStreamDone(finalDbContent, { sources: streamDoneSources });

        // --- HTML report emission: prefer parallel result, fall back to sequential ---
        // Primary path: await the promise launched BEFORE synthesis (started at
        // `parallelHtmlStartedAt`). It has been running concurrently with synthesis,
        // so typically it resolves immediately or within a short margin — saving the
        // full sequential round-trip that previously blocked ~148s.
        const htmlModeLabel = isDeepResearch ? 'roundtable' : 'standard';
        if (htmlEligible && config.superAgentDisableHtmlReport) {
          console.log('[agent:chat:html] Skipped HTML generation (SUPERAGENT_DISABLE_HTML_REPORT is set)');
        } else if (htmlEligible && finalDbContent && finalDbContent.length > 200) {
          const htmlEmitStartedAt = Date.now();
          let htmlContent = '';
          if (parallelHtmlPromise) {
            console.log(`[agent:chat:html] Awaiting REAL-PARALLEL HTML result (started ${asSeconds(Date.now() - parallelHtmlStartedAt)}s ago)`);
            try {
              htmlContent = await parallelHtmlPromise;
            } catch (_) {
              htmlContent = '';
            }
            if (htmlContent && htmlContent.length > 100) {
              console.log(`[agent:chat:html] ✅ Using PARALLEL HTML result, length=${htmlContent.length}`);
            } else {
              console.log(`[agent:chat:html] ⚠️ Parallel HTML empty/short, falling back to sequential`);
            }
          }
          if (!htmlContent || htmlContent.length <= 100) {
            const pendingMsgCount = await prisma.chatMessage.count({ where: { sessionId } });
            const genMsgIdx = pendingMsgCount - 1;
            emitToUser(userId, 'agent:chat:html_generating', { sessionId, msgIdx: genMsgIdx });
            console.log(
              `[agent:chat:html] Starting SEQUENTIAL fallback HTML generation (${htmlModeLabel}), input length=${finalDbContent.length}`,
            );
            try {
              htmlContent = await runHtmlGeneration(finalDbContent);
            } catch (htmlErr: any) {
              console.error(`[agent:chat:html] ❌ Sequential fallback HTML failed (${htmlModeLabel}):`, htmlErr.message);
              htmlContent = '';
            }
          }
          if (htmlContent && htmlContent.length > 100) {
            try { await emitHtmlResult(htmlContent); } catch (_) {}
          }
          console.log(
            `[agent:chat:timing] html_emit_s=${asSeconds(Date.now() - htmlEmitStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId} mode=${htmlModeLabel}`,
          );
        }

        console.log(
          `[agent:chat:timing] synthesizer_total_s=${asSeconds(Date.now() - synthStartedAt)} end_to_end_s=${asSeconds(sinceRequestStart())} ui_duration_s=${dur} sessionId=${sessionId}`,
        );
      } catch (err: any) {
        console.error('[agent:chat] SYNTHESIS ERROR:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
        if (isAborted()) {
          console.log(`[agent:chat] Aborted during synthesis error handling for session ${sessionId}`);
          emitter.emitStreamCancelled();
          activeChatSessions.delete(sessionId);
        chatSessionStartTimes.delete(sessionId);
        finishChatReplayBuffer(sessionId);
          chatAbortControllers.delete(sessionId);
          return;
        }

        const errMsg = typeof err?.message === 'string' ? err.message : String(err);
        const fallbackContent = await synthesizeFallbackContent(errMsg);
        const dur = Math.max(0, Math.round((Date.now() - startTime) / 1000));
        const fallbackModules: Array<{ type: string; status: string; data?: Record<string, unknown> }> = [];
        if (plan.capabilities.search.needed) fallbackModules.push({ type: 'search', status: 'completed' });
        if (plan.capabilities.analysis.needed) fallbackModules.push({ type: 'analysis', status: 'completed' });
        if (plan.capabilities.simulate.needed) fallbackModules.push({ type: 'simulation', status: 'completed' });
        if (plan.capabilities.web3?.needed) fallbackModules.push({ type: 'web3', status: 'completed' });
        fallbackModules.push({
          type: 'done',
          status: 'completed',
          data: { duration: dur, degraded: true, cause: 'synthesis_error' },
        });

        if (!isGuest) {
          await prisma.chatMessage.create({
            data: {
              userId,
              sessionId,
              role: 'assistant',
              content: fallbackContent,
              agentId: 'superagent',
              metadata: JSON.stringify({
                thinkingFlow: {
                  modules: fallbackModules,
                  isActive: false,
                  route: 'Super Agent Orchestrator',
                },
                quoteCard: savedQuoteCard ?? undefined,
                tokenCard: savedTokenCard ?? undefined,
                xProfileCard: savedXProfileCard ?? undefined,
                degraded: true,
                degradedReason: errMsg,
              }),
            },
          });
        }
        logSynthesisFinalText('fallback', fallbackContent);

        streamToChat(fallbackContent);
        emitter.emitModule('done', 'completed', { duration: dur, degraded: true, cause: 'synthesis_error' });
        const fallbackStreamSources = finalSocialSources.length > 0 ? finalSocialSources : undefined;
        console.log(
          `[agent:chat:sources] fallback_stream_done_sources_count=${fallbackStreamSources?.length || 0} sessionId=${sessionId}`,
        );
        emitter.emitStreamDone(fallbackContent, { sources: fallbackStreamSources });
        console.log(
          `[agent:chat:timing] fallback_emitted_s=${asSeconds(Date.now() - synthStartedAt)} end_to_end_s=${asSeconds(sinceRequestStart())} ui_duration_s=${dur} sessionId=${sessionId}`,
        );

        console.log(
          `[agent:chat:timing] synthesizer_total_s=${asSeconds(Date.now() - synthStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId} (error)`,
        );
      }
      activeChatSessions.delete(sessionId);
        chatSessionStartTimes.delete(sessionId);
        finishChatReplayBuffer(sessionId);
      chatAbortControllers.delete(sessionId);
    });
    socket.on('disconnect', () => {
      if (process.env.SOCKET_VERBOSE_LOG === '1') {
        console.log(`🔌 Client disconnected: ${socket.id}`);
      }
      socketRateLimiter.delete(socket.id);

      // Check if user has other active sockets before marking offline
      const rooms = io.sockets.adapter.rooms.get(`user:${userId}`);
      if (!rooms || rooms.size === 0) {
        onlineUsers.delete(userId);
        socket.broadcast.emit('user:offline', { userId });
      }
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

// Helper to emit to specific user
export function emitToUser(userId: string, event: string, data: unknown) {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

// Helper to emit to group
export function emitToGroup(groupId: string, event: string, data: unknown) {
  if (io) {
    io.to(`group:${groupId}`).emit(event, data);
  }
}

// Helper to make a user's active sockets join a specific room
// Used when a user joins a group via REST API so they immediately receive group events
export function joinSocketRoom(userId: string, room: string) {
  if (!io) return;
  const userRoom = io.sockets.adapter.rooms.get(`user:${userId}`);
  if (userRoom) {
    for (const socketId of userRoom) {
      const s = io.sockets.sockets.get(socketId);
      if (s) s.join(room);
    }
  }
}

// Helper to get online user IDs
export function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers);
}