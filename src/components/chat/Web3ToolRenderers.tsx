// Web3 tool result renderers — one card per tool, registry-based dispatch.
// Mirrors the LangGraph-style pattern: the agent emits raw JSON output for each
// tool call, the frontend maps tool name → custom card component. Falls back to
// a generic key-value table for unknown tools.
//
// Used in fast/auto mode (NOT roundtable) to render tool calls inline in the
// chat thread while the agent is thinking, so the user sees real data flowing
// instead of just a "thinking…" spinner.

import React from 'react';

const mono = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(v: number | null | undefined, decimals = 2): string {
    if (v == null || !Number.isFinite(v)) return '—';
    if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
    if (Math.abs(v) >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: decimals });
    if (Math.abs(v) >= 0.01) return v.toFixed(4);
    return v.toPrecision(3);
}

function fmtPrice(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return '—';
    if (v >= 1) return `$${fmtNum(v)}`;
    return `$${v.toPrecision(3)}`;
}

const ChangeBadge: React.FC<{ pct: number | null | undefined }> = ({ pct }) => {
    if (pct == null || !Number.isFinite(pct)) {
        return <span className="text-gray-400 text-[11px]" style={{ fontFamily: mono }}>—</span>;
    }
    const up = pct >= 0;
    return (
        <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? 'text-emerald-600' : 'text-rose-500'}`}
            style={{ fontFamily: mono }}
        >
            {up ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
        </span>
    );
};

// ── Card shell (consistent layout for all tool cards) ──────────────────────

const CardShell: React.FC<{
    title: string;
    subtitle?: string;
    provider?: string;
    children: React.ReactNode;
    /** Optional small icon/glyph rendered next to the title. */
    icon?: React.ReactNode;
}> = ({ title, subtitle, provider, children, icon }) => (
    <div className="border border-gray-200/80 bg-white rounded-xl overflow-hidden max-w-md text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-shadow duration-150">
        <div className="border-b border-gray-100 bg-gradient-to-b from-gray-50/80 to-white/40 flex items-center gap-2 px-3.5 py-2">
            {icon && <span className="shrink-0 text-gray-500">{icon}</span>}
            <span className="text-gray-800 font-semibold tracking-tight">{title}</span>
            {subtitle && (
                <span className="text-gray-400 text-[11px] uppercase tracking-wider" style={{ fontFamily: mono }}>{subtitle}</span>
            )}
            {provider && (
                <span className="text-gray-400 text-[9.5px] uppercase tracking-[0.14em] ml-auto" style={{ fontFamily: mono }}>
                    via {provider}
                </span>
            )}
        </div>
        <div className="px-3.5 py-3">{children}</div>
    </div>
);

// ── Tool-specific cards ────────────────────────────────────────────────────

const SearchCryptoCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="Token resolution" provider="CoinGecko">
                <div className="text-gray-400 text-xs">No match</div>
            </CardShell>
        );
    }
    return (
        <CardShell title="Token resolution" subtitle={data?.symbol?.toUpperCase()} provider="CoinGecko">
            <div className="flex items-center gap-3">
                <span className="text-gray-900 text-[17px] font-semibold tracking-tight">{data?.name || data?.id}</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400" style={{ fontFamily: mono }}>
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                    </svg>
                    <span className="text-gray-500">{data?.id}</span>
                </span>
            </div>
        </CardShell>
    );
};

const TokenPriceCard: React.FC<{ data: any }> = ({ data }) => {
    const rows: any[] = Array.isArray(data) ? data : [];
    if (rows.length === 0) return null;
    return (
        <div className="space-y-2">
            {rows.slice(0, 3).map((row, i) => {
                const up = (row.change_24h_pct ?? 0) >= 0;
                return (
                    <CardShell
                        key={`${row.id}-${i}`}
                        title={(row.symbol || row.id || '').toUpperCase()}
                        subtitle={row.name}
                        provider="CoinGecko"
                    >
                        <div className="flex items-baseline gap-3">
                            <span className="text-gray-900 text-3xl font-bold tabular-nums tracking-tight" style={{ fontFamily: mono }}>
                                {fmtPrice(row.price_usd)}
                            </span>
                            <ChangeBadge pct={row.change_24h_pct} />
                        </div>
                        <div className="mt-3 grid grid-cols-3 divide-x divide-gray-100 -mx-1">
                            <div className="px-3">
                                <div className="text-[10px] uppercase tracking-wider text-gray-400">24h Vol</div>
                                <div className="text-[12px] text-gray-800 font-medium tabular-nums" style={{ fontFamily: mono }}>{fmtNum(row.volume_24h_usd)}</div>
                            </div>
                            <div className="px-3">
                                <div className="text-[10px] uppercase tracking-wider text-gray-400">Mcap</div>
                                <div className="text-[12px] text-gray-800 font-medium tabular-nums" style={{ fontFamily: mono }}>{fmtNum(row.market_cap_usd)}</div>
                            </div>
                            <div className="px-3">
                                <div className="text-[10px] uppercase tracking-wider text-gray-400">Rank</div>
                                <div className={`text-[12px] font-medium tabular-nums ${up ? 'text-emerald-700' : 'text-gray-800'}`} style={{ fontFamily: mono }}>#{row.rank ?? '—'}</div>
                            </div>
                        </div>
                    </CardShell>
                );
            })}
        </div>
    );
};

const CoinDetailCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="Project profile" provider="CoinGecko">
                <div className="text-gray-400 text-xs">{data.error}</div>
            </CardShell>
        );
    }
    const cats: string[] = Array.isArray(data?.categories) ? data.categories.slice(0, 4) : [];
    const desc = (data?.description || '').slice(0, 220);
    const upPct = Number(data?.sentiment_up_pct ?? 0);
    const downPct = Number(data?.sentiment_down_pct ?? 0);
    const hasSent = data?.sentiment_up_pct != null || data?.sentiment_down_pct != null;
    return (
        <CardShell title="Project profile" subtitle={data?.symbol?.toUpperCase()} provider="CoinGecko">
            <div className="space-y-3">
                {cats.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {cats.map((c) => (
                            <span
                                key={c}
                                className="text-[10.5px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-100"
                            >
                                {c}
                            </span>
                        ))}
                    </div>
                )}
                {desc && (
                    <p className="text-[12.5px] text-gray-700 leading-relaxed">
                        {desc}{desc.length >= 220 ? '…' : ''}
                    </p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-[11.5px]">
                    {data?.website && (
                        <a href={data.website} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-gray-600 hover:text-blue-600 transition-colors">
                            <span>🌐</span><span>Website</span>
                        </a>
                    )}
                    {data?.twitter && (
                        <a href={`https://x.com/${data.twitter}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-gray-600 hover:text-blue-600 transition-colors">
                            <span>𝕏</span><span>@{data.twitter}</span>
                        </a>
                    )}
                    {data?.github && (
                        <a href={data.github} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-gray-600 hover:text-blue-600 transition-colors">
                            <span>⌂</span><span>Github</span>
                        </a>
                    )}
                </div>
                {hasSent && (
                    <div className="pt-1 border-t border-gray-100">
                        <div className="flex items-center gap-2 text-[11px]">
                            <span className="text-gray-400 uppercase tracking-wider text-[9.5px]">Sentiment</span>
                            <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-gray-100">
                                {upPct > 0 && (
                                    <div className="bg-emerald-500" style={{ width: `${upPct}%` }} />
                                )}
                                {downPct > 0 && (
                                    <div className="bg-rose-400" style={{ width: `${downPct}%` }} />
                                )}
                            </div>
                            <span className="text-emerald-600 font-medium tabular-nums">{upPct.toFixed(0)}%</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-rose-500 font-medium tabular-nums">{downPct.toFixed(0)}%</span>
                        </div>
                    </div>
                )}
            </div>
        </CardShell>
    );
};

const PriceHistoryCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="Price history" provider="CoinGecko">
                <div className="text-gray-400 text-xs">{data.error}</div>
            </CardShell>
        );
    }
    const summary = data?.summary || {};
    const ohlc = data?.ohlc;
    const days = data?.days;
    // Build mini-chart from `summary.points` (close prices) if present, else
    // fall back to ohlc high/low band.
    const closes: number[] = Array.isArray(summary?.points) ? summary.points.filter((v: number) => Number.isFinite(v)) : [];
    const hasChart = closes.length >= 2;
    const W = 360, H = 60;
    let pathLine = '', pathArea = '';
    let totalPct: number | null = null;
    let stroke = '#10b981';
    if (hasChart) {
        const min = Math.min(...closes);
        const max = Math.max(...closes);
        const range = max - min || 1;
        const stepX = W / (closes.length - 1);
        const points = closes.map((c, i) => {
            const x = (i * stepX).toFixed(1);
            const y = (H - ((c - min) / range) * H).toFixed(1);
            return `${x},${y}`;
        });
        pathLine = 'M' + points.join(' L');
        pathArea = `${pathLine} L${W},${H} L0,${H} Z`;
        const first = closes[0];
        const last = closes[closes.length - 1];
        totalPct = ((last - first) / first) * 100;
        stroke = totalPct >= 0 ? '#10b981' : '#f43f5e';
    }
    return (
        <CardShell title="Price history" subtitle={`${days || '?'}d`} provider="CoinGecko">
            {hasChart ? (
                <>
                    <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-[11px] text-gray-500" style={{ fontFamily: mono }}>
                            {closes.length} data points
                        </span>
                        <ChangeBadge pct={totalPct} />
                    </div>
                    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-14 w-full">
                        <defs>
                            <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
                                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <path d={pathArea} fill="url(#chart-gradient)" />
                        <path d={pathLine} fill="none" stroke={stroke} strokeWidth={1.5} />
                    </svg>
                </>
            ) : (
                <div className="text-gray-400 text-xs">Insufficient data points</div>
            )}
            {ohlc && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]" style={{ fontFamily: mono }}>
                    <div>
                        <div className="text-gray-400">{days}d High</div>
                        <div className="text-gray-700">{fmtPrice(ohlc.period_high_usd)}</div>
                    </div>
                    <div>
                        <div className="text-gray-400">{days}d Low</div>
                        <div className="text-gray-700">{fmtPrice(ohlc.period_low_usd)}</div>
                    </div>
                </div>
            )}
        </CardShell>
    );
};

