
import React from 'react';

export const COLORS = {
  primary: '#3b82f6',
  secondary: '#2dd4bf',
  danger: '#ef4444',
  warning: '#f59e0b',
  success: '#00E676', // LOKA Green
  bg: '#fafafa',
  darkBg: '#0b0c0e',
  darkCard: '#13161a',
  accent: '#a3ff12', // Neon green from the image
  card: 'rgba(255, 255, 255, 0.03)'
};

export const Icons = {
  Dashboard: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
  ),
  Swap: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
  ),
  Market: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
  ),
  Agent: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
  ),
  Shield: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
  ),
  Portfolio: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
  ),
  Scan: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
  ),
  Bell: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
  ),
  Rocket: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
  ),
  Flash: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
  ),
  User: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
  ),
  TrendingUp: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
  ),
  Chat: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
  ),
  Plus: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
  ),
  Send: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
  ),
  History: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  Code: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
  ),
  CheckCircle: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  CreditCard: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
  ),
  Groups: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
  ),
  Assets: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>
  ),
  Trade: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
  ),
  Crown: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" />
      <path d="M5 20h14" />
    </svg>
  ),
  Diamond: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12l4 6-10 12L2 9z" />
      <path d="M5 21L6 19" />
      <path d="M19 21L18 19" />
    </svg>
  ),
  Coins: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Back Coin - Subtle Opacity */}
      <circle cx="14" cy="14" r="6" strokeOpacity="0.4" />
      <rect x="12" y="12" width="4" height="4" transform="rotate(45 14 14)" strokeOpacity="0.4" />
      {/* Front Coin - Solid */}
      <circle cx="9" cy="9" r="6" fill="white" stroke="currentColor" />
      <rect x="7" y="7" width="4" height="4" transform="rotate(45 9 9)" />
    </svg>
  ),
  Compass: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
    </svg>
  )
};

import { I } from './components/Icons';
import { ActionIcons } from './components/Icons';
import { Page } from './types';


export const FEATURED_GROUPS = [
  { id: 'g1', name: 'Polymarket Predictions', desc: 'Crowd-sourced market predictions 鈥?weather, elections, earnings surprises, and more.', memberCount: 3, agentCount: 2, online: 2, avatar: 'PP', color: 'bg-blue-100 text-blue-600', avatars: ['AC', 'SK', 'CW', 'LA', 'RA'] },
  { id: 'g2', name: 'Daily Market Pulse', desc: 'Hot topics, trending tickers, and breaking macro news powered by multi-agent research.', memberCount: 3, agentCount: 1, online: 2, avatar: 'DM', color: 'bg-emerald-100 text-emerald-600', avatars: ['MR', 'EZ', 'RB', 'LA'] },
  { id: 'g3', name: 'Alpha Research Circle', desc: 'Deep-dive signals: cross-asset momentum, earnings revisions, and sentiment shifts.', memberCount: 2, agentCount: 2, online: 1, avatar: 'AR', color: 'bg-violet-100 text-violet-600', avatars: ['DP', 'AT', 'LA', 'MR'] },
  { id: 'g4', name: 'Global Macro Signals', desc: 'Fed watch, inflation expectations, bond yields, and central bank policy tracking.', memberCount: 4, agentCount: 1, online: 3, avatar: 'GM', color: 'bg-amber-100 text-amber-600', avatars: ['JL', 'NP', 'TW', 'LW', 'MB'] },
];

export const QUICK_ACTIONS = [
  { id: 'invest', icon: ActionIcons.Invest, label: 'Analyze Investment' },
  { id: 'research', icon: ActionIcons.Research, label: 'Signal Radar' },
  { id: 'hedgefund', icon: ActionIcons.HedgeFund, label: 'AI Hedge Fund' },
  { id: 'stockanalysis', icon: ActionIcons.StockAnalysis, label: 'A/H/US Stock' },
  { id: 'forecast', icon: ActionIcons.Forecast, label: 'Forecast' },
  { id: 'scout', icon: ActionIcons.Scout, label: 'Project Scout' },
  { id: 'sentiment', icon: ActionIcons.Sentiment, label: 'Check Sentiment' },
  { id: 'portfolio', icon: ActionIcons.Portfolio, label: 'Review Portfolio' },
];

