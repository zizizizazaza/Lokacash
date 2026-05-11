/**
 * Phase 2.1.5 — Implicit behavioral profile (META level only).
 *
 * After every assistant turn we extract three lightweight signals from the
 * user's message + which tools fired, and bump counters in UserProfile:
 *
 *   1. directionBias  — "做多 / long" vs "做空 / short" keyword counts
 *   2. domain         — derived from which capability tool fired
 *                       (web3_token_analysis → crypto, stock_analysis → equity)
 *   3. riskAppetite   — high (memes / leverage / small caps) vs
 *                       low (blue chips / ETF / dividend)
 *
 * Crucially we do NOT track per-asset interest. That level of granularity
 * pollutes unrelated queries — asking about BTC should not pull in past SOL
 * or ETH context. Meta-level traits ("user prefers short setups") are
 * universal across assets and don't create that kind of bleed.
 *
 * Inferred profile is surfaced to the LLM only when the underlying counters
 * cross a confidence threshold (≥3 turns + ≥70% bias share for direction,
 * ≥70% share for domain). Below threshold the field is omitted entirely.
 *
 * No LLM calls — extraction is pure regex/keyword matching, ~1ms per turn.
 */
import prisma from '../db.js';

const MIN_TURNS_FOR_INFERENCE = 3;
const BIAS_THRESHOLD = 0.7;

const LONG_PATTERNS = [
  /\b(long|longing|做多|开多|抄底|加仓|建多|看多|多头|low and|buy the dip)\b/i,
  /[做开][多]/, // 做多 / 开多 (single CJK)
];
const SHORT_PATTERNS = [
  /\b(short|shorting|做空|开空|看空|做空|空头|sell rally|做空|逢高减仓)\b/i,
  /[做开][空]/, // 做空 / 开空
];

const HIGH_RISK_PATTERNS = [
  /\b(meme|memecoin|altcoin|shitcoin|small cap|micro cap|leverage|杠杆|永续|perp|合约|爆仓|土狗|低市值|新币|ido|presale|空投)\b/i,
  /[小微][市][值]/,
];
const LOW_RISK_PATTERNS = [
  /\b(blue chip|蓝筹|大盘股|etf|index fund|defensive|dividend|分红|股息|价值投资|long.term|长线|定投|dca)\b/i,
  /[蓝][筹]|[价][值][投]/,
];

export interface ExtractedSignals {
  long: number;
  short: number;
  highRisk: number;
  lowRisk: number;
  domain: 'crypto' | 'equity' | null;
}

export function extractSignals(userMessage: string, toolNames: string[]): ExtractedSignals {
  const text = (userMessage || '').toLowerCase();
  const long = LONG_PATTERNS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
  const short = SHORT_PATTERNS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
  const highRisk = HIGH_RISK_PATTERNS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
  const lowRisk = LOW_RISK_PATTERNS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);

  let domain: 'crypto' | 'equity' | null = null;
  if (toolNames.includes('web3_token_analysis')) domain = 'crypto';
  else if (toolNames.includes('stock_analysis')) domain = 'equity';

  return { long, short, highRisk, lowRisk, domain };
}

/**
 * Bump the user's profile counters based on this turn's signals. Idempotent
 * upsert — if no profile row yet, creates it with the deltas as initial values.
 * This runs AFTER the response is delivered so it never blocks user latency.
 */
export async function updateProfileFromTurn(
  userId: string,
  userMessage: string,
  toolNames: string[],
): Promise<void> {
  if (!userId) return;
  const sig = extractSignals(userMessage, toolNames);
  // Skip the write if no signal was found — avoids wasting a UPSERT for
  // every "hi" / "thanks" message.
  if (
    sig.long === 0 &&
    sig.short === 0 &&
    sig.highRisk === 0 &&
    sig.lowRisk === 0 &&
    sig.domain === null
  ) {
    // Still bump totalTurns so the threshold ramps up correctly even on
    // ambiguous queries.
    try {
      await upsertProfileRaw(userId, { long: 0, short: 0, crypto: 0, equity: 0, high: 0, low: 0, turns: 1 });
    } catch (err) {
      console.warn('[profile] totalTurns bump failed:', (err as Error).message);
    }
    return;
  }

  try {
    await upsertProfileRaw(userId, {
      long: sig.long,
      short: sig.short,
      crypto: sig.domain === 'crypto' ? 1 : 0,
      equity: sig.domain === 'equity' ? 1 : 0,
      high: sig.highRisk,
      low: sig.lowRisk,
      turns: 1,
    });
  } catch (err) {
    console.warn('[profile] update failed:', (err as Error).message);
  }
}

