import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icons } from '../constants';
import { QRCodeSVG } from 'qrcode.react';

// Intersection Observer hook for scroll animations
const useInView = (options?: IntersectionObserverInit) => {
    const ref = useRef<HTMLDivElement>(null);
    const [isInView, setIsInView] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) { setIsInView(true); observer.unobserve(el); }
        }, { threshold: 0.15, ...options });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return { ref, isInView };
};

// ── Dot Matrix Canvas Background ──
const DotMatrixBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const DOT_SPACING = 7;
        const DOT_RADIUS = 2.8;
        const COLOR = '#5a9a18'; // vivid green for dots

        // Helper: draw dots inside a shape defined by a hit-test function
        const drawDotShape = (
            cx: number, cy: number, radius: number,
            hitTest: (dx: number, dy: number, r: number) => boolean,
            opacity: number = 0.55,
            dotColor: string = COLOR,
            dotSpacing: number = DOT_SPACING,
            dotRadius: number = DOT_RADIUS
        ) => {
            ctx.fillStyle = dotColor;
            ctx.globalAlpha = opacity;
            for (let x = cx - radius; x <= cx + radius; x += dotSpacing) {
                for (let y = cy - radius; y <= cy + radius; y += dotSpacing) {
                    if (hitTest(x - cx, y - cy, radius)) {
                        ctx.beginPath();
                        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
            ctx.globalAlpha = 1;
        };

        // Circle hit test
        const circleHit = (dx: number, dy: number, r: number) =>
            dx * dx + dy * dy <= r * r;

        // Hexagon hit test
        const hexHit = (dx: number, dy: number, r: number) => {
            const ax = Math.abs(dx);
            const ay = Math.abs(dy);
            return ay <= r * 0.866 && ax <= r - ay * 0.577;
        };

        // Dollar sign as overlapping circles with a vertical bar excluded
        const drawDollarDot = (cx: number, cy: number, size: number, opacity: number) => {
            const s = size;
            ctx.fillStyle = COLOR;
            ctx.globalAlpha = opacity;

            // Draw the S shape using dot-filled arcs
            // Top curve
            for (let x = cx - s; x <= cx + s; x += DOT_SPACING) {
                for (let y = cy - s; y <= cy + s * 0.1; y += DOT_SPACING) {
                    const dx = x - cx;
                    const dy = y - (cy - s * 0.35);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= s * 0.65 && dist >= s * 0.35 && dx <= s * 0.2) {
                        ctx.beginPath();
                        ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
            // Bottom curve
            for (let x = cx - s; x <= cx + s; x += DOT_SPACING) {
                for (let y = cy - s * 0.1; y <= cy + s; y += DOT_SPACING) {
                    const dx = x - cx;
                    const dy = y - (cy + s * 0.35);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= s * 0.65 && dist >= s * 0.35 && dx >= -s * 0.2) {
                        ctx.beginPath();
                        ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
            // Vertical bars
            for (let y = cy - s * 0.9; y <= cy + s * 0.9; y += DOT_SPACING) {
                ctx.beginPath();
                ctx.arc(cx, y, DOT_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.globalAlpha = 1;
        };

        // Draw large coin-like circle with $ inside
        const drawDotCoin = (cx: number, cy: number, outerR: number, opacity: number) => {
            // Outer ring
            ctx.fillStyle = COLOR;
            ctx.globalAlpha = opacity;
            for (let x = cx - outerR; x <= cx + outerR; x += DOT_SPACING) {
                for (let y = cy - outerR; y <= cy + outerR; y += DOT_SPACING) {
                    const dx = x - cx;
                    const dy = y - cy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= outerR && dist >= outerR * 0.82) {
                        ctx.beginPath();
                        ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
            ctx.globalAlpha = 1;
            // Inner $ symbol
            drawDollarDot(cx, cy, outerR * 0.55, opacity);
        };

        // ── Responsive positions ──
        const isMd = w >= 768;

        // 1. Large $ coin — top-left
        drawDotCoin(
            isMd ? w * 0.08 : w * -0.05,
            isMd ? h * 0.18 : h * 0.12,
            isMd ? 200 : 120,
            0.7
        );

        // 2. Hexagon cluster — top-right
        const hx = isMd ? w * 0.88 : w * 1.0;
        const hy = isMd ? h * 0.12 : h * 0.08;
        drawDotShape(hx, hy, isMd ? 175 : 100, hexHit, 0.6);
        drawDotShape(hx - (isMd ? 100 : 55), hy + (isMd ? 140 : 80), isMd ? 130 : 70, hexHit, 0.5);

        // 3. Small circle — mid-right
        drawDotShape(
            isMd ? w * 0.92 : w * 0.95,
            isMd ? h * 0.42 : h * 0.38,
            isMd ? 90 : 50,
            circleHit, 0.5
        );

        // 4. Large $ coin — bottom-right
        drawDotCoin(
            isMd ? w * 0.9 : w * 1.05,
            isMd ? h * 0.72 : h * 0.68,
            isMd ? 170 : 100,
            0.6
        );

        // 5. Scattered small circles — left side
        drawDotShape(
            isMd ? w * 0.12 : w * 0.05,
            isMd ? h * 0.55 : h * 0.5,
            isMd ? 80 : 45,
            circleHit, 0.45
        );

        // 6. Bottom-left hexagon
        drawDotShape(
            isMd ? w * 0.05 : w * -0.02,
            isMd ? h * 0.78 : h * 0.75,
            isMd ? 145 : 80,
            hexHit, 0.55
        );

        // 7. Tiny decorative dots scattered
        const scatterPoints = [
            { x: w * 0.3, y: h * 0.08, r: 25 },
            { x: w * 0.7, y: h * 0.06, r: 20 },
            { x: w * 0.6, y: h * 0.85, r: 30 },
            { x: w * 0.2, y: h * 0.9, r: 25 },
            { x: w * 0.75, y: h * 0.35, r: 18 },
        ];
        scatterPoints.forEach(p => {
            drawDotShape(p.x, p.y, p.r, circleHit, 0.35);
        });

    }, []);

    useEffect(() => {
        draw();
        const handleResize = () => {
            requestAnimationFrame(draw);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [draw]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-0"
            style={{ opacity: 1 }}
        />
    );
};

const Landing: React.FC = () => {
    const [heroTab, setHeroTab] = useState<'agent' | 'human'>('agent');
    const [copied, setCopied] = useState(false);

    const quoteRef = useInView();
    const featuresRef = useInView();
    const stackRef = useInView();

    const handleCopy = () => {
        navigator.clipboard.writeText('curl -sL https://docs.openclaw.com/install.sh | bash');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative min-h-screen pb-24 overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
            {/* Dot Matrix Canvas Background */}
            <DotMatrixBackground />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

                {/* ─── Hero Section ─── */}
                <section className="text-center space-y-4 pt-4 md:pt-6 relative animate-fadeIn">
                    <div className="flex justify-center mb-2">
                        <div className="inline-flex items-center px-4 py-1.5 rounded-full border backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:scale-105 transition-all duration-500 cursor-default" style={{ backgroundColor: 'rgba(245,240,230,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
                            <span className="text-xs sm:text-sm font-bold text-gray-700 tracking-wide">
                                Loka <span className="text-gray-400 font-medium mx-1">powered by</span> Loka
                            </span>
                        </div>
                    </div>
                    <h1 className="text-5xl md:text-7xl font-outfit font-black text-black tracking-[-0.03em] max-w-5xl mx-auto leading-[1.1] md:leading-[1.05] relative z-20 transition-transform duration-700 hover:scale-[1.02]">
                        The Agentic <br className="hidden md:block" />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-black via-gray-700 to-black bg-[length:200%_auto] hover:bg-right transition-all duration-1000">Payment Engine</span>
                    </h1>
                    <p className="text-base md:text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed font-medium">
                        A decentralized settlement infrastructure built for autonomous AI agents. Zero-fee microtransactions, absolute ZK privacy, and instant stablecoin liquidity.
                    </p>

                    <div className="pt-4 max-w-2xl mx-auto">
                        {/* Toggle Buttons */}
                        <div className="flex p-1.5 rounded-2xl mb-6 shadow-[0_2px_20px_rgba(0,0,0,0.06)] border max-w-sm mx-auto" style={{ backgroundColor: 'rgba(255,255,255,0.6)', borderColor: 'rgba(0,0,0,0.06)' }}>
                            <button
                                onClick={() => setHeroTab('agent')}
                                className={`flex flex-col items-center justify-center py-3 px-6 rounded-xl text-sm font-bold transition-all duration-300 w-1/2 hover:-translate-y-1 ${heroTab === 'agent' ? 'text-black shadow-xl scale-[1.02]' : 'text-gray-400 hover:text-black hover:bg-white/50'}`}
                                style={heroTab === 'agent' ? { backgroundColor: '#BAFF29', color: '#1a1a00' } : {}}
                            >
                                <span className="flex items-center gap-2 mb-0.5">
                                    <Icons.Code /> For Agent
                                </span>
                                <span className={`text-[10px] font-normal ${heroTab === 'agent' ? 'text-gray-700' : 'text-gray-400'}`}>Integrate SKILL</span>
                            </button>
                            <button
                                onClick={() => setHeroTab('human')}
                                className={`flex flex-col items-center justify-center py-3 px-6 rounded-xl text-sm font-bold transition-all duration-300 w-1/2 hover:-translate-y-1 ${heroTab === 'human' ? 'text-black shadow-xl scale-[1.02]' : 'text-gray-400 hover:text-black hover:bg-white/50'}`}
                                style={heroTab === 'human' ? { backgroundColor: '#BAFF29', color: '#1a1a00' } : {}}
                            >
                                <span className="flex items-center gap-2 mb-0.5">
                                    <Icons.User /> For Human
                                </span>
                                <span className={`text-[10px] font-normal ${heroTab === 'human' ? 'text-gray-700' : 'text-gray-400'}`}>Enter Portal</span>
                            </button>
                        </div>

                        {/* Dynamic Content Area */}
                        <div className="min-h-[260px] flex items-center justify-center text-left" key={heroTab}>
                            {heroTab === 'agent' ? (
                                <div className="w-full bg-[#1C1C1E] rounded-3xl p-6 md:p-8 shadow-[0_30px_60px_rgba(0,0,0,0.4)] border border-white/5 overflow-hidden relative group font-sans animate-fadeIn">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-15 transition-opacity duration-500"><Icons.Shield /></div>

                                    <div className="space-y-8">
                                        {/* Terminal Command Banner */}
                                        <div
                                            onClick={handleCopy}
                                            className="w-full bg-[#0D0D0D] font-mono rounded-2xl p-4 md:p-5 shadow-inner border border-white/10 flex items-center justify-between cursor-pointer hover:border-white/30 hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all duration-300 group/cmd relative overflow-hidden active:scale-[0.98]"
                                        >
                                            <div className="text-xs md:text-sm tracking-wide text-gray-300 flex flex-wrap gap-2 items-center leading-relaxed">
                                                <span className="text-gray-500 select-none group-hover/cmd:text-white transition-colors duration-300">$</span>
                                                <span className="group-hover/cmd:opacity-80 transition-opacity" style={{ color: '#BAFF29' }}>curl</span>
                                                <span>-sL</span>
                                                <span className="text-white break-all">https://docs.openclaw.com/install.sh</span>
                                                <span style={{ color: '#BAFF29' }}>&nbsp;|&nbsp;</span>
                                                <span className="group-hover/cmd:opacity-80 transition-opacity" style={{ color: '#BAFF29' }}>bash</span>
                                            </div>
                                            <div className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-[10px] font-bold text-gray-400 hover:text-white transition-all border border-white/10 ml-4 whitespace-nowrap tracking-widest">
                                                {copied ? '✓ Copied' : 'Copy'}
                                            </div>
                                        </div>

                                        {/* Steps */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-4 lg:gap-8 px-2">
                                            {[
                                                { num: '01', label: 'READ', desc: 'Tell your agent to read the installation script.' },
                                                { num: '02', label: 'FETCH', desc: 'Agent installs the OpenClaw skill dependency locally.' },
                                                { num: '03', label: 'START', desc: 'Runtime restarts and connects to the settlement layer.' },
                                            ].map((step, i) => (
                                                <div key={i} className="flex flex-col gap-2 relative group/step" style={{ animationDelay: `${i * 100}ms` }}>
                                                    <div className="font-black text-sm tracking-widest mb-1 flex items-center gap-2" style={{ color: '#BAFF29' }}>
                                                        <span className="rounded-md px-2 py-0.5" style={{ backgroundColor: 'rgba(186,255,41,0.15)' }}>{step.num}</span>
                                                        <span>{step.label}</span>
                                                        {i < 2 && <div className="h-px bg-white/10 flex-1 hidden sm:block"></div>}
                                                    </div>
                                                    <p className="text-xs md:text-sm font-medium text-gray-400 leading-relaxed pr-2">
                                                        {step.desc}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    onClick={() => window.dispatchEvent(new CustomEvent('loka-nav-chat'))}
                                    className="w-full h-full rounded-3xl p-8 md:p-12 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] border flex flex-col items-center justify-center text-center gap-5 group hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 cursor-pointer relative overflow-hidden animate-fadeIn"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.06)' }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-tr from-[#FFFFFF]/50 via-white to-[#FFFFFF]/50 opacity-50"></div>
                                    <div className="relative z-10 w-16 h-16 bg-black text-white rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform group-hover:-rotate-6 duration-300">
                                        <Icons.Chat />
                                    </div>
                                    <div className="relative z-10 flex flex-col items-center gap-6">
                                        <p className="text-gray-600 font-medium max-w-[280px] mx-auto leading-relaxed text-sm">Experience the Loka protocol manually through our natural language gateway.</p>
                                        <button className="px-8 py-3 text-black rounded-full text-sm font-bold shadow-xl transition-all flex items-center gap-2 hover:scale-105 tracking-widest" style={{ backgroundColor: '#BAFF29' }}>
                                            start to chat <Icons.Flash />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>



                {/* ─── Vision Quote ─── */}
                <section
                    ref={quoteRef.ref}
                    className={`max-w-4xl mx-auto mt-16 relative transition-all duration-700 delay-100 ${quoteRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                >

                    <div className="p-10 md:p-16 rounded-[3rem] border shadow-[0_8px_32px_rgba(0,0,0,0.04)] relative overflow-hidden backdrop-blur-3xl text-center group hover:-translate-y-1 transition-transform duration-700" style={{ backgroundColor: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.5)' }}>
                        <div className="absolute -top-6 -left-2 text-[12rem] text-transparent bg-clip-text bg-gradient-to-br from-gray-300/50 to-transparent font-serif leading-none italic select-none pointer-events-none">"</div>
                        <p className="text-xl md:text-3xl font-serif italic text-gray-800 leading-relaxed relative z-10 px-4 md:px-10">
                            Capture secure yields completely on-platform. Transform rigid, real-world cash flows into highly programmable, liquid capital loops.
                        </p>
                        <div className="mt-10 flex items-center justify-center gap-4">
                            <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent flex-1 max-w-[100px]"></div>
                            <p className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-gray-600 to-gray-900 tracking-widest">— Protocol Vision</p>
                            <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent flex-1 max-w-[100px]"></div>
                        </div>
                    </div>
                </section>

                {/* ─── Features Showcase ─── */}
                <section
                    ref={featuresRef.ref}
                    className={`space-y-16 mt-32 transition-all duration-700 delay-200 ${featuresRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                >
                    <div className="text-center space-y-4 mb-20 relative">
                        <div className="inline-block relative">
                            <h2 className="text-4xl md:text-5xl font-black text-black tracking-tight relative z-10">Ecosystem Architecture</h2>
                        </div>
                        <p className="text-gray-500 text-lg font-medium max-w-2xl mx-auto">Engineered from the ground up to eliminate friction in AI-driven commerce.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Card style matching dot matrix theme */}
                        {[
                            {
                                icon: <Icons.Chat />,
                                iconColor: '#BAFF29',
                                title: 'Conversational Settlement',
                                desc: 'Execute payments, configure complex conditional logic, and orchestrate capital routing entirely through natural language commands natively optimized for multi-agent workflows.',
                            },
                            {
                                icon: <Icons.Shield />,
                                iconColor: '#BAFF29',
                                title: 'Zero-Knowledge Autonomy',
                                desc: 'Institutional-grade financial privacy. ZK proofs validate policy compliance and portfolio solvency instantly without ever exposing balances, counterparties, or proprietary strategies.',
                            },
                            {
                                icon: <Icons.User />,
                                iconColor: '#BAFF29',
                                title: 'Programmable Reputation',
                                desc: 'Dynamic deterministic credit scoring establishes behavioral identity on-platform. Progress from anonymous accounts to trusted, measurable institutional agent relationships.',
                            },
                            {
                                icon: <Icons.Swap />,
                                iconColor: '#BAFF29',
                                title: 'Absolute Zero-Fee Rail',
                                desc: 'Engineered atop a custom sovereign layer enabling infinite friction-free microtransactions. Seamless T+0 finality deeply integrated alongside structural global fiat gateways.',
                            },
                        ].map((card, i) => (
                            <div key={i} className="group p-10 md:p-12 rounded-[2.5rem] border backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.03)] hover:shadow-[0_30px_60px_rgb(0,0,0,0.08)] transition-all duration-500 hover:-translate-y-2 relative overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.5)' }}>
                                <div className="w-14 h-14 shadow-lg rounded-2xl flex items-center justify-center mb-8 border group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 relative z-10" style={{ backgroundColor: '#BAFF29', borderColor: 'rgba(186,255,41,0.5)', color: '#1a1a00' }}>
                                    {card.icon}
                                </div>
                                <h3 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight relative z-10">{card.title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed relative z-10 font-medium">
                                    {card.desc}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ─── Deep Tech Architecture ─── */}
                <section
                    ref={stackRef.ref}
                    className={`space-y-16 pt-24 pb-12 transition-all duration-700 delay-300 ${stackRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                >
                    <div className="text-center space-y-4 mb-20">
                        <h2 className="text-4xl md:text-5xl font-black text-black tracking-tight">The Institutional Stack.</h2>
                        <p className="text-gray-500 text-lg font-medium">Modular, secure components forged for enterprise-grade throughput.</p>
                    </div>

                    <div className="relative max-w-5xl mx-auto">
                        {/* Continuous vertical line */}
                        <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-gray-300 via-gray-400 to-transparent transform md:-translate-x-1/2"></div>

                        <div className="space-y-24">
                            {/* Layer 3 */}
                            <div className="relative flex flex-col md:flex-row items-start md:justify-between w-full group">
                                <div className="md:w-5/12 ml-16 md:ml-0 md:text-right md:pr-12 text-left mb-6 md:mb-0">
                                    <h3 className="text-2xl font-black text-black">Experience & SDK Layer</h3>
                                    <p className="text-gray-500 mt-3 font-medium text-sm leading-relaxed">Turnkey integration suites for autonomous agents and decentralized businesses. Featuring automated gas sponsorships, isolated session keys, and comprehensive policy rule configurations.</p>
                                </div>
                                <div className="absolute left-6 md:left-1/2 w-4 h-4 rounded-full border-4 border-[#FFFFFF] shadow-md transform -translate-x-1/2 mt-1.5 md:mt-2 transition-transform group-hover:scale-150" style={{ backgroundColor: '#BAFF29' }}></div>
                                <div className="md:w-5/12 ml-16 md:ml-0 md:pl-12 w-[calc(100%-4rem)]">
                                    <div className="p-6 rounded-3xl border shadow-sm hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] transition-all duration-500 hover:-translate-y-2" style={{ backgroundColor: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.06)' }}>
                                        <h4 className="text-[10px] font-bold text-gray-400 tracking-widest mb-4">SKILL Framework</h4>
                                        <p className="text-sm font-semibold text-gray-800 mb-2">Plonky2 + Groth16 Native Proofs</p>
                                        <p className="text-xs text-gray-500 leading-relaxed">Local runtime compiling dynamic exposure limits into deployable zero-knowledge circuits directly within the agent workflow.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Layer 2 */}
                            <div className="relative flex flex-col md:flex-row items-start md:justify-between w-full group">
                                <div className="md:w-5/12 ml-16 md:ml-0 md:text-right md:pr-12 text-left mb-6 md:mb-0 md:order-1 order-3 w-[calc(100%-4rem)]">
                                    <div className="p-6 rounded-3xl border shadow-sm hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] transition-all duration-500 hover:-translate-y-2" style={{ backgroundColor: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.06)' }}>
                                        <h4 className="text-[10px] font-bold text-gray-400 tracking-widest mb-4">Execution Environment</h4>
                                        <p className="text-sm font-semibold text-gray-800 mb-2">AWS Nitro Enclaves Hub</p>
                                        <p className="text-xs text-gray-500 leading-relaxed">Hardware-level CPU segregation guarantees absolute data confidentiality, rendering proprietary strategies completely opaque to hosts and operators.</p>
                                    </div>
                                </div>
                                <div className="absolute left-6 md:left-1/2 w-4 h-4 rounded-full border-4 border-[#FFFFFF] shadow-md transform -translate-x-1/2 mt-1.5 md:mt-2 md:order-2 order-2 transition-transform group-hover:scale-150" style={{ backgroundColor: 'rgba(186,255,41,0.6)' }}></div>
                                <div className="md:w-5/12 ml-16 md:ml-0 md:pl-12 md:order-3 order-1 mb-6 md:mb-0 text-left">
                                    <h3 className="text-2xl font-black text-black">Computation & Risk Engine</h3>
                                    <p className="text-gray-500 mt-3 font-medium text-sm leading-relaxed">The invisible processing powerhouse safely driving compliance frameworks, multi-tenant agent logical routing, and rigorous fraud deterrence inside restricted boundaries.</p>
                                </div>
                            </div>

                            {/* Layer 1 */}
                            <div className="relative flex flex-col md:flex-row items-start md:justify-between w-full group">
                                <div className="md:w-5/12 ml-16 md:ml-0 md:text-right md:pr-12 text-left mb-6 md:mb-0">
                                    <h3 className="text-2xl font-black text-black">Ledger & Securitization</h3>
                                    <p className="text-gray-500 mt-3 font-medium text-sm leading-relaxed">Algorithmic capital utilization mechanisms capturing risk-free US Treasury yields to fund network emission mechanics, enabling continuous capital creation via AIUSD stablecoins.</p>
                                </div>
                                <div className="absolute left-6 md:left-1/2 w-4 h-4 rounded-full border-4 border-[#FFFFFF] shadow-md transform -translate-x-1/2 mt-1.5 md:mt-2 transition-transform group-hover:scale-150" style={{ backgroundColor: 'rgba(186,255,41,0.35)' }}></div>
                                <div className="md:w-5/12 ml-16 md:ml-0 md:pl-12 w-[calc(100%-4rem)]">
                                    <div className="p-6 rounded-3xl border shadow-sm hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] transition-all duration-500 hover:-translate-y-2" style={{ backgroundColor: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.06)' }}>
                                        <h4 className="text-[10px] font-bold text-gray-400 tracking-widest mb-4">Programmable Assets</h4>
                                        <p className="text-sm font-semibold text-gray-800 mb-2">Native Yield & Asset Discounting</p>
                                        <p className="text-xs text-gray-500 leading-relaxed">Convert historically illiquid verifiable business incomes like SaaS API usage or decentralized Compute nodes into instantly tradeable Yield and Principal assets.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ─── Download App Section ─── */}
                <section className="pt-24 pb-12">
                    <div className="max-w-4xl mx-auto">
                        <div className="relative rounded-[2.5rem] overflow-hidden border shadow-[0_20px_60px_rgba(0,0,0,0.06)]" style={{ backgroundColor: 'rgba(255,255,255,0.6)', borderColor: 'rgba(0,0,0,0.06)' }}>
                            {/* Background glows */}
                            <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#BAFF29]/20 rounded-full blur-[80px]" />
                            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-[#BAFF29]/10 rounded-full blur-[80px]" />

                            <div className="relative z-10 p-8 sm:p-12 md:p-16 flex flex-col md:flex-row items-center gap-10 md:gap-16">
                                {/* Left: Text + Download Button */}
                                <div className="flex-1 text-center md:text-left">
                                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-wide mb-6 border" style={{ backgroundColor: 'rgba(186,255,41,0.15)', borderColor: 'rgba(186,255,41,0.3)', color: '#4a7a10' }}>
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 2.237a.625.625 0 00-1.074.636l1.36 2.296a7.5 7.5 0 00-11.618 0l1.36-2.296a.625.625 0 10-1.074-.636L5.022 4.865A7.5 7.5 0 002 11.25h20a7.5 7.5 0 00-3.022-6.385l-1.455-2.628zM8.25 9.375a.875.875 0 110-1.75.875.875 0 010 1.75zm7.5 0a.875.875 0 110-1.75.875.875 0 010 1.75zM2 12.75h20v.75a8.25 8.25 0 01-8.25 8.25h-3.5A8.25 8.25 0 012 13.5v-.75z" /></svg>
                                        ANDROID APP
                                    </div>
                                    <h3 className="text-3xl md:text-4xl font-black text-black tracking-tight mb-4 leading-tight">
                                        Take Loka Cash<br />everywhere you go.
                                    </h3>
                                    <p className="text-gray-500 text-base leading-relaxed mb-8 max-w-md">
                                        Trade, chat with AI, manage your portfolio, and execute secure transactions — all from your pocket. Scan the QR code or tap the button below.
                                    </p>

                                    <div className="flex flex-col sm:flex-row items-center gap-3">
                                        <a
                                            href="/downloads/lokacash.apk"
                                            download
                                            className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl text-sm font-black shadow-xl hover:scale-105 hover:shadow-2xl transition-all duration-300 border"
                                            style={{ backgroundColor: '#BAFF29', color: '#1a1a00', borderColor: 'rgba(186,255,41,0.5)' }}
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                            Download APK
                                        </a>
                                        <span className="text-xs font-bold text-gray-400">v1.0.0 · 5.8 MB</span>
                                    </div>
                                </div>

                                {/* Right: QR Code */}
                                <div className="flex flex-col items-center gap-4">
                                    <div className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100">
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
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Scan to download</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default Landing;
