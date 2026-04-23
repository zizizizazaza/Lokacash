/**
 * aegeanDeepAnalysis.service.ts
 *
 * Wraps aegean's `POST /investment/analyze` endpoint for the Roundtable
 * "deep-dive" path (single-asset questions, ~90% of Roundtable traffic).
 *
 * Flow difference from existing `investment.service.ts`:
 *   - Existing path: Node pre-fetches market data via `fetch_data_only.py`
 *     and packs it into the request (`public_facts`, `market_snapshot`).
 *   - This new path: aegean fetches its own data via its internal providers
 *     (YFinance / Tushare / FMP / CoinGecko / Finnhub / Tavily / Exa /
 *     SerpAPI). We only pass the asset identifier + the user's question.
 *
 * Why: aegean's upstream v2026-04 upgrade added self-contained data providers.
 * Using them lets us get Masters Panel / Bull-Bear debate / portfolio risk
 * analysis "for free" without duplicating the pre-fetch in Node.
 *
 * Event streaming: deferred to Phase 2 (see
 * docs/aegean-deep-analysis-migration.md). For now we return the full result
 * after completion.
 */

import { pyFetch } from './consensus.service.js';
import type { AssetInfo } from './assetExtractor.js';

// ── Request shape (mirrors aegean's InvestmentAnalysisRequest) ──
// NOTE: aegean's full Masters-Panel + Bull-vs-Bear + Chair adversarial flow
// ONLY runs when mode='debate' (see aegean/investment/service.py:622-646).
// 'roundtable' in aegean is just a simpler quorum-consensus loop — not what
// our Roundtable UI is meant to showcase. So our frontend "Roundtable" maps
// to aegean "debate" here.
interface AegeanInvestmentRequest {
  mode: 'auto' | 'fast' | 'roundtable' | 'debate';
  asset: {
    symbol: string;
    market: string;
    asset_type: string;
    display_name?: string;
    exchange?: string;
  };
  timeframe?: {
    lookback_window_days?: number;
    horizon?: string;
  };
  risk_profile?: string;
  objective?: string;
  custom_question?: string;
  user_id?: string;
  metadata?: Record<string, any>;
}

// ── Response shape (mirrors aegean's InvestmentAnalysisResponse) ──
// Keep loose typing: Phase 3 will do a stricter transform into the shape
// the frontend Workbench expects.
export interface AegeanDeepAnalysisResponse {
  request_id: string;
  status: string;
  mode: string;
  asset: any;
  timeframe: any;
  analysis_framework?: any;
  recommendation: {
    action: string;
    confidence: number;
    position_suggestion?: Record<string, number>;
    decision_rationale?: string;
  };
  summary: {
    thesis?: string;
    key_drivers?: string[];
    key_risks?: string[];
  };
  bull_case?: string[];
  bear_case?: string[];
  scenarios?: Array<{ name?: string; probability?: number; description?: string; [k: string]: any }>;
  agents_panel?: any[];
  agent_outputs?: any[];
  discussion_rounds?: any[];
  masters_panel?: any[];
  knowledge_graph?: any;
  risk_gate?: any;
  metadata?: Record<string, any>;
  [k: string]: any; // forward-compat for fields we don't know about yet
}

// ── Timing guardrail ──
// aegean's deep analysis can take 30-120s depending on provider availability.
// Give it 180s headroom so slow-but-successful runs don't get cut.
const TIMEOUT_MS = 180_000;

/**
 * Map a logical frontend mode to the aegean payload mode.
 *   frontend 'roundtable' → aegean 'debate'    (full Masters + Bull/Bear + Chair)
 *   frontend 'fast'       → aegean 'fast'
 */
function mapFrontendModeToAegean(frontendMode: 'roundtable' | 'fast'): 'debate' | 'fast' {
  return frontendMode === 'roundtable' ? 'debate' : 'fast';
}

function buildPayload(
  userId: string,
  asset: AssetInfo,
  userQuestion: string,
  frontendMode: 'roundtable' | 'fast' = 'roundtable',
): AegeanInvestmentRequest {
  const mode = mapFrontendModeToAegean(frontendMode);
  return {
    mode,
    asset: {
      symbol: asset.symbol,
      market: asset.market,
      asset_type: asset.asset_type,
      display_name: asset.display_name,
    },
    timeframe: {
      lookback_window_days: 90,
      horizon: '1m',
    },
    risk_profile: 'balanced',
    objective: 'balanced',
    custom_question: userQuestion.trim(),
    user_id: userId,
    metadata: {
      caller: 'lokacash-roundtable',
      invoked_at: new Date().toISOString(),
      // Enable the Masters Panel phase (Buffett / Munger / Burry / Lynch / Wood).
      // Without this flag, aegean skips Phase 1.5 entirely and returns 0 master summaries.
      // See aegean/investment/service.py _run_masters_panel.
      panel_type: 'masters',
    },
  };
}

/**
 * Run aegean's deep investment analysis for a single asset.
 *
 * Throws on HTTP failure or timeout. Caller should catch and decide whether
 * to fall back to the legacy Roundtable path.
 */
export async function runAegeanDeepAnalysis(
  userId: string,
  asset: AssetInfo,
  userQuestion: string,
  options: { mode?: 'roundtable' | 'fast' } = {},
): Promise<AegeanDeepAnalysisResponse> {
  const payload = buildPayload(userId, asset, userQuestion, options.mode ?? 'roundtable');

  const startedAt = Date.now();
  console.log(
    `[aegeanDeepAnalysis] ▶ start: symbol=${asset.symbol} market=${asset.market} type=${asset.asset_type} mode=${payload.mode} userId=${userId}`,
  );

  // AbortController so we can enforce a timeout around pyFetch (which uses
  // the default fetch and has no built-in timeout).
  const abort = new AbortController();
  const timeoutId = setTimeout(() => abort.abort(), TIMEOUT_MS);

  // Heartbeat log every 10s so operators can tell "still waiting on aegean"
  // apart from "stuck forever" without watching the aegean-side logs.
  const heartbeat = setInterval(() => {
    const secs = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[aegeanDeepAnalysis] ⏳ still waiting: symbol=${asset.symbol} elapsed_s=${secs}`);
  }, 10_000);

  try {
    const result = (await pyFetch('/investment/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: abort.signal,
    })) as AegeanDeepAnalysisResponse;

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[aegeanDeepAnalysis] ✅ done: symbol=${asset.symbol} action=${result.recommendation?.action} ` +
        `confidence=${result.recommendation?.confidence} elapsed_s=${(elapsedMs / 1000).toFixed(1)}`,
    );

    return result;
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    const reason = abort.signal.aborted ? 'timeout' : (err as Error).message;
    console.error(
      `[aegeanDeepAnalysis] ✗ failed: symbol=${asset.symbol} elapsed_s=${(elapsedMs / 1000).toFixed(1)} reason=${reason}`,
    );
    throw err;
  } finally {
    clearTimeout(timeoutId);
    clearInterval(heartbeat);
  }
}