const TrendingCoinsCard: React.FC<{ data: any }> = ({ data }) => {
    // Accept either { coins: [...] } (post-normalization) or a raw array
    // (legacy backend output) — defensive parsing keeps stale payloads from
    // showing "0 coins".
    const list: any[] = Array.isArray(data) ? data : (Array.isArray(data?.coins) ? data.coins : []);
    const coins: any[] = list.slice(0, 7);
    return (
        <CardShell title="Trending coins" subtitle={`top ${coins.length}`} provider="CoinGecko">
            <ul className="space-y-1">
                {coins.map((c, i) => (
                    <li key={c.id || c.symbol || i} className="flex items-baseline justify-between text-[12px]">
                        <span className="flex items-baseline gap-1.5 min-w-0">
                            <span className="text-gray-400 w-4 text-right" style={{ fontFamily: mono }}>{i + 1}</span>
                            <span className="font-semibold text-gray-900 shrink-0">{(c.symbol || '').toUpperCase()}</span>
                            <span className="text-gray-400 text-[11px] truncate">{c.name}</span>
                        </span>
                        <span className="flex items-baseline gap-2 shrink-0">
                            {c.price_usd != null && (
                                <span className="text-gray-700 tabular-nums text-[11px]" style={{ fontFamily: mono }}>{fmtPrice(c.price_usd)}</span>
                            )}
                            {c.change_24h_pct != null && <ChangeBadge pct={c.change_24h_pct} />}
                            {c.rank != null && (
                                <span className="text-gray-400 text-[10px]" style={{ fontFamily: mono }}>#{c.rank}</span>
                            )}
                        </span>
                    </li>
                ))}
            </ul>
        </CardShell>
    );
};

const MarketRankingsCard: React.FC<{ data: any }> = ({ data }) => {
    const list: any[] = Array.isArray(data) ? data : (Array.isArray(data?.coins) ? data.coins : []);
    const coins: any[] = list.slice(0, 8);
    return (
        <CardShell title="Market rankings" subtitle={`top ${coins.length}`} provider="CoinGecko">
            <ul className="space-y-1">
                {coins.map((c, i) => (
                    <li key={c.id || i} className="flex items-baseline justify-between text-[12px]">
                        <span className="flex items-baseline gap-1.5">
                            <span className="text-gray-400 w-5 text-right" style={{ fontFamily: mono }}>{i + 1}</span>
                            <span className="font-semibold text-gray-900">{(c.symbol || '').toUpperCase()}</span>
                        </span>
                        <span className="flex items-baseline gap-2">
                            <span className="text-gray-700 tabular-nums" style={{ fontFamily: mono }}>{fmtPrice(c.price_usd)}</span>
                            <ChangeBadge pct={c.change_24h_pct} />
                        </span>
                    </li>
                ))}
            </ul>
        </CardShell>
    );
};

const GlobalMarketCard: React.FC<{ data: any }> = ({ data }) => {
    return (
        <CardShell title="Global market" provider="CoinGecko">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]" style={{ fontFamily: mono }}>
                <div>
                    <div className="text-gray-400 text-[10px]">Total mcap</div>
                    <div className="text-gray-900 font-semibold">${fmtNum(data?.total_market_cap_usd)}</div>
                </div>
                <div>
                    <div className="text-gray-400 text-[10px]">24h volume</div>
                    <div className="text-gray-900 font-semibold">${fmtNum(data?.total_volume_usd)}</div>
                </div>
                <div>
                    <div className="text-gray-400 text-[10px]">BTC dominance</div>
                    <div className="text-gray-900 font-semibold">{data?.btc_dominance_pct != null ? `${data.btc_dominance_pct.toFixed(2)}%` : '—'}</div>
                </div>
                <div>
                    <div className="text-gray-400 text-[10px]">Active coins</div>
                    <div className="text-gray-900 font-semibold">{data?.active_cryptocurrencies ?? '—'}</div>
                </div>
            </div>
        </CardShell>
    );
};

// ── Search sources card (web/news/X mixed list) ───────────────────────────
// Renders the search module's sources list as a compact, scrollable card —
// gives parity with the LangGraph project's NewsListCard / SourcesCard style.
// Shape mirrors `SearchSource` from SuperAgentChat (kept as `any` here to
// avoid an upward type import / circular dep).

// Two-stage favicon rendering with fallback chain (mirrors the project's
// existing SourceFavicon component):
//   1. Try Google's favicon service https://www.google.com/s2/favicons
//      → covers ~95% of news/blog/exchange domains
//   2. On error → 𝕏 glyph for x.com/twitter, neutral gray block otherwise
// `source.favicon` is a platform-name string (e.g. "x", "reddit"), NOT a URL,
// so we don't use it directly; we always derive favicon URL from `domain`.
const FaviconBlock: React.FC<{ source: any }> = ({ source }) => {
    const [imgFailed, setImgFailed] = React.useState(false);
    const dom = String(source?.domain || '').trim().toLowerCase();
    const isX = dom === 'x.com' || dom === 'twitter.com' || dom === 't.co';
    if (isX) {
        return <span className="text-[12px] text-gray-700 font-bold leading-none">𝕏</span>;
    }
    if (dom && !imgFailed) {
        return (
            <img
                src={`https://www.google.com/s2/favicons?domain=${dom}&sz=32`}
                alt=""
                className="w-3.5 h-3.5 rounded-sm"
                onError={() => setImgFailed(true)}
            />
        );
    }
    return <span className="w-3.5 h-3.5 rounded-sm bg-gray-200 inline-block" />;
};

/**
 * Drop the platform-name placeholders that backend synthesizes from research
 * stderr log lines (signalRadarThinking.ts) before real articles arrive.
 * Heuristic: a placeholder has its title equal to the platform name AND its
 * URL is the bare domain root (no path). Real articles have an article-style
 * URL with a path segment.
 */
const PLACEHOLDER_TITLES = new Set([
    'YouTube', 'Reddit', 'X / Twitter', 'X', 'Twitter', 'Web search (Exa)',
    'Sina Finance', '36Kr', 'Bloomberg',
]);
function isPlaceholderSource(s: { title?: string; url?: string; snippet?: string }): boolean {
    if (s.snippet && s.snippet.trim()) return false; // any real snippet → real source
    const title = (s.title || '').trim();
    if (!PLACEHOLDER_TITLES.has(title)) return false;
    if (!s.url) return true;
    try {
        const u = new URL(s.url);
        // Bare domain root (or trailing slash) is a placeholder.
        return u.pathname === '' || u.pathname === '/';
    } catch {
        return true;
    }
}

export const SearchSourcesCard: React.FC<{
    sources: Array<{ favicon?: string; title?: string; domain?: string; url?: string; snippet?: string }>;
    /** Max items shown collapsed; user can expand. Default 6. */
    initialCount?: number;
    title?: string;
}> = ({ sources, initialCount = 6, title = 'Sources' }) => {
    const [expanded, setExpanded] = React.useState(false);
    if (!sources || sources.length === 0) return null;
    // Hide platform placeholders unless that's all we have AND nothing real
    // arrived yet (in which case show them as "scanning…" hint instead of
    // pretending we've already pulled real articles).
    const real = sources.filter((s) => !isPlaceholderSource(s));
    const effective = real.length > 0 ? real : [];
    if (effective.length === 0) return null;
    const shown = expanded ? effective : effective.slice(0, initialCount);
    const hidden = effective.length - shown.length;
    return (
        <CardShell title={title} subtitle={`${effective.length} found`} provider="Web · X">
            <ul className="space-y-1">
                {shown.map((s, i) => {
                    const content = (
                        <>
                            <span className="shrink-0 w-4 h-4 inline-flex items-center justify-center">
                                <FaviconBlock source={s} />
                            </span>
                            <span className="flex-1 truncate text-[12px] text-gray-700 leading-snug">
                                {s.title || '(untitled)'}
                            </span>
                            <span className="shrink-0 text-[10px] text-gray-400" style={{ fontFamily: mono }}>
                                {s.domain || '—'}
                            </span>
                        </>
                    );
                    const cls = 'flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 transition-colors';
                    return (
                        <li key={`${s.url || s.title}-${i}`}>
                            {s.url ? (
                                <a href={s.url} target="_blank" rel="noopener" className={cls} title={s.title}>
                                    {content}
                                </a>
                            ) : (
                                <div className={cls} title={s.title}>{content}</div>
                            )}
                        </li>
                    );
                })}
            </ul>
            {hidden > 0 && (
                <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="mt-2 text-[11px] text-blue-600 hover:underline"
                >
                    Show {hidden} more
                </button>
            )}
        </CardShell>
    );
};

// ── Generic fallback for unregistered tools ────────────────────────────────

