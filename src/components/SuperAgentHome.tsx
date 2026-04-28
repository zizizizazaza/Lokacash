import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { I, InputIcons, UseCaseIcons } from './Icons';
import { QUICK_ACTIONS, USE_CASES, AGENT_GUIDES, FEATURED_GROUPS, FEATURED_AGENTS } from '../constants';
import SuperAgentChat from './SuperAgentChat';
import GuruCarousel from './GuruCarousel';
import { IFlytekStreamer } from '../services/iflytek';
import ModeSelector from './chat/ModeSelector';
import type { RoundtableQuota, FastQuota } from './chat/ModeSelector';
import { api } from '../services/api';
import { MAX_IMAGES_PER_MESSAGE, prepareImageForUpload } from '../utils/imageCompression';
import PlanUpgradeEntry from './PlanUpgradeEntry';
import Web3DotWave from './Web3DotWave';

interface ChatImagePayload {
  url: string;
  mime?: string;
  name?: string;
}

interface PendingHomeImage extends ChatImagePayload {
  id: string;
  previewUrl: string;
  status: 'uploading' | 'uploaded' | 'error';
}

interface SuperAgentHomeProps {
  isLoggedIn?: boolean;
  onRequireLogin?: () => void;
}

// ─── Domain (Stocks / Web3) toggle — from teammate's feat/only-super-agent ─────
type Domain = 'stocks' | 'web3';
const DOMAIN_STORAGE_KEY = 'loka_home_domain';
const DOMAIN_THEME: Record<Domain, { accent: string; accentSoft: string; ring: string; label: string; emoji: string }> = {
  stocks: { accent: '#10b981', accentSoft: 'rgba(16, 185, 129, 0.12)', ring: 'rgba(16, 185, 129, 0.35)', label: 'Stocks',  emoji: '📈' },
  web3:   { accent: '#BAFF29', accentSoft: 'rgba(186, 255, 41, 0.15)', ring: 'rgba(186, 255, 41, 0.45)', label: 'Web3',    emoji: '🪙' },
};

/* ── Roundtable banner ──────────────────────────────────────────
   A light-weight hero banner for the Stocks homepage. Twelve analyst
   avatars orbit a central disc; the verdict surfaces in the middle.
   Hover any avatar to pause and read that specialist's profile.
   No network calls — content is canned marketing copy.
   Avatars come straight from /public/avatars/ (same set used by
   SuperAgentChat's SUMMON_POOL). */
const RT_AGENTS: { id: string; name: string; role: string; tags: string[]; avatar: string }[] = [
  // ── 9 specialists (system + enhanced roles) ──
  { id: 'fundamental_analyst', name: 'Fundamental Analyst', role: 'Financials & earnings quality',     tags: ['Financials', 'Earnings', 'DCF'],    avatar: '/avatars/fundamental_analyst.jpg' },
  { id: 'valuation_specialist',name: 'Valuation Analyst',   role: 'Fair value & multi-model analysis', tags: ['DCF', 'Comparable', 'Scenario'],    avatar: '/avatars/valuation_specialist.jpg' },
  { id: 'macro_enhanced',      name: 'Macro Strategist',    role: 'Rates, regimes & cross-asset flows',tags: ['Macro', 'Rates', 'Regimes'],        avatar: '/avatars/macro_enhanced.jpg' },
  { id: 'risk_enhanced',       name: 'Risk Analyst',        role: 'Tail risks & downside scenarios',   tags: ['VaR', 'Stress', 'Hedging'],         avatar: '/avatars/risk_enhanced.jpg' },
  { id: 'allocation_specialist',name: 'Allocation Analyst', role: 'ETF & asset allocation',            tags: ['MPT', 'Factors', 'Rebalance'],      avatar: '/avatars/allocation_specialist.jpg' },
  { id: 'options_specialist',  name: 'Options Analyst',     role: 'Options strategies & Greeks',       tags: ['Greeks', 'Volatility', 'Strategy'], avatar: '/avatars/options_specialist.jpg' },
  { id: 'event_driven',        name: 'Event-Driven Analyst',role: 'Catalysts, M&A & earnings events',  tags: ['Events', 'M&A', 'Catalysts'],       avatar: '/avatars/event_driven.jpg' },
  { id: 'sentiment_analyst',   name: 'Sentiment Analyst',   role: 'Social & market sentiment',         tags: ['Social', 'NLP', 'Flows'],           avatar: '/avatars/sentiment_analyst.jpg' },
  { id: 'technical_analyst',   name: 'Technical Analyst',   role: 'Price action & chart patterns',     tags: ['Charts', 'Trends', 'Levels'],       avatar: '/avatars/technical_analyst.jpg' },
  // ── 3 master lenses ──
  { id: 'buffett_style',       name: 'Warren Buffett lens', role: 'Wide moats & margin of safety',     tags: ['Value', 'Moats', 'Long-term'],      avatar: '/avatars/warren_buffett.jpg' },
  { id: 'munger_style',        name: 'Charlie Munger lens', role: 'Mental models & inversion',         tags: ['Quality', 'Inversion', 'Multi-disc'], avatar: '/avatars/charlie_munger.jpg' },
  { id: 'lynch_style',         name: 'Peter Lynch lens',    role: 'Growth at a reasonable price',      tags: ['Growth', 'PEG', 'Consumer'],        avatar: '/avatars/peter_lynch.jpg' },
];

const RT_VERDICTS: { topic: string; bull: number; bear: number; neutral: number }[] = [
  { topic: 'Buy this AI chip?',      bull: 7, bear: 3, neutral: 2 },
  { topic: 'Hold this ETF?',         bull: 4, bear: 6, neutral: 2 },
  { topic: 'Add this dividend pick?',bull: 8, bear: 1, neutral: 3 },
  { topic: 'Rotate to EM?',          bull: 3, bear: 5, neutral: 4 },
  { topic: 'Chase this rally?',      bull: 5, bear: 4, neutral: 3 },
];

// Cycle rhythm (ms): spin for SPIN_MS, then hold still for HOLD_MS so the
// verdict card can fade in. Total cycle = SPIN_MS + HOLD_MS.
const RT_SPIN_MS = 3000;
const RT_HOLD_MS = 2200;
const RT_CYCLE   = RT_SPIN_MS + RT_HOLD_MS;
const RT_HOLD_PCT = (RT_HOLD_MS / RT_CYCLE) * 100;   // hold window %
const RT_SPIN_PCT = 100 - RT_HOLD_PCT;               // spin window %