export const USE_CASES = [
  { id: 'invest', title: 'Is NVIDIA Still a Buy After Q4?', desc: 'Multi-agent consensus on earnings, valuation, and market timing', prompt: 'Help me analyze NVIDIA\'s recent stock performance and whether it\'s worth investing now', tags: ['Stock', 'Earnings'] },
  { id: 'research', title: 'SE Asia Food Delivery Landscape', desc: 'Market sizing, key players, and growth trends across the region', prompt: 'Research the competitive landscape of the Southeast Asian food delivery market', tags: ['Industry', 'Market Size'] },
  { id: 'compete', title: 'AI Agent Demand in the Last 30 Days', desc: 'Track how market demand shifted across categories recently', prompt: 'Search and analyze how AI Agent demand has changed in the last 30 days across different categories', tags: ['Trends', '30-Day'] },
  { id: 'evaluate', title: 'Startup Due Diligence Report', desc: 'Team background check, business model, and tech feasibility', prompt: 'Evaluate this startup 鈥?analyze team background, business model, and technical feasibility', tags: ['Team', 'Feasibility'] },
  { id: 'collab', title: 'Q2 Roadmap 鈫?Task Breakdown', desc: 'Turn a product roadmap into assigned tasks with deadlines', prompt: 'Help me break down the Q2 product roadmap into actionable tasks with owners and deadlines', tags: ['Tasks', 'Planning'] },
  { id: 'predict', title: 'Polymarket Opportunities Now', desc: 'Which prediction markets have the best risk-reward right now?', prompt: 'Which prediction markets on Polymarket are worth paying attention to right now?', tags: ['Odds', 'Sentiment'] },
];

export const FEATURED_AGENTS = [
  {
    id: 'invest',
    name: 'Investment Analysis',
    desc: 'Multi-dimensional analysis — fundamentals, technicals, and sentiment.',
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M3 17l4-4 4 4 4-6 4 2" /><path d="M21 21H3" />
      </svg>
    ),
    prompt: 'Help me analyze NVIDIA\'s recent stock performance and whether it\'s worth investing now',
    route: null as string | null,
  },
  {
    id: 'signal-reader',
    name: 'Signal Radar',
    desc: 'Real-time signals, news monitoring, and cross-platform sentiment.',
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 010 8.49M7.76 16.24a6 6 0 010-8.49" /><path d="M19.07 4.93a10 10 0 010 14.14M4.93 19.07a10 10 0 010-14.14" />
      </svg>
    ),
    prompt: null as string | null,
    route: null as string | null,
    agentId: 'research',
  },
  {
    id: 'forecast',
    name: 'Forecast',
    desc: 'Scenario simulations and price range prediction with macro stress testing.',
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
    prompt: 'Simulate: What if Fed cuts rates by 50bps in Q3? Model the impact on tech stocks.',
    route: null as string | null,
  },
  {
    id: 'ai-trader',
    name: 'AI Trader',
    desc: 'Multi-agent swarm delivers structured trading recommendations with risk assessment.',
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M8 5v2" /><rect x="6" y="7" width="4" height="7" rx="0.5" /><path d="M8 14v2" />
        <path d="M16 3v3" /><rect x="14" y="6" width="4" height="9" rx="0.5" fill="currentColor" stroke="none" /><path d="M16 15v3" />
      </svg>
    ),
    prompt: 'Use multi-agent swarm intelligence to analyze current market conditions and provide structured trading recommendations with risk assessment.',
    route: null as string | null,
  },
  {
    id: 'guru-council',
    name: 'Guru Council',
    desc: "Get Buffett, Lynch, and Dalio's perspective on any stock.",
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="9" cy="7" r="3.5" />
        <path d="M3 21v-1.5a4.5 4.5 0 014.5-4.5h3a4.5 4.5 0 014.5 4.5V21" />
        <path d="M16 3.5a3.5 3.5 0 010 7" />
        <path d="M21 21v-1.5a4.5 4.5 0 00-3-4.24" />
      </svg>
    ),
    prompt: 'Analyze NVIDIA from the perspectives of Warren Buffett, Peter Lynch, and Ray Dalio. What would each of them say?',
    route: null as string | null,
  },
  {
    id: 'daily-news',
    name: 'Daily News',
    desc: 'Daily A/H/US stock briefing with LLM-powered analysis and key movers.',
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2V9" /><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z" />
      </svg>
    ),
    prompt: "Give me today's key market news and analysis for A-share, Hong Kong, and US stocks. Highlight the most important movements.",
    route: null as string | null,
  },
  {
    id: 'project-scout',
    name: 'Project Scout',
    desc: 'Deep-dive due diligence on any company, startup, or project.',
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
      </svg>
    ),
    prompt: null as string | null,
    route: null as string | null,
    agentId: 'scout',
  },
];

