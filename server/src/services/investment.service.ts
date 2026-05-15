/**
 * investment.service.ts — Orchestrates the data-fetch → Aegean Consensus pipeline.
 *
 * Flow:
 *   1. Spawn `fetch_data_only.py` to grab raw market data (K-lines, quote, news)
 *   2. Format the raw data into Aegean's InvestmentAnalysisRequest schema
 *   3. POST to Aegean's /api/v1/investment/analyze endpoint
 *   4. Return the structured consensus report
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
import { pyFetch } from './consensus.service.js';
import { withPythonSlot } from './pythonSemaphore.service.js';

// ── Types ──

export interface MarketData {
  stock_code: string;
  fetch_timestamp: number;
  realtime_quote: Record<string, any> | null;
  daily_history: Record<string, any> | null;
  stock_info: Record<string, any> | null;
  trend_analysis: Record<string, any> | null;
  news: Record<string, any> | null;
  errors: string[];
}

export interface InvestmentAnalysisResult {
  requestId: string;
  status: string;
  mode: string;
  recommendation: {
    action: string;
    confidence: number;
    positionSuggestion: Record<string, number>;
    decisionRationale: string;
  };
  summary: {
    thesis: string;
    keyDrivers: string[];
    keyRisks: string[];
  };
  agentOutputs: Array<{
    agentId: string;
    role: string;
    title: string;
    signal: string;
    confidence: number;
    summary: string;
  }>;
  consensus: {
    enabled: boolean;
    roundsUsed: number;
    consensusReached: boolean;
    finalAction: string;
    weightedVotes: Record<string, number>;
  };
  riskGate: {
    status: string;
    riskLevel: string;
    riskIndicators: string[];
    reviewSummary: string;
  };
  reportMarkdown: string;
  metadata: Record<string, any>;
}

// ── Helpers ──

function getPythonPath(): string {
  const isWindows = process.platform === 'win32';
  const venvPath = path.join(process.cwd(), 'tools', 'stock-analysis', '.venv');
  if (fs.existsSync(venvPath)) {
    return isWindows
      ? path.join(venvPath, 'Scripts', 'python.exe')
      : path.join(venvPath, 'bin', 'python');
  }
  return isWindows ? 'python' : 'python3';
}

function buildEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    ENV_FILE: path.resolve(process.cwd(), '.env'),
    PYTHONIOENCODING: 'utf-8',
  };
  if (env.LOKA_AI_API_KEY) {
    env.AIHUBMIX_KEY = env.LOKA_AI_API_KEY;
    env.OPENAI_API_KEY = env.LOKA_AI_API_KEY;
  }
  if (env.LOKA_AI_MODEL) {
    env.OPENAI_MODEL = env.LOKA_AI_MODEL;
    env.LITELLM_MODEL = `openai/${env.LOKA_AI_MODEL}`;
  }
  if (env.LOKA_AI_BASE_URL) {
    const baseUrl = env.LOKA_AI_BASE_URL.replace('/chat/completions', '');
    env.OPENAI_API_BASE = baseUrl;
    env.OPENAI_BASE_URL = baseUrl;
  }
  return env;
}

/**
 * Detect market code from stock symbol:
 *   600xxx / 000xxx / 300xxx → CN
 *   hk00700 / HK prefix     → HK
 *   otherwise                → US
 */
function detectMarket(symbol: string): 'CN' | 'HK' | 'US' {
  const s = symbol.toUpperCase().trim();
  if (s.startsWith('HK') || /^\d{5}$/.test(s)) return 'HK';
  if (/^\d{6}$/.test(s)) return 'CN';
  return 'US';
}

/**
 * Detect asset type (simplified heuristic)
 */
function detectAssetType(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.includes('BTC') || s.includes('ETH') || s.includes('USDT')) return 'crypto';
  if (s.includes('ETF') || ['SPY', 'QQQ', 'IWM', 'DIA', 'VTI'].includes(s)) return 'etf';
  return 'equity';
}

// ── Step 1: Fetch raw market data via stock-analysis tools ──

