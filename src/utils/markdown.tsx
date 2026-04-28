import React, { createContext, useContext } from 'react';

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

/** Market badge style map (supports both zh & en market labels) */
const MKT_STYLE: Record<string, string> = {
  '美股': 'bg-blue-500/10 text-blue-600', '港股': 'bg-amber-500/10 text-amber-600', 'A股': 'bg-red-500/10 text-red-600',
  'US': 'bg-blue-500/10 text-blue-600', 'HK': 'bg-amber-500/10 text-amber-600', 'A-Share': 'bg-red-500/10 text-red-600',
};

/** Renders a stock/crypto quote snapshot as a styled card */
export function QuoteCard({
  quote,
  okxSnap,
  okxNews,
}: {
  quote: QuoteData;
  okxSnap?: QuoteOkxSnapshot | null;
  okxNews?: QuoteOkxNewsBundle | null;
}) {
  const lang = quote.lang || 'zh';
  const L = LABELS[lang] || LABELS.zh;

  const isPositive = quote.change ? /^\+|涨/.test(quote.change) : null;
  const isNegative = quote.change ? /^-|跌/.test(quote.change) : null;
  const changeColor = isPositive ? 'text-emerald-600' : isNegative ? 'text-red-500' : 'text-gray-500';
  const changeBg = isPositive
    ? 'bg-emerald-500/8 ring-1 ring-emerald-500/20'
    : isNegative
    ? 'bg-red-500/8 ring-1 ring-red-500/20'
    : 'bg-gray-100 ring-1 ring-gray-200/60';

  // Subtle background tint based on price movement
  const cardBg = isPositive
    ? 'bg-gradient-to-br from-emerald-50/40 via-white to-white'
    : isNegative
    ? 'bg-gradient-to-br from-red-50/40 via-white to-white'
    : 'bg-gradient-to-br from-gray-50/40 via-white to-white';

  const mktCls = quote.market ? (MKT_STYLE[quote.market] || 'bg-gray-100 text-gray-500') : '';

  // Helper: check if a value is meaningful (not N/A, empty, zero-ish)
  const ok = (v?: string) => v && !/^(n\/?a|--|—|0\.?0*|undefined|null)$/i.test(v.trim());

  // Build stats array with localized labels, skipping empty/N/A.
  // Order: 24h price band → supply/market cap → stock-style metrics → crypto funding.
  const stats: { label: string; value: string }[] = [];
  if (ok(quote.high)) stats.push({ label: L.high, value: quote.high! });
  if (ok(quote.low)) stats.push({ label: L.low, value: quote.low! });
  if (ok(quote.ath)) stats.push({ label: L.ath, value: quote.ath! });
  if (ok(quote.marketCap)) stats.push({ label: L.marketCap, value: quote.marketCap! });
  if (ok(quote.volume)) stats.push({ label: L.volume, value: quote.volume! });
  if (ok(quote.supplyCirculating)) stats.push({ label: L.supplyCirculating, value: quote.supplyCirculating! });
  if (ok(quote.supplyTotal)) stats.push({ label: L.supplyTotal, value: quote.supplyTotal! });
  if (ok(quote.open)) stats.push({ label: L.open, value: quote.open! });
  if (ok(quote.prevClose)) stats.push({ label: L.prevClose, value: quote.prevClose! });
  if (ok(quote.amount)) stats.push({ label: L.amount, value: quote.amount! });
  if (ok(quote.pe)) stats.push({ label: L.pe, value: quote.pe! });
  if (ok(quote.pb)) stats.push({ label: L.pb, value: quote.pb! });
  if (ok(quote.turnover)) stats.push({ label: L.turnover, value: quote.turnover! });
  // Funding rate only when no live derivatives snapshot is available (avoid duplication).
  if (!okxSnap && ok(quote.fundingRate)) stats.push({ label: L.fundingRate, value: quote.fundingRate! });

  return (
    <div className={`mb-5 rounded-2xl overflow-hidden ring-1 ring-black/[0.04] shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] ${cardBg}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[20px] font-extrabold text-gray-900 tracking-tight leading-none truncate">{quote.symbol}</span>
            {quote.market && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${mktCls} tracking-wide uppercase shrink-0`}>{quote.market}</span>
            )}
          </div>
          {quote.name && <p className="text-[12px] text-gray-400 mt-1 font-light tracking-wide truncate">{quote.name}</p>}
        </div>
        {ok(quote.price) && (
          <div className="text-right flex flex-col items-end min-w-0 max-w-[45%]">
            <p className="text-[28px] font-black text-gray-900 tabular-nums leading-none tracking-tight truncate max-w-full">{quote.price}</p>
            {ok(quote.change) && (
              <span className={`mt-1.5 inline-flex items-center text-[12px] font-bold px-2.5 py-1 rounded-lg ${changeBg} ${changeColor} tabular-nums truncate max-w-full`}>
                {isPositive && <span className="mr-0.5">▲</span>}
                {isNegative && <span className="mr-0.5">▼</span>}
                {quote.change}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      {stats.length > 0 && (
        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-gray-200/80 to-transparent" />
      )}

      {/* Stats grid */}
      {stats.length > 0 && (
        <div className="px-5 py-3.5">
          <div className="grid grid-cols-5 gap-x-4 gap-y-3">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.08em] text-gray-400 font-medium leading-none mb-1">{s.label}</p>
                <p className="text-[13px] font-semibold text-gray-800 tabular-nums truncate leading-none">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Derivatives — merged section (crypto only) */}
      {okxSnap && <OkxQuoteDerivatives okx={okxSnap} lang={lang as 'zh' | 'en'} />}

      {/* OKX News & Sentiment (crypto only) */}
      {okxNews && <OkxQuoteNews bundle={okxNews} lang={lang as 'zh' | 'en'} />}

      {/* Timestamp */}
      {quote.asOf && (
        <div className="px-5 pb-3 pt-0">
          <p className="text-[9px] text-gray-300 tracking-wide">{quote.asOf}</p>
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

const TWITTER_ICON = (
  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
);
const GITHUB_ICON = (
  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.1.79-.25.79-.56 0-.27-.01-1.16-.02-2.1-3.2.7-3.88-1.36-3.88-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 015.78 0c2.21-1.5 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56C20.21 21.39 23.5 17.07 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>
);
const LINK_ICON = (
  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 7h3a5 5 0 010 10h-3M10 17H7A5 5 0 017 7h3M8 12h8"/></svg>
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

function ExtLink({ href, icon, label, title }: { href: string; icon: React.ReactNode; label?: string; title: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 hover:text-gray-700 border border-gray-200/60 transition"
    >
      {icon}
      {label && <span className="leading-none">{label}</span>}
    </a>
  );
}

function StatBlock({ label, value, hint, color, info, alwaysShow }: { label: string; value?: string; hint?: string; color?: string; info?: string; alwaysShow?: boolean }) {
  if (!value && !alwaysShow) return null;
  const shown = value ?? '—';
  const showHint = !!value && !!hint;
  return (
    <div className="min-w-0">
      <p className="text-[9px] uppercase tracking-[0.08em] text-gray-400 font-medium leading-none mb-1 flex items-center gap-1">
        <span className="truncate">{label}</span>
        {info && (
          <span className="tk-info group relative inline-flex items-center shrink-0" tabIndex={0}>
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="w-[12px] h-[12px] text-gray-400 group-hover:text-gray-600 group-focus:text-gray-600 transition-colors"
              fill="currentColor"
            >
              <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 1.4a5.1 5.1 0 1 1 0 10.2A5.1 5.1 0 0 1 8 2.9Zm0 2.1a.85.85 0 1 0 0 1.7.85.85 0 0 0 0-1.7Zm-.85 3.05V11.8a.85.85 0 1 0 1.7 0V8.05a.85.85 0 1 0-1.7 0Z" />
            </svg>
            <span
              role="tooltip"
              className="tk-info-pop pointer-events-none absolute left-1/2 bottom-full mb-1.5 -translate-x-1/2 z-30 normal-case tracking-normal whitespace-normal text-[11px] font-normal leading-snug text-white bg-gray-900/95 rounded-lg px-2.5 py-1.5 w-[220px] shadow-lg ring-1 ring-black/10 opacity-0 translate-y-1 transition-all duration-100 group-hover:opacity-100 group-hover:translate-y-0 group-focus:opacity-100 group-focus:translate-y-0"
            >
              {info}
            </span>
          </span>
        )}
      </p>
      <p className={`text-[13px] font-semibold tabular-nums truncate leading-none ${value ? (color || 'text-gray-800') : 'text-gray-300'}`}>{shown}</p>
      {showHint && <p className="text-[9.5px] text-gray-400 mt-0.5 truncate leading-none">{hint}</p>}
    </div>
  );
}

/** Renders a crypto token card from a TokenSnapshot. */
export function TokenCard({ token, lang }: { token: TokenSnapshotData; lang?: string }) {
  const isZh = (lang || 'zh') === 'zh';
  const L = isZh
    ? {
        rank: '排名', mcap: '市值', fdv: 'FDV', fdvMcap: 'FDV/MC', vol24: '24h 量', high24: '24h 高', low24: '24h 低',
        ch24: '24h', ch7: '7d', ch30: '30d', ch1y: '1y',
        circ: '流通', total: '总量', max: '上限', circPct: '流通%',
        ath: '历史最高', atl: '历史最低',
        twitter: '推特粉丝', reddit: 'Reddit', telegram: 'TG 群', github: 'GitHub',
        commits4w: '4周提交', stars: 'Stars', forks: 'Forks', contributors: '贡献者',
        infoTwitter: '项目官方 Twitter / X 账号的粉丝数。',
        infoTelegram: '项目官方 Telegram 群的成员数。没有官方 TG 群时显示 —。',
        infoCommits4w: '主代码仓库最近 4 周的提交次数，用来看项目近期开发是否活跃。0 代表项目近 1 个月没动过代码。',
        infoStars: '主代码仓库累计获得的 GitHub Stars，反映开发者社区对项目的关注度。',
        sentimentUp: '看涨投票', sentimentDown: '看跌投票',
        topExch: '主要交易所',
        details: '详细数据',
      }
    : {
        rank: 'Rank', mcap: 'Mkt Cap', fdv: 'FDV', fdvMcap: 'FDV/MC', vol24: '24h Vol', high24: '24h High', low24: '24h Low',
        ch24: '24h', ch7: '7d', ch30: '30d', ch1y: '1y',
        circ: 'Circ', total: 'Total', max: 'Max', circPct: 'Circ %',
        ath: 'ATH', atl: 'ATL',
        twitter: 'Twitter', reddit: 'Reddit', telegram: 'Telegram', github: 'GitHub',
        commits4w: '4w commits', stars: 'Stars', forks: 'Forks', contributors: 'Contributors',
        infoTwitter: 'Followers of the project’s official Twitter / X account.',
        infoTelegram: 'Members of the project’s official Telegram group. Shows — if there is none.',
        infoCommits4w: 'GitHub commits to the main repo in the last 4 weeks. 0 means no code activity for a month.',
        infoStars: 'Cumulative GitHub stars on the main repo — a proxy for developer interest.',
        sentimentUp: 'Bullish votes', sentimentDown: 'Bearish votes',
        topExch: 'Top exchanges',
        details: 'Show details',
      };

  const m = token.market;
  const c = token.community;
  const d = token.developer;

  const ch24 = m.change24hPct;
  const isUp = ch24 != null && ch24 > 0;
  const isDown = ch24 != null && ch24 < 0;

  const cardBg = isUp
    ? 'bg-gradient-to-br from-emerald-50/40 via-white to-white'
    : isDown
    ? 'bg-gradient-to-br from-red-50/40 via-white to-white'
    : 'bg-gradient-to-br from-gray-50/40 via-white to-white';
  const changeBg = isUp
    ? 'bg-emerald-500/8 ring-1 ring-emerald-500/20 text-emerald-600'
    : isDown
    ? 'bg-red-500/8 ring-1 ring-red-500/20 text-red-500'
    : 'bg-gray-100 ring-1 ring-gray-200/60 text-gray-500';

  // Row 1: market basics
  const row1: { label: string; value?: string; hint?: string; color?: string }[] = [
    { label: L.mcap, value: fmtUsdCompact(m.marketCapUsd), hint: token.rank ? `#${token.rank}` : undefined },
    { label: L.fdv, value: fmtUsdCompact(m.fdvUsd), hint: m.fdvOverMcap ? `${L.fdvMcap} ${m.fdvOverMcap.toFixed(2)}×` : undefined },
    { label: L.vol24, value: fmtUsdCompact(m.volume24hUsd) },
    { label: L.high24, value: fmtPriceUsd(m.high24hUsd) },
    { label: L.low24, value: fmtPriceUsd(m.low24hUsd) },
  ];

  // Row 2: returns + supply pressure
  const row2: { label: string; value?: string; hint?: string; color?: string }[] = [
    { label: L.ch7, value: fmtPct(m.change7dPct), color: pctColor(m.change7dPct) },
    { label: L.ch30, value: fmtPct(m.change30dPct), color: pctColor(m.change30dPct) },
    { label: L.ch1y, value: fmtPct(m.change1yPct), color: pctColor(m.change1yPct) },
    {
      label: L.circ,
      value: fmtCount(m.circulatingSupply),
      hint: m.circulatingPctOfMax != null ? `${m.circulatingPctOfMax.toFixed(1)}% ${L.max}` : (m.maxSupply ? `/ ${fmtCount(m.maxSupply)}` : undefined),
    },
    {
      label: L.ath,
      value: fmtPriceUsd(m.athUsd),
      hint: m.athChangePct != null ? fmtPct(m.athChangePct) : undefined,
      color: 'text-gray-700',
    },
  ];

  // Row 3: community + developer — always render so the labels stay
  // self-explanatory even when the project has no TG / GitHub.
  const row3: { label: string; value?: string; hint?: string; color?: string; info?: string; alwaysShow?: boolean }[] = [
    { label: L.twitter, value: fmtCount(c.twitterFollowers), info: L.infoTwitter, alwaysShow: true },
    { label: L.telegram, value: fmtCount(c.telegramUsers), info: L.infoTelegram, alwaysShow: true },
    {
      label: L.commits4w,
      value: d.commits4w != null ? String(d.commits4w) : undefined,
      hint: d.contributors != null ? `${d.contributors} ${L.contributors}` : undefined,
      info: L.infoCommits4w,
      alwaysShow: true,
    },
    {
      label: L.stars,
      value: fmtCount(d.githubStars),
      hint: d.githubForks != null ? `${fmtCount(d.githubForks)} ${L.forks}` : undefined,
      info: L.infoStars,
      alwaysShow: true,
    },
  ];

  const hasAnyRow1 = row1.some((s) => s.value);
  const hasAnyRow2 = row2.some((s) => s.value);
  // Row 3 has alwaysShow entries — keep the row visible even when every value is missing.
  const hasAnyRow3 = true;

  const topEx = (token.topExchanges || []).slice(0, 5);

  return (
    <div className={`mb-5 rounded-2xl ring-1 ring-black/[0.04] shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] ${cardBg}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div className="min-w-0 flex items-start gap-3">
          {token.imageUrl && (
            <img
              src={token.imageUrl}
              alt={token.symbol}
              className="w-10 h-10 rounded-full ring-1 ring-black/[0.06] shrink-0 mt-0.5"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[20px] font-extrabold text-gray-900 tracking-tight leading-none">{token.symbol}</span>
              {token.rank != null && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 tracking-wide">#{token.rank}</span>
              )}
              {(token.categories || []).slice(0, 2).map((cat) => (
                <span key={cat} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-500/8 text-gray-600 tracking-wide truncate max-w-[10rem]">{cat}</span>
              ))}
            </div>
            <p className="text-[12px] text-gray-400 mt-1 font-light tracking-wide truncate max-w-[20rem]">{token.name}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {token.homepage && <ExtLink href={token.homepage} icon={LINK_ICON} title={token.homepage} />}
              {token.whitepaper && <ExtLink href={token.whitepaper} icon={DOC_ICON} title={token.whitepaper} label="WP" />}
              {token.twitter && <ExtLink href={`https://x.com/${token.twitter}`} icon={TWITTER_ICON} title={`@${token.twitter}`} label={c.twitterFollowers != null ? fmtCount(c.twitterFollowers) : undefined} />}
              {token.github && <ExtLink href={token.github} icon={GITHUB_ICON} title={token.github} label={d.githubStars != null ? fmtCount(d.githubStars) : undefined} />}
              {token.telegram && <ExtLink href={`https://t.me/${token.telegram}`} icon={TG_ICON} title={`Telegram`} />}
              {token.reddit && <ExtLink href={token.reddit} icon={REDDIT_ICON} title={token.reddit} />}
            </div>
          </div>
        </div>
        {m.priceUsd != null && (
          <div className="text-right shrink-0 flex flex-col items-end">
            <p className="text-[28px] font-black text-gray-900 tabular-nums leading-none tracking-tight">{fmtPriceUsd(m.priceUsd)}</p>
            {ch24 != null && (
              <span className={`mt-1.5 inline-flex items-center text-[12px] font-bold px-2.5 py-1 rounded-lg tabular-nums ${changeBg}`}>
                {isUp && <span className="mr-0.5">▲</span>}
                {isDown && <span className="mr-0.5">▼</span>}
                {fmtPct(ch24)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Stats rows */}
      {(hasAnyRow1 || hasAnyRow2 || hasAnyRow3) && (
        <>
          <div className="mx-5 h-px bg-gradient-to-r from-transparent via-gray-200/80 to-transparent" />
          <div className="px-5 py-3.5 space-y-3.5">
            {hasAnyRow1 && (
              <div className="grid grid-cols-5 gap-x-4 gap-y-3">
                {row1.map((s) => <StatBlock key={s.label} {...s} />)}
              </div>
            )}
            {hasAnyRow2 && (
              <div className="grid grid-cols-5 gap-x-4 gap-y-3">
                {row2.map((s) => <StatBlock key={s.label} {...s} />)}
              </div>
            )}
            {hasAnyRow3 && (
              <div className="grid grid-cols-5 gap-x-4 gap-y-3">
                {row3.map((s) => <StatBlock key={s.label} {...s} />)}
              </div>
            )}
          </div>
        </>
      )}

      {/* Top exchanges */}
      {topEx.length > 0 && (
        <>
          <div className="mx-5 h-px bg-gradient-to-r from-transparent via-gray-200/80 to-transparent" />
          <div className="px-5 py-3">
            <p className="text-[9px] uppercase tracking-[0.08em] text-gray-400 font-medium leading-none mb-2">{L.topExch}</p>
            <div className="flex flex-wrap gap-1.5">
              {topEx.map((ex, i) => (
                <span
                  key={`${ex.name}-${ex.pair}-${i}`}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-medium text-gray-600 bg-gray-50 border border-gray-200/60"
                  title={ex.spreadPct != null ? `spread ${ex.spreadPct.toFixed(3)}%` : undefined}
                >
                  <span className="font-semibold text-gray-700">{ex.name}</span>
                  <span className="text-gray-400">{ex.pair}</span>
                  {ex.volumeUsd != null && <span className="text-gray-500 tabular-nums">{fmtUsdCompact(ex.volumeUsd)}</span>}
                </span>
              ))}
            </div>
          </div>
        </>
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
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className={CITE_TAG}
    >
      <svg className="w-2.5 h-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
      <span className="truncate max-w-[8rem]">{show}</span>
      {/* Rich hover tooltip — right-aligned so it never clips at right edge */}
      <span className="pointer-events-none absolute bottom-full right-0 mb-2 w-[260px] px-3 py-2.5 rounded-xl bg-gray-900 text-white text-[11px] leading-snug whitespace-normal opacity-0 group-hover/cite:opacity-100 transition-opacity duration-150 shadow-xl z-50">
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
        <span className="absolute top-full right-3 -mt-px border-4 border-transparent border-t-gray-900" />
      </span>
    </a>
  );
}

/**
 * Strips [label](url) citation links from text, keeping just the trailing citations list.
 * Returns cleaned text (with in-place citations removed) + ordered list for trailing badges.
 */
function extractTrailingCitations(text: string): { cleanText: string; citations: Array<{ label: string; url: string }> } {
  const citations: Array<{ label: string; url: string }> = [];
  const cleanText = text
    .replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, label, rawUrl) => {
      const url = rawUrl.trim();
      if (safeHttpUrl(url)) {
        citations.push({ label: label.trim() || urlChipLabel(url), url });
        return '';
      }
      return match;
    })
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

    m = /^\[([^\]]*)\]\(([^)]+)\)/.exec(rest);
    if (m) {
      const url = m[2].trim();
      if (safeHttpUrl(url)) {
        out.push(<InlineCitation key={k++} href={url} label={m[1]} />);
        pos += m[0].length;
        continue;
      }
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
