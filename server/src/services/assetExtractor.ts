/**
 * assetExtractor.ts — LLM-based single-asset extraction.
 *
 * Used by the Roundtable routing branch to decide whether a user's question
 * is about one specific tradeable asset (→ route to aegean /investment/analyze)
 * or an open/macro/multi-asset question (→ silent fallback to Fast mode).
 *
 * Decision: no regex. Pure LLM. The user previously tried regex-based extraction
 * and found it too brittle (tickers overlap with English words, coin names are
 * ambiguous, CN/HK suffixes vary). A single cheap DeepSeek call is ~1-2s and
 * far more accurate.
 *
 * Returns `null` on any ambiguity — callers should silently fall through to
 * Fast mode rather than error.
 */

import { config } from '../config.js';

// Must match aegean's MarketCode / AssetType enums exactly
// (see server/tools/aegean-consensus/src/aegean/investment/models.py).
// aegean has no CRYPTO market code — crypto assets use market=US by convention.
export type AssetMarket = 'US' | 'HK' | 'CN';
export type AssetType =
  | 'equity'
  | 'etf'
  | 'index'
  | 'fund'
  | 'convertible_bond'
  | 'futures'
  | 'options'
  | 'crypto';

export interface AssetInfo {
  symbol: string;
  market: AssetMarket;
  asset_type: AssetType;
  display_name?: string;
}

const SYSTEM_PROMPT = `You are a single-purpose parser. Given a user's investment question, decide whether the question is about exactly ONE tradeable financial asset and, if so, return its canonical identifier.

Return strict JSON in ONE of these two shapes:

1) Single asset detected:
{
  "symbol": "<canonical symbol>",
  "market": "US" | "HK" | "CN",
  "asset_type": "equity" | "etf" | "index" | "fund" | "convertible_bond" | "futures" | "options" | "crypto",
  "display_name": "<optional human-readable name>"
}

2) Not a single-asset question (open/macro/sector/comparison/multi-asset):
{ "symbol": null }

Canonical symbol rules:
- US stocks: uppercase ticker, e.g. AAPL, TSLA, NVDA, MSFT → market=US, asset_type=equity
- HK stocks: 4-5 digits + .HK, e.g. 700.HK, 9988.HK, 0700.HK → 700.HK (drop leading zeros) → market=HK, asset_type=equity
- A-shares: 6 digits + .SH (Shanghai) or .SZ (Shenzhen), e.g. 600519.SH, 000858.SZ → market=CN, asset_type=equity
- ETFs: use equity ticker convention, asset_type=etf (e.g. SPY, QQQ → market=US, asset_type=etf)
- Indices: asset_type=index (e.g. SPX, NDX, HSI)
- Crypto: uppercase ticker, e.g. BTC, ETH, SOL, DOGE, PEPE (NOT BTC/USDT, just BTC) → market=US, asset_type=crypto
  (there is no CRYPTO market code — always emit market=US for crypto)

Return { "symbol": null } when:
- User asks about multiple assets (e.g. "BTC vs ETH", "compare AAPL and MSFT")
- User asks about a sector / theme (e.g. "AI stocks", "DeFi", "US banks")
- User asks a macro question (e.g. "Fed rate impact", "inflation outlook")
- User asks about a person, event, or concept, not a tradeable asset
- Asset cannot be unambiguously identified

Output JSON only, no prose, no markdown fences.`;

/** Tune this down aggressively — this is a routing decision, low stakes */
const TIMEOUT_MS = 8_000;
const MAX_TOKENS = 120;

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

function sanitizeAsset(parsed: unknown): AssetInfo | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (obj.symbol === null || obj.symbol === undefined) return null;
  if (typeof obj.symbol !== 'string' || !obj.symbol.trim()) return null;

  const symbol = obj.symbol.trim();
  let market = obj.market as string;
  const asset_type = obj.asset_type as string;

  const VALID_TYPES = ['equity', 'etf', 'index', 'fund', 'convertible_bond', 'futures', 'options', 'crypto'];
  if (!VALID_TYPES.includes(asset_type)) return null;

  // aegean's MarketCode only accepts CN/HK/US. If the LLM emits "CRYPTO"
  // (legacy prompt habit) coerce to US since crypto has no dedicated market code.
  if (asset_type === 'crypto' && (!market || market === 'CRYPTO')) {
    market = 'US';
  }
  if (!['US', 'HK', 'CN'].includes(market)) return null;

  return {
    symbol,
    market: market as AssetMarket,
    asset_type: asset_type as AssetType,
    display_name: typeof obj.display_name === 'string' ? obj.display_name : undefined,
  };
}

function tryParseJson(raw: string): unknown {
  // First try: direct parse
  try { return JSON.parse(raw); } catch { /**/ }
  // Second try: extract first {...} block (LLM sometimes wraps in text)
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

/**
 * Extract a single tradeable asset from the user's message, or `null` if the
 * question doesn't map to exactly one asset.
 *
 * Safe on failure: returns `null` (never throws) so callers can simply check
 * the result and degrade gracefully.
 */
export async function extractAsset(userMessage: string): Promise<AssetInfo | null> {
  const text = userMessage?.trim();
  if (!text) return null;

  const apiKey = config.lokaAi.apiKey;
  const baseUrl = config.lokaAi.baseUrl;
  const model = config.lokaAi.model;

  if (!apiKey || !baseUrl) {
    console.warn('[assetExtractor] LOKA_AI_API_KEY / LOKA_AI_BASE_URL not configured — returning null');
    return null;
  }

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.0,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn(`[assetExtractor] LLM call failed ${response.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const data = (await response.json()) as DeepSeekResponse;
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    if (!raw) return null;

    const parsed = tryParseJson(raw);
    const asset = sanitizeAsset(parsed);

    if (asset) {
      console.log(`[assetExtractor] extracted: symbol=${asset.symbol} market=${asset.market} type=${asset.asset_type}`);
    } else {
      console.log(`[assetExtractor] no single asset detected (msg="${text.slice(0, 80)}...")`);
    }
    return asset;
  } catch (err) {
    console.warn('[assetExtractor] error:', (err as Error).message);
    return null;
  }
}
