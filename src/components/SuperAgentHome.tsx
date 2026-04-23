import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
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

// ─── Home Feed: Crypto Trending + Upcoming Events Calendar ─────────────
interface TrendingCoinItem {
  id: string;
  symbol: string;
  name: string;
  activatedAt: number;
  thumb?: string;
  rank?: number;
  priceUsd?: number;
  change24hPct?: number;
  source?: 'cg-new' | 'cg-trending';
}

/** Format USD price with crypto-friendly precision:
 *  - Large values ($1K+): comma-separated, no decimals
 *  - Normal ($1-$1K): 2 decimals
 *  - Small ($0.01-$1): 4 decimals
 *  - Very small: subscript-zero notation common in meme-coin UIs
 *    e.g., 5.37e-8 → "$0.0₇537" (zero + 7 subscripted zeros + 537) */
function formatPrice(v?: number): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '';
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  if (v >= 0.0001) return `$${v.toFixed(6)}`;
  // Subscript-zeros: count leading zeros after the decimal point, show 3 sig digits.
  const fixed = v.toFixed(16);
  const dot = fixed.indexOf('.');
  if (dot < 0) return `$${fixed}`;
  const afterDot = fixed.slice(dot + 1);
  let leadingZeros = 0;
  for (const c of afterDot) {
    if (c === '0') leadingZeros++;
    else break;
  }
  const sigDigits = afterDot.slice(leadingZeros).replace(/0+$/, '').slice(0, 3);
  if (!sigDigits) return `$${fixed}`;
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const subZeros = String(leadingZeros).split('').map((d) => SUB[Number(d)]).join('');
  return `$0.0${subZeros}${sigDigits}`;
}

interface UpcomingEventItem {
  id: number;
  title: string;
  dateEvent: number;
  displayedDate: string;
  categoryName: string;
  coinSymbols: string[];
  coinNames: string[];
  source: string;
}