export function fetchMarketData(stockCode: string): Promise<MarketData> {
  // Guarded by withPythonSlot — fetch_data_only.py loads the same pandas /
  // akshare stack as stock_analysis (250-350 MB resident). Co-acquiring with
  // the global semaphore prevents Roundtable from blowing past the cap.
  return withPythonSlot(
    () =>
      new Promise<MarketData>((resolve, reject) => {
        const pythonPath = getPythonPath();
        const scriptPath = path.join(process.cwd(), 'tools', 'stock-analysis', 'fetch_data_only.py');

        console.log(`[Investment] Fetching market data for ${stockCode}...`);

        const proc = spawn(pythonPath, [scriptPath, '--stock-code', stockCode], {
          cwd: path.join(process.cwd(), 'tools', 'stock-analysis'),
          env: buildEnv() as NodeJS.ProcessEnv,
        });

        const chunks: Buffer[] = [];

        proc.stdout.on('data', (data: Buffer) => chunks.push(data));
        proc.stderr.on('data', (data: Buffer) => {
          const lines = data.toString('utf-8').split('\n');
          for (const line of lines) {
            const clean = line.trim();
            if (clean && !clean.includes('Tushare Token') && !clean.includes('通知渠道')) {
              console.log(`[Investment:DataFetch] ${clean}`);
            }
          }
        });

        proc.on('close', (code) => {
          const raw = Buffer.concat(chunks).toString('utf-8').trim();
          if (code !== 0) {
            reject(new Error(`fetch_data_only.py exited with code ${code}`));
            return;
          }
          try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON object in fetch_data_only output');
            const data: MarketData = JSON.parse(jsonMatch[0]);
            console.log(`[Investment] Market data fetched: quote=${!!data.realtime_quote}, history=${!!data.daily_history}, info=${!!data.stock_info}, news=${!!data.news}, errors=${data.errors.length}`);
            resolve(data);
          } catch (e: any) {
            reject(new Error(`Failed to parse fetch_data_only output: ${e.message}`));
          }
        });

        proc.on('error', (err) => reject(err));
      }),
    {
      tag: `fetch_data_only:${stockCode}`,
      timeoutMs: 90_000,
    },
  );
}

// ── Step 2: Format raw data into Aegean request payload ──

export function formatForAegean(
  data: MarketData,
  userId: string,
  mode: string = 'roundtable',
): Record<string, any> {
  const symbol = data.stock_code;
  const market = detectMarket(symbol);
  const assetType = detectAssetType(symbol);

  // Build public_facts from fetched data
  const facts: string[] = [];

  if (data.realtime_quote) {
    const q = data.realtime_quote;
    facts.push(`Current Price: ${q.price}, Change: ${q.change_pct}%`);
    if (q.pe_ratio) facts.push(`PE Ratio: ${q.pe_ratio}`);
    if (q.pb_ratio) facts.push(`PB Ratio: ${q.pb_ratio}`);
    if (q.volume_ratio) facts.push(`Volume Ratio: ${q.volume_ratio}`);
    if (q.turnover_rate) facts.push(`Turnover Rate: ${q.turnover_rate}%`);
    if (q.total_mv) facts.push(`Market Cap: ${q.total_mv}`);
  }

  if (data.trend_analysis) {
    const t = data.trend_analysis;
    if (t.trend_status) facts.push(`Trend: ${t.trend_status}`);
    if (t.ma_alignment) facts.push(`MA Alignment: ${t.ma_alignment}`);
    if (t.buy_signal) facts.push(`Signal: ${t.buy_signal}`);
    if (t.macd_cross) facts.push(`MACD Cross: ${t.macd_cross}`);
    if (t.rsi) facts.push(`RSI: ${t.rsi}`);
  }

  if (data.stock_info) {
    const info = data.stock_info;
    if (info.belong_boards && Array.isArray(info.belong_boards)) {
      facts.push(`Sector: ${info.belong_boards.join(', ')}`);
    }
  }

  if (data.news && data.news.results) {
    for (const article of (data.news.results as any[]).slice(0, 5)) {
      facts.push(`[News] ${article.title}: ${article.snippet || ''}`);
    }
  }

  // Build market_snapshot summary string
  let snapshot = '';
  if (data.realtime_quote) {
    const q = data.realtime_quote;
    snapshot = `${q.name || symbol} | Price: ${q.price} | Change: ${q.change_pct}% | Vol: ${q.volume} | PE: ${q.pe_ratio || 'N/A'} | PB: ${q.pb_ratio || 'N/A'}`;
  }

  // Build daily history summary (last 5 days)
  if (data.daily_history?.data) {
    const recent = (data.daily_history.data as any[]).slice(-5);
    for (const day of recent) {
      facts.push(`[${day.date}] O:${day.open} H:${day.high} L:${day.low} C:${day.close} Vol:${day.volume}`);
    }
  }

  const displayName = data.realtime_quote?.name || data.stock_info?.name || symbol;

  return {
    mode,
    asset: {
      symbol: symbol.toUpperCase(),
      market,
      asset_type: assetType,
      display_name: displayName,
    },
    timeframe: {
      lookback_window_days: 60,
      horizon: '1m',
    },
    risk_profile: 'balanced',
    objective: 'balanced',
    market_snapshot: snapshot,
    public_facts: facts,
    user_id: userId,
    constraints: {
      no_short: true,
      max_exposure_pct: 0.15,
    },
  };
}

