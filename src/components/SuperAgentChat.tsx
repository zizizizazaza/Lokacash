/**
 * SuperAgentChat — Chat Detail Page
 * Clean chat interface similar to Surf style, with multi-agent thinking process
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { QUICK_ACTIONS } from '../constants';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// ─── Types and Interfaces ────────────────────────────────────

const InputIcons = {
  Attach: () => <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>,
  Mic: () => <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>,
  Image: () => <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
};

const AGENT_NAMES: Record<string, string> = {
  invest: 'Investment Analysis',
  research: 'Signal Radar',
  forecast: 'Forecast',
  scout: 'Project Scout',
  sentiment: 'Sentiment Check',
  portfolio: 'Portfolio Review',
};

const ChatChevron = () => <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>;

const CHAT_MODES = [
  { id: 'auto' as const,        label: 'Auto',        desc: 'Auto-route to the best agent mode',       icon: () => <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" /></svg> },
  { id: 'fast' as const,        label: 'Fast',        desc: 'Single agent, quick response',            icon: () => <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg> },
  { id: 'roundtable' as const,  label: 'Roundtable',  desc: 'Multi-agent consensus after analysis',    icon: () => <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M14 5.5a7.5 7.5 0 014.5 12" /><path d="M17 19.5H7" /><path d="M5.5 17A7.5 7.5 0 0110 5.5" /></svg> },
];

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    isStreaming?: boolean;
}

interface SearchSource {
    favicon: string;
    title: string;
    domain: string;
}

interface DataProvider {
    name: string;
    status: 'pending' | 'active' | 'done';
}

// ─── Modular Thinking Flow ──────────────────────────────────
interface SearchSubSection {
    id: 'social' | 'data_providers';
    label: string;
    status: 'pending' | 'active' | 'done';
    sources?: SearchSource[];
    providers?: DataProvider[];
    totalFound?: number;
}

interface SearchModuleData {
    variant: 'social' | 'data_providers' | 'combined';
    description?: string;
    sources?: SearchSource[];
    providers?: DataProvider[];
    totalFound?: number;
    // Combined mode: multiple sub-sections
    sections?: SearchSubSection[];
}

interface AnalysisStage {
    id: string;
    label: string;
    status: 'pending' | 'active' | 'done';
    result?: { label: string; value: string; color?: string }[];
}

interface AnalysisModuleData {
    stages: AnalysisStage[];
    decision?: { verdict: string; score: number; color: string; action: string };
}

interface SimPanelist {
    name: string;
    avatar: string;
    status: 'pending' | 'active' | 'done';
    verdict?: string;
    confidence?: number;
}

interface SimulationModuleData {
    panelists: SimPanelist[];
    prediction?: { verdict: string; confidence: number };
}

interface ConsensusModuleData {
    round: number;
    maxRounds: number;
    status: 'building' | 'discussing' | 'concluded';
    conclusion?: { verdict: string; confidence: number };
}

interface ThinkingModule {
    type: 'search' | 'analysis' | 'simulation' | 'consensus' | 'done';
    status: 'pending' | 'active' | 'completed';
    data?: SearchModuleData | AnalysisModuleData | SimulationModuleData | ConsensusModuleData | { duration?: number };
}

interface ThinkingFlow {
    modules: ThinkingModule[];
    isActive: boolean;
    route?: string;  // which agent route triggered this
}

// ─── Module Config Pools ────────────────────────────────────
const WEB_SOURCES_POOL: SearchSource[] = [
    { favicon: 'web', title: 'Q4 2025 earnings beat expectations, revenue up 22%...', domain: 'www.reuters.com' },
    { favicon: 'web', title: 'Institutional investors increase holdings by 15%...', domain: 'www.bloomberg.com' },
    { favicon: 'web', title: 'New partnership announced with major cloud provider...', domain: 'www.coindesk.com' },
    { favicon: 'web', title: 'Market cap surpasses $2T milestone amid AI boom...', domain: 'www.cnbc.com' },
    { favicon: 'web', title: 'SEC filing reveals insider buying activity...', domain: 'www.sec.gov' },
    { favicon: 'web', title: 'Analyst upgrades rating to Strong Buy, PT $950...', domain: 'www.tradingview.com' },
    { favicon: 'web', title: 'Short interest drops 40% as bearish momentum fades...', domain: 'finance.yahoo.com' },
    { favicon: 'web', title: 'Fed rate decision impact on high-growth tech stocks...', domain: 'www.wsj.com' },
];

const SOCIAL_SOURCES_POOL: SearchSource[] = [
    { favicon: 'reddit', title: 'r/wallstreetbets — Massive bull run incoming? DD inside...', domain: 'reddit.com' },
    { favicon: 'reddit', title: 'r/stocks — Earnings thread: beats estimates by 18%...', domain: 'reddit.com' },
    { favicon: 'x', title: '@analyst_mike: Breaking down Q4 numbers, thread 🧵...', domain: 'x.com' },
    { favicon: 'x', title: '@crypto_whale: Institutional flow data shows accumulation...', domain: 'x.com' },
    { favicon: 'youtube', title: 'Graham Stephan: Why I just bought $500K worth...', domain: 'youtube.com' },
    { favicon: 'youtube', title: 'Meet Kevin: Emergency livestream — market analysis...', domain: 'youtube.com' },
    { favicon: 'telegram', title: 'Crypto Signals VIP — New entry alert with 3x target...', domain: 't.me' },
    { favicon: 'discord', title: '#market-talk — Community consensus shifting bullish...', domain: 'discord.gg' },
    { favicon: 'hackernews', title: 'Show HN: Real-time sentiment analysis dashboard...', domain: 'news.ycombinator.com' },
    { favicon: 'weibo', title: '财经大V：A股联动分析，关注这个关键指标...', domain: 'weibo.com' },
    { favicon: 'wechat', title: '市场早报：隔夜美股大涨，今日重点关注...', domain: 'mp.weixin.qq.com' },
];

const DATA_PROVIDERS_POOL: string[] = [
    'Yahoo Finance', 'Bloomberg API', 'Alpha Vantage', 'Polygon.io', 'Finnhub',
    'CoinGecko', 'TradingView', 'Morningstar', 'SEC EDGAR', 'Quandl',
    'S&P Capital IQ', 'Refinitiv', 'CryptoCompare', 'Messari', 'Glassnode',
    'Santiment', 'LunarCrush', 'DeFi Llama', 'Dune Analytics', 'CoinMetrics',
    'MacroMicro', 'FRED', 'World Bank', 'Nansen', 'Token Terminal',
    'Alternative.me', 'Fear & Greed', 'Polymarket API',
];

const SIM_PANELISTS = [
    { name: 'Warren Buffett', avatar: '👤', initials: 'WB' },
    { name: 'Charlie Munger', avatar: '👤', initials: 'CM' },
    { name: 'Ray Dalio', avatar: '👤', initials: 'RD' },
    { name: 'Cathie Wood', avatar: '👤', initials: 'CW' },
    { name: 'Peter Lynch', avatar: '👤', initials: 'PL' },
    { name: 'George Soros', avatar: '👤', initials: 'GS' },
];

// ─── Knowledge Graph Types ──────────────────────────────────
interface KGNode {
    id: string;
    type: 'agent' | 'task' | 'stance';
    label: string;
    x: number;
    y: number;
    data?: Record<string, string>;
}

interface KGEdge {
    id: string;
    source: string;
    target: string;
    label: string;
}

interface KnowledgeGraphData {
    nodes: KGNode[];
    edges: KGEdge[];
}

const STATIC_KG_DATA: KnowledgeGraphData = {
    nodes: [
        { id: 'agent_0', type: 'agent', label: 'agent_0', x: 0, y: 0 },
        { id: 'agent_1', type: 'agent', label: 'agent_1', x: 0, y: 0 },
        { id: 'agent_2', type: 'agent', label: 'agent_2', x: 0, y: 0 },
        { id: 'agent_3', type: 'agent', label: 'agent_3', x: 0, y: 0 },
        { id: 'round_1', type: 'task', label: 'Round 1', x: 0, y: 0 },
        { id: 'round_2', type: 'task', label: 'Round 2', x: 0, y: 0 },
        { id: 'round_3', type: 'task', label: 'Round 3', x: 0, y: 0 },
        { id: 'round_4', type: 'task', label: 'Round 4', x: 0, y: 0 },
        { id: 'node_A', type: 'stance', label: 'A', x: 0, y: 0 },
        { id: 'node_B', type: 'stance', label: 'B', x: 0, y: 0 },
    ],
    edges: [
        { id: 'e1', source: 'agent_1', target: 'round_2', label: 'participates_in' },
        { id: 'e2', source: 'agent_1', target: 'round_3', label: 'participates_in' },
        { id: 'e3', source: 'agent_1', target: 'round_4', label: 'participates_in' },
        { id: 'e4', source: 'agent_1', target: 'node_B', label: 'supports' },

        { id: 'e5', source: 'agent_3', target: 'round_2', label: 'participates_in' },
        { id: 'e6', source: 'agent_3', target: 'round_3', label: 'participates_in' },
        { id: 'e7', source: 'agent_3', target: 'round_4', label: 'participates_in' },
        { id: 'e8', source: 'agent_3', target: 'node_B', label: 'supports' },

        { id: 'e9', source: 'agent_2', target: 'round_1', label: 'participates_in' },
        { id: 'e10', source: 'agent_2', target: 'round_2', label: 'participates_in' },
        { id: 'e11', source: 'agent_2', target: 'round_3', label: 'participates_in' },
        { id: 'e12', source: 'agent_2', target: 'round_4', label: 'participates_in' },
        { id: 'e13', source: 'agent_2', target: 'node_A', label: 'supports' },
        { id: 'e14', source: 'agent_2', target: 'node_B', label: 'supports' },

        { id: 'e15', source: 'agent_0', target: 'round_1', label: 'participates_in' },
        { id: 'e16', source: 'agent_0', target: 'round_2', label: 'participates_in' },
        { id: 'e17', source: 'agent_0', target: 'round_3', label: 'participates_in' },
        { id: 'e18', source: 'agent_0', target: 'round_4', label: 'participates_in' },
        { id: 'e19', source: 'agent_0', target: 'node_B', label: 'supports' },
    ]
};

// Build a knowledge graph from thinking process data (static mock, per user request)
const buildKnowledgeGraph = (): KnowledgeGraphData => STATIC_KG_DATA;



// ─── KnowledgeGraphView Component ──────────────────────────
const KnowledgeGraphView: React.FC<{ data: KnowledgeGraphData }> = ({ data }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!svgRef.current || !data.nodes.length) return;

        const svg = d3.select(svgRef.current);
        const width = containerRef.current?.clientWidth || 400;
        const height = containerRef.current?.clientHeight || 600;

        svg.selectAll('*').remove();

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (e) => {
                g.attr('transform', e.transform);
            });
        
        svg.call(zoom as any); // Cast to any to satisfy d3.zoom type

        const g = svg.append('g');

        // Dark theme arrow marker
        svg.append('defs').append('marker')
            .attr('id', 'arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 22)
            .attr('refY', 0)
            .attr('markerWidth', 5)
            .attr('markerHeight', 5)
            .attr('orient', 'auto')
            .append('path')
            .attr('fill', '#9ca3af')
            .attr('d', 'M0,-4L8,0L0,4');

        // Clone data for d3 mutation
        const nodes = data.nodes.map(d => ({ ...d }));
        const edges = data.edges.map(d => ({ ...d }));

        const simulation = d3.forceSimulation(nodes as any)
            .force('link', d3.forceLink(edges).id((d: any) => d.id).distance(110))
            .force('charge', d3.forceManyBody().strength(-400))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collide', d3.forceCollide().radius(40));

        const link = g.append('g')
            .attr('stroke', '#9ca3af')
            .attr('stroke-opacity', 0.8)
            .selectAll('line')
            .data(edges)
            .join('line')
            .attr('stroke-width', 1.5)
            .attr('marker-end', 'url(#arrow)');

        const linkLabel = g.append('g')
            .selectAll('text')
            .data(edges)
            .join('text')
            .text((d: any) => d.label)
            .attr('font-size', '8px')
            .attr('fill', '#9ca3af')
            .attr('text-anchor', 'middle');

        const drag = d3.drag<SVGGElement, any>()
            .on('start', (event, d) => {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });

        const node = g.append('g')
            .selectAll('g')
            .data(nodes)
            .join('g')
            .call(drag as any) // Cast to any to satisfy d3.drag type
            .style('cursor', 'grab');

        node.append('circle')
            .attr('r', (d: any) => d.type === 'agent' ? 18 : 14)
            .attr('fill', (d: any) => d.type === 'agent' ? '#f3f4f6' : d.type === 'stance' ? '#f5f3ff' : '#eff6ff')
            .attr('stroke', (d: any) => d.type === 'agent' ? '#6b7280' : d.type === 'stance' ? '#7c3aed' : '#3b82f6')
            .attr('stroke-width', 1.5);

        node.append('text')
            .text((d: any) => {
                const parts = d.label.split(' ');
                return d.type === 'agent' ? parts[0] : (d.label.length > 15 ? d.label.slice(0, 13) + '…' : d.label);
            })
            .attr('y', 28)
            .attr('font-size', '9px')
            .attr('fill', (d: any) => d.type === 'agent' ? '#374151' : d.type === 'stance' ? '#5b21b6' : '#1d4ed8')
            .attr('text-anchor', 'middle')
            .attr('font-weight', '500');

        simulation.on('tick', () => {
            link
                .attr('x1', (d: any) => d.source.x)
                .attr('y1', (d: any) => d.source.y)
                .attr('x2', (d: any) => d.target.x)
                .attr('y2', (d: any) => d.target.y);

            linkLabel
                .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
                .attr('y', (d: any) => (d.source.y + d.target.y) / 2 - 4);

            node
                .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
        });

        return () => {
            simulation.stop();
        };
    }, [data.nodes, data.edges]);

    return (
        <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-white" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
            <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
            
            {/* Legend overlay */}
            <div className="absolute bottom-4 left-4 flex gap-4 z-10">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#f3f4f6] border border-[#6b7280]"></div><span className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">Agent</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#eff6ff] border border-[#3b82f6]"></div><span className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">Task</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#f5f3ff] border border-[#7c3aed]"></div><span className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">Stance</span></div>
            </div>
            <div className="absolute top-4 right-4 text-[10px] text-gray-500 font-mono text-right pointer-events-none">
                scroll to zoom<br/>drag to pan
            </div>
        </div>
    );
};

