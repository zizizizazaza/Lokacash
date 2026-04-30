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
    // Search-side pseudo-tools (not real LLM tool calls — synthesized from
    // the `search` module's state to give visual parity with web3 pills).
    search_web: 'searching web',
    search_x: 'reading X',
    search_news: 'reading news',
};

type ToolPillState = 'active' | 'completed' | 'failed' | 'skipped';

/**
 * Single pill — used both standalone (paired with its own result card) and
 * inside the multi-pill cluster below. Kept lightweight: the styling is
 * identical to the cluster pills so pairing one pill with one card looks
 * visually consistent with the search cluster's multi-pill row.
 */
export const Web3ToolPill: React.FC<{
    toolName: string;
    args?: any;
    state?: ToolPillState;
}> = ({ toolName, args, state }) => {
    const label = TOOL_LABELS_EN[toolName] || toolName;
    const argSummary = args
        ? Object.values(args)
            .map((v) => (typeof v === 'string' ? v : JSON.stringify(v).slice(0, 12)))
            .join(' · ')
            .slice(0, 40)
        : '';
    const stateClass =
        state === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
        state === 'failed' ? 'bg-rose-50 text-rose-700 border-rose-100' :
        state === 'active' ? 'bg-blue-50 text-blue-700 border-blue-100 animate-pulse' :
        'bg-gray-50 text-gray-600 border-gray-100';
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${stateClass}`}
        >
            <span className="font-medium">{label}</span>
            {argSummary && (
                <span className="opacity-60 truncate max-w-[120px]" style={{ fontFamily: mono }}>
                    · {argSummary}
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