// ── Step 3: Call Aegean's Investment Analysis API ──

export async function callAegeanInvestment(payload: Record<string, any>): Promise<any> {
  console.log(`[Investment] Sending to Aegean: ${payload.asset.symbol} (${payload.mode}) with ${payload.public_facts.length} facts`);

  const result = await pyFetch('/investment/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  console.log(`[Investment] Aegean analysis completed: action=${result.recommendation?.action}, confidence=${result.recommendation?.confidence}`);
  return result;
}

// ── Step 4: Transform Aegean response to our internal format ──

export function transformAegeanResponse(raw: any): InvestmentAnalysisResult {
  return {
    requestId: raw.request_id || '',
    status: raw.status || 'completed',
    mode: raw.mode || 'auto',
    recommendation: {
      action: raw.recommendation?.action || 'watch',
      confidence: raw.recommendation?.confidence || 0,
      positionSuggestion: raw.recommendation?.position_suggestion || {},
      decisionRationale: raw.recommendation?.decision_rationale || '',
    },
    summary: {
      thesis: raw.summary?.thesis || '',
      keyDrivers: raw.summary?.key_drivers || [],
      keyRisks: raw.summary?.key_risks || [],
    },
    agentOutputs: (raw.agent_outputs || []).map((a: any) => ({
      agentId: a.agent_id,
      role: a.role,
      title: a.title,
      signal: a.signal,
      confidence: a.confidence,
      summary: a.summary,
    })),
    consensus: {
      enabled: raw.consensus?.enabled || false,
      roundsUsed: raw.consensus?.rounds_used || 0,
      consensusReached: raw.consensus?.consensus_reached || false,
      finalAction: raw.consensus?.final_action || '',
      weightedVotes: raw.consensus?.weighted_votes || {},
    },
    riskGate: {
      status: raw.risk_gate?.status || 'pass',
      riskLevel: raw.risk_gate?.risk_level || 'low',
      riskIndicators: raw.risk_gate?.risk_indicators || [],
      reviewSummary: raw.risk_gate?.review_summary || '',
    },
    reportMarkdown: raw.report_markdown || '',
    metadata: raw.metadata || {},
  };
}

// ── Full Pipeline: fetch → format → analyze → transform ──

export async function runInvestmentAnalysis(
  stockCode: string,
  userId: string,
  mode: string = 'roundtable',
  onProgress?: (stage: string, detail?: any) => void,
): Promise<InvestmentAnalysisResult> {
  onProgress?.('data_fetch_started', { stockCode });

  // Step 1: Fetch raw market data
  const marketData = await fetchMarketData(stockCode);
  onProgress?.('data_fetch_done', {
    stockCode,
    hasQuote: !!marketData.realtime_quote,
    hasHistory: !!marketData.daily_history,
    hasNews: !!marketData.news,
    errors: marketData.errors,
  });

  // Step 2: Format for Aegean
  const payload = formatForAegean(marketData, userId, mode);
  onProgress?.('aegean_analysis_started', {
    symbol: payload.asset.symbol,
    factsCount: payload.public_facts.length,
  });

  // Step 3: Call Aegean
  const aegeanResult = await callAegeanInvestment(payload);
  onProgress?.('aegean_analysis_done', {
    action: aegeanResult.recommendation?.action,
    confidence: aegeanResult.recommendation?.confidence,
  });

  // Step 4: Transform
  const result = transformAegeanResponse(aegeanResult);
  return result;
}