// ─── ThinkingInlineTrigger (one-liner that opens right side panel) ───
const ThinkingInlineTrigger: React.FC<{
    thinking: ThinkingFlow;
    onOpen: () => void;
}> = ({ thinking, onOpen }) => {
    const doneModule = thinking.modules.find(m => m.type === 'done');
    const dur = doneModule?.status === 'completed' ? (doneModule.data as any)?.duration : null;
    const activeModule = thinking.modules.find(m => m.status === 'active');
    const labels: Record<string, string> = { search: 'Searching...', analysis: 'Analyzing...', simulation: 'Simulating...', consensus: 'Reaching consensus...' };
    const label = thinking.isActive ? (activeModule ? labels[activeModule.type] || 'Processing...' : 'Processing...') : `Loka completed in ${dur || '?'}s`;

    return (
        <button onClick={onOpen} className="group flex items-center gap-2 py-1.5 mb-2 hover:opacity-80 transition-opacity">
            {thinking.isActive ? (
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            )}
            <span className="text-[13px] font-medium text-gray-600">{label}</span>
            <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
    );
};

// ─── Shared sub-components for SidePanel ────────────────────
const StatusIcon: React.FC<{ status: string; size?: 'sm' | 'md' }> = ({ status, size = 'md' }) => {
    const s = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
    const bw = size === 'sm' ? 'border-[1.5px]' : 'border-2';
    if (status === 'done' || status === 'completed') return <svg className={`${s} text-emerald-500 shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>;
    if (status === 'active' || status === 'analyzing') return <div className={`${s} ${bw} border-blue-400 border-t-transparent rounded-full animate-spin shrink-0`} />;
    return <div className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} rounded-full border-2 border-gray-200 shrink-0`} />;
};

const PlatformLogo: React.FC<{ platform: string }> = ({ platform }) => {
    const s = 'w-4 h-4 shrink-0';
    switch (platform) {
        case 'reddit': return <svg className={s} viewBox="0 0 24 24" fill="#FF4500"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 13.23c.04.24.06.48.06.72 0 3.22-3.53 5.82-7.88 5.82S1.31 17.17 1.31 13.95c0-.26.02-.51.06-.78-.74-.39-1.24-1.17-1.24-2.07 0-1.29 1.04-2.33 2.33-2.33.59 0 1.13.22 1.54.58 1.56-1.03 3.6-1.66 5.84-1.72l1.17-5.21.03-.01 3.7.87c.25-.58.83-.99 1.51-.99a1.67 1.67 0 0 1 0 3.33c-.88 0-1.6-.68-1.66-1.55l-3.18-.75-.95 4.22c2.15.09 4.1.72 5.62 1.72.41-.36.95-.57 1.54-.57 1.29 0 2.33 1.04 2.33 2.33 0 .88-.49 1.65-1.21 2.04z"/></svg>;
        case 'x': return <svg className={s} viewBox="0 0 24 24" fill="#000"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>;
        case 'youtube': return <svg className={s} viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>;
        case 'telegram': return <svg className={s} viewBox="0 0 24 24" fill="#26A5E4"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.656 8.153c-.184 1.937-1.003 6.636-1.418 8.806-.176.918-.522 1.226-.856 1.256-.727.067-1.28-.48-1.984-.942-1.103-.722-1.726-1.173-2.797-1.878-1.238-.815-.435-1.264.27-1.997.185-.19 3.394-3.112 3.456-3.376.008-.033.015-.157-.058-.223-.074-.065-.182-.043-.261-.025-.112.025-1.9 1.207-5.36 3.545-.507.348-.966.518-1.378.509-.454-.01-1.326-.257-1.974-.468-.794-.258-1.426-.395-1.37-.834.028-.228.335-.463.92-.704 3.6-1.568 6-2.603 7.2-3.104 3.432-1.427 4.145-1.675 4.61-1.683.102-.002.332.024.48.144a.52.52 0 0 1 .175.334c.016.094.035.308.02.475z"/></svg>;
        case 'discord': return <svg className={s} viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.12-.098.246-.198.373-.292a.074.074 0 0 1 .078.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078-.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>;
        case 'hackernews': return <svg className={s} viewBox="0 0 24 24" fill="#F0652F"><path d="M0 0v24h24V0H0zm12.8 14.4V20h-1.6v-5.6L7 4h1.8l3.2 6.4L15.2 4H17l-4.2 10.4z"/></svg>;
        case 'weibo': return <svg className={s} viewBox="0 0 24 24" fill="#E6162D"><path d="M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.739 5.443z"/></svg>;
        case 'wechat': return <svg className={s} viewBox="0 0 24 24" fill="#07C160"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.078.285-.022.58.143.802a.77.77 0 0 0 .63.326.687.687 0 0 0 .355-.096l1.862-1.095a.735.735 0 0 1 .563-.082 10.2 10.2 0 0 0 2.313.27c.236 0 .47-.012.7-.031a6.395 6.395 0 0 1-.236-1.709c0-3.605 3.36-6.53 7.499-6.53.254 0 .504.013.75.035C16.805 4.707 13.082 2.188 8.691 2.188z"/></svg>;
        default: return <svg className={s} viewBox="0 0 24 24" fill="#6B7280"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>;
    }
};

