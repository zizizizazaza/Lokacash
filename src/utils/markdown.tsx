import React, { createContext, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ─── Source Context for inline citation tooltips ────────────────
export interface CitationSource {
  favicon: string;
  title: string;
  domain: string;
  url?: string;
  snippet?: string;
}

const SourcesContext = createContext<CitationSource[]>([]);

/** Wrap markdown rendering to provide sources for citation tooltips */
export function SourcesProvider({ sources, children }: { sources: CitationSource[]; children: React.ReactNode }) {
  return <SourcesContext.Provider value={sources}>{children}</SourcesContext.Provider>;
}

// ─── Quote Snapshot Card ────────────────────────────────────────

export interface QuoteOkxSnapshot {
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
}

function okxFmtUsdCompact(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(digits)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(digits)}K`;
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 2 : 6 })}`;
}
function okxFmtPctSigned(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
function okxSummarizeWindow(
  candles: Array<[number, number, number, number, number]> | undefined,
  n: number,
): { high: number; low: number; pct: number } | null {
  if (!candles || !candles.length) return null;
  const rows = [...candles].sort((a, b) => b[0] - a[0]);
  const window = rows.slice(0, Math.min(n, rows.length));
  if (!window.length) return null;
  const latestClose = rows[0][4];
  let high = -Infinity;
  let low = Infinity;
  for (const r of window) {
    if (r[2] > high) high = r[2];
    if (r[3] < low) low = r[3];
  }
  const oldestOpen = window[window.length - 1][1];
  const pct = oldestOpen > 0 ? ((latestClose - oldestOpen) / oldestOpen) * 100 : NaN;
  return { high, low, pct };
}

export interface QuoteOkxNewsItem {
  id?: string;
  title?: string;
  summary?: string;
  url?: string;
  publishedAt?: string;
  source?: string;
  importance?: string;
  sentiment?: string;
  coins?: string[];
}

export interface QuoteOkxSentiment {
  baseCcy: string;
  label?: string;
  bullishRatio?: number | null;
  bearishRatio?: number | null;
  neutralRatio?: number | null;
  hotness?: number | null;
  newsMentionCnt?: number | null;
  xMentionCnt?: number | null;
}

export interface QuoteOkxNewsBundle {
  baseCcy: string;
  latestNews: QuoteOkxNewsItem[];
  sentiment: QuoteOkxSentiment | null;
}

/** News + Sentiment section rendered inside a quote card (OKX orbit). */
export function OkxQuoteNews({ bundle, lang = 'zh' }: { bundle: QuoteOkxNewsBundle; lang?: 'zh' | 'en' }) {
  const s = bundle.sentiment;
  const items = (bundle.latestNews || []).slice(0, 4);
  if (!s && !items.length) return null;
  const L = lang === 'en'
    ? { bull: 'Bull', bear: 'Bear', neutral: 'Neutral', mentions: 'mentions', news: 'News', important: 'Important' }
    : { bull: '多', bear: '空', neutral: '中', mentions: '提及', news: '新闻', important: '重要' };
  const barColor = s?.label === 'bullish' ? 'bg-emerald-500'
    : s?.label === 'bearish' ? 'bg-red-500'
    : 'bg-gray-400';
  const labelColor = s?.label === 'bullish' ? 'text-emerald-600'
    : s?.label === 'bearish' ? 'text-red-500'
    : 'text-gray-500';
  const fmt = (n?: number | null) => (n == null || !Number.isFinite(n) ? null : `${n.toFixed(1)}%`);
  return (
    <>
      <div className="mx-5 h-px bg-gradient-to-r from-transparent via-sky-200/60 to-transparent" />
      <div className="px-5 py-3.5 space-y-3">
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
          </svg>
          <span className="text-[9px] uppercase tracking-[0.08em] text-sky-600 font-semibold leading-none">
            {lang === 'en' ? 'Sentiment & News' : '情绪与新闻'}
          </span>
          <span className="text-[9px] text-gray-400">24h</span>
        </div>

        {/* Sentiment bar */}
        {s && (s.bullishRatio != null || s.bearishRatio != null) && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px]">
              <span className={`font-bold uppercase tracking-wider ${labelColor}`}>{s.label || 'neutral'}</span>
              <span className="text-gray-400">|</span>
              <span className="text-emerald-600 font-semibold tabular-nums">{fmt(s.bullishRatio) || '—'} <span className="text-gray-400 font-normal">{L.bull}</span></span>
              <span className="text-red-500 font-semibold tabular-nums">{fmt(s.bearishRatio) || '—'} <span className="text-gray-400 font-normal">{L.bear}</span></span>
              <span className="text-gray-500 font-semibold tabular-nums">{fmt(s.neutralRatio) || '—'} <span className="text-gray-400 font-normal">{L.neutral}</span></span>
              {s.hotness != null && (
                <span className="ml-auto text-[10px] text-gray-400">🔥 {s.hotness.toLocaleString()} {L.mentions}</span>
              )}
            </div>
            <div className="h-1.5 w-full rounded-full overflow-hidden bg-gray-100 flex">
              {s.bullishRatio != null && s.bullishRatio > 0 && (
                <div className="h-full bg-emerald-500" style={{ width: `${s.bullishRatio}%` }} />
              )}
              {s.neutralRatio != null && s.neutralRatio > 0 && (
                <div className="h-full bg-gray-300" style={{ width: `${s.neutralRatio}%` }} />
              )}
              {s.bearishRatio != null && s.bearishRatio > 0 && (
                <div className="h-full bg-red-500" style={{ width: `${s.bearishRatio}%` }} />
              )}
            </div>
            {(s.newsMentionCnt != null || s.xMentionCnt != null) && (
              <div className="flex gap-3 text-[10px] text-gray-400">
                {s.newsMentionCnt != null && <span>{L.news} {s.newsMentionCnt}</span>}
                {s.xMentionCnt != null && <span>X {s.xMentionCnt}</span>}
              </div>
            )}
            <div className={`h-[2px] w-6 rounded-full ${barColor}`} />
          </div>
        )}

        {/* News list */}
        {items.length > 0 && (
          <ul className="space-y-1.5">
            {items.map((n, ni) => {
              const when = n.publishedAt ? n.publishedAt.replace(/T.*$/, '') : '';
              const sentTagColor = n.sentiment === 'bullish' ? 'text-emerald-600 bg-emerald-50'
                : n.sentiment === 'bearish' ? 'text-red-500 bg-red-50'
                : 'text-gray-500 bg-gray-50';
              return (
                <li key={ni} className="text-[11.5px] leading-snug">
                  {n.url ? (
                    <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-gray-700 hover:text-sky-600 transition-colors">{n.title}</a>
                  ) : (
                    <span className="text-gray-700">{n.title}</span>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-400">
                    {when && <span>{when}</span>}
                    {n.source && <span>· {n.source}</span>}
                    {n.importance === 'high' && <span className="text-amber-600">· {L.important}</span>}
                    {n.sentiment && (
                      <span className={`ml-auto px-1.5 py-0.5 rounded ${sentTagColor} font-medium uppercase tracking-wide`}>{n.sentiment}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

/** Derivatives section rendered inside a quote card when OKX data is available. */
export function OkxQuoteDerivatives({ okx, lang = 'zh' }: { okx: QuoteOkxSnapshot; lang?: 'zh' | 'en' }) {
  const fr = okx.derivatives?.fundingRate;
  const frAnnual = fr != null ? fr * 3 * 365 * 100 : null;
  const fundingColor = fr != null
    ? (fr >= 0 ? 'text-emerald-600' : 'text-red-500')
    : 'text-gray-400';
  const range7 = okxSummarizeWindow(okx.candles, 7);
  const range30 = okxSummarizeWindow(okx.candles, 30);
  const derivStats: { label: string; value: React.ReactNode }[] = [];
  if (fr != null) {
    derivStats.push({
      label: 'Funding / 8h',
      value: (
        <span className={fundingColor}>
          {(fr * 100).toFixed(4)}%
          {frAnnual != null && (
            <span className="text-gray-400 font-normal ml-1">({frAnnual >= 0 ? '+' : ''}{frAnnual.toFixed(1)}% APR)</span>
          )}
        </span>
      ),
    });
  }
  if (okx.derivatives?.openInterestUsd != null) {
    derivStats.push({ label: 'Open Interest', value: okxFmtUsdCompact(okx.derivatives.openInterestUsd) });
  }
  if (okx.orderbookDepthUsd != null) {
    derivStats.push({ label: 'Depth ±10', value: okxFmtUsdCompact(okx.orderbookDepthUsd) });
  }
  if (derivStats.length === 0 && !range7 && !range30) return null;
  return (
    <>
      <div className="mx-5 h-px bg-gradient-to-r from-transparent via-amber-200/60 to-transparent" />
      <div className="px-5 py-3.5 space-y-2.5">
        {derivStats.length > 0 && (
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            {derivStats.map((s, si) => (
              <div key={si} className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.08em] text-gray-400 font-medium leading-none mb-1">{s.label}</p>
                <p className="text-[13px] font-semibold text-gray-800 tabular-nums truncate leading-none">{s.value}</p>
              </div>
            ))}
          </div>
        )}
        {(range7 || range30) && (
          <div className="text-[11.5px] text-gray-600 pt-1">
            {range7 && (
              <>
                <span className="text-gray-400">7D </span>
                <span className="font-medium text-gray-700 tabular-nums">{okxFmtUsdCompact(range7.low)} — {okxFmtUsdCompact(range7.high)}</span>
                <span className={`ml-1 font-medium ${range7.pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{okxFmtPctSigned(range7.pct)}</span>
              </>
            )}
            {range7 && range30 && <span className="text-gray-300 mx-2">·</span>}
            {range30 && (
              <>
                <span className="text-gray-400">30D </span>
                <span className={`font-medium ${range30.pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{okxFmtPctSigned(range30.pct)}</span>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

interface QuoteData {
  symbol: string;
  name?: string;
  market?: string;
  lang?: string;
  price?: string;
  change?: string;
  volume?: string;
  amount?: string;
  high?: string;
  low?: string;
  open?: string;
  prevClose?: string;
  marketCap?: string;
  pe?: string;
  pb?: string;
  turnover?: string;
  asOf?: string;
  // Crypto-specific fields populated from the LLM's structured asset block.
  ath?: string;               // All-time high
  supplyCirculating?: string; // Circulating supply
  supplyTotal?: string;       // Total / max supply
  fundingRate?: string;       // Perp funding rate string (fallback when live derivatives data absent)
  // Daily close-price series (oldest → newest). Drives the QuoteCard hero sparkline.
  // Populated server-side from get_daily_history when available, undefined otherwise.
  sparkline7d?: number[];
}

/**
 * Parse a "Quote Snapshot" / "标的信息" section from markdown content.
 * Returns the parsed data and the content with the section removed.
 */
export function extractQuoteSnapshot(content: string): { quote: QuoteData | null; body: string } {
  // Match heading (## or ### or **bold**) containing "Quote Snapshot" or "标的信息"
  // followed by bullet list items, up to the next heading or horizontal rule
  const pattern = /\n?(?:#{1,3}\s+|(?:\*\*))(?:[^\n]*?(?:Quote\s*Snapshot|标的信息)[^\n]*?)(?:\*\*)?\s*\n((?:\s*[-•*]\s+.+\n?)+)/i;
  const match = content.match(pattern);
  if (!match) return { quote: null, body: content };

  const lines = match[1].split('\n').filter(l => l.trim());
  const data: Record<string, string> = {};

  for (const line of lines) {
    const kv = line.replace(/^\s*[-•*]\s+/, '').trim();
    // Match **Key**: Value or **Key**：Value
    const m = kv.match(/\*\*(.+?)\*\*\s*[:：]\s*(.+)/);
    if (m) {
      data[m[1].trim().toLowerCase()] = m[2].trim();
    }
  }

  // Map known keys
  const symbol = data['symbol'] || data['证券代码'] || data['代码'] || '';
  if (!symbol) return { quote: null, body: content };

  // "24h H/L" style combined value, e.g. "$1.75 / $1.21" — split into high/low.
  const rangeCombined = data['24小时最高/最低'] || data['24h high/low'] || data['24h h/l'] || '';
  let rangeHigh: string | undefined;
  let rangeLow: string | undefined;
  if (rangeCombined) {
    const parts = rangeCombined.split(/\s*\/\s*/);
    if (parts.length === 2) {
      rangeHigh = parts[0].trim();
      rangeLow = parts[1].trim();
    }
  }

  // "Circulating / Total supply" combined value, e.g. "2.48亿 / 总供应量10亿 RAVE"
  const supplyCombined = data['流通供应量'] || data['circulating supply'] || data['circ supply'] || '';
  let supplyCirc: string | undefined;
  let supplyTot: string | undefined = data['总供应量'] || data['total supply'] || data['max supply'] || undefined;
  if (supplyCombined) {
    const m = supplyCombined.match(/^(.+?)\s*\/\s*(?:总供应量|total supply|max supply)[:：]?\s*(.+?)$/i);
    if (m) {
      supplyCirc = m[1].trim();
      supplyTot = supplyTot || m[2].trim();
    } else {
      supplyCirc = supplyCombined;
    }
  }

  // Guard against LLM hallucinating a descriptive sentence in place of a
  // numeric price (e.g. "68亿-290亿总市值区间(3月26日报214元…)"). A real
  // price string is at most ~15 chars — anything longer than 20 or packed
  // with Chinese connector words is definitely not a price. Rejecting it
  // here prevents the QuoteCard's shrink-0 price column from blowing out
  // the header and squashing the company name into a vertical strip.
  const looksLikePrice = (v?: string) => {
    if (!v) return false;
    const t = v.trim();
    if (t.length > 20) return false;
    // Must contain at least one digit
    if (!/\d/.test(t)) return false;
    // Reject if it contains obvious descriptive markers
    if (/[区间到至报价涨停跌停日月]/.test(t)) return false;
    return true;
  };

  const rawPrice = data['last price'] || data['last'] || data['最新价'] || data['现价'] || undefined;

  const quote: QuoteData = {
    symbol,
    name: data['name'] || data['股票名称'] || data['项目名称'] || data['名称'] || undefined,
    market: data['market'] || data['所属市场'] || data['市场'] || data['交易所'] || undefined,
    price: looksLikePrice(rawPrice) ? rawPrice : undefined,
    change:
      data['change (%)'] || data['change'] || data['chg%'] ||
      data['24小时涨跌幅'] || data['24h change (%)'] || data['24h change'] ||
      data['涨跌幅'] || data['涨跌'] || undefined,
    volume:
      data['volume'] || data['成交量'] || data['成交额'] ||
      data['24小时交易量'] || data['24h volume'] || data['24h vol'] || undefined,
    high: data['high'] || data['最高'] || data['24h high'] || data['24小时最高'] || rangeHigh,
    low: data['low'] || data['最低'] || data['24h low'] || data['24小时最低'] || rangeLow,
    marketCap: data['market cap'] || data['mkt cap'] || data['市值'] || undefined,
    ath:
      data['ath'] || data['all-time high'] || data['历史最高价(ath)'] ||
      data['历史最高价'] || data['历史最高'] || data['历史最高价(ath)'] || undefined,
    supplyCirculating: supplyCirc,
    supplyTotal: supplyTot,
    fundingRate:
      data['永续合约资金费率'] || data['资金费率'] ||
      data['funding rate'] || data['funding'] || undefined,
    asOf: data['as of'] || data['数据时点'] || data['报价时间'] || data['交易日'] || undefined,
  };

  // Extract name from symbol if it contains parentheses: "TSLA (Tesla, Inc.)"
  if (!quote.name) {
    const nameMatch = symbol.match(/\((.+?)\)/);
    if (nameMatch) quote.name = nameMatch[1];
  }

  // Clean symbol of parenthetical
  quote.symbol = symbol.replace(/\s*\(.+?\)/, '').trim();

  const body = content.slice(0, match.index! + (match.index! > 0 ? 0 : 0)) +
    content.slice(match.index! + match[0].length);

  return { quote, body: body.replace(/^\n{3,}/, '\n\n') };
}

/** Bilingual label map keyed by lang */
const LABELS: Record<string, Record<string, string>> = {
  zh: {
    open: '开盘', prevClose: '昨收', high: '最高', low: '最低',
    volume: '成交量', amount: '成交额', marketCap: '市值',
    pe: 'PE', pb: 'PB', turnover: '换手率',
    ath: '历史高点', supplyCirculating: '流通量', supplyTotal: '总供应', fundingRate: '资金费率',
  },
  en: {
    open: 'Open', prevClose: 'Prev Close', high: 'High', low: 'Low',
    volume: 'Volume', amount: 'Amount', marketCap: 'Mkt Cap',
    pe: 'PE', pb: 'PB', turnover: 'Turnover',
    ath: 'ATH', supplyCirculating: 'Circ Supply', supplyTotal: 'Total Supply', fundingRate: 'Funding',
  },
};

/**
 * Minimal QuoteCard — Apple Stocks aesthetic. For stocks (no historical sparkline
 * available on the backend) we render: header + hero price + 3-4 key stats row.
 *
 * okxSnap / okxNews are retained for callsite compatibility but ignored:
 * crypto data is surfaced upstream via TokenCard.
 */
export function QuoteCard({
  quote,
  okxSnap: _okxSnap,
  okxNews: _okxNews,
}: {
  quote: QuoteData;
  okxSnap?: QuoteOkxSnapshot | null;
  okxNews?: QuoteOkxNewsBundle | null;
}) {
  const lang = quote.lang || 'zh';
  const L = LABELS[lang] || LABELS.zh;
  const isZh = lang === 'zh';

  const isPositive = quote.change ? /^\+|涨/.test(quote.change) : null;
  const isNegative = quote.change ? /^-|跌/.test(quote.change) : null;
  const dirColor = isPositive ? TERM.up : isNegative ? TERM.down : TERM.muted;

  const ok = (v?: string) => v && !/^(n\/?a|--|—|0\.?0*|undefined|null)$/i.test(v.trim());

  // Build 3-4 key stats. Prioritize: market cap → volume → intraday range → PE.
  const stats: { label: string; value: string; color?: string }[] = [];
  if (ok(quote.marketCap)) stats.push({ label: L.marketCap, value: quote.marketCap! });
  if (ok(quote.volume)) stats.push({ label: L.volume, value: quote.volume! });
  if (ok(quote.high) && ok(quote.low)) {
    stats.push({ label: isZh ? '日内区间' : 'Day Range', value: `${quote.low} - ${quote.high}` });
  } else if (ok(quote.high)) {
    stats.push({ label: L.high, value: quote.high! });
  }
  if (stats.length < 4) {
    if (ok(quote.pe)) stats.push({ label: L.pe, value: quote.pe! });
    else if (ok(quote.turnover)) stats.push({ label: L.turnover, value: quote.turnover! });
    else if (ok(quote.amount)) stats.push({ label: L.amount, value: quote.amount! });
    else if (ok(quote.ath)) stats.push({ label: L.ath, value: quote.ath! });
  }
  const cols = stats.length === 4 ? 'grid-cols-4'
    : stats.length === 3 ? 'grid-cols-3'
    : stats.length === 2 ? 'grid-cols-2' : 'grid-cols-1';

  // Market badge color — keeps a hint of asset-class identity without rainbow chaos.
  const mktAccent =
    quote.market === '美股' || quote.market === 'US' ? '#2563eb'
    : quote.market === '港股' || quote.market === 'HK' ? '#d97706'
    : quote.market === 'A股' || quote.market === 'A-Share' ? '#dc2626'
    : TERM.muted;

  // Stock sparkline — daily closes from get_daily_history (server-injected).
  const hasSparkline = Array.isArray(quote.sparkline7d) && quote.sparkline7d.length >= 2;
  const sparkLen = hasSparkline ? quote.sparkline7d!.length : 0;
  // Compute trend % from first vs last close so we can color & label the chart.
  let sparkChangePct: number | null = null;
  if (hasSparkline) {
    const first = quote.sparkline7d![0];
    const last = quote.sparkline7d![sparkLen - 1];
    if (first > 0) sparkChangePct = ((last - first) / first) * 100;
  }
  const sparkUp = (sparkChangePct ?? 0) >= 0;
  const sparkColor = sparkUp ? TERM.up : TERM.down;

  return (
    <div
      className="mb-5 rounded-3xl p-5 bg-white"
      style={{
        fontFamily: TK_SANS,
        fontVariantNumeric: 'tabular-nums',
        boxShadow: '0 2px 24px -8px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)',
        border: `1px solid ${TERM.line}`,
      }}
    >
      {/* HEADER */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold tracking-tight" style={{ color: TERM.textStrong }}>
              {quote.symbol}
            </span>
            {quote.market && (
              <span
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: mktAccent }}
              >
                {quote.market}
              </span>
            )}
            {quote.name && (
              <>
                <span className="text-[11px]" style={{ color: TERM.muted }}>·</span>
                <span className="text-[12px] truncate" style={{ color: TERM.muted2 }}>{quote.name}</span>
              </>
            )}
          </div>
        </div>
        {quote.asOf && (
          <span
            className="text-[10px] uppercase tracking-wider shrink-0"
            style={{ color: TERM.muted, fontFamily: TK_MONO }}
          >
            {quote.asOf}
          </span>
        )}
      </div>

      {/* HERO PRICE + SPARKLINE (inline if sparkline exists) */}
      {(ok(quote.price) || hasSparkline) && (
        <div className="mt-4 flex items-end gap-6 flex-wrap">
          {/* PRICE COLUMN */}
          {ok(quote.price) && (
            <div className="shrink-0">
              <div
                className="font-bold leading-none"
                style={{
                  color: TERM.textStrong,
                  fontFamily: TK_MONO,
                  fontSize: '46px',
                  letterSpacing: '-0.04em',
                }}
              >
                {quote.price}
              </div>
              {ok(quote.change) && (
                <div className="mt-2 flex items-baseline gap-2.5 flex-wrap">
                  <span
                    className="text-[14px] font-semibold"
                    style={{ color: dirColor, fontFamily: TK_MONO }}
                  >
                    {isPositive ? '▲' : isNegative ? '▼' : ''} {quote.change}
                  </span>
                  <span
                    className="text-[10.5px] uppercase tracking-wider"
                    style={{ color: TERM.muted, fontFamily: TK_MONO }}
                  >
                    {isZh ? '今日' : 'Today'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* SPARKLINE — daily closes from get_daily_history */}
          {hasSparkline && (
            <div className="flex-1 min-w-[220px]">
              <InteractiveSparkline
                prices={quote.sparkline7d!}
                isUp={sparkUp}
                change7dPct={sparkChangePct ?? undefined}
                label=""
                isZh={isZh}
                hideBottomLabel
              />
              <div
                className="mt-1.5 flex items-baseline justify-between text-[9.5px] uppercase tracking-wider"
                style={{ color: TERM.muted, fontFamily: TK_MONO }}
              >
                <span>{isZh ? `${sparkLen} 日` : `${sparkLen}D`}</span>
                <span>
                  {isZh ? '至今' : 'Today'}
                  {sparkChangePct != null && (
                    <span className="ml-1.5 font-semibold" style={{ color: sparkColor }}>
                      {sparkChangePct >= 0 ? '+' : ''}{sparkChangePct.toFixed(2)}%
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STATS ROW */}
      {stats.length > 0 && (
        <div
          className={`mt-4 pt-3 grid ${cols} gap-3`}
          style={{ borderTop: `1px solid ${TERM.line}` }}
        >
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <div
                className="text-[9.5px] uppercase tracking-[0.1em] font-semibold"
                style={{ color: TERM.muted }}
              >
                {s.label}
              </div>
              <div
                className="text-[17px] font-bold leading-none mt-0.5 truncate"
                style={{ color: s.color || TERM.textStrong, fontFamily: TK_MONO }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Token Snapshot Card (crypto) ───────────────────────────────

export interface TokenSnapshotData {
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
    /** Optional 7d price series (hourly or sub-hourly), oldest → newest. Drives the hero sparkline. */
    sparkline7d?: number[];
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
}

function fmtUsdCompact(v?: number): string | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtCount(v?: number): string | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

function fmtPriceUsd(v?: number): string | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  const a = Math.abs(v);
  if (a >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (a >= 1) return `$${v.toFixed(3)}`;
  if (a >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toPrecision(3)}`;
}

function fmtPct(v?: number): string | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function pctColor(v?: number): string {
  if (v == null) return 'text-gray-500';
  if (v > 0) return 'text-emerald-600';
  if (v < 0) return 'text-red-500';
  return 'text-gray-500';
}

/**
 * Builds an SVG path for a 7d sparkline. Returns null if there are < 2 points.
 * Padding keeps endpoints inside the viewbox so the end-dot isn't clipped.
 */
function buildSparkPath(
  prices: number[],
  w: number,
  h: number,
): { line: string; area: string; isUp: boolean; lastX: number; lastY: number } | null {
  if (!Array.isArray(prices) || prices.length < 2) return null;
  let min = Infinity, max = -Infinity;
  for (const p of prices) {
    if (!Number.isFinite(p)) continue;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const range = max - min || 1;
  const step = w / (prices.length - 1);
  const padTop = 4, padBottom = 2;
  const usableH = h - padTop - padBottom;
  const pts: Array<[number, number]> = prices.map((p, i) => {
    const x = i * step;
    const y = padTop + (1 - (p - min) / range) * usableH;
    return [x, y];
  });
  const line = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`).join(' ');
  const last = pts[pts.length - 1];
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const isUp = prices[prices.length - 1] >= prices[0];
  return { line, area, isUp, lastX: last[0], lastY: last[1] };
}

const TK_MONO = "ui-monospace, 'JetBrains Mono', SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

/**
 * Terminal palette — used by TokenCard / QuoteCard's Bloomberg-style theme.
 * Hex values are inlined via `style={{ color: TERM.x }}` since Tailwind arbitrary
 * values get verbose for ~12 frequently-reused tones.
 */
/**
 * Minimal palette — Apple Stocks-inspired clean light card.
 * Direction colors via emerald/rose; no brand accent; ultra-subtle dividers.
 */
const TERM = {
  bg1: '#ffffff',
  bg2: '#fafbfc',
  bg3: '#f3f4f6',
  line: '#f1f5f9',        // slate-100 — barely visible divider
  line2: '#e2e8f0',
  primary: '#0f172a',
  text: '#0f172a',
  textStrong: '#0f172a',
  muted: '#9ca3af',       // gray-400 — labels
  muted2: '#64748b',      // gray-500 — secondary
  up: '#059669',
  upBg: 'rgba(5,150,105,.12)',
  upWash: 'rgba(5,150,105,.04)',
  down: '#dc2626',
  downBg: 'rgba(220,38,38,.12)',
  downWash: 'rgba(220,38,38,.04)',
  amber: '#d97706',
} as const;

/** Sans font stack for labels/headers (paired with TK_MONO for numbers). */
const TK_SANS = "Inter, 'Fira Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ─── Social link icons (12px SVG, currentColor) ─────────────────
const TWITTER_ICON = (
  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
);
const GITHUB_ICON = (
  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.1.79-.25.79-.56 0-.27-.01-1.16-.02-2.1-3.2.7-3.88-1.36-3.88-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 015.78 0c2.21-1.5 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56C20.21 21.39 23.5 17.07 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>
);
const LINK_ICON = (
  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 7h3a5 5 0 010 10h-3M10 17H7A5 5 0 017 7h3M8 12h8"/></svg>
);
const DOC_ICON = (
  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M9 13h6 M9 17h6 M9 9h2"/></svg>
);
const TG_ICON = (
  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.7L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>
);
const REDDIT_ICON = (
  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor"><path d="M22 12c0-1.1-.9-2-2-2-.5 0-1 .2-1.4.6C16.9 9.4 14.5 8.6 12 8.5l1-4.5 3.1.7c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5S18.4 3 17.6 3c-.6 0-1 .3-1.3.8l-3.5-.8c-.2 0-.4.1-.4.3l-1.1 5.1C8.7 8.6 6.3 9.4 4.4 10.6 4 10.2 3.5 10 3 10c-1.1 0-2 .9-2 2 0 .8.5 1.5 1.2 1.8-.1.4-.1.7-.1 1.1 0 3.6 4 6.6 9 6.6s9-3 9-6.6c0-.4 0-.8-.1-1.1.7-.3 1.2-1 1.2-1.8M7 13.5c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5S9.3 15 8.5 15 7 14.3 7 13.5m8.5 4.6c-1 .6-2.3.9-3.5.9s-2.5-.3-3.5-.9c-.2-.1-.2-.4-.1-.5.1-.2.4-.2.5-.1.8.5 1.9.7 3.1.7s2.3-.2 3.1-.7c.2-.1.4-.1.5.1.1.1.1.4-.1.5m.1-3.1c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z"/></svg>
);

/**
 * Maps CoinGecko exchange names to their canonical domain so we can fetch favicons.
 * Lookup is case-insensitive and tolerant of suffixes (e.g. "Coinbase Exchange").
 */
const EXCHANGE_DOMAINS: Record<string, string> = {
  binance: 'binance.com', 'binance us': 'binance.us',
  coinbase: 'coinbase.com', 'coinbase exchange': 'coinbase.com', 'coinbase pro': 'pro.coinbase.com',
  kraken: 'kraken.com', okx: 'okx.com', bybit: 'bybit.com', kucoin: 'kucoin.com',
  bitfinex: 'bitfinex.com', bitstamp: 'bitstamp.net', gemini: 'gemini.com',
  upbit: 'upbit.com', htx: 'htx.com', huobi: 'htx.com',
  'gate.io': 'gate.io', gate: 'gate.io',
  mexc: 'mexc.com', 'mexc global': 'mexc.com', bitget: 'bitget.com',
  'crypto.com': 'crypto.com', 'crypto.com exchange': 'crypto.com',
  bingx: 'bingx.com', bithumb: 'bithumb.com', whitebit: 'whitebit.com', phemex: 'phemex.com',
  lbank: 'lbank.com', 'xt.com': 'xt.com', xt: 'xt.com',
  btse: 'btse.com', bitrue: 'bitrue.com', hotcoin: 'hotcoin.com', websea: 'websea.com',
  korbit: 'korbit.co.kr', poloniex: 'poloniex.com', bittrex: 'bittrex.com',
  ascendex: 'ascendex.com', bitmart: 'bitmart.com', digifinex: 'digifinex.com',
  pionex: 'pionex.com', btcc: 'btcc.com', bibox: 'bibox.com',
  probit: 'probit.com', 'probit global': 'probit.com',
};

/** Returns a favicon URL for an exchange name, or null if unknown. */
function exchangeFaviconUrl(name: string): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  const domain = EXCHANGE_DOMAINS[key];
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : null;
}

/** Returns a price change diff in USD (price * change% / 100) — used for "▲ +$0.0379" line. */
function priceDelta(priceUsd?: number, changePct?: number): string | null {
  if (priceUsd == null || changePct == null) return null;
  const delta = priceUsd * (changePct / 100);
  const abs = Math.abs(delta);
  const sign = delta >= 0 ? '+' : '-';
  if (abs >= 1000) return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (abs >= 1) return `${sign}$${abs.toFixed(3)}`;
  if (abs >= 0.0001) return `${sign}$${abs.toFixed(4)}`;
  return `${sign}$${abs.toPrecision(2)}`;
}

/**
 * Interactive 7d sparkline with hover crosshair + tooltip.
 * Mouse moves over the SVG → snap to nearest index → show vertical guide,
 * data-point dot, and a tooltip with price + relative time + % vs 7d ago.
 *
 * CoinGecko's `sparkline_7d.price` is hourly (168 points / 7d), so each index
 * step ≈ 1 hour. We label by hours/days back from "now".
 */
function InteractiveSparkline({
  prices,
  isUp,
  change7dPct,
  label,
  isZh,
  hideBottomLabel,
}: {
  prices: number[];
  isUp: boolean;
  change7dPct?: number;
  label: string;
  isZh: boolean;
  /** When true, omit the bottom "label · %" row (the caller already shows it externally). */
  hideBottomLabel?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gradIdRef = useRef(`sparkGrad-${Math.random().toString(36).slice(2, 8)}`);

  const W = 220;
  const H = 64;
  const spark = buildSparkPath(prices, W, H);
  if (!spark) return null;

  const color = isUp ? '#10b981' : '#f43f5e';
  const n = prices.length;
  const step = n > 1 ? W / (n - 1) : 0;

  let hoverX = 0;
  let hoverY = 0;
  let hoverPrice = 0;
  let hoverChangePct = 0;
  if (hover != null) {
    hoverX = hover * step;
    let min = Infinity, max = -Infinity;
    for (const p of prices) {
      if (!Number.isFinite(p)) continue;
      if (p < min) min = p;
      if (p > max) max = p;
    }
    const range = max - min || 1;
    const padTop = 4;
    const padBottom = 2;
    const usableH = H - padTop - padBottom;
    hoverY = padTop + (1 - (prices[hover] - min) / range) * usableH;
    hoverPrice = prices[hover];
    const first = prices[0] || 0;
    hoverChangePct = first > 0 ? ((hoverPrice - first) / first) * 100 : 0;
  }

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el || n < 2) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const idx = Math.round((x / r.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  };

  // hoursAgo = n-1 - idx (last index is "now"). For 168-point series → hourly.
  const hoursAgo = hover != null ? n - 1 - hover : 0;
  let agoLabel = '';
  if (hover != null) {
    if (hoursAgo === 0) agoLabel = isZh ? '当前' : 'now';
    else if (hoursAgo < 24) agoLabel = isZh ? `${hoursAgo} 小时前` : `${hoursAgo}h ago`;
    else {
      const d = Math.floor(hoursAgo / 24);
      const h = hoursAgo % 24;
      agoLabel = isZh ? `${d} 天${h ? ` ${h} 小时` : ''}前` : `${d}d${h ? ` ${h}h` : ''} ago`;
    }
  }

  const tooltipLeftPct = hover != null ? Math.max(10, Math.min(90, (hoverX / W) * 100)) : 50;

  // Convert SVG viewBox coordinates → container percentages.
  // We render the data dots as HTML overlays (not SVG circles) so they stay
  // perfect circles regardless of the horizontal SVG stretching from preserveAspectRatio="none".
  const endXPct = ((spark.lastX - 1) / W) * 100;
  const endYPct = (spark.lastY / H) * 100;
  const hoverXPct = hover != null ? (hoverX / W) * 100 : 0;
  const hoverYPct = hover != null ? (hoverY / H) * 100 : 0;

  return (
    <div ref={containerRef} className="relative select-none">
      {/* Tooltip — absolute over the spark area, fades in on hover */}
      {hover != null && (
        <div
          className="absolute z-20 -translate-x-1/2 bottom-full mb-2 px-2.5 py-1.5 bg-gray-900/95 text-white rounded-lg shadow-lg pointer-events-none ring-1 ring-black/10 whitespace-nowrap"
          style={{ left: `${tooltipLeftPct}%` }}
        >
          <div className="text-[12.5px] font-bold tabular-nums leading-none" style={{ fontFamily: TK_MONO }}>
            {fmtPriceUsd(hoverPrice)}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] text-gray-400">{agoLabel}</span>
            <span className={`text-[9.5px] font-semibold tabular-nums ${hoverChangePct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`} style={{ fontFamily: TK_MONO }}>
              {hoverChangePct >= 0 ? '+' : ''}{hoverChangePct.toFixed(2)}%
            </span>
          </div>
        </div>
      )}

      {/* Chart area — wraps SVG + HTML dot overlays. Sized at h-14 (56px) for a tighter card. */}
      <div
        className="relative h-14 cursor-crosshair"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 w-full h-full block overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradIdRef.current} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={spark.area} fill={`url(#${gradIdRef.current})`} />
          <path d={spark.line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          {/* Crosshair (vertical line — not affected by horizontal stretch). */}
          {hover != null && (
            <line x1={hoverX} x2={hoverX} y1="0" y2={H} stroke="#9ca3af" strokeWidth="0.6" strokeDasharray="2 2" />
          )}
        </svg>

        {/* End-of-series dot (HTML overlay → perfect circle) */}
        {hover == null && (
          <div
            className="absolute pointer-events-none rounded-full"
            style={{
              left: `${endXPct}%`,
              top: `${endYPct}%`,
              transform: 'translate(-50%, -50%)',
              width: 7,
              height: 7,
              background: color,
              border: '1.5px solid #fff',
              boxShadow: '0 0 0 0.5px rgba(0,0,0,0.06)',
            }}
          />
        )}

        {/* Hover data dot (HTML overlay → perfect circle) */}
        {hover != null && (
          <div
            className="absolute pointer-events-none rounded-full"
            style={{
              left: `${hoverXPct}%`,
              top: `${hoverYPct}%`,
              transform: 'translate(-50%, -50%)',
              width: 9,
              height: 9,
              background: '#fff',
              border: `2px solid ${color}`,
              boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            }}
          />
        )}
      </div>

      {!hideBottomLabel && (
        <div className="flex justify-between text-[9.5px] uppercase tracking-wider text-gray-400 mt-0.5" style={{ fontFamily: TK_MONO }}>
          <span>{label}</span>
          {change7dPct != null && (
            <span className={pctColor(change7dPct)}>{fmtPct(change7dPct)}</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Renders a crypto token card from a TokenSnapshot — Hero + Sparkline + Bento. */
/** Terminal-style TokenCard — Bloomberg/Hyperliquid aesthetic. */
/**
 * TokenCard — minimal "Apple Stocks" aesthetic.
 * Strips to: header, huge hero price, big sparkline, 4 key stats.
 * Deliberately omits Returns / Supply / ATH detail / Exchanges / Community
 * footer — those are noise for an at-a-glance crypto card.
 */
export function TokenCard({ token, lang }: { token: TokenSnapshotData; lang?: string }) {
  const isZh = (lang || 'zh') === 'zh';
  const L = isZh
    ? { today: '今日', daysAgo: '7 天前', now: '现在', mcap: '市值', vol24: '24H 量', d30: '30D', ath: 'ATH' }
    : { today: 'Today', daysAgo: '7 days ago', now: 'now', mcap: 'Mkt Cap', vol24: '24H Vol', d30: '30D', ath: 'ATH' };

  const m = token.market;

  const ch24 = m.change24hPct;
  const isUp = ch24 != null && ch24 > 0;
  const isDown = ch24 != null && ch24 < 0;
  const dirColor = isUp ? TERM.up : isDown ? TERM.down : TERM.muted;

  const hasSparkline = Array.isArray(m.sparkline7d) && m.sparkline7d.length >= 2;
  const ch7d = m.change7dPct;
  const ch7Color = (ch7d ?? 0) >= 0 ? TERM.up : TERM.down;

  const c = token.community;
  const d = token.developer;
  const topEx = (token.topExchanges || []).slice(0, 6);
  const totalExVol = topEx.reduce((s, e) => s + (e.volumeUsd || 0), 0);

  return (
    <div
      className="mb-5 rounded-3xl p-5 bg-white"
      style={{
        fontFamily: TK_SANS,
        fontVariantNumeric: 'tabular-nums',
        boxShadow: '0 2px 24px -8px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)',
        border: `1px solid ${TERM.line}`,
      }}
    >
      {/* HEADER — identity (left) + community stats & social icons (right).
          Mirror layout: 2-line left (symbol/name + categories), 2-line right (stats + social). */}
      {(() => {
        const sentUp = c.sentimentUpPct;
        const sentDown = c.sentimentDownPct;
        const hasSent = sentUp != null || sentDown != null;
        const sUp = sentUp ?? 0;
        const sDown = sentDown ?? 0;
        const sTotal = sUp + sDown || 100;
        const sUpW = (sUp / sTotal) * 100;
        const sDownW = (sDown / sTotal) * 100;

        const hasCommunity =
          c.telegramUsers != null || d.githubStars != null || d.commits4w != null || hasSent;
        const hasSocial =
          token.homepage || token.whitepaper || token.twitter || token.github || token.telegram || token.reddit;

        return (
          <div className="flex items-start gap-3 flex-wrap">
            {token.imageUrl ? (
              <img
                src={token.imageUrl}
                alt=""
                className="w-9 h-9 rounded-full shrink-0"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {(token.symbol || '?').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-semibold" style={{ color: TERM.textStrong }}>{token.symbol}</span>
                {token.name && (
                  <>
                    <span className="text-[11px]" style={{ color: TERM.muted }}>·</span>
                    <span className="text-[12px] truncate" style={{ color: TERM.muted2 }}>{token.name}</span>
                  </>
                )}
              </div>
              {(token.categories || []).length > 0 && (
                <div className="text-[10.5px] mt-0.5 truncate" style={{ color: TERM.muted }}>
                  {(token.categories || []).slice(0, 3).map((cat) => cat.replace(/\s*\(.*\)$/, '').replace(/\s+Ecosystem$/i, '')).join(' · ')}
                </div>
              )}
            </div>

            {/* Right column — community stats (row 1) + social icons (row 2) + rank */}
            {(hasCommunity || hasSocial || token.rank != null) && (
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap justify-end text-[10.5px]" style={{ color: TERM.muted2 }}>
                  {c.telegramUsers != null && (
                    <span className="flex items-center gap-1">
                      <span className="uppercase text-[9.5px] tracking-wider" style={{ color: TERM.muted }}>TG</span>
                      <span className="font-semibold" style={{ color: TERM.textStrong, fontFamily: TK_MONO }}>{fmtCount(c.telegramUsers)}</span>
                    </span>
                  )}
                  {d.githubStars != null && (
                    <span className="flex items-center gap-1">
                      <span className="uppercase text-[9.5px] tracking-wider" style={{ color: TERM.muted }}>★</span>
                      <span className="font-semibold" style={{ color: TERM.textStrong, fontFamily: TK_MONO }}>{fmtCount(d.githubStars)}</span>
                    </span>
                  )}
                  {d.commits4w != null && (
                    <span className="flex items-center gap-1" title={d.commits4w === 0 ? (isZh ? '4 周无提交' : '4w no commits') : undefined}>
                      <span className="uppercase text-[9.5px] tracking-wider" style={{ color: TERM.muted }}>4W</span>
                      <span className="font-semibold" style={{ color: d.commits4w === 0 ? TERM.down : TERM.textStrong, fontFamily: TK_MONO }}>{d.commits4w}{d.commits4w === 0 ? ' ⚠' : ''}</span>
                    </span>
                  )}
                  {hasSent && (
                    <span className="flex items-center gap-1.5" title={`bullish ${sUp.toFixed(0)}% · bearish ${sDown.toFixed(0)}%`}>
                      <span className="uppercase text-[9.5px] tracking-wider" style={{ color: TERM.muted }}>{isZh ? '情绪' : 'SENT'}</span>
                      <span className="font-semibold" style={{ color: TERM.up, fontFamily: TK_MONO }}>{sUp.toFixed(0)}</span>
                      <span className="relative h-1 w-[48px] rounded-full overflow-hidden flex" style={{ background: TERM.line }}>
                        <span className="h-full" style={{ width: `${sUpW}%`, background: TERM.up }} />
                        <span className="h-full" style={{ width: `${sDownW}%`, background: TERM.down }} />
                      </span>
                      <span className="font-semibold" style={{ color: TERM.down, fontFamily: TK_MONO }}>{sDown.toFixed(0)}</span>
                    </span>
                  )}
                  {token.rank != null && (
                    <span className="uppercase text-[10px] tracking-wider" style={{ color: TERM.muted, fontFamily: TK_MONO }}>
                      #{token.rank}
                    </span>
                  )}
                </div>

                {hasSocial && (
                  <div className="flex items-center gap-0.5">
                    {token.homepage && (
                      <a
                        href={token.homepage}
                        target="_blank"
                        rel="noreferrer"
                        title={isZh ? '官网' : 'Website'}
                        aria-label="Website"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-gray-100 transition-colors"
                        style={{ color: TERM.muted2 }}
                      >
                        {LINK_ICON}
                      </a>
                    )}
                    {token.whitepaper && (
                      <a
                        href={token.whitepaper}
                        target="_blank"
                        rel="noreferrer"
                        title={isZh ? '白皮书' : 'Whitepaper'}
                        aria-label="Whitepaper"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-gray-100 transition-colors"
                        style={{ color: TERM.muted2 }}
                      >
                        {DOC_ICON}
                      </a>
                    )}
                    {token.twitter && (
                      <a
                        href={`https://x.com/${token.twitter}`}
                        target="_blank"
                        rel="noreferrer"
                        title={`@${token.twitter}`}
                        aria-label="Twitter / X"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-gray-100 transition-colors"
                        style={{ color: TERM.muted2 }}
                      >
                        {TWITTER_ICON}
                      </a>
                    )}
                    {token.github && (
                      <a
                        href={token.github}
                        target="_blank"
                        rel="noreferrer"
                        title="GitHub"
                        aria-label="GitHub"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-gray-100 transition-colors"
                        style={{ color: TERM.muted2 }}
                      >
                        {GITHUB_ICON}
                      </a>
                    )}
                    {token.telegram && (
                      <a
                        href={`https://t.me/${token.telegram}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Telegram"
                        aria-label="Telegram"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-gray-100 transition-colors"
                        style={{ color: TERM.muted2 }}
                      >
                        {TG_ICON}
                      </a>
                    )}
                    {token.reddit && (
                      <a
                        href={token.reddit}
                        target="_blank"
                        rel="noreferrer"
                        title="Reddit"
                        aria-label="Reddit"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-gray-100 transition-colors"
                        style={{ color: TERM.muted2 }}
                      >
                        {REDDIT_ICON}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* HERO PRICE + SPARKLINE — same row to maximize vertical density */}
      {(m.priceUsd != null || hasSparkline) && (() => {
        const now = new Date();
        // 8 anchor marks at 0/7, 1/7, ..., 7/7 — one per day boundary
        const days: Date[] = [];
        for (let i = 7; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          days.push(d);
        }
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const fmtFull = (d: Date) => isZh
          ? `${d.getMonth() + 1}/${d.getDate()}`
          : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
        return (
          <div className="mt-4 flex items-end gap-6 flex-wrap">
            {/* PRICE COLUMN */}
            {m.priceUsd != null && (
              <div className="shrink-0">
                <div
                  className="font-bold leading-none"
                  style={{
                    color: TERM.textStrong,
                    fontFamily: TK_MONO,
                    fontSize: '50px',
                    letterSpacing: '-0.04em',
                  }}
                >
                  {fmtPriceUsd(m.priceUsd)}
                </div>
                {ch24 != null && (
                  <div className="mt-2 flex items-baseline gap-2.5 flex-wrap">
                    <span
                      className="text-[14px] font-semibold"
                      style={{ color: dirColor, fontFamily: TK_MONO }}
                    >
                      {isUp ? '▲' : isDown ? '▼' : ''}{' '}
                      {priceDelta(m.priceUsd, ch24)?.replace(/^[+-]/, '')}
                      <span className="ml-1.5 opacity-80">
                        ({ch24 >= 0 ? '+' : ''}{ch24.toFixed(2)}%)
                      </span>
                    </span>
                    <span
                      className="text-[10.5px] uppercase tracking-wider"
                      style={{ color: TERM.muted, fontFamily: TK_MONO }}
                    >
                      {L.today}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* SPARKLINE COLUMN — fills remaining width */}
            {hasSparkline && (
              <div className="flex-1 min-w-[220px]">
                <InteractiveSparkline
                  prices={m.sparkline7d!}
                  isUp={(ch7d ?? 0) >= 0}
                  change7dPct={ch7d}
                  label={L.daysAgo}
                  isZh={isZh}
                  hideBottomLabel
                />
                <div
                  className="mt-1.5 relative h-3 text-[9.5px] uppercase tracking-wider"
                  style={{ color: TERM.muted, fontFamily: TK_MONO }}
                >
                  {days.map((d, i) => {
                    const pct = (i / 7) * 100;
                    const isFirst = i === 0;
                    const isLast = i === days.length - 1;
                    const transform = isFirst
                      ? 'translateX(0)'
                      : isLast
                        ? 'translateX(-100%)'
                        : 'translateX(-50%)';
                    const label = isFirst || isLast ? fmtFull(d) : String(d.getDate());
                    return (
                      <span
                        key={i}
                        className="absolute whitespace-nowrap"
                        style={{ left: `${pct}%`, transform }}
                      >
                        {label}
                        {isLast && ch7d != null && (
                          <span className="ml-1.5 font-semibold" style={{ color: ch7Color }}>
                            {ch7d >= 0 ? '+' : ''}{ch7d.toFixed(2)}%
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 4-STAT FOOTER ROW — labels uppercase tiny, values bold mono */}
      {(() => {
        const stats: { label: string; value: string; color?: string }[] = [];
        if (m.marketCapUsd != null) stats.push({ label: L.mcap, value: fmtUsdCompact(m.marketCapUsd) || '—' });
        if (m.volume24hUsd != null) stats.push({ label: L.vol24, value: fmtUsdCompact(m.volume24hUsd) || '—' });
        if (m.change30dPct != null) stats.push({
          label: L.d30,
          value: `${m.change30dPct >= 0 ? '+' : ''}${m.change30dPct.toFixed(0)}%`,
          color: m.change30dPct >= 0 ? TERM.up : TERM.down,
        });
        if (m.athUsd != null) stats.push({ label: L.ath, value: fmtPriceUsd(m.athUsd) || '—' });
        if (stats.length === 0) return null;
        const cols = stats.length === 4 ? 'grid-cols-4' : stats.length === 3 ? 'grid-cols-3' : stats.length === 2 ? 'grid-cols-2' : 'grid-cols-1';
        return (
          <div
            className={`mt-4 pt-3 grid ${cols} gap-3`}
            style={{ borderTop: `1px solid ${TERM.line}` }}
          >
            {stats.map((s) => (
              <div key={s.label} className="min-w-0">
                <div
                  className="text-[9.5px] uppercase tracking-[0.1em] font-semibold"
                  style={{ color: TERM.muted }}
                >
                  {s.label}
                </div>
                <div
                  className="text-[17px] font-bold leading-none mt-0.5 truncate"
                  style={{ color: s.color || TERM.textStrong, fontFamily: TK_MONO }}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* EXCHANGES TABLE — responsive flex layout. On mobile the PAIR column
          collapses (pair shown inline under venue name) so VENUE/VOL/SHARE
          always fit in <360px. */}
      {topEx.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${TERM.line}` }}>
          <div
            className="text-[9.5px] uppercase tracking-[0.1em] font-semibold mb-1.5"
            style={{ color: TERM.muted }}
          >
            {isZh ? '主要交易所' : 'Top Exchanges'}
          </div>
          <div
            className="flex items-center gap-3 px-1 pb-1 text-[9.5px] uppercase tracking-wider"
            style={{ color: TERM.muted, borderBottom: `1px solid ${TERM.line}` }}
          >
            <span className="w-3.5 shrink-0" />
            <span className="flex-1 min-w-0">{isZh ? '交易所' : 'Venue'}</span>
            <span className="hidden sm:block w-[120px] shrink-0">{isZh ? '交易对' : 'Pair'}</span>
            <span className="w-[80px] sm:w-[90px] shrink-0 text-right">{isZh ? '24H 量' : 'Vol 24H'}</span>
            <span className="w-14 shrink-0 text-right">{isZh ? '占比' : 'Share'}</span>
          </div>
          {topEx.map((ex, i) => {
            const sharePct = ex.volumeUsd != null && totalExVol > 0 ? (ex.volumeUsd / totalExVol) * 100 : null;
            const shareColor = sharePct == null
              ? TERM.muted
              : sharePct >= 25 ? TERM.up : sharePct >= 10 ? TERM.amber : TERM.muted2;
            const logoUrl = exchangeFaviconUrl(ex.name);
            return (
              <div
                key={`${ex.name}-${ex.pair}-${i}`}
                className="flex items-center gap-3 px-1 py-1 text-[12px] hover:bg-gray-50 transition-colors"
                style={{ borderBottom: i < topEx.length - 1 ? `1px solid ${TERM.line}` : undefined }}
                title={ex.spreadPct != null ? `spread ${ex.spreadPct.toFixed(3)}%` : undefined}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt=""
                    aria-hidden
                    className="w-3.5 h-3.5 rounded-sm shrink-0"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
                  <span className="truncate font-medium" style={{ color: TERM.textStrong }}>{ex.name}</span>
                  {/* Pair shown inline-under-venue on mobile only */}
                  <span
                    className="text-[10.5px] sm:hidden truncate"
                    style={{ color: TERM.muted, fontFamily: TK_MONO }}
                  >
                    {ex.pair}
                  </span>
                </div>
                <span
                  className="hidden sm:block w-[120px] shrink-0 truncate"
                  style={{ color: TERM.muted, fontFamily: TK_MONO }}
                >
                  {ex.pair}
                </span>
                <span
                  className="w-[80px] sm:w-[90px] shrink-0 text-right font-semibold"
                  style={{ color: TERM.textStrong, fontFamily: TK_MONO }}
                >
                  {ex.volumeUsd != null ? fmtUsdCompact(ex.volumeUsd) : '—'}
                </span>
                <span
                  className="w-14 shrink-0 text-right font-semibold"
                  style={{ color: shareColor, fontFamily: TK_MONO }}
                >
                  {sharePct != null ? `${sharePct.toFixed(1)}%` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

// ─── Markdown Rendering ─────────────────────────────────────────

/** Citation tag style — small inline badge with source name */
const CITE_TAG =
  'group/cite relative inline-flex items-center align-middle gap-1 mx-0.5 px-1.5 py-[1px] rounded-full text-[10.5px] font-medium leading-tight ' +
  'text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200/60 ' +
  'transition-all cursor-pointer no-underline hover:no-underline';

function safeHttpUrl(href: string): string | null {
  const t = href.trim();
  if (/^https:\/\//i.test(t)) return t;
  if (/^http:\/\//i.test(t)) return t;
  return null;
}

/** Short label for bare URLs: hostname or truncated path */
function urlChipLabel(href: string): string {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./i, '');
    if (host.length > 22) return host.slice(0, 20) + '…';
    return host;
  } catch {
    return 'link';
  }
}

/** Extract domain for tooltip */
function urlDomain(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function isLowValueSourceTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return true;
  if (t.length <= 2) return true;
  if (/^news\s*&\s*disclaimer$/.test(t)) return true;
  if (/^disclaimer$/.test(t)) return true;
  if (/^untitled$/.test(t)) return true;
  return false;
}

function normalizeCitationLabel(label: string, href: string): string {
  const domain = urlDomain(href).toLowerCase();
  const cleaned = decodeHtmlEntities(label || '').trim();
  if (/(^|\.)(x\.com|t\.co|twitter\.com)$/.test(domain)) {
    if (!cleaned || cleaned.length <= 2 || /^t$/i.test(cleaned) || /^x$/i.test(cleaned)) {
      return 'X';
    }
  }
  if (!cleaned || cleaned === href || cleaned.length <= 1) {
    return urlChipLabel(href);
  }
  return cleaned;
}

function InlineCitation({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const sources = useContext(SourcesContext);
  const safe = safeHttpUrl(href);
  if (!safe) return <span className="text-gray-600">{label}</span>;
  const show = normalizeCitationLabel(label, safe);
  const domain = urlDomain(safe);

  // Look up source from context for rich tooltip
  const matchedSource = sources.find(s => {
    if (s.url && s.url === safe) return true;
    if (s.url && domain && s.domain && domain.includes(s.domain)) return true;
    if (s.domain && domain && s.domain === domain) return true;
    const labelLower = label.toLowerCase().trim();
    if (s.title && s.title.toLowerCase() === labelLower) return true;
    if (s.domain && s.domain.toLowerCase().replace(/\.\w+$/, '') === labelLower.replace(/\s+/g, '')) return true;
    return false;
  });

  const snippetText = matchedSource?.snippet ? decodeHtmlEntities(matchedSource.snippet) : undefined;
  const decodedTitle = decodeHtmlEntities(matchedSource?.title || '');
  const titleText = !isLowValueSourceTitle(decodedTitle) ? decodedTitle : show;

  // The tooltip is rendered via a portal into document.body so that ancestor
  // containers with `overflow: hidden` (table cells, scroll panes, etc.) can
  // never clip it. We compute fixed coordinates on each hover so the bubble
  // floats above the citation chip regardless of where it lives in the tree.
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);
  const TIP_WIDTH = 260;
  const TIP_GAP = 8;
  const showTip = () => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Anchor the tooltip's bottom-right at the chip's top-right by default.
    let left = r.right - TIP_WIDTH;
    // Keep it on screen with a small margin if the chip lives near the edge.
    const margin = 8;
    if (left < margin) left = margin;
    if (left + TIP_WIDTH > window.innerWidth - margin) {
      left = window.innerWidth - TIP_WIDTH - margin;
    }
    const top = r.top - TIP_GAP;
    setTip({ top, left });
  };
  const hideTip = () => setTip(null);

  return (
    <>
      <a
        ref={anchorRef}
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        className={CITE_TAG}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
      >
        <svg className="w-2.5 h-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <span className="truncate max-w-[8rem]">{show}</span>
      </a>
      {tip && typeof document !== 'undefined' && createPortal(
        <div
          className="pointer-events-none fixed z-[1000] w-[260px] px-3 py-2.5 rounded-xl bg-gray-900 text-white text-[11px] leading-snug whitespace-normal shadow-xl"
          style={{ top: tip.top, left: tip.left, transform: 'translateY(-100%)' }}
        >
          <span className="flex items-center gap-1.5">
            <img
              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
              alt=""
              className="w-3.5 h-3.5 rounded-sm shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="text-[10px] text-gray-400 truncate">{domain}</span>
          </span>
          <span className="block font-semibold text-[11.5px] mt-1.5 line-clamp-2 leading-snug">
            {titleText}
          </span>
          {snippetText && (
            <span className="block text-gray-400 text-[10.5px] mt-1 line-clamp-3 leading-relaxed">
              {snippetText}
            </span>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Strips [label](url) citation links from text, keeping just the trailing citations list.
 * Returns cleaned text (with in-place citations removed) + ordered list for trailing badges.
 */
function extractTrailingCitations(text: string): { cleanText: string; citations: Array<{ label: string; url: string }> } {
  const citations: Array<{ label: string; url: string }> = [];
  // Skip citations whose grammatical role would be destroyed by removal.
  // In Chinese, "[Source]的分析指出" means "[Source]'s analysis indicates" —
  // stripping the citation leaves orphan "的分析指出" with no subject. Same
  // for clauses where the citation is followed by a colon (e.g.
  // "[Issue #389]：correspondent..." in a bullet). Detect both patterns and
  // leave those citations inline (parseLine will render them as chips
  // in-place) so the prose stays coherent.
  const KEEP_AFTER = /^[的：:]/;
  const cleanText = text
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_match, label, rawUrl, offset) => {
      const url = (rawUrl || '').trim();
      // Broken citation — URL was missing/null/undefined/empty (LLM template
      // interpolation failure where the source link wasn't substituted in).
      // Don't preserve the raw markdown (`[Foo](undefined)` would otherwise
      // be shown literally to the user); fall back to just the bare label.
      if (!safeHttpUrl(url)) return label || '';
      // Look at what follows the citation — if it's a Chinese particle or
      // an orphan-leaving punctuation, keep the citation inline.
      const after = text.slice(offset + _match.length);
      if (KEEP_AFTER.test(after)) return _match;
      citations.push({ label: label.trim() || urlChipLabel(url), url });
      return '';
    })
    // Strip orphan leading punctuation/particles left over from citations
    // that lived at the start of a clause but were moved to the trailing
    // badge row. Covers CJK + ASCII commas, colons, semicolons, and the
    // Chinese enumeration mark "、". Applied per logical line so bullet
    // markers (•/-/*) up front are preserved.
    .split('\n')
    .map(line => line.replace(/^([\s>*\-•·]*)[，,：:；;、]+\s*/u, '$1'))
    .join('\n')
    // Collapse adjacent separator punctuation left behind when a citation
    // sat BETWEEN two separators in the source markdown. Examples seen:
    //   "BTC突破$81K，[Source](url)，山寨币..." → "BTC突破$81K，，..."
    //   "持续流入：[Source](url)，尽管..."     → "持续流入：，尽管..."
    //   "多空清算数据；[Source](url)、Bitfinex Alpha分析" → "...；、..."
    // Keep the first separator and drop the run that follows.
    .replace(/([，,：:；;、])\s*(?:[，,：:；;、]\s*)+/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { cleanText, citations };
}

/** Like parseLine but moves all inline http citations to the end as trailing badges. */
function parseLineWithEndCitations(text: string): React.ReactNode {
  const { cleanText, citations } = extractTrailingCitations(text);
  if (citations.length === 0) return parseLine(text);
  return (
    <>
      {parseLine(cleanText)}
      {citations.map((c, i) => (
        <InlineCitation key={`ec-${i}`} href={c.url} label={c.label} />
      ))}
    </>
  );
}

/** Strip inline citation links `[label](http…)` from heading text for slug/TOC use. */
function stripCitationsFromHeading(text: string): string {
  return text.replace(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_match, label) => label).replace(/\s{2,}/g, ' ').trim();
}

/**
 * Parses inline markdown-like syntax (bold, italic, code, links, bare URLs)
 */
export function parseLine(text: string): React.ReactNode {
  const nodes = parseFragments(text, 0);
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];
  return <>{nodes}</>;
}

function parseFragments(text: string, keyBase: number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let pos = 0;
  let k = keyBase;

  while (pos < text.length) {
    const rest = text.slice(pos);
    let m: RegExpExecArray | null;

    if (rest[0] === '`') {
      const end = rest.indexOf('`', 1);
      if (end > 0) {
        out.push(
          <code key={k++} className="text-[12px] bg-gray-100 text-indigo-600 px-1 py-0.5 rounded font-mono">
            {rest.slice(1, end)}
          </code>,
        );
        pos += end + 1;
        continue;
      }
    }

    m = /^\*\*(.+?)\*\*/.exec(rest);
    if (m) {
      out.push(
        <strong key={k++} className="font-semibold text-gray-900">
          {parseLine(m[1])}
        </strong>,
      );
      pos += m[0].length;
      continue;
    }

    m = /^\[([^\]]*)\]\(([^)]*)\)/.exec(rest);
    if (m) {
      const url = (m[2] || '').trim();
      if (safeHttpUrl(url)) {
        out.push(<InlineCitation key={k++} href={url} label={m[1]} />);
        pos += m[0].length;
        continue;
      }
      // Broken citation (e.g. `[Foo](undefined)` from a failed template
      // substitution) — render the label as plain text and consume the
      // whole `[label](url)` token so the parens/url don't leak through.
      if (m[1]) {
        out.push(<React.Fragment key={k++}>{m[1]}</React.Fragment>);
      }
      pos += m[0].length;
      continue;
    }

    m = /^\((https?:\/\/[^)]+)\)/.exec(rest);
    if (m) {
      const url = m[1];
      if (safeHttpUrl(url)) {
        out.push(<InlineCitation key={k++} href={url} label={url} />);
        pos += m[0].length;
        continue;
      }
    }

    m = /^(https?:\/\/[^\s<>\)]+)/.exec(rest);
    if (m) {
      let url = m[1];
      url = url.replace(/[.,;:!?]+$/g, '');
      if (safeHttpUrl(url)) {
        out.push(<InlineCitation key={k++} href={url} label={url} />);
        pos += m[0].length;
        continue;
      }
    }

    if (rest[0] === '*' && rest[1] !== '*') {
      m = /^\*([^*\n]+)\*/.exec(rest);
      if (m) {
        out.push(<em key={k++} className="italic">{parseLine(m[1])}</em>);
        pos += m[0].length;
        continue;
      }
    }

    const nextSpecial = findNextSpecial(rest);
    if (nextSpecial === -1) {
      out.push(rest);
      break;
    }
    if (nextSpecial > 0) {
      out.push(rest.slice(0, nextSpecial));
      pos += nextSpecial;
      continue;
    }
    // nextSpecial === 0: unmatched special at rest[0] — emit one char to avoid infinite loop
    out.push(rest[0]);
    pos += 1;
  }

  return out;
}

function findNextSpecial(s: string): number {
  const candidates: number[] = [];
  const idx = (c: string) => {
    const i = s.indexOf(c);
    if (i >= 0) candidates.push(i);
  };
  idx('`');
  idx('**');
  // Detect single * for italic (not preceded by another *)
  const singleStar = s.search(/(?<!\*)\*(?!\*)/);
  if (singleStar >= 0) candidates.push(singleStar);
  idx('[');
  const parenHttp = s.indexOf('(http');
  if (parenHttp >= 0) candidates.push(parenHttp);
  const bareHttp = s.search(/https?:\/\//);
  if (bareHttp >= 0) candidates.push(bareHttp);
  const valid = candidates.filter((n) => n >= 0);
  if (valid.length === 0) return -1;
  return Math.min(...valid);
}

/**
 * Renders multiple lines of text with structural markdown-like syntax (headers, lists, blockquotes)
 */
function headingSlug(text: string): string {
  return text.replace(/[^\w\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'h';
}

export function extractHeadings(text: string, msgIdx?: number): { level: number; text: string; id: string }[] {
  if (!text) return [];
  const prefix = msgIdx != null ? `m${msgIdx}-` : '';
  const headings: { level: number; text: string; id: string }[] = [];
  const cleanH = (s: string) => stripCitationsFromHeading(s.replace(/\*\*/g, ''));
  for (const line of text.split('\n')) {
    const m3 = line.match(/^###\s+(.+)/);
    if (m3) { const t = cleanH(m3[1]); headings.push({ level: 3, text: t, id: prefix + headingSlug(t) }); continue; }
    const m2 = line.match(/^##\s+(.+)/);
    if (m2) { const t = cleanH(m2[1]); headings.push({ level: 2, text: t, id: prefix + headingSlug(t) }); continue; }
    const m1 = line.match(/^#\s+(.+)/);
    if (m1 && !line.startsWith('##')) { const t = cleanH(m1[1]); headings.push({ level: 1, text: t, id: prefix + headingSlug(t) }); continue; }
  }
  return headings;
}

/** Split inline numbered lists into separate lines.
 *  e.g. "1. aaa 2. bbb 3. ccc" → "1. aaa\n2. bbb\n3. ccc"
 *  Only triggers when 3+ sequential numbered items appear on one line. */
function splitInlineNumberedLists(text: string): string {
  return text.replace(/^(.*?)(\d+\.\s.+)$/gm, (_match, prefix, listPart) => {
    // Split on " N. " boundaries where N is sequential
    const items = listPart.split(/\s+(?=\d+\.\s)/);
    if (items.length < 3) return _match; // Need at least 3 items to be confident it's a list
    // Verify they're roughly sequential (1,2,3 or 2,3,4 etc.)
    const nums = items.map((it: string) => parseInt(it.match(/^(\d+)\./)?.[1] || '0', 10));
    let sequential = true;
    for (let j = 1; j < nums.length; j++) {
      if (nums[j] !== nums[j - 1] + 1) { sequential = false; break; }
    }
    if (!sequential) return _match;
    const joined = items.join('\n');
    return prefix ? prefix.trimEnd() + '\n' + joined : joined;
  });
}

export function renderMarkdownContent(text: string, msgIdx?: number): React.ReactNode {
  if (!text) return null;
  const prefix = msgIdx != null ? `m${msgIdx}-` : '';

  const lines = splitInlineNumberedLists(text).split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  // Look ahead from `idx` and return all consecutive citation-only lines (joined
  // by spaces) plus the new cursor position. Blank lines between citation lines
  // are skipped so that paragraph/heading + citation chip stays inline.
  const consumeTrailingCitations = (startIdx: number): { text: string; newIdx: number } => {
    let text = '';
    let j = startIdx;
    while (j < lines.length) {
      let k = j;
      while (k < lines.length && lines[k].trim() === '') k++;
      if (k < lines.length && CITATION_ONLY_LINE.test(lines[k])) {
        text += (text ? ' ' : '') + lines[k].trim();
        j = k + 1;
      } else {
        break;
      }
    }
    return { text, newIdx: j };
  };

  while (i < lines.length) {
    const line = lines[i];
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="my-5 border-gray-100" />);
      i++;
      continue;
    }
    // ── HTML5 <details><summary>…</summary>…</details> collapsible block ──
    // The crypto-analysis prompt instructs the LLM to wrap raw tables / long
    // detail in <details> so the headline report stays scannable. Our hand-
    // written renderer doesn't process HTML, so without this branch the tags
    // leak as literal text. We:
    //   1. Capture everything from the opening <details ...> to the matching
    //      </details> (supports nesting via a depth counter).
    //   2. Extract the <summary>…</summary> as the disclosure label.
    //   3. Recursively run the inner body through `renderMarkdownContent`
    //      so embedded markdown (tables, lists, **bold**) still renders.
    if (/<details(\s[^>]*)?>/i.test(line)) {
      // Re-join the remaining text so a multi-line block is one searchable
      // string. The LLM commonly puts <details><summary>…</summary> all on
      // one line, then the body on subsequent lines, so per-line matching
      // alone is not enough.
      const remainder = lines.slice(i).join('\n');
      const openMatch = remainder.match(/<details(\s[^>]*)?>/i);
      if (openMatch && openMatch.index != null) {
        const openIdx = openMatch.index;
        // Walk forward tracking <details> depth so nested blocks pair correctly.
        const tagRe = /<\/?details(\s[^>]*)?>/gi;
        tagRe.lastIndex = openIdx;
        let depth = 0;
        let closeEnd = -1;
        let m: RegExpExecArray | null;
        while ((m = tagRe.exec(remainder)) !== null) {
          if (m[0].startsWith('</')) {
            depth--;
            if (depth === 0) { closeEnd = m.index + m[0].length; break; }
          } else {
            depth++;
          }
        }
        if (closeEnd > 0) {
          const block = remainder.slice(openIdx, closeEnd);
          const inside = block
            .replace(/^<details(\s[^>]*)?>\s*/i, '')
            .replace(/\s*<\/details>\s*$/i, '');
          const summaryMatch = inside.match(/<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>/i);
          const summaryText = summaryMatch ? summaryMatch[1].trim() : 'Details';
          const bodyText = summaryMatch
            ? inside.replace(summaryMatch[0], '').replace(/^\s*\n+/, '')
            : inside;

          // Anything before <details> on the same chunk is a stray paragraph
          // that should still render. Rare but possible.
          const before = remainder.slice(0, openIdx).trim();
          if (before) {
            elements.push(
              <p key={`pre-${i}`} className="text-[14px] text-gray-700 leading-[1.55] my-2.5">
                {parseLine(before)}
              </p>,
            );
          }
          elements.push(
            <details
              key={`det-${i}`}
              className="my-3 group rounded-lg border border-gray-200 bg-gray-50/40 [&[open]]:bg-white [&[open]]:shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all"
            >
              <summary className="cursor-pointer select-none px-3.5 py-2 text-[13px] font-semibold text-gray-700 hover:text-gray-900 flex items-center gap-1.5 list-none [&::-webkit-details-marker]:hidden">
                <svg className="w-3 h-3 text-gray-400 shrink-0 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
                {parseLine(summaryText.replace(/\*\*/g, ''))}
              </summary>
              <div className="px-3.5 pb-3 pt-1 border-t border-gray-100">
                {renderMarkdownContent(bodyText, msgIdx)}
              </div>
            </details>,
          );

          // Advance i past the line that contains the </details> by counting
          // newlines we just consumed.
          const consumed = remainder.slice(0, closeEnd);
          const newlines = (consumed.match(/\n/g) || []).length;
          i += newlines + 1;
          continue;
        }
      }
      // Open tag without matching close — fall through and let the line
      // render via the normal paragraph path below (still imperfect, but
      // better than swallowing the entire rest of the document).
    }
    if (/^#{3}\s/.test(line)) {
      const hText = line.replace(/^#{3}\s/, '');
      const slugId = prefix + headingSlug(stripCitationsFromHeading(hText.replace(/\*\*/g, '')));
      const cit = consumeTrailingCitations(i + 1);
      const display = cit.text ? hText + ' ' + cit.text : hText;
      elements.push(
        <h3 key={i} id={slugId} className="text-[15.5px] font-bold text-gray-900 mt-6 mb-2 tracking-tight">
          {parseLineWithEndCitations(display)}
        </h3>,
      );
      i = cit.newIdx;
      continue;
    }
    if (/^#{2}\s/.test(line)) {
      const hText = line.replace(/^#{2}\s/, '');
      const slugId = prefix + headingSlug(stripCitationsFromHeading(hText.replace(/\*\*/g, '')));
      const cit = consumeTrailingCitations(i + 1);
      const display = cit.text ? hText + ' ' + cit.text : hText;
      elements.push(
        <h2 key={i} id={slugId} className="text-[17px] font-bold text-gray-900 mt-7 mb-2.5 tracking-tight">
          {parseLineWithEndCitations(display)}
        </h2>,
      );
      i = cit.newIdx;
      continue;
    }
    if (/^#\s/.test(line) && !line.startsWith('##')) {
      const hText = line.replace(/^#\s/, '');
      const slugId = prefix + headingSlug(stripCitationsFromHeading(hText.replace(/\*\*/g, '')));
      const cit = consumeTrailingCitations(i + 1);
      const display = cit.text ? hText + ' ' + cit.text : hText;
      elements.push(
        <h1 key={i} id={slugId} className="text-[19px] font-bold text-gray-900 mt-8 mb-3 tracking-tight">
          {parseLineWithEndCitations(display)}
        </h1>,
      );
      i = cit.newIdx;
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <blockquote
          key={`bq-${i}`}
          className="border-l-[3px] border-indigo-300 pl-3.5 my-3 py-1 text-[14px] text-gray-600 italic bg-indigo-50/30 rounded-r-lg"
        >
          {quoteLines.map((ql, qi) => (
            <p key={qi} className="leading-relaxed">
              {parseLine(ql)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      const match = line.match(/^\s*(\d+)\.\s/);
      const startNum = match ? parseInt(match[1], 10) : 1;

      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s/, ''));
        i++;
      }
      const cit = consumeTrailingCitations(i);
      if (cit.text && items.length > 0) {
        items[items.length - 1] = items[items.length - 1] + ' ' + cit.text;
      }
      elements.push(
        <ol
          key={`ol-${i}`}
          start={startNum}
          className="list-decimal list-outside ml-5 my-3.5 space-y-2.5"
        >
          {items.map((t, li) => (
            <li key={li} className="text-[14.5px] text-gray-700 leading-[1.7] pl-1.5 marker:text-gray-400 marker:font-medium [&_strong]:text-gray-900">
              {parseLineWithEndCitations(t)}
            </li>
          ))}
        </ol>,
      );
      i = cit.newIdx;
      continue;
    }

    if (/^\s*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s/, ''));
        i++;
      }
      const cit = consumeTrailingCitations(i);
      if (cit.text && items.length > 0) {
        items[items.length - 1] = items[items.length - 1] + ' ' + cit.text;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-outside ml-5 my-3.5 space-y-2.5 marker:text-indigo-300">
          {items.map((t, li) => (
            <li key={li} className="text-[14.5px] text-gray-700 leading-[1.7] pl-1.5 [&_strong]:font-semibold [&_strong]:text-gray-900">
              {parseLineWithEndCitations(t)}
            </li>
          ))}
        </ul>,
      );
      i = cit.newIdx;
      continue;
    }

    if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    // ── Table: | col | col | ──
    if (/^\|.+\|/.test(line.trim())) {
      const tableRows: string[] = [];
      while (i < lines.length && /^\|.+\|/.test(lines[i].trim())) {
        tableRows.push(lines[i]);
        i++;
      }
      // Parse: first row = header, second row might be separator (|---|---|), rest = body
      const parseRow = (row: string) =>
        row.split('|').slice(1, -1).map(cell => cell.trim());

      const headerCells = parseRow(tableRows[0]);
      let bodyStart = 1;
      // Skip separator row like |---|---|
      if (tableRows[1] && /^\|[\s\-:]+\|/.test(tableRows[1].replace(/[^|:\-\s]/g, ''))) {
        bodyStart = 2;
      }
      const bodyRows = tableRows.slice(bodyStart).map(parseRow);

      const cit = consumeTrailingCitations(i);
      const colCount = Math.max(headerCells.length, ...bodyRows.map(r => r.length));

      elements.push(
        <div key={`tbl-${i}`} className="my-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-[13.5px] text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {headerCells.map((cell, ci) => (
                  <th key={ci} className="px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">
                    {parseLine(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((cells, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  {cells.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-gray-600 border-t border-gray-100">
                      {parseLine(cell)}
                    </td>
                  ))}
                </tr>
              ))}
              {cit.text && (
                <tr className="bg-gray-50/70">
                  <td colSpan={colCount} className="px-3 py-1.5 text-right border-t border-gray-100">
                    {parseLine(cit.text)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>,
      );
      i = cit.newIdx;
      continue;
    }

    // Merge any following citation-only lines (e.g. "[A](url) [B](url)") into
    // this paragraph so source chips stay inline at the sentence end instead of
    // wrapping onto their own line; `parseLineWithEndCitations` then also moves
    // any in-line `[label](url)` to the end as trailing badges (no dup label).
    const cit = consumeTrailingCitations(i + 1);
    const paragraphText = cit.text ? line + ' ' + cit.text : line;
    elements.push(
      <p key={i} className="text-[14.5px] text-gray-700 leading-[1.75] break-words [&_strong]:font-semibold [&_strong]:text-gray-900">
        {parseLineWithEndCitations(paragraphText)}
      </p>,
    );
    i = cit.newIdx;
  }
  return elements;
}

const CITATION_ONLY_LINE = /^\s*(?:\[[^\]]*\]\(https?:\/\/[^)]+\)|\(https?:\/\/[^)]+\)|https?:\/\/\S+)(?:\s+(?:\[[^\]]*\]\(https?:\/\/[^)]+\)|\(https?:\/\/[^)]+\)|https?:\/\/\S+))*\s*$/;