const RoundtableBanner: React.FC<{ onLiveDemo?: () => void }> = ({ onLiveDemo }) => {
  const [vIdx, setVIdx] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  useEffect(() => {
    // Advance the topic at the very start of each cycle — while the card is
    // invisible (spinning). By the time the card fades in, it already shows
    // the next topic, so there's no mid-visible flash.
    const id = setInterval(() => setVIdx(i => (i + 1) % RT_VERDICTS.length), RT_CYCLE);
    return () => clearInterval(id);
  }, []);

  const DISC = 260;
  const RADIUS = 108;
  const AV = 34;
  const v = RT_VERDICTS[vIdx];
  const total = v.bull + v.bear + v.neutral;
  const lead = v.bull > v.bear && v.bull > v.neutral
    ? { label: 'Bullish', color: '#059669' }
    : v.bear > v.bull && v.bear > v.neutral
      ? { label: 'Bearish', color: '#dc2626' }
      : { label: 'Mixed',   color: '#6b7280' };
  const hovered = hoveredId ? RT_AGENTS.find(a => a.id === hoveredId) : null;

  return (
    <div className="rt-banner w-full max-w-[860px] mx-auto mt-2 mb-2 px-5 sm:px-7 py-5 sm:py-6 rounded-2xl bg-white border border-gray-200/70 flex items-center gap-6 sm:gap-8">
      {/* Orbiting disc */}
      <div className="relative shrink-0" style={{ width: DISC, height: DISC }}>
        <div className="absolute rounded-full border border-dashed border-gray-200" style={{ inset: 8 }} />
        <div className={`absolute inset-0 rt-ring${hoveredId ? ' rt-paused' : ''}`}>
          {RT_AGENTS.map((a, i) => {
            const angle = (i / RT_AGENTS.length) * 2 * Math.PI - Math.PI / 2;
            const x = DISC / 2 + RADIUS * Math.cos(angle) - AV / 2;
            const y = DISC / 2 + RADIUS * Math.sin(angle) - AV / 2;
            const isActive = hoveredId === a.id;
            return (
              <div
                key={a.id}
                className="absolute rt-slot"
                style={{ left: x, top: y, width: AV, height: AV, zIndex: isActive ? 4 : 2 }}
                onMouseEnter={() => setHoveredId(a.id)}
                onMouseLeave={() => setHoveredId(prev => (prev === a.id ? null : prev))}
              >
                <img
                  src={a.avatar}
                  alt={a.name}
                  className={`w-full h-full rounded-full object-cover ring-2 shadow-[0_2px_6px_rgba(15,23,42,0.12)] ${isActive ? 'ring-gray-900 rt-avatar-active' : 'ring-white'}`}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/avatars/default.jpg'; }}
                />
              </div>
            );
          })}
        </div>
        {/* Center stack: verdict (default) or agent profile (on avatar hover) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {hovered ? (
            <div className="rt-agent-card rounded-xl bg-white border border-gray-200 shadow-[0_6px_20px_rgba(15,23,42,0.10)] px-3 py-3 text-center" style={{ width: 176 }}>
              <img
                src={hovered.avatar}
                alt={hovered.name}
                className="w-10 h-10 rounded-full object-cover mx-auto ring-2 ring-white shadow-sm"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/avatars/default.jpg'; }}
              />
              <div className="mt-1.5 text-[12px] font-semibold text-gray-900 leading-tight">{hovered.name}</div>
              <div className="mt-0.5 text-[10.5px] text-gray-500 leading-snug px-1">{hovered.role}</div>
              <div className="mt-2 flex flex-wrap gap-1 justify-center">
                {hovered.tags.slice(0, 3).map(t => (
                  <span key={t} className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[9.5px] font-medium">{t}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="rt-verdict rounded-xl bg-white border border-gray-100 shadow-[0_4px_14px_rgba(15,23,42,0.08)] px-3 py-2.5 text-center" style={{ width: 172 }}>
              <div className="text-[11.5px] font-semibold text-gray-700 leading-snug">{v.topic}</div>
              <div className="text-[15px] font-bold leading-tight mt-1" style={{ color: lead.color }}>{lead.label}</div>
              <div className="mt-2 h-1.5 w-full rounded-full overflow-hidden flex bg-gray-100">
                <div className="rt-bar" style={{ width: `${(v.bull/total)*100}%`, background: '#10b981' }} />
                <div className="rt-bar" style={{ width: `${(v.bear/total)*100}%`, background: '#f43f5e' }} />
                <div className="rt-bar" style={{ width: `${(v.neutral/total)*100}%`, background: '#d1d5db' }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right copy */}
      <div className="flex-1 min-w-0">
        <h3 className="text-[20px] sm:text-[22px] font-semibold text-gray-900 leading-[1.25]">
          Multi-agent debate, persuade, vote.
        </h3>
        <p className="mt-2.5 text-[13px] leading-[1.6] text-gray-500">
          Bulls and bears, fundamentals and macro, risk and momentum — agents challenge each other
          until the noise is gone. Bring in Buffett, Munger or Lynch whenever you want a harder question asked.
        </p>
        {onLiveDemo && (
          <button
            onClick={onLiveDemo}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 text-gray-800 text-[13px] font-semibold hover:bg-gray-200 hover:text-gray-900 transition-colors border border-gray-200/80"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Roundtable Live Demo
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        )}
      </div>

      <style>{`
        /* Rhythm: slow arc, then freeze so the verdict card can fade in.
           Each spin advances only 60° per cycle. The slot counter-rotates
           by the same angle so every avatar stays upright. */
        .rt-ring  { animation: rt-wheel ${RT_CYCLE}ms linear infinite; transform-origin: 50% 50%; }
        .rt-slot  { animation: rt-wheel-reverse ${RT_CYCLE}ms linear infinite; transform-origin: 50% 50%; }
        .rt-ring.rt-paused, .rt-ring.rt-paused .rt-slot,
        .rt-ring.rt-paused ~ div .rt-verdict { animation-play-state: paused; }
        @keyframes rt-wheel {
          0%                      { transform: rotate(0deg); }
          ${RT_SPIN_PCT.toFixed(2)}%  { transform: rotate(60deg); }
          100%                    { transform: rotate(60deg); }
        }
        @keyframes rt-wheel-reverse {
          0%                      { transform: rotate(0deg); }
          ${RT_SPIN_PCT.toFixed(2)}%  { transform: rotate(-60deg); }
          100%                    { transform: rotate(-60deg); }
        }
        /* Active avatar scale lives on the img, independent of the slot's
           counter-rotation transform, so the two transforms don't clash. */
        .rt-avatar-active { transform: scale(1.25); transition: transform 200ms ease-out; }
        /* Verdict: hidden while spinning, appears during the hold window. */
        .rt-verdict { animation: rt-verdict-cycle ${RT_CYCLE}ms ease-in-out infinite; }
        @keyframes rt-verdict-cycle {
          0%, ${(RT_SPIN_PCT - 4).toFixed(2)}%  { opacity: 0; transform: scale(0.94); }
          ${(RT_SPIN_PCT + 2).toFixed(2)}%      { opacity: 1; transform: scale(1); }
          100%                                   { opacity: 1; transform: scale(1); }
        }
        .rt-agent-card { animation: rt-fade 180ms ease-out both; }
        @keyframes rt-fade { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .rt-bar { transition: width 420ms cubic-bezier(.2,.7,.3,1); }
        .rt-slot { cursor: pointer; pointer-events: auto; }
        @media (prefers-reduced-motion: reduce) {
          .rt-ring, .rt-slot, .rt-verdict, .rt-agent-card { animation: none !important; opacity: 1 !important; }
        }
        @media (max-width: 640px) {
          .rt-banner { flex-direction: column; text-align: center; }
        }
      `}</style>
    </div>
  );
};

/* ── Web3 Pulse banner ──────────────────────────────────────────
   Sits in the same slot as the Stocks Roundtable banner. Shows a
   compact, animated view of the on-chain moment: three majors with
   sparklines, ETH gas + Fear&Greed, and a trending strip. Values
   Data comes from CoinGecko's free public API (no key required):
     - /coins/markets      → 6 hot majors (top by volume) with 7d sparklines
     - /search/trending    → marquee of today's most-searched tokens
   Both are cached in localStorage for 30 min so we don't hammer the API
   across navigations. Fallbacks (below) keep the UI useful if offline. */
type PulseCoin = { sym: string; name: string; price: number; chg: number; spark: number[]; icon?: string };
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

type PulseCache = { at: number; coins: PulseCoin[]; trending: { sym: string; chg: number; name: string }[] };

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
  try { localStorage.setItem(PULSE_CACHE_KEY, JSON.stringify({ at: Date.now(), ...data })); } catch {}
};

// Resample a long price array (CG returns ~168 hourly points for 7d) down
// to ~24 points for a compact sparkline.
const resampleSpark = (prices: number[], target = 24): number[] => {
  if (!Array.isArray(prices) || prices.length === 0) return [];
  if (prices.length <= target) return prices.slice();
  const step = prices.length / target;
  const out: number[] = [];
  for (let i = 0; i < target; i++) out.push(prices[Math.min(prices.length - 1, Math.floor(i * step))]);
  return out;
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

const fmtPrice = (n: number) => {
  if (!isFinite(n)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1)    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 0.01) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
};