const SourceCard: React.FC<{ source: SearchSource }> = ({ source }) => (
    <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer">
        <div className="shrink-0 w-5 h-5 flex items-center justify-center"><PlatformLogo platform={source.favicon} /></div>
        <span className="text-[12px] text-gray-600 truncate flex-1 leading-snug">{source.title}</span>
        <span className="text-[10px] text-gray-400 shrink-0 ml-2">{source.domain}</span>
    </div>
);

// ─── ThinkingProcessSidePanel (modular right panel) ─────────
const ThinkingProcessSidePanel: React.FC<{
    thinking: ThinkingFlow;
    onClose: () => void;
}> = ({ thinking, onClose }) => {

    // ── Sub-section renderers for Search Module ──
    const SocialSubSection: React.FC<{ section: SearchSubSection }> = ({ section }) => (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    section.status === 'done' ? 'bg-emerald-500' : section.status === 'active' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'
                }`} />
                <span className={`text-[12px] font-semibold ${
                    section.status === 'done' ? 'text-gray-700' : section.status === 'active' ? 'text-blue-600' : 'text-gray-300'
                }`}>{section.label}</span>
                {section.status === 'done' && section.totalFound && (
                    <span className="text-[10px] text-emerald-600 font-medium">{section.totalFound} sources</span>
                )}
            </div>
            {section.sources && section.sources.length > 0 && (
                <div className="ml-4 bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden mb-2">
                    {section.sources.map((src, i) => <SourceCard key={i} source={src} />)}
                </div>
            )}
        </div>
    );

    const DataProvidersSubSection: React.FC<{ section: SearchSubSection }> = ({ section }) => (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    section.status === 'done' ? 'bg-emerald-500' : section.status === 'active' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'
                }`} />
                <span className={`text-[12px] font-semibold ${
                    section.status === 'done' ? 'text-gray-700' : section.status === 'active' ? 'text-blue-600' : 'text-gray-300'
                }`}>{section.label}</span>
                {section.status === 'done' && section.totalFound && (
                    <span className="text-[10px] text-emerald-600 font-medium">{section.totalFound} connected</span>
                )}
            </div>
            {section.providers && (
                <div className="ml-4 flex flex-wrap gap-1.5 mb-2">
                    {section.providers.map((p, i) => (
                        <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                            p.status === 'done' ? 'bg-emerald-50 text-emerald-700' :
                            p.status === 'active' ? 'bg-blue-50 text-blue-600 animate-pulse' :
                            'bg-gray-50 text-gray-300'
                        }`}>
                            {p.status === 'done' ? '✓' : p.status === 'active' ? '⟳' : '·'} {p.name}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );

    // ── Search Module Renderer ──
    const SearchModule: React.FC<{ mod: ThinkingModule }> = ({ mod }) => {
        const d = mod.data as SearchModuleData | undefined;
        if (!d) return null;

        // Combined mode: render sub-sections
        if (d.variant === 'combined' && d.sections) {
            return (
                <div>
                    <div className="flex items-center gap-2.5 mb-3">
                        <StatusIcon status={mod.status} />
                        <span className="text-[14px] font-bold text-gray-900">Searching</span>
                    </div>
                    <div className="ml-7 space-y-4 mb-3">
                        {d.sections.map((sec, i) =>
                            sec.id === 'social'
                                ? <SocialSubSection key={i} section={sec} />
                                : <DataProvidersSubSection key={i} section={sec} />
                        )}
                    </div>
                </div>
            );
        }

        // Legacy single-variant mode
        return (
            <div>
                <div className="flex items-center gap-2.5 mb-2">
                    <StatusIcon status={mod.status} />
                    <span className="text-[14px] font-bold text-gray-900">{d.variant === 'social' ? 'Searching Web' : 'Fetching Data'}</span>
                </div>
                <div className="ml-7 space-y-3 mb-3">
                    {d.description && <p className="text-[12px] text-gray-500 leading-relaxed">{d.description}</p>}
                    {d.variant === 'social' && d.sources && d.sources.length > 0 && (
                        <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                            {d.sources.map((src, i) => <SourceCard key={i} source={src} />)}
                        </div>
                    )}
                    {d.variant === 'data_providers' && d.providers && (
                        <div className="flex flex-wrap gap-1.5">
                            {d.providers.map((p, i) => (
                                <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                                    p.status === 'done' ? 'bg-emerald-50 text-emerald-700' :
                                    p.status === 'active' ? 'bg-blue-50 text-blue-600 animate-pulse' :
                                    'bg-gray-50 text-gray-300'
                                }`}>
                                    {p.status === 'done' ? '✓' : p.status === 'active' ? '⟳' : '·'} {p.name}
                                </span>
                            ))}
                        </div>
                    )}
                    {mod.status === 'completed' && d.totalFound && (
                        <div className="flex items-center gap-1.5">
                            <StatusIcon status="done" size="sm" />
                            <span className="text-[11px] text-emerald-600 font-semibold">
                                {d.variant === 'social' ? `Found ${d.totalFound} sources` : `${d.totalFound}/${d.totalFound} providers connected`}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ── Analysis Module Renderer ──
    const AnalysisModule: React.FC<{ mod: ThinkingModule }> = ({ mod }) => {
        const d = mod.data as AnalysisModuleData | undefined;
        if (!d) return null;
        return (
            <div>
                <div className="flex items-center gap-2.5 mb-2">
                    <StatusIcon status={mod.status} />
                    <span className="text-[14px] font-bold text-gray-900">Analyzing</span>
                </div>
                <div className="ml-7 space-y-2 mb-3">
                    {d.stages.map((stage, i) => (
                        <div key={i}>
                            <div className="flex items-start gap-2">
                                <StatusIcon status={stage.status} size="sm" />
                                <span className={`text-[12px] leading-snug ${
                                    stage.status === 'done' ? 'text-gray-500' : stage.status === 'active' ? 'text-blue-600 font-medium' : 'text-gray-300'
                                }`}>{stage.label}</span>
                            </div>
                            {stage.status === 'done' && stage.result && (
                                <div className="ml-5 mt-1 flex flex-wrap gap-2">
                                    {stage.result.map((r, j) => (
                                        <span key={j} className={`text-[10px] px-2 py-0.5 rounded-md bg-gray-50 ${r.color || 'text-gray-600'}`}>
                                            {r.label}: <b>{r.value}</b>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                    {d.decision && (
                        <div className="mt-2 bg-gray-50 rounded-xl px-4 py-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className={`text-[13px] font-bold ${d.decision.color}`}>{d.decision.verdict}</span>
                                <span className="text-[11px] text-gray-400">{d.decision.action}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full transition-all duration-700 ${d.decision.score > 60 ? 'bg-emerald-400' : d.decision.score > 40 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${d.decision.score}%` }} />
                            </div>
                            <div className="flex justify-between text-[10px] text-gray-400"><span>Score</span><span>{d.decision.score}/100</span></div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ── Simulation Module Renderer ──
    const SimulationModule: React.FC<{ mod: ThinkingModule }> = ({ mod }) => {
        const d = mod.data as SimulationModuleData | undefined;
        if (!d) return null;
        return (
            <div>
                <div className="flex items-center gap-2.5 mb-2">
                    <StatusIcon status={mod.status} />
                    <span className="text-[14px] font-bold text-gray-900">Simulating</span>
                </div>
                <div className="ml-7 space-y-2 mb-3">
                    {d.panelists.map((p, i) => {
                        const colors = ['bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700'];
                        const initials = p.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2);
                        return (
                        <div key={i} className="flex items-center gap-2.5">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${colors[i % colors.length]}`}>
                                {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-medium text-gray-700">{p.name}</span>
                                    {p.status === 'active' && <span className="text-[10px] text-blue-500 animate-pulse">analyzing...</span>}
                                </div>
                                {p.status === 'done' && p.verdict && (
                                    <span className={`text-[11px] ${p.verdict === 'Buy' ? 'text-emerald-600' : p.verdict === 'Sell' ? 'text-red-500' : 'text-yellow-600'}`}>
                                        {p.verdict} · {p.confidence}% confidence
                                    </span>
                                )}
                            </div>
                            <StatusIcon status={p.status} size="sm" />
                        </div>
                        );
                    })}
                    {d.prediction && (
                        <div className="mt-2 bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                            <span className="text-[11px] text-gray-500 font-medium">Prediction</span>
                            <span className={`text-[12px] font-bold ${d.prediction.verdict === 'Buy' ? 'text-emerald-600' : 'text-yellow-600'}`}>
                                {d.prediction.verdict} · {d.prediction.confidence}%
                            </span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ── Consensus Module Renderer ──
    const ConsensusModule: React.FC<{ mod: ThinkingModule }> = ({ mod }) => {
        const d = mod.data as ConsensusModuleData | undefined;
        if (!d) return null;
        const steps = ['Building consensus group', 'Discussion in progress', 'Reaching conclusion'];
        const stepIdx = d.status === 'concluded' ? 3 : d.status === 'discussing' ? 1 + (d.round > 1 ? 1 : 0) : 0;
        return (
            <div>
                <div className="flex items-center gap-2.5 mb-2">
                    <StatusIcon status={mod.status} />
                    <span className="text-[14px] font-bold text-gray-900">Consensus</span>
                </div>
                <div className="ml-7 space-y-1.5 mb-3">
                    {steps.map((label, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <StatusIcon status={stepIdx > i ? 'done' : stepIdx === i ? 'active' : 'pending'} size="sm" />
                            <span className={`text-[12px] ${stepIdx > i ? 'text-gray-500' : stepIdx === i ? 'text-blue-600 font-medium' : 'text-gray-300'}`}>
                                {label}{i === 1 && d.status === 'discussing' ? ` (Round ${d.round}/${d.maxRounds})` : ''}
                            </span>
                        </div>
                    ))}
                    {d.conclusion && (
                        <div className="mt-2 bg-gray-50 rounded-xl px-4 py-3 space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-gray-500 font-medium">Verdict</span>
                                <span className="text-[12px] font-bold text-emerald-600">{d.conclusion.verdict}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-gray-500 font-medium">Confidence</span>
                                <span className="text-[12px] font-semibold text-gray-700">{d.conclusion.confidence}%</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ── Done Module Renderer ──
    const DoneModule: React.FC<{ mod: ThinkingModule }> = ({ mod }) => {
        const dur = (mod.data as any)?.duration;
        return (
            <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2.5">
                    <StatusIcon status="done" />
                    <span className="text-[14px] font-bold text-gray-900">Done</span>
                    {dur && <span className="text-[11px] text-gray-400 ml-auto">{dur}s</span>}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                    <h2 className="text-[14px] font-bold text-gray-900">Thinking Process</h2>
                    {thinking.route && (
                        <span className="text-[11px] text-blue-500 font-medium mt-0.5 block">Agent: {thinking.route}</span>
                    )}
                </div>
                <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {thinking.modules.filter(m => m.type !== 'done' || m.status === 'completed').map((mod, i) => {
                    switch (mod.type) {
                        case 'search': return <SearchModule key={i} mod={mod} />;
                        case 'analysis': return <AnalysisModule key={i} mod={mod} />;
                        case 'simulation': return <SimulationModule key={i} mod={mod} />;
                        case 'consensus': return <ConsensusModule key={i} mod={mod} />;
                        case 'done': return <DoneModule key={i} mod={mod} />;
                        default: return null;
                    }
                })}
            </div>
        </div>
    );
};
// ─── Markdown-like renderer for AI responses ────────────────
const renderMarkdown = (text: string) => {
    if (!text) return null;
    // Simple markdown: bold, headers, lists
    const lines = text.split('\n');
    return lines.map((line, i) => {
        if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-bold text-gray-900 mt-4 mb-2">{line.slice(4)}</h3>;
        if (line.startsWith('## ')) return <h2 key={i} className="text-base font-bold text-gray-900 mt-5 mb-2">{line.slice(3)}</h2>;
        if (line.startsWith('# ')) return <h1 key={i} className="text-lg font-bold text-gray-900 mt-6 mb-3">{line.slice(2)}</h1>;
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="text-sm text-gray-700 leading-relaxed ml-4 list-disc">{line.slice(2)}</li>;
        if (line.match(/^\d+\.\s/)) return <li key={i} className="text-sm text-gray-700 leading-relaxed ml-4 list-decimal">{line.replace(/^\d+\.\s/, '')}</li>;
        if (line.trim() === '') return <br key={i} />;
        // Bold text
        const boldParsed = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        return <p key={i} className="text-sm text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: boldParsed }} />;
    });
};

// ═════════════════════════════════════════════════════════════
// SuperAgentChat — Main Component
// ═════════════════════════════════════════════════════════════
interface SuperAgentChatProps {
    initialMessage: string;
    onBack: () => void;
    agentCount?: number;
    selectedAgentId?: string;
}

const SuperAgentChat: React.FC<SuperAgentChatProps> = ({ initialMessage, onBack, agentCount = 2, selectedAgentId }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [thinkingProcesses, setThinkingProcesses] = useState<Record<number, ThinkingFlow>>({});
    const [sessionId] = useState(() => crypto.randomUUID());
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const hasSentInitial = useRef(false);
    // ─── Right Side Panel ─────────────────────────────────────
    const [showGraphPanel, setShowGraphPanel] = useState(false);
    const [showThinkingPanel, setShowThinkingPanel] = useState(false);
    const [activeGraphMsgIdx, setActiveGraphMsgIdx] = useState<number | null>(null);
    const [chatMode, setChatMode] = useState<'auto'|'fast'|'roundtable'>('auto');
    const [chatModeOpen, setChatModeOpen] = useState(false);
    const chatModeRef = useRef<HTMLDivElement>(null);
    const [chatSelectedAgent, setChatSelectedAgent] = useState<string | null>(selectedAgentId || null);
    const [agentPickerOpen, setAgentPickerOpen] = useState(false);
    const agentPickerRef = useRef<HTMLDivElement>(null);
    const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
    const voiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [chatPastedImages, setChatPastedImages] = useState<string[]>([]);
    const chatFileRef = useRef<HTMLInputElement>(null);

    const handleChatPaste = (e: React.ClipboardEvent) => {
        const items = Array.from(e.clipboardData.items);
        const imageItems = items.filter(it => it.type.startsWith('image/'));
        if (!imageItems.length) return;
        e.preventDefault();
        imageItems.forEach(item => {
            const file = item.getAsFile();
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                if (ev.target?.result) setChatPastedImages(prev => [...prev, ev.target!.result as string]);
            };
            reader.readAsDataURL(file);
        });
    };

    const handleChatFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = ev => {
                if (ev.target?.result) setChatPastedImages(prev => [...prev, ev.target!.result as string]);
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const MOCK_TRANSCRIPTIONS = [
        'What is the current risk profile of NVIDIA for Q2 2026?',
        'Compare Bitcoin and Ethereum momentum over the past 30 days',
        'Which AI infrastructure companies have the strongest moat?',
        'Show me the latest market sentiment analysis on Tesla',
        'Build me a diversified portfolio for a 3-year horizon',
    ];

    const stopRecording = () => {
        if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
        setVoiceState('transcribing');
        voiceTimerRef.current = setTimeout(() => {
            const t = MOCK_TRANSCRIPTIONS[Math.floor(Math.random() * MOCK_TRANSCRIPTIONS.length)];
            setInputText(t);
            setVoiceState('idle');
        }, 1800);
    };

    const handleVoiceClick = () => {
        if (voiceState === 'idle') {
            setVoiceState('recording');
            voiceTimerRef.current = setTimeout(stopRecording, 8000);
        } else if (voiceState === 'recording') {
            stopRecording();
        }
    };
    const [reactions, setReactions] = useState<Record<number, 'liked' | 'disliked' | null>>({});
    const [copied, setCopied] = useState<Record<number, boolean>>({});

    const handleCopy = (idx: number, content: string) => {
        navigator.clipboard.writeText(content).then(() => {
            setCopied(prev => ({ ...prev, [idx]: true }));
            setTimeout(() => setCopied(prev => ({ ...prev, [idx]: false })), 2000);
        });
    };

    const handleReaction = (idx: number, type: 'liked' | 'disliked') => {
        setReactions(prev => ({ ...prev, [idx]: prev[idx] === type ? null : type }));
    };

    // Chat title: condense to a short summary
    const chatTitle = useMemo(() => {
        const msg = initialMessage.trim();
        // Remove question marks and common filler words
        const cleaned = msg.replace(/[？?！!。，,]+$/g, '').trim();
        // If short enough, use as-is
        if (cleaned.length <= 20) return cleaned;
        // Try to extract a short topic: take first meaningful clause
        const clauseBreak = cleaned.search(/[，,、；;—]/);
        if (clauseBreak > 4 && clauseBreak <= 25) return cleaned.slice(0, clauseBreak);
        // For analysis/investment queries, extract the ticker/topic
        const tickerMatch = cleaned.match(/(?:分析|analyze|analysis|invest|research|研究)\s*(.{1,15})/i);
        if (tickerMatch) return `${tickerMatch[1].trim()} Analysis`;
        // Default: truncate intelligently
        const words = cleaned.split(/\s+/);
        if (words.length <= 4) return cleaned.length > 25 ? cleaned.slice(0, 22) + '…' : cleaned;
        return words.slice(0, 4).join(' ') + '…';
    }, [initialMessage]);

    useEffect(() => {
        if (!chatModeOpen) return;
        const h = (e: MouseEvent) => { if (chatModeRef.current && !chatModeRef.current.contains(e.target as Node)) setChatModeOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [chatModeOpen]);

    useEffect(() => {
        if (!agentPickerOpen) return;
        const h = (e: MouseEvent) => { if (agentPickerRef.current && !agentPickerRef.current.contains(e.target as Node)) setAgentPickerOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [agentPickerOpen]);

    const currentChatMode = CHAT_MODES.find(m => m.id === chatMode)!;

    // Auto-grow textarea
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }, [inputText]);

    const currentThinking = activeGraphMsgIdx !== null ? thinkingProcesses[activeGraphMsgIdx] : null;
    const currentQuery = activeGraphMsgIdx !== null ? messages.slice(0, activeGraphMsgIdx).reverse().find(m => m.role === 'user')?.content ?? '' : '';
    const currentKgData = currentThinking ? buildKnowledgeGraph() : null;

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, thinkingProcesses]);

    // ─── Simulate thinking process (modular) ──────────────────
    const simulateThinking = useCallback(async (msgIdx: number, userText: string) => {
        const t = userText.toLowerCase();
        const startTime = Date.now();
        // Intent routing
        const isSearch = /sentiment|看法|舆情|搜索|search|signal/i.test(t);
        const isDaily = /今天|行情|价格|today|daily|情况/i.test(t);
        const isAnalysis = /分析|analysis|analyze|深度|背景|建议|invest|调研|research|compare|对比/i.test(t);
        const isSimulation = /模拟|simulate|巴菲特|buffett|hedge|预测/i.test(t);
        const isRoundtable = chatMode === 'roundtable';
        const isGeneric = !isSearch && !isDaily && !isAnalysis && !isSimulation;

        // Determine route label
        const routeLabel = isSearch ? 'Signal Radar'
            : isDaily ? 'Daily Agent'
            : isAnalysis ? 'Investment Analyst'
            : isSimulation ? 'AI Hedge Fund'
            : 'Loka Agent';

        // Build modules list — ALL types get a thinking flow
        const modules: ThinkingModule[] = [];

        // Generic gets a simple search module to show something
        if (isGeneric) {
            modules.push({
                type: 'search', status: 'pending',
                data: {
                    variant: 'data_providers',
                    description: 'Preparing response...',
                    providers: ['Loka Knowledge Base', 'Platform Config', 'Agent Registry'].map(n => ({ name: n, status: 'pending' as const })),
                } as SearchModuleData,
            });
        }

        // Search module
        if (isSearch || isDaily || isAnalysis) {
            if (isAnalysis) {
                // Analysis uses combined mode: social + data providers
                modules.push({
                    type: 'search', status: 'pending',
                    data: {
                        variant: 'combined',
                        sections: [
                            {
                                id: 'social',
                                label: 'Searching social media',
                                status: 'pending',
                                sources: [],
                            },
                            {
                                id: 'data_providers',
                                label: 'Fetching market data',
                                status: 'pending',
                                providers: DATA_PROVIDERS_POOL.slice(0, 12 + Math.floor(Math.random() * 10)).map(n => ({ name: n, status: 'pending' as const })),
                            },
                        ],
                    } as SearchModuleData,
                });
            } else {
                // Signal Radar = social only, Daily = data_providers only
                modules.push({
                    type: 'search', status: 'pending',
                    data: {
                        variant: isDaily ? 'data_providers' : 'social',
                        description: isDaily
                            ? 'Connecting to market data providers and financial APIs'
                            : 'Searching for latest financial reports, analyst coverage, and market trends',
                        providers: isDaily
                            ? DATA_PROVIDERS_POOL.slice(0, 12 + Math.floor(Math.random() * 10)).map(n => ({ name: n, status: 'pending' as const }))
                            : undefined,
                        sources: [],
                    } as SearchModuleData,
                });
            }
        }

        // Analysis module — show ALL sub-modules for Investment Analyst
        if (isAnalysis) {
            modules.push({
                type: 'analysis', status: 'pending',
                data: {
                    stages: [
                        { id: 'fundamental', label: 'Fundamental analysis', status: 'pending' },
                        { id: 'technical', label: 'Technical analysis', status: 'pending' },
                        { id: 'sentiment', label: 'Sentiment analysis', status: 'pending' },
                        { id: 'decision', label: 'Decision engine', status: 'pending' },
                    ],
                } as AnalysisModuleData,
            });

            // Investment Analyst also runs a simulation panel
            const panelists = SIM_PANELISTS.slice(0, 4 + Math.floor(Math.random() * 2)).map(p => ({
                ...p, status: 'pending' as const,
            }));
            modules.push({
                type: 'simulation', status: 'pending',
                data: { panelists } as SimulationModuleData,
            });

            // And always runs consensus for analysis
            modules.push({
                type: 'consensus', status: 'pending',
                data: { round: 0, maxRounds: 3, status: 'building' } as ConsensusModuleData,
            });
        }

        // Simulation module (standalone, e.g. "模拟巴菲特")
        if (isSimulation && !isAnalysis) {
            // Simulation also needs data — add a search step if not already added
            if (!isSearch && !isDaily) {
                modules.push({
                    type: 'search', status: 'pending',
                    data: {
                        variant: 'data_providers',
                        description: 'Gathering market data for simulation panel',
                        providers: ['Yahoo Finance', 'Bloomberg API', 'Alpha Vantage', 'CoinGecko', 'Polygon.io', 'Finnhub', 'TradingView', 'Morningstar'].map(n => ({ name: n, status: 'pending' as const })),
                    } as SearchModuleData,
                });
            }
            const panelists = SIM_PANELISTS.slice(0, 4 + Math.floor(Math.random() * 2)).map(p => ({
                ...p, status: 'pending' as const,
            }));
            modules.push({
                type: 'simulation', status: 'pending',
                data: { panelists } as SimulationModuleData,
            });
        }

        // Consensus module (roundtable only, if not already added by analysis)
        if (isRoundtable && !isAnalysis) {
            modules.push({
                type: 'consensus', status: 'pending',
                data: { round: 0, maxRounds: 3, status: 'building' } as ConsensusModuleData,
            });
        }

        // Done module
        modules.push({ type: 'done', status: 'pending' });

        // Initialize flow
        setThinkingProcesses(prev => ({ ...prev, [msgIdx]: { modules, isActive: true, route: routeLabel } }));
        setActiveGraphMsgIdx(msgIdx);

        const updateModule = (idx: number, patch: Partial<ThinkingModule>) => {
            setThinkingProcesses(prev => {
                const flow = { ...prev[msgIdx] };
                const mods = [...flow.modules];
                mods[idx] = { ...mods[idx], ...patch };
                return { ...prev, [msgIdx]: { ...flow, modules: mods } };
            });
        };

        const updateModuleData = (idx: number, dataPatch: any) => {
            setThinkingProcesses(prev => {
                const flow = { ...prev[msgIdx] };
                const mods = [...flow.modules];
                mods[idx] = { ...mods[idx], data: { ...mods[idx].data, ...dataPatch } };
                return { ...prev, [msgIdx]: { ...flow, modules: mods } };
            });
        };

        // Animate each module sequentially
        for (let mi = 0; mi < modules.length; mi++) {
            const mod = modules[mi];
            if (mod.type === 'done') break;

            updateModule(mi, { status: 'active' });

            if (mod.type === 'search') {
                const sd = mod.data as SearchModuleData;
                if (sd.variant === 'combined' && sd.sections) {
                    // Combined: animate social section first, then data providers section
                    const socialSec = sd.sections.find(s => s.id === 'social');
                    const dataSec = sd.sections.find(s => s.id === 'data_providers');

                    // --- Social sub-section ---
                    if (socialSec) {
                        // Set social section to active
                        setThinkingProcesses(prev => {
                            const flow = { ...prev[msgIdx] };
                            const mods = [...flow.modules];
                            const data = { ...(mods[mi].data as SearchModuleData) };
                            const sections = (data.sections || []).map(s =>
                                s.id === 'social' ? { ...s, status: 'active' as const } : s
                            );
                            mods[mi] = { ...mods[mi], data: { ...data, sections } };
                            return { ...prev, [msgIdx]: { ...flow, modules: mods } };
                        });
                        await new Promise(r => setTimeout(r, 600));

                        // Add social sources progressively
                        const webSources = [...WEB_SOURCES_POOL].sort(() => Math.random() - 0.5).slice(0, 4);
                        const socialSources = [...SOCIAL_SOURCES_POOL].sort(() => Math.random() - 0.5).slice(0, 4);
                        const allSocialSources = [...webSources, ...socialSources];
                        for (let si = 0; si < allSocialSources.length; si++) {
                            await new Promise(r => setTimeout(r, 100 + Math.random() * 150));
                            const visibleSources = allSocialSources.slice(0, si + 1);
                            setThinkingProcesses(prev => {
                                const flow = { ...prev[msgIdx] };
                                const mods = [...flow.modules];
                                const data = { ...(mods[mi].data as SearchModuleData) };
                                const sections = (data.sections || []).map(s =>
                                    s.id === 'social' ? { ...s, sources: visibleSources, totalFound: visibleSources.length } : s
                                );
                                mods[mi] = { ...mods[mi], data: { ...data, sections } };
                                return { ...prev, [msgIdx]: { ...flow, modules: mods } };
                            });
                        }
                        // Mark social done
                        setThinkingProcesses(prev => {
                            const flow = { ...prev[msgIdx] };
                            const mods = [...flow.modules];
                            const data = { ...(mods[mi].data as SearchModuleData) };
                            const sections = (data.sections || []).map(s =>
                                s.id === 'social' ? { ...s, status: 'done' as const } : s
                            );
                            mods[mi] = { ...mods[mi], data: { ...data, sections } };
                            return { ...prev, [msgIdx]: { ...flow, modules: mods } };
                        });
                    }

                    // --- Data providers sub-section ---
                    if (dataSec && dataSec.providers) {
                        // Set data section to active
                        setThinkingProcesses(prev => {
                            const flow = { ...prev[msgIdx] };
                            const mods = [...flow.modules];
                            const data = { ...(mods[mi].data as SearchModuleData) };
                            const sections = (data.sections || []).map(s =>
                                s.id === 'data_providers' ? { ...s, status: 'active' as const } : s
                            );
                            mods[mi] = { ...mods[mi], data: { ...data, sections } };
                            return { ...prev, [msgIdx]: { ...flow, modules: mods } };
                        });
                        await new Promise(r => setTimeout(r, 300));

                        // Animate each provider pill
                        const providers = dataSec.providers;
                        for (let pi = 0; pi < providers.length; pi++) {
                            await new Promise(r => setTimeout(r, 80 + Math.random() * 120));
                            setThinkingProcesses(prev => {
                                const flow = { ...prev[msgIdx] };
                                const mods = [...flow.modules];
                                const data = { ...(mods[mi].data as SearchModuleData) };
                                const sections = (data.sections || []).map(s => {
                                    if (s.id !== 'data_providers') return s;
                                    const ps = [...(s.providers || [])];
                                    if (pi > 0) ps[pi - 1] = { ...ps[pi - 1], status: 'done' };
                                    ps[pi] = { ...ps[pi], status: 'active' };
                                    return { ...s, providers: ps };
                                });
                                mods[mi] = { ...mods[mi], data: { ...data, sections } };
                                return { ...prev, [msgIdx]: { ...flow, modules: mods } };
                            });
                        }
                        // Complete all providers and mark data section done
                        setThinkingProcesses(prev => {
                            const flow = { ...prev[msgIdx] };
                            const mods = [...flow.modules];
                            const data = { ...(mods[mi].data as SearchModuleData) };
                            const sections = (data.sections || []).map(s => {
                                if (s.id !== 'data_providers') return s;
                                const ps = (s.providers || []).map(p => ({ ...p, status: 'done' as const }));
                                return { ...s, status: 'done' as const, providers: ps };
                            });
                            mods[mi] = { ...mods[mi], data: { ...data, sections } };
                            return { ...prev, [msgIdx]: { ...flow, modules: mods } };
                        });
                    }
                } else if (sd.variant === 'data_providers' && sd.providers) {
                    // Animate providers connecting
                    for (let pi = 0; pi < sd.providers.length; pi++) {
                        await new Promise(r => setTimeout(r, 80 + Math.random() * 120));
                        setThinkingProcesses(prev => {
                            const flow = { ...prev[msgIdx] };
                            const mods = [...flow.modules];
                            const data = { ...(mods[mi].data as SearchModuleData) };
                            const providers = [...(data.providers || [])];
                            if (pi > 0) providers[pi - 1] = { ...providers[pi - 1], status: 'done' };
                            providers[pi] = { ...providers[pi], status: 'active' };
                            mods[mi] = { ...mods[mi], data: { ...data, providers } };
                            return { ...prev, [msgIdx]: { ...flow, modules: mods } };
                        });
                    }
                    // Complete all providers
                    setThinkingProcesses(prev => {
                        const flow = { ...prev[msgIdx] };
                        const mods = [...flow.modules];
                        const data = { ...(mods[mi].data as SearchModuleData) };
                        const providers = (data.providers || []).map(p => ({ ...p, status: 'done' as const }));
                        mods[mi] = { ...mods[mi], data: { ...data, providers, totalFound: providers.length } };
                        return { ...prev, [msgIdx]: { ...flow, modules: mods } };
                    });
                } else {
                    // Social search: web then social sources
                    await new Promise(r => setTimeout(r, 800));
                    const webSources = [...WEB_SOURCES_POOL].sort(() => Math.random() - 0.5).slice(0, 5);
                    updateModuleData(mi, { sources: webSources, description: 'Searching for latest financial reports, analyst coverage, and market trends' });
                    await new Promise(r => setTimeout(r, 1000));
                    const socialSources = [...SOCIAL_SOURCES_POOL].sort(() => Math.random() - 0.5).slice(0, 5);
                    updateModuleData(mi, { sources: [...webSources, ...socialSources], totalFound: webSources.length + socialSources.length });
                }
                updateModule(mi, { status: 'completed' });
            }

            if (mod.type === 'analysis') {
                const stages = (mod.data as AnalysisModuleData).stages;
                const stageResults = [
                    [{ label: 'PE', value: '24.5x', color: 'text-emerald-600' }, { label: 'Revenue Growth', value: '+28%', color: 'text-emerald-600' }],
                    [{ label: 'MA排列', value: '弱势多头', color: 'text-yellow-600' }, { label: 'Support', value: '175.76' }],
                    [{ label: 'Sentiment', value: 'Mixed', color: 'text-yellow-600' }, { label: 'Sources', value: '12 articles' }],
                    [],
                ];
                for (let si = 0; si < stages.length; si++) {
                    await new Promise(r => setTimeout(r, 600 + Math.random() * 800));
                    setThinkingProcesses(prev => {
                        const flow = { ...prev[msgIdx] };
                        const mods = [...flow.modules];
                        const data = { ...(mods[mi].data as AnalysisModuleData) };
                        const newStages = [...data.stages];
                        if (si > 0) newStages[si - 1] = { ...newStages[si - 1], status: 'done', result: stageResults[si - 1] };
                        newStages[si] = { ...newStages[si], status: 'active' };
                        mods[mi] = { ...mods[mi], data: { ...data, stages: newStages } };
                        return { ...prev, [msgIdx]: { ...flow, modules: mods } };
                    });
                }
                await new Promise(r => setTimeout(r, 800));
                // Complete with decision
                setThinkingProcesses(prev => {
                    const flow = { ...prev[msgIdx] };
                    const mods = [...flow.modules];
                    const data = { ...(mods[mi].data as AnalysisModuleData) };
                    const newStages = data.stages.map((s, i) => ({ ...s, status: 'done' as const, result: stageResults[i] }));
                    const decision = { verdict: '🟡 Hold · Moderate', score: 55, color: 'text-yellow-600', action: 'Wait for confirmation' };
                    mods[mi] = { ...mods[mi], status: 'completed', data: { ...data, stages: newStages, decision } };
                    return { ...prev, [msgIdx]: { ...flow, modules: mods } };
                });
            }

            if (mod.type === 'simulation') {
                const panelists = (mod.data as SimulationModuleData).panelists;
                const verdicts = ['Buy', 'Hold', 'Buy', 'Sell', 'Hold', 'Buy'];
                for (let pi = 0; pi < panelists.length; pi++) {
                    await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
                    setThinkingProcesses(prev => {
                        const flow = { ...prev[msgIdx] };
                        const mods = [...flow.modules];
                        const data = { ...(mods[mi].data as SimulationModuleData) };
                        const newPanelists = [...data.panelists];
                        if (pi > 0) newPanelists[pi - 1] = { ...newPanelists[pi - 1], status: 'done', verdict: verdicts[pi - 1], confidence: 60 + Math.floor(Math.random() * 30) };
                        newPanelists[pi] = { ...newPanelists[pi], status: 'active' };
                        mods[mi] = { ...mods[mi], data: { ...data, panelists: newPanelists } };
                        return { ...prev, [msgIdx]: { ...flow, modules: mods } };
                    });
                }
                await new Promise(r => setTimeout(r, 500));
                setThinkingProcesses(prev => {
                    const flow = { ...prev[msgIdx] };
                    const mods = [...flow.modules];
                    const data = { ...(mods[mi].data as SimulationModuleData) };
                    const newPanelists = data.panelists.map((p, i) => ({ ...p, status: 'done' as const, verdict: verdicts[i], confidence: 60 + Math.floor(Math.random() * 30) }));
                    mods[mi] = { ...mods[mi], status: 'completed', data: { ...data, panelists: newPanelists, prediction: { verdict: 'Buy', confidence: 74 } } };
                    return { ...prev, [msgIdx]: { ...flow, modules: mods } };
                });
            }

            if (mod.type === 'consensus') {
                updateModuleData(mi, { status: 'building', round: 0 });
                await new Promise(r => setTimeout(r, 800));
                for (let round = 1; round <= 3; round++) {
                    updateModuleData(mi, { status: 'discussing', round });
                    await new Promise(r => setTimeout(r, 1000));
                }
                updateModuleData(mi, { status: 'concluded', conclusion: { verdict: '↑ Low Risk', confidence: 78 } });
                updateModule(mi, { status: 'completed' });
            }

            if (mod.type !== 'consensus') updateModule(mi, { status: 'completed' });
        }

        // Done
        const duration = Math.round((Date.now() - startTime) / 1000);
        const doneIdx = modules.length - 1;
        updateModule(doneIdx, { status: 'completed', data: { duration } });
        setThinkingProcesses(prev => ({ ...prev, [msgIdx]: { ...prev[msgIdx], isActive: false } }));
    }, [chatMode]);

    // ─── Mock response generator ──────────────────────────
    const getMockResponse = (text: string): string => {
        const t = text.toLowerCase();
        if (/sentiment|看法|舆情|signal/i.test(t)) {
            return `## Market Sentiment Analysis

Based on analysis across Reddit, X/Twitter, YouTube, and financial news:

**Overall Sentiment: Moderately Bullish** (Score: 68/100)

- **Social Media Pulse**: Strong positive momentum on X with 73% bullish mentions in the past 24h
- **Reddit Discussion**: r/wallstreetbets trending with 2.4k upvotes on bullish DD posts
- **News Coverage**: 8 out of 12 recent articles carry positive outlook, citing strong Q4 earnings
- **Institutional Flow**: Net inflows of $340M detected across major ETFs this week

**Key Signals Detected:**
1. Unusual options activity — heavy call buying at $200 strike (expiry next month)
2. Short interest down 18% week-over-week
3. Analyst upgrades: 3 new "Buy" ratings in the past 5 days

**Risk Factors:**
- Macro uncertainty: Fed rate decision pending next week
- Sector rotation risk: Tech valuations stretched vs historical averages

**Recommendation:** Monitor closely. Positive momentum is building, but wait for Fed clarity before increasing exposure.`;
        }
        if (/今天|行情|价格|today|daily|情况/i.test(t)) {
            return `## Daily Market Brief

**As of ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}**

| Metric | Value | Change |
|--------|-------|--------|
| Price | $187.42 | +2.3% |
| Volume | 48.2M | +15% vs avg |
| Market Cap | $2.87T | — |
| P/E Ratio | 24.5x | — |
| 52w Range | $124.60 – $198.23 | Near high |

**Today's Highlights:**
1. Opened strong following positive pre-market sentiment from Asia
2. Volume surging above 20-day average — institutional interest confirmed
3. Key resistance at $190 being tested; breakout could target $205

**Technical Setup:**
- RSI: 62 (neutral-bullish)
- MACD: Bullish crossover confirmed 2 days ago
- Moving Averages: Price above 50-day and 200-day MA — bullish structure intact

**Data Sources:** Yahoo Finance, Bloomberg, Alpha Vantage, Polygon.io`;
        }
        if (/模拟|simulate|巴菲特|buffett|hedge/i.test(t)) {
            return `## AI Hedge Fund Simulation Results

**Simulation Panel:** 5 legendary investors analyzed this opportunity

| Investor | Verdict | Confidence | Key Reasoning |
|----------|---------|------------|---------------|
| Warren Buffett | **Buy** | 82% | Strong moat, durable competitive advantage, fair valuation |
| Charlie Munger | **Buy** | 76% | Quality business at a reasonable price, excellent management |
| Ray Dalio | **Hold** | 61% | Macro headwinds could create short-term pressure |
| Cathie Wood | **Buy** | 88% | Massive AI/tech tailwind, 5-year compounding story |
| Peter Lynch | **Buy** | 79% | Growth at reasonable price, strong earnings trajectory |

**Consensus: Buy** (Confidence: 77.2%)

**Simulated Portfolio Action:**
- Allocate 8-12% of portfolio
- Entry zone: $180-188
- Target: $225 (12-month)
- Stop loss: $165 (-12%)

**Monte Carlo Simulation (10,000 runs):**
- Median 12-month return: +18.4%
- 90th percentile: +34.2%
- 10th percentile: -8.7%
- Probability of positive return: 74.3%`;
        }
        if (/分析|analysis|analyze|深度|背景|建议|invest|调研|research/i.test(t)) {
            return `## Investment Analysis Report

### Executive Summary
**Verdict: Moderately Bullish** | Confidence: 72% | Risk Level: Medium

### Fundamental Analysis
- **Revenue Growth:** +28% YoY ($35.4B TTM), accelerating for 3 consecutive quarters
- **Gross Margin:** 74.2%, expanding due to AI product mix shift
- **Free Cash Flow:** $12.8B TTM, providing strong reinvestment capacity
- **Debt/Equity:** 0.41x — conservative leverage, well within comfort zone

### Technical Analysis
- **Trend:** Uptrend confirmed (price above 50/200 MA)
- **Support Levels:** $175.76 (strong), $162.30 (secondary)
- **Resistance:** $198.23 (52-week high), $210 (psychological)
- **RSI:** 62 — room to run before overbought
- **Volume Profile:** Accumulation pattern over past 3 weeks

### Sentiment Analysis
- **News Sentiment:** +0.67 (positive bias across 47 articles analyzed)
- **Social Score:** 78/100 (Reddit, X, StockTwits aggregated)
- **Insider Activity:** 2 executive purchases in past 30 days, no sales
- **Institutional Ownership:** Up 2.3% QoQ

### Risk Assessment
| Risk Factor | Level | Mitigation |
|-------------|-------|-----------|
| Valuation stretch | Medium | DCF suggests 15% upside at current multiples |
| Macro sensitivity | Medium | Diversified revenue base provides cushion |
| Competition | Low | Strong moat with 3-year technology lead |
| Regulatory | Low | No pending actions or investigations |

### Decision
**Action: Accumulate on dips** — Strong fundamentals support continued upside. Technical setup favors buyers. Enter in $180-188 range with 6-month horizon.`;
        }
        // Generic / greeting
        return `Hello! I'm Loka Super Agent — your AI-powered research and analysis assistant.

Here's what I can help you with:

**Investment Analysis** — Deep-dive into any stock, crypto, or market
- "Analyze NVIDIA's investment potential"
- "What's the market sentiment on Bitcoin?"

**Market Research** — Industry reports and trend analysis
- "Research the Southeast Asian food delivery market"
- "Compare Figma vs Sketch strengths and weaknesses"

**Simulation** — AI hedge fund style predictions
- "Simulate Warren Buffett analyzing Tesla"
- "Run a prediction market simulation on AI stocks"

Try asking me something specific, and I'll assemble the right team of AI agents to deliver a structured report.`;
    };

    // ─── Send to AI (mock streaming) ────────────────────────
    const sendToAI = useCallback(async (text: string, existingMessages?: Message[]) => {
        setIsStreaming(true);

        const currentMessages = existingMessages ?? [];
        const msgIdx = currentMessages.length;

        setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date().toLocaleTimeString(), isStreaming: true }]);
        
        // Open thinking process panel automatically
        setActiveGraphMsgIdx(msgIdx);
        setShowThinkingPanel(true);
        setShowGraphPanel(false);

        // Run thinking simulation (visual effect)
        await simulateThinking(msgIdx, text);

        // Simulate streaming the mock response
        const mockContent = getMockResponse(text);
        const words = mockContent.split(' ');
        let accumulated = '';

        for (let i = 0; i < words.length; i++) {
            accumulated += (i === 0 ? '' : ' ') + words[i];
            const snapshot = accumulated;
            setMessages(prev => {
                const updated = [...prev];
                updated[msgIdx] = { ...updated[msgIdx], content: snapshot };
                return updated;
            });
            // Variable speed: faster for common words, slight pause on punctuation
            const delay = /[.!?\n]$/.test(words[i]) ? 30 : 8;
            await new Promise(r => setTimeout(r, delay));
        }

        setMessages(prev => {
            const updated = [...prev];
            updated[msgIdx] = { ...updated[msgIdx], isStreaming: false, timestamp: new Date().toLocaleTimeString() };
            return updated;
        });

        setIsStreaming(false);
    }, [simulateThinking]);

    // ─── Auto-send initial message ──────────────────────────
    useEffect(() => {
        if (hasSentInitial.current) return;
        hasSentInitial.current = true;
        const userMsg: Message = { role: 'user', content: initialMessage, timestamp: new Date().toLocaleTimeString() };
        const initialMessages = [userMsg];
        setMessages(initialMessages);
        // Pass the current messages array directly to avoid stale closure
        setTimeout(() => sendToAI(initialMessage, initialMessages), 50);
    }, [initialMessage, sendToAI]);

    // ─── Handle send ────────────────────────────────────────
    const handleSend = () => {
        if (!inputText.trim() || isStreaming) return;
        const text = inputText.trim();
        const userMsg: Message = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString() };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInputText('');
        sendToAI(text, newMessages);
    };

    return (
        <div className="flex flex-col h-full bg-white overflow-hidden">
            <style>{`
                @keyframes voice-bar { 0%,100%{height:3px} 50%{height:10px} }
                .voice-bar { min-height: 3px; display:inline-block; border-radius:9999px; background:#9ca3af; }
            `}</style>
            {/* ══ Header: chat title + graph toggle ══ */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                <h1 className="text-[13px] font-semibold text-gray-800 truncate max-w-[60%]">{chatTitle}</h1>
                <button
                    onClick={() => setShowGraphPanel(p => !p)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                        showGraphPanel ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                    }`}
                >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="5" r="2.5" /><circle cx="19" cy="19" r="2.5" />
                        <path d="M7.5 11L16.5 6M7.5 13L16.5 18" />
                    </svg>
                    Multi-Agent Graph
                </button>
            </div>

            {/* ══ Content Row ══ */}
            <div className="flex flex-1 overflow-hidden">
                {/* Chat column */}
                <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-4 md:px-10 py-8">
                        <div className="max-w-2xl mx-auto space-y-8">
                            {messages.map((msg, i) => (
                                <div key={i}>
                                    {msg.role === 'user' ? (
                                        <div className="flex justify-end">
                                            <div className="max-w-[72%] px-4 py-3 bg-gray-900 text-white rounded-2xl rounded-br-sm shadow-sm">
                                                <p className="text-[13px] leading-relaxed">{msg.content}</p>
                                                <p className="text-[9px] text-gray-500 mt-1.5 text-right">{msg.timestamp}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-start gap-3">
                                            <div className="w-7 h-7 rounded-xl bg-gray-900 flex items-center justify-center text-white text-[10px] font-black shrink-0 mt-0.5">L</div>
                                            <div className="flex-1 min-w-0">
                                                {thinkingProcesses[i] && (
                                                    <ThinkingInlineTrigger
                                                        thinking={thinkingProcesses[i]}
                                                        onOpen={() => {
                                                            setActiveGraphMsgIdx(i);
                                                            setShowThinkingPanel(true);
                                                            setShowGraphPanel(false);
                                                        }}
                                                    />
                                                )}
                                                {msg.content ? (
                                                    <div className="text-[13px] text-gray-700 leading-relaxed space-y-1">
                                                        {renderMarkdown(msg.content)}
                                                    </div>
                                                ) : msg.isStreaming ? (
                                                    <div className="flex items-center gap-1 py-1">
                                                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
                                                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
                                                    </div>
                                                ) : null}
                                                {!msg.isStreaming && msg.content && (
                                                    <div className="flex items-center gap-0.5 mt-3">
                                                        {/* Copy */}
                                                        <button
                                                            onClick={() => handleCopy(i, msg.content)}
                                                            title="Copy markdown"
                                                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-all"
                                                        >
                                                            {copied[i] ? (
                                                                <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                            ) : (
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" strokeWidth={2} /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth={2} /></svg>
                                                            )}
                                                        </button>
                                                        {/* Like */}
                                                        <button
                                                            onClick={() => handleReaction(i, 'liked')}
                                                            title="Like"
                                                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                                                                reactions[i] === 'liked' ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
                                                            }`}
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill={reactions[i] === 'liked' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" /><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" /></svg>
                                                        </button>
                                                        {/* Dislike */}
                                                        <button
                                                            onClick={() => handleReaction(i, 'disliked')}
                                                            title="Dislike"
                                                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                                                                reactions[i] === 'disliked' ? 'text-red-400 bg-red-50' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
                                                            }`}
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill={reactions[i] === 'disliked' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z" /><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17" /></svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    {/* Input */}
                    <div className="shrink-0 pt-2 pb-8 px-4 md:px-8 bg-gradient-to-t from-white via-white to-transparent">
                        <div className="max-w-3xl mx-auto">
                            <div className="bg-white border border-gray-200 rounded-2xl relative" style={{ boxShadow: '0 2px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)' }}>
                                {/* Voice overlay: Recording */}
                                {voiceState === 'recording' && (
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
                                                    <span key={i} className="voice-bar w-[3px]" style={{ animationName: 'voice-bar', animationDuration: dur, animationDelay: delay, animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite' }} />
                                                ))}
                                            </div>
                                            <button
                                                onClick={stopRecording}
                                                className="ml-0.5 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {/* Voice overlay: Transcribing */}
                                {voiceState === 'transcribing' && (
                                    <div className="absolute inset-x-0 top-0 bottom-[52px] flex items-center justify-center">
                                        <div className="flex items-center bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm">
                                            <span className="text-[13px] text-gray-500 font-medium">Thinking…</span>
                                        </div>
                                    </div>
                                )}
                                {/* Hidden file input */}
                                <input ref={chatFileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleChatFileChange} />
                                {/* Image preview strip */}
                                {chatPastedImages.length > 0 && voiceState === 'idle' && (
                                    <div className="flex items-center gap-2 px-4 pt-3 flex-wrap">
                                        {chatPastedImages.map((src, idx) => (
                                            <div key={idx} className="relative group shrink-0">
                                                <img src={src} alt="" className="w-12 h-12 rounded-xl object-cover border border-gray-200 shadow-sm" />
                                                <button
                                                    onClick={() => setChatPastedImages(prev => prev.filter((_, i) => i !== idx))}
                                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                                                >
                                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <textarea
                                    ref={textareaRef}
                                    rows={1}
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    onPaste={handleChatPaste}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                    placeholder={voiceState !== 'idle' ? '' : 'Ask a follow-up question...'}
                                    disabled={isStreaming || voiceState !== 'idle'}
                                    className="w-full bg-transparent outline-none resize-none text-[14px] text-gray-900 placeholder:text-gray-400 px-4 pt-4 pb-2 leading-relaxed overflow-y-auto"
                                    style={{ minHeight: '56px', maxHeight: '200px', visibility: voiceState !== 'idle' ? 'hidden' : 'visible' }}
                                />
                                <div className="flex items-center justify-between px-3 pb-3">
                                    {/* Left: mode selector + agent selector */}
                                    <div className="flex items-center gap-1">
                                        <div className="relative" ref={chatModeRef}>
                                            <button
                                                onClick={() => setChatModeOpen(v => !v)}
                                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-gray-500 hover:bg-gray-100 transition-all"
                                            >
                                                {React.createElement(currentChatMode.icon)}
                                                {currentChatMode.label}
                                                <ChatChevron />
                                            </button>
                                            {chatModeOpen && (
                                                <div className="absolute bottom-full left-0 mb-1.5 w-64 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden z-30" style={{ animation: 'menu-pop 0.15s ease-out' }}>
                                                    {CHAT_MODES.map(m => {
                                                        const MIcon = m.icon;
                                                        const isActive = chatMode === m.id;
                                                        return (
                                                            <button
                                                                key={m.id}
                                                                onClick={() => { setChatMode(m.id); setChatModeOpen(false); }}
                                                                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${isActive ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                                                            >
                                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                                                    <MIcon />
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <p className={`text-[12px] font-semibold ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>{m.label}</p>
                                                                    <p className="text-[10px] text-gray-400 leading-tight">{m.desc}</p>
                                                                </div>
                                                                {isActive && (
                                                                    <svg className="w-3.5 h-3.5 text-gray-900 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                    {/* Right: action buttons */}
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => chatFileRef.current?.click()} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all" title="Attach file">
                                            <InputIcons.Attach />
                                        </button>
                                        <button
                                            onClick={handleVoiceClick}
                                            title={voiceState === 'recording' ? 'Stop recording' : 'Voice input'}
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                                voiceState === 'recording'
                                                    ? 'text-red-500 bg-red-50 hover:bg-red-100'
                                                    : voiceState === 'transcribing'
                                                    ? 'text-gray-300 cursor-not-allowed'
                                                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                            }`}
                                            disabled={voiceState === 'transcribing'}
                                        >
                                            {voiceState === 'recording' ? (
                                                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                                            ) : (
                                                <InputIcons.Mic />
                                            )}
                                        </button>
                                        <button
                                            onClick={handleSend}
                                            disabled={!inputText.trim() || isStreaming}
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${inputText.trim() && !isStreaming ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Thinking Process Side Panel */}
                {showThinkingPanel && currentThinking && (
                    <div className="w-[360px] shrink-0 border-l border-gray-100 overflow-hidden">
                        <ThinkingProcessSidePanel
                            thinking={currentThinking}
                            onClose={() => setShowThinkingPanel(false)}
                        />
                    </div>
                )}

                {/* Knowledge Graph Card */}
                {showGraphPanel && !showThinkingPanel && currentKgData && (
                    <div className="w-[400px] shrink-0 border-l border-gray-100 overflow-hidden relative">
                        <button
                            onClick={() => setShowGraphPanel(false)}
                            className="absolute top-2 right-2 z-20 w-7 h-7 rounded-lg bg-white/80 backdrop-blur border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all shadow-sm"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        <KnowledgeGraphView data={currentKgData} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default SuperAgentChat;