const GenericToolCard: React.FC<{ toolName: string; data: any }> = ({ toolName, data }) => {
    const isObj = data && typeof data === 'object' && !Array.isArray(data);
    const entries: Array<[string, any]> = isObj ? Object.entries(data).slice(0, 6) : [];
    return (
        <CardShell title={toolName}>
            {isObj && entries.length > 0 ? (
                <table className="w-full text-[11px]" style={{ fontFamily: mono }}>
                    <tbody>
                        {entries.map(([k, v]) => (
                            <tr key={k} className="border-b border-gray-100 last:border-0">
                                <td className="text-gray-400 py-1 pr-3">{k}</td>
                                <td className="text-gray-700 py-1 break-all">
                                    {typeof v === 'object' ? JSON.stringify(v).slice(0, 60) + '…' : String(v).slice(0, 80)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <pre className="text-[11px] text-gray-700 max-h-32 overflow-auto" style={{ fontFamily: mono }}>
                    {JSON.stringify(data, null, 2).slice(0, 400)}
                </pre>
            )}
        </CardShell>
    );
};

// ── OKX cards ──────────────────────────────────────────────────────────────

const OkxDerivativesCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="OKX derivatives" provider="OKX">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 80)}</div>
            </CardShell>
        );
    }
    const base = data?.baseCcy || '—';
    const spot = data?.spot;
    const deriv = data?.derivatives;
    const candle = data?.candleSummary;
    const funding = deriv?.fundingRate;
    return (
        <CardShell title="OKX derivatives" subtitle={base} provider="OKX">
            <div className="space-y-2">
                {spot && (
                    <div className="flex items-baseline gap-3 flex-wrap">
                        <span className="text-[15px] font-semibold text-gray-900" style={{ fontFamily: mono }}>
                            {fmtPrice(spot.last)}
                        </span>
                        <ChangeBadge pct={spot.change24hPct} />
                        <span className="text-[10px] text-gray-400">spot · {data.spotInstId || '—'}</span>
                    </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                        <div className="text-gray-400">Funding 8h</div>
                        <div className="text-gray-800 tabular-nums" style={{ fontFamily: mono }}>
                            {funding == null ? '—' : `${(funding * 100).toFixed(4)}%`}
                        </div>
                    </div>
                    <div>
                        <div className="text-gray-400">OI</div>
                        <div className="text-gray-800 tabular-nums" style={{ fontFamily: mono }}>
                            {deriv?.openInterestUsd != null ? `$${fmtNum(deriv.openInterestUsd)}` : '—'}
                        </div>
                    </div>
                    <div>
                        <div className="text-gray-400">Depth ±10</div>
                        <div className="text-gray-800 tabular-nums" style={{ fontFamily: mono }}>
                            {data?.orderbookDepthUsd != null ? `$${fmtNum(data.orderbookDepthUsd)}` : '—'}
                        </div>
                    </div>
                </div>
                {candle && (
                    <div className="flex items-baseline gap-3 text-[11px] pt-1 border-t border-gray-100">
                        <span className="text-gray-400">30d range</span>
                        <span className="text-gray-700 tabular-nums" style={{ fontFamily: mono }}>
                            {fmtPrice(candle.low_30d)} — {fmtPrice(candle.high_30d)}
                        </span>
                        <span className="text-gray-400">· {candle.rows} candles</span>
                    </div>
                )}
            </div>
        </CardShell>
    );
};

const OkxNewsSentimentCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="OKX news & sentiment" provider="OKX">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 80)}</div>
            </CardShell>
        );
    }
    const base = data?.baseCcy || '—';
    const sent = data?.sentiment;
    const news: any[] = Array.isArray(data?.news) ? data.news.slice(0, 5) : [];
    return (
        <CardShell title="OKX news & sentiment" subtitle={base} provider="OKX">
            <div className="space-y-2">
                {sent && (
                    <div className="flex items-center gap-3 flex-wrap text-[11px]">
                        {sent.label && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium uppercase tracking-wider text-[10px]">
                                {sent.label}
                            </span>
                        )}
                        {sent.bullishRatio != null && (
                            <span className="text-emerald-600 tabular-nums" style={{ fontFamily: mono }}>
                                ▲ {sent.bullishRatio.toFixed(1)}%
                            </span>
                        )}
                        {sent.bearishRatio != null && (
                            <span className="text-rose-500 tabular-nums" style={{ fontFamily: mono }}>
                                ▼ {sent.bearishRatio.toFixed(1)}%
                            </span>
                        )}
                        {sent.hotness != null && (
                            <span className="text-gray-500">· hotness {sent.hotness}</span>
                        )}
                        {sent.newsMentionCnt != null && (
                            <span className="text-gray-400">· {sent.newsMentionCnt} mentions</span>
                        )}
                    </div>
                )}
                {news.length > 0 ? (
                    <ul className="space-y-1.5">
                        {news.map((n, i) => (
                            <li key={i} className="text-[12px] leading-snug">
                                {n.url ? (
                                    <a href={n.url} target="_blank" rel="noreferrer" className="text-gray-700 hover:text-gray-900 hover:underline">
                                        {n.title}
                                    </a>
                                ) : (
                                    <span className="text-gray-700">{n.title}</span>
                                )}
                                <span className="text-gray-400 text-[10px] ml-1.5">
                                    {n.source ? `· ${n.source}` : ''}
                                    {n.sentiment ? ` · ${n.sentiment}` : ''}
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-gray-400 text-xs">No news items</div>
                )}
            </div>
        </CardShell>
    );
};

// ── Technical indicators card ──────────────────────────────────────────────

const TechnicalIndicatorsCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="Technical indicators" provider="CoinGecko">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 80)}</div>
            </CardShell>
        );
    }
    const rsi = data?.rsi_14;
    const macd = data?.macd;
    const bb = data?.bollinger;
    const verdict = data?.verdict || {};
    const last = data?.last_close;
    const sma20 = data?.sma_20;
    const sma50 = data?.sma_50;
    const rsiClass =
        verdict.rsi === 'overbought' ? 'text-rose-600' :
        verdict.rsi === 'oversold' ? 'text-emerald-600' : 'text-gray-700';
    const macdClass =
        verdict.macd === 'bullish' ? 'text-emerald-600' :
        verdict.macd === 'bearish' ? 'text-rose-500' : 'text-gray-700';
    return (
        <CardShell title="Technical indicators" subtitle={`${data?.days || '?'}d`} provider="CoinGecko">
            <div className="space-y-3">
                {/* RSI + MACD verdict row */}
                <div className="grid grid-cols-3 gap-2 text-[12px]">
                    <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                        <div className="text-[9.5px] uppercase tracking-wider text-gray-400">RSI(14)</div>
                        <div className={`font-semibold tabular-nums ${rsiClass}`} style={{ fontFamily: mono }}>
                            {rsi != null ? rsi.toFixed(1) : '—'}
                        </div>
                        <div className={`text-[10px] ${rsiClass} capitalize`}>{verdict.rsi || '—'}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                        <div className="text-[9.5px] uppercase tracking-wider text-gray-400">MACD</div>
                        <div className={`font-semibold tabular-nums ${macdClass}`} style={{ fontFamily: mono }}>
                            {macd?.histogram != null ? macd.histogram.toFixed(3) : '—'}
                        </div>
                        <div className={`text-[10px] ${macdClass} capitalize`}>{verdict.macd || '—'}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                        <div className="text-[9.5px] uppercase tracking-wider text-gray-400">BB</div>
                        <div className="font-semibold text-gray-700 tabular-nums" style={{ fontFamily: mono }}>
                            {verdict.bb === 'upper' ? '↑' : verdict.bb === 'lower' ? '↓' : '=='}
                        </div>
                        <div className="text-[10px] text-gray-500 capitalize">{verdict.bb || '—'} band</div>
                    </div>
                </div>
                {/* MA + price line */}
                {(last != null || sma20 != null || sma50 != null) && (
                    <div className="flex items-baseline gap-3 text-[11px] pt-1 border-t border-gray-100" style={{ fontFamily: mono }}>
                        {last != null && (
                            <span><span className="text-gray-400">Last</span> <span className="text-gray-800 tabular-nums">{fmtPrice(last)}</span></span>
                        )}
                        {sma20 != null && (
                            <span><span className="text-gray-400">MA20</span> <span className="text-gray-800 tabular-nums">{fmtPrice(sma20)}</span></span>
                        )}
                        {sma50 != null && (
                            <span><span className="text-gray-400">MA50</span> <span className="text-gray-800 tabular-nums">{fmtPrice(sma50)}</span></span>
                        )}
                    </div>
                )}
            </div>
        </CardShell>
    );
};

// ── Liquidations card ──────────────────────────────────────────────────────

const LiquidationsCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="Liquidations" provider="OKX">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 80)}</div>
            </CardShell>
        );
    }
    const longUsd = Number(data?.longNotionalUsd || 0);
    const shortUsd = Number(data?.shortNotionalUsd || 0);
    const longCnt = data?.longCount || 0;
    const shortCnt = data?.shortCount || 0;
    const total = longUsd + shortUsd;
    const longRatio = total > 0 ? (longUsd / total) * 100 : 0;
    const shortRatio = total > 0 ? (shortUsd / total) * 100 : 0;
    const events: any[] = Array.isArray(data?.recentEvents) ? data.recentEvents.slice(0, 5) : [];
    return (
        <CardShell title="Liquidations" subtitle={`${data?.baseCcy || ''} · 24h`} provider="OKX">
            <div className="space-y-3">
                {total === 0 ? (
                    <div className="text-gray-400 text-xs">No liquidations in the last 24h</div>
                ) : (
                    <>
                        {/* Long / short bar */}
                        <div>
                            <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
                                {longUsd > 0 && <div className="bg-emerald-500" style={{ width: `${longRatio}%` }} />}
                                {shortUsd > 0 && <div className="bg-rose-400" style={{ width: `${shortRatio}%` }} />}
                            </div>
                            <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
                                <div>
                                    <span className="text-emerald-600 font-semibold tabular-nums" style={{ fontFamily: mono }}>${fmtNum(longUsd)}</span>
                                    <span className="text-gray-400 ml-1">long ({longCnt})</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-gray-400 mr-1">short ({shortCnt})</span>
                                    <span className="text-rose-500 font-semibold tabular-nums" style={{ fontFamily: mono }}>${fmtNum(shortUsd)}</span>
                                </div>
                            </div>
                        </div>
                        {events.length > 0 && (
                            <ul className="space-y-1 pt-1 border-t border-gray-100">
                                {events.map((e, i) => (
                                    <li key={i} className="flex items-baseline justify-between text-[11px]" style={{ fontFamily: mono }}>
                                        <span className={`font-medium ${e.side === 'long' ? 'text-emerald-600' : 'text-rose-500'}`}>
                                            {e.side === 'long' ? '↗' : '↘'} {e.side}
                                        </span>
                                        <span className="text-gray-700 tabular-nums">{fmtPrice(e.price)}</span>
                                        <span className="text-gray-500 tabular-nums">${fmtNum(e.notionalUsd)}</span>
                                        <span className="text-gray-400 text-[10px]">{e.instId}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                )}
            </div>
        </CardShell>
    );
};

// ── Stocks tool cards (Python ReAct agent) ─────────────────────────────────

/** Realtime stock quote — shape comes from data_tools.py
 *  `_handle_get_realtime_quote`: code, name, price, change_pct, volume,
 *  amount, turnover_rate, pe_ratio, pb_ratio, total_mv, circ_mv, etc. */
const StockRealtimeQuoteCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="Realtime quote" provider="A-share/HK/US">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 80)}</div>
            </CardShell>
        );
    }
    const code = data?.code ?? '—';
    const name = data?.name ?? '';
    const price = typeof data?.price === 'number' ? data.price : parseFloat(String(data?.price ?? ''));
    const chgPct = typeof data?.change_pct === 'number' ? data.change_pct : parseFloat(String(data?.change_pct ?? ''));
    return (
        <CardShell title={code} subtitle={name} provider={data?.source || 'Realtime'}>
            <div className="flex items-baseline gap-3">
                <span className="text-gray-900 text-3xl font-bold tabular-nums tracking-tight" style={{ fontFamily: mono }}>
                    {Number.isFinite(price) ? price.toFixed(price >= 100 ? 2 : 3) : '—'}
                </span>
                <ChangeBadge pct={Number.isFinite(chgPct) ? chgPct : undefined} />
            </div>
            <div className="mt-3 grid grid-cols-3 divide-x divide-gray-100 -mx-1">
                <div className="px-3">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400">Volume</div>
                    <div className="text-[12px] text-gray-800 font-medium tabular-nums" style={{ fontFamily: mono }}>{fmtNum(data?.volume)}</div>
                </div>
                <div className="px-3">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400">Amount</div>
                    <div className="text-[12px] text-gray-800 font-medium tabular-nums" style={{ fontFamily: mono }}>{fmtNum(data?.amount)}</div>
                </div>
                <div className="px-3">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400">Turnover</div>
                    <div className="text-[12px] text-gray-800 font-medium tabular-nums" style={{ fontFamily: mono }}>
                        {data?.turnover_rate != null ? `${Number(data.turnover_rate).toFixed(2)}%` : '—'}
                    </div>
                </div>
            </div>
            {(data?.pe_ratio != null || data?.pb_ratio != null || data?.total_mv != null) && (
                <div className="mt-3 flex items-baseline gap-4 text-[11px] pt-2 border-t border-gray-100" style={{ fontFamily: mono }}>
                    {data?.pe_ratio != null && (
                        <span><span className="text-gray-400">PE</span> <span className="text-gray-800 tabular-nums">{Number(data.pe_ratio).toFixed(1)}x</span></span>
                    )}
                    {data?.pb_ratio != null && (
                        <span><span className="text-gray-400">PB</span> <span className="text-gray-800 tabular-nums">{Number(data.pb_ratio).toFixed(2)}x</span></span>
                    )}
                    {data?.total_mv != null && (
                        <span><span className="text-gray-400">Mcap</span> <span className="text-gray-800 tabular-nums">{fmtNum(data.total_mv)}</span></span>
                    )}
                </div>
            )}
        </CardShell>
    );
};

/** Daily history — data_tools.py returns `{code, source, total_records, data: [{date,open,high,low,close,...}]}`.
 *  Render a sparkline of closes + last record summary. */
const StockDailyHistoryCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="Daily history" provider="A-share/HK/US">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 80)}</div>
            </CardShell>
        );
    }
    // Server may have truncated arrays; handle either shape.
    const rows: any[] = Array.isArray(data?.data) ? data.data
        : (data?.data?._truncated ? data.data.sample : []);
    const closes = rows.map((r) => Number(r?.close)).filter((v) => Number.isFinite(v));
    const W = 360, H = 60;
    let pathLine = '', pathArea = '', stroke = '#10b981';
    let pct: number | null = null;
    if (closes.length >= 2) {
        const min = Math.min(...closes), max = Math.max(...closes);
        const range = max - min || 1;
        const stepX = W / (closes.length - 1);
        const pts = closes.map((c, i) => `${(i * stepX).toFixed(1)},${(H - ((c - min) / range) * H).toFixed(1)}`);
        pathLine = 'M' + pts.join(' L');
        pathArea = `${pathLine} L${W},${H} L0,${H} Z`;
        pct = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
        stroke = pct >= 0 ? '#10b981' : '#f43f5e';
    }
    const last = rows[rows.length - 1];
    return (
        <CardShell title="Daily history" subtitle={`${data?.code || ''} · ${rows.length}d`} provider={data?.source || 'Market'}>
            {pathLine && (
                <>
                    <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-[11px] text-gray-500" style={{ fontFamily: mono }}>{closes.length} candles</span>
                        <ChangeBadge pct={pct ?? undefined} />
                    </div>
                    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-14 w-full">
                        <defs>
                            <linearGradient id="stock-hist-gradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
                                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <path d={pathArea} fill="url(#stock-hist-gradient)" />
                        <path d={pathLine} fill="none" stroke={stroke} strokeWidth={1.5} />
                    </svg>
                </>
            )}
            {last && (
                <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]" style={{ fontFamily: mono }}>
                    <div><div className="text-gray-400">Open</div><div className="text-gray-700 tabular-nums">{Number(last.open).toFixed(2)}</div></div>
                    <div><div className="text-gray-400">High</div><div className="text-gray-700 tabular-nums">{Number(last.high).toFixed(2)}</div></div>
                    <div><div className="text-gray-400">Low</div><div className="text-gray-700 tabular-nums">{Number(last.low).toFixed(2)}</div></div>
                    <div><div className="text-gray-400">Close</div><div className="text-gray-700 tabular-nums">{Number(last.close).toFixed(2)}</div></div>
                </div>
            )}
        </CardShell>
    );
};

/** Trend analysis — analysis_tools.py returns trend_status, ma_alignment,
 *  buy_signal, plus a few numeric fields. Verdict-style card. */
const StockTrendCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="Trend analysis" provider="Analysis">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 80)}</div>
            </CardShell>
        );
    }
    const trend = data?.trend_status || data?.trend || '—';
    const ma = data?.ma_alignment || '—';
    const signal = data?.buy_signal || data?.signal || '—';
    const colorOf = (v: string) => /up|多|涨|bull|buy/i.test(v) ? 'text-emerald-600' : /down|空|跌|bear|sell/i.test(v) ? 'text-rose-500' : 'text-gray-700';
    return (
        <CardShell title="Trend analysis" provider="Analysis">
            <div className="grid grid-cols-3 gap-2 text-[12px]">
                <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                    <div className="text-[9.5px] uppercase tracking-wider text-gray-400">Trend</div>
                    <div className={`font-semibold ${colorOf(String(trend))}`}>{String(trend)}</div>
                </div>
                <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                    <div className="text-[9.5px] uppercase tracking-wider text-gray-400">MA Alignment</div>
                    <div className={`font-semibold ${colorOf(String(ma))}`}>{String(ma)}</div>
                </div>
                <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                    <div className="text-[9.5px] uppercase tracking-wider text-gray-400">Signal</div>
                    <div className={`font-semibold ${colorOf(String(signal))}`}>{String(signal)}</div>
                </div>
            </div>
        </CardShell>
    );
};

/** Moving averages — calculate_ma returns {ma5, ma10, ma20, ma60, ...}
 *  with current values (last row). */
const StockMovingAveragesCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="Moving averages" provider="Analysis">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 80)}</div>
            </CardShell>
        );
    }
    // Try common shape: {current_price, ma5, ma10, ma20, ma60, ma120}
    const entries: Array<[string, any]> = [];
    for (const k of ['current_price', 'ma5', 'ma10', 'ma20', 'ma60', 'ma120', 'ma250']) {
        if (data?.[k] != null) entries.push([k, data[k]]);
    }
    if (entries.length === 0 && data?.values) {
        for (const [k, v] of Object.entries(data.values)) entries.push([k, v]);
    }
    return (
        <CardShell title="Moving averages" provider="Analysis">
            <div className="grid grid-cols-3 gap-2 text-[11px]" style={{ fontFamily: mono }}>
                {entries.map(([k, v]) => (
                    <div key={k}>
                        <div className="text-[9.5px] uppercase tracking-wider text-gray-400">{k.replace(/_/g, ' ')}</div>
                        <div className="text-gray-800 tabular-nums">{typeof v === 'number' ? v.toFixed(2) : String(v)}</div>
                    </div>
                ))}
            </div>
        </CardShell>
    );
};

/** Capital flow — get_capital_flow returns 主力净流入 / 散户净流入 etc. */
const StockCapitalFlowCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="Capital flow" provider="Market">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 80)}</div>
            </CardShell>
        );
    }
    const fields: Array<{ key: string; label: string }> = [
        { key: 'main_net_inflow', label: 'Main Net' },
        { key: 'super_net_inflow', label: 'Super Net' },
        { key: 'large_net_inflow', label: 'Large Net' },
        { key: 'medium_net_inflow', label: 'Medium' },
        { key: 'small_net_inflow', label: 'Retail' },
    ];
    return (
        <CardShell title="Capital flow" subtitle={data?.code} provider="Market">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px]" style={{ fontFamily: mono }}>
                {fields.map(({ key, label }) => {
                    const v = data?.[key];
                    if (v == null) return null;
                    const num = typeof v === 'number' ? v : parseFloat(String(v));
                    const isPos = num > 0;
                    return (
                        <div key={key}>
                            <span className="text-gray-400">{label}</span>{' '}
                            <span className={`tabular-nums ${isPos ? 'text-emerald-600' : 'text-rose-500'}`}>
                                {isPos ? '+' : ''}{fmtNum(num)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </CardShell>
    );
};

/** Stock profile — get_stock_info returns description, sector, industry, ... */
const StockInfoCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="Stock profile" provider="Market">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 80)}</div>
            </CardShell>
        );
    }
    const desc = String(data?.description || data?.business_intro || '').slice(0, 240);
    const tags: string[] = [];
    if (data?.sector) tags.push(String(data.sector));
    if (data?.industry) tags.push(String(data.industry));
    if (data?.list_date) tags.push(`Listed ${data.list_date}`);
    return (
        <CardShell title="Stock profile" subtitle={data?.code || data?.symbol} provider="Market">
            <div className="space-y-2.5">
                {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {tags.map((t, i) => (
                            <span key={i} className="text-[10.5px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-100">
                                {t}
                            </span>
                        ))}
                    </div>
                )}
                {desc && (
                    <p className="text-[12.5px] text-gray-700 leading-relaxed">{desc}{desc.length >= 240 ? '…' : ''}</p>
                )}
            </div>
        </CardShell>
    );
};