export const RECENTS = [
  'ETH Risk Assessment',
  'BTC Q2 Outlook',
  'Portfolio Rebalance',
  'SOL Sentiment Check',
];

export const MOCK_MESSAGES: any[] = []; // Starting with empty active chats per user feedback

/* Agent-specific guided prompts */
export type AgentGuide = { desc: string; prompts?: string[]; scenarios?: { id: string; label: string; prompts: string[] }[] };
export const AGENT_GUIDES: Record<string, AgentGuide> = {
  invest: {
    desc: 'Multi-dimensional analysis on any asset.',
    prompts: [
      'Is NVIDIA still a buy after Q4 earnings?',
      'Compare Tesla vs BYD fundamentals for 2026',
      'Analyze the risk-reward of buying SOL at current price',
    ],
  },
  research: {
    desc: 'Pick a scenario:',
    scenarios: [
      {
        id: 'intel', label: 'Recon',
        prompts: [
          'Scan the last 30 days: what is the community saying about AI coding tools?',
          'Gather intelligence on OpenAI\'s latest moves 鈥?Reddit, X, HN combined',
          'What do investors really think about NVIDIA after Q4? Cross-platform scan',
        ],
      },
      {
        id: 'demand', label: 'Demand Validation',
        prompts: [
          'How much demand exists for AI-powered tax filing tools? Last 30 days',
          'Are people actually asking for multi-agent collaboration platforms?',
          'Validate demand: is there a gap in the market for B2B AI research agents?',
        ],
      },
      {
        id: 'trending', label: 'Trending',
        prompts: [
          'What AI topics went viral in the last 30 days across Reddit and X?',
          'Which AI agent frameworks are gaining quiet momentum right now?',
          'What are developers most excited (and angry) about this month?',
        ],
      },
      {
        id: 'competitor', label: 'Competitor Watch',
        prompts: [
          'Claude Code vs Cursor vs Windsurf 鈥?community sentiment comparison last 30 days',
          'What are users complaining about with Perplexity AI recently?',
          'Monitor: how is the community reacting to Manus\'s latest update?',
        ],
      },
    ],
  },
  forecast: {
    desc: 'Run scenario simulations using MirrorFace engine.',
    prompts: [
      'Simulate: What if Fed cuts rates by 50bps in Q3?',
      'Predict ETH price range for the next 90 days',
      'Model the impact of tariff escalation on AAPL supply chain',
    ],
  },
  scout: {
    desc: 'Deep-dive on any company, startup, or project.',
    prompts: [
      'Run due diligence on Perplexity AI 鈥?team, traction, and funding',
      'Investigate this startup: analyze business model and red flags',
      'Compare founders\' track records across three competing startups',
    ],
  },
  sentiment: {
    desc: 'Check real-time market sentiment from social and news sources.',
    prompts: [
      'Is the market bullish or bearish on AI stocks this week?',
      'Sentiment scan: top 5 most discussed tickers right now',
    ],
  },
  portfolio: {
    desc: 'Review and optimize your investment portfolio.',
    prompts: [
      'Rebalance my portfolio for maximum Sharpe ratio',
      'Show me correlation analysis of my top 5 holdings',
    ],
  },
  hedgefund: {
    desc: 'Multi-agent AI hedge fund analysis powered by legendary investors.',
    scenarios: [
      {
        id: 'single', label: 'Single Stock',
        prompts: [
          'AAPL',
          'TSLA',
          'NVDA',
          'MSFT',
        ],
      },
      {
        id: 'multi', label: 'Multi-Stock',
        prompts: [
          'AAPL, MSFT, GOOGL',
          'TSLA, RIVN, NIO',
          'NVDA, AMD, INTC',
        ],
      },
      {
        id: 'sector', label: 'Sector Play',
        prompts: [
          'META, SNAP, PINS — Social Media',
          'JPM, GS, MS — Banking',
          'XOM, CVX, COP — Energy',
        ],
      },
    ],
  },
  stockanalysis: {
    desc: 'Daily stock analysis for Asian and US markets, powered by data-driven insights.',
    scenarios: [
      {
        id: 'ashare', label: 'A-Share',
        prompts: [
          '600519',
          '000001',
          '601318',
        ],
      },
      {
        id: 'usstock', label: 'US Equity',
        prompts: [
          'TSLA',
          'AAPL',
          'NVDA',
        ],
      },
    ],
  },
};

