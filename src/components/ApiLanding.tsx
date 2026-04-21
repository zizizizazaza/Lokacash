import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';

/* ═══════════════════════════════════════════════
   Loka Developer Platform — API Page
   Flat UI / Full-Width Grid / Minimalist Typographic
   Enhanced with Risk Assessment, Download, etc.
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

// ─── Particle Canvas (Flat neutral) ─────────────
const ParticleCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
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
    const pts: P[] = Array.from({ length: 80 }, () => ({
      x: Math.random() * 2000, y: Math.random() * 1000,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5, a: Math.random() * 0.15 + 0.05,
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
          if (d < 120) {
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(0,0,0,${(1 - d / 120) * 0.1})`; ctx.lineWidth = 0.5; ctx.stroke();
          }
        }
      }
      const { x: mx, y: my } = mouseRef.current;
      for (const p of pts) {
        const d = Math.sqrt((p.x - mx) ** 2 + (p.y - my) ** 2);
        if (d < 160) {
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mx, my);
          ctx.strokeStyle = `rgba(0,0,0,${(1 - d / 160) * 0.15})`; ctx.lineWidth = 0.8; ctx.stroke();
        }
      }
      for (const p of pts) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${p.a})`; ctx.fill();
      }
      animRef.current = requestAnimationFrame(frame);
    };
    frame();
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(animRef.current); };
  }, []);

  useEffect(() => { const c = boot(); return c; }, [boot]);

  return (
    <canvas ref={canvasRef}
      onMouseMove={e => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }}
      onMouseLeave={() => { mouseRef.current = { x: -9999, y: -9999 }; }}
      className="absolute inset-0 w-full h-full z-0 pointer-events-auto" />
  );
};

// ─── Data ───────────────────────────────────────
const CODE: Record<string, string> = {
  'React': `import { LokaCashPrivyRoot, useLokaCashDeposit, useLokaCashWithdraw } from '@lokacash/fiat/react';

// 1. Wrap your entire application in 1 line
export default function App() {
  return (
    <LokaCashPrivyRoot apiKey="lk_live_xxxxxxxxxxxx">
      <Dashboard />
    </LokaCashPrivyRoot>
  );
}

// 2. Deposit: add funds to account
function Dashboard() {
  const deposit = useLokaCashDeposit();
  const withdraw = useLokaCashWithdraw();
  
  return (
    <div>
      <button 
        onClick={() => deposit.open({ amount: '1000', asset: 'USD' })}
        disabled={deposit.isOpening}
      >
        Add Funds
      </button>

      {/* 3. Withdraw: send funds to bank via MoonPay */}
      <button
        onClick={() => withdraw.open({ currency: 'usd', method: 'bank' })}
        disabled={withdraw.isOpening}
      >
        Withdraw to Bank
      </button>
    </div>
  );
}`,
  'Risk Assessment': `// Evaluate transaction risk via Loka's consensus engine
const response = await fetch('https://api.loka.cash/api/v1/risk/evaluate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer lk_live_xxxxxxxxxxxx',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    subject_id: 'user_12345',
    subject_type: 'user',
    trust_score: 0.75,
    action_type: 'payment',
    amount: 3000.00,
    currency: 'USD',
    geo_location: 'NY,US',
    channel: 'web',
  }),
});

const result = await response.json();
// => { decision: "approve", risk_level: "low", confidence: 0.91 }