/** Stock news — search_stock_news / search_comprehensive_intel return
 *  {provider, results: [{title, url, source, ...}]} or dimensions. */
const StockNewsCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="Stock news" provider="Web search">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 80)}</div>
            </CardShell>
        );
    }
    let items: any[] = Array.isArray(data?.results) ? data.results : [];
    if (items.length === 0 && data?.dimensions) {
        for (const dim of Object.values(data.dimensions as Record<string, any>)) {
            if (Array.isArray((dim as any)?.results)) items = items.concat((dim as any).results);
        }
    }
    const dedupBy = new Map<string, any>();
    for (const it of items) {
        const k = (it?.url || it?.title || '').toString().toLowerCase();
        if (k && !dedupBy.has(k)) dedupBy.set(k, it);
    }
    const news = Array.from(dedupBy.values()).slice(0, 6);
    return (
        <CardShell title="Stock news" subtitle={`${news.length} found`} provider={data?.provider || 'Web'}>
            {news.length > 0 ? (
                <ul className="space-y-1">
                    {news.map((n, i) => (
                        <li key={i} className="text-[12px] leading-snug">
                            {n.url ? (
                                <a href={n.url} target="_blank" rel="noreferrer" className="text-gray-700 hover:text-blue-600 hover:underline">
                                    {n.title || '(untitled)'}
                                </a>
                            ) : (
                                <span className="text-gray-700">{n.title || '(untitled)'}</span>
                            )}
                            {n.source && (
                                <span className="text-gray-400 text-[10px] ml-1.5">· {n.source}</span>
                            )}
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="text-gray-400 text-xs">No news items</div>
            )}
        </CardShell>
    );
};

/** Volume analysis — get_volume_analysis returns avg/current/ratio. */
const StockVolumeCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="Volume analysis" provider="Analysis">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 80)}</div>
            </CardShell>
        );
    }
    const ratio = typeof data?.volume_ratio === 'number' ? data.volume_ratio
        : (typeof data?.ratio === 'number' ? data.ratio : null);
    const ratioClass = ratio == null ? 'text-gray-700' : ratio >= 1.5 ? 'text-emerald-600' : ratio <= 0.6 ? 'text-rose-500' : 'text-gray-700';
    return (
        <CardShell title="Volume analysis" provider="Analysis">
            <div className="grid grid-cols-3 gap-2 text-[11px]" style={{ fontFamily: mono }}>
                <div>
                    <div className="text-[9.5px] uppercase tracking-wider text-gray-400">Avg vol</div>
                    <div className="text-gray-800 tabular-nums">{fmtNum(data?.average_volume ?? data?.avg)}</div>
                </div>
                <div>
                    <div className="text-[9.5px] uppercase tracking-wider text-gray-400">Cur vol</div>
                    <div className="text-gray-800 tabular-nums">{fmtNum(data?.current_volume ?? data?.current)}</div>
                </div>
                <div>
                    <div className="text-[9.5px] uppercase tracking-wider text-gray-400">Ratio</div>
                    <div className={`font-semibold tabular-nums ${ratioClass}`}>{ratio != null ? ratio.toFixed(2) + 'x' : '—'}</div>
                </div>
            </div>
        </CardShell>
    );
};

/** Pattern recognition — analyze_pattern returns detected pattern + signal. */
const StockPatternCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="Pattern recognition" provider="Analysis">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 80)}</div>
            </CardShell>
        );
    }
    const patterns: string[] = Array.isArray(data?.patterns) ? data.patterns
        : data?.pattern ? [String(data.pattern)] : [];
    const desc = String(data?.description || data?.signal_explanation || '').slice(0, 200);
    return (
        <CardShell title="Pattern recognition" provider="Analysis">
            <div className="space-y-2">
                {patterns.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {patterns.map((p, i) => (
                            <span key={i} className="text-[10.5px] px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 font-medium border border-violet-100">
                                {p}
                            </span>
                        ))}
                    </div>
                )}
                {desc && <p className="text-[12px] text-gray-700 leading-relaxed">{desc}</p>}
            </div>
        </CardShell>
    );
};

// ── A-share / US / HK extension cards (SuperAgent v2 tools) ────────────────

/** A-share financial reports — shape from financialReportTool.ts:
 *  { stock_code, period, abstract_count, abstract: [{报告期, 营业总收入, 净利润, ...}],
 *    yjyg, yjkb, yjbb, errors }. Render a compact multi-period preview table
 *  (3-4 rows, most recent first) plus optional 业绩预告 chip. */
const FinancialReportCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="财务报告" provider="同花顺 / 东方财富">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 120)}</div>
            </CardShell>
        );
    }
    const code = data?.stock_code ?? '—';
    const periodAnchor = data?.period ?? '';
    const abstractRows: any[] = Array.isArray(data?.abstract) ? data.abstract : [];
    const previewRows = abstractRows.slice(0, 4);
    const yjyg = data?.yjyg?.row;
    const yjkb = data?.yjkb?.row;

    // Pick a few canonical fields per row — akshare's column names vary
    // slightly across years (rev/profit YoY suffixes). Use lookups.
    const pick = (row: any, keys: string[]): string => {
        for (const k of keys) {
            if (row && row[k] != null && row[k] !== '') return String(row[k]);
        }
        return '—';
    };

    return (
        <CardShell title="财务报告" subtitle={code} provider={`同花顺 · ${previewRows.length}/${data?.abstract_count ?? 0} 期`}>
            {previewRows.length > 0 ? (
                <div className="overflow-x-auto -mx-3.5">
                    <table className="w-full text-[11px]" style={{ fontFamily: mono }}>
                        <thead>
                            <tr className="text-gray-400 uppercase tracking-wider">
                                <th className="px-3.5 py-1 text-left font-normal">报告期</th>
                                <th className="px-2 py-1 text-right font-normal">营收</th>
                                <th className="px-2 py-1 text-right font-normal">同比</th>
                                <th className="px-2 py-1 text-right font-normal">净利</th>
                                <th className="px-3.5 py-1 text-right font-normal">毛利率</th>
                            </tr>
                        </thead>
                        <tbody>
                            {previewRows.map((row, i) => (
                                <tr key={i} className="border-t border-gray-100">
                                    <td className="px-3.5 py-1 text-gray-700">{pick(row, ['报告期', 'date'])}</td>
                                    <td className="px-2 py-1 text-gray-800 tabular-nums text-right">
                                        {pick(row, ['营业总收入', '营业收入', 'revenue'])}
                                    </td>
                                    <td className="px-2 py-1 text-right tabular-nums">
                                        <span className={
                                            (pick(row, ['营业总收入同比增长率', '营业收入同比增长率']) || '').toString().startsWith('-')
                                                ? 'text-rose-500'
                                                : 'text-emerald-600'
                                        }>
                                            {pick(row, ['营业总收入同比增长率', '营业收入同比增长率'])}
                                        </span>
                                    </td>
                                    <td className="px-2 py-1 text-gray-800 tabular-nums text-right">
                                        {pick(row, ['净利润', '归母净利润'])}
                                    </td>
                                    <td className="px-3.5 py-1 text-gray-800 tabular-nums text-right">
                                        {pick(row, ['销售毛利率', '毛利率'])}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-gray-400 text-[11px]">财务摘要未返回；请期待业绩预告 / 业绩快报。</div>
            )}
            {(yjyg || yjkb) && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1.5">
                    {yjyg && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium border border-amber-100">
                            业绩预告 · {data?.yjyg?.period ?? ''}
                        </span>
                    )}
                    {yjkb && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-100">
                            业绩快报 · {data?.yjkb?.period ?? ''}
                        </span>
                    )}
                </div>
            )}
            <div className="mt-2 text-[9.5px] text-gray-400 uppercase tracking-[0.12em]" style={{ fontFamily: mono }}>
                anchor period: {periodAnchor}
            </div>
        </CardShell>
    );
};

/** SEC EDGAR filings — shape from secFilingsTool.ts:
 *  { ticker, cik, companyName, sicDescription, exchanges, formTypes,
 *    totalMatched, filings: { '10-K': [{filingDate, primaryDocDescription,
 *    primaryDocUrl, ...}], '10-Q': [...], '8-K': [...] } }. Render most
 *  recent filings grouped by form type with clickable doc links. */
const SecFilingsCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="SEC EDGAR" provider="data.sec.gov">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 100)}</div>
            </CardShell>
        );
    }
    const ticker = data?.ticker ?? '—';
    const companyName = data?.companyName ?? '';
    const filings = data?.filings || {};
    const formTypes: string[] = Array.isArray(data?.formTypes) ? data.formTypes : Object.keys(filings);
    return (
        <CardShell
            title={ticker}
            subtitle={companyName}
            provider={`SEC EDGAR · CIK ${data?.cik ?? ''}`}
        >
            <div className="space-y-2.5">
                {formTypes.map((form) => {
                    const rows: any[] = Array.isArray(filings[form]) ? filings[form] : [];
                    if (rows.length === 0) return null;
                    return (
                        <div key={form}>
                            <div className="text-[10px] uppercase tracking-[0.12em] text-gray-400 mb-1" style={{ fontFamily: mono }}>
                                {form} · {rows.length}
                            </div>
                            <ul className="space-y-1">
                                {rows.slice(0, 3).map((f, i) => (
                                    <li key={i} className="flex items-baseline justify-between gap-3 text-[11.5px]">
                                        <a
                                            href={f.primaryDocUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline truncate flex-1"
                                            title={f.primaryDocDescription}
                                        >
                                            {String(f.primaryDocDescription || f.form || form).slice(0, 50) || form}
                                        </a>
                                        <span className="text-gray-400 tabular-nums shrink-0" style={{ fontFamily: mono }}>
                                            {f.filingDate}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}
                {data?.totalMatched > 0 && (
                    <div className="text-[10px] text-gray-400 pt-1.5 border-t border-gray-100">
                        Total: {data.totalMatched} filing(s) · {data?.sicDescription || data?.exchanges?.join(', ') || ''}
                    </div>
                )}
            </div>
        </CardShell>
    );
};

/** HSGT Stock Connect flow — shape from hsgtFlowTool.ts:
 *  { direction, days, ticker, history_*: [{日期, 当日成交净买额, ...}],
 *    summary?: [...], per_stock_holdings?: [...] }. Render most recent
 *  net-flow values with sparkline-ish trend. */
const HsgtFlowCard: React.FC<{ data: any }> = ({ data }) => {
    if (data?.error) {
        return (
            <CardShell title="沪深港通资金流向" provider="东方财富">
                <div className="text-gray-400 text-xs">{String(data.error).slice(0, 120)}</div>
            </CardShell>
        );
    }
    const direction = data?.direction ?? 'summary';
    const ticker = data?.ticker;

    // Per-stock view takes precedence (either A-share NB or HK SB holdings)
    if (ticker && Array.isArray(data?.per_stock_holdings) && data.per_stock_holdings.length > 0) {
        const rows = data.per_stock_holdings.slice(-7).reverse();
        const isSouthbound = data?.ticker_type === 'HK_southbound';
        const titleLabel = isSouthbound ? '南向持仓 (港股通买入)' : '北向持仓变动';
        return (
            <CardShell title={titleLabel} subtitle={data?.stock_code || ticker} provider="沪深港通">
                <table className="w-full text-[11px]" style={{ fontFamily: mono }}>
                    <thead>
                        <tr className="text-gray-400 uppercase tracking-wider">
                            <th className="py-1 text-left font-normal">日期</th>
                            <th className="py-1 text-right font-normal">持股数</th>
                            <th className="py-1 text-right font-normal">{isSouthbound ? '持股市值' : '持股比例'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row: any, i: number) => (
                            <tr key={i} className="border-t border-gray-100">
                                <td className="py-1 text-gray-700">{row?.持股日期 || row?.日期 || '—'}</td>
                                <td className="py-1 text-gray-800 tabular-nums text-right">
                                    {row?.持股数量 || row?.持股股数 || row?.['持股数量(股)'] || '—'}
                                </td>
                                <td className="py-1 text-gray-800 tabular-nums text-right">
                                    {isSouthbound
                                        ? (row?.持股市值 || row?.['持股市值(元)'] || row?.市值 || '—')
                                        : (row?.持股市值占比 || row?.持股比例 || '—')}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </CardShell>
        );
    }

    const renderChannel = (label: string, key: string) => {
        const rows: any[] = Array.isArray((data as any)[key]) ? (data as any)[key] : [];
        if (rows.length === 0) return null;
        const recent = rows.slice(-1)[0] || {};
        const netBuy = recent['当日成交净买额'] ?? recent['当日资金流入'] ?? recent['净买额'] ?? '—';
        const netBuyNum = typeof netBuy === 'number' ? netBuy : parseFloat(String(netBuy));
        const isNegative = Number.isFinite(netBuyNum) && netBuyNum < 0;
        return (
            <div key={key} className="flex items-baseline justify-between gap-3">
                <span className="text-[11.5px] text-gray-600">{label}</span>
                <span className={`text-[12px] font-medium tabular-nums ${isNegative ? 'text-rose-500' : 'text-emerald-600'}`}
                      style={{ fontFamily: mono }}>
                    {String(netBuy)}
                </span>
            </div>
        );
    };

    // Summary mode: today's 4-channel snapshot.
    // akshare's stock_hsgt_fund_flow_summary_em splits the channel info
    // across TWO columns: `类型` (沪港通 / 深港通) and `资金方向` (北向 / 南向).
    // We need to join them so the user sees "沪股通 (北向)" vs "港股通沪 (南向)"
    // — without that combo, 4 rows show only 2 distinct labels and look broken.
    if (direction === 'summary' && Array.isArray(data?.summary) && data.summary.length > 0) {
        const combinedLabel = (row: any): string => {
            const channel = row?.类型 || row?.板块 || row?.通道 || row?.指标 || '';
            const dir = row?.资金方向 || row?.方向 || '';
            // Map (类型 + 方向) to canonical channel names if both known
            if (channel && dir) {
                const c = String(channel);
                const d = String(dir);
                if (c.includes('沪')) return d.includes('北') ? '沪股通 (北向)' : '港股通沪 (南向)';
                if (c.includes('深')) return d.includes('北') ? '深股通 (北向)' : '港股通深 (南向)';
                return `${c} (${d})`;
            }
            return channel || dir || '—';
        };
        return (
            <CardShell title="沪深港通资金流向" subtitle="今日快照" provider="东方财富">
                <table className="w-full text-[11px]" style={{ fontFamily: mono }}>
                    <thead>
                        <tr className="text-gray-400 uppercase tracking-wider">
                            <th className="py-1 text-left font-normal">通道</th>
                            <th className="py-1 text-right font-normal">净买额</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.summary.map((row: any, i: number) => {
                            const label = combinedLabel(row);
                            const netBuyRaw = row?.今日资金流入 ?? row?.成交净买额 ?? row?.净买额 ?? row?.当日资金流入 ?? null;
                            const numVal = typeof netBuyRaw === 'number' ? netBuyRaw : parseFloat(String(netBuyRaw ?? ''));
                            const isNbZero = Number.isFinite(numVal) && numVal === 0 && /北向/.test(label);
                            const neg = Number.isFinite(numVal) && numVal < 0;
                            // Trim float noise to 2 decimal places when it's a finite number
                            const display = Number.isFinite(numVal)
                                ? (Math.abs(numVal) >= 100 ? numVal.toFixed(0) : numVal.toFixed(2))
                                : (netBuyRaw == null ? '—' : String(netBuyRaw));
                            return (
                                <tr key={i} className="border-t border-gray-100">
                                    <td className="py-1 text-gray-700">{label}</td>
                                    <td className={`py-1 tabular-nums text-right ${isNbZero ? 'text-gray-400' : neg ? 'text-rose-500' : 'text-emerald-600'}`}>
                                        {display}
                                        {isNbZero && <span className="ml-1 text-[9px] text-gray-400">(制度性归零)</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </CardShell>
        );
    }

    // History mode: show latest day's net buy per active channel + small trend
    const channelLabels: Array<[string, string]> = [
        ['沪股通 (NB)', 'history_沪股通'],
        ['深股通 (NB)', 'history_深股通'],
        ['港股通沪 (SB)', 'history_港股通沪'],
        ['港股通深 (SB)', 'history_港股通深'],
    ];
    const lines = channelLabels
        .map(([label, key]) => renderChannel(label, key))
        .filter(Boolean);
    return (
        <CardShell
            title="沪深港通资金流向"
            subtitle={`${direction} · ${data?.days ?? ''}d`}
            provider="东方财富"
        >
            {lines.length > 0 ? (
                <div className="space-y-1.5">{lines}</div>
            ) : (
                <div className="text-gray-400 text-[11px]">本期通道数据为空。</div>
            )}
        </CardShell>
    );
};

// ── Registry ───────────────────────────────────────────────────────────────

type Renderer = React.FC<{ data: any }>;

const TOOL_RENDERERS: Record<string, Renderer> = {
    search_crypto_asset: SearchCryptoCard,
    get_token_price_and_market: TokenPriceCard,
    get_token_detail: CoinDetailCard,
    get_price_history: PriceHistoryCard,
    get_trending_coins: TrendingCoinsCard,
    get_market_rankings: MarketRankingsCard,
    get_global_market_overview: GlobalMarketCard,
    get_okx_derivatives: OkxDerivativesCard,
    get_okx_news_sentiment: OkxNewsSentimentCard,
    get_token_technical_indicators: TechnicalIndicatorsCard,
    get_okx_liquidations: LiquidationsCard,
    // ── Stocks (Python ReAct agent) ──
    get_realtime_quote: StockRealtimeQuoteCard,
    get_daily_history: StockDailyHistoryCard,
    analyze_trend: StockTrendCard,
    calculate_ma: StockMovingAveragesCard,
    get_capital_flow: StockCapitalFlowCard,
    get_stock_info: StockInfoCard,
    search_stock_news: StockNewsCard,
    search_comprehensive_intel: StockNewsCard,
    get_volume_analysis: StockVolumeCard,
    analyze_pattern: StockPatternCard,
    // ── SuperAgent v2 extension tools (A-share earnings / SEC / HSGT) ──
    financial_report: FinancialReportCard,
    sec_filings: SecFilingsCard,
    hsgt_flow: HsgtFlowCard,
    // get_chip_distribution / get_analysis_context / get_portfolio_snapshot /
    // get_market_indices / get_sector_rankings / *_backtest_summary fall back
    // to GenericToolCard until we add dedicated renderers.
};

export const Web3ToolResultCard: React.FC<{ toolName: string; rawData: any }> = ({ toolName, rawData }) => {
    const Renderer = TOOL_RENDERERS[toolName];
    if (Renderer) return <Renderer data={rawData} />;
    return <GenericToolCard toolName={toolName} data={rawData} />;
};

// ── ToolCallPills (compact "called: 解析代币 · pengu" badges) ──────────────

const TOOL_LABELS_ZH: Record<string, string> = {
    search_crypto_asset: '解析代币',
    get_token_price_and_market: '查代币价格',
    get_token_detail: '查项目资料',
    get_price_history: '拉 K 线历史',
    get_trending_coins: '查热度榜',
    get_market_rankings: '查市场排行',
    get_global_market_overview: '看全市场',
    get_institutional_holdings: '查机构持仓',
    get_exchange_rankings: '查交易所排名',
    get_nft_collection: '查 NFT 数据',
    get_onchain_pools: '扫描链上池子',
    get_category_coins: '查赛道代币',
    get_okx_derivatives: 'OKX 衍生品',
    get_okx_news_sentiment: 'OKX 新闻情绪',
    get_token_technical_indicators: '技术指标',
    get_okx_liquidations: '爆仓数据',
    // ── Stocks (Python ReAct agent) ──
    get_realtime_quote: '实时行情',
    get_daily_history: '日 K 历史',
    get_chip_distribution: '筹码分布',
    get_analysis_context: '历史分析',
    get_stock_info: '公司资料',
    get_portfolio_snapshot: '组合快照',
    get_capital_flow: '资金流向',
    analyze_trend: '趋势分析',
    calculate_ma: '均线计算',
    get_volume_analysis: '成交量分析',
    analyze_pattern: '形态识别',
    search_stock_news: '搜索新闻',
    search_comprehensive_intel: '综合情报',
    get_market_indices: '大盘指数',
    get_sector_rankings: '板块排名',
    get_skill_backtest_summary: '技能回测',
    get_strategy_backtest_summary: '策略回测',
    get_stock_backtest_summary: '个股回测',
    // ── SuperAgent v2 extension tools ──
    financial_report: '财务报告',
    sec_filings: 'SEC 文件',
    hsgt_flow: '沪深港通',
};

const TOOL_LABELS_EN: Record<string, string> = {
    search_crypto_asset: 'resolve token',
    get_token_price_and_market: 'fetch price',
    get_token_detail: 'project profile',
    get_price_history: 'price history',
    get_trending_coins: 'trending',
    get_market_rankings: 'market rankings',
    get_global_market_overview: 'global market',
    get_institutional_holdings: 'institutional holdings',
    get_exchange_rankings: 'exchange rankings',
    get_nft_collection: 'NFT data',
    get_onchain_pools: 'onchain pools',
    get_category_coins: 'sector coins',
    get_okx_derivatives: 'OKX derivatives',
    get_okx_news_sentiment: 'OKX news & mood',
    get_token_technical_indicators: 'technicals',
    get_okx_liquidations: 'liquidations',
    // ── Stocks (Python ReAct agent) ──
    get_realtime_quote: 'realtime quote',
    get_daily_history: 'daily history',
    get_chip_distribution: 'chip distribution',
    get_analysis_context: 'analysis context',
    get_stock_info: 'stock profile',
    get_portfolio_snapshot: 'portfolio',
    get_capital_flow: 'capital flow',
    analyze_trend: 'trend',
    calculate_ma: 'moving averages',
    get_volume_analysis: 'volume',
    analyze_pattern: 'pattern',
    search_stock_news: 'stock news',
    search_comprehensive_intel: 'intel search',
    get_market_indices: 'market indices',
    get_sector_rankings: 'sector rankings',
    get_skill_backtest_summary: 'skill backtest',
    get_strategy_backtest_summary: 'strategy backtest',
    get_stock_backtest_summary: 'stock backtest',
    // ── SuperAgent v2 extension tools ──
    financial_report: 'earnings reports',
    sec_filings: 'SEC filings',
    hsgt_flow: 'Stock Connect flow',
    // Search-side pseudo-tools (not real LLM tool calls — synthesized from
    // the `search` module's state to give visual parity with web3 pills).
    search_web: 'searching web',
    search_x: 'reading X',
    search_news: 'reading news',
};

type ToolPillState = 'active' | 'completed' | 'failed' | 'skipped';

type ToolCategory = 'search' | 'data' | 'analyze' | 'signal';

/**
 * Maps tool names to semantic categories. Drives the pill color theme:
 * - search:  web / X / news lookup (blue)
 * - data:    fetch concrete numbers (price/profile/history) (green)
 * - analyze: derived analytics (technicals/trend/pattern) (purple)
 * - signal:  exchange/derivatives/on-chain (OKX/funding) (orange)
 * Unknown tools fall back to "data" (neutral default).
 */
const TOOL_CATEGORY: Record<string, ToolCategory> = {
    // Search
    search_web: 'search', search_x: 'search', search_news: 'search',
    search_stock_news: 'search', search_comprehensive_intel: 'search',
    // Token / equity data
    search_crypto_asset: 'data',
    get_token_price_and_market: 'data', get_token_detail: 'data', get_price_history: 'data',
    get_trending_coins: 'data', get_market_rankings: 'data', get_global_market_overview: 'data',
    get_institutional_holdings: 'data', get_exchange_rankings: 'data',
    get_nft_collection: 'data', get_onchain_pools: 'data', get_category_coins: 'data',
    get_realtime_quote: 'data', get_daily_history: 'data',
    get_analysis_context: 'data', get_stock_info: 'data',
    get_portfolio_snapshot: 'data', get_market_indices: 'data', get_sector_rankings: 'data',
    // Analyze
    get_token_technical_indicators: 'analyze',
    analyze_trend: 'analyze', calculate_ma: 'analyze', analyze_pattern: 'analyze',
    get_volume_analysis: 'analyze',
    get_skill_backtest_summary: 'analyze', get_strategy_backtest_summary: 'analyze',
    get_stock_backtest_summary: 'analyze',
    // Signal (derivatives / on-chain / liquidations / capital flow)
    get_okx_derivatives: 'signal', get_okx_news_sentiment: 'signal', get_okx_liquidations: 'signal',
    get_chip_distribution: 'signal', get_capital_flow: 'signal',
    hsgt_flow: 'signal',
    // SuperAgent v2 extension tools — financial reports + SEC filings = data
    financial_report: 'data', sec_filings: 'data',
};

function categorizeToolName(name: string): ToolCategory {
    return TOOL_CATEGORY[name] || 'data';
}

/** Compact duration string: 230ms → "0.2s", 1850ms → "1.9s", 14300ms → "14s". */
function fmtDurationMs(ms?: number): string | null {
    if (ms == null || !Number.isFinite(ms)) return null;
    if (ms < 100) return null; // too short to be meaningful
    if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.round(ms / 1000)}s`;
}

// ── State icons — small inline SVG ──────────────────────────────
const ICON_CHECK = (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.3" className="w-2.5 h-2.5">
        <path d="M2.5 6.5l2.5 2.5 5-5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
const ICON_X = (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-2.5 h-2.5">
        <path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round"/>
    </svg>
);

// ── Category color tokens ──────────────────────────────────────
//   active: full color (pill is "live", drawing the eye)
//   done:   subtle (muted slate — task is past, gets out of the way)
//   queued: dashed border (signals "not yet")
//   failed: rose
const CAT_COLORS: Record<ToolCategory, { bg: string; fg: string; ring: string; dot: string }> = {
    search:  { bg: '#eff6ff', fg: '#1d4ed8', ring: '#bfdbfe', dot: '#2563eb' },
    data:    { bg: '#ecfdf5', fg: '#047857', ring: '#a7f3d0', dot: '#059669' },
    analyze: { bg: '#f5f3ff', fg: '#6d28d9', ring: '#ddd6fe', dot: '#7c3aed' },
    signal:  { bg: '#fff7ed', fg: '#c2410c', ring: '#fed7aa', dot: '#ea580c' },
};

/**
 * Compact tool pill with status icon + duration + semantic category color.
 *   - active:    colored bg + pulsing colored dot  ← current "in flight"
 *   - completed: muted slate bg + ✓ + duration     ← out of the way
 *   - failed:    rose bg + ✗                        ← screams for attention
 *   - skipped:   dashed slate                       ← never ran
 */
export const Web3ToolPill: React.FC<{
    toolName: string;
    args?: any;
    state?: ToolPillState;
    durationMs?: number;
    /** When set, an arg value matching this string (case-insensitive) is
     *  hidden from the inline summary. Used when the pill sits inside a
     *  Web3ToolGroup whose label already shows the subject. */
    stripSubject?: string;
}> = ({ toolName, args, state, durationMs, stripSubject }) => {
    const label = TOOL_LABELS_EN[toolName] || toolName;
    const cat = categorizeToolName(toolName);
    const palette = CAT_COLORS[cat];

    const argSummary = args
        ? Object.values(args)
            .filter((v): v is string | number | boolean | null => {
                if (v == null || v === '') return false;
                if (stripSubject && typeof v === 'string' && v.toLowerCase() === stripSubject.toLowerCase()) return false;
                return true;
            })
            .map((v) => (typeof v === 'string' ? v : JSON.stringify(v).slice(0, 12)))
            .join(' · ')
            .slice(0, 40)
        : '';

    let style: React.CSSProperties;
    let icon: React.ReactNode;
    if (state === 'active') {
        style = { background: palette.bg, color: palette.fg, border: `1px solid ${palette.ring}` };
        icon = (
            <span className="relative inline-flex items-center justify-center w-2 h-2">
                <span
                    className="absolute inline-block w-2 h-2 rounded-full animate-ping opacity-60"
                    style={{ background: palette.dot }}
                />
                <span
                    className="relative inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: palette.dot }}
                />
            </span>
        );
    } else if (state === 'completed') {
        style = { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' };
        icon = <span style={{ color: '#94a3b8' }}>{ICON_CHECK}</span>;
    } else if (state === 'failed') {
        style = { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' };
        icon = <span style={{ color: '#dc2626' }}>{ICON_X}</span>;
    } else if (state === 'skipped') {
        style = { background: '#fafbfc', color: '#94a3b8', border: '1px dashed #cbd5e1' };
        icon = <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#cbd5e1' }} />;
    } else {
        // queued (no state)
        style = { background: '#fafbfc', color: '#94a3b8', border: '1px dashed #cbd5e1' };
        icon = <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#cbd5e1' }} />;
    }

    const durStr = state === 'completed' ? fmtDurationMs(durationMs) : null;

    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium"
            style={style}
        >
            {icon}
            <span>{label}</span>
            {argSummary && state !== 'active' && (
                <span className="opacity-55 truncate max-w-[100px]" style={{ fontFamily: mono }}>
                    · {argSummary}
                </span>
            )}
            {argSummary && state === 'active' && (
                <span className="opacity-70 truncate max-w-[100px]" style={{ fontFamily: mono }}>
                    · {argSummary}
                </span>
            )}
            {durStr && (
                <span className="opacity-55 ml-0.5" style={{ fontFamily: mono, fontSize: '10px' }}>
                    {durStr}
                </span>
            )}
        </span>
    );
};

/** Inline chip for a successful token resolution — replaces the heavyweight
 *  SearchCryptoCard when used in the thinking-phase pill cluster. Reads as
 *  "✓ SOL → Solana solana" in one line. */
export const Web3TokenChip: React.FC<{ data: any }> = ({ data }) => {
    if (!data || data.error) return null;
    const symbol = (data.symbol || '').toUpperCase();
    const name = data.name || data.id;
    const id = data.id;
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11.5px] font-semibold"
            style={{
                background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                border: '1px solid #a7f3d0',
                color: '#047857',
            }}
        >
            <span style={{ color: '#94a3b8' }}>{ICON_CHECK}</span>
            {symbol && <span>{symbol}</span>}
            <span className="opacity-50">→</span>
            <span>{name}</span>
            {id && id !== name && (
                <span className="opacity-60 font-normal" style={{ fontFamily: mono, fontSize: '10px' }}>
                    {id}
                </span>
            )}
        </span>
    );
};

export const Web3ToolCallPills: React.FC<{
    calls: Array<{ toolName: string; args?: any; state?: ToolPillState }>;
    /** Hide the "CALLED" prefix label. Use when the cluster is rendered next
     *  to a section header that already conveys context. */
    hideLabel?: boolean;
}> = ({ calls, hideLabel }) => {
    if (!calls || calls.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {!hideLabel && (
                <span className="text-[10px] uppercase tracking-[0.18em] text-gray-400" style={{ fontFamily: mono }}>
                    called
                </span>
            )}
            {calls.map((c, i) => (
                <Web3ToolPill
                    key={`${c.toolName}-${i}`}
                    toolName={c.toolName}
                    args={c.args}
                    state={c.state}
                />
            ))}
        </div>
    );
};

// Re-export helper labels for callers that want the localized title separately.
export { TOOL_LABELS_ZH, TOOL_LABELS_EN };

// ─────────────────────────────────────────────────────────────────────
//  Tool grouping — same-subject + same-provider tools cluster into one
//  visual container so "price · sui", "profile · sui", "history · sui",
//  "technicals · sui" become one "Token data (sui)" group with 4 sub-pills
//  instead of 4 sibling pills each repeating "sui".
// ─────────────────────────────────────────────────────────────────────

/**
 * Coarse provider/family classification — determines which group a stage
 * lands in. Search/resolve tools render separately (above the groups), so
 * they aren't part of any group here.
 */
function classifyStageProvider(toolName: string): 'okx' | 'token' | 'stock' | 'search' | 'analyze' | 'other' {
    if (toolName.startsWith('search_') && toolName !== 'search_crypto_asset') return 'search';
    if (toolName === 'search_crypto_asset') return 'token';
    if (toolName.startsWith('get_okx_')) return 'okx';
    if (
        toolName === 'get_realtime_quote' || toolName === 'get_daily_history' ||
        toolName === 'get_stock_info' || toolName === 'get_chip_distribution' ||
        toolName === 'get_capital_flow' || toolName === 'analyze_trend' ||
        toolName === 'calculate_ma' || toolName === 'get_volume_analysis' ||
        toolName === 'analyze_pattern' || toolName === 'search_stock_news' ||
        toolName === 'search_comprehensive_intel' || toolName === 'get_portfolio_snapshot' ||
        toolName === 'get_market_indices' || toolName === 'get_sector_rankings' ||
        toolName === 'get_skill_backtest_summary' || toolName === 'get_strategy_backtest_summary' ||
        toolName === 'get_stock_backtest_summary' || toolName === 'get_analysis_context' ||
        // SuperAgent v2 extension tools cluster under the same "Stock data" group
        toolName === 'financial_report' || toolName === 'sec_filings' || toolName === 'hsgt_flow'
    ) return 'stock';
    if (
        toolName.startsWith('get_token_') || toolName.startsWith('get_trending_') ||
        toolName.startsWith('get_market_') || toolName.startsWith('get_global_') ||
        toolName.startsWith('get_institutional_') || toolName.startsWith('get_exchange_') ||
        toolName.startsWith('get_nft_') || toolName.startsWith('get_onchain_') ||
        toolName.startsWith('get_category_') || toolName === 'get_price_history'
    ) return 'token';
    return 'other';
}

/** Pulls the subject (token id, ticker, symbol, query) out of the tool's args. */
function extractStageSubject(args: any): string | undefined {
    if (!args || typeof args !== 'object') return undefined;
    const v = args.id || args.ids || args.symbol || args.coin || args.ticker || args.tickers || args.query;
    if (v == null) return undefined;
    if (typeof v === 'string') return v.trim() || undefined;
    if (Array.isArray(v)) return v[0] ? String(v[0]) : undefined;
    return String(v);
}

type ToolGroup = {
    key: string;
    label: string;           // e.g. "Token data" / "OKX" / "Stock data"
    subject?: string;        // e.g. "sui" / "AAPL"
    category: ToolCategory;  // drives color
    stages: Array<{ stage: string; state?: ToolPillState; durationMs?: number; argsData?: any; rawData?: any }>;
};

/** Partitions stages into visual groups. Stages NOT belonging to any
 *  group (search-type) are returned separately as `ungrouped`. */
export function groupStagesForUI(
    stages: Array<{ stage: string; state?: ToolPillState; durationMs?: number; argsData?: any; rawData?: any }>,
): { groups: ToolGroup[]; ungrouped: typeof stages } {
    const groups = new Map<string, ToolGroup>();
    const ungrouped: typeof stages = [];

    for (const s of stages) {
        const provider = classifyStageProvider(s.stage);

        // Search tools render in their own row above groups (handled by caller)
        if (provider === 'search') {
            ungrouped.push(s);
            continue;
        }

        // Token resolution → also rendered as inline chip by caller
        if (s.stage === 'search_crypto_asset' && s.state === 'completed' && s.rawData) {
            ungrouped.push(s);
            continue;
        }

        // Decide group label + subject
        let groupLabel: string;
        let subject = extractStageSubject(s.argsData);
        if (provider === 'okx') {
            groupLabel = 'OKX';
        } else if (provider === 'stock') {
            groupLabel = 'Stock data';
        } else if (provider === 'token') {
            groupLabel = 'Token data';
        } else {
            groupLabel = 'Tools';
        }

        const key = `${groupLabel}::${(subject || '').toLowerCase()}`;
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                label: groupLabel,
                subject,
                category: categorizeToolName(s.stage),
                stages: [],
            });
        }
        groups.get(key)!.stages.push(s);
    }

    return { groups: Array.from(groups.values()), ungrouped };
}

/**
 * Visual group container — wraps related stages (same provider + subject)
 * in a single pill-like card. Drastically reduces visual noise when many
 * sibling tools operate on the same asset.
 */
export const Web3ToolGroup: React.FC<{
    label: string;
    subject?: string;
    category?: ToolCategory;
    stages: Array<{ stage: string; state?: ToolPillState; durationMs?: number; argsData?: any }>;
}> = ({ label, subject, stages }) => {
    if (!stages || stages.length === 0) return null;

    // Aggregate stats for the group header
    const done = stages.filter((s) => s.state === 'completed').length;
    const total = stages.length;
    const hasActive = stages.some((s) => s.state === 'active');
    const hasFailed = stages.some((s) => s.state === 'failed');
    const totalMs = stages
        .filter((s) => s.state === 'completed' && s.durationMs)
        .reduce((sum, s) => sum + (s.durationMs || 0), 0);
    const aggDur = fmtDurationMs(totalMs);

    // Subtle status dot for the group itself
    const headerDot = hasFailed
        ? <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#dc2626' }} />
        : hasActive
            ? <span className="relative inline-flex w-2 h-2 items-center justify-center">
                <span className="absolute inline-block w-2 h-2 rounded-full animate-ping opacity-60" style={{ background: '#059669' }} />
                <span className="relative inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#059669' }} />
              </span>
            : <span className="text-emerald-500">
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-2.5 h-2.5">
                    <path d="M2.5 6.5l2.5 2.5 5-5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>;

    return (
        <div
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 max-w-full flex-wrap"
            style={{ background: '#fafbfc', border: '1px solid #e2e8f0' }}
        >
            <div className="inline-flex items-center gap-1.5 pl-1 pr-0.5 shrink-0">
                {headerDot}
                <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-700">
                    {label}
                </span>
                {subject && (
                    <span className="text-[10.5px] text-slate-400" style={{ fontFamily: mono }}>
                        {subject.toLowerCase()}
                    </span>
                )}
                <span className="text-[9.5px] text-slate-400" style={{ fontFamily: mono }}>
                    {done}/{total}{aggDur ? ` · ${aggDur}` : ''}
                </span>
            </div>
            <span className="text-slate-300">·</span>
            <div className="inline-flex flex-wrap items-center gap-1">
                {stages.map((s, i) => (
                    <Web3ToolPill
                        key={`${s.stage}-${i}`}
                        toolName={s.stage}
                        args={s.argsData}
                        state={s.state}
                        durationMs={s.durationMs}
                        stripSubject={subject}
                    />
                ))}
            </div>
        </div>
    );
};