export type GroupMemberData = {
  agents: string[];
  members: { name: string; online: boolean }[];
  isAdmin: boolean;
  adminName: string;
  isMember?: boolean;
};
export const MOCK_GROUP_MEMBERS: Record<string, GroupMemberData> = {
  g1: { isMember: false, isAdmin: false, adminName: 'Alex Chen', agents: ['Loka Agent', 'Risk Analyzer'], members: [{ name: 'Alex Chen', online: true }, { name: 'Sarah Kim', online: false }, { name: 'CryptoWhale88', online: true }] },
  g2: { isMember: false, isAdmin: false, adminName: 'Marcus Rivera', agents: ['Loka Agent'], members: [{ name: 'Marcus Rivera', online: true }, { name: 'Emily Zhang', online: true }, { name: 'RWA_Bull', online: false }] },
  g3: { isMember: false, isAdmin: false, adminName: 'David Park', agents: ['Loka Agent', 'Market Research'], members: [{ name: 'David Park', online: false }, { name: 'AlphaTrader', online: true }] },
  g4: { isMember: false, isAdmin: false, adminName: 'Nina Patel', agents: ['Macro Bot'], members: [{ name: 'Nina Patel', online: true }, { name: 'James Liu', online: true }] },
};

export const MOCK_CHAT_MESSAGES: Record<string, { role: string, name: string, text: string, time: string, tag?: string }[]> = {
  g1: [
    { role: 'agent', name: 'Loka Agent', tag: 'AI Agent', text: '✅ Milestone Update: Data center lease verified on-chain. Contract hash: 0x8f2a...3b4c. Compliance check passed.', time: '2:10 PM' },
    { role: 'user', name: 'Alex Chen', tag: 'Issuer', text: 'Should we prioritize H100 or A100 GPUs for the first batch?', time: '2:31 PM' },
    { role: 'system', name: 'Loka Agent', text: 'Hardware shipment tracking is live. We\'re on schedule for the 60-day deployment plan.', time: '3:31 PM' },
    { role: 'user', name: 'Alex Chen', tag: 'Issuer', text: 'Great! Let\'s update investors on the milestone.', time: '4:10 PM' },
  ],
  g2: [
    { role: 'agent', name: 'Loka Agent', tag: 'AI Agent', text: 'New RWA project just listed: Shopify Merchant Cluster — $200k target, 8.9% APY. Due diligence report attached.', time: '9:00 AM' },
    { role: 'user', name: 'Marcus Rivera', tag: 'Issuer', text: 'The receivables data has been verified by Stripe Connect. Coverage ratio is at 2.1x.', time: '10:30 AM' },
    { role: 'system', name: 'Loka Agent', text: 'Monthly repayment of $18,400 received. Distributed to 42 investors on-chain. ✅', time: '11:00 AM' },
  ],
  g3: [
    { role: 'agent', name: 'Loka Agent', tag: 'AI Agent', text: '📊 Weekly Market Report: BTC dominance ↑ 2.3%, DeFi TVL ↑ 4.1%. AI sector outperforming by +12%.', time: '8:00 AM' },
    { role: 'user', name: 'David Park', tag: 'Research', text: 'The on-chain metrics suggest a bullish accumulation pattern. Volume is confirming the move.', time: '9:15 AM' },
    { role: 'system', name: 'Loka Agent', text: 'New signal generated: Long ETH/USD at $2,840 — risk/reward 1:3.2. Confidence: 78%.', time: '10:00 AM' },
  ],
  g4: [
    { role: 'agent', name: 'Macro Bot', tag: 'AI Agent', text: '🏦 FOMC decision expected at 2pm ET today. Markets pricing in 72% chance of hold. Key: dot plot projections.', time: '8:30 AM' },
    { role: 'user', name: 'James Liu', text: 'Treasury yields inverted again overnight. 2Y/10Y spread at -18bps. Classic recession signal.', time: '9:00 AM' },
    { role: 'user', name: 'Nina Patel', text: 'BOJ just surprised with a 10bp rate hike. Yen surging. Watch carry trade unwind risk.', time: '9:45 AM' },
    { role: 'agent', name: 'Macro Bot', tag: 'AI Agent', text: '📊 Updated cross-asset correlation matrix: Gold/USD correlation flipped negative. Posting full report in 10 min.', time: '10:15 AM' },
  ],
  c1: [
    { role: 'user', name: 'Alex Chen', text: 'Check out this DeFi project — 15.5% APY, 60-day term. Verified by Loka.', time: '10:00 AM' },
    { role: 'agent', name: 'Loka Agent', tag: 'AI Agent', text: 'I\'ve analyzed the project. Strong cash flow coverage at 1.8x. Risk rating: A-. Would you like to invest?', time: '10:02 AM' },
  ],
};