const Web3PulseBanner: React.FC<{ onAsk?: (q: string) => void }> = ({ onAsk }) => {
  // ── 1. Trending coin grid + movers marquee ───────────────────────
  // Grid: CoinGecko /search/trending — the actual top-searched coins
  //       right now (askSurf-style hotlist). Real ranking, not a
  //       static list.
  // Marquee: top 24h gainers + losers from /coins/markets — the hot
  //          movers, refreshed in lockstep with the grid.
  // Cached for 5 min. Background refresh (below) re-pulls every 5 min
  // while the user lingers.
  const [coins, setCoins] = useState<PulseCoin[]>(() => readPulseCache()?.coins ?? PULSE_FALLBACK_COINS);
  const [trending, setTrending] = useState<{ sym: string; chg: number; name: string }[]>(() => readPulseCache()?.trending ?? PULSE_FALLBACK_TRENDING);
  const [updatedAt, setUpdatedAt] = useState<number>(() => readPulseCache()?.at ?? 0);

  // ── 2. Live "vibe" metrics (gas + Fear & Greed) ──────────────────
  // Backend `/api/skill/v1/crypto/pulse-meta` proxies alternative.me
  // (F&G) and Blocknative (gas) so we get real numbers, not sin-wave
  // theatre. Polled every 30 s while the home screen is mounted.
  type Vibe = {
    fearGreed: { value: number; label: string } | null;
    ethGas: { fastGwei: number; standardGwei: number; slowGwei: number } | null;
  };
  const [vibe, setVibe] = useState<Vibe>({ fearGreed: null, ethGas: null });

  // ── 3. Live spot prices for the 6 visible coins ──────────────────
  // /coins/markets gives us the snapshot; for "feels alive" we then
  // re-poll a tiny `simple/price` call every 20 s so the prices tick.
  // Real movement, no jitter.
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    const cached = readPulseCache();
    const skipFirstFetch = cached && Date.now() - cached.at < 60_000; // <1 min old → don't refetch immediately

    // CoinGecko free endpoints — all keyless, all dynamic.
    //   /search/trending                            → searched-most-right-now (rotates every few min)
    //   /coins/markets?order=price_change_*_desc    → today's gainers / losers
    //   /coins/markets?ids=...&sparkline=true       → 7d sparklines for the trending coins
    //
    // We dedupe stable / wrapped names because they're noise on a
    // "what's hot" feed.
    // All CoinGecko traffic is proxied through our own backend endpoint
    // (`/api/skill/v1/crypto/pulse-trending`) — that endpoint runs the same
    // dedupe / sparkline-resample / mover-interleave logic this component
    // used to do client-side. Keeping it server-side means: (a) browsers
    // that can't reach api.coingecko.com directly (e.g. China without a
    // system proxy) still get live data, (b) we share the optional
    // CoinGecko Pro key + 60s server-side cache across all visitors,
    // (c) one less direct CG dependency on the frontend.
    const pullAll = async () => {
      try {
        const r = await fetch('/api/skill/v1/crypto/pulse-trending', { cache: 'no-store' });
        if (!r.ok) throw new Error(`pulse-trending HTTP ${r.status}`);
        const body = (await r.json()) as {
          ok?: boolean;
          data?: { coins?: PulseCoin[]; trending?: { sym: string; chg: number; name: string }[]; asOf?: number };
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
        // Use the backend's asOf when available so refresh time matches the
        // server cache; fall back to client clock if the field is missing.
        setUpdatedAt(typeof body?.data?.asOf === 'number' ? body.data.asOf : Date.now());
      } catch {
        /* keep last good values, leave updatedAt alone so the UI shows the prior timestamp */
      }
    };

    if (!skipFirstFetch) void pullAll();
    // Refresh every 5 min while mounted so a long-lingering tab
    // sees the trending board and movers actually rotate.
    const id = setInterval(pullAll, 5 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Real "vibe" poll ────────────────────────────────────────────
  // Pulls Fear & Greed + ETH gas every 30 s from our backend proxy.
  // First fetch is fired on mount; subsequent ones keep the values
  // honest while the user lingers on the page.
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const r = await fetch('/api/skill/v1/crypto/pulse-meta', { cache: 'no-store' });
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
  // Re-pulls just the visible 6 coins every 20 s via CoinGecko's free
  // /simple/price (no key, no auth). Replaces the synthetic jitter.
  // We deliberately don't refetch sparkline / icon / 24h%, only price.
  useEffect(() => {
    if (!coins.length) return;
    let cancelled = false;
    // Extract CoinGecko slug from each coin's icon URL since /coins/markets
    // returned the icons (slug ≠ symbol — e.g. matic-network ≠ MATIC).
    const symBySlug: Record<string, string> = {};
    for (const c of coins.slice(0, 6)) {
      const m = c.icon?.match(/\/small\/([a-z0-9-]+)\.[a-z]+/);
      if (m?.[1]) symBySlug[m[1]] = c.sym;
    }
    const slugs = Object.keys(symBySlug);
    if (slugs.length === 0) return; // nothing reliable to query

    const pull = async () => {
      try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${slugs.join(',')}&vs_currencies=usd`;
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) return;
        const j = (await r.json()) as Record<string, { usd?: number }>;
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const slug of Object.keys(j)) {
          const sym = symBySlug[slug];
          const usd = Number(j[slug]?.usd);
          if (sym && Number.isFinite(usd)) next[sym] = usd;
        }
        if (Object.keys(next).length) setLivePrices((prev) => ({ ...prev, ...next }));
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
              onClick={() => onAsk?.(`What's driving ${c.name} (${c.sym}) today?`)}
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
            // Second pass is a visual-only clone for seamless looping —
            // hide it from screen-readers and disable interaction so the
            // user only ever clicks the original.
            const isDup = i >= trending.length;
            return (
              <button
                key={`${t.sym}-${i}`}
                type="button"
                aria-hidden={isDup || undefined}
                tabIndex={isDup ? -1 : 0}
                onClick={() => {
                  if (isDup) return;
                  onAsk?.(`What's driving ${t.name} (${t.sym}) today?`);
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

const SuperAgentHome: React.FC<SuperAgentHomeProps> = ({
  onRequireLogin,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const { ready, authenticated } = usePrivy();
  const isLoggedIn = ready && authenticated;
  const tryStartChat = (text: string) => {
    if (!text?.trim()) return;
    if (!isLoggedIn) {
      window.dispatchEvent(new Event('show-auth-modal'));
      return;
    }
    setChatMessage(text.trim());
  };
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [mode, setMode] = useState<'auto' | 'fast' | 'roundtable'>('auto');
  const [chatMessage, setChatMessage] = useState<string | null>(null);
  // Live Demo: when set, we skip directly into SuperAgentChat with a canned
  // prompt, roundtable mode forced, and auto-confirm so the visitor watches
  // the whole Roundtable animation without clicking.
  const [liveDemoActive, setLiveDemoActive] = useState(false);
  const [phIdx, setPhIdx] = useState(0);
  const [pastedImages, setPastedImages] = useState<string[]>([]);
  const homeFileRef = useRef<HTMLInputElement>(null);
  const [homeVoiceState, setHomeVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const homeVoiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNewChatRef = useRef<number | null>(null);
  const iflytekRef = useRef<IFlytekStreamer | null>(null);

  // ── Domain toggle (Stocks ⇆ Web3) ──────────────────────────────
  const [domain, setDomain] = useState<Domain>(() => {
    if (typeof window === 'undefined') return 'stocks';
    const stored = window.localStorage.getItem(DOMAIN_STORAGE_KEY);
    return stored === 'web3' ? 'web3' : 'stocks';
  });
  // Welcome modal — disabled by default. Flip to `true` to force-show during
  // development. Original "show on first visit" logic preserved below.
  const [showWelcome, setShowWelcome] = useState<boolean>(false);
  // const [showWelcome, setShowWelcome] = useState<boolean>(() => {
  //   if (typeof window === 'undefined') return false;
  //   return window.localStorage.getItem(DOMAIN_STORAGE_KEY) === null;
  // });
  const [welcomeStep, setWelcomeStep] = useState<0 | 1>(0);
  const domainTheme = DOMAIN_THEME[domain];
  const pickDomain = (d: Domain) => {
    if (d === domain) return;
    setDomain(d);
    setShowWelcome(false);
    // Switching domain closes any open agent pill and its scenario, so
    // the Stocks/Web3 views never bleed into each other.
    setSelectedAgent(null);
    setSelectedScenario(null);
  };

  // Persist the active domain to localStorage on every change, so the next
  // mount (refresh, New Chat, route bounce) restores the same tab. Also
  // listen for `storage` events so a domain switch in one tab updates the
  // other tabs of the same browser.
  useEffect(() => {
    try { window.localStorage.setItem(DOMAIN_STORAGE_KEY, domain); } catch {}
  }, [domain]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DOMAIN_STORAGE_KEY) return;
      const next = e.newValue === 'web3' ? 'web3' : 'stocks';
      setDomain((prev) => (prev === next ? prev : next));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const dismissWelcome = () => setShowWelcome(false);

  // Roundtable quota
  const [roundtableQuota, setRoundtableQuota] = useState<RoundtableQuota | null>(null);
  const [fastQuota, setFastQuota] = useState<FastQuota | null>(null);
  useEffect(() => {
    // Wait for Privy to resolve before deciding. Without this, the cold-load
    // path runs once with `api.isAuthenticated === false` (token not yet
    // injected) and never retries — quota badges stay empty even after login.
    if (!ready) return;
    if (!authenticated) {
      setRoundtableQuota(null);
      setFastQuota(null);
      return;
    }
    let cancelled = false;
    api.getQuota()
      .then(q => {
        if (cancelled) return;
        setRoundtableQuota({ used: q.roundtable.used, limit: q.roundtable.limit });
        if (q.fast) setFastQuota({ used: q.fast.used, limit: q.fast.limit });
      })
      .catch(() => {
        if (cancelled) return;
        setRoundtableQuota({ used: 1, limit: 3 });
        setFastQuota({ used: 4, limit: 20 });
      });
    return () => { cancelled = true; };
  }, [ready, authenticated]);

  useEffect(() => {
    return () => {
      if (iflytekRef.current) {
        iflytekRef.current.stop();
      }
    };
  }, []);

  const stopHomeRecording = () => {
    if (iflytekRef.current) {
      iflytekRef.current.stop();
      iflytekRef.current = null;
    }
    setHomeVoiceState('transcribing');
    // Usually iFlytek returns isFinal on stop which resets to idle, 
    // but just as a fallback timeout:
    setTimeout(() => {
      setHomeVoiceState(prev => prev === 'transcribing' ? 'idle' : prev);
    }, 1000);
  };

  const handleHomeVoiceClick = async () => {
    if (homeVoiceState === 'idle') {
      setHomeVoiceState('recording');
      
      const streamer = new IFlytekStreamer();
      iflytekRef.current = streamer;

      streamer.onResult((res) => {
        if (res.text) {
          setInput(res.text);
        }
        if (res.isFinal) {
          setHomeVoiceState('idle');
          iflytekRef.current = null;
        }
      });

      streamer.onError((err) => {
        console.error("iFlytek error:", err);
        setHomeVoiceState('idle');
        iflytekRef.current = null;
      });

      streamer.onStop(() => {
        setHomeVoiceState('idle');
        iflytekRef.current = null;
      });

      try {
        await streamer.start();
      } catch (err) {
        console.error("Failed to start iFlytek", err);
        setHomeVoiceState('idle');
        iflytekRef.current = null;
      }
    } else if (homeVoiceState === 'recording') {
      stopHomeRecording();
    }
  };

  const handleHomePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(it => it.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    imageItems.forEach(item => {
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        if (ev.target?.result) setPastedImages(prev => [...prev, ev.target!.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleHomeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        if (ev.target?.result) setPastedImages(prev => [...prev, ev.target!.result as string]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const PLACEHOLDERS = domain === 'stocks'
    ? [
        'Ask about any stock, sector, or investing idea…',
        'Which AI infrastructure companies have the best moat?',
        'Is NVIDIA still a strong buy after Q4?',
        'Compare Tesla vs BYD fundamentals for 2026',
        'Build me a diversified portfolio for a 3-year horizon',
      ]
    : [
        'Ask about any token, protocol, or on-chain trend…',
        'Which L2s are gaining real user traction this quarter?',
        'Should I HODL or sell my BTC above $100K?',
        'Evaluate Sui vs Aptos — which L1 has better tokenomics?',
        'Which prediction markets on Polymarket have edge right now?',
      ];

  // Reset placeholder index + rotating counter when domain flips
  useEffect(() => { setPhIdx(0); }, [domain]);

  // ── Synchronous "New Chat" detection ─────────────────────
  // Detect new-chat navigation DURING RENDER (before SuperAgentChat can mount).
  // This prevents the one-render gap where the stale chatMessage would cause
  // a phantom auto-send.
  const newChatTs = (location.state as any)?.newChat as number | undefined;
  const isNewChatReset = !!(newChatTs && newChatTs !== prevNewChatRef.current);

  // Deferred state cleanup — runs after render to actually clear state & update ref
  useEffect(() => {
    if (newChatTs && newChatTs !== prevNewChatRef.current) {
      prevNewChatRef.current = newChatTs;
      setChatMessage(null);
      setInput('');
      setSelectedAgent(null);
      setSelectedScenario(null);
      // Live Demo is a one-shot flag — never let it leak into a manual chat
      setLiveDemoActive(false);
      setPhIdx(Math.floor(Math.random() * QUICK_ACTIONS.length));
    }
  }, [newChatTs]); // eslint-disable-line

  // Auto-select first scenario when entering an agent's secondary page.
  // Respect domain filtering — in Web3, the first stocks-only scenario
  // (e.g. research.intel) must be skipped.
  useEffect(() => {
    if (!selectedAgent) return;
    const all = AGENT_GUIDES[selectedAgent]?.scenarios;
    if (!all || all.length === 0) return;
    const STOCKS_ONLY = new Set([
      'stock','public','usstock','ashare','compare','startup',
      'region','sector','intel','demand','trending','competitor',
    ]);
    const WEB3_ONLY = new Set([
      'crypto','project',
      'w3-intel','w3-narratives','w3-tokens','w3-protocols',
      'w3-majors','w3-ecosystems','w3-onchain',
    ]);
    const first = all.find(s => {
      if (domain === 'stocks' && WEB3_ONLY.has(s.id)) return false;
      if (domain === 'web3' && STOCKS_ONLY.has(s.id)) return false;
      return true;
    }) ?? all[0];
    setSelectedScenario(first.id);
  }, [selectedAgent, domain]);

  useEffect(() => {
    if (input) return;
    const id = setInterval(() => setPhIdx(i => (i + 1) % PLACEHOLDERS.length), 3500);
    return () => clearInterval(id);
  }, [input]);

  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');

  // Derive effective chat message: during the render where New Chat was just
  // clicked, treat chatMessage as null so SuperAgentChat doesn't mount with
  // the stale value (the useEffect above will clear it for subsequent renders).
  const effectiveChatMessage = isNewChatReset ? null : chatMessage;

  // ── Welcome modal: 2-step market introduction ──
  // Palette tuned for a calmer, finance-grade feel:
  //   Stocks: slate ink + restrained blue accent (no bright neon).
  //   Web3:   graphite black + warm gold / bitcoin-orange accent.
  const WC_STOCK_INK = '#0f172a';       // slate-900
  const WC_STOCK_BG  = '#f1f5f9';       // slate-100
  const WC_STOCK_UP  = '#2563eb';       // blue-600 (gain accent)
  const WC_STOCK_DN  = '#ef4444';       // red-500 (down)
  const WC_WEB3_INK  = '#18181b';       // zinc-900
  const WC_WEB3_BG   = '#f5f2ea';       // warm paper
  const WC_BTC       = '#f7931a';       // bitcoin orange (flat)
  const WC_ETH       = '#627eea';       // ethereum blue-violet (flat)
  const WC_USDC      = '#2775ca';       // USDC blue (flat)

  const welcomeSteps = [
    {
      key: 'stocks' as Domain,
      eyebrow: 'Stocks',
      title: 'AI research for the ',
      titleHighlight: 'Stock Market',
      subtitle: 'Ask anything about stocks, sectors, or the macro — Loka routes your question to the right analyst agents.',
      ink: WC_STOCK_INK,
      bg: WC_STOCK_BG,
      accent: WC_STOCK_UP, // blue — used for the big "STOCKS" label & CTA
      // Use-case prompts — what the user can type in
      prompts: [
        'Is NVIDIA still a buy after Q4?',
        'Compare Tesla vs BYD for 2026',
        'Build a balanced AI-infra portfolio',
        'Which semi names have the widest moats?',
      ],
      // Stock-themed illustration: ticker quote card, faint grid + price line, floating ticker chips
      illustration: (
        <svg viewBox="0 0 320 148" className="w-full h-full" aria-hidden>
          {[30, 60, 90, 120].map(y => (
            <line key={y} x1="0" y1={y} x2="320" y2={y} stroke={WC_STOCK_INK} strokeOpacity="0.06" strokeDasharray="2 4" />
          ))}
          <path d="M0,115 L30,102 L60,106 L90,88 L120,94 L150,74 L180,80 L210,60 L240,66 L270,44 L300,50 L320,34" fill="none" stroke={WC_STOCK_INK} strokeOpacity="0.18" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          {/* Ticker card — clean 3-band layout: header / price row / sparkline */}
          <g transform="translate(26, 18)">
            <rect x="0" y="0" width="180" height="108" rx="14" fill="#ffffff" stroke={WC_STOCK_INK} strokeOpacity="0.12" />
            {/* Header band */}
            <circle cx="24" cy="22" r="11" fill={WC_STOCK_INK} />
            <text x="24" y="26.5" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" fontFamily="ui-sans-serif, system-ui">N</text>
            <text x="43" y="20" fontSize="12" fontWeight="800" fill={WC_STOCK_INK} fontFamily="ui-sans-serif, system-ui">NVDA</text>
            <text x="43" y="31" fontSize="8" fontWeight="500" fill={WC_STOCK_INK} fillOpacity="0.55" fontFamily="ui-sans-serif, system-ui">NVIDIA · NASDAQ</text>
            {/* Divider */}
            <line x1="14" y1="43" x2="166" y2="43" stroke={WC_STOCK_INK} strokeOpacity="0.08" />
            {/* Price row — price on left, pill on right, aligned */}
            <text x="14" y="66" fontSize="20" fontWeight="800" fill={WC_STOCK_INK} fontFamily="ui-sans-serif, system-ui">945.20</text>
            <g transform="translate(114, 52)">
              <rect x="0" y="0" width="52" height="18" rx="9" fill={WC_STOCK_UP} fillOpacity="0.12" />
              <path d="M9 12.5 L12 8 L15 12.5 Z" fill={WC_STOCK_UP} />
              <text x="19" y="12.5" fontSize="9.5" fontWeight="700" fill={WC_STOCK_UP} fontFamily="ui-sans-serif, system-ui">+2.41%</text>
            </g>
            {/* Sparkline band — own zone at bottom, no overlap */}
            <path d="M14,96 L26,92 L38,94 L50,86 L62,88 L74,80 L86,82 L98,76 L110,78 L122,72 L134,74 L146,66 L166,68" fill="none" stroke={WC_STOCK_UP} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="166" cy="68" r="2.5" fill={WC_STOCK_UP} />
          </g>
          {/* Floating ticker chips — right column, aligned to card bands */}
          <g transform="translate(222, 24)">
            <rect x="0" y="0" width="56" height="22" rx="11" fill="#fff" stroke={WC_STOCK_INK} strokeOpacity="0.12" />
            <text x="10" y="14.5" fontSize="9" fontWeight="800" fill={WC_STOCK_INK} fontFamily="ui-sans-serif, system-ui">AAPL</text>
            <text x="38" y="14.5" fontSize="8" fontWeight="700" fill={WC_STOCK_UP} fontFamily="ui-sans-serif, system-ui">▲</text>
          </g>
          <g transform="translate(236, 58)">
            <rect x="0" y="0" width="56" height="22" rx="11" fill="#fff" stroke={WC_STOCK_INK} strokeOpacity="0.12" />
            <text x="10" y="14.5" fontSize="9" fontWeight="800" fill={WC_STOCK_INK} fontFamily="ui-sans-serif, system-ui">TSLA</text>
            <text x="38" y="14.5" fontSize="8" fontWeight="700" fill={WC_STOCK_DN} fontFamily="ui-sans-serif, system-ui">▼</text>
          </g>
          <g transform="translate(220, 94)">
            <rect x="0" y="0" width="56" height="22" rx="11" fill="#fff" stroke={WC_STOCK_INK} strokeOpacity="0.12" />
            <text x="10" y="14.5" fontSize="9" fontWeight="800" fill={WC_STOCK_INK} fontFamily="ui-sans-serif, system-ui">SPY</text>
            <text x="38" y="14.5" fontSize="8" fontWeight="700" fill={WC_STOCK_UP} fontFamily="ui-sans-serif, system-ui">▲</text>
          </g>
        </svg>
      ),
    },
    {
      key: 'web3' as Domain,
      eyebrow: 'Crypto',
      title: 'Multi-agent AI for the ',
      titleHighlight: 'Crypto Market',
      subtitle: 'Ask anything about tokens, chains, or DeFi — backed by live on-chain data and multi-agent analysis.',
      ink: WC_WEB3_INK,
      bg: WC_WEB3_BG,
      accent: WC_BTC, // bitcoin orange — used for the big "WEB3" label & CTA
      prompts: [
        'Should I HODL or sell BTC above $100K?',
        'Solana vs Ethereum activity this quarter',
        'Which L2s are gaining real user traction?',
        'Find mispriced odds on Polymarket today',
      ],
      // Flat crypto coins from different angles — no gradients
      illustration: (
        <svg viewBox="0 0 320 148" className="w-full h-full" aria-hidden>
          {/* BTC — large coin, head-on */}
          <g transform="translate(68, 74)">
            <circle cx="0" cy="0" r="38" fill={WC_BTC} />
            <circle cx="0" cy="0" r="32" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.5" />
            <text x="0" y="10" textAnchor="middle" fontSize="32" fontWeight="900" fill="#fff" fontFamily="ui-sans-serif, system-ui">₿</text>
          </g>
          {/* ETH — medium coin, tilted (ellipse = perspective) */}
          <g transform="translate(180, 52) rotate(-12)">
            <ellipse cx="0" cy="0" rx="30" ry="28" fill={WC_ETH} />
            <ellipse cx="0" cy="0" rx="24" ry="22" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.5" />
            <g>
              <path d="M0,-14 L9,0 L0,4 L-9,0 Z" fill="#fff" />
              <path d="M0,6 L9,1.5 L0,14 L-9,1.5 Z" fill="#fff" fillOpacity="0.7" />
            </g>
          </g>
          {/* USDC — small flat coin */}
          <g transform="translate(248, 96)">
            <circle cx="0" cy="0" r="22" fill={WC_USDC} />
            <circle cx="0" cy="0" r="18" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.2" />
            <text x="0" y="6" textAnchor="middle" fontSize="14" fontWeight="900" fill="#fff" fontFamily="ui-sans-serif, system-ui">$</text>
          </g>
          {/* SOL — small round coin, lower-left, slightly tilted */}
          <g transform="translate(28, 112) rotate(-8)">
            <ellipse cx="0" cy="0" rx="20" ry="19" fill={WC_WEB3_INK} />
            <ellipse cx="0" cy="0" rx="15" ry="14" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" />
            <text x="0" y="5" textAnchor="middle" fontSize="14" fontWeight="900" fill="#fff" fontFamily="ui-sans-serif, system-ui">S</text>
          </g>
        </svg>
      ),
    },
  ];
  const welcomeCurrent = welcomeSteps[welcomeStep];
  const welcomeIsLast = welcomeStep === welcomeSteps.length - 1;
  const welcomeModal = showWelcome ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(8px)' }}>
      <div
        key={welcomeStep}
        className="relative bg-white rounded-[20px] max-w-[480px] w-full overflow-hidden"
        style={{ animation: 'fade-up 0.4s var(--ease-out-expo) both', boxShadow: '0 24px 60px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.05)' }}
      >
        <button
          onClick={dismissWelcome}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>

        {/* Illustration header — flat color, no gradients */}
        <div
          className="relative h-[180px] overflow-hidden"
          style={{ background: welcomeCurrent.bg, borderBottom: `1px solid ${welcomeCurrent.ink}10` }}
        >
          <div className="absolute inset-0 px-5 pt-6 pb-3 flex items-center justify-center">
            <div className="w-full h-full">{welcomeCurrent.illustration}</div>
          </div>
          {/* Eyebrow chip — just the market name, no "Market 0x" */}
          <div
            className="absolute top-4 left-5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-[10px] font-bold tracking-[0.14em] uppercase"
            style={{ color: welcomeCurrent.ink, border: `1px solid ${welcomeCurrent.ink}14` }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: welcomeCurrent.ink }} />
            {welcomeCurrent.eyebrow}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-[22px] font-extrabold tracking-tight leading-[1.2]" style={{ color: welcomeCurrent.ink }}>
            {welcomeCurrent.title}
            <span style={{ color: welcomeCurrent.accent }}>{welcomeCurrent.titleHighlight}</span>
          </h2>
          <p className="text-[13px] text-gray-500 mt-2 leading-relaxed">{welcomeCurrent.subtitle}</p>

          {/* Use-case prompt chips — what to ask, not feature bullets */}
          <div className="mt-4">
            <div className="text-[10px] font-bold tracking-[0.14em] uppercase text-gray-400 mb-2">Try asking</div>
            <div className="flex flex-wrap gap-1.5">
              {welcomeCurrent.prompts.map((p, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11.5px] font-medium"
                  style={{ background: `${welcomeCurrent.ink}0A`, color: welcomeCurrent.ink, border: `1px solid ${welcomeCurrent.ink}14` }}
                >
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
                    <path d="M1.5 5 L8.5 5 M5.5 2 L8.5 5 L5.5 8" stroke={welcomeCurrent.ink} strokeOpacity="0.45" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {welcomeSteps.map((s, i) => {
              const active = i === welcomeStep;
              return (
                <button
                  key={s.key}
                  onClick={() => setWelcomeStep(i as 0 | 1)}
                  aria-label={`Go to step ${i + 1}`}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: active ? 22 : 6,
                    background: active ? welcomeCurrent.ink : '#e5e7eb',
                  }}
                />
              );
            })}
            <span className="ml-2 text-[11px] font-medium text-gray-400 tabular-nums">
              {welcomeStep + 1} / {welcomeSteps.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {welcomeStep > 0 && (
              <button
                onClick={() => setWelcomeStep((welcomeStep - 1) as 0 | 1)}
                className="h-9 px-3.5 rounded-full text-[12px] font-bold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Back
              </button>
            )}
            {!welcomeIsLast ? (
              <button
                onClick={() => setWelcomeStep((welcomeStep + 1) as 0 | 1)}
                className="h-9 px-4 rounded-full text-[12px] font-bold text-white inline-flex items-center gap-1.5 transition-transform hover:-translate-y-0.5"
                style={{ background: welcomeCurrent.accent }}
              >
                Next
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6H10M10 6L6 2M10 6L6 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            ) : (
              <button
                onClick={dismissWelcome}
                className="h-9 px-4 rounded-full text-[12px] font-bold text-white inline-flex items-center gap-1.5 transition-transform hover:-translate-y-0.5"
                style={{ background: welcomeCurrent.accent }}
              >
                Get started
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6H10M10 6L6 2M10 6L6 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  if (effectiveChatMessage || sessionParam) {
    return (
      <>
        {welcomeModal}
        <SuperAgentChat
          key={sessionParam || effectiveChatMessage || 'new'}
          initialMessage={effectiveChatMessage || ''}
          initialSessionId={sessionParam || undefined}
          initialChatMode={sessionParam ? undefined : mode}
          selectedAgentId={selectedAgent || undefined}
          autoStartRoundtable={liveDemoActive}
          onBack={() => { setChatMessage(null); setSelectedAgent(null); setSelectedScenario(null); setLiveDemoActive(false); navigate('/'); }}
        />
      </>
    );
  }



  return (
    <div
      className={`flex-1 flex flex-col h-full overflow-y-auto relative${domain === 'stocks' ? ' stocks-classic' : ''}`}
      style={{
        ['--domain-accent' as any]: domainTheme.accent,
        ['--domain-accent-soft' as any]: domainTheme.accentSoft,
        ...(domain === 'web3' ? { backgroundColor: '#FFFFFF' } : { backgroundColor: '#FFFFFF' }),
      }}
    >
      {/* ── Stocks page: classical / editorial styling (scoped) ── */}
      {domain === 'stocks' && (
        <style>{`
          .stocks-classic .hero-title h1 {
            /* Wider, weightier serif — avoids the "tall & skinny" look */
            font-family: 'Playfair Display', 'Noto Serif SC', 'Songti SC', Georgia, 'Times New Roman', ui-serif, serif;
            font-weight: 700;
            letter-spacing: -0.015em;
            font-size: 34px;
            line-height: 1.15;
          }
          @media (min-width: 768px) {
            .stocks-classic .hero-title h1 { font-size: 40px; }
          }
          .stocks-classic .hero-title .hero-rule {
            display: inline-block;
            width: 44px;
            height: 1px;
            background: #cbd5e1;
            margin: 4px auto 14px;
          }
          .stocks-classic .hero-title p {
            font-family: 'Open Runde', 'Inter', ui-sans-serif, system-ui, sans-serif;
            font-style: normal;
            font-weight: 400;
            color: #64748b;
            font-size: 13.5px;
            letter-spacing: 0.01em;
          }
          .stocks-classic .usecase-card h3 {
            font-family: 'Playfair Display', Georgia, 'Times New Roman', ui-serif, serif;
            font-weight: 600;
            font-size: 15px;
            letter-spacing: -0.005em;
          }
        `}</style>
      )}
      {/* ── Web3 ambient: canvas dot-wave (inspired by variant.com/community) ── */}
      {domain === 'web3' && (
        <>
          <Web3DotWave />
          {/* soft vignette keeps center content readable over the waves */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              zIndex: 1,
              background:
                'radial-gradient(ellipse 55% 45% at 50% 42%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0) 78%)',
            }}
          />
        </>
      )}
      {welcomeModal}
      {/* ── Top bar: Domain toggle + Upgrade ── */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 pt-4 pb-0 relative" style={{ zIndex: 10 }}>
        <div
          role="tablist"
          aria-label="Asset domain"
          className="inline-flex items-center gap-1"
        >
          {(['stocks', 'web3'] as Domain[]).map(d => {
            const active = domain === d;
            const isW3 = d === 'web3';
            return (
              <button
                key={d}
                role="tab"
                aria-selected={active}
                onClick={() => pickDomain(d)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all"
                style={active
                  ? (isW3
                      ? { background: '#0A0A0A', color: '#fff' }
                      : { background: '#E5E7EB', color: '#111827' })
                  : { background: 'transparent', color: '#9ca3af' }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background: active
                      ? (isW3 ? '#BAFF29' : '#10b981')
                      : '#d1d5db',
                    boxShadow: active && isW3 ? '0 0 6px rgba(186,255,41,0.8)' : undefined,
                  }}
                />
                <span>{isW3 ? 'Web3' : 'Stocks'}</span>
              </button>
            );
          })}
        </div>
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => navigate('/developers')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-900 transition-colors"
            title="Get Loka Skill"
          >
            <I.Code />
            <span>Get Loka Skill</span>
          </button>
          <PlanUpgradeEntry size="sm" hideIfMax />
        </div>
      </div>
      {/* ── Hero + Input ── */}
      <div className="hero-zone flex flex-col items-center pt-14 md:pt-20 pb-6 px-4 relative" style={{ zIndex: 10, ...(domain === 'web3' ? { background: 'transparent', backgroundImage: 'none' } : {}) }}>
        <div className="max-w-[640px] w-full space-y-12" style={{ position: 'relative', zIndex: 1 }}>
          {/* Title */}
          <div className="text-center hero-title space-y-2">
            <h1
              className="text-[32px] md:text-[40px] font-normal tracking-tight leading-[1.15] text-gray-900"
              style={{ fontFamily: "'Newsreader', ui-serif, Georgia, serif", letterSpacing: '-0.02em', fontOpticalSizing: 'auto', fontWeight: 400 }}
            >
              {domain === 'stocks'
                ? 'Where would you like to invest?'
                : 'Where to explore in crypto?'}
            </h1>
          </div>

          {/* Input Box */}
          <div className="input-box hero-input bg-white border border-gray-200 rounded-2xl relative" style={{ boxShadow: '0 2px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)' }}>
            <style>{`
              @keyframes home-voice-bar { 0%,100%{height:3px} 50%{height:10px} }
              .home-voice-bar { min-height:3px; display:inline-block; border-radius:9999px; background:#9ca3af; }
            `}</style>
            {/* Voice overlay: Recording */}
            {homeVoiceState === 'recording' && (
              <div className="absolute inset-x-0 top-0 bottom-[52px] flex items-center justify-center">
                <div className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <div className="flex items-end gap-[3px] h-4">
                    {[
                      { delay: '0s',    dur: '1.8s' },
                      { delay: '0.3s',  dur: '1.2s' },
                      { delay: '0.6s',  dur: '2.1s' },
                      { delay: '0.15s', dur: '1.5s' },
                      { delay: '0.45s', dur: '1.9s' },
                    ].map(({ delay, dur }, i) => (
                      <span key={i} className="home-voice-bar w-[3px]" style={{ animationName: 'home-voice-bar', animationDuration: dur, animationDelay: delay, animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite' }} />
                    ))}
                  </div>
                  <button onClick={stopHomeRecording} className="ml-0.5 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            )}
            {/* Voice overlay: Transcribing */}
            {homeVoiceState === 'transcribing' && (
              <div className="absolute inset-x-0 top-0 bottom-[52px] flex items-center justify-center">
                <div className="flex items-center bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm">
                  <span className="text-[13px] text-gray-500 font-medium">Thinking…</span>
                </div>
              </div>
            )}
            {/* Hidden file input */}
            <input ref={homeFileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleHomeFileChange} />
            {/* Image preview strip */}
            {pastedImages.length > 0 && homeVoiceState === 'idle' && (
              <div className="flex items-center gap-2 px-4 pt-3 flex-wrap">
                {pastedImages.map((src, idx) => (
                  <div key={idx} className="relative group shrink-0">
                    <img src={src} alt="" className="w-14 h-14 rounded-xl object-cover border border-gray-200 shadow-sm" />
                    <button
                      onClick={() => setPastedImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onPaste={handleHomePaste}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                    e.preventDefault();
                    tryStartChat(input);
                  }
                }}
                rows={3}
                disabled={homeVoiceState !== 'idle'}
                className="w-full bg-transparent outline-none text-[15px] text-gray-900 px-4 pt-4 pb-2 resize-none"
                style={{ visibility: homeVoiceState !== 'idle' ? 'hidden' : 'visible' }}
              />
              {/* Fake placeholder overlay — animates without remounting the
                  textarea, so focus is preserved across rotations. */}
              {!input && homeVoiceState === 'idle' && (
                <span
                  key={phIdx}
                  aria-hidden="true"
                  className="ph-fade-in absolute top-4 left-4 right-4 text-[15px] text-gray-400 pointer-events-none select-none whitespace-pre-wrap break-words"
                >
                  {PLACEHOLDERS[phIdx]}
                </span>
              )}
            </div>
            {/* Input toolbar */}
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1">
                <ModeSelector
                  mode={mode}
                  onModeChange={setMode}
                  roundtableQuota={roundtableQuota}
                  fastQuota={fastQuota}
                  isGuest={!api.isAuthenticated}
                  onLockedClick={() => window.dispatchEvent(new Event('show-auth-modal'))}
                />
                {/* Selected Agent tag — sits right next to mode selector */}
                {selectedAgent && (() => {
                  const ag = QUICK_ACTIONS.find(a => a.id === selectedAgent);
                  if (!ag) return null;
                  const AgIc = ag.icon;
                  return (
                    <div className="agent-tag flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-[12px] font-medium">
                      <AgIc />
                      <span>{ag.label}</span>
                      <button
                        onClick={() => setSelectedAgent(null)}
                        className="ml-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-blue-100 transition-colors"
                      >
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => homeFileRef.current?.click()} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all" title="Attach file">
                  <InputIcons.Attach />
                </button>
                <button
                  onClick={handleHomeVoiceClick}
                  title={homeVoiceState === 'recording' ? 'Stop recording' : 'Voice input'}
                  disabled={homeVoiceState === 'transcribing'}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    homeVoiceState === 'recording'
                      ? 'text-red-500 bg-red-50 hover:bg-red-100'
                      : homeVoiceState === 'transcribing'
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {homeVoiceState === 'recording' ? (
                    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                  ) : (
                    <InputIcons.Mic />
                  )}
                </button>
                <button
                  onClick={() => {
                    tryStartChat(input);
                  }}
                  className={`send-btn-active w-8 h-8 rounded-lg flex items-center justify-center transition-all ${input.trim() ? 'bg-gray-700 text-white hover:bg-gray-800' : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    }`}>
                  <I.Send />
                </button>
              </div>
            </div>
          </div>

          {/* Agent Guide — only when an agent is selected */}
          {selectedAgent && AGENT_GUIDES[selectedAgent] && (() => {
            // Scenario IDs that only make sense in one domain. Anything
            // not listed here is shown in both domains but then further
            // filtered by prompt-level keywords (see below).
            const STOCKS_ONLY_SCENARIOS = new Set([
              'stock', 'public', 'usstock', 'ashare', 'compare', 'startup',
              'region', 'sector',
              // Signal Radar (research) AI-ecosystem scenarios are
              // stock/tech-flavoured, not crypto.
              'intel', 'demand', 'trending', 'competitor',
            ]);
            const WEB3_ONLY_SCENARIOS = new Set([
              'crypto', 'project',
              // Signal Radar web3 scenarios
              'w3-intel', 'w3-narratives', 'w3-tokens', 'w3-protocols',
              // Daily News web3 scenarios
              'w3-majors', 'w3-ecosystems', 'w3-onchain',
            ]);
            const filterScenarios = (scenarios: NonNullable<typeof AGENT_GUIDES[string]['scenarios']>) =>
              scenarios.filter(s => {
                if (domain === 'stocks' && WEB3_ONLY_SCENARIOS.has(s.id)) return false;
                if (domain === 'web3' && STOCKS_ONLY_SCENARIOS.has(s.id)) return false;
                return true;
              });

            // Prompt-level keyword filter. Web3 drops anything that reads
            // as a pure stock prompt (common tickers / companies / macros).
            // Stocks drops anything that reads as a pure crypto prompt.
            const STOCKY_RE = /\b(NVIDIA|NVDA|Tesla|TSLA|Apple|AAPL|Microsoft|MSFT|Google|GOOGL|Amazon|AMZN|Palantir|PLTR|CrowdStrike|CRWD|Snowflake|SNOW|Datadog|DDOG|Meta|META|BYD|Grab|GoTo|S&P\s?500|Dow|Nasdaq|A-share|Hong Kong|Fed|CPI|FDA|semiconductor|equit(y|ies)|dividend|ETF|earnings|valuation|stock)\b/i;
            const CRYPTO_RE = /\b(BTC|ETH|SOL|Bitcoin|Ethereum|Solana|Sui|Aptos|L1|L2|DeFi|on-chain|onchain|token(omics)?|crypto|Eigenlayer|Celestia|Base\s?(L2|\()|restaking|Coinbase)\b/i;

            const promptFitsDomain = (p: string) => {
              if (domain === 'web3') {
                if (STOCKY_RE.test(p) && !CRYPTO_RE.test(p)) return false;
                return true;
              }
              // stocks domain
              if (CRYPTO_RE.test(p) && !STOCKY_RE.test(p)) return false;
              return true;
            };

            const rawScenarios = AGENT_GUIDES[selectedAgent].scenarios;
            const scenarios = rawScenarios
              ? filterScenarios(rawScenarios)
                  .map(s => ({ ...s, prompts: s.prompts.filter(promptFitsDomain) }))
                  .filter(s => s.prompts.length > 0)
              : undefined;

            // Which agents keep the secondary scenario pills:
            //   · Stocks domain: Guru Council, Daily News, Signal Radar.
            //   · Web3 domain: Daily News, Signal Radar (Guru Council is
            //     stocks-only anyway).
            const PILL_AGENTS_STOCKS = new Set(['guru-council', 'daily-news', 'research']);
            const PILL_AGENTS_WEB3 = new Set(['daily-news', 'research']);
            const showPills =
              ((domain === 'stocks' && PILL_AGENTS_STOCKS.has(selectedAgent)) ||
               (domain === 'web3' && PILL_AGENTS_WEB3.has(selectedAgent))) &&
              !!scenarios && scenarios.length > 0;
            return (
            <div className="hero-guide space-y-3" style={{ animation: 'fade-up 0.35s var(--ease-out-expo) both' }}>

              {/* Guru carousel — only for guru-council, wider than input box */}
              {selectedAgent === 'guru-council' && (
                <div className="-mx-20 md:-mx-40" style={{ animation: 'fade-up 0.45s var(--ease-out-expo) 0.1s both' }}>
                  <GuruCarousel onSelect={(name) => {
                    const prompt = `What would ${name} say about `;
                    setInput(prompt);
                    setTimeout(() => {
                      const el = inputRef.current;
                      if (el) {
                        el.focus();
                        el.setSelectionRange(prompt.length, prompt.length);
                      }
                    }, 0);
                  }} />
                </div>
              )}

              {showPills && (
                <div className="flex flex-wrap gap-2">
                  {scenarios!.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedScenario(selectedScenario === s.id ? null : s.id)}
                      className={`scenario-pill px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${selectedScenario === s.id
                        ? 'bg-gray-700 text-white border-gray-700'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
                        }`}
                    >{s.label}</button>
                  ))}
                </div>
              )}

              {(() => {
                const guide = AGENT_GUIDES[selectedAgent];
                let prompts: string[] = [];
                if (showPills) {
                  // Pills visible: show prompts for the active scenario (or
                  // the first one by default).
                  const activeId = selectedScenario ?? scenarios![0]?.id;
                  prompts = scenarios!.find(s => s.id === activeId)?.prompts ?? [];
                } else if (scenarios && scenarios.length > 0) {
                  // Pills hidden: flatten one prompt per scenario so the
                  // user still sees a representative spread of use cases.
                  const seen = new Set<string>();
                  for (const s of scenarios) {
                    for (const p of s.prompts) {
                      if (seen.has(p)) continue;
                      seen.add(p);
                      prompts.push(p);
                      break; // one per scenario
                    }
                  }
                  // Top up to ~6 items from remaining scenario prompts.
                  if (prompts.length < 6) {
                    for (const s of scenarios) {
                      for (const p of s.prompts) {
                        if (seen.has(p)) continue;
                        seen.add(p);
                        prompts.push(p);
                        if (prompts.length >= 6) break;
                      }
                      if (prompts.length >= 6) break;
                    }
                  }
                } else {
                  prompts = guide.prompts ?? [];
                }
                if (!prompts.length) return null;
                return (
                  <div className="space-y-1">
                    {prompts.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => setInput(p)}
                        className="prompt-item w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-left text-[14px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent hover:border-gray-100 transition-colors group"
                      >
                        <span>{p}</span>
                        <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-400 shrink-0 ml-3 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
            );
          })()}
        </div>

        {/* Agent pills — outside max-w-640, full width row */}
        {!selectedAgent && (
          <div className="hero-actions pt-6 pb-5 px-4 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {FEATURED_AGENTS.filter(a => !(domain === 'web3' && a.id === 'guru-council')).map(a => {
                const Ic = a.icon;
                return (
                  <button key={a.id}
                    onClick={() => {
                      if ((a as any).agentId) {
                        setSelectedAgent((a as any).agentId);
                        setSelectedScenario(null);
                        if (a.prompt) tryStartChat(a.prompt);
                      } else if (a.route) {
                        navigate(a.route);
                      } else if (a.prompt) {
                        tryStartChat(a.prompt);
                      }
                    }}
                    className="qa-pill flex items-center gap-2 px-4 py-2.5 rounded-full border border-gray-200 bg-white/70 text-[14px] font-medium text-gray-600 hover:bg-gray-100 hover:border-gray-300 hover:text-gray-900 transition-colors whitespace-nowrap">
                    <Ic /> {a.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Roundtable banner — replaces use cases, Stocks only ── */}
      {!selectedAgent && domain === 'stocks' && (
        <div className="px-4 pb-10 pt-0 w-full">
          <RoundtableBanner onLiveDemo={() => {
            if (!isLoggedIn) {
              window.dispatchEvent(new Event('show-auth-modal'));
              return;
            }
            setMode('roundtable');
            setLiveDemoActive(true);
            setChatMessage('Is NVIDIA still a buy at current valuations?');
          }} />
        </div>
      )}

      {/* ── Web3 Pulse banner — on-chain snapshot, Web3 only ── */}
      {!selectedAgent && domain === 'web3' && (
        <div className="px-4 pb-10 pt-0 w-full relative" style={{ zIndex: 10 }}>
          <Web3PulseBanner onAsk={(q) => tryStartChat(q)} />
        </div>
      )}

      {/* ── Featured Groups — hidden for now ── */}
      {false && !selectedAgent && (() => {
        const avatarColors = ['bg-blue-400', 'bg-emerald-400', 'bg-violet-400', 'bg-amber-400', 'bg-rose-400', 'bg-cyan-400', 'bg-indigo-400'];
        return (
          <div className="pb-12 px-4 max-w-[640px] w-full mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <span style={{ display: 'inline-block', width: 3, height: 14, borderRadius: 2, backgroundColor: 'var(--accent)', flexShrink: 0 }} />
              <h2 className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Featured Groups</h2>
            </div>
            <div className="flex flex-col gap-2.5">
              {FEATURED_GROUPS.map(g => (
                <button key={g.id}
                  onClick={() => navigate(`/chat?group=${g.id}`)}
                  className="group w-full text-left bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all duration-200 overflow-hidden cursor-pointer"
                >
                  <div className="px-4 py-3.5">
                    <div className="flex items-center gap-3 mb-2">
                      {/* Stacked member avatars */}
                      <div className="relative shrink-0 flex items-center h-7" style={{ width: Math.min(g.avatars.length, 4) * 18 + 12 }}>
                        {g.avatars.slice(0, 4).map((initials, i) => (
                          <div key={i} className={`absolute w-7 h-7 rounded-full ${avatarColors[i % avatarColors.length]} text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white shadow-sm transition-transform hover:-translate-y-0.5`} style={{ left: i * 16, zIndex: 10 - i }}>{initials}</div>
                        ))}
                        {g.avatars.length > 4 && (
                          <div className="absolute w-7 h-7 rounded-full bg-gray-50 text-gray-400 text-[9px] font-bold flex items-center justify-center ring-2 ring-white shadow-sm" style={{ left: 4 * 16, zIndex: 0 }}>
                            +{g.avatars.length - 4}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-bold text-gray-900 leading-tight truncate">{g.name}</p>
                          <span className="text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0" style={{ color: 'var(--accent)' }}>View →</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-snug line-clamp-1 mb-2.5">{g.desc}</p>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
                        {g.memberCount} members
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" /></svg>
                        {g.agentCount} agents
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                        {g.online} online
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

    </div>
  );
};

export default SuperAgentHome;