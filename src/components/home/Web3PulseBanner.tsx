// Web3PulseBanner — the live trending-coin grid + 24h-mover marquee shown
// at the top of the SuperAgentHome screen when the Web3 domain is active.
// Polls our backend's CoinGecko proxy for prices, gas, and Fear & Greed.
// Extracted from SuperAgentHome.tsx during the Phase-2 refactor.
import React, { useEffect, useState } from 'react';

// Resolve the API base from Vite env. In local dev it's `/api` (Vite proxy
// or same-origin server), in production the API may live on a separate host
// (e.g. nftkashai.online), so VITE_API_BASE must be set to the absolute
// backend URL or all the `/api/skill/...` calls below 404 against Vercel.
const PULSE_API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '');

// `id` is the CoinGecko slug (e.g. "pudgy-penguins"). When a user clicks
// this coin's trending card we pass it down to the backend orchestrator as
// an assetHint so the web3 agent can skip its search_crypto_asset turn.
type PulseCoin = { id?: string; sym: string; name: string; price: number; chg: number; spark: number[]; icon?: string };

const PULSE_FALLBACK_COINS: PulseCoin[] = [
    { sym: 'BTC', name: 'Bitcoin',  price: 97420, chg:  2.4, spark: [36,34,33,37,40,42,41,44,46,45,48,52,50,53,55,58,56,59,62,60], icon: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png' },
    { sym: 'ETH', name: 'Ethereum', price:  3418, chg: -1.1, spark: [60,62,59,57,58,55,54,56,53,51,52,50,48,49,47,46,48,45,44,46], icon: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
    { sym: 'SOL', name: 'Solana',   price:   214, chg:  5.8, spark: [30,32,31,33,36,35,39,42,40,44,48,46,50,54,52,56,58,55,60,64], icon: 'https://assets.coingecko.com/coins/images/4128/small/solana.png' },
    { sym: 'BNB', name: 'BNB',      price:   612, chg:  0.9, spark: [40,42,41,43,42,44,43,45,44,46,45,47,46,48,47,49,48,50,49,51], icon: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png' },
    { sym: 'XRP', name: 'XRP',      price:   2.38,chg: -2.3, spark: [55,54,52,53,51,50,48,49,47,46,45,44,43,42,41,40,41,39,38,37], icon: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png' },
    { sym: 'DOGE',name: 'Dogecoin', price:   0.34,chg:  4.1, spark: [30,31,33,32,34,36,35,38,40,39,42,41,44,46,45,48,47,50,52,54], icon: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png' },
];
const PULSE_FALLBACK_TRENDING: { sym: string; chg: number; name: string }[] = [
    { sym: 'WIF', name: 'dogwifhat', chg: 18.3 }, { sym: 'JUP', name: 'Jupiter', chg: -4.1 }, { sym: 'ONDO', name: 'Ondo', chg: 9.2 },
    { sym: 'TAO', name: 'Bittensor', chg: 12.7 }, { sym: 'PENDLE', name: 'Pendle', chg: -2.6 }, { sym: 'ENA', name: 'Ethena', chg: 6.4 },
    { sym: 'PYTH', name: 'Pyth Network', chg: 3.9 },
];

const PULSE_CACHE_KEY = 'loka_web3_pulse_cache_v4';
const PULSE_CACHE_TTL = 5 * 60 * 1000; // 5 min — banners need to feel current

type PulseCache = { at: number; coins: PulseCoin[]; trending: { id?: string; sym: string; chg: number; name: string }[] };

const readPulseCache = (): PulseCache | null => {
    try {
        const raw = localStorage.getItem(PULSE_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PulseCache;
        if (!parsed?.at || Date.now() - parsed.at > PULSE_CACHE_TTL) return null;
        return parsed;
    } catch { return null; }
};

const writePulseCache = (data: Omit<PulseCache, 'at'>) => {
    try { localStorage.setItem(PULSE_CACHE_KEY, JSON.stringify({ at: Date.now(), ...data })); } catch { /* ignore */ }
};

const sparkPath = (values: number[], w: number, h: number): string => {
    if (!values.length) return '';
    const min = Math.min(...values), max = Math.max(...values);
    const range = Math.max(1e-9, max - min);
    const step = w / Math.max(1, values.length - 1);
    return values.map((v, i) => {
        const x = i * step;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
};

// Unicode subscript digits — used to compact memecoin prices that have a
// long run of zeros after the decimal. Industry standard: CoinGecko,
// Dexscreener and GMGN all show "$0.0₇5" instead of "$0.00000005" because
// the latter overflows narrow card cells (and gets truncated to "$0.000…"
// behind a `truncate` class, which is the bug we hit on the trending grid).
const SUBSCRIPT_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
const toSubscript = (n: number): string =>
    String(n).split('').map((d) => SUBSCRIPT_DIGITS[Number(d)] ?? d).join('');

const fmtPrice = (n: number) => {
    if (!isFinite(n)) return '—';
    if (n === 0) return '0';
    const abs = Math.abs(n);
    if (abs >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (abs >= 1)    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (abs >= 0.01) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
    // The boundary at 0.0001 is the highest price we still render with the
    // "0.00012" plain form. Below that, switch to subscript-zero notation
    // so "$0.0000005" becomes "$0.0₆5" — fits the card cell with no
    // truncation and is the convention serious memecoin traders expect.
    if (abs >= 0.0001) return n.toLocaleString('en-US', { maximumFractionDigits: 6 });

    // Subscript-zero rendering (memecoin tier).
    //   1) Convert to fixed-point with enough precision to keep ~4 sig figs
    //   2) Count the run of zeros immediately after the decimal point
    //   3) Take the next 3-4 significant digits as the tail (drop trailing zeros)
    //   4) Stitch into "0.0<subscript-zeros>tail"
    if (abs >= 1e-15) {
        // 18 decimals is enough headroom for any practical token price.
        const fixed = abs.toFixed(18);
        // fixed looks like "0.000000050000000000" — split off whole vs fractional.
        const [whole, frac = ''] = fixed.split('.');
        // Count leading zeros in the fractional portion.
        const leading = frac.match(/^0+/)?.[0].length ?? 0;
        // Significant digits start right after those zeros.
        const tail = frac.slice(leading).replace(/0+$/, '').slice(0, 4) || '0';
        const sign = n < 0 ? '-' : '';
        // Subscript only makes the format compact when there are >= 4 zeros.
        // 0.0001-0.0003 is already handled by the branch above; below that,
        // we're in territory where the subscript is a clear win.
        if (leading >= 4) {
            return `${sign}${whole}.0${toSubscript(leading - 1)}${tail}`;
        }
        // Edge case (very rare given the >= 0.0001 branch above): fall back
        // to plain decimal rendering so we never produce "0.0₂..." which
        // looks weird for shallow zeros.
        return abs.toFixed(leading + 4).replace(/(\.\d*?[1-9])0+$/, '$1');
    }
    // Below 1e-15: ultra-dust / data error. Scientific keeps the cell sane.
    return n.toExponential(2);
};

// AssetHint travels from a Web3 trending-card click into the backend
// orchestrator so routing can bypass the LLM "is this a stock?" guess. The
// home page already knows the user is in the Web3 module, so we trust that
// signal.
//
// We also stash the snapshot data the trending card was already showing
// (price/24h-change/icon/sparkline) so SuperAgentChat can render an instant
// placeholder TokenCard while the backend's web3 agent is still running.
//
// `coingeckoId` is the slug returned by /search/trending or /coins/markets.
// When present, the backend can skip the web3 agent's search_crypto_asset
// resolver turn (~7s saved).
export type AssetHint = {
    sym: string;
    name: string;
    kind: 'crypto';
    coingeckoId?: string;
    priceUsd?: number;
    change24hPct?: number;
    imageUrl?: string;
    sparkline?: number[];
};

export const Web3PulseBanner: React.FC<{ onAsk?: (q: string, opts?: { assetHint?: AssetHint }) => void }> = ({ onAsk }) => {
    // ── 1. Trending coin grid + movers marquee ───────────────────────
    const [coins, setCoins] = useState<PulseCoin[]>(() => readPulseCache()?.coins ?? PULSE_FALLBACK_COINS);
    const [trending, setTrending] = useState<{ id?: string; sym: string; chg: number; name: string }[]>(() => readPulseCache()?.trending ?? PULSE_FALLBACK_TRENDING);
    const [updatedAt, setUpdatedAt] = useState<number>(() => readPulseCache()?.at ?? 0);

    // ── 2. Live "vibe" metrics (gas + Fear & Greed) ──────────────────
    type Vibe = {
        fearGreed: { value: number; label: string } | null;
        ethGas: { fastGwei: number; standardGwei: number; slowGwei: number } | null;
    };
    const [vibe, setVibe] = useState<Vibe>({ fearGreed: null, ethGas: null });

    // ── 3. Live spot prices for the 6 visible coins ──────────────────
    const [livePrices, setLivePrices] = useState<Record<string, number>>({});

    useEffect(() => {
        let cancelled = false;
        const cached = readPulseCache();
        const skipFirstFetch = cached && Date.now() - cached.at < 60_000;

        const pullAll = async () => {
            try {
                const r = await fetch(`${PULSE_API_BASE}/skill/v1/crypto/pulse-trending`, { cache: 'no-store' });
                if (!r.ok) throw new Error(`pulse-trending HTTP ${r.status}`);
                const body = (await r.json()) as {
                    ok?: boolean;
                    data?: { coins?: PulseCoin[]; trending?: { id?: string; sym: string; chg: number; name: string }[]; asOf?: number };
                };
                if (cancelled) return;
                const nextCoins = Array.isArray(body?.data?.coins) ? body.data.coins : [];
                const nextTrending = Array.isArray(body?.data?.trending) ? body.data.trending : [];

                if (nextCoins.length) setCoins(nextCoins);
                if (nextTrending.length) setTrending(nextTrending);
                writePulseCache({
                    coins: nextCoins.length ? nextCoins : coins,
                    trending: nextTrending.length ? nextTrending : trending,
                });
                setUpdatedAt(typeof body?.data?.asOf === 'number' ? body.data.asOf : Date.now());
            } catch {
                /* keep last good values */
            }
        };

        if (!skipFirstFetch) void pullAll();
        const id = setInterval(pullAll, 5 * 60_000);
        return () => { cancelled = true; clearInterval(id); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Real "vibe" poll ────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        const pull = async () => {
            try {
                const r = await fetch(`${PULSE_API_BASE}/skill/v1/crypto/pulse-meta`, { cache: 'no-store' });
                if (!r.ok) return;
                const j = await r.json();
                const data = j?.data;
                if (cancelled || !data) return;
                setVibe({
                    fearGreed: data.fearGreed ? { value: data.fearGreed.value, label: data.fearGreed.label } : null,
                    ethGas: data.ethGas
                        ? {
                            fastGwei: data.ethGas.fastGwei,
                            standardGwei: data.ethGas.standardGwei,
                            slowGwei: data.ethGas.slowGwei,
                        }
                        : null,
                });
            } catch {
                /* swallow — header just stays on last good values */
            }
        };
        pull();
        const id = setInterval(pull, 30_000);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    // ── Real spot-price poll ─────────────────────────────────────────
    useEffect(() => {
        if (!coins.length) return;
        let cancelled = false;
        const syms = coins.slice(0, 6).map((c) => c.sym).filter(Boolean);
        if (syms.length === 0) return;

        const pull = async () => {
            try {
                const url = `${PULSE_API_BASE}/skill/v1/crypto/pulse-prices?syms=${encodeURIComponent(syms.join(','))}`;
                const r = await fetch(url, { cache: 'no-store' });
                if (!r.ok) return;
                const body = (await r.json()) as { data?: { prices?: Record<string, number> } };
                const prices = body?.data?.prices || {};
                if (cancelled) return;
                if (Object.keys(prices).length) setLivePrices((prev) => ({ ...prev, ...prices }));
            } catch {
                /* swallow — keep last known prices */
            }
        };
        pull();
        const id = setInterval(pull, 20_000);
        return () => { cancelled = true; clearInterval(id); };
    }, [coins]);

    const fgIdx = vibe.fearGreed?.value ?? null;
    const fgLabel = vibe.fearGreed?.label ?? '—';
    const fgColorClass =
        fgIdx == null ? 'text-gray-500' :
        fgIdx < 25 ? 'text-rose-600' :
        fgIdx < 45 ? 'text-orange-500' :
        fgIdx < 55 ? 'text-gray-700' :
        fgIdx < 75 ? 'text-emerald-600' : 'text-emerald-700';
    const gasGwei = vibe.ethGas?.standardGwei ?? null;
    const updatedLabel = updatedAt
        ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'Loading…';

    return (
        <div className="w3p-banner w-full max-w-[860px] mx-auto mt-2 mb-2 rounded-2xl border border-gray-200/70 bg-white text-gray-900 overflow-hidden">
            {/* Header strip */}
            <div className="flex items-center justify-between px-5 sm:px-6 pt-4 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400/70 opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-gray-400">Trending Now</span>
                    <span className="hidden sm:inline text-[10px] text-gray-300">·</span>
                    <span className="hidden sm:inline text-[10px] text-gray-400">CoinGecko · {updatedLabel}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-gray-500">
                    <span>
                        <span className="text-gray-400">Gas</span>{' '}
                        <span className="text-gray-800 font-semibold tabular-nums">{gasGwei != null ? gasGwei : '—'}</span>
                        <span className="text-gray-400"> gwei</span>
                    </span>
                    <span className="w-px h-3 bg-gray-200" />
                    <span>
                        <span className="text-gray-400">F&amp;G</span>{' '}
                        <span className={`font-semibold tabular-nums ${fgColorClass}`}>{fgIdx != null ? fgIdx : '—'}</span>{' '}
                        <span className="text-gray-400">{fgLabel}</span>
                    </span>
                </div>
            </div>

            {/* Hot coins grid — 2×3 on desktop, 2 cols on mobile */}
            <div className="grid grid-cols-2 sm:grid-cols-3">
                {coins.slice(0, 6).map((c, i) => {
                    const live = livePrices[c.sym] ?? c.price;
                    const up = c.chg >= 0;
                    const col = i % 3, row = Math.floor(i / 3);
                    return (
                        <button
                            key={`${c.sym}-${i}`}
                            onClick={() => onAsk?.(`What's driving ${c.name} (${c.sym}) today?`, {
                                assetHint: {
                                    sym: c.sym,
                                    name: c.name,
                                    kind: 'crypto',
                                    coingeckoId: c.id,
                                    priceUsd: c.price,
                                    change24hPct: c.chg,
                                    imageUrl: c.icon,
                                    sparkline: c.spark,
                                },
                            })}
                            className={`group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 sm:py-3.5 text-left transition-colors hover:bg-gray-50 border-gray-100 ${col > 0 ? 'border-l' : ''} ${row > 0 ? 'border-t' : ''}`}
                        >
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0 w-full sm:flex-1">
                                {c.icon ? (
                                    <img
                                        src={c.icon}
                                        alt={c.sym}
                                        width={22}
                                        height={22}
                                        loading="lazy"
                                        className="shrink-0 w-[22px] h-[22px] rounded-full ring-1 ring-gray-200 bg-white"
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                    />
                                ) : (
                                    <span className="shrink-0 w-[22px] h-[22px] rounded-full bg-gray-100 text-[9px] font-bold text-gray-500 flex items-center justify-center">{c.sym.slice(0, 2)}</span>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-[12px] font-bold tracking-wide text-gray-800">{c.sym}</span>
                                        <span className="text-[10.5px] text-gray-400 truncate">{c.name}</span>
                                    </div>
                                    <div className="mt-0.5 flex items-baseline gap-1.5 sm:gap-2">
                                        <span className="text-[14px] sm:text-[15px] font-semibold text-gray-900 tabular-nums truncate">${fmtPrice(live)}</span>
                                        <span className={`text-[11px] font-semibold tabular-nums shrink-0 ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
                                            {up ? '▲' : '▼'} {Math.abs(c.chg).toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <svg
                                viewBox="0 0 56 24"
                                preserveAspectRatio="none"
                                className="shrink-0 w-full h-[20px] sm:w-[56px] sm:h-[24px] opacity-90"
                                aria-hidden
                            >
                                <path
                                    d={sparkPath(c.spark, 56, 24)}
                                    fill="none"
                                    stroke={up ? '#10b981' : '#f43f5e'}
                                    strokeWidth={1.5}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    vectorEffect="non-scaling-stroke"
                                />
                            </svg>
                        </button>
                    );
                })}
            </div>

            {/* Trending marquee */}
            <div className="relative overflow-hidden border-t border-gray-100 bg-gray-50/60">
                <div className="flex items-center gap-6 px-5 sm:px-6 py-2.5 w3p-marquee">
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Top Movers 24h</span>
                    {[...trending, ...trending].map((t, i) => {
                        const isDup = i >= trending.length;
                        return (
                            <button
                                key={`${t.sym}-${i}`}
                                type="button"
                                aria-hidden={isDup || undefined}
                                tabIndex={isDup ? -1 : 0}
                                onClick={() => {
                                    if (isDup) return;
                                    onAsk?.(`What's driving ${t.name} (${t.sym}) today?`, {
                                        assetHint: {
                                            sym: t.sym,
                                            name: t.name,
                                            kind: 'crypto',
                                            coingeckoId: t.id,
                                            change24hPct: t.chg,
                                        },
                                    });
                                }}
                                className="shrink-0 inline-flex items-center gap-1.5 text-[11.5px] rounded-md px-1.5 py-0.5 -mx-1 hover:bg-white hover:ring-1 hover:ring-black/5 transition cursor-pointer disabled:cursor-default"
                                disabled={isDup}
                                title={isDup ? undefined : `Ask Loka about ${t.name}`}
                            >
                                <span className="font-semibold text-gray-700 tracking-wide">{t.sym}</span>
                                {t.chg !== 0 && (
                                    <span className={`tabular-nums ${t.chg >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                        {t.chg >= 0 ? '+' : ''}{t.chg.toFixed(1)}%
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <style>{`
                .w3p-marquee { animation: w3p-scroll 48s linear infinite; }
                .w3p-banner:hover .w3p-marquee { animation-play-state: paused; }
                @keyframes w3p-scroll {
                    from { transform: translateX(0); }
                    to   { transform: translateX(-50%); }
                }
                @media (prefers-reduced-motion: reduce) {
                    .w3p-marquee { animation: none; }
                }
            `}</style>
        </div>
    );
};
