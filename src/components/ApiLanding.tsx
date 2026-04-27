import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Web3DotWave from './Web3DotWave';

/* ═══════════════════════════════════════════════
   Loka Developer Platform — Skill API Documentation
   Mirrors public/skill.md — 10 endpoints, 3 domains.
   Layout references asksurf.ai commands-catalog pattern.
═══════════════════════════════════════════════ */

// ─── Scroll Reveal ─────────────────────────────
const useScrollReveal = (threshold = 0.05) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setIsVisible(true); obs.unobserve(el); } },
      { threshold, rootMargin: '0px 0px 0px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, isVisible };
};

const Reveal: React.FC<{ children: React.ReactNode; className?: string; delay?: number; id?: string }> = ({
  children, className = '', delay = 0, id
}) => {
  const { ref, isVisible } = useScrollReveal();
  return (
    <div ref={ref} id={id}
      className={`transition-all duration-1000 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
};

// ─── Particle Canvas (kept for hero backdrop) ───
const ParticleCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const boot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const p = canvas.parentElement;
      if (!p) return;
      canvas.width = p.clientWidth * dpr;
      canvas.height = p.clientHeight * dpr;
      canvas.style.width = `${p.clientWidth}px`;
      canvas.style.height = `${p.clientHeight}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);
    interface P { x: number; y: number; vx: number; vy: number; r: number; a: number; }
    const w = () => canvasRef.current!.width / dpr;
    const h = () => canvasRef.current!.height / dpr;
    const pts: P[] = Array.from({ length: 60 }, () => ({
      x: Math.random() * 2000, y: Math.random() * 1000,
      vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
      r: Math.random() * 1.2 + 0.5, a: Math.random() * 0.12 + 0.04,
    }));
    const frame = () => {
      const W = w(), H = h();
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 110) {
            ctx.strokeStyle = `rgba(0,0,0,${0.06 * (1 - d / 110)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
        ctx.fillStyle = `rgba(0,0,0,${pts[i].a})`;
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, pts[i].r, 0, Math.PI * 2);
        ctx.fill();
      }
      animRef.current = requestAnimationFrame(frame);
    };
    frame();
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(animRef.current); };
  }, []);

  useEffect(() => { const c = boot(); return c; }, [boot]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-0 pointer-events-none" />;
};

// ─── Syntax highlighter ─────────────────────────
const highlightLine = (raw: string): string => {
  let line = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const trimmed = line.trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
    return `<span class="cc">${line}</span>`;
  }

  const slots: string[] = [];
  const ph = (html: string) => { slots.push(html); return `⦗PH${slots.length - 1}HP⦘`; };

  line = line.replace(/(\/\/.*)$/, (_, c) => ph(`<span class="cc">${c}</span>`));
  line = line.replace(/"([^"]*)"/g, (_, inner) => ph(`<span class="cs">"${inner}"</span>`));
  line = line.replace(/'([^']*)'/g, (_, inner) => ph(`<span class="cs">'${inner}'</span>`));
  line = line.replace(/`([^`]*)`/g, (_, inner) => ph(`<span class="cs">\`${inner}\`</span>`));
  line = line.replace(/\b(const|let|function|async|await|return|import|from|curl|POST|GET|DELETE|PUT|if|else)\b/g, '<span class="ck">$1</span>');
  line = line.replace(/\b(\d[\d_]*\.?\d*)\b/g, '<span class="cn">$1</span>');
  line = line.replace(/⦗PH(\d+)HP⦘/g, (_, idx) => slots[parseInt(idx)]);

  return line;
};

const codeStyles = `
.cc { color: #6b7280 }
.ck { color: #a8a29e }
.cs { color: #e5e5e5 }
.cn { color: #d4d4d8 }
`;

const CodeBlock: React.FC<{ code: string }> = ({ code }) => {
  const lines = code.split('\n');
  return (
    <>
      <style>{codeStyles}</style>
      <div className="font-mono text-[10.5px] sm:text-xs leading-[1.75] tracking-tight">
        {lines.map((line, i) => (
          <div key={i} className="flex hover:bg-white/[0.04] transition-colors rounded items-start px-2">
            <span className="w-7 flex-shrink-0 text-right pr-3 text-gray-600 select-none border-r border-[#333] mr-3 pt-px shrink-0">{i + 1}</span>
            <span className="text-gray-300 whitespace-pre-wrap break-words flex-1" dangerouslySetInnerHTML={{ __html: highlightLine(line) || ' ' }} />
          </div>
        ))}
      </div>
    </>
  );
};

const CopyBtn: React.FC<{ code: string; dark?: boolean }> = ({ code, dark = true }) => {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={async () => {
        try { await navigator.clipboard.writeText(code); setOk(true); setTimeout(() => setOk(false), 2000); } catch { /**/ }
      }}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold transition-all border ${
        dark
          ? (ok ? 'bg-white/10 text-white border-white/20' : 'bg-transparent text-gray-500 border-white/10 hover:text-white hover:bg-white/5')
          : (ok ? 'bg-black/5 text-black border-black/10' : 'bg-transparent text-gray-400 border-gray-200 hover:text-black hover:bg-gray-50')
      }`}>
      {ok ? 'Copied' : 'Copy'}
    </button>
  );
};

// ─── Data (mirrors skill.md) ────────────────────
const BASE_URL = 'https://nftkashai.online/lokacash/api/skill/v1';
const INSTALL_CMD = 'npx skills add hetu-project/lokacash-skills --skill lokacash';
const CURL_DEMO = `curl ${BASE_URL}/crypto/market/BTC`;

type DomainKey = 'all' | 'research' | 'crypto' | 'stock';
type Endpoint = {
  method: 'GET' | 'POST';
  path: string;
  desc: string;
  domain: Exclude<DomainKey, 'all'>;
  latency?: string;
  tags: string[];
  example: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    method: 'POST', path: '/research/consensus', domain: 'research', latency: '60-90s',
    tags: ['multi-agent', 'verdict', 'any-asset'],
    desc: 'Multi-agent roundtable on any investment question — returns Bullish/Bearish/Neutral verdict with confidence.',
    example: `curl -X POST ${BASE_URL}/research/consensus \\
  -H "Content-Type: application/json" \\
  -d '{"question":"Should I buy TSLA after Q4 miss?"}'

{
  "ok": true,
  "data": {
    "finalVerdict": "Bearish",
    "finalConfidence": 68,
    "summary": "...markdown report...",
    "agents": [
      { "name": "Fundamental", "verdict": "Bearish", "confidence": 72 }
    ]
  }
}`,
  },
  {
    method: 'POST', path: '/research/deep', domain: 'research', latency: '8-15s',
    tags: ['web', 'social', 'narrative'],
    desc: 'Deep web + social research on any topic — synthesized summary with source citations.',
    example: `curl -X POST ${BASE_URL}/research/deep \\
  -H "Content-Type: application/json" \\
  -d '{"topic":"Latest catalysts for AAPL this week","days":30}'

{
  "ok": true,
  "data": {
    "summary": "...markdown synthesized report...",
    "sources": [
      { "title": "...", "url": "...", "domain": "bloomberg.com" }
    ],
    "xProfiles": [ ... ]
  }
}`,
  },
  {
    method: 'POST', path: '/crypto/deep-research', domain: 'crypto',
    tags: ['token', 'derivatives', 'sentiment'],
    desc: 'Crypto-focused pipeline with resolved token market + sentiment data.',
    example: `curl -X POST ${BASE_URL}/crypto/deep-research \\
  -H "Content-Type: application/json" \\
  -d '{"query":"Why is ETH underperforming this week?"}'`,
  },
  {
    method: 'POST', path: '/crypto/portfolio-analysis', domain: 'crypto', latency: '30-300s',
    tags: ['hedge fund', 'multi-analyst', 'portfolio'],
    desc: 'Multi-analyst hedge-fund decision over 1-3 tickers. Each analyst persona votes BUY/SELL/HOLD; framework fuses into final decision with quantity + confidence.',
    example: `curl -X POST ${BASE_URL}/crypto/portfolio-analysis \\
  -H "Content-Type: application/json" \\
  -d '{"tickers":["AAPL","TSLA"]}'

{
  "ok": true,
  "data": {
    "tickers": ["AAPL", "TSLA"],
    "decisions": {
      "AAPL": { "action": "BUY", "quantity": 100, "confidence": 75 },
      "TSLA": { "action": "HOLD", "quantity": 0, "confidence": 60 }
    },
    "analystSignals": { ... },
    "report": "...full markdown report..."
  }
}`,
  },
  {
    method: 'GET', path: '/crypto/sentiment/:symbol', domain: 'crypto',
    tags: ['24h', 'news', 'mood'],
    desc: 'Per-coin sentiment snapshot (24h) + top catalyst news.',
    example: `curl ${BASE_URL}/crypto/sentiment/BTC

{
  "ok": true,
  "data": {
    "sentiment": {
      "label": "neutral",
      "bullishRatio": 43,
      "bearishRatio": 13,
      "neutralRatio": 44,
      "mentions24h": 1317
    },
    "news": [ ... ]
  }
}`,
  },
  {
    method: 'GET', path: '/crypto/market/:symbol', domain: 'crypto',
    tags: ['spot', 'history', 'volume'],
    desc: 'Spot price + 24h stats + 7-day price history bars.',
    example: `curl ${BASE_URL}/crypto/market/BTC

{
  "ok": true,
  "data": {
    "symbol": "BTC",
    "spot": {
      "price": 75561.20,
      "change24hPct": -2.24,
      "volume24hQuoteUsd": 469598891
    },
    "priceHistory": { "interval": "1D", "bars": [ ... ] }
  }
}`,
  },
  {
    method: 'GET', path: '/crypto/derivatives/:symbol', domain: 'crypto',
    tags: ['funding', 'OI', 'orderbook'],
    desc: 'Perpetual futures — funding rate, open interest, orderbook depth.',
    example: `curl ${BASE_URL}/crypto/derivatives/BTC

{
  "ok": true,
  "data": {
    "derivatives": {
      "fundingRate8h": 0.0001,
      "fundingApr": 0.1095,
      "openInterestUsd": 2663120129,
      "orderbookDepthUsd": 228624
    }
  }
}`,
  },
  {
    method: 'GET', path: '/crypto/events', domain: 'crypto',
    tags: ['listings', 'forks', 'governance'],
    desc: 'Upcoming crypto catalyst events — listings, forks, releases, governance votes.',
    example: `curl "${BASE_URL}/crypto/events?limit=10"

{
  "ok": true,
  "data": {
    "events": [
      {
        "title": "BloFin Listing",
        "dateEvent": "2026-04-20T00:00:00Z",
        "category": "Exchange",
        "coins": ["WMTX"]
      }
    ]
  }
}`,
  },
  {
    method: 'GET', path: '/crypto/trending', domain: 'crypto',
    tags: ['trending', 'search', 'discovery'],
    desc: 'Top-searched coins with live price + 24h change.',
    example: `curl "${BASE_URL}/crypto/trending?limit=10"

{
  "ok": true,
  "data": {
    "trending": [
      {
        "symbol": "RAVE",
        "marketCapRank": 232,
        "priceUsd": 0.5359,
        "change24hPct": -60.52
      }
    ]
  }
}`,
  },
  {
    method: 'GET', path: '/stock/analysis/:ticker', domain: 'stock', latency: '30-60s',
    tags: ['fundamentals', 'technical', 'valuation'],
    desc: 'Full stock analysis — US tickers, HK (700.HK), A-shares (600519.SH).',
    example: `curl ${BASE_URL}/stock/analysis/AAPL

{
  "ok": true,
  "data": {
    "ticker": "AAPL",
    "report": "...full markdown analysis...",
    "asOf": 1745000000000
  }
}`,
  },
];

const DOMAIN_META: Record<Exclude<DomainKey, 'all'>, { label: string; tagline: string; accent: string }> = {
  research: { label: 'Research', tagline: 'Works for any asset — crypto, stocks, macro.', accent: '#111' },
  crypto:   { label: 'Crypto',   tagline: 'Token price, derivatives, sentiment, catalysts.', accent: '#111' },
  stock:    { label: 'Stock',    tagline: 'Equities — fundamentals, technical, valuation.', accent: '#111' },
};

const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
  GET: { bg: '#f5f5f5', text: '#333' },
  POST: { bg: '#000', text: '#fff' },
};

const USE_CASES = [
  {
    t: 'Decision on any asset',
    d: "User asks 'should I buy X?' → agent calls /research/consensus → quotes verdict + confidence + top analyst reasoning.",
    endpoint: '/research/consensus',
  },
  {
    t: 'Narrative research',
    d: "User asks 'what's going on with AI sector?' → /research/deep with days=14 → reads synthesized summary, cites top sources.",
    endpoint: '/research/deep',
  },
  {
    t: 'Funding-rate squeeze check',
    d: "User asks 'is there squeeze risk on BTC perps?' → /crypto/derivatives/BTC → flags extreme funding rate + OI level.",
    endpoint: '/crypto/derivatives/:symbol',
  },
  {
    t: 'Upcoming catalyst scan',
    d: "User asks 'any big crypto events coming up?' → /crypto/events?limit=8 → lists listings, forks, governance votes.",
    endpoint: '/crypto/events',
  },
  {
    t: 'Full stock deep-dive',
    d: "User asks 'do a full analysis on TSLA' → /stock/analysis/TSLA → summarizes returned markdown report.",
    endpoint: '/stock/analysis/:ticker',
  },
  {
    t: 'Market mood scan',
    d: "User asks 'what's the vibe on SOL?' → /crypto/sentiment/SOL → reports bull/bear/neutral ratios + 2 catalyst news.",
    endpoint: '/crypto/sentiment/:symbol',
  },
  {
    t: 'Multi-ticker hedge-fund decision',
    d: "User asks 'AAPL, TSLA, NVDA — what should I do?' → /crypto/portfolio-analysis with all three → reads decisions table + per-analyst signals.",
    endpoint: '/crypto/portfolio-analysis',
  },
];

// Use cases for "For Developers" tab — framed around backend integration patterns,
// not agent prompts. Same endpoint catalog, different mental model.
const DEV_USE_CASES = [
  {
    t: 'Daily price snapshot job',
    d: 'Cron at 00:00 UTC → loop your watchlist → GET /crypto/market/:symbol → write to time-series DB. <340ms each, no rate limit during testing.',
    endpoint: '/crypto/market/:symbol',
  },
  {
    t: 'Catalyst event polling',
    d: 'Poll /crypto/events?limit=20 hourly, dedupe by id, fan out to your own webhook on new entries. Filter category client-side.',
    endpoint: '/crypto/events',
  },
  {
    t: 'On-demand stock analysis',
    d: 'User clicks "Deep Analysis" in your UI → server-side POST → render the returned markdown. 30-60s; queue if blocking the request thread.',
    endpoint: '/stock/analysis/:ticker',
  },
  {
    t: 'Backend portfolio scoring',
    d: 'Nightly batch: per user portfolio, POST /crypto/portfolio-analysis with their tickers → store decisions in DB → surface in dashboard.',
    endpoint: '/crypto/portfolio-analysis',
  },
  {
    t: 'Funding-rate alerting bot',
    d: 'GET /crypto/derivatives/:symbol every 5min. Threshold on `fundingApr` and OI delta → push alert to Telegram / Slack / PagerDuty.',
    endpoint: '/crypto/derivatives/:symbol',
  },
  {
    t: 'Embeddable sector report',
    d: 'POST /research/deep with topic + days=14 → cache the markdown summary → embed in your blog or analyst dashboard.',
    endpoint: '/research/deep',
  },
];

const NAV_LINKS = [
  { label: 'Overview', href: '#overview' },
  { label: 'Install', href: '#install' },
  { label: 'Endpoints', href: '#endpoints' },
  { label: 'Use Cases', href: '#usecases' },
];

// ─── Endpoint Card (asksurf-style, expandable) ──
const EndpointCard: React.FC<{ ep: Endpoint; expanded: boolean; onToggle: () => void }> = ({ ep, expanded, onToggle }) => {
  const mColor = METHOD_COLORS[ep.method];
  return (
    <div className={`bg-white border transition-all ${expanded ? 'border-black shadow-[0_8px_30px_rgba(0,0,0,0.08)]' : 'border-gray-200 hover:border-gray-400'}`}>
      <button onClick={onToggle}
        className="w-full text-left p-5 sm:p-6 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
            style={{ backgroundColor: mColor.bg, color: mColor.text }}>
            {ep.method}
          </span>
          <code className="text-[13px] sm:text-[14px] font-mono font-bold text-black break-all">{ep.path}</code>
          <div className="flex-1" />
          {ep.latency && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 shrink-0">~{ep.latency}</span>
          )}
          <svg className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
        <p className="text-[13px] text-gray-600 leading-relaxed">{ep.desc}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {ep.tags.map(t => (
            <span key={t} className="px-2 py-0.5 text-[10px] font-bold tracking-wide text-gray-500 bg-gray-50 border border-gray-200 rounded-sm">{t}</span>
          ))}
        </div>
      </button>

      {expanded && (
        <div className="bg-[#0a0a0a] border-t border-black">
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/10">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Example</span>
            <CopyBtn code={ep.example} />
          </div>
          <div className="p-3 sm:p-4 overflow-x-auto">
            <CodeBlock code={ep.example} />
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main ───────────────────────────────────────
const ApiLanding: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [activeDomain, setActiveDomain] = useState<DomainKey>('all');
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Audience tab — drives Hero copy/CTA and Use Cases framing. Default to
  // 'agent' since Skill is Lokacash's differentiated entry point.
  const [audience, setAudience] = useState<'agent' | 'developer'>('agent');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled((containerRef.current?.scrollTop || 0) > 50);
    const container = containerRef.current;
    container?.addEventListener('scroll', handleScroll);
    return () => container?.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (href: string) => {
    const id = href.replace('#', '');
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const filteredEndpoints = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ENDPOINTS.filter(e => {
      if (activeDomain !== 'all' && e.domain !== activeDomain) return false;
      if (q && !(e.path.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q) || e.tags.some(t => t.toLowerCase().includes(q)))) return false;
      return true;
    });
  }, [activeDomain, search]);

  const filterChips: { key: DomainKey; label: string; count: number }[] = [
    { key: 'all',      label: 'All',      count: ENDPOINTS.length },
    { key: 'research', label: 'Research', count: ENDPOINTS.filter(e => e.domain === 'research').length },
    { key: 'crypto',   label: 'Crypto',   count: ENDPOINTS.filter(e => e.domain === 'crypto').length },
    { key: 'stock',    label: 'Stock',    count: ENDPOINTS.filter(e => e.domain === 'stock').length },
  ];

  return (
    <div ref={containerRef} className="h-full overflow-y-auto bg-white text-black selection:bg-black selection:text-white font-sans">

      {/* ── Sticky Nav ── */}
      <div className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/90 backdrop-blur-md shadow-sm border-b border-gray-200' : 'bg-transparent'}`}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 flex items-center justify-between h-14 gap-3 sm:gap-4">
          <a href="/" className="flex items-center gap-2 group shrink-0" title="Back to Loka">
            <span className="font-black text-lg tracking-tight text-black group-hover:text-gray-600 transition-colors">Loka</span>
            <span className="text-gray-300 text-sm">/</span>
            <span className="text-sm font-semibold text-gray-500 group-hover:text-gray-700 transition-colors">Developers</span>
          </a>

          {/* Center: audience switcher — always visible while scrolling so users can
              flip the view mode from anywhere on the page, not just the hero. */}
          <div className="inline-flex items-center p-0.5 bg-gray-100/80 backdrop-blur-sm border border-gray-200 rounded-full shrink-0">
            <button
              onClick={() => setAudience('agent')}
              className={`px-2.5 sm:px-4 py-1 text-[10px] sm:text-[11px] font-black tracking-wide uppercase rounded-full transition-all ${
                audience === 'agent' ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-black'
              }`}
            >
              <span className="sm:hidden">Agents</span>
              <span className="hidden sm:inline">For AI Agents</span>
            </button>
            <button
              onClick={() => setAudience('developer')}
              className={`px-2.5 sm:px-4 py-1 text-[10px] sm:text-[11px] font-black tracking-wide uppercase rounded-full transition-all ${
                audience === 'developer' ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-black'
              }`}
            >
              <span className="sm:hidden">Devs</span>
              <span className="hidden sm:inline">For Developers</span>
            </button>
          </div>

          <div className="flex items-center gap-6 shrink-0">
            <nav className="hidden lg:flex items-center gap-7">
              {NAV_LINKS.map(link => (
                <button key={link.href} onClick={() => scrollToSection(link.href)}
                  className="text-sm font-bold text-gray-500 hover:text-black transition-colors">
                  {link.label}
                </button>
              ))}
            </nav>
            <a href="/skill.md" target="_blank" rel="noopener noreferrer"
              className={`hidden sm:inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-black text-white hover:bg-gray-900 transition-all ${scrolled ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              Skill.md
            </a>
          </div>
        </div>
      </div>

      {/* ── 1. Hero — Web3DotWave + centered layout (asksurf-style) ── */}
      <section className="relative w-full min-h-[90vh] flex flex-col justify-center border-b border-gray-200 bg-[#fafafa] overflow-hidden py-16 sm:py-24">
        {/* Base: grid pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0"
          style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '64px 64px' }} />

        {/* Mid: Web3DotWave */}
        <div className="absolute inset-0 pointer-events-none z-[1] opacity-90">
          <Web3DotWave />
        </div>

        {/* Top: subtle particles */}
        <div className="absolute inset-0 overflow-hidden mix-blend-multiply opacity-30 z-[2]">
          <ParticleCanvas />
        </div>

        {/* Fade-out at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-white pointer-events-none z-[3]" />

        <div className="relative z-10 w-full max-w-[1000px] mx-auto px-4 sm:px-12 text-center">
          <Reveal delay={80}>
            <div className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-bold tracking-widest text-gray-700 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-full mb-10">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              No API Key Required
            </div>
          </Reveal>
          <Reveal delay={150} key={`hero-h1-${audience}`}>
            {audience === 'agent' ? (
              <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-black tracking-[-0.04em] leading-[0.95] text-black">
                One Skill. <span className="text-gray-400">Any Asset.</span>
                <br />
                Start Free. <span className="text-gray-400">Zero Setup.</span>
              </h1>
            ) : (
              <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-black tracking-[-0.04em] leading-[0.95] text-black">
                One API. <span className="text-gray-400">Any Asset.</span>
                <br />
                REST in. <span className="text-gray-400">JSON out.</span>
              </h1>
            )}
          </Reveal>
          <Reveal delay={250} key={`hero-sub-${audience}`}>
            {audience === 'agent' ? (
              <p className="text-base sm:text-lg md:text-xl text-gray-600 font-medium leading-relaxed max-w-2xl mx-auto mt-8">
                The unified investment intelligence platform for AI agents.
                <br />
                Install the skill. Start querying. No sign-up needed.
              </p>
            ) : (
              <p className="text-base sm:text-lg md:text-xl text-gray-600 font-medium leading-relaxed max-w-2xl mx-auto mt-8">
                Direct REST access to investment intelligence from your backend.
                <br />
                10 endpoints. Stateless responses. No API key during internal testing.
              </p>
            )}
          </Reveal>

          {/* Inline terminal card — install (agent) vs curl (developer) */}
          <Reveal delay={350} key={`hero-terminal-${audience}`}>
            <div className="mt-10 sm:mt-12 max-w-2xl mx-auto">
              <div className="bg-[#0a0a0a] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden border border-black/10">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                  </div>
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                    {audience === 'agent' ? 'install' : 'try it'}
                  </span>
                </div>
                <div className="relative px-4 sm:px-6 py-5 sm:py-6 text-left">
                  {audience === 'agent' ? (
                    <div className="font-mono text-[12px] sm:text-[14px] text-gray-300 break-all">
                      <span className="text-emerald-400">$</span>{' '}
                      <span className="text-gray-400">npx skills add</span>{' '}
                      <span className="text-white">hetu-project/lokacash-skills</span>{' '}
                      <span className="text-emerald-400">--skill lokacash</span>
                    </div>
                  ) : (
                    <div className="font-mono text-[12px] sm:text-[14px] text-gray-300 break-all">
                      <span className="text-emerald-400">$</span>{' '}
                      <span className="text-gray-400">curl</span>{' '}
                      <span className="text-white">{BASE_URL}</span>
                      <span className="text-emerald-400">/crypto/market/BTC</span>
                    </div>
                  )}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <CopyBtn code={audience === 'agent' ? INSTALL_CMD : CURL_DEMO} />
                  </div>
                </div>
              </div>
              <div className="mt-4 text-[12px] text-gray-500">
                {audience === 'agent'
                  ? 'No API key · No sign-up · Works immediately'
                  : 'No auth · No rate limit · Works from any HTTP client'}
              </div>
            </div>
          </Reveal>

          {/* Works-with strip — agent shows IDE/agent surfaces, dev shows HTTP-capable runtimes */}
          <Reveal delay={450} key={`hero-works-${audience}`}>
            <div className="mt-10 flex items-center justify-center gap-3 sm:gap-5 flex-wrap opacity-90">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                {audience === 'agent' ? 'Works with' : 'Call from'}
              </span>
              <div className="flex items-center gap-3 sm:gap-4">
                {(audience === 'agent'
                  ? [
                      { name: 'Claude Code', initial: 'C' },
                      { name: 'Cursor', initial: 'Cu' },
                      { name: 'OpenClaw', initial: 'Oc' },
                      { name: 'Windsurf', initial: 'W' },
                      { name: 'Continue', initial: '>_' },
                      { name: 'Cline', initial: 'Cl' },
                      { name: 'Aider', initial: 'Ai' },
                    ]
                  : [
                      { name: 'Node.js', initial: 'JS' },
                      { name: 'Python', initial: 'Py' },
                      { name: 'Go', initial: 'Go' },
                      { name: 'Rust', initial: 'Rs' },
                      { name: 'Ruby', initial: 'Rb' },
                      { name: 'PHP', initial: 'Ph' },
                      { name: 'curl', initial: '$_' },
                    ]
                ).map(t => (
                  <div key={t.name} title={t.name}
                    className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm border border-gray-200 flex items-center justify-center text-[10px] font-black text-gray-600 hover:text-black hover:border-black transition-all cursor-default">
                    {t.initial}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Primary CTA — endpoints catalog is shared; secondary CTA differs */}
          <Reveal delay={550}>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button onClick={() => scrollToSection('#endpoints')}
                className="px-6 py-3 bg-black text-white text-[13px] font-black tracking-wide uppercase hover:bg-gray-800 transition-colors flex items-center gap-2 rounded-full">
                Browse 10 Endpoints
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
              </button>
              {audience === 'agent' ? (
                <a href="/skill.md" target="_blank" rel="noopener noreferrer"
                  className="px-6 py-3 text-[13px] font-black tracking-wide uppercase text-gray-600 hover:text-black transition-colors">
                  Read skill.md
                </a>
              ) : (
                <button onClick={() => scrollToSection('#errors')}
                  className="px-6 py-3 text-[13px] font-black tracking-wide uppercase text-gray-600 hover:text-black transition-colors">
                  Errors &amp; Limits
                </button>
              )}
            </div>
          </Reveal>

          {/* Bottom teaser — only on developer tab; SDK is dev-tool-shaped, not skill-shaped */}
          {audience === 'developer' && (
            <Reveal delay={400}>
              <div className="mt-10 sm:mt-16 flex items-center gap-2 text-[11px] font-mono text-gray-500">
                <span className="text-gray-400">$</span>
                <code className="select-all">npm install @loka/sdk</code>
                <span className="text-gray-400 ml-2">// coming soon</span>
                <span className="inline-block w-1.5 h-3 bg-black animate-pulse ml-1" />
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── Stats strip (numbers up front) ── */}
      <section className="border-b border-gray-200 bg-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-200">
          {[
            { n: '4', label: 'Specialized AI agents' },
            { n: '50+', label: 'Payment methods' },
            { n: '190+', label: 'Countries covered' },
            { n: '<340ms', label: 'Risk decision latency' },
          ].map((s, i) => (
            <div key={i} className="px-4 py-8 sm:py-10 text-center sm:text-left">
              <div className="text-2xl sm:text-4xl font-black tracking-tight text-black">{s.n}</div>
              <div className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-2">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 2. Feature intro — split copy + mockup, audience-aware ── */}
      <section id="overview" className="bg-white border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-16 sm:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <Reveal key={`fi-text-${audience}`}>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.25em] mb-5">
                {audience === 'agent' ? 'Lokacash Skill API' : 'Lokacash REST API'}
              </div>
              {audience === 'agent' ? (
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.05] mb-5">
                  Your AI Agent's<br />
                  Investment Brain.
                </h2>
              ) : (
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.05] mb-5">
                  Your Backend's<br />
                  Investment Brain.
                </h2>
              )}
              <p className="text-[15px] text-gray-600 leading-relaxed mb-7 max-w-lg">
                {audience === 'agent'
                  ? 'Install once, access everything. One Lokacash skill gives your AI agent institutional-grade research — multi-agent consensus, deep web + social research, crypto market data, and stock analysis.'
                  : 'Plain HTTP. Predictable JSON. One stateless catalog covering investment consensus, deep web + social research, crypto market & derivatives data, and stock analysis.'}
              </p>
              <div className="space-y-3 mb-8">
                {(audience === 'agent'
                  ? [
                      'One-line install into Claude Code, Cursor, OpenClaw',
                      '10 endpoints across 3 data domains',
                      'Natural language in → structured JSON out',
                      'Multi-agent roundtable debate on any asset',
                      'Unauthenticated during internal testing',
                    ]
                  : [
                      'REST + JSON · stateless · one shared envelope { ok, data | error, hint }',
                      '10 endpoints across 3 data domains, all GET or POST',
                      'No SDK required — fetch / axios / requests / curl, your call',
                      'Latency budget exposed per endpoint (sub-second to 5min)',
                      'No API key during internal testing · CORS-friendly',
                    ]
                ).map(t => (
                  <div key={t} className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                    <span className="text-[13px] text-gray-700">{t}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => scrollToSection('#endpoints')}
                className="inline-flex items-center gap-1.5 text-[13px] font-black text-black hover:text-gray-600 transition-colors">
                {audience === 'agent' ? 'Explore the Skill' : 'Browse the Endpoints'}
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
              </button>
            </Reveal>

            {/* Right mockup: agent shows Claude chat session, dev shows real Node code */}
            <Reveal delay={200} key={`fi-mockup-${audience}`}>
              <div className="bg-[#0a0a0a] rounded-2xl overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-black/10">
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                  <span className="text-[10px] text-gray-500 ml-2 font-mono">
                    {audience === 'agent' ? 'claude-code' : 'analysis.ts'}
                  </span>
                </div>
                {audience === 'agent' ? (
                  <div className="p-5 sm:p-6 font-mono text-[12px] sm:text-[13px] leading-[1.8]">
                    <div className="text-gray-500 mb-1">You:</div>
                    <div className="text-gray-200 mb-5">Should I buy TSLA after the Q4 earnings miss?</div>

                    <div className="text-gray-500 mb-1">Agent:</div>
                    <div className="text-gray-200 mb-2">I'll run a multi-agent consensus for you.</div>
                    <div className="text-pink-400 mb-4">&gt; Running: skill lokacash research/consensus</div>

                    <div className="bg-[#000] border border-white/10 rounded-lg p-4">
                      <div className="text-gray-400 mb-3 text-[11px] font-bold uppercase tracking-widest">TSLA Consensus (4 agents, 2 rounds)</div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-gray-300">
                          <span>Final Verdict:</span><span className="text-amber-400 font-bold">Bearish (68%)</span>
                        </div>
                        <div className="flex justify-between text-gray-300">
                          <span>Fundamental:</span><span className="text-red-400">Bearish (72%)</span>
                        </div>
                        <div className="flex justify-between text-gray-300">
                          <span>Macro:</span><span className="text-yellow-400">Neutral (55%)</span>
                        </div>
                        <div className="flex justify-between text-gray-300">
                          <span>Sentiment:</span><span className="text-red-400">Bearish (70%)</span>
                        </div>
                        <div className="flex justify-between text-gray-300">
                          <span>Quant:</span><span className="text-red-400">Bearish (74%)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 sm:p-6 font-mono text-[11.5px] sm:text-[12.5px] leading-[1.7] overflow-x-auto">
                    <div className="text-gray-500 text-[10px] mb-2 uppercase tracking-widest">// 1 — call</div>
                    <div className="text-gray-300 mb-1">
                      <span className="text-violet-400">const</span> r = <span className="text-violet-400">await</span> <span className="text-cyan-400">fetch</span>(
                    </div>
                    <div className="text-gray-300 pl-4 mb-1">
                      <span className="text-orange-300">'{BASE_URL}/research/consensus'</span>,
                    </div>
                    <div className="text-gray-300 pl-4 mb-1">
                      &#123; <span className="text-cyan-300">method</span>: <span className="text-orange-300">'POST'</span>,
                    </div>
                    <div className="text-gray-300 pl-6 mb-1">
                      <span className="text-cyan-300">headers</span>: &#123; <span className="text-orange-300">'Content-Type'</span>: <span className="text-orange-300">'application/json'</span> &#125;,
                    </div>
                    <div className="text-gray-300 pl-6 mb-1">
                      <span className="text-cyan-300">body</span>: <span className="text-cyan-400">JSON</span>.<span className="text-cyan-400">stringify</span>(&#123;
                    </div>
                    <div className="text-gray-300 pl-8 mb-1">
                      <span className="text-cyan-300">question</span>: <span className="text-orange-300">'Should I buy TSLA?'</span>
                    </div>
                    <div className="text-gray-300 pl-6 mb-1">&#125;)</div>
                    <div className="text-gray-300 pl-4 mb-1">&#125;</div>
                    <div className="text-gray-300 mb-3">);</div>

                    <div className="text-gray-500 text-[10px] mb-2 uppercase tracking-widest">// 2 — read</div>
                    <div className="text-gray-300 mb-3">
                      <span className="text-violet-400">const</span> &#123; <span className="text-cyan-300">data</span> &#125; = <span className="text-violet-400">await</span> r.<span className="text-cyan-400">json</span>();
                    </div>

                    <div className="bg-[#000] border border-white/10 rounded-lg p-3 text-[11px]">
                      <div className="text-gray-500 mb-1.5 text-[10px] uppercase tracking-widest">// data</div>
                      <div className="text-gray-300">&#123;</div>
                      <div className="text-gray-300 pl-3"><span className="text-cyan-300">finalVerdict</span>: <span className="text-orange-300">'Bearish'</span>,</div>
                      <div className="text-gray-300 pl-3"><span className="text-cyan-300">finalConfidence</span>: <span className="text-amber-300">68</span>,</div>
                      <div className="text-gray-300 pl-3"><span className="text-cyan-300">agents</span>: <span className="text-gray-500">[ ...4 ]</span>,</div>
                      <div className="text-gray-300 pl-3"><span className="text-cyan-300">roundsRun</span>: <span className="text-amber-300">2</span>,</div>
                      <div className="text-gray-300 pl-3"><span className="text-cyan-300">summary</span>: <span className="text-orange-300">'...'</span></div>
                      <div className="text-gray-300">&#125;</div>
                    </div>
                  </div>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── 2.5 (Developer-only) Quick Start: auth, base URL, response envelope ── */}
      {audience === 'developer' && (
        <section className="bg-[#fafafa] border-b border-gray-200">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-12 sm:py-16">
            <Reveal>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-gray-200 border border-gray-200">
                {/* Base URL */}
                <div className="bg-white p-5 sm:p-6">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Base URL</div>
                  <code className="block text-[12px] font-mono font-bold text-black bg-gray-50 border border-gray-200 px-3 py-2 break-all">
                    {BASE_URL}
                  </code>
                  <p className="text-[11px] text-gray-500 leading-snug mt-3">
                    All paths in this catalog are appended to the base URL. Production-grade TLS · no regional routing.
                  </p>
                </div>
                {/* Auth */}
                <div className="bg-white p-5 sm:p-6">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Auth</div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-sm">None</span>
                    <span className="text-[11px] text-gray-500">during internal testing</span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-snug">
                    Public release will require a Bearer token in <code className="font-mono text-[10px] bg-gray-50 border border-gray-200 px-1.5 py-0.5">Authorization</code>. Watch this page for migration notes.
                  </p>
                </div>
                {/* Envelope */}
                <div className="bg-white p-5 sm:p-6">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Response Envelope</div>
                  <div className="bg-[#0a0a0a] border border-black/20 rounded-md p-3 text-[10.5px] font-mono leading-[1.6] text-gray-300">
                    <div>&#123;</div>
                    <div className="pl-3"><span className="text-cyan-300">"ok"</span>: <span className="text-emerald-400">true</span>,</div>
                    <div className="pl-3"><span className="text-cyan-300">"data"</span>: &#123; ... &#125;</div>
                    <div>&#125;</div>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-snug mt-3">
                    On failure: <code className="font-mono text-[10px] bg-gray-50 border border-gray-200 px-1.5 py-0.5">ok: false</code> with <code className="font-mono text-[10px] bg-gray-50 border border-gray-200 px-1.5 py-0.5">error</code> + <code className="font-mono text-[10px] bg-gray-50 border border-gray-200 px-1.5 py-0.5">hint</code>. Branch on <code className="font-mono text-[10px] bg-gray-50 border border-gray-200 px-1.5 py-0.5">ok</code>.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ── 3. Endpoint Coverage (asksurf Data Coverage style) ── */}
      <section id="coverage" className="bg-[#fafafa] border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-16 sm:py-24">
          <Reveal>
            <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-12">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-black tracking-tight mb-4 leading-tight">
                Endpoint Coverage
              </h2>
              <p className="text-gray-500 text-[15px] sm:text-base leading-relaxed">
                10 endpoints. 3 data domains. 50+ assets covered. Stateless and unauthenticated during internal testing.
              </p>
            </div>
          </Reveal>

          {/* Stats strip */}
          <Reveal delay={60}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-200 border border-gray-200 mb-5 sm:mb-6">
              {[
                { n: '9',    l: 'Endpoints',   sub: '3 domains' },
                { n: '50+',  l: 'Assets',      sub: 'stocks · crypto · HK · A-shares' },
                { n: '8s',   l: 'Fast path',   sub: '/research/deep median' },
                { n: '0',    l: 'Auth',        sub: 'during internal testing' },
              ].map(s => (
                <div key={s.l} className="bg-white p-5 sm:p-6">
                  <div className="text-[24px] sm:text-[28px] font-black text-black tracking-tight leading-none">{s.n}</div>
                  <div className="text-[11px] font-black uppercase tracking-widest text-gray-700 mt-2">{s.l}</div>
                  <div className="text-[10px] text-gray-400 mt-1 leading-snug">{s.sub}</div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Main grid — each card shows path + per-endpoint description */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            {(Object.keys(DOMAIN_META) as Exclude<DomainKey, 'all'>[]).map((d, i) => {
              const meta = DOMAIN_META[d];
              const eps = ENDPOINTS.filter(e => e.domain === d);
              return (
                <Reveal key={d} delay={80 * (i + 1)}>
                  <button onClick={() => { setActiveDomain(d); scrollToSection('#endpoints'); }}
                    className="w-full text-left bg-white border border-gray-200 hover:border-black transition-all p-6 sm:p-7 h-full flex flex-col group">
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">/{d}/*</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-sm">
                        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" /> Live
                      </span>
                    </div>
                    <h3 className="text-xl font-black mb-2 text-black">{meta.label}</h3>
                    <p className="text-[12px] text-gray-500 leading-relaxed mb-5">{meta.tagline}</p>

                    <div className="space-y-3 mb-6 flex-1">
                      {eps.map(e => (
                        <div key={e.path} className="border-l-2 border-gray-100 group-hover:border-black pl-3 transition-colors">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="px-1.5 py-0.5 text-[9px] font-black"
                              style={{ backgroundColor: METHOD_COLORS[e.method].bg, color: METHOD_COLORS[e.method].text }}>
                              {e.method}
                            </span>
                            <code className="text-[11px] font-mono font-bold text-black truncate">{e.path.replace(`/${d}`, '')}</code>
                            {e.latency && (
                              <span className="text-[9px] font-bold text-gray-400 ml-auto shrink-0">{e.latency}</span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 leading-snug">{e.desc}</p>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-gray-100 flex items-end justify-between">
                      <div>
                        <div className="text-[22px] sm:text-[26px] font-black text-black tracking-tight leading-none">{eps.length}</div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1">
                          {eps.length === 1 ? 'Endpoint' : 'Endpoints'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-bold text-gray-400 group-hover:text-black transition-colors">
                        Explore
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                      </div>
                    </div>
                  </button>
                </Reveal>
              );
            })}
          </div>

          {/* Supporting strip: what you can ask with this */}
          <Reveal delay={400}>
            <div className="mt-5 sm:mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
              <div className="bg-white border border-gray-200 p-5 sm:p-6">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Equities</div>
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  {['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', '700.HK', '9988.HK', '600519.SH'].map(t => (
                    <span key={t} className="px-2 py-0.5 text-[10px] font-mono font-bold text-gray-700 bg-gray-50 border border-gray-200">{t}</span>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 leading-snug">US · HK · A-shares — fundamentals, technicals, valuation</p>
              </div>
              <div className="bg-white border border-gray-200 p-5 sm:p-6">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Crypto tokens</div>
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  {['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'AVAX', '+ any CG listed'].map(t => (
                    <span key={t} className="px-2 py-0.5 text-[10px] font-mono font-bold text-gray-700 bg-gray-50 border border-gray-200">{t}</span>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 leading-snug">Spot + perpetual derivatives — CoinGecko · OKX · Reddit · X</p>
              </div>
              <div className="bg-white border border-gray-200 p-5 sm:p-6">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Upstream data</div>
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  {['CoinGecko', 'OKX', 'CoinMarketCal', 'Exa', 'Bird', 'Aegean'].map(t => (
                    <span key={t} className="px-2 py-0.5 text-[10px] font-mono font-bold text-gray-700 bg-gray-50 border border-gray-200">{t}</span>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 leading-snug">White-labeled responses — providers never surfaced to end user</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 4. Feature: Multi-Agent Consensus (text-left, mockup-right) ── */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-16 sm:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <Reveal>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.25em] mb-5">Consensus Engine</div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.05] mb-5">
                Four Analysts,<br />
                One Verdict.
              </h2>
              <p className="text-[15px] text-gray-600 leading-relaxed mb-7 max-w-lg">
                Specialized analysts (fundamental · macro · sentiment · quant) debate your question across 2-3 rounds and return a majority verdict with confidence score and full reasoning trace.
              </p>
              <div className="space-y-2.5 text-[13px] text-gray-700">
                <div className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span><span>Bullish / Bearish / Neutral verdict with 0-100 confidence</span></div>
                <div className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span><span>Per-agent reasoning — transparent, auditable debate</span></div>
                <div className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span><span>Works for any asset: stocks, crypto, macro scenarios</span></div>
                <div className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span><span>Two modes: <code className="text-xs bg-gray-100 px-1.5 py-0.5 font-mono border border-gray-200">roundtable</code> (thorough) · <code className="text-xs bg-gray-100 px-1.5 py-0.5 font-mono border border-gray-200">collaborate</code> (faster)</span></div>
              </div>
            </Reveal>

            <Reveal delay={200} key={`consensus-mock-${audience}`}>
              {audience === 'agent' ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-7 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-100">
                    <div>
                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">POST /research/consensus</div>
                      <div className="text-[13px] font-bold text-black mt-1">Should I buy TSLA?</div>
                    </div>
                    <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-md">
                      <div className="text-[9px] font-black uppercase tracking-widest text-red-600">Verdict</div>
                      <div className="text-[15px] font-black text-red-700 leading-tight">Bearish 68%</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { name: 'Fundamental Analyst', verdict: 'Bearish', conf: 72, color: 'red' },
                      { name: 'Macro Analyst', verdict: 'Neutral', conf: 55, color: 'yellow' },
                      { name: 'Sentiment Analyst', verdict: 'Bearish', conf: 70, color: 'red' },
                      { name: 'Quant Analyst', verdict: 'Bearish', conf: 74, color: 'red' },
                    ].map(a => (
                      <div key={a.name} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] font-black text-gray-500 shrink-0">{a.name[0]}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-bold text-gray-900 truncate">{a.name}</div>
                          <div className="h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${a.color === 'red' ? 'bg-red-500' : a.color === 'yellow' ? 'bg-yellow-500' : 'bg-emerald-500'}`} style={{ width: `${a.conf}%` }} />
                          </div>
                        </div>
                        <div className={`text-[11px] font-bold shrink-0 ${a.color === 'red' ? 'text-red-600' : a.color === 'yellow' ? 'text-yellow-700' : 'text-emerald-600'}`}>{a.verdict} {a.conf}%</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
                    <span>4 agents · 2 rounds · 78s elapsed</span>
                    <code className="font-mono">asOf 1745000000000</code>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0a0a0a] rounded-2xl overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-black/10">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                      <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono">200 OK · response.json</span>
                  </div>
                  <div className="p-5 sm:p-6 font-mono text-[11.5px] sm:text-[12.5px] leading-[1.65] overflow-x-auto">
                    <div className="text-gray-300">&#123;</div>
                    <div className="pl-3 text-gray-300"><span className="text-cyan-300">"ok"</span>: <span className="text-emerald-400">true</span>,</div>
                    <div className="pl-3 text-gray-300"><span className="text-cyan-300">"data"</span>: &#123;</div>
                    <div className="pl-6 text-gray-300"><span className="text-cyan-300">"question"</span>: <span className="text-orange-300">"Should I buy TSLA?"</span>,</div>
                    <div className="pl-6 text-gray-300"><span className="text-cyan-300">"finalVerdict"</span>: <span className="text-orange-300">"Bearish"</span>,</div>
                    <div className="pl-6 text-gray-300"><span className="text-cyan-300">"finalConfidence"</span>: <span className="text-amber-300">68</span>,</div>
                    <div className="pl-6 text-gray-300"><span className="text-cyan-300">"summary"</span>: <span className="text-orange-300">"...markdown..."</span>,</div>
                    <div className="pl-6 text-gray-300"><span className="text-cyan-300">"agents"</span>: [</div>
                    <div className="pl-9 text-gray-300">&#123;</div>
                    <div className="pl-12 text-gray-300"><span className="text-cyan-300">"name"</span>: <span className="text-orange-300">"Fundamental Analyst"</span>,</div>
                    <div className="pl-12 text-gray-300"><span className="text-cyan-300">"verdict"</span>: <span className="text-orange-300">"Bearish"</span>,</div>
                    <div className="pl-12 text-gray-300"><span className="text-cyan-300">"confidence"</span>: <span className="text-amber-300">72</span>,</div>
                    <div className="pl-12 text-gray-300"><span className="text-cyan-300">"reasoning"</span>: <span className="text-orange-300">"..."</span></div>
                    <div className="pl-9 text-gray-300">&#125;,</div>
                    <div className="pl-9 text-gray-500">// + 3 more agents</div>
                    <div className="pl-6 text-gray-300">],</div>
                    <div className="pl-6 text-gray-300"><span className="text-cyan-300">"roundsRun"</span>: <span className="text-amber-300">2</span>,</div>
                    <div className="pl-6 text-gray-300"><span className="text-cyan-300">"asOf"</span>: <span className="text-amber-300">1745000000000</span></div>
                    <div className="pl-3 text-gray-300">&#125;</div>
                    <div className="text-gray-300">&#125;</div>
                  </div>
                </div>
              )}
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── 5. Feature: Crypto Intelligence (mockup-left, text-right) ── */}
      <section className="bg-[#fafafa] border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-16 sm:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <Reveal delay={200} className="lg:order-2">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.25em] mb-5">Crypto Intelligence</div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.05] mb-5">
                Spot, Perps,<br />
                Sentiment, Events.
              </h2>
              <p className="text-[15px] text-gray-600 leading-relaxed mb-7 max-w-lg">
                Seven crypto-native endpoints cover everything your agent needs — real-time spot price, perpetual funding rates, open interest, 24h sentiment snapshot, catalyst calendar, trending discovery, and multi-analyst hedge-fund portfolio decisions.
              </p>
              <div className="space-y-2.5 text-[13px] text-gray-700">
                <div className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span><span>Spot price + 24h stats + 7-day history bars</span></div>
                <div className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span><span>Perpetual funding rate, APR, open interest, orderbook depth</span></div>
                <div className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span><span>Per-coin sentiment with mention counts + catalyst news</span></div>
                <div className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span><span>Upcoming events — listings, forks, governance votes</span></div>
                <div className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span><span>Trending discovery — what users are searching right now</span></div>
              </div>
            </Reveal>

            <Reveal className="lg:order-1">
              <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-7 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-black">₿</div>
                    <div>
                      <div className="text-[13px] font-black text-black">BTC</div>
                      <div className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Market + Derivatives</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[20px] font-black text-black leading-none">$75,561.20</div>
                    <div className="text-[11px] font-bold text-red-600 mt-1">-2.24% 24h</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {[
                    { l: 'Funding 8h', v: '0.010%' },
                    { l: 'Funding APR', v: '10.95%' },
                    { l: 'Open Interest', v: '$2.66B' },
                    { l: 'Orderbook ±10', v: '$228K' },
                  ].map(s => (
                    <div key={s.l} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">{s.l}</div>
                      <div className="text-[13px] font-black text-black font-mono">{s.v}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-end gap-1 h-14 mb-2">
                  {[0.6, 0.8, 0.7, 0.9, 0.85, 0.75, 0.65].map((v, i) => (
                    <div key={i} className="flex-1 bg-gray-900 rounded-t" style={{ height: `${v * 100}%`, opacity: 0.3 + v * 0.7 }} />
                  ))}
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                  <span>7D · 1D bars</span>
                  <span>Live · CoinGecko + OKX</span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── 6. Feature: Stock Deep Analysis (text-left, mockup-right) ── */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-16 sm:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <Reveal>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.25em] mb-5">Stock Analysis</div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.05] mb-5">
                One Endpoint,<br />
                Full Deep-Dive.
              </h2>
              <p className="text-[15px] text-gray-600 leading-relaxed mb-7 max-w-lg">
                A single call returns a complete equity analysis — fundamentals, technicals, valuation context — as a markdown report your agent can quote directly to the user.
              </p>
              <div className="space-y-2.5 text-[13px] text-gray-700">
                <div className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span><span>US tickers (AAPL, TSLA, NVDA)</span></div>
                <div className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span><span>HK tickers with .HK suffix (700.HK, 9988.HK)</span></div>
                <div className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span><span>A-shares with .SH / .SZ suffix (600519.SH)</span></div>
                <div className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span><span>Markdown report includes fundamentals, technicals, valuation</span></div>
                <div className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span><span>Typical latency 30-60s (runs full pipeline)</span></div>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-md bg-black flex items-center justify-center text-white text-[10px] font-black">A</div>
                    <div>
                      <div className="text-[13px] font-black text-black">AAPL</div>
                      <div className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Stock Analysis Report</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">~45s</span>
                </div>
                <div className="p-5 sm:p-6 space-y-4">
                  <div>
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Fundamentals</div>
                    <div className="grid grid-cols-3 gap-2">
                      {[['P/E', '28.4'], ['Rev YoY', '+6.1%'], ['FCF', '$98B']].map(([l, v]) => (
                        <div key={l} className="bg-gray-50 rounded p-2 border border-gray-100">
                          <div className="text-[9px] font-bold text-gray-400 uppercase">{l}</div>
                          <div className="text-[12px] font-black font-mono text-black">{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Technical</div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px]"><span className="text-gray-500">RSI (14d)</span><span className="font-mono text-black font-bold">58 — Neutral</span></div>
                      <div className="flex justify-between text-[11px]"><span className="text-gray-500">MACD</span><span className="font-mono text-emerald-600 font-bold">Bullish crossover</span></div>
                      <div className="flex justify-between text-[11px]"><span className="text-gray-500">MA Trend</span><span className="font-mono text-black font-bold">50D &gt; 200D (Golden)</span></div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-gray-100">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Summary</div>
                    <p className="text-[11px] text-gray-600 leading-relaxed">Trading at 28.4x P/E (slight premium). FCF generation strong at $98B LTM. Technicals show bullish momentum — recent golden cross + MACD crossover. Key risk: iPhone cycle deceleration.</p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── 4. Commands Catalog (asksurf-style) ── */}
      <section id="endpoints" className="bg-[#fafafa] border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-12 sm:py-20">
          <Reveal>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 border border-gray-300 mb-6">
                  Endpoint Catalog
                </div>
                <h2 className="text-2xl sm:text-3xl md:text-5xl font-black text-black tracking-tight leading-tight">
                  Click to expand<br className="sm:hidden" /> — see the full request.
                </h2>
              </div>
              <p className="text-[13px] text-gray-500 max-w-md sm:text-right">
                All responses use a consistent <code className="text-black font-mono text-xs bg-white px-1.5 py-0.5 border border-gray-200">{'{ ok, data, error? }'}</code> envelope with an <code className="text-black font-mono text-xs bg-white px-1.5 py-0.5 border border-gray-200">asOf</code> timestamp.
              </p>
            </div>
          </Reveal>

          {/* Filter + search bar */}
          <Reveal delay={100}>
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center mb-6">
              <div className="flex items-center gap-2 flex-wrap">
                {filterChips.map(c => (
                  <button key={c.key}
                    onClick={() => { setActiveDomain(c.key); setExpandedPath(null); }}
                    className={`px-3.5 py-2 text-[12px] font-bold tracking-wide border transition-all inline-flex items-center gap-2 ${
                      activeDomain === c.key
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-black hover:text-black'
                    }`}>
                    {c.label}
                    <span className={`text-[10px] font-black ${activeDomain === c.key ? 'text-white/60' : 'text-gray-400'}`}>
                      {c.count}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter by path, keyword, tag…"
                  className="pl-9 pr-3 py-2 text-[12px] font-medium bg-white border border-gray-200 focus:border-black focus:outline-none w-full lg:w-80 transition-colors"
                />
              </div>
            </div>
          </Reveal>

          {/* Endpoint cards */}
          <div className="space-y-3">
            {filteredEndpoints.length === 0 ? (
              <div className="bg-white border border-gray-200 p-8 text-center text-[13px] text-gray-500">
                No endpoints match "{search}". Try a different keyword.
              </div>
            ) : (
              filteredEndpoints.map((ep, i) => (
                <Reveal key={ep.path} delay={i * 40}>
                  <EndpointCard
                    ep={ep}
                    expanded={expandedPath === ep.path}
                    onToggle={() => setExpandedPath(expandedPath === ep.path ? null : ep.path)}
                  />
                </Reveal>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ── 5. Use cases ── */}
      <section id="usecases" className="bg-white border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-12 sm:py-20">
          <Reveal key={`uc-header-${audience}`}>
            <div className="max-w-3xl mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 border border-gray-300 mb-6">
                {audience === 'agent' ? 'Agent Recipes' : 'Integration Patterns'}
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-black text-black tracking-tight leading-tight">
                {audience === 'agent' ? (
                  <>What an agent<br className="sm:hidden" /> actually does with this.</>
                ) : (
                  <>How developers<br className="sm:hidden" /> ship with this.</>
                )}
              </h2>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-gray-200 border border-gray-200">
            {(audience === 'agent' ? USE_CASES : DEV_USE_CASES).map((u, i) => (
              <Reveal key={`${audience}-${u.t}`} delay={i * 80}>
                <div className="bg-white p-6 sm:p-7 h-full flex flex-col hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 bg-black text-white text-[10px] font-black flex items-center justify-center">{String(i + 1).padStart(2, '0')}</div>
                    <code className="text-[10px] font-mono text-gray-500 truncate">{u.endpoint}</code>
                  </div>
                  <h3 className="text-[15px] font-black text-black mb-2 leading-tight">{u.t}</h3>
                  <p className="text-[12px] text-gray-500 leading-relaxed flex-1">{u.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. Error format + scope ── */}
      <section id="errors" className="bg-[#fafafa] border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-12 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">
            <Reveal>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 border border-gray-300 mb-6">
                Error Format
              </div>
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight mb-4">Consistent failure shape.</h3>
              <p className="text-gray-500 text-[14px] leading-relaxed mb-6">
                Every endpoint returns the same error envelope. Agents can branch on <code className="font-mono text-xs bg-white text-black px-1.5 py-0.5 border border-gray-200">ok === false</code> and surface the hint directly to the user.
              </p>
              <div className="bg-[#0a0a0a] border border-white/10 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Example</span>
                  <CopyBtn code={`{\n  "ok": false,\n  "error": "missing_topic",\n  "hint": "POST body requires \`topic\` (string)."\n}`} />
                </div>
                <div className="p-3 sm:p-4">
                  <CodeBlock code={`{\n  "ok": false,\n  "error": "missing_topic",\n  "hint": "POST body requires \`topic\` (string)."\n}`} />
                </div>
              </div>
              <div className="mt-6 space-y-2">
                {[
                  ['missing_question / missing_topic', 'required body field absent'],
                  ['invalid_symbol / invalid_ticker', 'path param malformed'],
                  ['not_found', 'valid symbol/ticker but no data available'],
                  ['upstream_failed / upstream_empty', 'upstream source returned nothing'],
                  ['consensus_failed / research_failed', 'internal pipeline failure'],
                ].map(([code, desc]) => (
                  <div key={code} className="flex items-start gap-3 text-[12px]">
                    <code className="font-mono font-bold text-black shrink-0">{code}</code>
                    <span className="text-gray-500">— {desc}</span>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 border border-gray-300 mb-6">
                Scope
              </div>
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight mb-4">When NOT to use this skill.</h3>
              <p className="text-gray-500 text-[14px] leading-relaxed mb-8">
                Lokacash is read-only research. For transactions, trade execution, or general-purpose chat, route to a different tool.
              </p>

              <div className="space-y-4">
                {[
                  { t: 'Order placement or wallet signing', d: 'Read-only research — no custody, no transaction signing, no brokerage.' },
                  { t: 'Real-time trade execution', d: 'Not a trading terminal. Latency is measured in seconds, not milliseconds.' },
                  { t: 'Non-financial topics', d: 'General search, coding help, or casual chat should route through a different skill.' },
                ].map(item => (
                  <div key={item.t} className="border-l-2 border-black pl-4">
                    <div className="text-sm font-black text-black mb-1">{item.t}</div>
                    <div className="text-[12px] text-gray-500 leading-relaxed">{item.d}</div>
                  </div>
                ))}
              </div>

              <div className="mt-10 p-5 bg-white border border-gray-200">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Rate Limits</div>
                <div className="text-[13px] text-gray-700 leading-relaxed">
                  None during internal testing. All endpoints are publicly reachable without authentication. This will change before public release — watch this page for auth instructions.
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-black text-base tracking-tight text-black">Loka</span>
            <span className="text-gray-300 text-sm">/</span>
            <span className="text-sm font-semibold text-gray-500">Skill API v1.1.0</span>
          </div>
          <div className="flex items-center gap-6 text-[11px] font-bold text-gray-500">
            <a href="/skill.md" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">skill.md</a>
            <a href="https://github.com/hetu-project/lokacash-skills" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">GitHub</a>
            <button onClick={() => scrollToSection('#overview')} className="hover:text-black transition-colors">Back to top</button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ApiLanding;