if (result.decision === 'challenge') {
  // Submit evidence to appeal
  await fetch(\`/api/v1/risk/challenge/\${result.challenge_id}/respond\`, {
    method: 'POST',
    body: JSON.stringify({
      evidence: [{ type: 'purpose_proof', content: 'invoice_url' }]
    }),
  });
}`,
};

const USE_CASES = [
  { id: 'superagent', label: 'SuperAgent', desc: 'Ask anything about investments in natural language. Our multi-agent AI council — Risk Assessor, Market Analyst, Web Search, and Trading Strategist — collaborates in real-time to deliver institutional-grade analysis with full transparency via D3 knowledge graphs.', metric: '4 AI Agents' },
  { id: 'chats', label: 'Social Investing', desc: 'Join project-specific group chats where AI agents, project issuers, and fellow investors collaborate. Get real-time milestone updates, risk alerts, and community-driven due diligence — all in one conversation.', metric: 'Real-Time Collaboration' },
  { id: 'invest', label: 'Smart Invest', desc: 'From AI analysis to one-click execution. Browse curated real-world asset opportunities with AI risk scores, invest with compliant deposit rails, and track returns — the full investment lifecycle in one platform.', metric: 'End-to-End' },
  { id: 'agent', label: 'AI Agent API', desc: 'Connect our API to your AI models. Let them screen real-world asset yields, run multi-agent risk analysis, and allocate capital automatically based on predefined strategies.', metric: 'Fully Automated' },
  { id: 'fintech', label: 'FinTechs', desc: 'Add new financial capabilities as your roadmap evolves. Embed deposit, withdrawal, and yield products with infrastructure designed for speed, compliance, and scale.', metric: '+40% Conversion' },
  { id: 'fund', label: 'Fund Managers', desc: 'Real-time portfolio feeds, automated rebalancing triggers, and instant settlement notifications. Build algorithmic strategies on top of structured product data.', metric: '<50ms Latency' },
];

const ENDPOINTS = [
  { method: 'POST', path: '/v1/payments/deposit', desc: 'Initiate deposit via card, bank, or Apple Pay' },
  { method: 'POST', path: '/v1/payments/withdraw', desc: 'Withdraw to bank account globally' },
  { method: 'GET', path: '/v1/projects', desc: 'Browse available investment opportunities' },
  { method: 'POST', path: '/v1/projects/:id/invest', desc: 'Allocate capital to a project' },
  { method: 'DELETE', path: '/v1/projects/:id/revoke', desc: 'Withdraw investment before lock-in' },
  { method: 'GET', path: '/v1/portfolio/holdings', desc: 'View full portfolio & performance' },
  { method: 'GET', path: '/v1/credit/score', desc: 'AI risk score for any asset' },
  { method: 'POST', path: '/v1/chat/send', desc: 'Ask the AI investment advisor' },
];

const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
  GET: { bg: '#f5f5f5', text: '#555' },
  POST: { bg: '#000', text: '#fff' },
  PUT: { bg: '#e5e5e5', text: '#333' },
  DELETE: { bg: '#fafafa', text: '#b91c1c' },
};

const PARTNERS = ['Coinbase', 'Base', 'Privy', 'DeepSeek', 'Onramper'];

// ─── Nav Links ─────────────────────────────────
const NAV_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'SDK', href: '#sdk' },
  { label: 'API', href: '#api' },
  { label: 'Risk', href: '#risk' },
  { label: 'Use Cases', href: '#usecases' },
  { label: 'Endpoints', href: '#endpoints' },
];