export const DISCOVER_GROUPS = [
  { id: 1, name: 'Alpha Investors Network', desc: 'Find early-stage investment opportunities before everyone else. We share deal flow, term sheets, and real-time signals from top angel investors and VCs.', members: 1240, letter: 'A', color: 'bg-blue-100 text-blue-600', grad: 'from-blue-500 to-indigo-600', tag: 'Investing', activity: 'Very Active' },
  { id: 2, name: 'SaaS Founders Club', desc: 'B2B SaaS founders sharing growth metrics, fundraising war stories, and operator playbooks. Monthly revenue milestones celebrated here.', members: 890, letter: 'S', color: 'bg-emerald-100 text-emerald-600', grad: 'from-emerald-500 to-teal-600', tag: 'Startups', activity: 'Active' },
  { id: 3, name: 'AI Builders Circle', desc: 'AI-powered product builders sharing tools, demos, and launch strategies. Stay updated on the latest LLM releases and practical applications.', members: 2100, letter: 'A', color: 'bg-violet-100 text-violet-600', grad: 'from-violet-500 to-purple-700', tag: 'AI', activity: 'Very Active' },
  { id: 4, name: 'Credit & Lending Pros', desc: 'A community of credit analysts, lending officers, and fintech builders sharing best practices, scoring models, and underwriting frameworks.', members: 560, letter: 'C', color: 'bg-amber-100 text-amber-600', grad: 'from-amber-400 to-orange-500', tag: 'Finance', activity: 'Active' },
  { id: 5, name: 'Macro Research Daily', desc: 'Daily macro economic research, global policy commentary, and deep-dive reports. Stay ahead of institutional narratives and position your portfolio accordingly.', members: 1780, letter: 'M', color: 'bg-rose-100 text-rose-600', grad: 'from-rose-500 to-pink-600', tag: 'Research', activity: 'Very Active' },
  { id: 6, name: 'Growth & Revenue Hacks', desc: 'GTM strategies, conversion rate optimization, and revenue growth frameworks. Members share experiments, wins, and playbooks from real companies.', members: 920, letter: 'G', color: 'bg-cyan-100 text-cyan-600', grad: 'from-cyan-500 to-sky-600', tag: 'Growth', activity: 'Active' },
  { id: 7, name: 'Data & Analytics Hub', desc: 'SQL wizards, BI engineers, and data scientists sharing dashboards, metric frameworks, and analytical approaches for product and business decisions.', members: 670, letter: 'D', color: 'bg-indigo-100 text-indigo-600', grad: 'from-indigo-500 to-blue-700', tag: 'Analytics', activity: 'Moderate' },
  { id: 8, name: 'Portfolio Management', desc: 'Build and optimize your investment portfolio using modern portfolio theory, factor models, and AI-assisted rebalancing. Monthly performance reviews included.', members: 430, letter: 'P', color: 'bg-pink-100 text-pink-600', grad: 'from-pink-500 to-rose-600', tag: 'Portfolio', activity: 'Active' },
];

