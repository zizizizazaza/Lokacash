import React from 'react';

const AnimStyles = () => (
  <style>{`
    .nav-sparkle:hover .nav-icon-wrap { animation: sparkle-pulse 0.5s ease; }
    .nav-compass:hover .nav-icon-wrap { animation: compass-wiggle 0.5s ease; }
    .nav-chat:hover .nav-icon-wrap { animation: chat-bounce 0.35s ease; }
    .nav-market:hover .nav-icon-wrap { animation: market-bounce 0.4s ease; }
    .nav-code:hover .nav-icon-wrap { animation: code-type 0.4s ease; }
    @keyframes sparkle-pulse { 0%,100%{transform:rotate(0)} 30%{transform:rotate(12deg)} 60%{transform:rotate(-6deg)} }
    @keyframes compass-wiggle { 0%,100%{transform:rotate(0)} 25%{transform:rotate(15deg)} 75%{transform:rotate(-10deg)} }
    @keyframes chat-bounce { 0%,100%{transform:translateY(0)} 40%{transform:translateY(-2px)} }
    @keyframes market-bounce { 0%,100%{transform:translateY(0)} 30%{transform:translateY(-3px)} 60%{transform:translateY(-1px)} }
    @keyframes code-type { 0%,100%{transform:translateX(0)} 50%{transform:translateX(2px)} }
    /* Tooltip for collapsed rail */
    .rail-btn { position: relative; }
    .rail-btn .rail-tip {
      position: absolute; left: calc(100% + 6px); top: 50%; transform: translateY(-50%);
      background: #1a1a1a; color: #fff; font-size: 12px; font-weight: 500;
      padding: 4px 10px; border-radius: 6px; white-space: nowrap;
      opacity: 0; pointer-events: none; transition: opacity 0.15s;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 50;
    }
    .rail-btn:hover .rail-tip { opacity: 1; }

    /* ── Easing tokens ── */
    :root {
      --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
      --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* ── Keyframes ── */
    @keyframes menu-pop {
      from { opacity:0; transform:translateY(6px) }
      to   { opacity:1; transform:translateY(0) }
    }
    @keyframes fade-up {
      from { opacity:0; transform:translateY(12px) }
      to   { opacity:1; transform:translateY(0) }
    }
    @keyframes fade-in {
      from { opacity:0 }
      to   { opacity:1 }
    }
    @keyframes scale-in {
      from { opacity:0; transform:scale(0.96) }
      to   { opacity:1; transform:scale(1) }
    }
    @keyframes send-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(17,24,39,0.4) }
      70%  { box-shadow: 0 0 0 6px rgba(17,24,39,0) }
      100% { box-shadow: 0 0 0 0 rgba(17,24,39,0) }
    }
    @keyframes fade-hint {
      0%   { opacity:0; transform:translateY(4px) }
      100% { opacity:1; transform:translateY(0) }
    }
    .animate-fade-hint {
      animation: fade-hint 0.35s ease-out both;
    }

    /* ── Hero entrance ── */
    .hero-title {
      animation: fade-up 0.6s var(--ease-out-expo) both;
    }
    .hero-input {
      animation: fade-up 0.6s var(--ease-out-expo) 0.1s both;
    }
    .hero-actions {
      animation: fade-up 0.5s var(--ease-out-expo) 0.2s both;
    }
    .hero-guide {
      animation: fade-up 0.4s var(--ease-out-expo) 0.25s both;
    }

    /* ── Prompt items stagger ── */
    .prompt-item { animation: fade-up 0.3s var(--ease-out-quart) both; }
    .prompt-item:nth-child(1) { animation-delay: 0ms }
    .prompt-item:nth-child(2) { animation-delay: 50ms }
    .prompt-item:nth-child(3) { animation-delay: 100ms }

    /* ── Use case cards ── */
    .usecase-card {
      transition: transform 0.2s var(--ease-out-quart), box-shadow 0.2s var(--ease-out-quart), border-color 0.15s ease;
    }
    .usecase-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.07);
    }
    .usecase-card:active {
      transform: translateY(0) scale(0.98);
      box-shadow: none;
      transition-duration: 0.1s;
    }

    /* ── Quick action pills ── */
    .qa-pill {
      transition: transform 0.15s var(--ease-out-quart), border-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease;
    }
    .qa-pill:hover { transform: translateY(-1px); }
    .qa-pill:active { transform: scale(0.96); transition-duration: 0.08s; }

    /* ── Scenario pills ── */
    .scenario-pill {
      transition: background 0.2s var(--ease-out-quart), color 0.2s ease, border-color 0.2s ease, transform 0.15s var(--ease-out-quart);
    }
    .scenario-pill:hover { transform: translateY(-1px); }
    .scenario-pill:active { transform: scale(0.96); }

    /* ── Send button pulse when active ── */
    .send-btn-active:hover { animation: send-pulse 0.6s var(--ease-out-quart); }
    .send-btn-active { transition: transform 0.1s ease, background 0.15s ease; }
    .send-btn-active:active { transform: scale(0.92); }

    /* ── Input box focus glow ── */
    .input-box {
      transition: border-color 0.2s ease, box-shadow 0.25s var(--ease-out-quart);
    }
    .input-box:focus-within {
      border-color: #d1d5db;
      box-shadow: 0 4px 20px rgba(0,0,0,0.07);
    }

    /* ── Agent tag entrance ── */
    .agent-tag {
      animation: scale-in 0.18s var(--ease-out-expo) both;
      transform-origin: left center;
    }

    /* ── Hero zone with dot grid ── */
    .hero-zone {
      position: relative;
      background-color: #fff;
      background-image: radial-gradient(circle, rgba(26,111,255,0.09) 1px, transparent 1px);
      background-size: 32px 32px;
    }

    /* ── Placeholder fade ── */
    @keyframes ph-fade-in { from { opacity:0; } to { opacity:1; } }
    @keyframes ph-fade-out { from { opacity:1; } to { opacity:0; } }
    .ph-fade-in  { animation: ph-fade-in  0.5s ease both; }
    .ph-fade-out { animation: ph-fade-out 0.4s ease both; }

    /* ── Use case card left accent on hover ── */
    .usecase-card { border-left: 2px solid transparent; }
    .usecase-card:hover { border-left-color: var(--accent); }

    /* ── Roundtable orbit animations (shared by waiting + active states) ── */
    @keyframes rt-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes rt-counter-orbit { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
    @keyframes rt-pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
    .rt-orbit { animation: rt-orbit 12s linear infinite; }
    .rt-counter-orbit { animation: rt-counter-orbit 12s linear infinite; }
    .rt-pulse-dot { animation: rt-pulse 1s ease-in-out infinite; }

    /* ── Master card shimmer / shine sweep ── */
    @keyframes card-shine {
      0%   { transform: translateX(-100%) skewX(-15deg); }
      100% { transform: translateX(250%) skewX(-15deg); }
    }
    .master-card-shine {
      position: relative;
      overflow: hidden;
    }
    .master-card-shine::after {
      content: '';
      position: absolute;
      top: 0; left: 0;
      width: 45%;
      height: 100%;
      background: linear-gradient(
        90deg,
        rgba(255,255,255,0) 0%,
        rgba(255,255,255,0.45) 40%,
        rgba(255,255,255,0.8) 50%,
        rgba(255,255,255,0.45) 60%,
        rgba(255,255,255,0) 100%
      );
      transform: translateX(-100%) skewX(-15deg);
      animation: card-shine 3s ease-in-out infinite;
      animation-delay: 1s;
      pointer-events: none;
      z-index: 1;
    }

    /* ── Thinking ticker ── */
    @keyframes ticker-in {
      from { opacity: 0; transform: translateY(5px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .ticker-in { animation: ticker-in 0.22s ease-out both; }

    /* ── Reduced motion ── */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  `}</style>
);

export default AnimStyles;