function formatRelativeDate(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const diff = ts - Date.now();
  const d = Math.round(diff / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  if (d > 1 && d < 7) return `in ${d}d`;
  if (d > -7 && d < -1) return `${-d}d ago`;
  const date = new Date(ts);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

const EventsCalendar: React.FC<{ onPick: (prompt: string) => void }> = ({ onPick }) => {
  const [trending, setTrending] = useState<TrendingCoinItem[]>([]);
  const [events, setEvents] = useState<UpcomingEventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/events/home-feed?trendingLimit=9&eventsLimit=8`);
        const body = await res.json();
        if (!alive) return;
        if (body?.ok) {
          if (Array.isArray(body.trending)) setTrending(body.trending);
          if (Array.isArray(body.events)) setEvents(body.events);
        }
      } catch {
        /* silent fail — component hides if both lists empty */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!loading && trending.length === 0 && events.length === 0) return null;

  // Both columns render same number of items with same card height (h-[88px])
  // so the columns line up visually. line-clamp keeps long titles/names from
  // breaking the layout.
  const ROWS_PER_COLUMN = 6;

  return (
    <div className="px-4 pb-10 pt-2 max-w-[640px] w-full mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── Left: Crypto Trending ── */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <span style={{ display: 'inline-block', width: 3, height: 14, borderRadius: 2, backgroundColor: 'var(--accent)', flexShrink: 0 }} />
            <h2 className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Crypto Trending</h2>
            <span className="text-[10px] text-gray-300 font-medium">· Hot now</span>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: ROWS_PER_COLUMN }).map((_, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 h-[88px] animate-pulse">
                  <div className="h-3 w-16 bg-gray-100 rounded mb-2" />
                  <div className="h-2 w-20 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : trending.length === 0 ? (
            <p className="text-[11px] text-gray-300">No trending data</p>
          ) : (
            <div className="space-y-2">
              {trending.slice(0, ROWS_PER_COLUMN).map((item) => {
                const prompt = `Analyze ${item.symbol} (${item.name}) — price action, fundamentals, and whether it's worth entering now`;
                const price = formatPrice(item.priceUsd);
                const chg = item.change24hPct;
                const chgColor = chg == null ? 'text-gray-400' : chg >= 0 ? 'text-emerald-600' : 'text-red-500';
                const chgStr = chg == null || !Number.isFinite(chg) ? '' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
                return (
                  <button
                    key={item.id}
                    onClick={() => onPick(prompt)}
                    className="usecase-card group w-full text-left bg-white border border-gray-100 rounded-xl p-3 h-[88px] cursor-pointer flex items-center gap-3"
                  >
                    {item.thumb ? (
                      <img
                        src={item.thumb}
                        alt={item.symbol}
                        className="w-8 h-8 rounded-md object-cover shrink-0"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-md bg-gray-50 flex items-center justify-center text-gray-500 text-[10px] font-bold shrink-0">
                        {item.symbol.slice(0, 2)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-[13px] font-bold text-gray-900 leading-none truncate">{item.symbol}</h3>
                        {item.rank != null && (
                          <span className="text-[9px] text-gray-400 font-medium tabular-nums shrink-0">#{item.rank}</span>
                        )}
                      </div>
                      <p className="text-[10.5px] text-gray-400 leading-snug truncate">{item.name}</p>
                    </div>
                    {(price || chgStr) && (
                      <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                        {price && <span className="text-[12px] font-semibold text-gray-800 tabular-nums leading-none">{price}</span>}
                        {chgStr && <span className={`text-[10px] font-medium tabular-nums leading-none ${chgColor}`}>{chgStr}</span>}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right: Events Calendar ── */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <span style={{ display: 'inline-block', width: 3, height: 14, borderRadius: 2, backgroundColor: 'var(--accent)', flexShrink: 0 }} />
            <h2 className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Events Calendar</h2>
            <span className="text-[10px] text-gray-300 font-medium">· Upcoming catalysts</span>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: ROWS_PER_COLUMN }).map((_, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 h-[88px] animate-pulse">
                  <div className="h-2 w-16 bg-gray-100 rounded mb-2" />
                  <div className="h-3 w-32 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="text-[11px] text-gray-300">No upcoming events</p>
          ) : (
            <div className="space-y-2">
              {events.slice(0, ROWS_PER_COLUMN).map((ev) => {
                const relative = formatRelativeDate(ev.dateEvent);
                const href = ev.source || '#';
                return (
                  <a
                    key={ev.id}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="usecase-card group w-full text-left bg-white border border-gray-100 rounded-xl p-3 h-[88px] cursor-pointer flex flex-col justify-center gap-1 no-underline"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-semibold text-amber-600 uppercase tracking-wide">{ev.categoryName}</span>
                      <span className="text-[9px] text-gray-200">·</span>
                      <span className="text-[9px] text-gray-400 font-medium tabular-nums">{ev.displayedDate}</span>
                      {relative && (
                        <span className="ml-auto text-[9px] text-gray-400 font-medium tabular-nums shrink-0 flex items-center gap-1">
                          {relative}
                          <svg className="w-2.5 h-2.5 text-gray-300 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <h3 className="text-[12.5px] font-semibold text-gray-900 leading-snug line-clamp-1">{ev.title}</h3>
                    {ev.coinSymbols.length > 0 && (() => {
                      // Backend may return duplicate symbols (e.g. multi-chain tokens merged).
                      // Dedupe so React keys stay unique and the chip row doesn't repeat.
                      const uniqueSyms = Array.from(new Set(ev.coinSymbols));
                      return (
                        <div className="flex flex-wrap gap-1 -mt-0.5">
                          {uniqueSyms.slice(0, 3).map((sym) => (
                            <span key={sym} className="px-1.5 py-px rounded bg-gray-50 text-[10px] font-medium text-gray-500">{sym}</span>
                          ))}
                          {uniqueSyms.length > 3 && (
                            <span className="px-1.5 py-px text-[10px] text-gray-300">+{uniqueSyms.length - 3}</span>
                          )}
                        </div>
                      );
                    })()}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SuperAgentHome: React.FC<SuperAgentHomeProps> = ({
  isLoggedIn = false,
  onRequireLogin,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [input, setInput] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [mode, setMode] = useState<'auto' | 'fast' | 'roundtable'>('auto');
  const [chatMessage, setChatMessage] = useState<string | null>(null);
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
  // DEBUG: force welcome modal every mount. Restore the commented-out
  // initializer below to go back to "show only on first visit".
  const [showWelcome, setShowWelcome] = useState<boolean>(true);
  // const [showWelcome, setShowWelcome] = useState<boolean>(() => {
  //   if (typeof window === 'undefined') return false;
  //   return window.localStorage.getItem(DOMAIN_STORAGE_KEY) === null;
  // });
  const [welcomeStep, setWelcomeStep] = useState<0 | 1>(0);
  const domainTheme = DOMAIN_THEME[domain];
  const pickDomain = (d: Domain) => {
    if (d === domain) return;
    setDomain(d);
    try { window.localStorage.setItem(DOMAIN_STORAGE_KEY, d); } catch {}
    setShowWelcome(false);
    // Switching domain closes any open agent pill and its scenario, so
    // the Stocks/Web3 views never bleed into each other.
    setSelectedAgent(null);
    setSelectedScenario(null);
  };
  const dismissWelcome = () => setShowWelcome(false);

  // Roundtable quota
  const [roundtableQuota, setRoundtableQuota] = useState<RoundtableQuota | null>(null);
  const [fastQuota, setFastQuota] = useState<FastQuota | null>(null);
  useEffect(() => {
    // Guests see Fast/Roundtable as locked (ModeSelector isGuest prop),
    // so the quota badges are irrelevant for them — skip the auth-gated call.
    if (!api.isAuthenticated) {
      setRoundtableQuota(null);
      setFastQuota(null);
      return;
    }
    api.getQuota()
      .then(q => {
        setRoundtableQuota({ used: q.roundtable.used, limit: q.roundtable.limit });
        if (q.fast) setFastQuota({ used: q.fast.used, limit: q.fast.limit });
      })
      .catch(() => {
        setRoundtableQuota({ used: 2, limit: 3 });
        setFastQuota({ used: 10, limit: 10 });
      });
  }, []);

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
      setPhIdx(Math.floor(Math.random() * QUICK_ACTIONS.length));
    }
  }, [newChatTs]); // eslint-disable-line

  // Auto-select first scenario when entering an agent's secondary page
  useEffect(() => {
    if (selectedAgent && AGENT_GUIDES[selectedAgent]?.scenarios?.length) {
      setSelectedScenario(AGENT_GUIDES[selectedAgent].scenarios![0].id);
    }
  }, [selectedAgent]);

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
          onBack={() => { setChatMessage(null); setSelectedAgent(null); setSelectedScenario(null); navigate('/'); }}
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
        ...(domain === 'web3' ? { backgroundColor: '#FFFFFF' } : {}),
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
            font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
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
        <div className="hidden md:block">
          <PlanUpgradeEntry size="md" hideIfMax />
        </div>
      </div>
      {/* ── Hero + Input ── */}
      <div className="hero-zone flex flex-col items-center pt-14 md:pt-20 pb-6 px-4 relative" style={{ zIndex: 10, ...(domain === 'web3' ? { background: 'transparent', backgroundImage: 'none' } : {}) }}>
        <div className="max-w-[640px] w-full space-y-7" style={{ position: 'relative', zIndex: 1 }}>
          {/* Title */}
          <div className="text-center hero-title space-y-2">
            <h1 className="text-[38px] md:text-[46px] font-extrabold tracking-tight leading-[1.15] text-gray-900">
              {domain === 'stocks'
                ? 'Where would you like to invest?'
                : 'Where is the on-chain alpha?'}
            </h1>
            <p className="text-[14px] text-gray-400 font-normal">
              {domain === 'stocks'
                ? 'Multi-agent AI for stocks, sectors & macro intelligence.'
                : 'Multi-agent AI for tokens, protocols & on-chain signals.'}
            </p>
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
            <textarea
              key={phIdx}
              value={input}
              onChange={e => setInput(e.target.value)}
              onPaste={handleHomePaste}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                  e.preventDefault();
                  setChatMessage(input.trim());
                }
              }}
              placeholder={homeVoiceState !== 'idle' ? '' : PLACEHOLDERS[phIdx]}
              rows={3}
              disabled={homeVoiceState !== 'idle'}
              className="ph-fade-in w-full bg-transparent outline-none text-[15px] text-gray-900 placeholder:text-gray-400 px-4 pt-4 pb-2 resize-none"
              style={{ visibility: homeVoiceState !== 'idle' ? 'hidden' : 'visible' }}
            />
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
                    setChatMessage(input.trim());
                  }}
                  className={`send-btn-active w-8 h-8 rounded-lg flex items-center justify-center transition-all ${input.trim() ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    }`}>
                  <I.Send />
                </button>
              </div>
            </div>
          </div>

          {/* Agent Guide — only when an agent is selected */}
          {selectedAgent && AGENT_GUIDES[selectedAgent] && (() => {
            // Scenario IDs that only make sense in one domain. Anything
            // not listed here is shown in both domains.
            const STOCKS_ONLY_SCENARIOS = new Set(['stock', 'public', 'usstock', 'ashare']);
            const WEB3_ONLY_SCENARIOS   = new Set(['crypto', 'project']);
            const filterScenarios = (scenarios: NonNullable<typeof AGENT_GUIDES[string]['scenarios']>) =>
              scenarios.filter(s => {
                if (domain === 'stocks' && WEB3_ONLY_SCENARIOS.has(s.id)) return false;
                if (domain === 'web3'   && STOCKS_ONLY_SCENARIOS.has(s.id)) return false;
                return true;
              });
            const rawScenarios = AGENT_GUIDES[selectedAgent].scenarios;
            const scenarios = rawScenarios ? filterScenarios(rawScenarios) : undefined;
            return (
            <div className="hero-guide space-y-3" style={{ animation: 'fade-up 0.35s var(--ease-out-expo) both' }}>

              {/* Guru carousel — only for guru-council, wider than input box */}
              {selectedAgent === 'guru-council' && (
                <div className="-mx-20 md:-mx-40" style={{ animation: 'fade-up 0.45s var(--ease-out-expo) 0.1s both' }}>
                  <GuruCarousel onSelect={(name) => setInput(`Analyze my portfolio from ${name}'s perspective`)} />
                </div>
              )}

              {scenarios && scenarios.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {scenarios.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedScenario(selectedScenario === s.id ? null : s.id)}
                      className={`scenario-pill px-3 py-1.5 rounded-full text-[12px] font-medium border ${selectedScenario === s.id
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
                        }`}
                    >{s.label}</button>
                  ))}
                </div>
              )}

              {(() => {
                const guide = AGENT_GUIDES[selectedAgent];
                const prompts = scenarios
                  ? scenarios.find(s => s.id === selectedScenario)?.prompts ?? []
                  : guide.prompts ?? [];
                if (!prompts.length) return null;
                return (
                  <div className="space-y-1">
                    {prompts.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => setInput(p)}
                        className="prompt-item w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-left text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent hover:border-gray-100 transition-colors group"
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
                        if (a.prompt) setChatMessage(a.prompt);
                      } else if (a.route) {
                        navigate(a.route);
                      } else if (a.prompt) {
                        setChatMessage(a.prompt);
                      }
                    }}
                    className="qa-pill flex items-center gap-2 px-4 py-2.5 rounded-full border border-gray-200 bg-white text-[13px] font-medium text-gray-600 hover:border-gray-300 hover:text-gray-900 hover:shadow-sm whitespace-nowrap">
                    <Ic /> {a.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Use Cases — only on top-level, hidden when an agent is active ── */}
      {!selectedAgent && (
        <div className="px-4 pb-10 pt-8 max-w-[960px] w-full mx-auto relative" style={{ zIndex: 10 }}>
          <div className="flex items-center gap-2 mb-4">
            <span style={{ display: 'inline-block', width: 3, height: 14, borderRadius: 2, backgroundColor: domainTheme.accent, flexShrink: 0 }} />
            <h2 className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Explore Use Cases</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {USE_CASES.filter(uc => uc.domain === domain).map(uc => {
              const Ic = UseCaseIcons[uc.id];
              return (
                <button
                  key={uc.id}
                  onClick={() => setChatMessage(uc.prompt)}
                  className="usecase-card group text-left bg-white border border-gray-100 rounded-2xl p-4 cursor-pointer hover:border-gray-200 hover:-translate-y-0.5 transition-all"
                  style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: domainTheme.accentSoft, color: domain === 'web3' ? '#65a30d' : domainTheme.accent }}>
                    {Ic ? <Ic /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M3 17l4-4 4 4 4-6 4 2"/><path d="M21 21H3"/></svg>}
                  </div>
                  <h3 className="text-[13px] font-semibold text-gray-900 mb-1 leading-snug">{uc.title}</h3>
                  <p className="text-[11px] text-gray-500 leading-relaxed mb-3 line-clamp-2">{uc.desc}</p>
                  <div className="flex flex-wrap gap-1">
                    {uc.tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded-md bg-gray-50 text-[10px] font-medium text-gray-500">{tag}</span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Events Calendar — crypto-only content (Crypto Trending + catalysts).
           Hidden in Stocks domain since CoinGecko/CoinMarketCal data is irrelevant there. ── */}
      {!selectedAgent && domain === 'web3' && (
        <EventsCalendar onPick={(prompt) => setChatMessage(prompt)} />
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