export const DISCOVER_AGENTS = [
  { id: 1, name: 'Finance Assistant', desc: 'Analyze financial data and generate investment insights', category: 'Finance', letter: 'F', color: 'bg-blue-500' },
  { id: 2, name: 'Risk Analyzer', desc: 'Evaluate portfolio risk and suggest hedging strategies', category: 'Finance', letter: 'R', color: 'bg-red-500' },
  { id: 3, name: 'Market Research', desc: 'Research market trends, competitors, and opportunities', category: 'Research', letter: 'M', color: 'bg-emerald-500' },
  { id: 4, name: 'Credit Scorer', desc: 'AI-powered credit assessment for lending decisions', category: 'Finance', letter: 'C', color: 'bg-amber-500' },
  { id: 5, name: 'Growth Advisor', desc: 'Identify the highest-leverage growth opportunities for your business', category: 'Growth', letter: 'G', color: 'bg-violet-500' },
  { id: 6, name: 'News Aggregator', desc: 'Curate and summarize financial news in real-time', category: 'Research', letter: 'N', color: 'bg-cyan-500' },
  { id: 7, name: 'Competitor Intelligence', desc: 'Monitor competitors, track pricing changes, and surface strategic insights', category: 'Research', letter: 'C', color: 'bg-indigo-500' },
  { id: 8, name: 'Revenue Forecaster', desc: 'Model revenue scenarios and forecast business performance using AI', category: 'Finance', letter: 'R', color: 'bg-pink-500' },
  { id: 9, name: 'Stock Analysis', desc: 'Daily stock analysis for Asian and US markets', category: 'Finance', letter: 'S', color: 'bg-red-500' },
];

export const DISCOVER_CONTACTS = [
  { id: 1, name: 'Alex Chen', role: 'Founder & CEO', bio: 'Building the future of AI-driven investment research tools.', twitter: '@alexchen_ai', followers: 12400, initials: 'AC', bgColor: 'bg-blue-500' },
  { id: 2, name: 'Sarah Kim', role: 'Co-founder & CTO', bio: 'ML engineer & fintech architect. prev @Stripe, @Plaid.', twitter: '@sarahkim_dev', followers: 8900, initials: 'SK', bgColor: 'bg-violet-500' },
  { id: 3, name: 'Marcus Rivera', role: null, bio: 'Angel investor & portfolio advisor. Obsessed with capital efficiency.', twitter: null, followers: 15600, initials: 'MR', bgColor: 'bg-emerald-500' },
  { id: 4, name: 'Emily Zhang', role: 'CEO', bio: 'AI-powered credit scoring for the underbanked. ex-Goldman.', twitter: '@emilyzhang', followers: 6700, initials: 'EZ', bgColor: 'bg-amber-500' },
  { id: 5, name: 'David Park', role: 'Head of Research', bio: 'Macro economics & AI agent research. PhD candidate.', twitter: '@dpark_rsch', followers: 4200, initials: 'DP', bgColor: 'bg-rose-500' },
  { id: 6, name: 'Lisa Wang', role: 'Founder & CPO', bio: 'Product-led growth for fintech apps. ex-Figma, ex-Notion.', twitter: null, followers: 3100, initials: 'LW', bgColor: 'bg-cyan-500' },
  { id: 7, name: 'James Liu', role: null, bio: 'Investing in real assets & infrastructure funds since 2019.', twitter: '@jamesliu_vc', followers: 28500, initials: 'JL', bgColor: 'bg-indigo-500' },
  { id: 8, name: 'Nina Patel', role: 'Lead Engineer', bio: 'Backend systems & distributed infra. love hard technical problems.', twitter: null, followers: 5400, initials: 'NP', bgColor: 'bg-pink-500' },
  { id: 9, name: 'Tom Wu', role: 'CFO', bio: 'Treasury management & financial modeling for high-growth startups.', twitter: '@tomwu_fi', followers: 7800, initials: 'TW', bgColor: 'bg-orange-500' },
];