// Atomic upsert via Postgres ON CONFLICT — uses raw SQL so we don't depend
// on the freshly generated Prisma client (which can't reload while the dev
// server holds the engine DLL on Windows).
async function upsertProfileRaw(
  userId: string,
  delta: { long: number; short: number; crypto: number; equity: number; high: number; low: number; turns: number },
): Promise<void> {
  const id = `prof_${userId.slice(0, 16)}_${Math.random().toString(36).slice(2, 8)}`;
  await prisma.$executeRaw`
    INSERT INTO "UserProfile"
      ("id", "userId", "longCount", "shortCount", "cryptoQueries", "equityQueries",
       "highRiskQueries", "lowRiskQueries", "totalTurns", "updatedAt")
    VALUES
      (${id}, ${userId}, ${delta.long}, ${delta.short}, ${delta.crypto}, ${delta.equity},
       ${delta.high}, ${delta.low}, ${delta.turns}, NOW())
    ON CONFLICT ("userId") DO UPDATE SET
      "longCount"       = "UserProfile"."longCount"       + ${delta.long},
      "shortCount"      = "UserProfile"."shortCount"      + ${delta.short},
      "cryptoQueries"   = "UserProfile"."cryptoQueries"   + ${delta.crypto},
      "equityQueries"   = "UserProfile"."equityQueries"   + ${delta.equity},
      "highRiskQueries" = "UserProfile"."highRiskQueries" + ${delta.high},
      "lowRiskQueries"  = "UserProfile"."lowRiskQueries"  + ${delta.low},
      "totalTurns"      = "UserProfile"."totalTurns"      + ${delta.turns},
      "updatedAt"       = NOW()
  `;
}

export interface InferredProfile {
  directionBias?: 'long-bias' | 'short-bias';
  domain?: 'crypto' | 'equity';
  riskAppetite?: 'high' | 'low';
  totalTurns: number;
}

/**
 * Compute confidence-gated inferences from the raw counters. Returns an
 * empty profile object (no fields beyond totalTurns) for users who haven't
 * accumulated enough signal yet — we'd rather say nothing than guess wrong.
 */
export async function inferUserProfile(userId: string): Promise<InferredProfile> {
  if (!userId) return { totalTurns: 0 };
  type Row = {
    longCount: number;
    shortCount: number;
    cryptoQueries: number;
    equityQueries: number;
    highRiskQueries: number;
    lowRiskQueries: number;
    totalTurns: number;
  };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT "longCount", "shortCount", "cryptoQueries", "equityQueries",
           "highRiskQueries", "lowRiskQueries", "totalTurns"
    FROM "UserProfile"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.totalTurns < MIN_TURNS_FOR_INFERENCE) {
    return { totalTurns: row?.totalTurns ?? 0 };
  }

  const result: InferredProfile = { totalTurns: row.totalTurns };

  // Direction bias
  const dirTotal = row.longCount + row.shortCount;
  if (dirTotal >= 3) {
    if (row.longCount / dirTotal >= BIAS_THRESHOLD) result.directionBias = 'long-bias';
    else if (row.shortCount / dirTotal >= BIAS_THRESHOLD) result.directionBias = 'short-bias';
  }

  // Domain
  const domTotal = row.cryptoQueries + row.equityQueries;
  if (domTotal >= 3) {
    if (row.cryptoQueries / domTotal >= BIAS_THRESHOLD) result.domain = 'crypto';
    else if (row.equityQueries / domTotal >= BIAS_THRESHOLD) result.domain = 'equity';
  }

  // Risk appetite
  const riskTotal = row.highRiskQueries + row.lowRiskQueries;
  if (riskTotal >= 3) {
    if (row.highRiskQueries / riskTotal >= BIAS_THRESHOLD) result.riskAppetite = 'high';
    else if (row.lowRiskQueries / riskTotal >= BIAS_THRESHOLD) result.riskAppetite = 'low';
  }

  return result;
}

/**
 * Format the inferred profile as a prompt-ready block. Returns empty string
 * when no fields cleared confidence — never inject empty hint blocks.
 */
export function formatInferredProfileBlock(
  profile: InferredProfile,
  lang: 'zh' | 'en' = 'zh',
): string {
  const parts: string[] = [];
  if (lang === 'zh') {
    if (profile.directionBias === 'long-bias') parts.push('- 倾向研究做多入场');
    if (profile.directionBias === 'short-bias') parts.push('- 倾向研究做空入场');
    if (profile.domain === 'crypto') parts.push('- 主要研究 crypto / 链上资产');
    if (profile.domain === 'equity') parts.push('- 主要研究股票 / 传统资产');
    if (profile.riskAppetite === 'high') parts.push('- 高风险偏好（关注 memecoin / 杠杆 / 小市值）');
    if (profile.riskAppetite === 'low') parts.push('- 低风险偏好（关注蓝筹 / ETF / 价值投资）');
    if (parts.length === 0) return '';
    return `<inferred-profile>\n基于该用户过去 ${profile.totalTurns} 次对话的行为模式：\n${parts.join('\n')}\n</inferred-profile>\n\n`;
  } else {
    if (profile.directionBias === 'long-bias') parts.push('- Tends to research long entries');
    if (profile.directionBias === 'short-bias') parts.push('- Tends to research short entries');
    if (profile.domain === 'crypto') parts.push('- Focuses on crypto / on-chain');
    if (profile.domain === 'equity') parts.push('- Focuses on equities / traditional');
    if (profile.riskAppetite === 'high') parts.push('- High risk appetite (memes / leverage / small caps)');
    if (profile.riskAppetite === 'low') parts.push('- Low risk appetite (blue chips / ETFs / value)');
    if (parts.length === 0) return '';
    return `<inferred-profile>\nObserved over ${profile.totalTurns} prior turns:\n${parts.join('\n')}\n</inferred-profile>\n\n`;
  }
}