// ─── Copy Button ────────────────────────────────
const CopyBtn: React.FC<{ code: string }> = ({ code }) => {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={async () => {
        try { await navigator.clipboard.writeText(code); setOk(true); setTimeout(() => setOk(false), 2000); } catch { /**/ }
      }}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all border ${
        ok ? 'bg-white/10 text-white border-white/20' : 'bg-transparent text-gray-500 border-white/10 hover:text-white hover:bg-white/5'
      }`}>
      {ok ? 'Copied' : 'Copy Code'}
    </button>
  );
};

// ─── Code Block ─────────────────────────────────
const highlightLine = (raw: string): string => {
  // Escape HTML first
  let line = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const trimmed = line.trimStart();
  // Full comment lines
  if (trimmed.startsWith('//') || (trimmed.startsWith('#') && !trimmed.startsWith('#!'))) {
    return `<span class="cc">${line}</span>`;
  }

  // Extract strings and comments into placeholders to prevent regex cascading
  const slots: string[] = [];
  const ph = (html: string) => { slots.push(html); return `\u2997PH${slots.length - 1}HP\u2998`; };

  // Inline comments — extract first
  line = line.replace(/(\/\/.*)$/, (_, c) => ph(`<span class="cc">${c}</span>`));

  // Double-quoted strings
  line = line.replace(/"([^"]*)"/g, (_, inner) => {
    if (inner.startsWith('lk_live_')) return ph(`"<span class="cv">${inner}</span>"`);
    return ph(`<span class="cs">"${inner}"</span>`);
  });

  // Single-quoted strings
  line = line.replace(/'([^']*)'/g, (_, inner) => ph(`<span class="cs">'${inner}'</span>`));

  // Template literal backtick strings
  line = line.replace(/`([^`]*)`/g, (_, inner) => ph(`<span class="cs">\`${inner}\`</span>`));

  // Keywords
  line = line.replace(/\b(import|from|export default|return|const|let|function|async|await|def|for|if|class|require|print)\b/g,
    '<span class="ck">$1</span>');

  // Numbers (only in remaining text, not inside placeholders)
  line = line.replace(/\b(\d[\d_]*\.?\d*)\b/g, '<span class="cn">$1</span>');

  // Restore placeholders
  line = line.replace(/\u2997PH(\d+)HP\u2998/g, (_, idx) => slots[parseInt(idx)]);

  return line;
};

const codeStyles = `
.cc { color: #6b7280 }
.ck { color: #a8a29e }
.cs { color: #e5e5e5 }
.cv { color: #fff }
.cn { color: #d4d4d8 }
`;

const CodeBlock: React.FC<{ code: string }> = ({ code }) => {
  const lines = code.split('\n');
  return (
    <>
      <style>{codeStyles}</style>
      <div className="font-mono text-[10px] sm:text-xs leading-[1.8] tracking-tight">
        {lines.map((line, i) => (
          <div key={i} className="flex hover:bg-white/[0.04] transition-colors rounded items-start px-2">
            <span className="w-8 flex-shrink-0 text-right pr-4 text-gray-600 select-none border-r border-[#333] mr-4 pt-px shrink-0">{i + 1}</span>
            <span className="text-gray-300 whitespace-pre-wrap break-words flex-1" dangerouslySetInnerHTML={{ __html: highlightLine(line) || ' ' }} />
          </div>
        ))}
      </div>
    </>
  );
};

// ─── Risk Decision Card (Flat variant) ──────────
const RiskDecisionCard: React.FC<{ title: string; desc: string; borderHover: string }> = ({ title, desc, borderHover }) => (
  <div className={`p-6 bg-white border border-gray-200 hover:${borderHover} transition-all group`}>
    <h4 className="text-sm font-black text-black mb-1.5">{title}</h4>
    <p className="text-[11px] text-gray-500 leading-relaxed">{desc}</p>
  </div>
);

// ─── Main ───────────────────────────────────────
const ApiLanding: React.FC = () => {
  const [activeCase, setActiveCase] = useState('superagent');
  const [scrolled, setScrolled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled((containerRef.current?.scrollTop || 0) > 50);
    };
    const container = containerRef.current;
    container?.addEventListener('scroll', handleScroll);
    return () => container?.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (href: string) => {
    const id = href.replace('#', '');
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={containerRef} className="h-full overflow-y-auto bg-white text-black selection:bg-black selection:text-white font-sans">
      
      {/* ── Sticky Nav (Flat) ── */}
      <div className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/90 backdrop-blur-md shadow-sm border-b border-gray-200' : 'bg-transparent'}`}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 flex items-center justify-between h-14">
          <span className={`font-black text-lg tracking-tight transition-opacity duration-300 ${scrolled ? 'opacity-100' : 'opacity-0'}`}>Loka</span>
          <nav className={`hidden md:flex items-center gap-8 transition-opacity duration-300 ${scrolled ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {NAV_LINKS.map(link => (
              <button key={link.href} onClick={() => scrollToSection(link.href)}
                className="text-sm font-bold text-gray-500 hover:text-black transition-colors">
                {link.label}
              </button>
            ))}
          </nav>
          <button className={`hidden sm:block px-5 py-2 text-sm font-bold bg-black text-white hover:bg-gray-900 transition-all ${scrolled ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            Get API Key
          </button>
        </div>
      </div>

      {/* ── 1. Hero (Full-width, flat, typography focus) ── */}
      <section className="relative w-full min-h-[60vh] sm:min-h-[85vh] flex flex-col justify-center border-b border-gray-200 bg-[#fafafa]">
        {/* Flat Grid Pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
        
        {/* Interactive Particles limited to hero */}
        <div className="absolute inset-0 overflow-hidden mix-blend-multiply opacity-60">
          <ParticleCanvas />
        </div>

        <div className="relative z-10 w-full max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 text-center sm:text-left">
          <Reveal delay={100}>
            <h1 className="text-4xl sm:text-6xl md:text-8xl lg:text-[6.5rem] font-black tracking-[-0.04em] leading-[0.9] text-black max-w-5xl mx-auto sm:mx-0">
               From AI Insight<br />
               to Investment Action.
             </h1>
          </Reveal>
          
          <Reveal delay={200}>
            <p className="text-base sm:text-lg md:text-xl text-gray-500 font-medium leading-relaxed max-w-2xl mt-6 sm:mt-8 mx-auto sm:mx-0">
              Loka combines multi-agent AI analysis, social investing, and
              compliant payment rails into one platform — ask, discuss, invest.
            </p>
          </Reveal>
          
          <Reveal delay={300}>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mt-8 sm:mt-12">
              <button className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-black text-white text-sm font-bold hover:bg-gray-900 transition-colors flex items-center justify-center gap-2">
                Generate API Key
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
              </button>
              <a href="https://github.com/loka-network" target="_blank" rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-transparent border border-gray-300 text-black text-sm font-bold hover:border-black transition-colors flex items-center justify-center gap-2">
                View Documentation
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Partners strip (Flat) ── */}
      <section className="border-b border-gray-200 bg-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-6 opacity-60">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Trusted by Industry Leaders</span>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-8 md:gap-14">
            {PARTNERS.map(p => (
              <span key={p} className="text-sm sm:text-base font-black text-gray-400 hover:text-black transition-colors cursor-default">{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── 1.5 Product Platform — Three-Layer Funnel ── */}
      <section id="platform" className="bg-white border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-12 sm:py-20 lg:py-32">
          <Reveal>
            <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-20">
              <div className="inline-flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 border border-gray-300 mb-8">
                Product Platform
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-black text-black tracking-tight mb-6 leading-tight">
                Ask. Discuss. Invest.<br />
                <span className="text-gray-400">One Unified Experience.</span>
              </h2>
              <p className="text-gray-500 text-base sm:text-lg leading-relaxed">
                Loka transforms investing from isolated decisions into a collaborative, AI-augmented workflow — three layers working together seamlessly.
              </p>
            </div>
          </Reveal>

          {/* Funnel Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-200 border border-gray-200">
            <Reveal delay={100}>
              <div className="bg-white p-6 sm:p-10 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-black text-white text-[11px] font-black flex items-center justify-center">1</div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">SuperAgent</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black mb-3">AI-Powered Analysis</h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-6 flex-1">
                  Ask anything in natural language. Four specialized AI agents — Risk Assessor, Market Analyst, Web Search, and Trading Strategist — collaborate through a multi-round consensus protocol to deliver institutional-grade insights.
                </p>
                <div className="space-y-2">
                  {['Multi-agent council with D3 knowledge graph', 'Real-time streaming analysis', 'Transparent reasoning \u0026 confidence scoring'].map((t, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-1 h-1 bg-black rounded-full mt-2 shrink-0" />
                      <span className="text-[11px] text-gray-600">{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className="bg-white p-6 sm:p-10 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-black text-white text-[11px] font-black flex items-center justify-center">2</div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Chats</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black mb-3">Social Due Diligence</h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-6 flex-1">
                  Each investment opportunity has a dedicated group chat. AI agents share milestone updates, issuers answer questions, and investors discuss risks together — crowdsourced intelligence meets AI precision.
                </p>
                <div className="space-y-2">
                  {['Project groups with AI agent members', 'Real-time milestone \u0026 risk alerts', 'Community-driven investment signals'].map((t, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-1 h-1 bg-black rounded-full mt-2 shrink-0" />
                      <span className="text-[11px] text-gray-600">{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal delay={300}>
              <div className="bg-white p-6 sm:p-10 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-black text-white text-[11px] font-black flex items-center justify-center">3</div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Invest</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black mb-3">One-Click Execution</h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-6 flex-1">
                  From analysis to action in seconds. Deposit via Coinbase, Onramper, or Apple Pay, invest in curated real-world assets with AI risk scores, and withdraw returns directly to your bank via MoonPay.
                </p>
                <div className="space-y-2">
                  {['50+ deposit methods across 190+ countries', 'AI risk scoring on every opportunity', 'Direct bank withdrawal via MoonPay'].map((t, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-1 h-1 bg-black rounded-full mt-2 shrink-0" />
                      <span className="text-[11px] text-gray-600">{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>

          {/* Funnel Flow Arrow */}
          <Reveal delay={400}>
            <div className="flex items-center justify-center gap-4 mt-8 sm:mt-12">
              <div className="flex items-center gap-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <span className="px-3 py-1.5 bg-black text-white">Ask</span>
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
                <span className="px-3 py-1.5 border border-gray-300">Discuss</span>
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
                <span className="px-3 py-1.5 border border-gray-300">Invest</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 2. SDK Showcase (50/50 Split) — Enhanced with On-Ramp & Off-Ramp ── */}
      <section id="sdk" className="border-b border-gray-200 flex flex-col lg:flex-row">
        {/* Left: Copy */}
        <div className="lg:w-1/2 p-5 sm:p-12 lg:p-16 xl:p-24 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white flex flex-col justify-center text-center sm:text-left">
          <Reveal>
            <div className="flex gap-2 mb-8 justify-center sm:justify-start">
              <span className="text-[10px] font-bold px-3 py-1.5 bg-gray-100 text-gray-600 border border-gray-200">Deposit</span>
              <span className="text-[10px] font-bold px-3 py-1.5 bg-gray-100 text-gray-600 border border-gray-200">Withdraw</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">Instant Money Movement.</h2>
            <p className="text-base text-gray-600 leading-relaxed mb-10 max-w-md mx-auto sm:mx-0">
              Deposit and withdraw funds seamlessly. <strong>Coinbase</strong> + <strong>Onramper</strong> for deposits, <strong>MoonPay</strong> for withdrawals — support credit cards, bank transfers, Apple Pay across 190+ countries.
            </p>

            {/* Quick Start Steps */}
            <div className="border border-gray-200 p-5 mb-10">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Quick Start</div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-black text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
                  <div>
                    <code className="text-[11px] font-mono bg-gray-100 text-black px-2 py-1 border border-gray-200 block w-fit select-all">npm install @lokacash/fiat</code>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-black text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
                  <div>
                    <code className="text-[11px] font-mono bg-gray-100 text-black px-2 py-1 border border-gray-200 block w-fit select-all">{`<LokaCashPrivyRoot apiKey="lk_live_...">`}</code>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-black text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
                  <div>
                    <code className="text-[11px] font-mono bg-gray-100 text-black px-2 py-1 border border-gray-200 block w-fit select-all">useLokaCashDeposit() / useWithdraw()</code>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="border-l-2 border-black pl-5">
                <h4 className="text-sm font-bold text-black mb-1">Deposit: 50+ Payment Methods</h4>
                <p className="text-sm text-gray-500">Instant account funding via credit card, bank transfer, Apple Pay, Google Pay, and local payment methods worldwide.</p>
              </div>
              <div className="border-l-2 border-gray-200 pl-5 hover:border-gray-400 transition-colors">
                <h4 className="text-sm font-bold text-black mb-1">Withdraw: Direct to Bank</h4>
                <p className="text-sm text-gray-500">Cash out your returns directly to your bank account. Fast settlement, transparent fees, no hidden charges.</p>
              </div>
              <div className="border-l-2 border-gray-200 pl-5 hover:border-gray-400 transition-colors">
                <h4 className="text-sm font-bold text-black mb-1">Global: 190+ Countries</h4>
                <p className="text-sm text-gray-500">Multi-currency support with automatic conversion. Invest from anywhere, withdraw to any local bank.</p>
              </div>
            </div>
          </Reveal>
        </div>
        
        {/* Right: Code Block */}
        <div className="lg:w-1/2 bg-[#0a0a0b] flex flex-col text-white">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded text-[11px] font-bold bg-white text-black">React SDK</span>
              <span className="text-[10px] font-bold text-gray-500">@lokacash/fiat</span>
            </div>
            <CopyBtn code={CODE['React']} />
          </div>
          <div className="p-6 overflow-x-auto flex-1 overflow-y-auto">
            <CodeBlock code={CODE['React']} />
          </div>
        </div>
      </section>

      {/* ── 3. API Grid (Flat Borders) ── */}
      <section id="api" className="bg-white border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-12 sm:py-20 lg:py-32">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight mb-4 max-w-2xl text-center sm:text-left mx-auto sm:mx-0">Everything You Need to Build Smart Finance.</h2>
            <p className="text-base sm:text-lg text-gray-500 mb-10 sm:mb-16 max-w-2xl text-center sm:text-left mx-auto sm:mx-0">Multi-agent AI analysis, social investing tools, compliant payment rails, and real-time notifications — all accessible through simple API calls.</p>
          </Reveal>

          {/* Minimal Grid instead of Cards */}
          <div className="border-t border-gray-200">
            <Reveal delay={100}>
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200 border-b border-gray-200">
                <div className="p-8 sm:p-12 hover:bg-gray-50 transition-colors group">
                  <div className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-widest group-hover:text-black transition-colors">01 / Analysis</div>
                  <h3 className="text-2xl font-black mb-3">Multi-Agent AI Council</h3>
                  <p className="text-gray-500 leading-relaxed text-sm">Four AI agents collaborate in real-time: Risk Assessor, Market Analyst, Web Search, and Trading Strategist. Get consensus-backed insights with transparent reasoning and confidence scores.</p>
                </div>
                <div className="p-8 sm:p-12 hover:bg-gray-50 transition-colors group">
                  <div className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-widest group-hover:text-black transition-colors">02 / Payments</div>
                  <h3 className="text-2xl font-black mb-3">Instant Payments</h3>
                  <p className="text-gray-500 leading-relaxed text-sm">Enable users to deposit and withdraw funds globally — credit card, bank transfer, Apple Pay across 190+ countries, with transparent fees and instant settlement.</p>
                </div>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200 border-b border-gray-200">
                <div className="p-8 sm:p-12 hover:bg-gray-50 transition-colors group">
                  <div className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-widest group-hover:text-black transition-colors">03 / Alerts</div>
                  <h3 className="text-2xl font-black mb-3">Social Investment Channels</h3>
                  <p className="text-gray-500 leading-relaxed text-sm">Dedicated project group chats with AI agents, issuers, and fellow investors. Milestone tracking, risk alerts, and community-driven due diligence in one conversation.</p>
                </div>
                <div className="p-8 sm:p-12 hover:bg-gray-50 transition-colors group">
                  <div className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-widest group-hover:text-black transition-colors">04 / Execution</div>
                  <h3 className="text-2xl font-black mb-3">Automated Investing</h3>
                  <p className="text-gray-500 leading-relaxed text-sm">Browse, filter, and invest in curated real-world assets programmatically. Set your strategy once and let the system execute automatically.</p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── 3.5 Risk Assessment Engine (NEW — Flat Style) ── */}
      <section id="risk" className="bg-[#fafafa] border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-12 sm:py-20 lg:py-32">
          <Reveal>
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 border border-gray-300 mb-8">
                Risk Assessment Engine
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-black text-black tracking-tight mb-6 leading-tight">
                Institutional-Grade<br />
                <span className="text-gray-400">Risk Management.</span>
              </h2>
              <p className="text-gray-500 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
                Every transaction is automatically screened by our <strong className="text-black">multi-factor risk engine</strong>. It checks transaction amount, user identity, geography, and transaction velocity <strong className="text-black">in parallel</strong>, then produces a unified risk score in under 340ms — fully automated compliance at scale.
              </p>
            </div>
          </Reveal>

          {/* Quick Start row */}
          <Reveal delay={100}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-16">
              {[
                { step: '1', label: 'Get Key', code: 'curl -X POST /api/v1/auth/keys', desc: 'Generate your API key from the dashboard' },
                { step: '2', label: 'Evaluate', code: 'POST /api/v1/risk/evaluate', desc: 'Send a transaction payload for scoring' },
                { step: '3', label: 'Handle', code: "if (res.decision === 'challenge')", desc: 'Route by decision: approve, challenge, or reject' },
              ].map(item => (
                <div key={item.step} className="bg-white border border-gray-200 p-5 hover:border-gray-400 transition-colors">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 bg-black text-white text-[10px] font-black flex items-center justify-center">{item.step}</div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{item.label}</span>
                  </div>
                  <code className="text-[10px] font-mono bg-gray-100 text-black px-2 py-1 border border-gray-200 block w-fit select-all">{item.code}</code>
                  <p className="text-[10px] text-gray-400 mt-2">{item.desc}</p>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Risk bento: 3-column layout */}
          <Reveal delay={200}>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-px bg-gray-200 border border-gray-200">
              
              {/* Left: Decision Cards */}
              <div className="md:col-span-3 flex flex-col divide-y divide-gray-200 bg-white">
                <div className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 bg-black text-white flex items-center justify-center">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    </div>
                  </div>
                  <h4 className="text-sm font-black text-black mb-1">Approve</h4>
                  <p className="text-[11px] text-gray-500 leading-relaxed">Low-risk transactions pass through instantly with confidence &gt; 0.85. Zero human intervention.</p>
                </div>
                <div className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 bg-gray-200 text-gray-600 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01" /></svg>
                    </div>
                  </div>
                  <h4 className="text-sm font-black text-black mb-1">Challenge</h4>
                  <p className="text-[11px] text-gray-500 leading-relaxed">Elevated risk triggers a secure evidence request. Users submit proof to continue.</p>
                </div>
                <div className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 bg-gray-100 text-gray-400 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </div>
                  </div>
                  <h4 className="text-sm font-black text-black mb-1">Reject</h4>
                  <p className="text-[11px] text-gray-500 leading-relaxed">Critical threats blocked instantly — sanctions, fraud patterns, structuring attempts.</p>
                </div>
              </div>

              {/* Center: Code Terminal */}
              <div className="md:col-span-6 bg-[#0a0a0b] flex flex-col text-white">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <span className="text-[11px] font-bold text-white tracking-widest uppercase">risk-engine.ts</span>
                  <CopyBtn code={CODE['Risk Assessment']} />
                </div>
                <div className="p-6 overflow-x-auto flex-1 flex flex-col justify-center">
                  <CodeBlock code={CODE['Risk Assessment']} />
                </div>
              </div>

              {/* Right: Pipeline + Features */}
              <div className="md:col-span-3 flex flex-col bg-white">
                {/* Pipeline */}
                <div className="p-6 border-b border-gray-200 flex-1">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Consensus Pipeline</div>
                  <div className="flex flex-col items-center gap-0 mt-2">
                    <div className="w-full py-2.5 bg-black text-white text-[10px] font-bold text-center">
                      Sequencer
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    <div className="grid grid-cols-2 gap-1 w-full">
                      {['Amount', 'Identity', 'Geo', 'Velocity'].map(v => (
                        <div key={v} className="py-2 bg-gray-100 text-gray-600 text-[9px] font-black text-center border border-gray-200 hover:bg-gray-200 transition-colors">
                          {v}
                        </div>
                      ))}
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    <div className="w-full py-2.5 bg-black text-white text-[10px] font-bold text-center">
                      Consensus
                    </div>
                  </div>
                </div>
                {/* Why Loka Risk */}
                <div className="p-6 bg-[#0a0a0b] text-white flex-1">
                  <div className="text-sm font-black mb-4">Why Loka Risk?</div>
                  <div className="space-y-3">
                    {[
                      'Sub-second parallel evaluation',
                      'Built-in challenge & appeal flow',
                      'Full audit trail per session',
                      'Configurable validator weights',
                      'Zero false-positive guarantee SLA',
                    ].map((text, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className="w-1 h-1 bg-gray-500 rounded-full mt-1.5 flex-shrink-0" />
                        <span className="text-[11px] text-gray-400 leading-snug">{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 4. Use Cases (Sticky scroll layout — Enhanced with metrics) ── */}
      <section id="usecases" className="bg-white border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-12 sm:py-20 lg:py-32">
          
          {/* Top: Title & Horizontal Tabs */}
          <Reveal>
            <div className="mb-12 text-center">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">Built for the Institutions Shaping What's Next</h2>
               <p className="text-gray-500 text-sm mb-8">See how financial teams across industries are building with our platform.</p>
              
              <div className="flex flex-wrap gap-3 justify-center">
                {USE_CASES.map((uc) => (
                  <button key={uc.id} onClick={() => setActiveCase(uc.id)}
                    className={`px-3 sm:px-5 py-2 sm:py-3 border transition-all duration-300 ${activeCase === uc.id ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-400 hover:text-black'}`}>
                    <div className="flex items-center gap-3">
                      <h4 className="text-xs sm:text-sm font-bold">{uc.label}</h4>
                      {activeCase === uc.id && (
                        <span className="text-[10px] font-black bg-white/20 px-2 py-0.5">{uc.metric}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              
              {/* Active description */}
              {USE_CASES.filter(uc => uc.id === activeCase).map(uc => (
                <p key={uc.id} className="text-base text-gray-600 leading-relaxed mt-6 max-w-2xl mx-auto">{uc.desc}</p>
              ))}
            </div>
          </Reveal>

          {/* Bottom: Two Code Blocks Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Reveal delay={100}>
              <div className="bg-[#0a0a0b] border border-gray-800 flex flex-col text-white">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <span className="text-[11px] font-bold text-white tracking-widest uppercase">
                    {activeCase === 'superagent' || activeCase === 'chats' || activeCase === 'invest' ? 'deposit-sdk.tsx' : 'risk-engine.ts'}
                  </span>
                  <CopyBtn code={activeCase === 'superagent' || activeCase === 'chats' || activeCase === 'invest' ? CODE['React'] : CODE['Risk Assessment']} />
                </div>
                <div className="p-6 overflow-x-auto overflow-y-auto max-h-[500px]">
                  <CodeBlock code={activeCase === 'superagent' || activeCase === 'chats' || activeCase === 'invest' ? CODE['React'] : CODE['Risk Assessment']} />
                </div>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className="bg-[#0a0a0b] border border-gray-800 flex flex-col text-white">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <span className="text-[11px] font-bold text-white tracking-widest uppercase">
                    risk-engine.ts
                  </span>
                  <CopyBtn code={CODE['Risk Assessment']} />
                </div>
                <div className="p-6 overflow-x-auto overflow-y-auto max-h-[500px]">
                  <CodeBlock code={CODE['Risk Assessment']} />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── 5. Endpoints Table (Typography focused) ── */}
      <section id="endpoints" className="bg-white border-b border-gray-200">
        <div className="max-w-[1000px] mx-auto px-4 sm:px-12 py-12 sm:py-20 lg:py-32">
          <Reveal>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 sm:mb-12 border-b border-black pb-4">
              <div>
                <h2 className="text-3xl font-black tracking-tight text-black">Data Endpoints</h2>
                <p className="text-sm text-gray-500 mt-2">Standard JSON. OpenAPI 3.0 specs available.</p>
              </div>
              <a href="#" className="text-sm font-bold text-black border border-gray-300 px-4 py-2 hover:bg-gray-50 transition-colors">
                Read API Reference
              </a>
            </div>
          </Reveal>
          
          <Reveal delay={100}>
            <div className="flex flex-col">
              {ENDPOINTS.map((ep, i) => {
                const mc = METHOD_COLORS[ep.method] || METHOD_COLORS.GET;
                return (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center py-5 group hover:bg-gray-50 transition-colors px-4 border-b border-gray-100">
                    <div className="flex items-center gap-3 sm:gap-4 sm:w-[400px] shrink-0 mb-1 sm:mb-0">
                      <span className="text-[10px] font-black px-2 py-1 uppercase tracking-wider w-14 sm:w-16 text-center flex-shrink-0"
                        style={{ background: mc.bg, color: mc.text }}>
                        {ep.method}
                      </span>
                      <code className="text-xs sm:text-sm font-mono font-bold text-black break-all">{ep.path}</code>
                    </div>
                    <span className="text-xs sm:text-sm text-gray-500 sm:ml-4 group-hover:text-black transition-colors">{ep.desc}</span>
                    <button className="hidden sm:block ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-black">
                       <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 6. Download App (NEW — Flat Style) ── */}
      <section className="bg-[#fafafa] border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-12 sm:py-20 lg:py-32">
          <Reveal>
            <div className="border border-gray-200 bg-white flex flex-col md:flex-row items-center gap-12 md:gap-16 p-8 sm:p-12 md:p-16">
              {/* Left content */}
              <div className="flex-1 text-center md:text-left">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 text-[10px] font-black tracking-[0.2em] uppercase mb-6 bg-black text-white">
                  Android
                </span>
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-black tracking-tight mb-4 leading-tight">
                  Take Loka Cash<br />everywhere you go.
                </h3>
                <p className="text-gray-500 text-base leading-relaxed mb-8 max-w-md mx-auto md:mx-0">
                  Trade, chat with AI, manage your portfolio, and execute smart transactions — all from your pocket.
                </p>
                <a href="/downloads/lokacash.apk" download
                  className="inline-flex items-center gap-3 px-8 py-4 text-sm font-bold bg-black text-white hover:bg-gray-900 transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download APK
                </a>
              </div>
              {/* Right: QR Code */}
              <div className="flex flex-col items-center gap-4 flex-shrink-0">
                <div className="bg-white border border-gray-200 p-6">
                  <QRCodeSVG
                    value="https://www.loka.cash/downloads/lokacash.apk"
                    size={180}
                    level="H"
                    includeMargin={false}
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                    imageSettings={{
                      src: '/logo-removebg.png',
                      x: undefined,
                      y: undefined,
                      height: 36,
                      width: 36,
                      excavate: true,
                    }}
                  />
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Scan to download</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-12 xl:px-24 py-16 sm:py-32 text-center">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-black text-black tracking-tight mb-6">Start Building on Loka.</h2>
             <p className="text-base sm:text-xl text-gray-500 mb-8 sm:mb-12 max-w-xl mx-auto font-medium">Integrate multi-agent AI, social investing, and compliant payment infrastructure into your product. Get started in minutes.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button className="w-full sm:w-auto px-10 py-4 bg-black text-white text-sm font-bold hover:bg-gray-900 transition-colors">
                Start Building for Free
              </button>
              <a href="https://t.me/lance_xyz" target="_blank" rel="noopener noreferrer"
                className="w-full sm:w-auto px-10 py-4 border border-gray-300 bg-white text-black text-sm font-bold hover:border-black transition-colors">
                Contact Enterprise Sales
              </a>
            </div>
            <p className="text-xs pt-6 text-gray-400">
              Free to explore. No minimum investment. Enterprise inquiries answered within 2 hours.
            </p>
          </Reveal>
        </div>
      </section>

    </div>
  );
};

export default ApiLanding;