export const AGENT_CATEGORIES = ['All', 'Finance', 'Research', 'Growth'];


export const STRANGER_DB = [
  { id: 's1', name: 'Alice Zhou', account: '@alicez', email: 'alice@primeresearch.co', role: 'Investment Researcher', mutual: 3, grad: 'from-fuchsia-500 to-pink-500', initials: 'AZ' },
  { id: 's2', name: 'Bob Chen', account: '@bobchen', email: 'bob@capitalfund.io', role: 'Portfolio Manager', mutual: 1, grad: 'from-sky-500 to-blue-500', initials: 'BC' },
  { id: 's3', name: 'Chloe Martin', account: '@chloe_m', email: 'chloe@loka.fi', role: 'Risk & Compliance Lead', mutual: 7, grad: 'from-emerald-500 to-teal-500', initials: 'CM' },
  { id: 's4', name: 'Daniel Lee', account: '@dlee_invest', email: 'd.lee@assetcapital.co', role: 'Alternatives Strategist', mutual: 2, grad: 'from-amber-400 to-orange-400', initials: 'DL' },
  { id: 's5', name: 'Eva Rossi', account: '@evarossi', email: 'eva@finmodels.io', role: 'Quantitative Analyst', mutual: 0, grad: 'from-violet-500 to-purple-500', initials: 'ER' },
  { id: 's6', name: 'Tom Zhang', account: '@tomzhang', email: 'tom@lokafi.xyz', role: 'Revenue Operations', mutual: 4, grad: 'from-rose-500 to-pink-500', initials: 'TZ' },
  { id: 's7', name: 'Jay Park', account: '@jaypark', email: 'jay@growthvc.co', role: 'Growth Investor', mutual: 0, grad: 'from-indigo-500 to-blue-600', initials: 'JP' },
  { id: 's8', name: 'Lena Fischer', account: '@lena_fi', email: 'lena@finresearch.io', role: 'Macro Economist', mutual: 2, grad: 'from-cyan-500 to-sky-500', initials: 'LF' },
  { id: 's9', name: 'Mike Torres', account: '@miketorres', email: 'mike@creditlayer.io', role: 'Credit Analyst', mutual: 1, grad: 'from-orange-400 to-amber-500', initials: 'MT' },
];

// Mock pending friend requests
export const MOCK_REQUESTS = [
  { id: 'r1', name: 'Bob Chen', account: '@bobchen', role: 'Portfolio Manager', mutual: 1, grad: 'from-sky-500 to-blue-500', initials: 'BC', time: '2m ago' },
  { id: 'r2', name: 'Lena Fischer', account: '@lena_fi', role: 'Token Economist', mutual: 2, grad: 'from-cyan-500 to-sky-500', initials: 'LF', time: '1h ago' },
  { id: 'r3', name: 'Jay Park', account: '@jaypark', role: 'On-chain Analyst', mutual: 0, grad: 'from-indigo-500 to-blue-600', initials: 'JP', time: '3h ago' },
];


export const navItems = [
  { key: Page.CHATS, icon: I.Chat, label: 'Community', anim: 'nav-chat' },
  { key: Page.CONTACTS, icon: I.People, label: 'Contacts', anim: 'nav-sparkle' },
  { key: Page.DISCOVER, icon: I.Compass, label: 'Discover', anim: 'nav-compass' },
  { key: Page.INVEST, icon: I.Market, label: 'Market', anim: 'nav-market' },
];

export const PAGE_PATHS: Record<string, string> = {
  [Page.SUPER_AGENT]: '/',
  [Page.CHATS]: '/chat',
  [Page.CONTACTS]: '/contacts',
  [Page.DISCOVER]: '/discover',
  [Page.INVEST]: '/market',
  [Page.API]: '/api',
  [Page.SETTINGS]: '/settings',
  [Page.PORTFOLIO]: '/portfolio',
};
