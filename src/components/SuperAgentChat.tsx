/**
 * SuperAgentChat — Chat Detail Page
 * Clean chat interface similar to Surf style, with multi-agent thinking process
 */
import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import * as d3 from 'd3';
import { socket } from '../services/socket';
import { api } from '../services/api';
import { renderMarkdownContent, extractQuoteSnapshot, QuoteCard, OkxQuoteDerivatives, OkxQuoteNews, extractHeadings, SourcesProvider } from '../utils/markdown';
import { stripInternalResearchCitations } from '../utils/researchCitations';
import { IFlytekStreamer } from '../services/iflytek';
import { MAX_IMAGES_PER_MESSAGE, prepareImageForUpload } from '../utils/imageCompression';

function saLog(...args: unknown[]) {
    console.log('[SuperAgentChat]', ...args);
}

/** Space above the bottom of the chat column reserved for the floating input bar (padding + field + controls). TOC must stay above this. */
const TOC_BOTTOM_RESERVE_PX = 148;

/** Minimum TOC panel height so the list isn’t collapsed to ~3 rows before layout stabilizes */
const TOC_MIN_VIEWPORT_PX = 220;

/** Standard sticky offset for the left TOC rail. */
const TOC_STICKY_TOP_PX = 24;

// ─── Types and Interfaces ────────────────────────────────────

const InputIcons = {
    Attach: () => <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>,
    Mic: () => <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>,
    Image: () => <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
};


const ChatChevron = () => <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>;

// ── HTML Report Frame (Web output mode) ──
const HtmlReportFrame: React.FC<{ html: string; isStreaming: boolean }> = ({ html, isStreaming }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [iframeHeight, setIframeHeight] = useState(400);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        // Strip any markdown code fences the LLM might have wrapped around
        const cleanHtml = html.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
        const fullDoc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root { --color-text-primary: #1a1a1a; --color-text-secondary: #666; --color-text-tertiary: #999; --color-background-secondary: #f5f5f5; --color-border-tertiary: #e5e5e5; --border-radius-md: 8px; --border-radius-lg: 12px; --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-sans); color: var(--color-text-primary); background: white; line-height: 1.6; }
ul, ol { padding-left: 1.2em; margin: 0.5rem 0; text-align: left; }
li { margin-bottom: 4px; }
</style>
</head><body>${cleanHtml}
<script>
  function sendHeight() {
    var h = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'loka-iframe-height', height: h }, '*');
  }
  sendHeight();
  new MutationObserver(sendHeight).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('load', function() { setTimeout(sendHeight, 300); });
</` + `script>
</body></html>`;
        iframe.srcdoc = fullDoc;
    }, [html]);

    useEffect(() => {
        const handler = (e: MessageEvent) => {
            if (e.data?.type === 'loka-iframe-height' && typeof e.data.height === 'number') {
                setIframeHeight(Math.min(e.data.height + 4, 5000));
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    return (
        <div className="relative w-full">
            {isStreaming && (
                <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-white/80 backdrop-blur-sm rounded-lg border border-gray-200/60 shadow-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-[11px] text-gray-500 font-medium">Rendering...</span>
                </div>
            )}
            <iframe
                ref={iframeRef}
                sandbox="allow-scripts"
                className="w-full border-0 rounded-xl overflow-hidden"
                style={{ height: iframeHeight, transition: 'height 0.3s ease' }}
                title="Research Report"
            />
        </div>
    );
};

const CHAT_MODES = [
    { id: 'auto' as const, label: 'Auto', desc: 'Smart auto-routing to the optimal pipeline', icon: () => <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" /></svg> },
    { id: 'fast' as const, label: 'Fast', desc: 'Direct response, minimal orchestration', icon: () => <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg> },
    { id: 'roundtable' as const, label: 'Roundtable', desc: 'Multi-agent debate with iterative consensus', icon: () => <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M14 5.5a7.5 7.5 0 014.5 12" /><path d="M17 19.5H7" /><path d="M5.5 17A7.5 7.5 0 0110 5.5" /></svg> },
];

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    isStreaming?: boolean;
    images?: ChatImagePayload[];
    /** From DB; used to restore Thinking Process when reopening a session */
    metadata?: string | null;
    /** Verified source URLs extracted from research data */
    sources?: SearchSource[];
}

interface ChatImagePayload {
    url: string;
    mime?: string;
    name?: string;
}

interface PendingChatImage extends ChatImagePayload {
    id: string;
    previewUrl: string;
    status: 'uploading' | 'uploaded' | 'error';
}

function parseUserImagesFromMetadata(metadata?: string | null): ChatImagePayload[] {
    if (!metadata) return [];
    try {
        const parsed = JSON.parse(metadata) as { images?: ChatImagePayload[]; archivedImages?: ChatImagePayload[] };
        const raw = Array.isArray(parsed?.images) && parsed.images.length > 0
            ? parsed.images
            : (Array.isArray(parsed?.archivedImages) ? parsed.archivedImages : []);
        return raw
            .map(img => ({
                url: typeof img?.url === 'string' ? img.url.trim() : '',
                mime: typeof img?.mime === 'string' ? img.mime : undefined,
                name: typeof img?.name === 'string' ? img.name : undefined,
            }))
            .filter(img => img.url.length > 0);
    } catch {
        return [];
    }
}

interface SearchSource {
    favicon: string;
    title: string;
    domain: string;
    url?: string;
    snippet?: string;
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
    group?: 'guru' | 'analyst';
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

// ─── Roundtable Process: 4-phase flow data ──────────────────
interface RtDataCategory {
    id: string;
    label: string;
    labelCN: string;
    icon: string;
    status: 'pending' | 'active' | 'done';
    count?: number;
    items?: string[];
    sources?: { title: string; domain: string; favicon?: string; url?: string }[];
}

interface RtAgentInference {
    agentId: string;
    agentName: string;
    status: 'pending' | 'active' | 'done';
    verdict?: string;          // Buy / Sell / Hold
    confidence?: number;       // 0-100
    reasoning?: string;        // brief summary
    changedMind?: boolean;     // did agent change conclusion in round 2
    previousVerdict?: string;  // what they said in round 1
    crossReferences?: string[]; // which agents they evaluated
}

interface RtRoundData {
    round: number;
    status: 'pending' | 'active' | 'done';
    agents: RtAgentInference[];
    description?: string;
    descriptionCN?: string;
}

interface RtConsensusResult {
    status: 'pending' | 'active' | 'done';
    hasConsensus: boolean;
    conflictRate?: number;      // 0-100 percentage of disagreement
    agentConclusions: { agentName: string; verdict: string; confidence: number }[];
    finalVerdict?: string;
    finalConfidence?: number;
}

interface Web3OkxSnapshot {
    baseCcy: string;
    spotInstId: string | null;
    swapInstId: string | null;
    spot: {
        last: number;
        open24h: number;
        high24h: number;
        low24h: number;
        change24hPct: number;
        volume24hBase: number;
        volume24hQuote: number;
        ts: number;
    } | null;
    derivatives: {
        fundingRate: number | null;
        nextFundingTs: number | null;
        openInterest: number | null;
        openInterestUsd: number | null;
        ts: number | null;
    } | null;
    candles?: Array<[ts: number, o: number, h: number, l: number, c: number]>;
    orderbookDepthUsd?: number | null;
}

interface Web3OkxNewsItem {
    id?: string;
    title?: string;
    summary?: string;
    url?: string;
    publishedAt?: string;
    source?: string;
    importance?: string;
    sentiment?: string;
    coins?: string[];
}

interface Web3OkxSentiment {
    baseCcy: string;
    label?: string;
    bullishRatio?: number | null;
    bearishRatio?: number | null;
    neutralRatio?: number | null;
    hotness?: number | null;
    newsMentionCnt?: number | null;
    xMentionCnt?: number | null;
    ts?: number;
}

interface Web3OkxNewsBundle {
    baseCcy: string;
    latestNews: Web3OkxNewsItem[];
    sentiment: Web3OkxSentiment | null;
}

interface Web3ModuleData {
    label?: string;
    intent?: string;
    via?: string;
    assets?: number;
    okx?: Web3OkxSnapshot[];
    okxNews?: Web3OkxNewsBundle[];
    providers?: string[];
    duration?: number;
}

interface ThinkingModule {
    type: 'search' | 'analysis' | 'simulation' | 'consensus' | 'web3' | 'done';
    status: 'pending' | 'active' | 'completed';
    data?: SearchModuleData | AnalysisModuleData | SimulationModuleData | ConsensusModuleData | Web3ModuleData | { duration?: number };
}

interface ToolTraceItem {
    tool?: string;
    displayName: string;
    status: 'running' | 'done' | 'error';
    durationSec?: number;
}

interface ThinkingFlow {
    modules: ThinkingModule[];
    isActive: boolean;
    route?: string;  // which agent route triggered this
    routedMode?: string; // 'fast' | 'auto' | 'roundtable' — set after routing
    toolTrace?: ToolTraceItem[];
    planningMessage?: string;
    /** Signal Radar: last30days stderr / status lines (not shown in main chat) */
    signalResearchLog?: string;
    /** Roundtable: selected agent IDs from summon panel */
    selectedAgentIds?: string[];
    /** Timestamp when thinking started */
    startTime?: number;
    /** Roundtable preparation status */
    rtPreparationStatus?: 'loading' | 'done';
    /** Roundtable 4-phase process data */
    rtDataSearch?: RtDataCategory[];
    rtRounds?: RtRoundData[];
    rtConsensus?: RtConsensusResult;
    rtReportStatus?: 'pending' | 'active' | 'done';
}

function mergeSearchSources(primary?: SearchSource[], secondary?: SearchSource[]): SearchSource[] {
    const out: SearchSource[] = [];
    const byKey = new Map<string, number>();
    const list = [...(primary || []), ...(secondary || [])];

    for (const s of list) {
        const key = `${s.url || ''}|${s.domain || ''}|${s.title || ''}`.toLowerCase();
        const idx = byKey.get(key);
        if (idx == null) {
            byKey.set(key, out.length);
            out.push({ ...s });
            continue;
        }
        // Prefer richer record when duplicated key appears.
        const prev = out[idx];
        out[idx] = {
            ...prev,
            ...s,
            snippet: prev.snippet || s.snippet,
            url: prev.url || s.url,
        };
    }
    return out;
}

function collectThinkingSearchSources(flow?: ThinkingFlow): SearchSource[] {
    if (!flow?.modules?.length) return [];
    const gathered: SearchSource[] = [];
    for (const m of flow.modules) {
        if (m.type !== 'search' || !m.data) continue;
        const data = m.data as SearchModuleData;
        if (Array.isArray(data.sources)) gathered.push(...data.sources);
        if (Array.isArray(data.sections)) {
            for (const sec of data.sections) {
                if (Array.isArray(sec.sources)) gathered.push(...sec.sources);
            }
        }
    }
    return mergeSearchSources(gathered, []);
}

const SA_SID_KEY = 'loka_superagent_sid';
const SA_PENDING_KEY = 'loka_sa_analysis_pending';

/** Backend may send 0–1 or 0–100 */
function confidenceToPercent(n: number | undefined): number {
    if (n == null || Number.isNaN(n)) return 0;
    if (n >= 0 && n <= 1) return Math.round(n * 100);
    return Math.round(Math.min(100, Math.max(0, n)));
}

function buildTraceFromSteps(steps: unknown[]): ToolTraceItem[] {
    const trace: ToolTraceItem[] = [];
    if (!Array.isArray(steps)) return trace;
    for (const raw of steps) {
        const s = raw as Record<string, unknown>;
        if (!s || typeof s !== 'object') continue;
        if (s.type === 'tool_start') {
            trace.push({
                tool: s.tool as string | undefined,
                displayName: (s.displayName as string) || (s.tool as string) || 'tool',
                status: 'running',
            });
        } else if (s.type === 'tool_done') {
            for (let i = trace.length - 1; i >= 0; i--) {
                if (trace[i].status === 'running' && trace[i].tool === s.tool) {
                    trace[i] = {
                        ...trace[i],
                        status: s.success === false ? 'error' : 'done',
                        durationSec: typeof s.duration === 'number' ? s.duration : undefined,
                    };
                    break;
                }
            }
        }
    }
    return trace;
}

function extractPlanningMessage(steps: unknown[]): string | undefined {
    if (!Array.isArray(steps)) return undefined;
    let last: string | undefined;
    for (const raw of steps) {
        const s = raw as Record<string, unknown>;
        if (s?.type === 'thinking' && typeof s.message === 'string') last = s.message;
    }
    return last;
}


// ─── Roundtable Consensus Types ──────────────────────────────────
interface RoundtableAgentVote {
    name: string;
    initials: string;
    agentId: string;
    answer: string;      // Short answer summary (first line or extracted verdict)
    reasoning: string;   // Full reasoning text
    confidence: number;  // 0–100
}

interface ConsensusRound {
    round: number;
    agents: RoundtableAgentVote[];
    status: 'forming' | 'reached' | 'diverging';
    summary: string;
}

interface RoundtableData {
    rounds: ConsensusRound[];
    finalVerdict: { summary: string; confidence: number };
}

const ROUNDTABLE_AGENTS = [
    { name: 'Fundamental Analyst', initials: 'FA', agentId: 'agent_0' },
    { name: 'Macro Strategist', initials: 'MS', agentId: 'agent_1' },
    { name: 'Sentiment Engine', initials: 'SE', agentId: 'agent_2' },
    { name: 'Quant Tracker', initials: 'QT', agentId: 'agent_3' },
];

/* ── Summon pool — analyst characters for roundtable selection ── */
/* system=true → auto-selected by system, user cannot toggle */
const SUMMON_POOL: { id: string; name: string; nameCN: string; initials: string; role: string; roleCN: string; color: string; group: 'system' | 'enhanced' | 'master'; }[] = [
    // ── System base agents (auto-assigned, not user-toggleable) ──
    { id: 'fundamental_specialist',  name: 'Fundamental Analyst',      nameCN: '基本面分析师',   initials: 'FA', role: 'Financials & earnings',    roleCN: '财务与盈利分析',   color: '#3B82F6', group: 'system' },
    { id: 'valuation_specialist',    name: 'Valuation Analyst',        nameCN: '估值分析师',     initials: 'VA', role: 'Fair value & models',      roleCN: '公允价值与模型',   color: '#6366F1', group: 'system' },
    { id: 'macro_specialist',        name: 'Macro Analyst',            nameCN: '宏观分析师',     initials: 'MA', role: 'Macro trends & policy',     roleCN: '宏观趋势与政策',   color: '#8B5CF6', group: 'system' },
    { id: 'risk_specialist',         name: 'Risk Analyst',             nameCN: '风险分析师',     initials: 'RA', role: 'Risk & downside scenarios', roleCN: '风险与下行场景',   color: '#EF4444', group: 'system' },
    // ── Group 1: Enhanced / Specialized views (user-toggleable) ──
    { id: 'allocation_specialist',   name: 'Allocation Analyst',       nameCN: '配置分析师',     initials: 'AA', role: 'ETF & asset allocation',    roleCN: 'ETF与资产配置',    color: '#14B8A6', group: 'enhanced' },
    { id: 'fund_specialist',         name: 'Fund Analyst',             nameCN: '基金分析师',     initials: 'FD', role: 'Fund selection & review',   roleCN: '基金筛选与评审',   color: '#0EA5E9', group: 'enhanced' },
    { id: 'options_specialist',      name: 'Options Analyst',          nameCN: '期权分析师',     initials: 'OA', role: 'Options strategy & Greeks', roleCN: '期权策略与Greeks', color: '#D946EF', group: 'enhanced' },
    { id: 'crypto_specialist',       name: 'Crypto Analyst',           nameCN: '加密分析师',     initials: 'CA', role: 'Crypto & on-chain data',    roleCN: '加密与链上数据',   color: '#F59E0B', group: 'enhanced' },
    { id: 'macro_enhanced',   name: 'Macro Enhanced Analyst',   nameCN: '宏观增强分析师',   initials: 'ME', role: 'Deep macro overlay',        roleCN: '深度宏观叠加',   color: '#7C3AED', group: 'enhanced' },
    { id: 'risk_enhanced',    name: 'Risk Enhanced Analyst',    nameCN: '风险增强分析师',   initials: 'RE', role: 'Fractal risk modeling',      roleCN: '分形风险建模',   color: '#DC2626', group: 'enhanced' },
    { id: 'event_driven',     name: 'Event-Driven Analyst',     nameCN: '事件驱动分析师',   initials: 'ED', role: 'Catalysts & events',         roleCN: '催化剂与事件',   color: '#EA580C', group: 'enhanced' },
    { id: 'sentiment_focus',  name: 'Sentiment Analyst',        nameCN: '情绪分析师',       initials: 'SF', role: 'Social & market sentiment',  roleCN: '社交与市场情绪', color: '#0891B2', group: 'enhanced' },
    { id: 'portfolio_view',   name: 'Portfolio Analyst',        nameCN: '组合分析师',       initials: 'PV', role: 'Portfolio impact & fit',      roleCN: '组合影响与适配', color: '#059669', group: 'enhanced' },
    // ── Group 2: Master simulation (user-toggleable) ──
    { id: 'buffett_style',  name: 'Warren Buffett',  nameCN: '巴菲特风格',   initials: 'WB', role: 'Competitive moats & value',    roleCN: '竞争护城河与价值', color: '#1E40AF', group: 'master' },
    { id: 'munger_style',   name: 'Charlie Munger',  nameCN: '芒格风格',     initials: 'CM', role: 'Mental models & inversion',    roleCN: '多元思维与逆向',   color: '#374151', group: 'master' },
    { id: 'dalio_style',    name: 'Ray Dalio',       nameCN: '达利欧风格',   initials: 'RD', role: 'Macro cycles & all-weather',   roleCN: '宏观周期与全天候', color: '#1D4ED8', group: 'master' },
    { id: 'soros_style',    name: 'George Soros',    nameCN: '索罗斯风格',   initials: 'GS', role: 'Reflexivity & macro bets',     roleCN: '反身性与宏观博弈', color: '#7E22CE', group: 'master' },
    { id: 'lynch_style',    name: 'Peter Lynch',     nameCN: '林奇风格',     initials: 'PL', role: 'Growth at reasonable price',   roleCN: '合理价格成长',     color: '#047857', group: 'master' },
];
const SYSTEM_AGENT_IDS = new Set(SUMMON_POOL.filter(a => a.group === 'system').map(a => a.id));
const DEFAULT_SUMMON_IDS = new Set<string>();

const AGENT_COLORS: Record<string, string> = {
    FA: '#475569', MS: '#475569', SE: '#475569', QT: '#475569',
};

/* ── Avatar mapping: name/id → JPG path ── */
const AVATAR_MAP: Record<string, string> = {
    // SUMMON_POOL system agents
    fundamental_specialist: '/avatars/fundamental_specialist.jpg',
    valuation_specialist: '/avatars/valuation_specialist.jpg',
    macro_specialist: '/avatars/macro_specialist.jpg',
    risk_specialist: '/avatars/risk_specialist.jpg',
    allocation_specialist: '/avatars/allocation_specialist.jpg',
    fund_specialist: '/avatars/fund_specialist.jpg',
    options_specialist: '/avatars/options_specialist.jpg',
    crypto_specialist: '/avatars/crypto_specialist.jpg',
    // SUMMON_POOL enhanced agents
    macro_enhanced: '/avatars/macro_enhanced.jpg',
    risk_enhanced: '/avatars/risk_enhanced.jpg',
    event_driven: '/avatars/event_driven.jpg',
    sentiment_focus: '/avatars/sentiment_focus.jpg',
    portfolio_view: '/avatars/portfolio_view.jpg',
    // SUMMON_POOL master style agents
    buffett_style: '/avatars/warren_buffett.jpg',
    munger_style: '/avatars/charlie_munger.jpg',
    dalio_style: '/avatars/default.jpg',
    soros_style: '/avatars/default.jpg',
    lynch_style: '/avatars/peter_lynch.jpg',
    // Legacy SUMMON_POOL ids (keep for backward compat)
    fundamental: '/avatars/fundamental_analyst.jpg',
    macro: '/avatars/default.jpg',
    sentiment: '/avatars/sentiment_analyst.jpg',
    quant: '/avatars/default.jpg',
    technical: '/avatars/technical_analyst.jpg',
    risk: '/avatars/default.jpg',
    sector: '/avatars/default.jpg',
    contrarian: '/avatars/default.jpg',
    // ROUNDTABLE_AGENTS initials
    FA: '/avatars/fundamental_analyst.jpg',
    MS: '/avatars/default.jpg',
    SE: '/avatars/sentiment_analyst.jpg',
    QT: '/avatars/default.jpg',
    TA: '/avatars/technical_analyst.jpg',
    RA: '/avatars/default.jpg',
    SS: '/avatars/default.jpg',
    DA: '/avatars/default.jpg',
    // Backend analyst snake_case keys (from hedge-fund agent)
    technical_analyst: '/avatars/technical_analyst.jpg',
    fundamentals_analyst: '/avatars/fundamental_analyst.jpg',
    sentiment_analyst: '/avatars/sentiment_analyst.jpg',
    news_sentiment_analyst: '/avatars/sentiment_analyst.jpg',
    valuation_analyst: '/avatars/default.jpg',
    growth_analyst: '/avatars/default.jpg',
    risk_management_analyst: '/avatars/default.jpg',
    // Guru snake_case keys (from hedge-fund agent)
    warren_buffett: '/avatars/warren_buffett.jpg',
    ben_graham: '/avatars/ben_graham.jpg',
    peter_lynch: '/avatars/peter_lynch.jpg',
    charlie_munger: '/avatars/charlie_munger.jpg',
    aswath_damodaran: '/avatars/aswath_damodaran.jpg',
    cathie_wood: '/avatars/cathie_wood.jpg',
    michael_burry: '/avatars/michael_burry.jpg',
    stanley_druckenmiller: '/avatars/stanley_druckenmiller.jpg',
    nassim_taleb: '/avatars/nassim_taleb.jpg',
    bill_ackman: '/avatars/bill_ackman.jpg',
    phil_fisher: '/avatars/phil_fisher.jpg',
    mohnish_pabrai: '/avatars/mohnish_pabrai.jpg',
    rakesh_jhunjhunwala: '/avatars/rakesh_jhunjhunwala.jpg',
    // Pretty display names (fallback)
    'Warren Buffett': '/avatars/warren_buffett.jpg',
    'Ben Graham': '/avatars/ben_graham.jpg',
    'Peter Lynch': '/avatars/peter_lynch.jpg',
    'Charlie Munger': '/avatars/charlie_munger.jpg',
    'Aswath Damodaran': '/avatars/aswath_damodaran.jpg',
    'Cathie Wood': '/avatars/cathie_wood.jpg',
    'Michael Burry': '/avatars/michael_burry.jpg',
    'Stanley Druckenmiller': '/avatars/stanley_druckenmiller.jpg',
    'Nassim Taleb': '/avatars/nassim_taleb.jpg',
    'Bill Ackman': '/avatars/bill_ackman.jpg',
    'Phil Fisher': '/avatars/phil_fisher.jpg',
    'Mohnish Pabrai': '/avatars/mohnish_pabrai.jpg',
    'Rakesh Jhunjhunwala': '/avatars/rakesh_jhunjhunwala.jpg',
    'Fundamental Analyst': '/avatars/fundamental_analyst.jpg',
    'Technical Analyst': '/avatars/technical_analyst.jpg',
    'Sentiment Engine': '/avatars/sentiment_analyst.jpg',
};

const getAgentAvatar = (nameOrId: string) => AVATAR_MAP[nameOrId] || '/avatars/default.jpg';

/** Convert snake_case key to display name: "fundamentals_analyst" → "Fundamentals Analyst" */
const prettyAgentName = (raw: string) =>
    AVATAR_MAP[raw] ? raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : raw;

const AgentAvatarImg: React.FC<{ nameOrId: string; size?: number; className?: string }> = ({ nameOrId, size = 24, className = '' }) => {
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
    const renderSize = Math.round(size * dpr);
    return (
        <img src={getAgentAvatar(nameOrId)} alt={nameOrId} width={renderSize} height={renderSize}
            className={`rounded-full object-cover shrink-0 ${className}`}
            style={{ width: size, height: size, imageRendering: 'auto' }}
            loading="eager" decoding="async" />
    );
};

const SOCIAL_DOMAINS = new Set(['x.com', 'twitter.com', 'reddit.com', 'stocktwits.com']);

/**
 * Derive Roundtable Data Collection categories from the live thinking `modules`.
 *
 * Market Indicators come from the real `analysis` module's stages[].result[].label
 * (no hardcoded placeholder list). News & Social sources come from the real
 * `search` module. Category status is derived from the underlying module status
 * so the panel can update live as events stream in — not only at consensus_done.
 */
const deriveRtDataSearchFromModules = (modules: ThinkingModule[]): RtDataCategory[] => {
    const mapModuleStatus = (s?: string): 'pending' | 'active' | 'done' => {
        if (s === 'completed' || s === 'done' || s === 'concluded') return 'done';
        if (s === 'active' || s === 'analyzing') return 'active';
        return 'pending';
    };

    const searchMod = modules.find(m => m.type === 'search');
    const searchData = searchMod?.data as SearchModuleData | undefined;
    const searchSources = searchData?.sources || [];
    const sectionSocial = searchData?.sections?.find((s: any) => s.id === 'social')?.sources || [];
    const newsSrc = searchSources.filter(s => !SOCIAL_DOMAINS.has(s.domain));
    const socialSrc = [...sectionSocial, ...searchSources.filter(s => SOCIAL_DOMAINS.has(s.domain))];
    const searchStatus = mapModuleStatus(searchMod?.status);

    const analysisMod = modules.find(m => m.type === 'analysis');
    const analysisData = analysisMod?.data as AnalysisModuleData | undefined;
    const indicatorItems: string[] = [];
    for (const stage of analysisData?.stages || []) {
        for (const r of stage.result || []) {
            if (r.label && !indicatorItems.includes(r.label)) indicatorItems.push(r.label);
        }
    }
    const analysisStatus = mapModuleStatus(analysisMod?.status);

    const web3Mod = modules.find(m => m.type === 'web3');
    const web3Data = web3Mod?.data as Web3ModuleData | undefined;
    const okxSnaps = web3Data?.okx || [];
    const fmtUsd = (v: number | null | undefined) => {
        if (v == null || !Number.isFinite(v)) return 'n/a';
        const abs = Math.abs(v);
        if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
        if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
        if (abs >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
        return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    };
    const derivativesItems: string[] = [];
    for (const snap of okxSnaps) {
        const base = snap.baseCcy;
        if (snap.derivatives?.fundingRate != null) {
            const fr = snap.derivatives.fundingRate;
            derivativesItems.push(`${base} Funding ${(fr * 100).toFixed(4)}%/8h`);
        }
        if (snap.derivatives?.openInterestUsd != null) {
            derivativesItems.push(`${base} OI ${fmtUsd(snap.derivatives.openInterestUsd)}`);
        }
        if (snap.orderbookDepthUsd != null) {
            derivativesItems.push(`${base} Depth±10 ${fmtUsd(snap.orderbookDepthUsd)}`);
        }
        if (snap.spot?.change24hPct != null && Number.isFinite(snap.spot.change24hPct)) {
            const pct = snap.spot.change24hPct;
            derivativesItems.push(`${base} 24h ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`);
        }
    }
    const web3Status = mapModuleStatus(web3Mod?.status);

    const categories: RtDataCategory[] = [];
    // Only include Market Indicators when there is real analysis data (omit for crypto-only queries).
    if (analysisMod) {
        categories.push({
            id: 'indicators',
            label: 'Market Indicators',
            labelCN: '市场指标',
            icon: 'indicators',
            status: indicatorItems.length > 0 ? 'done' : analysisStatus,
            count: indicatorItems.length || undefined,
            ...(indicatorItems.length > 0 ? { items: indicatorItems } : {}),
        });
    }
    // OKX Derivatives — shown when web3 module returned OKX snapshots (crypto path)
    if (okxSnaps.length > 0 || web3Mod) {
        categories.push({
            id: 'derivatives',
            label: 'Derivatives',
            labelCN: '衍生品',
            icon: 'derivatives',
            status: derivativesItems.length > 0 ? 'done' : web3Status,
            count: derivativesItems.length || undefined,
            ...(derivativesItems.length > 0 ? { items: derivativesItems } : {}),
        });
    }
    categories.push({
        id: 'news',
        label: 'News & Reports',
        labelCN: '新闻与报告',
        icon: 'news',
        status: newsSrc.length > 0 ? 'done' : searchStatus,
        count: newsSrc.length || undefined,
        ...(newsSrc.length > 0 ? { sources: newsSrc.map(s => ({ title: s.title, domain: s.domain, favicon: s.favicon, url: s.url })) } : {}),
    });
    categories.push({
        id: 'social',
        label: 'Social Media',
        labelCN: '社交媒体',
        icon: 'social',
        status: socialSrc.length > 0 ? 'done' : searchStatus,
        count: socialSrc.length || undefined,
        ...(socialSrc.length > 0 ? { sources: socialSrc.map(s => ({ title: s.title, domain: s.domain, favicon: s.favicon, url: s.url })) } : {}),
    });
    return categories;
};

/** Reconstruct rt* process fields from a saved consensus result for history restoration */
const reconstructRtFieldsFromConsensus = (
    consensusResult: any,
    modules: ThinkingModule[],
): { rtPreparationStatus: 'done'; rtDataSearch: RtDataCategory[]; rtRounds: RtRoundData[]; rtConsensus: RtConsensusResult; rtReportStatus: 'done' } | null => {
    const consensus = consensusResult?.consensus;
    if (!consensus) return null;

    const agentNameMap: Record<string, string> = {
        agent_0: 'Fundamental Analyst',
        agent_1: 'Macro Strategist',
        agent_2: 'Sentiment Engine',
        agent_3: 'Quant Tracker',
    };

    // --- Reconstruct rtDataSearch from modules (no hardcoded placeholders) ---
    const rtDataSearch: RtDataCategory[] = deriveRtDataSearchFromModules(modules);

    // --- Reconstruct rtRounds from discussionRounds or agentResponses ---
    const discussionRounds: any[] = consensus.discussionRounds || [];
    const agentResponses: any[] = consensus.agentResponses || [];
    const roundsUsed = Number(consensus.roundsUsed ?? 1) || 1;
    const rtRounds: RtRoundData[] = [];

    const toAgent = (agentId: string, resp: any): RtAgentInference => ({
        agentId,
        agentName: agentNameMap[agentId] || agentId,
        status: 'done',
        verdict: resp.verdict || (resp.answer?.match(/\*\*Verdict:\*\*\s*([^\n*]+)/i)?.[1]?.trim()) || 'Neutral',
        confidence: Math.round((resp.confidence ?? 0.5) * 100),
        reasoning: resp.answer || resp.reasoning || '',
    });

    if (discussionRounds.length > 0) {
        discussionRounds.forEach((dr: any, rIdx: number) => {
            const agentMap: Record<string, any> = dr.agent_responses || {};
            const agents: RtAgentInference[] = [];
            for (const [aid, resp] of Object.entries(agentMap)) {
                agents.push(toAgent(aid, resp));
            }
            // For round 2+, try to detect changed minds
            if (rIdx > 0 && rtRounds[0]) {
                agents.forEach(a => {
                    const prev = rtRounds[0].agents.find(p => p.agentId === a.agentId);
                    if (prev && prev.verdict !== a.verdict) {
                        a.changedMind = true;
                        a.previousVerdict = prev.verdict;
                    }
                    a.crossReferences = agents.filter(o => o.agentId !== a.agentId).map(o => o.agentName);
                });
            }
            rtRounds.push({ round: rIdx + 1, status: 'done', agents });
        });
    } else if (agentResponses.length > 0) {
        // Single round fallback
        const agents = agentResponses.map((r: any) => toAgent(r.agentId, r));
        rtRounds.push({ round: 1, status: 'done', agents });
        if (roundsUsed > 1) {
            // Duplicate as round 2 with cross-references
            const r2agents = agents.map(a => ({
                ...a,
                crossReferences: agents.filter(o => o.agentId !== a.agentId).map(o => o.agentName),
            }));
            rtRounds.push({ round: 2, status: 'done', agents: r2agents });
        }
    }

    // --- Reconstruct rtConsensus ---
    const consensusReached = consensus.consensusReached !== false;
    const finalText = consensus.finalAnswer || '';
    const verdictMatch = finalText.match(/\*\*Verdict:\*\*\s*([^\n*]+)/i);

    const allAgents = rtRounds.length > 0 ? rtRounds[rtRounds.length - 1].agents : [];
    // Normalize agent verdicts to Bullish/Bearish/Neutral for majority counting.
    const normVerdict = (v?: string): string => {
        const s = (v || 'Neutral').toLowerCase();
        if (s.includes('bull') || s.includes('positive') || s.includes('long')) return 'Bullish';
        if (s.includes('bear') || s.includes('negative') || s.includes('short')) return 'Bearish';
        return 'Neutral';
    };
    // Tally agent verdicts (last round) — used for both conflictRate and finalVerdict fallback.
    const verdictCounts = allAgents.reduce<Record<string, number>>((acc, a) => {
        const v = normVerdict(a.verdict);
        acc[v] = (acc[v] || 0) + 1;
        return acc;
    }, {});
    const majorityEntry = Object.entries(verdictCounts).sort(([, a], [, b]) => b - a)[0];
    const majorityVerdict = majorityEntry ? majorityEntry[0] : 'Neutral';

    let conflictRate = 0;
    if (allAgents.length > 1) {
        const majorityCount = majorityEntry ? majorityEntry[1] : allAgents.length;
        conflictRate = Math.round(((allAgents.length - majorityCount) / allAgents.length) * 100);
    } else if (!consensusReached) {
        conflictRate = 50;
    }

    // Final verdict: prefer explicit markup in finalAnswer, otherwise fall back to
    // the majority of agents (NOT a hardcoded 'Bullish'). Matches what the panel
    // actually shows in the agent list so the Final Verdict reflects real consensus.
    const finalVerdict = verdictMatch
        ? verdictMatch[1].trim()
        : majorityVerdict;

    const rtConsensus: RtConsensusResult = {
        status: 'done',
        hasConsensus: consensusReached,
        conflictRate,
        agentConclusions: allAgents.map(a => ({
            agentName: a.agentName,
            verdict: a.verdict || 'Neutral',
            confidence: a.confidence || 50,
        })),
        finalVerdict,
        finalConfidence: Math.round((consensus.confidence ?? 0.5) * 100),
    };

    return { rtPreparationStatus: 'done', rtDataSearch, rtRounds, rtConsensus, rtReportStatus: 'done' };
};

/** Build RoundtableData from a real consensus_done result */
const buildRoundtableFromConsensus = (result: any): RoundtableData => {
    const consensus = result?.consensus;
    if (!consensus) return { rounds: [], finalVerdict: { summary: '', confidence: 0 } };

    const consensusReached: boolean = consensus.consensusReached !== false;

    const agentNameMap: Record<string, { name: string; initials: string }> = {};
    ROUNDTABLE_AGENTS.forEach(a => { agentNameMap[a.agentId] = { name: a.name, initials: a.initials }; });

    /** Convert a per-agent response object to a RoundtableAgentVote */
    const toVote = (agentId: string, resp: any, idx: number): RoundtableAgentVote => {
        const meta = agentNameMap[agentId] || ROUNDTABLE_AGENTS[idx] || { name: agentId, initials: '??', agentId };
        const conf = Math.round((resp.confidence ?? 0) * 100);
        const fullText = resp.answer || resp.reasoning || '';
        return {
            name: meta.name,
            initials: meta.initials,
            agentId,
            answer: '', // not used separately — full text shown in reasoning
            reasoning: fullText,
            confidence: conf,
        };
    };

    // ── Try to build per-round data from discussionRounds ──
    const discussionRounds: any[] = consensus.discussionRounds || [];
    const rounds: ConsensusRound[] = [];

    if (discussionRounds.length > 0) {
        let prevFingerprint = '';
        for (const dr of discussionRounds) {
            const roundNum: number = dr.round_number ?? (rounds.length + 1);
            const agentMap: Record<string, any> = dr.agent_responses || {};
            const agents: RoundtableAgentVote[] = [];
            // Iterate in ROUNDTABLE_AGENTS order so display is consistent
            let idx = 0;
            for (const ra of ROUNDTABLE_AGENTS) {
                const resp = agentMap[ra.agentId];
                if (resp) {
                    agents.push(toVote(ra.agentId, resp, idx));
                }
                idx++;
            }
            // Also pick up any agent IDs not in ROUNDTABLE_AGENTS
            for (const [aid, resp] of Object.entries(agentMap)) {
                if (!ROUNDTABLE_AGENTS.some(a => a.agentId === aid)) {
                    agents.push(toVote(aid, resp, agents.length));
                }
            }

            // Deduplicate: skip rounds whose agent content is identical to previous
            const fingerprint = agents.map(a => a.reasoning).join('|||');
            if (fingerprint === prevFingerprint && rounds.length > 0) {
                rounds[rounds.length - 1].status = 'reached';
                rounds[rounds.length - 1].summary = `${agents.length} experts reached consensus.`;
                continue;
            }
            prevFingerprint = fingerprint;

            // Infer status: API rarely includes consensus_status per round,
            // so derive it from the top-level consensusReached + round position.
            // Non-last rounds didn't reach consensus (otherwise there'd be no next round).
            // Last round inherits the top-level result.
            const isLastRound = dr === discussionRounds[discussionRounds.length - 1];
            const status: 'forming' | 'reached' | 'diverging' =
                dr.consensus_status === 'reached' || dr.consensus_status === 'diverging'
                    ? dr.consensus_status
                    : isLastRound
                        ? (consensusReached ? 'reached' : 'diverging')
                        : 'diverging'; // earlier rounds: no consensus → proceeded to next round

            rounds.push({
                round: roundNum,
                agents,
                status,
                summary: status === 'reached'
                    ? `${agents.length} experts reached consensus.`
                    : `No consensus — proceeded to next round.`,
            });
        }
    } else {
        // Fallback: only final agentResponses available (no per-round data)
        const agentResponses: any[] = consensus.agentResponses || [];
        const roundsUsed: number = consensus.roundsUsed || 1;
        const agents = agentResponses.map((r: any, idx: number) => toVote(r.agentId, r, idx));

        if (agents.length > 0) {
            rounds.push({
                round: roundsUsed,
                agents,
                status: consensusReached ? 'reached' : 'diverging',
                summary: consensusReached
                    ? `${agents.length} experts reached consensus after ${roundsUsed} round${roundsUsed > 1 ? 's' : ''}.`
                    : `No consensus after ${roundsUsed} round${roundsUsed > 1 ? 's' : ''}.`,
            });
        }
    }

    if (rounds.length === 0) {
        return { rounds: [], finalVerdict: { summary: consensusReached ? 'Consensus reached' : 'No consensus', confidence: Math.round((consensus.confidence ?? 0) * 100) } };
    }

    // Extract verdict from finalAnswer text
    const finalText = consensus.finalAnswer || '';
    const verdictMatch = finalText.match(/\*\*Verdict:\*\*\s*([^\n*]+)/i);
    const verdictSummary = verdictMatch
        ? verdictMatch[1].trim().slice(0, 200)
        : consensusReached ? 'Consensus concluded' : 'No consensus reached';

    return {
        rounds,
        finalVerdict: {
            summary: verdictSummary,
            confidence: Math.round((consensus.confidence ?? 0) * 100),
        },
    };
};

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
        
        svg.call(zoom as any);

        const g = svg.append('g');

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
            .call(drag as any)
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

// ─── RoundtableView Component ──────────────────────────
const RoundtableView: React.FC<{ data: RoundtableData; isWaiting?: boolean; isLive?: boolean; hideHeader?: boolean;
    summonPhase?: 'idle' | 'loading' | 'narrating' | 'selecting'; selectedSummonIds?: Set<string>;
    onSummonToggle?: (id: string) => void; onSummonConfirm?: () => void;
}> = ({ data, isWaiting, isLive, hideHeader,
    summonPhase = 'idle', selectedSummonIds, onSummonToggle, onSummonConfirm }) => {
    // Empty / waiting state: show summon flow OR waiting placeholder
    if (data.rounds.length === 0) {
        return (
            <div className="flex flex-col h-full bg-white">
                {!hideHeader && (
                    <div className="px-5 py-4 border-b border-gray-100">
                        <h2 className="text-[14px] font-bold text-gray-900">Roundtable Graph</h2>
                        <p className="text-[11px] text-gray-400 mt-0.5">Multi-agent discussion panel</p>
                    </div>
                )}
                {summonPhase !== 'idle' && selectedSummonIds && onSummonToggle && onSummonConfirm ? (
                    <SummonCharactersView
                        phase={summonPhase as 'loading' | 'selecting'}
                        selectedIds={selectedSummonIds}
                        onToggle={onSummonToggle}
                        onConfirm={onSummonConfirm}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center px-5">
                        <div className="w-16 h-16 rounded-full bg-gray-50 border-2 border-gray-200 flex items-center justify-center mb-4">
                            {isWaiting ? (
                                <div className="flex gap-[3px]">
                                    {[0, 1, 2].map(d => (
                                        <div key={d} className="w-[5px] h-[5px] rounded-full bg-blue-400 rt-pulse-dot" style={{ animationDelay: `${d * 0.2}s` }} />
                                    ))}
                                </div>
                            ) : (
                                <span className="text-[10px] text-gray-300 font-bold">IDLE</span>
                            )}
                        </div>
                        {isWaiting ? (
                            <p className="text-[12px] font-medium text-blue-500">Analyzing & gathering data...</p>
                        ) : (
                            <p className="text-[12px] text-gray-400 text-center leading-relaxed">Waiting for a <span className="font-medium text-gray-500">Roundtable</span> discussion</p>
                        )}
                    </div>
                )}
            </div>
        );
    }

    const [expandedRound, setExpandedRound] = useState<number | null>(null);

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Knowledge Graph — fills full space */}
            <div className="flex-1 min-h-0 relative">
                <KnowledgeGraphView data={buildKnowledgeGraph()} />
            </div>
        </div>
    );
};

// ─── Tool → real data-source domain mapping ─────────────────────────
const TOOL_SOURCE_DOMAINS: Record<string, string[]> = {
    get_realtime_quote:         ['eastmoney.com', 'sina.com.cn'],
    get_daily_history:          ['eastmoney.com', 'tushare.pro'],
    get_chip_distribution:      ['eastmoney.com'],
    get_stock_info:             ['eastmoney.com', 'finance.sina.com.cn'],
    search_stock_news:          ['google.com', 'bocha.cn', 'tavily.com'],
    search_comprehensive_intel: ['google.com', 'brave.com', 'bocha.cn'],
    get_market_indices:         ['eastmoney.com'],
    get_sector_rankings:        ['eastmoney.com'],
    analyze_trend:              ['eastmoney.com'],
    calculate_ma:               ['eastmoney.com'],
    get_volume_analysis:        ['eastmoney.com'],
    analyze_pattern:            ['eastmoney.com'],
    get_analysis_context:       ['loka-db'],
    get_skill_backtest_summary: ['loka-db'],
    get_strategy_backtest_summary: ['loka-db'],
    get_stock_backtest_summary: ['loka-db'],
};

// ─── SummonCharactersView — bubble selection for roundtable participants ───
const SummonCharactersView: React.FC<{
    phase: 'loading' | 'selecting';
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    onConfirm: () => void;
}> = ({ phase, selectedIds, onToggle, onConfirm }) => {
    if (phase === 'loading') {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16">
                <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-[3px] border-blue-100" />
                    <div className="absolute inset-0 rounded-full border-[3px] border-blue-400 border-t-transparent animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="9" cy="7" r="3" /><circle cx="15" cy="7" r="3" />
                            <path d="M3 21v-1a4 4 0 014-4h2M13 16h4a4 4 0 014 4v1" />
                        </svg>
                    </div>
                </div>
                <div className="text-center space-y-1">
                    <p className="text-[13px] text-gray-700 font-medium">Summoning analysts for your question…</p>
                    <p className="text-[11px] text-gray-400">Summoning analysts for this discussion</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="px-5 py-3 shrink-0">
                <p className="text-[12px] text-gray-500">Select analysts for this discussion, or continue directly</p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
                {/* ── All agents in one grid: system (locked) + toggleable ── */}
                <div className="flex flex-wrap justify-center gap-5 content-center">
                    {SUMMON_POOL.map((agent, i) => {
                        const isSystem = agent.group === 'system';
                        const selected = selectedIds.has(agent.id);
                        if (isSystem) {
                            return (
                                <div key={agent.id}
                                    className="flex flex-col items-center gap-1.5 relative group"
                                    style={{ animation: `summon-pop 0.4s ease-out ${i * 0.05}s both` }}
                                >
                                    <div className="relative w-[56px] h-[56px] rounded-full overflow-hidden opacity-50 grayscale-[30%] cursor-default">
                                        <AgentAvatarImg nameOrId={agent.id} size={56} />
                                        <div className="absolute bottom-0 right-0 w-[16px] h-[16px] bg-gray-400 rounded-full flex items-center justify-center">
                                            <svg className="w-[8px] h-[8px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                            </svg>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-semibold text-gray-400 text-center leading-tight max-w-[68px]">{agent.name}</span>
                                    <span className="text-[9px] text-gray-400 text-center leading-tight max-w-[68px]">{agent.role}</span>
                                    {/* Tooltip */}
                                    <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-[9px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 shadow-lg">
                                        Auto-Assigned
                                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[3px] border-r-[3px] border-t-[3px] border-l-transparent border-r-transparent border-t-gray-800" />
                                    </div>
                                </div>
                            );
                        }
                        return (
                            <button key={agent.id}
                                onClick={() => onToggle(agent.id)}
                                className="flex flex-col items-center gap-1.5 group transition-all"
                                style={{ animation: `summon-pop 0.4s ease-out ${i * 0.05}s both` }}
                            >
                                <div className={`relative w-[56px] h-[56px] rounded-full overflow-hidden
                                    transition-all duration-200 cursor-pointer ${selected
                                        ? 'ring-[2.5px] ring-offset-2 ring-blue-400 scale-105 shadow-lg'
                                        : 'opacity-45 grayscale hover:opacity-75 hover:grayscale-0'
                                    }`}
                                >
                                    <AgentAvatarImg nameOrId={agent.id} size={56} />
                                    {selected && (
                                        <div className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] bg-blue-500 rounded-full flex items-center justify-center shadow-sm">
                                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    )}
                                </div>
                                <span className={`text-[10px] font-semibold text-center leading-tight max-w-[68px] transition-colors ${selected ? 'text-gray-800' : 'text-gray-400'}`}>{agent.name}</span>
                                <span className="text-[9px] text-gray-400 text-center leading-tight max-w-[68px]">{agent.role}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 shrink-0">
                <button onClick={onConfirm}
                    disabled={selectedIds.size === 0}
                    className="w-full py-2.5 bg-gray-900 text-white text-[13px] font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Continue · {selectedIds.size} analyst{selectedIds.size > 1 ? 's' : ''}
                </button>
            </div>
        </div>
    );
};

// ─── Grok-style thinking messages (canned rotation for busy-looking UX) ──
// Used as fallback when backend emits no tool_trace events (e.g. crypto/web3 path).
// English only — keeps a single consistent voice across queries regardless of
// whether the user wrote in zh or en.
const CANNED_THINKING_MESSAGES: Record<string, string[]> = {
    search: [
        'Scanning X posts',
        'Reading news digest',
        'Searching community threads',
        'Fetching latest prices',
        'Cross-referencing sources',
        'Deduplicating noise',
        'Parsing headlines',
        'Checking Reddit threads',
        'Scanning crypto Twitter',
        'Sampling sentiment on social',
        'Collecting analyst takes',
        'Verifying source credibility',
    ],
    web3: [
        'Querying CoinGecko market data',
        'Pulling OKX perps funding',
        'Reading on-chain signals',
        'Aggregating sentiment indicators',
        'Verifying coin identity',
        'Merging dual-route data',
        'Fetching order book depth',
        'Computing 7D / 30D ranges',
        'Checking open interest',
        'Resolving contract address',
        'Matching base currency',
        'Summarizing derivatives snapshot',
    ],
    analysis: [
        'Analyzing fundamentals',
        'Computing technical indicators',
        'Comparing valuations',
        'Backtesting price action',
        'Checking risk factors',
        'Running RSI / MACD / Bollinger',
        'Evaluating DCF inputs',
        'Stress-testing assumptions',
        'Ranking peer comparables',
        'Assessing margin trends',
        'Inspecting insider activity',
    ],
    simulation: [
        'Building scenarios',
        'Modeling risk exposure',
        'Running Monte Carlo',
        'Generating bull / base / bear paths',
        'Computing confidence intervals',
        'Stress-testing tail risk',
    ],
    consensus: [
        'Gathering agent opinions',
        'Running debate rounds',
        'Tallying bull / bear views',
        'Converging on verdict',
        'Weighting agent confidence',
        'Cross-checking agent reasoning',
        'Distilling minority dissent',
        'Calibrating final confidence',
    ],
    default: [
        'Synthesizing',
        'Thinking through this',
        'Distilling key points',
        'Drafting response',
        'Connecting the dots',
        'Organizing findings',
        'Structuring the argument',
    ],
};

// ─── ThinkingInlineTrigger (Grok-style with staged progress rows) ──────
const ThinkingInlineTrigger: React.FC<{
    thinking: ThinkingFlow;
    onOpen: () => void;
}> = ({ thinking, onOpen }) => {
    const doneModule = thinking.modules.find(m => m.type === 'done');
    const dur = doneModule?.status === 'completed' ? (doneModule.data as any)?.duration : null;
    const durLabel =
        typeof dur === 'number' && !Number.isNaN(dur) ? String(dur) : '?';
    const activeModule = thinking.modules.find(m => m.status === 'active');
    const trace = thinking.toolTrace || [];

    // ── Live elapsed counter (updates every 1s while active, Grok/SurfAI style) ──
    const [nowMs, setNowMs] = useState(Date.now());
    useEffect(() => {
        if (!thinking.isActive) return;
        const id = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(id);
    }, [thinking.isActive]);
    const elapsedSec = thinking.isActive && thinking.startTime
        ? Math.max(0, Math.floor((nowMs - thinking.startTime) / 1000))
        : 0;

    // ── Line 1: summary title (English only) ──
    const phaseLabel = useMemo(() => {
        if (!thinking.isActive) return `Loka completed in ${durLabel}s`;
        const type = activeModule?.type || 'search';
        const labels: Record<string, string> = {
            search: 'Searching the web',
            analysis: 'Analyzing data',
            simulation: 'Running simulations',
            consensus: 'Reaching consensus',
            web3: 'Querying market data',
        };
        return labels[type] || 'Thinking';
    }, [thinking.isActive, activeModule, durLabel]);

    // ── Ticker: blend real trace items + canned busy messages for a rich
    // rotation across all modes (stock / research / web3 / simulation / roundtable).
    // Real events show authentic tool names; canned messages fill gaps so the
    // ticker always feels "busy" regardless of backend emission pattern.
    const allTickerItems = useMemo(() => {
        if (!thinking.isActive) return [];
        const items: string[] = [];
        const seen = new Set<string>();
        for (const t of trace) {
            if (t.displayName && !seen.has(t.displayName)) {
                seen.add(t.displayName);
                items.push(t.displayName);
            }
            const domains = (t.tool && TOOL_SOURCE_DOMAINS[t.tool]) || [];
            for (const d of domains) {
                if (d === 'loka-db' || seen.has(d)) continue;
                seen.add(d);
                items.push(d);
            }
        }
        // Always interleave with canned messages for the active phase, so every
        // mode — not just stock — gets the Grok-style busy-ticker feel.
        const activeType = activeModule?.type || 'default';
        const canned = CANNED_THINKING_MESSAGES[activeType] || CANNED_THINKING_MESSAGES.default;
        for (const c of canned) {
            if (!seen.has(c)) {
                seen.add(c);
                items.push(c);
            }
        }
        return items;
    }, [trace, thinking.isActive, activeModule]);

    const [tickerIdx, setTickerIdx] = useState(0);

    useEffect(() => {
        if (!thinking.isActive || allTickerItems.length <= 1) return;
        const id = setInterval(() => {
            setTickerIdx(i => (i + 1) % allTickerItems.length);
        }, 1800);
        return () => clearInterval(id);
    }, [thinking.isActive, allTickerItems.length]);

    useEffect(() => { setTickerIdx(0); }, [allTickerItems.length]);

    const isSimple = thinking.routedMode === 'fast';

    // Simple mode: single line, no panel open
    if (isSimple) {
        return (
            <div className="flex items-center gap-2 py-1.5 mb-2">
                {thinking.isActive ? (
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                ) : (
                    <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                )}
                <span className="text-[13px] font-medium text-gray-400">{phaseLabel}</span>
                {thinking.isActive && elapsedSec > 0 && (
                    <span className="text-[12px] font-semibold text-gray-500 tabular-nums">{elapsedSec}s</span>
                )}
            </div>
        );
    }

    // Full mode — arrow stays aligned to line 1 (items-center on the top row)
    return (
        <button onClick={onOpen} className="group py-1.5 mb-2 hover:opacity-80 transition-opacity text-left">
            {/* Top row: spinner/check + title + elapsed + arrow */}
            <div className="inline-flex items-center gap-2">
                {thinking.isActive ? (
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                ) : (
                    <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                )}
                <span className="text-[13px] font-medium text-gray-500">{phaseLabel}</span>
                {thinking.isActive && elapsedSec > 0 && (
                    <span className="text-[12px] font-semibold text-gray-700 tabular-nums">{elapsedSec}s</span>
                )}
                <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
            {/* Ticker row: one item at a time, cycling with slide-in animation */}
            {thinking.isActive && allTickerItems.length > 0 && (
                <div className="mt-1 pl-6 h-[18px] overflow-hidden">
                    <span key={tickerIdx} className="block text-[11px] text-gray-400 ticker-in">
                        {allTickerItems[tickerIdx % allTickerItems.length]}
                    </span>
                </div>
            )}
        </button>
    );
};

// ─── Shared sub-components for SidePanel ────────────────────
const StatusIcon: React.FC<{ status: string; size?: 'sm' | 'md' }> = ({ status, size = 'md' }) => {
    const s = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
    const bw = size === 'sm' ? 'border-[1.5px]' : 'border-2';
    if (status === 'done' || status === 'completed') return <svg className={`${s} text-emerald-500 shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>;
    if (status === 'error' || status === 'failed') return <svg className={`${s} text-red-500 shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>;
    if (status === 'active' || status === 'analyzing') return <div className={`${s} ${bw} border-blue-400 border-t-transparent rounded-full animate-spin shrink-0`} />;
    return <div className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} rounded-full border-2 border-gray-200 shrink-0`} />;
};

const PlatformLogo: React.FC<{ platform: string }> = ({ platform }) => {
    const s = 'w-4 h-4 shrink-0';
    switch (platform) {
        case 'reddit': return <svg className={s} viewBox="0 0 24 24" fill="#FF4500"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 13.23c.04.24.06.48.06.72 0 3.22-3.53 5.82-7.88 5.82S1.31 17.17 1.31 13.95c0-.26.02-.51.06-.78-.74-.39-1.24-1.17-1.24-2.07 0-1.29 1.04-2.33 2.33-2.33.59 0 1.13.22 1.54.58 1.56-1.03 3.6-1.66 5.84-1.72l1.17-5.21.03-.01 3.7.87c.25-.58.83-.99 1.51-.99a1.67 1.67 0 0 1 0 3.33c-.88 0-1.6-.68-1.66-1.55l-3.18-.75-.95 4.22c2.15.09 4.1.72 5.62 1.72.41-.36.95-.57 1.54-.57 1.29 0 2.33 1.04 2.33 2.33 0 .88-.49 1.65-1.21 2.04z" /></svg>;
        case 'x': return <svg className={s} viewBox="0 0 24 24" fill="#000"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>;
        case 'youtube': return <svg className={s} viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>;
        case 'telegram': return <svg className={s} viewBox="0 0 24 24" fill="#26A5E4"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.656 8.153c-.184 1.937-1.003 6.636-1.418 8.806-.176.918-.522 1.226-.856 1.256-.727.067-1.28-.48-1.984-.942-1.103-.722-1.726-1.173-2.797-1.878-1.238-.815-.435-1.264.27-1.997.185-.19 3.394-3.112 3.456-3.376.008-.033.015-.157-.058-.223-.074-.065-.182-.043-.261-.025-.112.025-1.9 1.207-5.36 3.545-.507.348-.966.518-1.378.509-.454-.01-1.326-.257-1.974-.468-.794-.258-1.426-.395-1.37-.834.028-.228.335-.463.92-.704 3.6-1.568 6-2.603 7.2-3.104 3.432-1.427 4.145-1.675 4.61-1.683.102-.002.332.024.48.144a.52.52 0 0 1 .175.334c.016.094.035.308.02.475z" /></svg>;
        case 'discord': return <svg className={s} viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.12-.098.246-.198.373-.292a.074.074 0 0 1 .078.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078-.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" /></svg>;
        case 'hackernews': return <svg className={s} viewBox="0 0 24 24" fill="#F0652F"><path d="M0 0v24h24V0H0zm12.8 14.4V20h-1.6v-5.6L7 4h1.8l3.2 6.4L15.2 4H17l-4.2 10.4z" /></svg>;
        case 'weibo': return <svg className={s} viewBox="0 0 24 24" fill="#E6162D"><path d="M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.739 5.443z" /></svg>;
        case 'wechat': return <svg className={s} viewBox="0 0 24 24" fill="#07C160"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.078.285-.022.58.143.802a.77.77 0 0 0 .63.326.687.687 0 0 0 .355-.096l1.862-1.095a.735.735 0 0 1 .563-.082 10.2 10.2 0 0 0 2.313.27c.236 0 .47-.012.7-.031a6.395 6.395 0 0 1-.236-1.709c0-3.605 3.36-6.53 7.499-6.53.254 0 .504.013.75.035C16.805 4.707 13.082 2.188 8.691 2.188z" /></svg>;
        default: return <svg className={s} viewBox="0 0 24 24" fill="#6B7280"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>;
    }
};

/** Prefer real site favicon from domain, fallback to platform icon. */
const SourceFavicon: React.FC<{ source: SearchSource }> = ({ source }) => {
    const [imgFailed, setImgFailed] = useState(false);
    const hasDomain = !!source.domain && source.domain.trim().length > 0;
    const shouldUseImage = hasDomain && !imgFailed;

    if (shouldUseImage) {
        return (
            <img
                src={`https://www.google.com/s2/favicons?domain=${source.domain}&sz=32`}
                alt=""
                className="w-4 h-4 rounded-sm shrink-0"
                onError={() => setImgFailed(true)}
            />
        );
    }

    return <PlatformLogo platform={source.favicon} />;
};

const SourceCard: React.FC<{ source: SearchSource }> = ({ source }) => {
    const content = (
        <>
            <div className="shrink-0 w-5 h-5 flex items-center justify-center"><SourceFavicon source={source} /></div>
            <span className="text-[12px] text-gray-600 truncate flex-1 leading-snug">{source.title}</span>
            <span className="text-[10px] text-gray-400 shrink-0 ml-2">{source.domain}</span>
        </>
    );
    const className = "flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer group";

    if (source.url) {
        return (
            <a href={source.url} target="_blank" rel="noreferrer" className={className} title={source.title}>
                {content}
            </a>
        );
    }

    return (
        <div className={className} title={source.title}>
            {content}
        </div>
    );
};

// ─── OKX Derivatives Card (inline above answer) ─────────
const okxFmtUsdCompact = (v: number | null | undefined, digits = 2): string => {
    if (v == null || !Number.isFinite(v)) return 'n/a';
    const abs = Math.abs(v);
    if (abs >= 1e12) return `$${(v / 1e12).toFixed(digits)}T`;
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(digits)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(digits)}M`;
    if (abs >= 1e3) return `$${(v / 1e3).toFixed(digits)}K`;
    return `$${v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 2 : 6 })}`;
};
const okxFmtPctSigned = (v: number | null | undefined): string => {
    if (v == null || !Number.isFinite(v)) return 'n/a';
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
};
const okxSummarizeWindow = (
    candles: Array<[number, number, number, number, number]> | undefined,
    n: number,
): { high: number; low: number; pct: number } | null => {
    if (!candles || !candles.length) return null;
    const rows = [...candles].sort((a, b) => b[0] - a[0]);
    const window = rows.slice(0, Math.min(n, rows.length));
    if (!window.length) return null;
    const latestClose = rows[0][4];
    let high = -Infinity;
    let low = Infinity;
    for (const r of window) {
        if (r[2] > high) high = r[2];
        if (r[3] < low) low = r[3];
    }
    const oldestOpen = window[window.length - 1][1];
    const pct = oldestOpen > 0 ? ((latestClose - oldestOpen) / oldestOpen) * 100 : NaN;
    return { high, low, pct };
};
// ─── ThinkingProcessSidePanel (modular right panel) ─────────
const ThinkingProcessSidePanel: React.FC<{
    thinking: ThinkingFlow;
    onClose: () => void;
    hideHeader?: boolean;
    chatMode?: string;
}> = ({ thinking, onClose, hideHeader, chatMode }) => {

    const isRoundtable = thinking.routedMode === 'roundtable' || chatMode === 'roundtable';

    // ── Sub-section renderers for Search Module ──
    const SocialSubSection: React.FC<{ section: SearchSubSection }> = ({ section }) => (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${section.status === 'done' ? 'bg-emerald-500' : section.status === 'active' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'
                    }`} />
                <span className={`text-[12px] font-semibold ${section.status === 'done' ? 'text-gray-700' : section.status === 'active' ? 'text-blue-600' : 'text-gray-300'
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
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${section.status === 'done' ? 'bg-emerald-500' : section.status === 'active' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'
                    }`} />
                <span className={`text-[12px] font-semibold ${section.status === 'done' ? 'text-gray-700' : section.status === 'active' ? 'text-blue-600' : 'text-gray-300'
                    }`}>{section.label}</span>
                {section.status === 'done' && section.totalFound && (
                    <span className="text-[10px] text-emerald-600 font-medium">{section.totalFound} connected</span>
                )}
            </div>
            {section.providers && (
                <div className="ml-4 flex flex-wrap gap-1.5 mb-2">
                    {section.providers.map((p, i) => (
                        <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${p.status === 'done' ? 'bg-emerald-50 text-emerald-700' :
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

    // ── Search Module Renderer (tool orchestration + web search) ──
    const SearchModule: React.FC<{ mod: ThinkingModule; toolTrace?: ToolTraceItem[]; planningMessage?: string }> = ({ mod, toolTrace, planningMessage }) => {
        const d = mod.data as SearchModuleData | undefined;
        const hasToolTrace = toolTrace && toolTrace.length > 0;
        const hasSearchData = !!d;
        if (!hasToolTrace && !planningMessage && !hasSearchData) return null;

        const overallStatus = mod.status || (hasToolTrace && toolTrace.some(t => t.status === 'running') ? 'active' : 'pending');

        return (
            <div>
                <div className="flex items-center gap-2.5 mb-3">
                    <StatusIcon status={overallStatus} />
                    <span className="text-[14px] font-bold text-gray-900">Searching</span>
                </div>
                <div className="ml-7 space-y-4 mb-3">
                    {/* ── Tool trace (data fetching steps) ── */}
                    {hasToolTrace && (
                        <div className="flex flex-wrap gap-1.5">
                            {toolTrace.map((t, i) => (
                                <span key={`${t.tool}-${i}`} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${t.status === 'running' ? 'bg-blue-50 text-blue-600 animate-pulse' :
                                    t.status === 'done' ? 'bg-emerald-50 text-emerald-700' :
                                        t.status === 'error' ? 'bg-red-50 text-red-600' :
                                            'bg-gray-50 text-gray-400'
                                    }`}>
                                    {t.status === 'running' ? '⟳' : t.status === 'done' ? '✓' : t.status === 'error' ? '✗' : '·'}
                                    {t.displayName}
                                    {t.status === 'done' && t.durationSec != null && (
                                        <span className="text-[9px] opacity-60 tabular-nums">{Number(t.durationSec).toFixed(1)}s</span>
                                    )}
                                </span>
                            ))}
                        </div>
                    )}
                    {/* ── Web / social search sources ── */}
                    {hasSearchData && (() => {
                        if (d.variant === 'combined' && d.sections) {
                            return d.sections.map((sec, i) =>
                                sec.id === 'social'
                                    ? <SocialSubSection key={i} section={sec} />
                                    : <DataProvidersSubSection key={i} section={sec} />
                            );
                        }
                        if (d.variant === 'social' && d.sources && d.sources.length > 0) {
                            return (
                                <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                                    {d.sources.map((src, i) => <SourceCard key={i} source={src} />)}
                                </div>
                            );
                        }
                        if (d.variant === 'data_providers' && d.providers) {
                            return (
                                <div className="flex flex-wrap gap-1.5">
                                    {d.providers.map((p, i) => (
                                        <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${p.status === 'done' ? 'bg-emerald-50 text-emerald-700' :
                                            p.status === 'active' ? 'bg-blue-50 text-blue-600 animate-pulse' :
                                                'bg-gray-50 text-gray-300'
                                            }`}>
                                            {p.status === 'done' ? '✓' : p.status === 'active' ? '⟳' : '·'} {p.name}
                                        </span>
                                    ))}
                                </div>
                            );
                        }
                        return null;
                    })()}
                </div>
            </div>
        );
    };

    // ── HTML Report Frame (Web output mode) ──
    // defined at module level as HtmlReportFrame

    // ── Analysis Module Renderer ──
    const AnalysisModule: React.FC<{ mod: ThinkingModule }> = ({ mod }) => {
        const d = mod.data as AnalysisModuleData | undefined;
        if (!d) return null;

        const stageIcons: Record<string, string> = {
            fundamental: '📊',
            technical: '📈',
            sentiment: '💬',
        };

        return (
            <div>
                <div className="flex items-center gap-2.5 mb-3">
                    <StatusIcon status={mod.status} />
                    <span className="text-[14px] font-bold text-gray-900">Analyzing</span>
                </div>
                <div className="ml-7 space-y-2.5 mb-3">
                    {d.stages.map((stage) => {
                        const hasResults = stage.status === 'done' && stage.result && stage.result.length > 0;
                        const icon = stageIcons[stage.id || ''] || '🔍';
                        return (
                            <div key={stage.id || stage.label} className={`rounded-xl border transition-all duration-300 overflow-hidden ${stage.status === 'done' ? 'border-gray-100 bg-gray-50/50' :
                                stage.status === 'active' ? 'border-blue-100 bg-blue-50/30' :
                                    'border-gray-100 bg-white'
                                }`}>
                                <div className="flex items-center gap-2 px-3 py-2">
                                    <span className="text-[13px]">{icon}</span>
                                    <span className={`text-[12px] font-medium flex-1 ${stage.status === 'done' ? 'text-gray-700' :
                                        stage.status === 'active' ? 'text-blue-600' : 'text-gray-400'
                                        }`}>{stage.label}</span>
                                    <StatusIcon status={stage.status} size="sm" />
                                </div>
                                {hasResults && (
                                    <div className="px-3 pb-2.5 flex flex-wrap gap-1.5">
                                        {stage.result.map((r, j) => (
                                            <span key={j} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${r.color || 'text-gray-600'}`}>
                                                <span className="text-gray-400 font-normal">{r.label}</span>
                                                <span className="font-semibold">{r.value}</span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {d.decision && (
                        <div className="rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-2.5 space-y-2">
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

        const hasGroups = d.panelists.some(p => p.group);
        const gurus = hasGroups ? d.panelists.filter(p => p.group === 'guru') : [];
        const analysts = hasGroups ? d.panelists.filter(p => p.group === 'analyst') : [];
        const ungrouped = hasGroups ? [] : d.panelists;

        const renderPanelist = (p: SimPanelist, i: number) => {
            const displayName = prettyAgentName(p.name);
            return (
                <div key={i} className="flex items-center gap-2.5">
                    <AgentAvatarImg nameOrId={p.name} size={24} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[12px] font-medium text-gray-700">{displayName}</span>
                            {p.status === 'active' && <span className="text-[10px] text-blue-500 animate-pulse">analyzing...</span>}
                        </div>
                        {p.status === 'done' && p.verdict && (
                            <span className={`text-[11px] ${(p.verdict === 'Buy' || p.verdict === 'Bullish') ? 'text-emerald-600' : (p.verdict === 'Sell' || p.verdict === 'Bearish') ? 'text-red-500' : 'text-yellow-600'}`}>
                                {p.verdict}
                            </span>
                        )}
                    </div>
                    <StatusIcon status={p.status} size="sm" />
                </div>
            );
        };

        return (
            <div>
                <div className="flex items-center gap-2.5 mb-2">
                    <StatusIcon status={mod.status} />
                    <span className="text-[14px] font-bold text-gray-900">Simulating</span>
                </div>
                <div className="ml-7 space-y-2 mb-3">
                    {ungrouped.map((p, i) => renderPanelist(p, i))}
                    {hasGroups && gurus.length > 0 && (
                        <>
                            {gurus.map((p, i) => renderPanelist(p, i))}
                        </>
                    )}
                    {hasGroups && analysts.length > 0 && (
                        <>
                            <div className="border-t border-gray-100 my-1" />
                            {analysts.map((p, i) => renderPanelist(p, i + gurus.length))}
                        </>
                    )}
                    {d.prediction && (
                        <div className="mt-2 bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                            <span className="text-[11px] text-gray-500 font-medium">Prediction</span>
                            <span className={`text-[12px] font-bold ${(d.prediction.verdict === 'Buy' || d.prediction.verdict === 'Bullish') ? 'text-emerald-600' : 'text-yellow-600'}`}>
                                {d.prediction.verdict}
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

                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ── Done Module Renderer ──
    const DoneModule: React.FC<{ mod: ThinkingModule }> = ({ mod }) => {
        const dur = (mod.data as any)?.duration;
        const showDur = typeof dur === 'number' && !Number.isNaN(dur) && dur > 0;
        // For roundtable, also compute elapsed from startTime
        const elapsed = thinking.startTime ? ((Date.now() - thinking.startTime) / 1000).toFixed(1) : null;
        const displayDur = showDur ? `${dur}s` : (elapsed && !thinking.isActive ? `${elapsed}s` : null);
        return (
            <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2.5">
                    <StatusIcon status="done" />
                    <span className="text-[14px] font-bold text-gray-900">Done</span>
                    {displayDur && <span className="text-[11px] text-gray-400 ml-auto">{displayDur}</span>}
                </div>
            </div>
        );
    };

    // ── Web3 Module Renderer (CoinGecko MCP) ──
    const Web3Module: React.FC<{ mod: ThinkingModule }> = ({ mod }) => {
        const d = (mod.data || {}) as { label?: string };
        const provider = d.label || 'CoinGecko MCP';
        return (
            <div>
                <div className="flex items-center gap-2.5 mb-3">
                    <StatusIcon status={mod.status} />
                    <span className="text-[14px] font-bold text-gray-900">Crypto</span>
                </div>
                <div className="ml-7 mb-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${mod.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700'
                        : mod.status === 'active'
                            ? 'bg-blue-50 text-blue-600 animate-pulse'
                            : 'bg-gray-50 text-gray-300'
                        }`}>
                        {mod.status === 'completed' ? '✓' : mod.status === 'active' ? '⟳' : '·'} {provider}
                    </span>
                </div>
            </div>
        );
    };

    // ══════════════════════════════════════════════════════════════
    // ── Roundtable 4-Phase Process View ──────────────────────────
    // ══════════════════════════════════════════════════════════════

    // Phase 1: Data Search
    const RtCategoryIcon: React.FC<{ id: string; className?: string }> = ({ id, className = 'w-4 h-4' }) => {
        switch (id) {
            case 'indicators':
                return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>;
            case 'news':
                return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" /></svg>;
            case 'social':
                return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>;
            case 'derivatives':
                return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 14l3-3 4 4 6-6M14 8h4v4" /></svg>;
            default:
                return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>;
        }
    };

    const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({});
    const toggleSection = (key: string) => setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
    const [expandedAgentDetail, setExpandedAgentDetail] = React.useState<string | null>(null);

    // ── Step number badge ──
    const StepBadge: React.FC<{ step: number; done: boolean }> = ({ step, done }) => (
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold border-2 transition-colors duration-300 shrink-0 ${
            done ? 'border-emerald-500 text-emerald-600 bg-emerald-50' : 'border-gray-200 text-gray-400 bg-white'
        }`}>{step}</span>
    );

    // ── Agent detail profiles for preparation phase ──
    const AGENT_PROFILES: Record<string, { bio: string; bioCN: string; tags: string[]; skills: string[]; framework: string; frameworkCN: string }> = {
        fundamental_specialist: {
            bio: 'Deep-dives into financial statements, earnings quality, and intrinsic value.',
            bioCN: '深入分析财务报表、盈利质量与内在价值。',
            tags: ['Financials', 'Earnings', 'Valuation'],
            skills: ['DCF Modeling', 'Ratio Analysis', 'Earnings Quality'],
            framework: 'Bottom-up fundamental analysis with emphasis on margin of safety.',
            frameworkCN: '自下而上的基本面分析，强调安全边际。',
        },
        valuation_specialist: {
            bio: 'Builds multi-scenario valuation models to determine fair value ranges.',
            bioCN: '构建多情景估值模型，确定公允价值区间。',
            tags: ['DCF', 'Comparable', 'Models'],
            skills: ['DCF', 'Relative Valuation', 'Sum-of-Parts'],
            framework: 'Multi-model convergence with scenario-weighted fair value.',
            frameworkCN: '多模型收敛，情景加权公允价值。',
        },
        macro_specialist: {
            bio: 'Tracks macro trends, interest rates, and policy shifts that move markets.',
            bioCN: '追踪宏观趋势、利率变化和影响市场的政策转变。',
            tags: ['Macro', 'Rates', 'Policy'],
            skills: ['Macro Forecasting', 'Cross-Asset', 'Policy Analysis'],
            framework: 'Top-down macro overlay with cross-asset correlation analysis.',
            frameworkCN: '自上而下宏观叠加与跨资产相关性分析。',
        },
        risk_specialist: {
            bio: 'Identifies tail risks, stress-tests portfolios, and models downside scenarios.',
            bioCN: '识别尾部风险，压力测试组合，建模下行情景。',
            tags: ['Risk', 'Hedging', 'Stress Test'],
            skills: ['VaR', 'Stress Testing', 'Scenario Analysis'],
            framework: 'Risk-first approach with pre-mortem analysis and Monte Carlo simulations.',
            frameworkCN: '风险优先方法，结合事前分析和蒙特卡洛模拟。',
        },
        allocation_specialist: {
            bio: 'Optimizes asset allocation across ETFs, sectors, and geographies.',
            bioCN: '优化ETF、行业和地区间的资产配置。',
            tags: ['ETF', 'Allocation', 'Diversification'],
            skills: ['MPT', 'Factor Exposure', 'Rebalancing'],
            framework: 'Modern portfolio theory with factor-based tilts.',
            frameworkCN: '现代投资组合理论与因子倾斜。',
        },
        fund_specialist: {
            bio: 'Evaluates fund performance, manager quality, and fee structures.',
            bioCN: '评估基金表现、管理人质量和费用结构。',
            tags: ['Funds', 'Alpha', 'Selection'],
            skills: ['Fund Screening', 'Alpha Analysis', 'Fee Optimization'],
            framework: 'Quantitative fund selection with qualitative manager assessment.',
            frameworkCN: '定量基金筛选与定性管理人评估。',
        },
        options_specialist: {
            bio: 'Designs options strategies and analyzes Greeks for risk/reward optimization.',
            bioCN: '设计期权策略并分析Greeks以优化风险/回报。',
            tags: ['Options', 'Greeks', 'Volatility'],
            skills: ['Options Pricing', 'Greeks Analysis', 'Vol Surface'],
            framework: 'Volatility-driven strategy selection with Greeks-based risk management.',
            frameworkCN: '波动率驱动策略选择与基于Greeks的风险管理。',
        },
        crypto_specialist: {
            bio: 'Analyzes crypto assets, on-chain data, and DeFi protocol metrics.',
            bioCN: '分析加密资产、链上数据和DeFi协议指标。',
            tags: ['Crypto', 'On-Chain', 'DeFi'],
            skills: ['On-Chain Analysis', 'Token Economics', 'Protocol Metrics'],
            framework: 'On-chain data analysis combined with token economic modeling.',
            frameworkCN: '链上数据分析与代币经济模型结合。',
        },
        macro_enhanced: {
            bio: 'Advanced macro analysis with emphasis on regime changes and cross-asset flows.',
            bioCN: '高级宏观分析，侧重于体制变化和跨资产流动。',
            tags: ['Deep Macro', 'Regimes', 'Flows'],
            skills: ['Regime Detection', 'Flow Analysis', 'Cycle Mapping'],
            framework: 'Multi-layer macro regime identification with flow-of-funds tracking.',
            frameworkCN: '多层宏观体制识别与资金流向追踪。',
        },
        risk_enhanced: {
            bio: 'Fractal risk modeling with advanced tail-risk and correlation-breakdown detection.',
            bioCN: '分形风险建模，高级尾部风险与相关性崩溃检测。',
            tags: ['Fractal', 'Tail Risk', 'Correlation'],
            skills: ['Fractal Analysis', 'Extreme Value Theory', 'Contagion Modeling'],
            framework: 'Non-linear risk modeling using fractal geometry and extreme value theory.',
            frameworkCN: '使用分形几何和极值理论的非线性风险建模。',
        },
        event_driven: {
            bio: 'Identifies catalysts, earnings surprises, and event-driven trading opportunities.',
            bioCN: '识别催化剂、盈利意外和事件驱动交易机会。',
            tags: ['Events', 'Catalysts', 'M&A'],
            skills: ['Event Detection', 'Catalyst Mapping', 'Timeline Analysis'],
            framework: 'Event timeline analysis with probability-weighted outcome modeling.',
            frameworkCN: '事件时间线分析与概率加权结果建模。',
        },
        sentiment_focus: {
            bio: 'Gauges market sentiment from social media, news flow, and positioning data.',
            bioCN: '从社交媒体、新闻流和持仓数据中衡量市场情绪。',
            tags: ['Sentiment', 'Social', 'NLP'],
            skills: ['NLP Sentiment', 'Social Listening', 'Positioning Analysis'],
            framework: 'Multi-source sentiment aggregation with contrarian signal detection.',
            frameworkCN: '多源情绪聚合与逆向信号检测。',
        },
        portfolio_view: {
            bio: 'Evaluates how positions fit within an overall portfolio context.',
            bioCN: '评估头寸在整体投资组合背景下的适配性。',
            tags: ['Portfolio', 'Fit', 'Impact'],
            skills: ['Portfolio Attribution', 'Risk Budgeting', 'Correlation Analysis'],
            framework: 'Portfolio-level impact assessment with marginal risk contribution analysis.',
            frameworkCN: '组合层面影响评估与边际风险贡献分析。',
        },
        buffett_style: {
            bio: 'Value-oriented investor focused on competitive moats and long-term compounding.',
            bioCN: '价值导向投资者，专注于竞争护城河和长期复利。',
            tags: ['Value', 'Moats', 'Compounding'],
            skills: ['Moat Analysis', 'Management Assessment', 'Margin of Safety'],
            framework: 'Seek wonderful companies at fair prices with durable competitive advantages.',
            frameworkCN: '寻找具有持久竞争优势的优秀公司，以合理价格买入。',
        },
        munger_style: {
            bio: 'Multi-disciplinary thinker using mental models and inversion to avoid mistakes.',
            bioCN: '多学科思考者，运用心智模型和逆向思维来避免错误。',
            tags: ['Mental Models', 'Inversion', 'Quality'],
            skills: ['Latticework of Models', 'Inversion', 'Circle of Competence'],
            framework: 'Invert, always invert. Multi-model thinking to reduce blind spots.',
            frameworkCN: '反过来想，总是反过来想。多模型思维以减少盲点。',
        },
        dalio_style: {
            bio: 'Macro investor focused on economic cycles, debt dynamics, and all-weather strategies.',
            bioCN: '宏观投资者，专注于经济周期、债务动态和全天候策略。',
            tags: ['Cycles', 'All-Weather', 'Principles'],
            skills: ['Debt Cycle Analysis', 'Risk Parity', 'Regime Mapping'],
            framework: 'Systematic macro framework based on the big debt cycle and risk parity.',
            frameworkCN: '基于大债务周期和风险平价的系统化宏观框架。',
        },
        soros_style: {
            bio: 'Reflexivity-based trader exploiting market misconceptions and feedback loops.',
            bioCN: '基于反身性的交易者，利用市场误解和反馈循环。',
            tags: ['Reflexivity', 'Macro Bets', 'Feedback Loops'],
            skills: ['Reflexivity Theory', 'Macro Trading', 'Position Sizing'],
            framework: 'Find markets where perception diverges from reality, bet on the correction.',
            frameworkCN: '寻找认知与现实偏离的市场，押注修正。',
        },
        lynch_style: {
            bio: 'Growth-at-a-reasonable-price investor who finds gems in everyday observations.',
            bioCN: '以合理价格寻找成长的投资者，从日常观察中发现宝石。',
            tags: ['GARP', 'PEG', 'Consumer Insight'],
            skills: ['PEG Analysis', 'Category Research', 'Scuttlebutt'],
            framework: 'Invest in what you know — find fast growers at reasonable valuations.',
            frameworkCN: '投资你了解的领域——以合理估值找到快速成长者。',
        },
    };

    // ── Agent Detail Modal ──
    const AgentDetailModal: React.FC<{ agentId: string; onClose: () => void }> = ({ agentId, onClose }) => {
        const agent = SUMMON_POOL.find(a => a.id === agentId);
        const profile = AGENT_PROFILES[agentId];
        if (!agent) return null;
        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
                <div className="bg-white rounded-2xl shadow-2xl w-[340px] max-h-[80vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
                    {/* Header */}
                    <div className="relative px-5 pt-5 pb-4 border-b border-gray-100">
                        <button onClick={onClose} className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100 transition-colors">
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        <div className="flex items-center gap-3">
                            <AgentAvatarImg nameOrId={agent.id} size={48} />
                            <div className="flex-1 min-w-0">
                                <h3 className="text-[15px] font-bold text-gray-900 truncate">{agent.name}</h3>
                                <p className="text-[11px] text-gray-400 mt-0.5">{agent.role}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${
                                agent.group === 'system' ? 'bg-blue-50 text-blue-500 border border-blue-100' :
                                agent.group === 'master' ? 'bg-purple-50 text-purple-500 border border-purple-100' :
                                'bg-gray-50 text-gray-400 border border-gray-100'
                            }`}>{agent.group === 'system' ? 'Core' : agent.group === 'master' ? 'Master' : 'Enhanced'}</span>
                            {profile && profile.tags.map((tag, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-gray-50 border border-gray-100 rounded text-[9px] text-gray-500 font-medium">{tag}</span>
                            ))}
                        </div>
                    </div>
                    {/* Body */}
                    {profile && (
                        <div className="px-5 py-4 space-y-4">
                            <div>
                                <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">About</h4>
                                <p className="text-[12px] text-gray-600 leading-relaxed">{profile.bio}</p>
                            </div>
                            <div>
                                <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Skills</h4>
                                <div className="flex flex-wrap gap-1.5">
                                    {profile.skills.map((s, i) => (
                                        <span key={i} className="px-2 py-1 bg-blue-50 border border-blue-100 rounded-lg text-[10px] text-blue-600 font-medium">{s}</span>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Thinking Framework</h4>
                                <p className="text-[12px] text-gray-600 leading-relaxed">{profile.framework}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ── Preparation Phase: Show selected agents ──
    const RtPhasePreparation: React.FC = () => {
        const prepStatus = thinking.rtPreparationStatus || 'loading';
        const agentIds = thinking.selectedAgentIds || [];
        const systemAgents = SUMMON_POOL.filter(a => a.group === 'system');
        const selectedAgents = SUMMON_POOL.filter(a => agentIds.includes(a.id) && a.group !== 'system');
        const allAgents = [...systemAgents, ...selectedAgents];
        const collapsed = !!collapsedSections['preparation'];

        return (
            <div>
                <button onClick={() => toggleSection('preparation')} className="flex items-center gap-2.5 mb-3 w-full text-left group">
                    <StepBadge step={1} done={prepStatus === 'done'} />
                    <div className="flex-1 min-w-0">
                        <span className="text-[14px] font-bold text-gray-900">Team Assembly</span>
                        <p className="text-[10px] text-gray-400 mt-0.5">{allAgents.length} agents assembled</p>
                    </div>
                    {prepStatus === 'loading' && <span className="text-[10px] text-blue-500 animate-pulse shrink-0">loading…</span>}
                    {/* Avatar stack */}
                    {prepStatus === 'done' && (
                        <div className="flex items-center shrink-0">
                            {allAgents.slice(0, 8).map((agent, i) => (
                                <div key={agent.id} className="rounded-full border-2 border-white" style={{ marginLeft: i === 0 ? 0 : -6, zIndex: allAgents.length - i }}>
                                    <AgentAvatarImg nameOrId={agent.id} size={22} />
                                </div>
                            ))}
                            {allAgents.length > 8 && <span className="text-[9px] text-gray-400 ml-1">+{allAgents.length - 8}</span>}
                        </div>
                    )}
                    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                {!collapsed && (
                    <div className="ml-7 grid grid-cols-2 gap-2.5 mb-3">
                        {allAgents.map((agent) => {
                            const profile = AGENT_PROFILES[agent.id];
                            const groupColor = agent.group === 'master' ? '#B45309' : agent.group === 'enhanced' ? '#0F766E' : '#4338CA';
                            return (
                                <div key={agent.id}
                                    className={`rounded-xl bg-white border shadow-sm p-3 transition-all duration-200 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 group/card ${
                                        agent.group === 'master'
                                            ? 'master-card-shine border-amber-200/80'
                                            : 'border-gray-200/80'
                                    }`}
                                    style={agent.group === 'master' ? {
                                        background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 40%, #fff7ed 100%)',
                                    } : undefined}
                                    onClick={() => setExpandedAgentDetail(agent.id)}
                                >
                                    {/* Avatar with per-agent colored ring */}
                                    <div className="flex items-center gap-2.5 mb-2">
                                        <div className="rounded-full p-[2px] shrink-0" style={{ background: `linear-gradient(135deg, ${agent.color}, ${agent.color}88)` }}>
                                            <div className="rounded-full border-2 border-white">
                                                <AgentAvatarImg nameOrId={agent.id} size={34} />
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-[12px] font-bold text-gray-900 block truncate group-hover/card:text-gray-700 transition-colors">{agent.name}</span>
                                            <span className="text-[9px] font-medium text-gray-400 block truncate">{agent.role}</span>
                                        </div>
                                    </div>
                                    {/* Bio */}
                                    {profile && (
                                        <p className="text-[9.5px] text-gray-500 leading-[1.45] line-clamp-2 mb-2">{profile.bio}</p>
                                    )}
                                    {!profile && (
                                        <p className="text-[9.5px] text-gray-400 truncate mb-2">{agent.role}</p>
                                    )}
                                    {/* Tags */}
                                    {profile && (
                                        <div className="flex flex-wrap gap-1">
                                            {profile.tags.map((tag, i) => (
                                                <span key={i} className="px-1.5 py-[3px] rounded-md text-[8px] font-semibold" style={{
                                                    backgroundColor: `${groupColor}10`,
                                                    color: groupColor,
                                                    border: `1px solid ${groupColor}20`,
                                                }}>{tag}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                {/* Agent detail modal */}
                {expandedAgentDetail && <AgentDetailModal agentId={expandedAgentDetail} onClose={() => setExpandedAgentDetail(null)} />}
            </div>
        );
    };

    const RtPhaseDataSearch: React.FC = () => {
        // Live-derive categories from the current modules so the panel updates
        // continuously as search / analysis events stream in (not only once at
        // consensus_done). If rtDataSearch was already populated by a completed
        // consensus (history restore), merge it over the derived one.
        const derived = deriveRtDataSearchFromModules(thinking.modules);
        const saved = thinking.rtDataSearch;
        const enriched: RtDataCategory[] = saved
            ? derived.map(d => {
                const s = saved.find(x => x.id === d.id);
                if (!s) return d;
                // Prefer saved data when it's more complete
                return {
                    ...d,
                    ...s,
                    status: s.status === 'done' ? 'done' : d.status,
                    sources: s.sources && s.sources.length > 0 ? s.sources : d.sources,
                    items: s.items && s.items.length > 0 ? s.items : d.items,
                    count: s.count ?? d.count,
                };
            })
            : derived;

        const anyActive = enriched.some(c => c.status === 'active');
        const allDone = enriched.length > 0 && enriched.every(c => c.status === 'done');
        const phaseStatus = allDone ? 'done' : anyActive ? 'active' : 'pending';
        const collapsed = !!collapsedSections['dataCollection'];

        return (
            <div>
                <button onClick={() => toggleSection('dataCollection')} className="flex items-center gap-2.5 mb-3 w-full text-left group">
                    <StepBadge step={2} done={phaseStatus === 'done'} />
                    <span className="text-[14px] font-bold text-gray-900 flex-1">Data Collection</span>
                    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                {!collapsed && (
                    <div className="ml-7 space-y-2.5 mb-3">
                        {enriched.map((cat) => (
                            <div key={cat.id} className={`rounded-xl border px-3 py-2.5 transition-all duration-300 ${
                                cat.status === 'done' ? 'border-gray-100 bg-gray-50/50' :
                                cat.status === 'active' ? 'border-blue-100 bg-blue-50/30' :
                                'border-gray-100 bg-white'
                            }`}>
                                <div className="flex items-center gap-2.5">
                                    <span className={`shrink-0 ${
                                        cat.status === 'done' ? 'text-gray-500' :
                                        cat.status === 'active' ? 'text-blue-500' : 'text-gray-300'
                                    }`}><RtCategoryIcon id={cat.id} /></span>
                                    <span className={`text-[12px] font-medium flex-1 ${
                                        cat.status === 'done' ? 'text-gray-700' :
                                        cat.status === 'active' ? 'text-blue-600' : 'text-gray-400'
                                    }`}>{cat.label}</span>
                                    {cat.count != null && cat.status === 'done' && (
                                        <span className="text-[10px] text-emerald-600 font-medium">{cat.count} items</span>
                                    )}
                                    {cat.status === 'active' && (
                                        <span className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
                                    )}
                                </div>
                                {cat.items && cat.items.length > 0 && cat.status === 'done' && (
                                    <div className="mt-2 flex flex-wrap gap-1.5 ml-6">
                                        {cat.items.map((item, j) => (
                                            <span key={j} className="px-2 py-0.5 bg-white border border-gray-100 rounded-md text-[10px] text-gray-500 font-medium">{item}</span>
                                        ))}
                                    </div>
                                )}
                                {cat.sources && cat.sources.length > 0 && cat.status === 'done' && (
                                    <div className="mt-2 ml-6 space-y-0.5">
                                        {cat.sources.map((src, j) => {
                                            const platformKey = src.favicon && !src.favicon.startsWith('http')
                                                ? src.favicon
                                                : src.domain?.replace(/\.com$|\.org$|\.io$/, '') || '';
                                            return (
                                                <a key={j} href={src.url} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-2 py-1 hover:opacity-80 transition-opacity group/src">
                                                    <div className="shrink-0 w-4 h-4 flex items-center justify-center">
                                                        <PlatformLogo platform={platformKey} />
                                                    </div>
                                                    <span className="text-[10px] text-gray-500 group-hover/src:text-gray-700 truncate flex-1">{src.title}</span>
                                                    <span className="text-[9px] text-gray-300 shrink-0">{src.domain}</span>
                                                </a>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // Phase 2: Round 1 — Initial Inference
    const [expandedAgents, setExpandedAgents] = React.useState<Record<string, boolean>>({});
    const toggleAgent = (key: string) => setExpandedAgents(prev => ({ ...prev, [key]: !prev[key] }));

    const RtPhaseRound1: React.FC = () => {
        const round = thinking.rtRounds?.[0];
        if (!round) return null;
        const allDone = round.agents.every(a => a.status === 'done');
        const anyActive = round.agents.some(a => a.status === 'active');
        const collapsed = !!collapsedSections['round1'];

        const getVerdictColor = (v?: string) => v === 'Bullish' ? 'text-emerald-600' : v === 'Bearish' ? 'text-red-500' : 'text-amber-600';
        const getAgentColor = (id: string) => SUMMON_POOL.find(a => a.id === id)?.color || '#6B7280';

        return (
            <div>
                <button onClick={() => toggleSection('round1')} className="flex items-center gap-2.5 mb-3 w-full text-left group">
                    <StepBadge step={1} done={allDone} />
                    <div className="flex-1 min-w-0">
                        <span className="text-[14px] font-bold text-gray-900">Round 1 · Thesis Formation</span>
                        <p className="text-[10px] text-gray-400 mt-0.5">Generating analytical conclusions</p>
                    </div>
                    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 shrink-0 ${collapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                {!collapsed && (
                    <div className="ml-7 space-y-2 mb-3">
                        {round.agents.map((agent) => {
                            const verdictColor = getVerdictColor(agent.verdict);
                            const agentColor = getAgentColor(agent.agentId);
                            const agentKey = `r1-${agent.agentId}`;
                            const isExpanded = !!expandedAgents[agentKey];
                            const hasLongReasoning = agent.reasoning && agent.reasoning.length > 120;
                            return (
                                <div key={agent.agentId} className={`rounded-xl border px-3 py-2.5 transition-all duration-300 ${
                                    agent.status === 'done' ? 'border-gray-100 bg-gray-50/40' :
                                    agent.status === 'active' ? 'border-blue-100 bg-blue-50/30 shadow-sm' :
                                    'border-gray-100 bg-white'
                                }`}>
                                    <div className="flex items-center gap-2.5">
                                        <div className="rounded-full p-[2px] shrink-0" style={{ background: `linear-gradient(135deg, ${agentColor}, ${agentColor}88)` }}>
                                            <div className="rounded-full border-2 border-white">
                                                <AgentAvatarImg nameOrId={agent.agentId} size={28} />
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-[12px] font-semibold text-gray-800 block truncate">{agent.agentName}</span>
                                            {agent.status === 'active' && <span className="text-[10px] text-blue-500 animate-pulse">analyzing…</span>}
                                            {agent.status === 'done' && agent.verdict && (
                                                <div className="mt-0.5">
                                                    <span className={`text-[11px] font-bold ${verdictColor}`}>{agent.verdict}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {agent.status === 'done' && agent.reasoning && (
                                        <div className="mt-1.5 ml-[40px]">
                                            <p className={`text-[10px] text-gray-500 leading-relaxed ${!isExpanded && hasLongReasoning ? 'line-clamp-4' : ''}`}>{agent.reasoning}</p>
                                            {hasLongReasoning && (
                                                <button onClick={() => toggleAgent(agentKey)} className="text-[10px] text-blue-500 hover:text-blue-600 mt-1 font-medium">
                                                    {isExpanded ? 'Show less' : 'Show more'}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    // Phase 3: Round 2 — Cross-validation (chat-style conversation)
    const RtPhaseRound2: React.FC = () => {
        const round = thinking.rtRounds?.[1];
        if (!round) return null;
        const allDone = round.agents.every(a => a.status === 'done');
        const anyActive = round.agents.some(a => a.status === 'active');
        const mindChanges = round.agents.filter(a => a.changedMind).length;
        const collapsed = !!collapsedSections['round2'];

        const getVerdictColor = (v?: string) => v === 'Bullish' ? 'text-emerald-600' : v === 'Bearish' ? 'text-red-500' : 'text-amber-600';
        const getVerdictBg = (v?: string) => v === 'Bullish' ? 'bg-emerald-50 border-emerald-200' : v === 'Bearish' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200';
        const getAgentColor = (id: string) => SUMMON_POOL.find(a => a.id === id)?.color || '#6B7280';

        return (
            <div>
                <button onClick={() => toggleSection('round2')} className="flex items-center gap-2.5 mb-3 w-full text-left group">
                    <StepBadge step={2} done={allDone} />
                    <div className="flex-1 min-w-0">
                        <span className="text-[14px] font-bold text-gray-900">Round 2 · Cross Validation</span>
                        <p className="text-[10px] text-gray-400 mt-0.5">Agents debate, challenge, and re-evaluate</p>
                    </div>
                    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 shrink-0 ${collapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                {!collapsed && (
                    <div className="ml-7 space-y-3 mb-3">
                        {round.agents.map((agent, idx) => {
                            const verdictColor = getVerdictColor(agent.verdict);
                            const agentColor = getAgentColor(agent.agentId);
                            const agentKey = `r2-${agent.agentId}`;
                            const isExpanded = !!expandedAgents[agentKey];
                            const hasLongReasoning = agent.reasoning && agent.reasoning.length > 120;
                            // Bearish on the right, Bullish & Neutral on the left
                            const isLeft = agent.verdict !== 'Bearish';
                            return (
                                <div key={agent.agentId} className={`flex gap-2 ${isLeft ? '' : 'flex-row-reverse'}`}>
                                    {/* Avatar */}
                                    <div className="shrink-0 mt-0.5">
                                        <div className="rounded-full p-[2px]" style={{ background: `linear-gradient(135deg, ${agentColor}, ${agentColor}88)` }}>
                                            <div className="rounded-full border-2 border-white">
                                                <AgentAvatarImg nameOrId={agent.agentId} size={26} />
                                            </div>
                                        </div>
                                    </div>
                                    {/* Chat bubble */}
                                    <div className={`flex-1 min-w-0 max-w-[85%]`}>
                                        <div className={`flex items-center gap-1.5 mb-0.5 ${isLeft ? '' : 'justify-end'}`}>
                                            <span className="text-[11px] font-semibold text-gray-700">{agent.agentName}</span>
                                            {agent.crossReferences && agent.crossReferences.length > 0 && (
                                                <span className="text-[9px] text-gray-400">
                                                    → {agent.crossReferences.join(', ')}
                                                </span>
                                            )}
                                            {agent.status === 'done' && agent.verdict && (
                                                <span className={`text-[9px] font-bold px-1.5 py-[1px] rounded-full ${
                                                    agent.verdict === 'Bullish' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                                                    agent.verdict === 'Bearish' ? 'bg-red-50 text-red-500 border border-red-200' :
                                                    'bg-amber-50 text-amber-600 border border-amber-200'
                                                }`}>
                                                    {agent.verdict}
                                                </span>
                                            )}
                                        </div>
                                        <div className={`rounded-2xl px-3 py-2 border transition-all duration-300 ${
                                            agent.status === 'active' ? 'border-blue-200 bg-blue-50/40' :
                                            isLeft ? 'border-gray-100 bg-gray-50/60' : 'border-gray-100 bg-white'
                                        }`} style={{ borderRadius: isLeft ? '4px 16px 16px 16px' : '16px 4px 16px 16px' }}>
                                            {agent.status === 'active' && <span className="text-[10px] text-blue-500 animate-pulse">re-evaluating…</span>}
                                            {agent.status === 'done' && agent.reasoning && (
                                                <div>
                                                    <p className={`text-[10px] text-gray-500 leading-relaxed ${!isExpanded && hasLongReasoning ? 'line-clamp-4' : ''}`}>{agent.reasoning}</p>
                                                    {hasLongReasoning && (
                                                        <button onClick={() => toggleAgent(agentKey)} className="text-[10px] text-blue-500 hover:text-blue-600 mt-1 font-medium">
                                                            {isExpanded ? 'Show less' : 'Show more'}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {allDone && mindChanges > 0 && (
                            <div className="mt-1 px-3 py-2 bg-amber-50/60 rounded-xl border border-amber-100/60 text-center">
                                <span className="text-[10px] text-amber-700 font-medium">
                                    ↻ {mindChanges} agent{mindChanges > 1 ? 's' : ''} changed conclusion after cross-validation
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // Phase 4: Consensus & Report
    const RtPhaseConsensus: React.FC = () => {
        const consensus = thinking.rtConsensus;
        if (!consensus) return null;

        const conflictPct = consensus.conflictRate ?? 0;
        const hasConsensus = consensus.hasConsensus;
        const reportStatus = thinking.rtReportStatus || 'pending';
        const collapsed = !!collapsedSections['consensus'];

        return (
            <div>
                <button onClick={() => toggleSection('consensus')} className="flex items-center gap-2.5 mb-3 w-full text-left group">
                    <StepBadge step={3} done={consensus.status === 'done'} />
                    <span className="text-[14px] font-bold text-gray-900 flex-1">Consensus & Report</span>
                    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 shrink-0 ${collapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                {!collapsed && (
                    <div className="ml-7 space-y-3 mb-3">
                        {/* Agent conclusions summary */}
                        {consensus.agentConclusions.length > 0 && (
                            <div className="space-y-1.5">
                                {consensus.agentConclusions.map((ac, i) => {
                                    const color = ac.verdict === 'Bullish' ? 'text-emerald-600' : ac.verdict === 'Bearish' ? 'text-red-500' : 'text-amber-600';
                                    return (
                                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50/50">
                                            <span className="text-[11px] text-gray-600 font-medium flex-1 truncate">{ac.agentName}</span>
                                            <span className={`text-[11px] font-bold ${color}`}>{ac.verdict}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Conflict rate */}
                        {consensus.status === 'done' && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] text-gray-500 font-medium">Agreement</span>
                                    <span className={`text-[11px] font-bold ${conflictPct > 50 ? 'text-red-500' : conflictPct > 25 ? 'text-amber-500' : 'text-emerald-600'}`}>
                                        {100 - conflictPct}%
                                    </span>
                                </div>
                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-700 ${
                                        conflictPct > 50 ? 'bg-red-400' : conflictPct > 25 ? 'bg-amber-400' : 'bg-emerald-400'
                                    }`} style={{ width: `${100 - conflictPct}%` }} />
                                </div>

                            </div>
                        )}

                        {/* Final verdict */}
                        {consensus.finalVerdict && (
                            <div className="bg-gradient-to-r from-gray-50 to-blue-50/30 rounded-xl px-4 py-3 border border-gray-100">
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] font-bold text-gray-900">Final Verdict</span>
                                    <span className={`text-[13px] font-bold ${
                                        consensus.finalVerdict === 'Bullish' ? 'text-emerald-600' :
                                        consensus.finalVerdict === 'Bearish' ? 'text-red-500' : 'text-amber-600'
                                    }`}>{consensus.finalVerdict}</span>
                                </div>
                            </div>
                        )}

                        {/* Report generation status */}
                        <div className="flex items-center gap-2 pt-1">
                            <StatusIcon status={reportStatus === 'done' ? 'completed' : reportStatus === 'active' ? 'active' : 'pending'} size="sm" />
                            <span className={`text-[12px] font-medium ${
                                reportStatus === 'done' ? 'text-gray-600' :
                                reportStatus === 'active' ? 'text-blue-600' : 'text-gray-300'
                            }`}>Final Report</span>
                            {reportStatus === 'active' && <span className="text-[10px] text-blue-500 animate-pulse ml-auto">generating…</span>}
                            {reportStatus === 'done' && <span className="text-[10px] text-emerald-500 ml-auto font-medium">Complete</span>}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ── Roundtable ordered view ──
    const RoundtableProcessView: React.FC = () => {
        const hasR1 = !!thinking.rtRounds?.[0];
        const hasR2 = !!thinking.rtRounds?.[1];
        const hasCons = !!thinking.rtConsensus;

        return (
            <div className="space-y-6">
                {/* ── Section I: Preparation ── */}
                <div>
                    <h3 className="text-[13px] font-extrabold text-gray-800 tracking-wide mb-4">Preparation</h3>
                    <div className="space-y-5 ml-1">
                        <RtPhasePreparation />
                        <RtPhaseDataSearch />
                    </div>
                </div>

                {/* ── Section II: Roundtable ── */}
                {(hasR1 || hasR2 || hasCons) && (
                    <div>
                        <h3 className="text-[13px] font-extrabold text-gray-800 tracking-wide mb-4">Roundtable</h3>
                        <div className="space-y-5 ml-1">
                            {hasR1 && <RtPhaseRound1 />}
                            {hasR2 && <RtPhaseRound2 />}
                            {hasCons && <RtPhaseConsensus />}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ── Compute ordered modules list ──
    const orderedModules = (() => {
        const mods: { key: string; element: React.ReactNode }[] = [];

        // Search module
        const searchMod = thinking.modules.find(m => m.type === 'search');
        const hasToolTrace = thinking.toolTrace && thinking.toolTrace.length > 0;
        const hasPlanning = !!thinking.planningMessage;
        const hasSearch = !!searchMod;
        if (hasToolTrace || hasPlanning || hasSearch) {
            mods.push({
                key: 'search',
                element: <SearchModule
                    mod={searchMod || { type: 'search', status: 'active' }}
                    toolTrace={thinking.toolTrace}
                    planningMessage={thinking.planningMessage}
                />,
            });
        }

        // Remaining modules
        for (const mod of thinking.modules) {
            if (mod.type === 'search') continue;
            if (mod.type === 'done' && mod.status !== 'completed') continue;
            switch (mod.type) {
                case 'analysis':
                    mods.push({ key: 'analysis', element: <AnalysisModule mod={mod} /> });
                    break;
                case 'simulation':
                    mods.push({ key: 'simulation', element: <SimulationModule mod={mod} /> });
                    break;
                case 'consensus':
                    mods.push({ key: 'consensus', element: <ConsensusModule mod={mod} /> });
                    break;
                case 'web3':
                    mods.push({ key: 'web3', element: <Web3Module mod={mod} /> });
                    break;
                case 'done':
                    mods.push({ key: 'done', element: <DoneModule mod={mod} /> });
                    break;
            }
        }
        return mods;
    })();

    return (
        <div className="flex flex-col h-full bg-white">
            {!hideHeader && (
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                    <h2 className="text-[14px] font-bold text-gray-900">Thinking Process</h2>
                    {isRoundtable && <p className="text-[10px] text-indigo-500 font-medium mt-0.5">Roundtable Mode</p>}
                </div>
                <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            )}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {isRoundtable ? (
                    <RoundtableProcessView />
                ) : (
                    orderedModules.map((item) => (
                        <div key={item.key}>{item.element}</div>
                    ))
                )}
            </div>
        </div>
    );
};

// ─── Summarize user question into a short topic title ──────
const STOP_WORDS = new Set(['THE', 'AND', 'FOR', 'NOT', 'ARE', 'BUT', 'HOW', 'WHY', 'CAN', 'YOU', 'HAS', 'WAS', 'HIS', 'HER', 'ALL', 'ANY', 'WHO', 'ITS', 'GET', 'LET', 'MAY', 'OUR', 'SAY', 'SHE', 'TOO', 'USE', 'WAY', 'NOW']);
function summarizeTitle(raw: string): string {
    if (!raw) return 'New Chat';
    const q = raw.replace(/[？?！!。]+$/g, '').trim();
    const tickers = [...new Set((q.match(/\b[A-Z]{2,5}\b/g) || []).filter(t => !STOP_WORDS.has(t)))];

    const cmpMatch = q.match(/(?:compare|对比|vs\.?)\s+(.{2,15})\s+(?:vs\.?|and|与|和|跟)\s+(.{2,15})/i);
    if (cmpMatch) return `${cmpMatch[1].trim()} vs ${cmpMatch[2].trim().replace(/\s*(fundamentals|for|的|基本面).*/i, '')} Comparison`;

    // risk-reward pattern: must be checked before generic analyze/risk rules
    if (/risk[\s-]reward/i.test(q)) {
        return tickers.length > 0 ? `${tickers[0]} Risk-Reward Analysis` : 'Risk-Reward Analysis';
    }

    const analyzeMatch = q.match(/(?:analyze|analysis|分析|研究|evaluate|评估)\s+(.{2,50}?)(?:\s+(?:stock|recent|latest|最近|performance|表现|情况).*)?$/i);
    if (analyzeMatch) {
        if (tickers.length > 0) return `${tickers.slice(0, 2).join(' & ')} Analysis`;
        const captured = analyzeMatch[1].replace(/^(the|a|an|this)\s+/i, '').replace(/'s$/, '').trim();
        const words = captured.split(/\s+/).slice(0, 4).join(' ');
        return `${words} Analysis`;
    }

    const buyMatch = q.match(/(?:is|should|are|值得|适合|能不能|可以)\s+(.{2,20}?)\s+(?:still\s+)?(?:a\s+)?(?:buy|worth|invest|入手|买入|购买)/i);
    if (buyMatch) return `${buyMatch[1].replace(/^(i|we)\s+/i, '').trim()} Investment Outlook`;

    if (/risk|风险/.test(q)) {
        if (tickers.length > 0) return `${tickers[0]} Risk Assessment`;
        const subject = q.match(/(?:risk|风险)\s+(?:(?:assessment|评估|of|for)\s+)?(.{2,20})/i);
        return subject ? `${subject[1].trim()} Risk Assessment` : 'Risk Assessment';
    }
    if (/forecast|predict|预测|simulate|模拟/.test(q)) {
        return tickers.length > 0 ? `${tickers.join('/')} Forecast` : 'Market Forecast';
    }
    if (/demand|市场|landscape|competitive|竞品|行业/.test(q)) {
        const topicMatch = q.match(/(?:demand|市场|landscape|competitive|行业)\s*(?:for|of|about|关于)?\s*(.{2,25})/i);
        return topicMatch ? `${topicMatch[1].replace(/[？?]$/, '').trim()} Market Research` : 'Market Research';
    }
    if (/^(which|what|哪些|哪个|推荐)/i.test(q)) {
        const topicMatch = q.match(/(?:which|what|哪些|哪个)\s+(.{2,30}?)(?:\s+(?:have|has|are|is|worth|best|最好|right now))/i);
        return topicMatch ? `${topicMatch[1].trim()} Overview` : tickers.length > 0 ? `${tickers[0]} Overview` : 'Investment Overview';
    }
    if (tickers.length > 0) return `${tickers.slice(0, 2).join(' & ')} Analysis`;

    const core = q
        .replace(/^(help me|please|帮我|请|能不能|可以帮我|i want to|i need to)\s+/i, '')
        .replace(/^(search|find|look|check|tell me|give me|show me)\s+(for|about|into|up)?\s*/i, '')
        .trim();
    const words = core.split(/\s+/);
    const short = words.length > 5 ? words.slice(0, 5).join(' ') : core;
    return short.length > 25 ? short.slice(0, 22) + '…' : short;
}

// ═════════════════════════════════════════════════════════════
// SuperAgentChat — Main Component
// ═════════════════════════════════════════════════════════════
interface SuperAgentChatProps {
    initialMessage: string;
    initialImages?: ChatImagePayload[];
    onBack: () => void;
    agentCount?: number;
    selectedAgentId?: string;
    initialSessionId?: string;
    /** From home screen mode selector (not used when opening history-only session). */
    initialChatMode?: 'auto' | 'fast' | 'roundtable';
}

/** Replace bare citations with linked tags and remove malformed URL fragments. */
function injectSourceUrls(text: string, sources?: SearchSource[]): string {
    if (!sources || sources.length === 0) return text;

    const lookup = new Map<string, { url: string; label: string }>();
    for (const s of sources) {
        if (!s.url) continue;
        const entry = { url: s.url, label: s.domain };
        lookup.set(s.title.toLowerCase(), entry);
        lookup.set(s.domain.toLowerCase(), entry);

        const short = s.domain.replace(/\.\w+$/, '').toLowerCase();
        if (short.length > 2) lookup.set(short, entry);

        const parts = short.split('.');
        if (parts.length >= 2) {
            const reversed = parts.reverse().join(' ');
            if (!lookup.has(reversed)) lookup.set(reversed, entry);
        }

        const base = s.domain.replace(/\..*$/, '').toLowerCase();
        if (base.length > 3 && !lookup.has(base)) lookup.set(base, entry);
    }

    let result = text.replace(/\r\n/g, '\n');

    // Remove standalone leaked URL path fragments: /stocks/articles/xxx.html)
    result = result.replace(
        /(^|[\s（(])\/[a-z0-9._%+-]+(?:\/[a-z0-9._%+-]+){2,}(?:\.[a-z0-9]{2,8})?\)?(?=\s|$|[，。；,.;!?])/gim,
        '$1',
    );

    // Remove path garbage attached right after a valid citation/link.
    result = result.replace(/(\[[^\]]+\]\([^)]+\))\s*\/[^\s)）]+/g, '$1');
    result = result.replace(/(\[[^\]]+\]\([^)]+\))\s*\.[a-z]{2,8}\/[^\s)）]+/gi, '$1');

    // Remove malformed punycode/url shards that often leak from broken markdown parsing.
    result = result.replace(/\[\s*xn--[^\]]+\]/gi, '');
    result = result.replace(/\bxn--[a-z0-9-]{6,}(?:\.[a-z0-9-]+)*\b/gi, '');

    // Remove duplicate consecutive markdown links: [A](url)[A](url) → [A](url)
    result = result.replace(/(\[[^\]]+\]\([^)]+\))\s*\1/g, '$1');

    // Strip stray closing parens/brackets after a valid markdown link
    result = result.replace(/(\[[^\]]+\]\([^)]+\))\s*[)\]]+/g, '$1');

    // Fix bare bracket citations [text] NOT followed by (
    result = result.replace(/\[([^\[\]]+)\](?!\()/g, (match, label) => {
        const hit = lookup.get(label.toLowerCase().trim());
        if (hit) return `[${label}](${hit.url})`;
        return match;
    });

    const phrases: { pattern: string; url: string }[] = [];
    const seenPatterns = new Set<string>();
    for (const s of sources) {
        if (!s.url) continue;

        const addPattern = (pattern: string) => {
            const key = pattern.toLowerCase();
            if (key.length <= 3 || seenPatterns.has(key)) return;
            seenPatterns.add(key);
            phrases.push({ pattern, url: s.url! });
        };

        addPattern(s.domain);
        const short = s.domain.replace(/\.\w+$/, '');
        addPattern(short);

        const parts = short.toLowerCase().split('.');
        if (parts.length >= 2) {
            const reversed = parts
                .reverse()
                .map(p => p.charAt(0).toUpperCase() + p.slice(1))
                .join(' ');
            addPattern(reversed);
        }

        addPattern(s.domain.replace(/\..*$/, ''));
    }
    phrases.sort((a, b) => b.pattern.length - a.pattern.length);

    for (const { pattern, url } of phrases) {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b(${escaped})\\b`, 'gi');
        let replaced = false;
        result = result.replace(re, (m, captured, offset: number, whole: string) => {
            if (replaced) return m;
            const prev = whole[offset - 1] || '';
            const next2 = whole.slice(offset + captured.length, offset + captured.length + 2);
            // Skip if already part of markdown link syntax [label](url)
            if (prev === '[' || next2 === '](') return m;
            // Skip if this token is likely in a raw URL fragment
            if (/[/:@.-]/.test(prev)) return m;
            replaced = true;
            return `[${captured}](${url})`;
        });
    }

    // Remove parenthesised citation wrappers like （[Link](url) 数据）
    result = result.replace(/[（(]\s*(\[[^\]]+\]\([^)]+\))\s*(?:数据|data|来源|source)?\s*[)）]/gi, ' $1');

    // Move markdown citations to the end of normal prose lines so badges do not
    // interrupt reading in the middle of a sentence.
    result = result
        .split('\n')
        .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (/^\s*[#>|-]/.test(line)) return line;
            if (/^\s*\d+\.\s+/.test(line)) return line;
            if (/\|/.test(line)) return line;
            const citationRe = /\s*(\[[^\]]+\]\((https?:\/\/[^)]+)\))/g;
            const citations = Array.from(line.matchAll(citationRe)).map((m) => m[1]);
            if (citations.length === 0) return line;
            const uniqueCitations = Array.from(new Set(citations));
            let body = line.replace(citationRe, ' ').replace(/\s{2,}/g, ' ').trim();
            body = body.replace(/\s+([，。；！？,.!?])/g, '$1');
            const tail = uniqueCitations.join(' ');
            return body ? `${body} ${tail}` : tail;
        })
        .join('\n');

    // Clean repeated blank lines left by cleanup.
    result = result.replace(/\n{3,}/g, '\n\n').trim();
    return result;
}

const SuperAgentChat: React.FC<SuperAgentChatProps> = ({
    initialMessage,
    initialImages = [],
    onBack,
    agentCount = 2,
    selectedAgentId,
    initialSessionId,
    initialChatMode
}) => {
    const [sessionId] = useState(() => {
        if (initialSessionId) return initialSessionId;
        try {
            let s = sessionStorage.getItem(SA_SID_KEY);
            if (!s) {
                s = crypto.randomUUID();
                sessionStorage.setItem(SA_SID_KEY, s);
            }
            return s;
        } catch {
            return crypto.randomUUID();
        }
    });

    const [messages, setMessages] = useState<Message[]>(() => {
        try {
            const raw = sessionStorage.getItem(SA_PENDING_KEY);
            if (!raw) return [];
            const p = JSON.parse(raw) as {
                sessionId?: string;
                userContent?: string;
                userImages?: ChatImagePayload[];
                streaming?: boolean;
            };
            const pendingImages = Array.isArray(p.userImages) ? p.userImages : [];
            // When viewing an existing session, the "effective" sid is initialSessionId.
            // Falling back to SA_SID_KEY is only correct when starting a brand-new chat.
            const effectiveSid = initialSessionId || sessionStorage.getItem(SA_SID_KEY);
            if (!p?.streaming || (typeof p.userContent !== 'string' && pendingImages.length === 0) || p.sessionId !== effectiveSid) return [];
            return [
                { role: 'user', content: p.userContent || '', images: pendingImages, timestamp: new Date().toLocaleTimeString() },
                {
                    role: 'assistant',
                    content: '',
                    timestamp: new Date().toLocaleTimeString(),
                    isStreaming: true,
                },
            ];
        } catch {
            return [];
        }
    });

    const [inputText, setInputText] = useState('');
    const [isStreaming, setIsStreaming] = useState(() => {
        try {
            const raw = sessionStorage.getItem(SA_PENDING_KEY);
            if (!raw) return false;
            const p = JSON.parse(raw) as { streaming?: boolean; sessionId?: string };
            const effectiveSid = initialSessionId || sessionStorage.getItem(SA_SID_KEY);
            return !!(p?.streaming && p.sessionId === effectiveSid);
        } catch {
            return false;
        }
    });
    const [thinkingProcesses, setThinkingProcesses] = useState<Record<number, ThinkingFlow>>({});
    // True while fetching session history from the server (prevents blank-page flash).
    const [historyLoading, setHistoryLoading] = useState(!!initialSessionId);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const lastUserMsgRef = useRef<HTMLDivElement>(null);
    const hasSentInitial = useRef(false);
    const replayRecoverAttemptedRef = useRef(false);
    const restoredFromPendingRef = useRef(
        (() => {
            try {
                const raw = sessionStorage.getItem(SA_PENDING_KEY);
                if (!raw) return false;
                const p = JSON.parse(raw) as { streaming?: boolean; sessionId?: string };
                const effectiveSid = initialSessionId || sessionStorage.getItem(SA_SID_KEY);
                return !!(p?.streaming && p.sessionId === effectiveSid);
            } catch {
                return false;
            }
        })(),
    );
    // ─── Right Side Panel ─────────────────────────────────────
    const [showGraphPanel, setShowGraphPanel] = useState(false);
    const [showThinkingPanel, setShowThinkingPanel] = useState(false);
    const [activeGraphMsgIdx, setActiveGraphMsgIdx] = useState<number | null>(null);
    const [panelTab, setPanelTab] = useState<'process' | 'graph'>('process');
    const [rtPanelExpanded, setRtPanelExpanded] = useState(false);
    const [summonPhase, setSummonPhase] = useState<'idle' | 'loading' | 'narrating' | 'selecting'>('idle');
    const [selectedSummonIds, setSelectedSummonIds] = useState(() => new Set(DEFAULT_SUMMON_IDS));
    const [pendingRtText, setPendingRtText] = useState<string | null>(null);
    const summonBypassRef = useRef(false);
    const [chatMode, setChatMode] = useState<'auto' | 'fast' | 'roundtable'>(() => initialChatMode ?? 'auto');
    const [chatModeOpen, setChatModeOpen] = useState(false);
    const chatModeRef = useRef<HTMLDivElement>(null);
    const [htmlReports, setHtmlReports] = useState<Record<number, string>>({});
    const [htmlGenerating, setHtmlGenerating] = useState<Record<number, boolean>>({});
    const [msgViewMode, setMsgViewMode] = useState<Record<number, 'docs' | 'web'>>({});
    const [imagePreview, setImagePreview] = useState<{ images: ChatImagePayload[]; index: number } | null>(null);
    const htmlPendingTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
    const [chatSelectedAgent, setChatSelectedAgent] = useState<string | null>(selectedAgentId || null);
    const [agentPickerOpen, setAgentPickerOpen] = useState(false);
    const agentPickerRef = useRef<HTMLDivElement>(null);
    const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
    const voiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [chatImageAttachments, setChatImageAttachments] = useState<PendingChatImage[]>([]);
    const chatFileRef = useRef<HTMLInputElement>(null);
    const chatImageAttachmentsRef = useRef<PendingChatImage[]>([]);

    useEffect(() => {
        chatImageAttachmentsRef.current = chatImageAttachments;
    }, [chatImageAttachments]);

    useEffect(() => {
        return () => {
            for (const img of chatImageAttachmentsRef.current) {
                URL.revokeObjectURL(img.previewUrl);
            }
        };
    }, []);

    const enqueueChatImages = useCallback((incomingFiles: File[]) => {
        const availableSlots = Math.max(0, MAX_IMAGES_PER_MESSAGE - chatImageAttachmentsRef.current.length);
        if (availableSlots <= 0) return;
        const imageFiles = incomingFiles.filter(file => file.type.startsWith('image/')).slice(0, availableSlots);
        for (const file of imageFiles) {
            const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const previewUrl = URL.createObjectURL(file);
            setChatImageAttachments(prev => [...prev, {
                id,
                previewUrl,
                status: 'uploading' as const,
                url: '',
                mime: file.type,
                name: file.name,
            }].slice(-MAX_IMAGES_PER_MESSAGE));

            void (async () => {
                const prepared = await prepareImageForUpload(file);
                if (!prepared.file) {
                    throw new Error(prepared.error || 'Image preprocessing failed');
                }
                const res = await api.uploadFile(prepared.file);
                return { res, uploadFile: prepared.file };
            })()
                .then(({ res, uploadFile }) => {
                    if (res.type !== 'image' || !res.url) throw new Error('Invalid image upload response');
                    setChatImageAttachments(prev => prev.map(item => (
                        item.id === id
                            ? { ...item, status: 'uploaded', url: res.url, mime: uploadFile.type || file.type, name: file.name }
                            : item
                    )));
                })
                .catch(() => {
                    setChatImageAttachments(prev => prev.map(item => (
                        item.id === id ? { ...item, status: 'error' } : item
                    )));
                });
        }
    }, []);

    const removeChatImage = useCallback((id: string) => {
        setChatImageAttachments(prev => {
            const target = prev.find(item => item.id === id);
            if (target) URL.revokeObjectURL(target.previewUrl);
            return prev.filter(item => item.id !== id);
        });
    }, []);

    const clearChatImages = useCallback(() => {
        setChatImageAttachments(prev => {
            for (const item of prev) URL.revokeObjectURL(item.previewUrl);
            return [];
        });
    }, []);

    const openPendingImagePreview = useCallback((startIndex: number) => {
        if (!chatImageAttachments.length) return;
        const previewImages: ChatImagePayload[] = chatImageAttachments.map(item => ({
            url: item.previewUrl,
            name: item.name,
            mime: item.mime,
        }));
        const nextIndex = Math.min(Math.max(startIndex, 0), previewImages.length - 1);
        setImagePreview({ images: previewImages, index: nextIndex });
    }, [chatImageAttachments]);

    const handleChatPaste = (e: React.ClipboardEvent) => {
        const items = Array.from(e.clipboardData.items);
        const imageItems = items.filter(it => it.type.startsWith('image/'));
        if (!imageItems.length) return;
        e.preventDefault();
        const files = imageItems.map(item => item.getAsFile()).filter((f): f is File => Boolean(f));
        enqueueChatImages(files);
    };

    const handleChatFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        enqueueChatImages(files);
        e.target.value = '';
    };

    const iflytekRef = useRef<IFlytekStreamer | null>(null);

    useEffect(() => {
        return () => {
            if (iflytekRef.current) {
                iflytekRef.current.stop();
            }
        };
    }, []);

    const stopRecording = () => {
        if (iflytekRef.current) {
            iflytekRef.current.stop();
            iflytekRef.current = null;
        }
        setVoiceState('transcribing');
        setTimeout(() => {
            setVoiceState(prev => prev === 'transcribing' ? 'idle' : prev);
        }, 1000);
    };

    const handleVoiceClick = async () => {
        if (voiceState === 'idle') {
            setVoiceState('recording');

            const streamer = new IFlytekStreamer();
            iflytekRef.current = streamer;

            streamer.onResult((res) => {
                if (res.text) {
                    setInputText(res.text);
                }
                if (res.isFinal) {
                    setVoiceState('idle');
                    iflytekRef.current = null;
                }
            });

            streamer.onError((err) => {
                console.error("iFlytek error:", err);
                setVoiceState('idle');
                iflytekRef.current = null;
            });

            streamer.onStop(() => {
                setVoiceState('idle');
                iflytekRef.current = null;
            });

            try {
                await streamer.start();
            } catch (err) {
                console.error("Failed to start iFlytek", err);
                setVoiceState('idle');
                iflytekRef.current = null;
            }
        } else if (voiceState === 'recording') {
            stopRecording();
        }
    };
    const [reactions, setReactions] = useState<Record<number, 'liked' | 'disliked' | null>>({});
    const [copied, setCopied] = useState<Record<number, boolean>>({});
    const [sourcePanelData, setSourcePanelData] = useState<SearchSource[] | null>(null);

    const closeImagePreview = useCallback(() => setImagePreview(null), []);
    const moveImagePreview = useCallback((delta: number) => {
        setImagePreview(prev => {
            if (!prev || prev.images.length === 0) return prev;
            const nextIndex = (prev.index + delta + prev.images.length) % prev.images.length;
            return { ...prev, index: nextIndex };
        });
    }, []);

    useEffect(() => {
        if (!imagePreview) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeImagePreview();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                moveImagePreview(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                moveImagePreview(1);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [imagePreview, closeImagePreview, moveImagePreview]);

    const handleCopy = (idx: number, content: string) => {
        navigator.clipboard.writeText(content).then(() => {
            setCopied(prev => ({ ...prev, [idx]: true }));
            setTimeout(() => setCopied(prev => ({ ...prev, [idx]: false })), 2000);
        });
    };

    const handleReaction = (idx: number, type: 'liked' | 'disliked') => {
        setReactions(prev => ({ ...prev, [idx]: prev[idx] === type ? null : type }));
    };

    /** Normalize one follow-up line: drop citations/links, coerce into a concise question. */
    const sanitizeFollowUpQuestionLine = useCallback((raw: string): string | null => {
        let s = raw
            .replace(/\[[^\]]*]\([^)]*\)/g, '')
            .replace(/\([^)]*https?:\/\/[^)]+\)/gi, '')
            .replace(/https?:\/\/[^\s\])]+/gi, '')
            .replace(/\*\*/g, '')
            .replace(/`/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        const qIdx = s.search(/[?？]/);
        if (qIdx >= 0) {
            s = s.slice(0, qIdx + 1).trim();
        } else {
            // Some models output "questions to watch" as statements without punctuation.
            // Normalize these lines into interrogative form so UI can stay consistent.
            s = s.replace(/[。.!！]+$/g, '').trim();
            if (s.length < 6) return null;
            s = /[\u4e00-\u9fff]/.test(s) ? `${s}？` : `${s}?`;
        }
        if (s.length < 4) return null;
        return s;
    }, []);

    /** Extract "Questions to watch" / follow-up questions from the end of a synthesis response */
    const extractFollowUpQuestions = useCallback((content: string): { body: string; questions: string[] } => {
        // Only match explicit "follow-up question" blocks near the tail to avoid truncating main report sections.
        // Examples: **Questions to watch**, ## Follow-up Questions, **你可能还会问**
        const pattern =
            /\n(?:---\s*\n+)?(?:\*\*|#{1,3}\s*)[^\n]*?(?:questions?\s+to\s+watch|follow[\s-]*up\s+questions?|next\s+questions?|key\s+questions?|你可能还会问|后续问题|追问建议|延伸问题|相关问题|值得(?:继续)?关注(?:的)?问题|持续关注的核心问题|需要持续追踪的关键问题|持续追踪的关键问题)[^\n]*?(?:\*\*)?\s*\n((?:\s*(?:[-•*]|\d+[.)])\s+.+\n?)+)\s*$/i;
        const match = content.match(pattern);
        if (match) {
            const questions = match[1].split('\n')
                .map(l => l.trim())
                .filter(l => /^(?:[-•*]|\d+[.)]\s)/.test(l))
                .map(l => l.replace(/^(?:[-•*]|\d+[.)]\s)\s*/, '').trim())
                .map((l) => sanitizeFollowUpQuestionLine(l))
                .filter((q): q is string => Boolean(q));
            const dedupedQuestions = Array.from(new Set(questions));
            // Guardrail: only strip when the follow-up block is at the end and contains multiple items.
            const isTailBlock = typeof match.index === 'number' && match.index > content.length * 0.6;
            if (dedupedQuestions.length >= 1 && isTailBlock) {
                return { body: content.slice(0, match.index).trimEnd(), questions: dedupedQuestions };
            }
        }
        return { body: content, questions: [] };
    }, [sanitizeFollowUpQuestionLine]);

    /** Strip follow-up question blocks from generated HTML so both modes share one unified related-questions component. */
    const stripFollowUpSectionFromHtml = useCallback((html: string): string => {
        if (!html) return html;
        const heading =
            '(?:questions?\\s+to\\s+watch|follow[\\s-]*up\\s+questions?|next\\s+questions?|key\\s+questions?|你可能还会问|后续问题|追问建议|延伸问题|相关问题|值得(?:继续)?关注(?:的)?问题|持续关注的核心问题|需要持续追踪的关键问题|持续追踪的关键问题)';
        const blockPattern = new RegExp(
            `<h[1-6][^>]*>[\\s\\S]{0,120}?${heading}[\\s\\S]{0,120}?<\\/h[1-6]>\\s*(?:<(?:ul|ol)[\\s\\S]*?<\\/(?:ul|ol)>|(?:<p[^>]*>[\\s\\S]*?<\\/p>\\s*){1,10})`,
            'gi',
        );
        return html.replace(blockPattern, '');
    }, []);

    // Chat title: summarize the user's question into a short topic label
    const chatTitle = useMemo(() => {
        const raw = initialMessage.trim() || messages.find(m => m.role === 'user')?.content?.trim() || '';
        return summarizeTitle(raw);
    }, [initialMessage, messages]);

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
    // Show real roundtable data from consensus_done event, otherwise empty
    const [consensusResults, setConsensusResults] = useState<Record<number, any>>({});
    // Stock quote cards keyed by message index
    const [quoteCards, setQuoteCards] = useState<Record<number, { symbol: string; name?: string; market?: string; lang?: string; price?: string; change?: string; volume?: string; amount?: string; high?: string; low?: string; open?: string; prevClose?: string; marketCap?: string; pe?: string; pb?: string; turnover?: string }>>({});
    /** X/Twitter account snapshot from research (followers / joined / avatar) */
    const [xProfileCards, setXProfileCards] = useState<Record<number, { handle: string; profileUrl: string; followers?: number; following?: number; joinedDisplay?: string; avatarUrl?: string }>>({});
    const currentConsensus = (() => {
        // First try the active message's consensus
        if (activeGraphMsgIdx !== null && consensusResults[activeGraphMsgIdx]) {
            return consensusResults[activeGraphMsgIdx];
        }
        // Fallback: show the most recent consensus so the graph isn't empty
        const keys = Object.keys(consensusResults).map(Number).sort((a, b) => b - a);
        return keys.length > 0 ? consensusResults[keys[0]] : null;
    })();
    const currentRoundtableData: RoundtableData = currentConsensus
        ? buildRoundtableFromConsensus(currentConsensus)
        : { rounds: [], finalVerdict: { summary: '', confidence: 0 } };


    // TOC: precompute headings for every completed assistant message
    const allTocHeadings = useMemo(() => {
        const map: Record<number, { level: number; text: string; id: string }[]> = {};
        for (let j = 0; j < messages.length; j++) {
            const m = messages[j];
            if (m.role === 'assistant' && m.content && !m.isStreaming && m.content !== '__cancelled__') {
                const cleaned = stripInternalResearchCitations(m.content);
                const { body: noQuote } = extractQuoteSnapshot(cleaned);
                const { body: noFollowUp } = extractFollowUpQuestions(noQuote);
                const h = extractHeadings(noFollowUp, j);
                if (h.length >= 2) map[j] = h;
            }
        }
        return map;
    }, [messages]);
    const [visibleTocIdx, setVisibleTocIdx] = useState<number>(-1);
    const tocHeadings = visibleTocIdx >= 0 ? (allTocHeadings[visibleTocIdx] || []) : (() => {
        // Default to last assistant message with headings
        const keys = Object.keys(allTocHeadings).map(Number);
        return keys.length > 0 ? allTocHeadings[keys[keys.length - 1]] : [];
    })();
    const [activeTocId, setActiveTocId] = useState<string>('');
    const tocVisibleMsgIdx = visibleTocIdx >= 0 ? visibleTocIdx : (() => {
        const keys = Object.keys(allTocHeadings).map(Number);
        return keys.length > 0 ? keys[keys.length - 1] : -1;
    })();
    const tocMsgInWebMode = tocVisibleMsgIdx >= 0 && msgViewMode[tocVisibleMsgIdx] === 'web';
    const showToc = tocHeadings.length > 0 && !tocMsgInWebMode;

    // Scroll-spy: track which heading is currently in view + which message's TOC to show
    useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const tocIndices = Object.keys(allTocHeadings).map(Number);
        if (tocIndices.length === 0) return;

        let rafId = 0;
        const scheduleRecalc = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                rafId = 0;
                recalcToc();
            });
        };

        const recalcToc = () => {
            const containerRect = container.getBoundingClientRect();

            // Determine which assistant message's TOC to show:
            // Use the LAST message whose first heading has scrolled into or above the viewport top.
            // This way, a message's TOC only appears once you've scrolled to its title.
            let bestIdx = tocIndices[0];
            for (const idx of tocIndices) {
                const heads = allTocHeadings[idx];
                if (!heads || heads.length === 0) continue;
                const firstEl = document.getElementById(heads[0].id);
                if (firstEl) {
                    const top = firstEl.getBoundingClientRect().top - containerRect.top;
                    if (top <= 80) bestIdx = idx;
                }
            }
            setVisibleTocIdx(bestIdx);

            const heads = allTocHeadings[bestIdx] || [];
            const ids = heads.map(h => h.id);

            // Active heading within the visible message
            let current = ids[0] || '';
            for (const id of ids) {
                const el = document.getElementById(id);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    if (rect.top - containerRect.top <= 80) current = id;
                }
            }
            setActiveTocId(current);
        };

        container.addEventListener('scroll', scheduleRecalc, { passive: true });
        window.addEventListener('resize', scheduleRecalc);
        scheduleRecalc();

        // Observe late layout shifts from markdown, quote cards, fonts, and the TOC panel itself.
        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => scheduleRecalc())
            : null;
        if (resizeObserver) {
            resizeObserver.observe(container);
            if (container.firstElementChild instanceof HTMLElement) {
                resizeObserver.observe(container.firstElementChild);
            }
        }

        const delayedRecalcIds = [120, 360, 900].map(delay =>
            window.setTimeout(scheduleRecalc, delay)
        );
        const fontSet = typeof document !== 'undefined' ? (document as Document & { fonts?: FontFaceSet }).fonts : undefined;
        fontSet?.ready?.then(() => scheduleRecalc()).catch(() => undefined);

        return () => {
            cancelAnimationFrame(rafId);
            delayedRecalcIds.forEach(id => window.clearTimeout(id));
            resizeObserver?.disconnect();
            window.removeEventListener('resize', scheduleRecalc);
            container.removeEventListener('scroll', scheduleRecalc);
        };
    }, [allTocHeadings, showToc]);

    // Scroll user’s question to top when a new message is sent
    const scrollUserMsgToTop = useCallback(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const el = lastUserMsgRef.current;
                const container = scrollContainerRef.current;
                if (el && container) {
                    const containerRect = container.getBoundingClientRect();
                    const elRect = el.getBoundingClientRect();
                    const scrollTarget = elRect.top - containerRect.top + container.scrollTop - 24;
                    container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
                }
            });
        });
    }, []);

    // Auto-scroll when a new user message is added (catches all paths: handleSend, follow-up, suggestions)
    const prevMsgCountRef = useRef(0);
    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (messages.length > prevMsgCountRef.current && lastMsg?.role === 'user') {
            // Double rAF ensures React has committed the DOM
            requestAnimationFrame(() => requestAnimationFrame(() => scrollUserMsgToTop()));
        }
        prevMsgCountRef.current = messages.length;
    }, [messages.length, scrollUserMsgToTop]);

    // ─── Real Socket.IO Integration ────────────────────────────
    const activeMsgIdxRef = useRef<number>(-1);
    const progressChunkIdxRef = useRef(0);
    /** Monotonic counter — incremented each time sendToAI fires so stale events from a previous run are ignored */
    const chatGenRef = useRef(0);
    const activeChatGenRef = useRef(0);

    useEffect(() => {
        progressChunkIdxRef.current = 0;
        const onRouting = (data: { sessionId: string }) => {
            saLog('← agent:chat:routing', { expect: sessionId, got: data?.sessionId, match: data.sessionId === sessionId });
            if (data.sessionId !== sessionId) return;
            // Capture gen at call time — onStarted will set the correct gen
            setThinkingProcesses(prev => {
                const existing = prev[activeMsgIdxRef.current];
                return {
                    ...prev, [activeMsgIdxRef.current]: { ...existing, modules: existing?.modules ?? [], isActive: true, route: 'Routing...', _gen: activeChatGenRef.current }
                };
            });
        };

        const onRouted = (data: { sessionId: string; mode: string }) => {
            saLog('← agent:chat:routed', { expect: sessionId, got: data?.sessionId, mode: data?.mode, match: data.sessionId === sessionId });
            if (data.sessionId !== sessionId) return;
            setThinkingProcesses(prev => {
                const msgIdx = activeMsgIdxRef.current;
                const flow = prev[msgIdx];
                if (!flow) return prev;
                // Don't overwrite roundtable routedMode set by handleSummonConfirm
                if (flow.routedMode === 'roundtable') return prev;
                return { ...prev, [msgIdx]: { ...flow, routedMode: data.mode } };
            });
        };

        const onStarted = (data: { sessionId: string; mode: string; route: string }) => {
            saLog('← agent:chat:started', { expect: sessionId, got: data?.sessionId, route: data?.route, match: data.sessionId === sessionId });
            if (data.sessionId !== sessionId) return;
            setThinkingProcesses(prev => {
                const existing = prev[activeMsgIdxRef.current];
                return {
                    ...prev, [activeMsgIdxRef.current]: {
                        ...existing,
                        modules: existing?.modules ?? [],
                        isActive: true,
                        route: data.route,
                        startTime: existing?.startTime ?? Date.now(),
                    }
                };
            });
        };

        const onModule = (data: { sessionId: string; moduleType: string; status: string; data?: any }) => {
            saLog('← agent:chat:module', { expect: sessionId, got: data?.sessionId, moduleType: data?.moduleType, status: data?.status, match: data.sessionId === sessionId });
            if (data.sessionId !== sessionId) return;

            setThinkingProcesses(prev => {
                const msgIdx = activeMsgIdxRef.current;
                const flow = prev[msgIdx] || { modules: [], isActive: true, route: 'Loka Agent' };
                const mods = [...flow.modules];

                let modIdx = mods.findIndex(m => m.type === data.moduleType);
                if (modIdx === -1) {
                    mods.push({ type: data.moduleType as any, status: data.status as any, data: data.data });
                } else {
                    const prev = mods[modIdx];
                    const prevStatus = prev.status;
                    const incoming = data.status as string;
                    const isDowngradeToActive =
                        (incoming === 'active' || incoming === 'analyzing') &&
                        prevStatus === 'completed';
                    const nextStatus = isDowngradeToActive ? prevStatus : incoming;
                    mods[modIdx] = { ...prev, status: nextStatus as any };
                    if (data.data) {
                        mods[modIdx].data = { ...(mods[modIdx].data || {}), ...data.data };
                    }
                }

                return { ...prev, [msgIdx]: { ...flow, modules: mods } };
            });
        };

        const onProgress = (data: { sessionId: string; content: string }) => {
            if (data.sessionId !== sessionId) return;
            // Drop stale events from a previous generation
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            if (import.meta.env.DEV) {
                progressChunkIdxRef.current += 1;
                const n = progressChunkIdxRef.current;
                if (n === 1 || n % 35 === 0) {
                    saLog('← agent:chat:progress (sample)', { n, chunkLen: data?.content?.length ?? 0 });
                }
            }
            setMessages(prev => {
                const updated = [...prev];
                if (!updated[msgIdx] || !updated[msgIdx].isStreaming) return prev;
                updated[msgIdx] = { ...updated[msgIdx], content: updated[msgIdx].content + data.content };
                return updated;
            });
        };

        const onStreamDone = (data: { sessionId: string; content?: string; sources?: SearchSource[] }) => {
            saLog('← agent:chat:stream_done', { expect: sessionId, got: data?.sessionId, match: data.sessionId === sessionId });
            if (data.sessionId !== sessionId) return;
            const msgIdx = activeMsgIdxRef.current;
            try {
                sessionStorage.removeItem(SA_PENDING_KEY);
            } catch {
                /* ignore */
            }
            setMessages(prev => {
                const updated = [...prev];
                if (!updated[msgIdx]) return prev;
                // Guard: if this message is no longer streaming (previous run already finished
                // or a new run already took over), ignore stale stream_done
                if (!updated[msgIdx].isStreaming) return prev;
                const streamedContent = updated[msgIdx].content || '';
                const finalContent = data.content || '';
                // Prefer authoritative stream_done payload when it is longer/different.
                // This fixes truncation when some progress chunks were dropped.
                const resolvedContent =
                    finalContent && finalContent.length >= streamedContent.length
                        ? finalContent
                        : streamedContent || finalContent;
                updated[msgIdx] = {
                    ...updated[msgIdx],
                    content: resolvedContent,
                    isStreaming: false, 
                    timestamp: new Date().toLocaleTimeString(),
                    sources: data.sources,
                };
                return updated;
            });
            setIsStreaming(false);
            setThinkingProcesses(prev => {
                const msgIdx = activeMsgIdxRef.current;
                if (!prev[msgIdx]) return prev;
                const flow = prev[msgIdx];
                const finalizedModules = (flow.modules || []).map((m) => {
                    const nextStatus = m.status === 'active' ? 'completed' : m.status;
                    if (m.type === 'consensus' && m.data) {
                        const c = m.data as ConsensusModuleData;
                        const finalizedConsensus: ConsensusModuleData = {
                            ...c,
                            status: 'concluded',
                            round: typeof c.round === 'number' ? c.round : 1,
                            maxRounds: typeof c.maxRounds === 'number' ? c.maxRounds : (typeof c.round === 'number' ? c.round : 1),
                        };
                        return { ...m, status: nextStatus, data: finalizedConsensus };
                    }
                    return { ...m, status: nextStatus };
                });
                return { ...prev, [msgIdx]: { ...flow, modules: finalizedModules, isActive: false } };
            });
        };

        const normalizeAgentError = (raw: string) => {
            const msg = String(raw || '').trim();
            if (/do_request_failed|upstream error|AI API error \(500\)/i.test(msg)) {
                return '上游模型服务暂时不稳定，已中断本次合成。你可以直接重试，或稍后再试。';
            }
            if (/timeout|timed out/i.test(msg)) {
                return '本次处理超时。建议简化问题后重试，或稍后再试。';
            }
            return msg || '请求失败，请稍后重试。';
        };

        const onError = (data: { sessionId: string; error: string }) => {
            saLog('← agent:chat:error', { expect: sessionId, got: data?.sessionId, error: data?.error, match: data.sessionId === sessionId });
            if (data.sessionId !== sessionId) return;
            try {
                sessionStorage.removeItem(SA_PENDING_KEY);
            } catch {
                /* ignore */
            }
            const msgIdx = activeMsgIdxRef.current;
            const friendlyError = normalizeAgentError(data.error);
            setMessages(prev => {
                const updated = [...prev];
                if (!updated[msgIdx]) return prev;
                updated[msgIdx] = {
                    ...updated[msgIdx],
                    content: `${updated[msgIdx].content}\n\n**提示：** ${friendlyError}`,
                    isStreaming: false
                };
                return updated;
            });
            setIsStreaming(false);
            setThinkingProcesses(prev => {
                const flow = prev[msgIdx];
                if (!flow) return prev;
                const hasDone = flow.modules.some(m => m.type === 'done');
                const modules = flow.modules.map(m =>
                    m.status === 'active' ? { ...m, status: 'completed' as const } : m
                );
                if (!hasDone) {
                    modules.push({ type: 'done', status: 'completed', data: { duration: 0 } });
                }
                return { ...prev, [msgIdx]: { ...flow, modules, isActive: false } };
            });
        };

        const onThinkingLog = (data: { sessionId: string; line: string }) => {
            if (data.sessionId !== sessionId) return;
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            setThinkingProcesses((prev) => {
                const flow = prev[msgIdx] || { modules: [], isActive: true };
                const prevLog = flow.signalResearchLog || '';
                const next = prevLog ? `${prevLog}\n${data.line}` : data.line;
                const capped = next.length > 120_000 ? next.slice(-120_000) : next;
                return { ...prev, [msgIdx]: { ...flow, signalResearchLog: capped } };
            });
        };

        const onToolTrace = (data: { sessionId: string; step: Record<string, unknown> }) => {
            const st = data?.step;
            const t = st && typeof st === 'object' ? (st as { type?: string }).type : undefined;
            if (data.sessionId !== sessionId) return;
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            const step = data.step;
            if (t !== 'thinking' && t !== 'tool_start' && t !== 'tool_done') {
                return;
            }
            if (import.meta.env.DEV) {
                saLog('← agent:chat:tool_trace', { expect: sessionId, got: data?.sessionId, stepType: t, match: true });
            }
            setThinkingProcesses(prev => {
                const flow = prev[msgIdx] || { modules: [], isActive: true };
                if (step.type === 'thinking') {
                    return {
                        ...prev,
                        [msgIdx]: { ...flow, planningMessage: String(step.message || '') },
                    };
                }
                const trace = [...(flow.toolTrace || [])];
                if (step.type === 'tool_start') {
                    trace.push({
                        tool: step.tool as string | undefined,
                        displayName: (step.displayName as string) || (step.tool as string) || '',
                        status: 'running',
                    });
                } else if (step.type === 'tool_done') {
                    for (let i = trace.length - 1; i >= 0; i--) {
                        if (trace[i].status === 'running' && trace[i].tool === step.tool) {
                            trace[i] = {
                                ...trace[i],
                                status: step.success === false ? 'error' : 'done',
                                durationSec: typeof step.duration === 'number' ? step.duration : undefined,
                            };
                            break;
                        }
                    }
                } else {
                    return prev;
                }
                return { ...prev, [msgIdx]: { ...flow, toolTrace: trace } };
            });
        };

        const onContentReplace = (data: { sessionId: string; content: string }) => {
            if (data.sessionId !== sessionId) return;
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            setMessages(prev => {
                const updated = [...prev];
                if (!updated[msgIdx] || !updated[msgIdx].isStreaming) return prev;
                updated[msgIdx] = { ...updated[msgIdx], content: data.content };
                return updated;
            });
        };

        const onConsensusDone = (data: { sessionId: string; result: any }) => {
            saLog('← agent:chat:consensus_done', { expect: sessionId, got: data?.sessionId, match: data.sessionId === sessionId });
            if (data.sessionId !== sessionId) return;
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            setConsensusResults(prev => ({ ...prev, [msgIdx]: data.result }));
            // Sync the real consensus output into thinkingProcesses so the right-side
            // Roundtable panel (Data Collection / Round 1 / Round 2 / Consensus) shows
            // genuine agent names, verdicts and reasoning instead of any placeholder.
            setThinkingProcesses(prev => {
                const existing = prev[msgIdx] || { modules: [], isActive: true, route: 'Roundtable' };
                const rtFields = reconstructRtFieldsFromConsensus(data.result, existing.modules || []);
                if (!rtFields) return prev;
                return {
                    ...prev,
                    [msgIdx]: {
                        ...existing,
                        routedMode: 'roundtable',
                        ...rtFields,
                    },
                };
            });
        };

        const onQuote = (data: { sessionId: string; quote: any }) => {
            if (data.sessionId !== sessionId) return;
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            setQuoteCards(prev => ({ ...prev, [msgIdx]: data.quote }));
        };

        const onXProfile = (data: { sessionId: string; profile: { handle: string; profileUrl: string; followers?: number; following?: number; joinedDisplay?: string; avatarUrl?: string } }) => {
            if (data.sessionId !== sessionId) return;
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            setXProfileCards(prev => ({ ...prev, [msgIdx]: data.profile }));
        };

        const onHtmlReady = (data: { sessionId: string; msgIdx: number; html: string }) => {
            if (data.sessionId !== sessionId) return;
            setHtmlGenerating(prev => { const n = { ...prev }; delete n[data.msgIdx]; delete n[-1]; return n; });
            setHtmlReports(prev => ({ ...prev, [data.msgIdx]: data.html }));
            setMsgViewMode(prev => ({ ...prev, [data.msgIdx]: 'web' }));
        };

        const onHtmlGenerating = (data: { sessionId: string; msgIdx: number }) => {
            if (data.sessionId !== sessionId) return;
            const idx = data.msgIdx >= 0 ? data.msgIdx : activeMsgIdxRef.current;
            if (idx < 0) return;
            setHtmlGenerating(prev => ({ ...prev, [idx]: true }));
        };

        const onHtmlFailed = (data: { sessionId: string; msgIdx?: number }) => {
            if (data.sessionId !== sessionId) return;
            const idx = data.msgIdx !== undefined && data.msgIdx >= 0 ? data.msgIdx : activeMsgIdxRef.current;
            setHtmlGenerating(prev => {
                const n = { ...prev };
                if (idx >= 0) delete n[idx];
                delete n[-1];
                return n;
            });
        };

        socket.on('agent:chat:routing', onRouting);
        socket.on('agent:chat:routed', onRouted);
        socket.on('agent:chat:started', onStarted);
        socket.on('agent:chat:module', onModule);
        socket.on('agent:chat:progress', onProgress);
        socket.on('agent:chat:content_replace', onContentReplace);
        socket.on('agent:chat:stream_done', onStreamDone);
        socket.on('agent:chat:error', onError);
        socket.on('agent:chat:tool_trace', onToolTrace);
        socket.on('agent:chat:thinking_log', onThinkingLog);
        socket.on('agent:chat:consensus_done', onConsensusDone);
        socket.on('agent:chat:quote', onQuote);
        socket.on('agent:chat:x_profile', onXProfile);
        socket.on('agent:chat:html_ready', onHtmlReady);
        socket.on('agent:chat:html_generating', onHtmlGenerating);
        socket.on('agent:chat:html_failed', onHtmlFailed);

        return () => {
            socket.off('agent:chat:routing', onRouting);
            socket.off('agent:chat:routed', onRouted);
            socket.off('agent:chat:started', onStarted);
            socket.off('agent:chat:module', onModule);
            socket.off('agent:chat:progress', onProgress);
            socket.off('agent:chat:content_replace', onContentReplace);
            socket.off('agent:chat:stream_done', onStreamDone);
            socket.off('agent:chat:error', onError);
            socket.off('agent:chat:tool_trace', onToolTrace);
            socket.off('agent:chat:thinking_log', onThinkingLog);
            socket.off('agent:chat:consensus_done', onConsensusDone);
            socket.off('agent:chat:quote', onQuote);
            socket.off('agent:chat:x_profile', onXProfile);
            socket.off('agent:chat:html_ready', onHtmlReady);
            socket.off('agent:chat:html_generating', onHtmlGenerating);
            socket.off('agent:chat:html_failed', onHtmlFailed);
            const timers = Object.values(htmlPendingTimersRef.current);
            for (const t of timers) clearTimeout(t);
            htmlPendingTimersRef.current = {};
        };
    }, [sessionId]);

    /** Reconnect / Refresh: replay tool orchestration and completed reports from server buffer */
    useEffect(() => {
        replayRecoverAttemptedRef.current = false;
        const replay = () => {
            saLog('emit agent:chat:replay', { sessionId, ...socket.getDebugState() });
            socket.emit(
                'agent:chat:replay',
                { sessionId },
                (res: {
                    ok?: boolean;
                    isRunning?: boolean;
                    steps?: unknown[];
                    modules?: Array<{ moduleType: string; status: string; data?: any }>;
                    mode?: string;
                    report?: string;
                    status?: string;
                }) => {
                    saLog('replay ack', { ok: res?.ok, stepsLen: Array.isArray(res?.steps) ? res.steps.length : 0, modulesLen: Array.isArray(res?.modules) ? res.modules.length : 0, mode: res?.mode, isRunning: res?.isRunning, status: res?.status });
                    // Restore roundtable chatMode so the right-side panel picks the correct variant
                    // when a client returns mid-stream to a roundtable session.
                    if (res?.mode === 'roundtable' && chatMode !== 'roundtable') {
                        setChatMode('roundtable');
                    }

                    const stepsLen = Array.isArray(res?.steps) ? res.steps.length : 0;
                    const modulesLen = Array.isArray(res?.modules) ? res.modules.length : 0;
                    const hasSteps = stepsLen > 0;
                    const hasModules = modulesLen > 0;

                    if (res?.ok && (hasSteps || hasModules)) {
                        const msgIdx = activeMsgIdxRef.current >= 0 ? activeMsgIdxRef.current : 1;
                        const trace = hasSteps ? buildTraceFromSteps(res.steps!) : undefined;
                        const planning = hasSteps ? extractPlanningMessage(res.steps!) : undefined;
                        // Reduce module event stream into final per-type module state
                        const rebuiltModules: ThinkingModule[] = [];
                        if (hasModules) {
                            const byType = new Map<string, ThinkingModule>();
                            for (const ev of res.modules!) {
                                const existing = byType.get(ev.moduleType);
                                const merged: ThinkingModule = {
                                    type: ev.moduleType as any,
                                    status: ev.status as any,
                                    data: ev.data
                                        ? { ...(existing?.data || {}), ...ev.data }
                                        : existing?.data,
                                };
                                byType.set(ev.moduleType, merged);
                            }
                            for (const mod of byType.values()) rebuiltModules.push(mod);
                        }
                        setThinkingProcesses(prev => ({
                            ...prev,
                            [msgIdx]: {
                                ...(prev[msgIdx] || {
                                    modules: [],
                                    isActive: !!res.isRunning,
                                    route: res?.mode === 'roundtable' ? 'Roundtable' : 'Investment Analyst',
                                }),
                                ...(hasModules ? { modules: rebuiltModules } : {}),
                                ...(trace !== undefined ? { toolTrace: trace } : {}),
                                ...(planning !== undefined ? { planningMessage: planning } : {}),
                                ...(res?.mode === 'roundtable' ? { routedMode: 'roundtable' } : {}),
                                isActive: !!res.isRunning,
                            },
                        }));
                        if (res.report) {
                            setMessages(prev => {
                                const c = [...prev];
                                if (c[msgIdx]) {
                                    // Don't overwrite substantial existing content (e.g. synthesis)
                                    // with a replay report (e.g. raw analysis sub-report)
                                    const existing = (c[msgIdx].content || '').trim();
                                    if (existing.length > 200) return prev;
                                    c[msgIdx] = {
                                        ...c[msgIdx],
                                        content: res.report,
                                        isStreaming: false,
                                        timestamp: new Date().toLocaleTimeString(),
                                    };
                                }
                                return c;
                            });
                            if (!res.isRunning) setIsStreaming(false);
                        }
                        return;
                    }

                    if (res?.ok && res.report && !res.isRunning) {
                        const msgIdx = activeMsgIdxRef.current >= 0 ? activeMsgIdxRef.current : 1;
                        setMessages(prev => {
                            const c = [...prev];
                            if (c[msgIdx]) {
                                // Don't overwrite substantial existing content with replay report
                                const existing = (c[msgIdx].content || '').trim();
                                if (existing.length > 200) return prev;
                                c[msgIdx] = {
                                    ...c[msgIdx],
                                    content: res.report!,
                                    isStreaming: false,
                                    timestamp: new Date().toLocaleTimeString(),
                                };
                            }
                            return c;
                        });
                        setIsStreaming(false);
                        setThinkingProcesses(prev => ({
                            ...prev,
                            [msgIdx]: { ...(prev[msgIdx] || { modules: [], isActive: false }), isActive: false },
                        }));
                        return;
                    }

                    if (res?.ok && res.isRunning) {
                        saLog('replay: server session still running, wait for push');
                        return;
                    }

                    /** Server has no memory buffer (common during restart or never successfully started) and local still has SA_PENDING: resend agent:chat */
                    let pending: { streaming?: boolean; sessionId?: string; userContent?: string; userImages?: ChatImagePayload[]; assistantMsgIdx?: number } | null = null;
                    try {
                        const raw = sessionStorage.getItem(SA_PENDING_KEY);
                        pending = raw ? (JSON.parse(raw) as typeof pending) : null;
                    } catch {
                        pending = null;
                    }
                    const canResend =
                        pending?.streaming &&
                        pending.sessionId === sessionId &&
                        (typeof pending.userContent === 'string' || Array.isArray(pending.userImages)) &&
                        !replayRecoverAttemptedRef.current;

                    if (canResend) {
                        replayRecoverAttemptedRef.current = true;
                        const msgIdx = typeof pending!.assistantMsgIdx === 'number' ? pending!.assistantMsgIdx! : 1;
                        activeMsgIdxRef.current = msgIdx;
                        saLog('replay empty → fallback emit agent:chat (local pending)', { sessionId, msgIdx });
                        setThinkingProcesses(prev => ({
                            ...prev,
                            [msgIdx]: { ...(prev[msgIdx] || {}), modules: [], isActive: true, route: 'Routing...' },
                        }));
                        setIsStreaming(true);
                        socket.emit('agent:chat', {
                            content: pending!.userContent || '',
                            images: pending!.userImages || [],
                            mode: chatMode,
                            sessionId,
                            agentId: msgIdx <= 1 ? chatSelectedAgent : undefined,
                        });
                        return;
                    }

                    saLog('replay empty and no resendable pending — stop spinner');
                    try {
                        sessionStorage.removeItem(SA_PENDING_KEY);
                    } catch {
                        /* ignore */
                    }
                    setIsStreaming(false);
                    setThinkingProcesses(prev => {
                        const idx = activeMsgIdxRef.current >= 0 ? activeMsgIdxRef.current : 1;
                        if (!prev[idx]) return prev;
                        return {
                            ...prev,
                            [idx]: { ...prev[idx], isActive: false, route: prev[idx].route || '—' },
                        };
                    });
                    setMessages(prev => {
                        const idx = activeMsgIdxRef.current >= 0 ? activeMsgIdxRef.current : 1;
                        if (!prev[idx] || prev[idx].role !== 'assistant') return prev;
                        const cur = prev[idx].content || '';
                        if (cur.trim().length > 0) return prev;
                        const next = [...prev];
                        next[idx] = {
                            ...next[idx],
                            content:
                                '**Cannot restore conversation** (server has no buffer for this session). Please resend the question.',
                            isStreaming: false,
                            timestamp: new Date().toLocaleTimeString(),
                        };
                        return next;
                    });
                },
            );
        };
        const onConnectReplay = () => {
            saLog('connect → replay');
            replay();
        };
        if (socket.connected) {
            saLog('replay on mount (already connected)');
            replay();
        }
        socket.on('connect', onConnectReplay);
        return () => {
            socket.off('connect', onConnectReplay);
        };
    }, [sessionId, chatMode, chatSelectedAgent]);

    const sendToAI = useCallback((text: string, existingMessages?: Message[], images?: ChatImagePayload[]) => {
        // Bump generation so stale events from a previous run are dropped
        chatGenRef.current += 1;
        activeChatGenRef.current = chatGenRef.current;

        saLog('sendToAI()', {
            textPreview: text.slice(0, 100),
            imageCount: images?.length || 0,
            mode: chatMode,
            sessionId,
            gen: activeChatGenRef.current,
            agentId: chatSelectedAgent,
            ...socket.getDebugState(),
        });

        setIsStreaming(true);

        const currentMessages = existingMessages ?? [];
        const msgIdx = currentMessages.length;
        activeMsgIdxRef.current = msgIdx;

        setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date().toLocaleTimeString(), isStreaming: true }]);

        setActiveGraphMsgIdx(msgIdx);
        // In roundtable mode, show the unified panel with process tab
        if (chatMode === 'roundtable') {
            setShowThinkingPanel(true);
            setPanelTab('process');
        }
        setShowGraphPanel(false);

        setThinkingProcesses(prev => {
            const existing = prev[msgIdx];
            return {
                ...prev,
                [msgIdx]: {
                    ...existing,
                    modules: existing?.modules ?? [],
                    isActive: true,
                    route: 'Routing...',
                },
            };
        });

        try {
            sessionStorage.setItem(
                SA_PENDING_KEY,
                JSON.stringify({
                    sessionId,
                    userContent: text,
                    userImages: images || [],
                    assistantMsgIdx: msgIdx,
                    streaming: true,
                }),
            );
        } catch {
            /* ignore */
        }

        socket.emit('agent:chat', {
            content: text,
            images: images || [],
            mode: chatMode,
            sessionId,
            // Only send agentId on the first message (the one that started this session).
            // Subsequent messages let the router decide based on content — prevents
            // sticky guru-council mode when user switches topics.
            agentId: currentMessages.length === 0 ? chatSelectedAgent : undefined,
        });
        saLog('sendToAI emit agent:chat done (see [LokaSocket] for queued vs live)');

    }, [chatMode, sessionId, chatSelectedAgent]);

    // ─── Fetch History ──────────────────────────
    useEffect(() => {
        if (initialSessionId) {
            api.getChatHistory(undefined, undefined, initialSessionId).then(history => {
                setHistoryLoading(false);
                if (history && history.length > 0) {
                    // Guard: if we're returning to a session that is currently streaming
                    // (pending restore is active), only override messages once the server
                    // Always apply history from DB (no guard). If the stream is still
                    // mid-flight, append a streaming placeholder below so socket events
                    // have a slot to write into. This handles A→B→A navigation cleanly:
                    //  - completed stream: DB has final content → placeholder skipped
                    //  - mid-stream return: DB has only user msg → placeholder added
                    const transformedHistory = history.map((m: { role: string; content?: string; createdAt: string; metadata?: string | null }) => {
                        let sources: SearchSource[] | undefined;
                        const userImages = m.role === 'user' ? parseUserImagesFromMetadata(m.metadata) : [];
                        if (m.metadata) {
                            try { sources = (JSON.parse(m.metadata) as any).sources; } catch {}
                        }
                        return {
                            role: m.role as 'user' | 'assistant',
                            content: m.content || '',
                            timestamp: new Date(m.createdAt).toLocaleTimeString(),
                            isStreaming: false,
                            images: userImages.length > 0 ? userImages : undefined,
                            metadata: m.metadata ?? null,
                            sources,
                        };
                    });
                    // Decide based on history shape alone: if the last persisted message is a
                    // user msg or an empty assistant msg, treat the stream as still in-flight
                    // and append a placeholder. Replay (below) resolves the actual server state
                    // — either filling the placeholder with content, or replacing it with a
                    // "cannot restore" notice if the server has no buffer.
                    const lastHistoryMsg = transformedHistory[transformedHistory.length - 1];
                    const streamStillActive = (
                        lastHistoryMsg.role === 'user' ||
                        (lastHistoryMsg.role === 'assistant' && !lastHistoryMsg.content)
                    );
                    if (streamStillActive) {
                        setMessages([
                            ...transformedHistory,
                            {
                                role: 'assistant',
                                content: '',
                                timestamp: new Date().toLocaleTimeString(),
                                isStreaming: true,
                            },
                        ]);
                    } else {
                        setMessages(transformedHistory);
                    }
                    const restoredThinking: Record<number, ThinkingFlow> = {};
                    const restoredConsensus: Record<number, any> = {};
                    const restoredQuotes: Record<number, any> = {};
                    const restoredXProfiles: Record<number, { handle: string; profileUrl: string; followers?: number; following?: number; joinedDisplay?: string; avatarUrl?: string }> = {};
                    const restoredHtml: Record<number, string> = {};
                    const restoredViewModes: Record<number, 'docs' | 'web'> = {};
                    let hasRoundtableHistory = false;
                    history.forEach(
                        (m: { role: string; metadata?: string | null }, idx: number) => {
                            if (m.role !== 'assistant' || !m.metadata) return;
                            try {
                                const meta = JSON.parse(m.metadata) as { thinkingFlow?: ThinkingFlow; consensusResult?: any; quoteCard?: any; xProfileCard?: any; htmlReport?: string; sources?: SearchSource[] };
                                if (meta.thinkingFlow && Array.isArray(meta.thinkingFlow.modules)) {
                                    const isRt = meta.thinkingFlow.routedMode === 'roundtable' || !!meta.consensusResult;
                                    const rtFields = isRt && !meta.thinkingFlow.rtRounds && meta.consensusResult
                                        ? reconstructRtFieldsFromConsensus(meta.consensusResult, meta.thinkingFlow.modules)
                                        : null;
                                    restoredThinking[idx] = {
                                        ...meta.thinkingFlow,
                                        isActive: false,
                                        ...(isRt && !meta.thinkingFlow.routedMode ? { routedMode: 'roundtable' } : {}),
                                        ...(rtFields || {}),
                                    };
                                    if (isRt) hasRoundtableHistory = true;
                                }
                                if (meta.consensusResult) {
                                    restoredConsensus[idx] = meta.consensusResult;
                                }
                                if (meta.quoteCard) {
                                    restoredQuotes[idx] = meta.quoteCard;
                                }
                                if (meta.xProfileCard) {
                                    restoredXProfiles[idx] = meta.xProfileCard;
                                }
                                if (meta.htmlReport) {
                                    restoredHtml[idx] = meta.htmlReport;
                                    restoredViewModes[idx] = 'web';
                                }
                            } catch {
                                /* ignore */
                            }
                        },
                    );
                    // Merge instead of replace: preserves the active-stream placeholder's
                    // thinkingProcesses entry (set by the initial-send useEffect) when we
                    // return to a session whose stream is still mid-flight.
                    // If we appended a streaming placeholder, guarantee it has an active
                    // thinking entry so the ThinkingInlineTrigger actually renders.
                    const placeholderIdx = transformedHistory.length;
                    setThinkingProcesses(prev => {
                        const merged = { ...prev, ...restoredThinking };
                        if (streamStillActive) {
                            merged[placeholderIdx] = {
                                modules: merged[placeholderIdx]?.modules ?? [],
                                route: merged[placeholderIdx]?.route || 'Investment Analyst',
                                ...merged[placeholderIdx],
                                isActive: true,
                            };
                        }
                        return merged;
                    });
                    // Restore chatMode to roundtable if history contains roundtable data
                    if (hasRoundtableHistory) {
                        setChatMode('roundtable');
                    }
                    if (Object.keys(restoredConsensus).length > 0) {
                        setConsensusResults(prev => ({ ...prev, ...restoredConsensus }));
                    }
                    if (Object.keys(restoredQuotes).length > 0) {
                        setQuoteCards(prev => ({ ...prev, ...restoredQuotes }));
                    }
                    if (Object.keys(restoredXProfiles).length > 0) {
                        setXProfileCards(prev => ({ ...prev, ...restoredXProfiles }));
                    }
                    if (Object.keys(restoredHtml).length > 0) {
                        setHtmlReports(prev => ({ ...prev, ...restoredHtml }));
                        setMsgViewMode(prev => ({ ...prev, ...restoredViewModes }));
                    }
                    // If we appended a streaming placeholder, point activeMsgIdxRef at it
                    // so incoming socket chunks write into the placeholder, not the user msg.
                    activeMsgIdxRef.current = streamStillActive ? transformedHistory.length : transformedHistory.length - 1;
                }
            }).catch(err => { setHistoryLoading(false); console.error(err); });
        }
    }, [initialSessionId]);

    // ─── Push URL / Sync Session ID ────────────────────────
    useEffect(() => {
        if (!initialSessionId && !window.location.search.includes('session=')) {
            window.history.replaceState(null, '', `/?session=${sessionId}`);
        }
    }, [sessionId, initialSessionId]);

    // ─── Auto-send initial message ──────────────────────────
    useEffect(() => {
        if (hasSentInitial.current) return;
        if (initialSessionId) {
            hasSentInitial.current = true;
            saLog('initial: skipped auto-send because initialSessionId is provided (history load)');
            // If messages init created a streaming placeholder (from SA_PENDING_KEY match),
            // point activeMsgIdxRef at it IMMEDIATELY so socket events (onModule, onProgress)
            // that arrive before history fetch resolves land on the correct slot.
            // Without this, modules events would write to index -1 and be lost, leaving the
            // Thinking Process panel empty even though the inline trigger shows activity.
            const streamingIdx = messages.findIndex(m => m.role === 'assistant' && m.isStreaming);
            if (streamingIdx >= 0) {
                activeMsgIdxRef.current = streamingIdx;
                setActiveGraphMsgIdx(streamingIdx);
                setThinkingProcesses(prev => ({
                    ...prev,
                    [streamingIdx]: {
                        modules: prev[streamingIdx]?.modules ?? [],
                        route: prev[streamingIdx]?.route || 'Investment Analyst',
                        ...prev[streamingIdx],
                        isActive: true,
                    },
                }));
            }
            return;
        }
        if (restoredFromPendingRef.current) {
            saLog('initial: restored from SA_PENDING — skip emit agent:chat (wait replay/socket)');
            hasSentInitial.current = true;
            activeMsgIdxRef.current = 1;
            setActiveGraphMsgIdx(1);
            setThinkingProcesses(prev => ({
                ...prev,
                1: { ...prev[1], modules: prev[1]?.modules ?? [], isActive: true, route: 'Investment Analyst' },
            }));
            return;
        }
        if (!initialMessage.trim() && initialImages.length === 0) return;
        hasSentInitial.current = true;

        // Broadcast new session for sidebar
        window.dispatchEvent(new CustomEvent('session-started', {
            detail: { id: sessionId, title: summarizeTitle(initialMessage), agentId: chatSelectedAgent || 'auto' }
        }));

        const userMsg: Message = { role: 'user', content: initialMessage, images: initialImages, timestamp: new Date().toLocaleTimeString() };
        const initialMessages = [userMsg];
        setMessages(initialMessages);

        // Roundtable mode: show inline summon panel instead of sending immediately
        if (chatMode === 'roundtable') {
            saLog('initial: roundtable → show summon flow', { initialPreview: initialMessage.slice(0, 80) });
            setPendingRtText(initialMessage);
            setSummonPhase('loading');
            setSelectedSummonIds(new Set(DEFAULT_SUMMON_IDS));
            // Narrative sequence: loading → narrating → selecting
            setTimeout(() => { setSummonPhase('narrating'); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 1400);
            setTimeout(() => { setSummonPhase('selecting'); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 3200);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 300);
            return;
        }

        saLog('initial: schedule sendToAI in 50ms', { initialPreview: initialMessage.slice(0, 80), ...socket.getDebugState() });
        setTimeout(() => { sendToAI(initialMessage, initialMessages, initialImages); setTimeout(scrollUserMsgToTop, 150); }, 50);
    }, [initialMessage, initialImages, sendToAI, initialSessionId, sessionId, chatSelectedAgent, scrollUserMsgToTop, chatMode]);

    // ─── Handle send ────────────────────────────────────────
    const handleSummonConfirm = useCallback(() => {
        const text = pendingRtText;
        if (!text) return;
        setSummonPhase('idle');
        setPendingRtText(null);
        summonBypassRef.current = true;
        // Open side panel on Roundtable Graph tab
        setShowThinkingPanel(true);
        setShowGraphPanel(false);
        setSourcePanelData(null);
        setPanelTab('graph');
        // Initialize roundtable thinking state with REAL agent selection only.
        // Panel data (rtDataSearch, rtRounds, rtConsensus) is populated by real
        // socket events (agent:chat:consensus_done) and metadata restoration
        // on stream completion — not from hardcoded preview data.
        const agentIds = [...selectedSummonIds];
        const nextMsgIdx = messages.length;
        const systemAgents = SUMMON_POOL.filter(a => a.group === 'system');
        const selectedAgents = SUMMON_POOL.filter(a => agentIds.includes(a.id) && a.group !== 'system');
        const finalAgentIds = [...systemAgents.map(a => a.id), ...selectedAgents.map(a => a.id)];
        setThinkingProcesses(prev => {
            const flow = prev[nextMsgIdx] || { modules: [], isActive: true, route: 'Roundtable' };
            return {
                ...prev,
                [nextMsgIdx]: {
                    ...flow,
                    selectedAgentIds: finalAgentIds,
                    startTime: Date.now(),
                    routedMode: 'roundtable',
                    // Leave rtPreparationStatus/rtDataSearch/rtRounds/rtConsensus
                    // unset — they populate from real events as the backend progresses.
                    rtReportStatus: 'pending',
                },
            };
        });
        sendToAI(text, messages);
        setTimeout(scrollUserMsgToTop, 150);
    }, [pendingRtText, messages, sendToAI, scrollUserMsgToTop]);

    const handleSend = () => {
        if (isStreaming) return;
        const hasUploadingImages = chatImageAttachments.some(img => img.status === 'uploading');
        if (hasUploadingImages) return;
        const uploadedImages = chatImageAttachments
            .filter(img => img.status === 'uploaded' && img.url)
            .map(img => ({ url: img.url, mime: img.mime, name: img.name }));
        if (!inputText.trim() && uploadedImages.length === 0) return;
        const text = inputText.trim();
        saLog('handleSend', { textPreview: text.slice(0, 80), isStreaming, ...socket.getDebugState() });
        // Roundtable mode: intercept to show summon character selection inline
        if (chatMode === 'roundtable' && !summonBypassRef.current) {
            const userMsg: Message = { role: 'user', content: text, images: uploadedImages, timestamp: new Date().toLocaleTimeString() };
            setMessages(prev => [...prev, userMsg]);
            setInputText('');
            setPendingRtText(text);
            setSummonPhase('loading');
            setSelectedSummonIds(new Set(DEFAULT_SUMMON_IDS));
            // Narrative sequence: loading → narrating → selecting
            setTimeout(() => { setSummonPhase('narrating'); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 1400);
            setTimeout(() => { setSummonPhase('selecting'); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 3200);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 300);
            return;
        }

        summonBypassRef.current = false;
        const userMsg: Message = { role: 'user', content: text, images: uploadedImages, timestamp: new Date().toLocaleTimeString() };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInputText('');
        sendToAI(text, newMessages, uploadedImages);
        clearChatImages();
        // Scroll so the user’s question appears at the top
        setTimeout(scrollUserMsgToTop, 150);
    };

    const handleStop = () => {
        if (!isStreaming) return;
        // Tell backend to abort
        socket.emit('agent:chat:stop', { sessionId });
        // Bump generation so stale events are dropped
        chatGenRef.current += 1;
        activeChatGenRef.current = chatGenRef.current;
        setIsStreaming(false);
        // Mark the assistant message as cancelled
        setMessages(prev => {
            const idx = activeMsgIdxRef.current;
            if (idx >= 0 && idx < prev.length && prev[idx]?.role === 'assistant') {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], content: '__cancelled__', isStreaming: false };
                return updated;
            }
            return prev;
        });
        // Deactivate thinking
        setThinkingProcesses(prev => {
            const idx = activeMsgIdxRef.current;
            if (!prev[idx]) return prev;
            return { ...prev, [idx]: { ...prev[idx], isActive: false } };
        });
        try { sessionStorage.removeItem(SA_PENDING_KEY); } catch { /* ignore */ }
    };

    return (
        <div className="flex flex-col h-full bg-white overflow-hidden">
            <style>{`
                @keyframes voice-bar { 0%,100%{height:3px} 50%{height:10px} }
                .voice-bar { min-height: 3px; display:inline-block; border-radius:9999px; background:#9ca3af; }
                @keyframes summon-float { 0% { opacity: 0; transform: translateY(30px) scale(0.6); } 50% { opacity: 0.7; transform: translateY(-6px) scale(1.04); } 70% { transform: translateY(3px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
                @keyframes summon-hover { 0%,100% { transform: translate(-50%,-50%) translateY(0); } 50% { transform: translate(-50%,-50%) translateY(-6px); } }
                @keyframes summon-text { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes summon-dot { 0%,80%,100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }
                @keyframes summon-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } 50% { box-shadow: 0 0 12px 2px rgba(34,197,94,0.25); } }
            `}</style>
            {/* ══ Header: chat title ══ */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                <h1 className="text-[13px] font-semibold text-gray-800 truncate max-w-[60%]">{chatTitle}</h1>
            </div>

            {/* ══ Content Row ══ */}
            <div className="flex flex-1 overflow-hidden">
                {/* Chat column */}
                <div className="relative flex flex-col flex-1 min-w-0 overflow-hidden">
                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 md:px-6 xl:px-8 py-8 pb-28">
                        <div className={`mx-auto w-full ${showToc ? 'max-w-[1380px]' : 'max-w-4xl'}`}>
                            <div className={`flex items-start gap-6 xl:gap-8 ${showToc ? '' : 'justify-center'}`}>
                                {showToc && (
                                    <aside className="hidden md:block w-[220px] shrink-0 self-start sticky" style={{ top: TOC_STICKY_TOP_PX }}>
                                        <nav
                                            className="overflow-hidden"
                                            style={{
                                                maxHeight: `max(${TOC_MIN_VIEWPORT_PX}px, calc(100dvh - ${TOC_STICKY_TOP_PX + TOC_BOTTOM_RESERVE_PX}px))`,
                                            }}
                                        >
                                            <div className="w-[220px] max-h-[inherit] overflow-y-auto bg-white/95 backdrop-blur-md border border-gray-200/60 rounded-xl shadow-lg shadow-gray-200/30 py-3 px-2">
                                                <p className="px-2 pb-1.5 text-[11px] font-semibold text-gray-500 tracking-wide sticky top-0 bg-white/95 backdrop-blur-md z-10">Sections</p>
                                                <ul className="space-y-0.5">
                                                    {(() => {
                                                        // Filter and optimize TOC hierarchy:
                                                        // Collapse level-3 items when a level-2 parent has only one level-3 child
                                                        const filtered = tocHeadings.filter(h => h.level >= 2);
                                                        const optimized: typeof filtered = [];
                                                        for (let fi = 0; fi < filtered.length; fi++) {
                                                            const h = filtered[fi];
                                                            if (h.level === 2) {
                                                                optimized.push(h);
                                                            } else if (h.level >= 3) {
                                                                let siblingCount = 0;
                                                                for (let si = fi; si < filtered.length && filtered[si].level >= 3; si++) siblingCount++;
                                                                // Only show sub-items if there are 2+ siblings
                                                                if (siblingCount >= 2) optimized.push(h);
                                                            }
                                                        }
                                                        return optimized;
                                                    })().map((h, idx, arr) => {
                                                        const isActive = activeTocId === h.id;
                                                        const sectionNum = h.level === 2
                                                            ? arr.filter(x => x.level === 2).indexOf(h) + 1
                                                            : null;
                                                        return (
                                                            <li key={idx}>
                                                                <button
                                                                    onClick={() => {
                                                                        const el = document.getElementById(h.id);
                                                                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                                    }}
                                                                    className={`group w-full text-left flex items-start gap-1.5 rounded-lg px-2 py-2 text-[12px] leading-snug transition-all ${
                                                                        isActive
                                                                            ? 'bg-blue-50/80 text-blue-700 font-semibold'
                                                                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                                                    } ${h.level >= 3 ? 'pl-7' : ''}`}
                                                                >
                                                                    {sectionNum !== null && (
                                                                        <span className={`shrink-0 w-4 text-center text-[11px] font-bold ${
                                                                            isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'
                                                                        }`}>
                                                                            {sectionNum}
                                                                        </span>
                                                                    )}
                                                                    {h.level >= 3 && (
                                                                        <span className={`shrink-0 mt-[6px] w-1 h-1 rounded-full ${isActive ? 'bg-blue-500' : 'bg-gray-400'}`} />
                                                                    )}
                                                                    <span className="break-words whitespace-normal">{h.text}</span>
                                                                </button>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        </nav>
                                    </aside>
                                )}
                                <div className={`min-w-0 space-y-8 ${showToc ? 'flex-1 max-w-4xl' : 'w-full max-w-4xl'}`}>
                            {historyLoading && messages.length === 0 ? (
                                /* Loading skeleton while fetching session history (only when no pending messages) */
                                <div className="space-y-8 animate-pulse">
                                    <div className="flex justify-end">
                                        <div className="h-10 w-56 bg-gray-200 rounded-2xl" />
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="w-7 h-7 rounded-xl bg-gray-200 shrink-0" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-4 bg-gray-200 rounded w-3/4" />
                                            <div className="h-4 bg-gray-200 rounded w-5/6" />
                                            <div className="h-4 bg-gray-200 rounded w-2/3" />
                                        </div>
                                    </div>
                                </div>
                            ) : messages.map((msg, i) => (
                                <div key={i} ref={msg.role === 'user' ? lastUserMsgRef : undefined}>
                                    {msg.role === 'user' ? (
                                        <div className="flex justify-end">
                                            <div className="max-w-[72%] px-4 py-3 bg-gray-900 text-white rounded-2xl rounded-br-sm shadow-sm space-y-2">
                                                {!!msg.images?.length && (
                                                    <div className={`grid gap-2 ${msg.images.length === 1 ? 'grid-cols-1 w-[170px]' : 'grid-cols-2'}`}>
                                                        {msg.images.map((img, idx) => (
                                                            <button
                                                                key={`${img.url}-${idx}`}
                                                                type="button"
                                                                onClick={() => setImagePreview({ images: msg.images || [], index: idx })}
                                                                className="group relative rounded-lg overflow-hidden border border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                                                            >
                                                                <img
                                                                    src={img.url}
                                                                    alt={img.name || 'uploaded image'}
                                                                    className={`rounded-lg object-cover cursor-zoom-in ${msg.images.length === 1 ? 'w-[170px] h-[170px]' : 'w-full max-h-36'}`}
                                                                />
                                                                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                {msg.content ? <p className="text-[13px] leading-relaxed">{msg.content}</p> : null}
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
                                                            const flow = thinkingProcesses[i];
                                                            console.log('[RT-DEBUG] onOpen', { i, routedMode: flow?.routedMode, chatMode, hasFlow: !!flow });
                                                            setActiveGraphMsgIdx(i);
                                                            setShowThinkingPanel(true);
                                                            setShowGraphPanel(false);
                                                            setSourcePanelData(null);
                                                            const isRt = flow?.routedMode === 'roundtable' || chatMode === 'roundtable';
                                                            if (isRt) setPanelTab('process');
                                                        }}
                                                    />
                                                )}
                                                {/* Per-message view tabs: Docs / Web / Roundtable — single row */}
                                                {msg.role === 'assistant' && (!msg.isStreaming || htmlReports[i]) && ((htmlReports[i] || htmlGenerating[i]) || consensusResults[i]) && (
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-1.5">
                                                        {(htmlReports[i] || htmlGenerating[i]) && (
                                                            <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-lg">
                                                                <button
                                                                    onClick={() => setMsgViewMode(prev => ({ ...prev, [i]: 'docs' }))}
                                                                    className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                                                                        (msgViewMode[i] || 'docs') === 'docs'
                                                                            ? 'bg-white text-gray-900 shadow-sm'
                                                                            : 'text-gray-500 hover:text-gray-700'
                                                                    }`}
                                                                >
                                                                    Docs
                                                                </button>
                                                                <button
                                                                    onClick={() => setMsgViewMode(prev => ({ ...prev, [i]: 'web' }))}
                                                                    className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                                                                        msgViewMode[i] === 'web'
                                                                            ? 'bg-white text-gray-900 shadow-sm'
                                                                            : 'text-gray-500 hover:text-gray-700'
                                                                    }`}
                                                                >
                                                                    Web
                                                                </button>
                                                            </div>
                                                        )}
                                                        </div>
                                                        {consensusResults[i] && (
                                                            <button
                                                                onClick={() => {
                                                                    setActiveGraphMsgIdx(i);
                                                                    setSourcePanelData(null);
                                                                    if (chatMode === 'roundtable') {
                                                                        setShowThinkingPanel(true);
                                                                        setShowGraphPanel(false);
                                                                        setPanelTab('graph');
                                                                    } else {
                                                                        setShowThinkingPanel(false);
                                                                        setShowGraphPanel(true);
                                                                    }
                                                                }}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 text-[11px] text-indigo-600 font-medium transition-colors"
                                                            >
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                                                                Roundtable
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                                {msg.content === '__cancelled__' ? (() => {
                                                    const prevUser = messages.slice(0, i).reverse().find(m => m.role === 'user');
                                                    const isChinese = prevUser && /[\u4e00-\u9fff]/.test(prevUser.content);
                                                    return <p className="text-[13px] text-gray-400 italic">{isChinese ? '回复已取消' : 'Response cancelled'}</p>;
                                                })() : msg.content ? (() => {
                                                    const liveSources = mergeSearchSources(
                                                        msg.sources,
                                                        collectThinkingSearchSources(thinkingProcesses[i]),
                                                    );
                                                    const cleaned = msg.role === 'assistant' ? stripInternalResearchCitations(msg.content) : msg.content;
                                                    const { body: bodyNoQuestions } = msg.role === 'assistant' && !msg.isStreaming
                                                        ? extractFollowUpQuestions(cleaned)
                                                        : { body: cleaned };
                                                    const { quote, body } = msg.role === 'assistant' && !msg.isStreaming
                                                        ? extractQuoteSnapshot(bodyNoQuestions)
                                                        : { quote: null, body: bodyNoQuestions };
                                                    const liveQuote = quoteCards[i];
                                                    const liveXProfile = xProfileCards[i];
                                                    const showWebView = msgViewMode[i] === 'web' && htmlReports[i];
                                                    const showWebSkeleton = msgViewMode[i] === 'web' && htmlGenerating[i] && !htmlReports[i];
                                                    const web3Mod = thinkingProcesses[i]?.modules?.find((m) => m.type === 'web3');
                                                    const web3ModData = web3Mod?.data as Web3ModuleData | undefined;
                                                    const okxSnapshots = web3ModData?.okx || [];
                                                    const okxNewsBundles = web3ModData?.okxNews || [];
                                                    return (
                                                        <>
                                                            {/* Live stock quote card from real-time data */}
                                                            {liveQuote && (() => {
                                                                const isUp = liveQuote.change?.startsWith('+');
                                                                const isDown = liveQuote.change?.startsWith('-');
                                                                const chgColor = isUp ? 'text-emerald-600' : isDown ? 'text-red-500' : 'text-gray-500';
                                                                const chgBg = isUp
                                                                    ? 'bg-emerald-500/8 ring-1 ring-emerald-500/20'
                                                                    : isDown
                                                                    ? 'bg-red-500/8 ring-1 ring-red-500/20'
                                                                    : 'bg-gray-100 ring-1 ring-gray-200/60';
                                                                const cardBg = isUp
                                                                    ? 'bg-gradient-to-br from-emerald-50/40 via-white to-white'
                                                                    : isDown
                                                                    ? 'bg-gradient-to-br from-red-50/40 via-white to-white'
                                                                    : 'bg-gradient-to-br from-gray-50/40 via-white to-white';
                                                                // Match OKX snapshot by base currency (symbol or name contains it)
                                                                const lqSym = (liveQuote.symbol || '').toUpperCase();
                                                                const lqName = (liveQuote.name || '').toUpperCase();
                                                                const matchBase = (base: string) =>
                                                                    base === lqSym || base === lqName || lqSym.includes(base) || lqName.includes(base);
                                                                const matchingOkx = okxSnapshots.find((s) => matchBase(s.baseCcy.toUpperCase()));
                                                                const matchingOkxNews = okxNewsBundles.find((b) => matchBase(b.baseCcy.toUpperCase()));
                                                                const mktStyles: Record<string, string> = {
                                                                    '美股': 'bg-blue-500/10 text-blue-600', '港股': 'bg-amber-500/10 text-amber-600', 'A股': 'bg-red-500/10 text-red-600',
                                                                    'US': 'bg-blue-500/10 text-blue-600', 'HK': 'bg-amber-500/10 text-amber-600', 'A-Share': 'bg-red-500/10 text-red-600',
                                                                };
                                                                const mktCls = liveQuote.market ? (mktStyles[liveQuote.market] || 'bg-gray-100 text-gray-500') : '';
                                                                const lang = liveQuote.lang || 'zh';
                                                                const L = lang === 'en'
                                                                    ? { open: 'Open', prevClose: 'Prev Close', high: 'High', low: 'Low', volume: 'Volume', amount: 'Amount', marketCap: 'Mkt Cap', pe: 'PE', pb: 'PB', turnover: 'Turnover' }
                                                                    : { open: '开盘', prevClose: '昨收', high: '最高', low: '最低', volume: '成交量', amount: '成交额', marketCap: '市值', pe: 'PE', pb: 'PB', turnover: '换手率' };
                                                                const ok = (v?: string) => v && !/^(n\/?a|--|—|0\.?0*|undefined|null)$/i.test(v.trim());
                                                                const stats: { label: string; value: string }[] = [];
                                                                if (ok(liveQuote.open)) stats.push({ label: L.open, value: liveQuote.open! });
                                                                if (ok(liveQuote.prevClose)) stats.push({ label: L.prevClose, value: liveQuote.prevClose! });
                                                                if (ok(liveQuote.high)) stats.push({ label: L.high, value: liveQuote.high! });
                                                                if (ok(liveQuote.low)) stats.push({ label: L.low, value: liveQuote.low! });
                                                                if (ok(liveQuote.volume)) stats.push({ label: L.volume, value: liveQuote.volume! });
                                                                if (ok(liveQuote.amount)) stats.push({ label: L.amount, value: liveQuote.amount! });
                                                                if (ok(liveQuote.marketCap)) stats.push({ label: L.marketCap, value: liveQuote.marketCap! });
                                                                if (ok(liveQuote.pe)) stats.push({ label: L.pe, value: liveQuote.pe! });
                                                                if (ok(liveQuote.pb)) stats.push({ label: L.pb, value: liveQuote.pb! });
                                                                if (ok(liveQuote.turnover)) stats.push({ label: L.turnover, value: liveQuote.turnover! });
                                                                return (
                                                                    <div className={`mb-5 rounded-2xl overflow-hidden ring-1 ring-black/[0.04] shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] ${cardBg}`}>
                                                                        {/* Header */}
                                                                        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
                                                                            <div className="min-w-0">
                                                                                <div className="flex items-center gap-2.5">
                                                                                    <span className="text-[20px] font-extrabold text-gray-900 tracking-tight leading-none">{liveQuote.symbol}</span>
                                                                                    {liveQuote.market && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${mktCls} tracking-wide uppercase`}>{liveQuote.market}</span>}
                                                                                </div>
                                                                                {liveQuote.name && <p className="text-[12px] text-gray-400 mt-1 font-light tracking-wide">{liveQuote.name}</p>}
                                                                            </div>
                                                                            {liveQuote.price && (
                                                                                <div className="text-right shrink-0 flex flex-col items-end">
                                                                                    <p className="text-[28px] font-black text-gray-900 tabular-nums leading-none tracking-tight">{liveQuote.price}</p>
                                                                                    {liveQuote.change && (
                                                                                        <span className={`mt-1.5 inline-flex items-center text-[12px] font-bold px-2.5 py-1 rounded-lg ${chgBg} ${chgColor} tabular-nums`}>
                                                                                            {isUp && <span className="mr-0.5">▲</span>}
                                                                                            {isDown && <span className="mr-0.5">▼</span>}
                                                                                            {liveQuote.change}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        {/* Divider */}
                                                                        {stats.length > 0 && (
                                                                            <div className="mx-5 h-px bg-gradient-to-r from-transparent via-gray-200/80 to-transparent" />
                                                                        )}
                                                                        {/* Stats grid */}
                                                                        {stats.length > 0 && (
                                                                            <div className="px-5 py-3.5">
                                                                                <div className="grid grid-cols-5 gap-x-4 gap-y-3">
                                                                                    {stats.map((s) => (
                                                                                        <div key={s.label} className="min-w-0">
                                                                                            <p className="text-[9px] uppercase tracking-[0.08em] text-gray-400 font-medium leading-none mb-1">{s.label}</p>
                                                                                            <p className="text-[13px] font-semibold text-gray-800 tabular-nums truncate leading-none">{s.value}</p>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        {/* OKX News & Sentiment — merged section inside quote card */}
                                                                        {matchingOkxNews && <OkxQuoteNews bundle={matchingOkxNews} lang={liveQuote.lang === 'en' ? 'en' : 'zh'} />}
                                                                        {/* OKX Derivatives — merged section inside quote card */}
                                                                        {matchingOkx && (() => {
                                                                            const fr = matchingOkx.derivatives?.fundingRate;
                                                                            const frAnnual = fr != null ? fr * 3 * 365 * 100 : null;
                                                                            const fundingColor = fr != null
                                                                                ? (fr >= 0 ? 'text-emerald-600' : 'text-red-500')
                                                                                : 'text-gray-400';
                                                                            const range7 = okxSummarizeWindow(matchingOkx.candles, 7);
                                                                            const range30 = okxSummarizeWindow(matchingOkx.candles, 30);
                                                                            const derivStats: { label: string; value: React.ReactNode }[] = [];
                                                                            if (fr != null) {
                                                                                derivStats.push({
                                                                                    label: 'Funding / 8h',
                                                                                    value: (
                                                                                        <span className={fundingColor}>
                                                                                            {(fr * 100).toFixed(4)}%
                                                                                            {frAnnual != null && (
                                                                                                <span className="text-gray-400 font-normal ml-1">({frAnnual >= 0 ? '+' : ''}{frAnnual.toFixed(1)}% APR)</span>
                                                                                            )}
                                                                                        </span>
                                                                                    ),
                                                                                });
                                                                            }
                                                                            if (matchingOkx.derivatives?.openInterestUsd != null) {
                                                                                derivStats.push({ label: 'Open Interest', value: okxFmtUsdCompact(matchingOkx.derivatives.openInterestUsd) });
                                                                            }
                                                                            if (matchingOkx.orderbookDepthUsd != null) {
                                                                                derivStats.push({ label: 'Depth ±10', value: okxFmtUsdCompact(matchingOkx.orderbookDepthUsd) });
                                                                            }
                                                                            if (derivStats.length === 0 && !range7 && !range30) return null;
                                                                            return (
                                                                                <>
                                                                                    <div className="mx-5 h-px bg-gradient-to-r from-transparent via-amber-200/60 to-transparent" />
                                                                                    <div className="px-5 py-3.5 space-y-2.5">
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <svg className="w-3 h-3 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 14l3-3 4 4 6-6" />
                                                                                            </svg>
                                                                                            <span className="text-[9px] uppercase tracking-[0.08em] text-amber-600 font-semibold leading-none">{liveQuote.lang === 'en' ? 'Derivatives' : '衍生品'}</span>
                                                                                            {matchingOkx.swapInstId && (
                                                                                                <span className="text-[9px] text-gray-400 font-mono">{matchingOkx.swapInstId}</span>
                                                                                            )}
                                                                                        </div>
                                                                                        {derivStats.length > 0 && (
                                                                                            <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                                                                                                {derivStats.map((s, si) => (
                                                                                                    <div key={si} className="min-w-0">
                                                                                                        <p className="text-[9px] uppercase tracking-[0.08em] text-gray-400 font-medium leading-none mb-1">{s.label}</p>
                                                                                                        <p className="text-[13px] font-semibold text-gray-800 tabular-nums truncate leading-none">{s.value}</p>
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}
                                                                                        {(range7 || range30) && (
                                                                                            <div className="text-[11.5px] text-gray-600 pt-1">
                                                                                                {range7 && (
                                                                                                    <>
                                                                                                        <span className="text-gray-400">7D </span>
                                                                                                        <span className="font-medium text-gray-700 tabular-nums">{okxFmtUsdCompact(range7.low)} — {okxFmtUsdCompact(range7.high)}</span>
                                                                                                        <span className={`ml-1 font-medium ${range7.pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{okxFmtPctSigned(range7.pct)}</span>
                                                                                                    </>
                                                                                                )}
                                                                                                {range7 && range30 && <span className="text-gray-300 mx-2">·</span>}
                                                                                                {range30 && (
                                                                                                    <>
                                                                                                        <span className="text-gray-400">30D </span>
                                                                                                        <span className={`font-medium ${range30.pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{okxFmtPctSigned(range30.pct)}</span>
                                                                                                    </>
                                                                                                )}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                );
                                                            })()}
                                                            {/* Fallback: markdown-parsed quote card (merged with OKX when matching) */}
                                                            {!liveQuote && quote && (() => {
                                                                const qSym = (quote.symbol || '').toUpperCase();
                                                                const qName = (quote.name || '').toUpperCase();
                                                                const matchBaseMd = (base: string) =>
                                                                    base === qSym || base === qName || qSym.includes(base) || qName.includes(base);
                                                                const matchingOkxForMd = okxSnapshots.find((s) => matchBaseMd(s.baseCcy.toUpperCase()));
                                                                const matchingOkxNewsForMd = okxNewsBundles.find((b) => matchBaseMd(b.baseCcy.toUpperCase()));
                                                                // Derive lang from user's prior message so QuoteCard renders labels
                                                                // (情绪与新闻 / 新闻 / 多/空/中 / 重要) in the matching language.
                                                                const prevUserForCard = messages.slice(0, i).reverse().find((m) => m.role === 'user');
                                                                const cardLang: 'zh' | 'en' = prevUserForCard && /[\u4e00-\u9fff]/.test(prevUserForCard.content) ? 'zh' : 'en';
                                                                const quoteWithLang = { ...quote, lang: quote.lang || cardLang };
                                                                return <QuoteCard quote={quoteWithLang} okxSnap={matchingOkxForMd} okxNews={matchingOkxNewsForMd} />;
                                                            })()}
                                                            {liveXProfile && (() => {
                                                                const fmtN = (n?: number) => {
                                                                    if (n == null || Number.isNaN(n)) return '—';
                                                                    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
                                                                    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
                                                                    return String(n);
                                                                };
                                                                const prevUser = messages.slice(0, i).reverse().find(m => m.role === 'user');
                                                                const isZh = prevUser && /[\u4e00-\u9fff]/.test(prevUser.content);
                                                                return (
                                                                    <a
                                                                        href={liveXProfile.profileUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="mb-4 block rounded-2xl overflow-hidden ring-1 ring-black/[0.06] bg-gradient-to-br from-slate-50/90 via-white to-white shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] hover:ring-slate-300/80 transition-all"
                                                                    >
                                                                        <div className="px-5 py-4 flex flex-col gap-3">
                                                                            <div className="flex items-center gap-2">
                                                                                {liveXProfile.avatarUrl ? (
                                                                                    <img
                                                                                        src={liveXProfile.avatarUrl}
                                                                                        alt={`@${liveXProfile.handle}`}
                                                                                        className="h-8 w-8 rounded-xl object-cover ring-1 ring-black/10"
                                                                                        loading="lazy"
                                                                                        referrerPolicy="no-referrer"
                                                                                    />
                                                                                ) : (
                                                                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-black text-white text-[11px] font-black">𝕏</span>
                                                                                )}
                                                                                <div className="min-w-0">
                                                                                    <p className="text-[15px] font-bold text-gray-900 leading-tight">@{liveXProfile.handle}</p>
                                                                                    <p className="text-[11px] text-gray-400 mt-0.5">{isZh ? '账号快照（来自检索数据）' : 'Account snapshot (from search)'}</p>
                                                                                </div>
                                                                            </div>
                                                                            <div className="grid grid-cols-3 gap-3">
                                                                                <div>
                                                                                    <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold">{isZh ? '粉丝' : 'Followers'}</p>
                                                                                    <p className="text-[16px] font-bold text-gray-900 tabular-nums">{fmtN(liveXProfile.followers)}</p>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold">{isZh ? '关注' : 'Following'}</p>
                                                                                    <p className="text-[16px] font-bold text-gray-900 tabular-nums">{fmtN(liveXProfile.following)}</p>
                                                                                </div>
                                                                                <div className="min-w-0">
                                                                                    <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold">{isZh ? '加入' : 'Joined'}</p>
                                                                                    <p className="text-[13px] font-semibold text-gray-800 truncate">{liveXProfile.joinedDisplay || '—'}</p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </a>
                                                                );
                                                            })()}
                                                            {/* OKX standalone fallback when no QuoteCard renders — reuses the same
                                                                OkxQuoteDerivatives + OkxQuoteNews as the merged path, wrapped in a
                                                                header. Surfaces derivatives AND news, bilingual label. */}
                                                            {!liveQuote && !quote && (okxSnapshots.length > 0 || okxNewsBundles.length > 0) && !msg.isStreaming && (() => {
                                                                const prevUser = messages.slice(0, i).reverse().find((m) => m.role === 'user');
                                                                const isZh = !!prevUser && /[\u4e00-\u9fff]/.test(prevUser.content);
                                                                return (
                                                                    <div className="mb-5 rounded-2xl overflow-hidden ring-1 ring-black/[0.04] shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] bg-gradient-to-br from-amber-50/50 via-white to-white">
                                                                        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                                                                            <svg className="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 14l3-3 4 4 6-6" />
                                                                            </svg>
                                                                            <span className="text-[13px] font-bold text-gray-900 tracking-tight">
                                                                                {isZh ? '市场信号' : 'Market Signals'}
                                                                            </span>
                                                                            <span className="text-[10.5px] text-amber-600/80 font-medium">
                                                                                {isZh ? '· 衍生品 · 情绪 · 新闻' : '· Derivatives · Sentiment · News'}
                                                                            </span>
                                                                        </div>
                                                                        {okxSnapshots.map((snap, idx) => (
                                                                            <OkxQuoteDerivatives key={`d-${idx}`} okx={snap} />
                                                                        ))}
                                                                        {okxNewsBundles.map((bundle, idx) => (
                                                                            <OkxQuoteNews key={`n-${idx}`} bundle={bundle} lang={isZh ? 'zh' : 'en'} />
                                                                        ))}
                                                                    </div>
                                                                );
                                                            })()}
                                                            {showWebView ? (
                                                                <HtmlReportFrame html={stripFollowUpSectionFromHtml(htmlReports[i])} isStreaming={false} />
                                                            ) : showWebSkeleton ? (
                                                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 space-y-4 animate-pulse">
                                                                    <div className="h-3 bg-gray-200 rounded w-1/4" />
                                                                    <div className="h-5 bg-gray-200 rounded w-2/3" />
                                                                    <div className="h-20 bg-gray-200 rounded" />
                                                                    <div className="space-y-2">
                                                                        <div className="h-3 bg-gray-200 rounded w-full" />
                                                                        <div className="h-3 bg-gray-200 rounded w-5/6" />
                                                                        <div className="h-3 bg-gray-200 rounded w-4/6" />
                                                                    </div>
                                                                    <p className="text-[12px] text-gray-400 text-center !mt-6">Rendering Web report…</p>
                                                                </div>
                                                            ) : (
                                                            <div className="markdown-content text-[14.5px] text-gray-700 leading-relaxed space-y-1.5 [&_a]:break-words [&_ul]:pl-1 [&_ol]:pl-1">
                                                                <SourcesProvider sources={liveSources}>
                                                                    {renderMarkdownContent(injectSourceUrls(body, liveSources), i)}
                                                                </SourcesProvider>
                                                            </div>
                                                            )}

                                                        </>
                                                    );
                                                })() : null}
                                                {/* Sources bar — click to open side panel */}
                                                {!msg.isStreaming && msg.content && (
                                                    <div id={`msg-actions-${i}`} className="flex items-center gap-0.5 mt-3">
                                                        {/* Copy — hide for cancelled */}
                                                        {msg.content !== '__cancelled__' && (
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
                                                        )}
                                                        {/* Retry */}
                                                        <button
                                                            onClick={() => {
                                                                if (isStreaming) return;
                                                                // Find the user message right before this assistant message
                                                                let userText = '';
                                                                for (let j = i - 1; j >= 0; j--) {
                                                                    if (messages[j].role === 'user') { userText = messages[j].content; break; }
                                                                }
                                                                if (!userText) return;
                                                                // Remove current assistant message and resend
                                                                const prev = messages.slice(0, i);
                                                                setMessages(prev);
                                                                sendToAI(userText, prev);
                                                                setTimeout(scrollUserMsgToTop, 150);
                                                            }}
                                                            title="Retry"
                                                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-all"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
                                                        </button>
                                                        {/* Like */}
                                                        <button
                                                            onClick={() => handleReaction(i, 'liked')}
                                                            title="Like"
                                                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${reactions[i] === 'liked' ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
                                                                }`}
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill={reactions[i] === 'liked' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" /><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" /></svg>
                                                        </button>
                                                        {/* Dislike */}
                                                        <button
                                                            onClick={() => handleReaction(i, 'disliked')}
                                                            title="Dislike"
                                                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${reactions[i] === 'disliked' ? 'text-red-400 bg-red-50' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
                                                                }`}
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill={reactions[i] === 'disliked' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z" /><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17" /></svg>
                                                        </button>
                                                        {/* Sources — inline after reactions */}
                                                        {msg.sources && msg.sources.length > 0 && (
                                                            <>
                                                                <div className="w-px h-4 bg-gray-200 mx-1" />
                                                                <button
                                                                    onClick={() => { setSourcePanelData(msg.sources!); setShowThinkingPanel(false); setShowGraphPanel(false); }}
                                                                    className="group inline-flex items-center gap-2 h-7 rounded-lg px-2 text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-all"
                                                                >
                                                                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                                                                    <span className="text-[12px] font-medium text-gray-500 group-hover:text-gray-700">{msg.sources.length} sources</span>
                                                                    <div className="flex -space-x-1">
                                                                        {(() => {
                                                                            const seen = new Set<string>();
                                                                            return msg.sources!.filter(s => {
                                                                                const key = s.domain?.toLowerCase() || s.favicon;
                                                                                if (seen.has(key)) return false;
                                                                                seen.add(key);
                                                                                return true;
                                                                            }).slice(0, 5).map((s, si) => (
                                                                                <div key={si} className="w-5 h-5 rounded-full bg-gray-100 border border-white flex items-center justify-center overflow-hidden" title={s.title}>
                                                                                    {s.domain ? (
                                                                                        <img
                                                                                            src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`}
                                                                                            alt=""
                                                                                            className="w-3.5 h-3.5"
                                                                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                                                                                        />
                                                                                    ) : null}
                                                                                    <span className={`text-[8px] text-gray-500 font-bold uppercase ${s.domain ? 'hidden' : ''}`}>{(s.favicon === 'web' ? s.domain : s.favicon).slice(0, 2)}</span>
                                                                                </div>
                                                                            ));
                                                                        })()}
                                                                        {msg.sources.length > 5 && (
                                                                            <div className="w-5 h-5 rounded-full bg-gray-100 border border-white flex items-center justify-center">
                                                                                <span className="text-[8px] text-gray-400 font-medium">+{msg.sources.length - 5}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                                {/* Follow-up questions */}
                                                {!msg.isStreaming && msg.content && msg.role === 'assistant' && (() => {
                                                    const { questions } = extractFollowUpQuestions(
                                                        stripInternalResearchCitations(msg.content)
                                                    );
                                                    if (questions.length === 0) return null;
                                                    return (
                                                        <div className="mt-3 flex flex-col gap-1.5">
                                                            <span className="text-[10.5px] font-medium text-gray-300 tracking-wide">{/[\u4e00-\u9fff]/.test(msg.content) ? '相关问题' : 'Related questions'}</span>
                                                            <div className="flex flex-col gap-1">
                                                                {questions.map((q, qi) => (
                                                                    <button
                                                                        key={qi}
                                                                        onClick={() => {
                                                                            if (isStreaming) return;
                                                                            const userMsg: Message = { role: 'user', content: q, timestamp: new Date().toLocaleTimeString() };
                                                                            const newMsgs = [...messages, userMsg];
                                                                            setMessages(newMsgs);
                                                                            setInputText('');
                                                                            sendToAI(q, newMsgs);
                                                                            setTimeout(scrollUserMsgToTop, 150);
                                                                        }}
                                                                        className="group flex items-start gap-1.5 text-left text-[12px] text-gray-400 hover:text-gray-600 py-1 transition-colors cursor-pointer leading-snug"
                                                                    >
                                                                        <svg className="w-3 h-3 mt-[3px] shrink-0 text-gray-300 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                                                                        <span className="group-hover:underline underline-offset-2 decoration-gray-300">{q}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* ── Inline Summon Panel (appears in message area during roundtable) ── */}
                            {summonPhase !== 'idle' && (() => {
                                const isCN = /[\u4e00-\u9fff]/.test(pendingRtText || '');
                                const t = {
                                    sensing:   isCN ? '正在感知你的问题…'              : 'Sensing your question…',
                                    attracting: isCN ? '有把握的角色正在被吸引过来 ✨'  : 'Confident analysts are being drawn in ✨',
                                    ready:     isCN ? '选择参与圆桌讨论的分析师'        : 'Pick analysts for this roundtable',
                                    selectTip: isCN ? '点击下方头像添加更多分析师' : 'Tap avatars below to add more analysts',
                                    btn:       isCN
                                        ? `开始圆桌讨论 · ${selectedSummonIds.size + SUMMON_POOL.filter(a => a.group === 'system').length} 位分析师`
                                        : `Start roundtable · ${selectedSummonIds.size + SUMMON_POOL.filter(a => a.group === 'system').length} analysts`,
                                    cancel:    isCN ? '取消' : 'Cancel',
                                    systemTip: isCN ? '自动分配' : 'Auto-Assigned',
                                };
                                return (
                                <div className="flex items-start gap-3">
                                    <div className="w-7 h-7 rounded-xl bg-gray-900 flex items-center justify-center text-white text-[10px] font-black shrink-0 mt-0.5">L</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden" style={{ maxWidth: 680 }}>
                                            {summonPhase === 'loading' || summonPhase === 'narrating' ? (
                                                /* ── Phase 1+2: Narrative loading ── */
                                                <div className="px-6 py-7">
                                                    {/* Pulsing dots */}
                                                    <div className="flex items-center gap-1.5 mb-5">
                                                        {[0, 1, 2].map(i => (
                                                            <div key={i} className="w-2 h-2 rounded-full bg-emerald-400"
                                                                style={{ animation: `summon-dot 1.4s ease-in-out ${i * 0.2}s infinite` }} />
                                                        ))}
                                                    </div>
                                                    {/* Narrative text lines */}
                                                    <div className="space-y-3">
                                                        <p className="text-[13px] text-gray-700 leading-relaxed"
                                                            style={{ animation: 'summon-text 0.6s ease-out both' }}
                                                        >
                                                            {t.sensing}
                                                        </p>
                                                        {summonPhase === 'narrating' && (
                                                            <p className="text-[13px] text-gray-700 leading-relaxed"
                                                                style={{ animation: 'summon-text 0.6s ease-out 0.15s both' }}
                                                            >
                                                                {t.attracting}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                /* ── Phase 3: selected row + scatter pool (system locked inline) ── */
                                                <div>
                                                    <div className="px-5 pt-4 pb-2">
                                                        <p className="text-[13px] font-semibold text-gray-800"
                                                            style={{ animation: 'summon-text 0.4s ease-out both' }}
                                                        >{t.ready}</p>
                                                        <p className="text-[11px] text-gray-400 mt-0.5"
                                                            style={{ animation: 'summon-text 0.4s ease-out 0.1s both' }}
                                                        >{t.selectTip}</p>
                                                    </div>

                                                    {/* ── Selected row: system (locked) + user-chosen, all in one row ── */}
                                                    <div className="px-4 pt-1 pb-1">
                                                        <div className="flex flex-wrap items-center gap-3 min-h-[68px] px-3 py-2 rounded-xl bg-gray-50/80 border border-gray-200 border-dashed"
                                                            style={{ animation: 'summon-text 0.3s ease-out both' }}
                                                        >
                                                            {/* System agents — locked, non-interactive */}
                                                            {SUMMON_POOL.filter(a => a.group === 'system').map((agent, i) => (
                                                                <div key={agent.id}
                                                                    className="flex flex-col items-center gap-0.5 relative group"
                                                                    style={{ animation: `summon-float 0.5s cubic-bezier(0.22,1,0.36,1) ${i * 0.04}s both` }}
                                                                >
                                                                    <div className="relative w-[46px] h-[46px] rounded-full overflow-hidden opacity-50 grayscale-[30%] cursor-default">
                                                                        <AgentAvatarImg nameOrId={agent.id} size={46} />
                                                                        <div className="absolute bottom-0 right-0 w-[13px] h-[13px] bg-gray-400 rounded-full flex items-center justify-center">
                                                                            <svg className="w-[7px] h-[7px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                                            </svg>
                                                                        </div>
                                                                    </div>
                                                                    <span className="text-[11px] font-medium text-gray-400 text-center leading-tight whitespace-nowrap max-w-[60px] truncate">{isCN ? agent.nameCN : agent.name}</span>
                                                                    {/* Tooltip */}
                                                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-[9px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 shadow-lg">
                                                                        {t.systemTip}
                                                                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[3px] border-r-[3px] border-t-[3px] border-l-transparent border-r-transparent border-t-gray-800" />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {/* User-selected agents — click to deselect */}
                                                            {SUMMON_POOL.filter(a => a.group !== 'system' && selectedSummonIds.has(a.id)).map(agent => (
                                                                <button key={agent.id}
                                                                    onClick={() => setSelectedSummonIds(prev => { const n = new Set(prev); n.delete(agent.id); return n; })}
                                                                    className="flex flex-col items-center gap-0.5 group transition-all duration-300"
                                                                    title={isCN ? '点击取消选中' : 'Click to deselect'}
                                                                >
                                                                    <div className="relative w-[46px] h-[46px] rounded-full overflow-hidden ring-2 ring-offset-1 ring-emerald-500 shadow-md group-hover:ring-red-400 group-hover:shadow-red-100 transition-all duration-200">
                                                                        <AgentAvatarImg nameOrId={agent.id} size={46} />
                                                                        <div className="absolute inset-0 bg-red-500/0 group-hover:bg-red-500/20 transition-colors flex items-center justify-center">
                                                                            <svg className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                                            </svg>
                                                                        </div>
                                                                    </div>
                                                                    <span className="text-[11px] font-medium text-emerald-700 text-center leading-tight whitespace-nowrap max-w-[60px] truncate group-hover:max-w-none group-hover:overflow-visible">{isCN ? agent.nameCN : agent.name}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* ── Scatter pool — unselected user-toggleable agents ── */}
                                                    <div className="px-3 py-2">
                                                        <div className="relative" style={{ height: 320 }}>
                                                            {(() => {
                                                                const unselected = SUMMON_POOL.filter(a => a.group !== 'system' && !selectedSummonIds.has(a.id));
                                                                if (unselected.length === 0) return (
                                                                    <div className="flex items-center justify-center h-full">
                                                                        <p className="text-[12px] text-gray-300">
                                                                            {isCN ? '全部已选中' : 'All selected'}
                                                                        </p>
                                                                    </div>
                                                                );
                                                                const cx = 50, cy = 50;
                                                                // Seeded random
                                                                let seed = 0;
                                                                for (let i = 0; i < (sessionId || 'x').length; i++) seed = ((seed << 5) - seed + (sessionId || 'x').charCodeAt(i)) | 0;
                                                                const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed & 0x7fffffff) / 2147483647; };

                                                                // Place with random angle + radius
                                                                type Pt = { x: number; y: number };
                                                                const pts: Pt[] = unselected.map(() => {
                                                                    const angle = rand() * Math.PI * 2;
                                                                    const r = 14 + rand() * 28;
                                                                    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) * 0.75 };
                                                                });
                                                                // Push apart
                                                                const minDist = 22;
                                                                for (let iter = 0; iter < 8; iter++) {
                                                                    for (let i = 0; i < pts.length; i++) {
                                                                        for (let j = i + 1; j < pts.length; j++) {
                                                                            const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
                                                                            const d = Math.sqrt(dx * dx + dy * dy) || 0.1;
                                                                            if (d < minDist) {
                                                                                const push = (minDist - d) / 2 + 0.5;
                                                                                const nx = dx / d, ny = dy / d;
                                                                                pts[i].x -= nx * push; pts[i].y -= ny * push;
                                                                                pts[j].x += nx * push; pts[j].y += ny * push;
                                                                            }
                                                                        }
                                                                        pts[i].x = Math.max(10, Math.min(90, pts[i].x));
                                                                        pts[i].y = Math.max(10, Math.min(90, pts[i].y));
                                                                    }
                                                                }

                                                                return unselected.map((agent, ui) => {
                                                                    const { x: px, y: py } = pts[ui];
                                                                    const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
                                                                    const distRatio = Math.min(dist / 42, 1);
                                                                    const avatarSize = Math.round(50 - distRatio * 8);
                                                                    return (
                                                                        <button key={agent.id}
                                                                            onClick={() => setSelectedSummonIds(prev => new Set([...prev, agent.id]))}
                                                                            className="absolute flex flex-col items-center transition-all duration-400 ease-out group"
                                                                            style={{
                                                                                left: `${px}%`, top: `${py}%`,
                                                                                transform: 'translate(-50%, -50%)',
                                                                                animation: `summon-float 0.6s cubic-bezier(0.22,1,0.36,1) ${ui * 0.05}s both, summon-hover ${3 + (ui % 4) * 0.8}s ease-in-out ${ui * 0.3}s infinite`,
                                                                                zIndex: Math.round(5 - distRatio * 4),
                                                                            }}
                                                                        >
                                                                            <div className="relative rounded-full overflow-hidden transition-all duration-300 group-hover:scale-110 group-hover:shadow-md"
                                                                                style={{
                                                                                    width: avatarSize, height: avatarSize,
                                                                                    opacity: 0.55 + (1 - distRatio) * 0.3,
                                                                                    filter: `grayscale(${Math.round(distRatio * 60)}%)`,
                                                                                }}
                                                                            >
                                                                                <AgentAvatarImg nameOrId={agent.id} size={avatarSize} />
                                                                            </div>
                                                                            <span className="mt-0.5 font-medium text-center leading-tight whitespace-nowrap transition-colors"
                                                                                style={{ fontSize: 11, color: '#6b7280', opacity: 0.7 + (1 - distRatio) * 0.3 }}
                                                                            >{isCN ? agent.nameCN : agent.name}</span>
                                                                        </button>
                                                                    );
                                                                });
                                                            })()}
                                                        </div>
                                                    </div>
                                                    <div className="px-4 pb-4 pt-1 flex gap-2"
                                                        style={{ animation: 'summon-text 0.4s ease-out 0.8s both' }}
                                                    >
                                                        <button onClick={() => { setSummonPhase('idle'); setPendingRtText(null); setMessages(prev => prev.slice(0, -1)); }}
                                                            className="px-4 py-2.5 border border-gray-200 text-gray-500 text-[12px] font-medium rounded-xl hover:bg-gray-50 transition-colors"
                                                        >{t.cancel}</button>
                                                        <button onClick={handleSummonConfirm}
                                                            disabled={selectedSummonIds.size === 0}
                                                            className="flex-1 py-2.5 bg-emerald-500 text-white text-[12px] font-semibold rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-emerald-200"
                                                        >
                                                            <span>{t.btn}</span>
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );})()}

                            <div ref={messagesEndRef} />
                        </div>
                    </div>
                </div>
            </div>

                    {/* Input */}
                    <div className="absolute bottom-0 left-0 right-0 z-40 pt-2 pb-4 px-4 md:px-8 pointer-events-none">
                        <div className="max-w-2xl mx-auto pointer-events-auto">
                            <div className="bg-white/90 backdrop-blur-xl border border-gray-200 rounded-2xl relative ring-1 ring-gray-100" style={{ boxShadow: '0 4px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)' }}>
                                {/* Voice overlay: Recording */}
                                {voiceState === 'recording' && (
                                    <div className="absolute inset-x-0 top-0 bottom-[52px] flex items-center justify-center">
                                        <div className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm">
                                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                                            <div className="flex items-end gap-[3px] h-4">
                                                {[
                                                    { delay: '0s', dur: '1.8s' },
                                                    { delay: '0.3s', dur: '1.2s' },
                                                    { delay: '0.6s', dur: '2.1s' },
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
                                {chatImageAttachments.length > 0 && voiceState === 'idle' && (
                                    <div className="flex items-center gap-2 px-4 pt-3 flex-wrap">
                                        {chatImageAttachments.map((img) => (
                                            <div key={img.id} className="relative group shrink-0">
                                                <img
                                                    src={img.previewUrl}
                                                    alt=""
                                                    onClick={() => openPendingImagePreview(chatImageAttachments.findIndex(item => item.id === img.id))}
                                                    className={`w-12 h-12 rounded-xl object-cover border shadow-sm cursor-zoom-in ${img.status === 'error' ? 'border-red-300' : 'border-gray-200'}`}
                                                />
                                                {img.status === 'uploading' && (
                                                    <span className="absolute inset-0 rounded-xl bg-black/35 flex items-center justify-center">
                                                        <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                                                    </span>
                                                )}
                                                {img.status === 'error' && (
                                                    <span className="absolute inset-0 rounded-xl bg-red-500/50 flex items-center justify-center" title="Upload failed">
                                                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v5m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.73 3h16.9a2 2 0 001.73-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                                        </svg>
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => removeChatImage(img.id)}
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
                                    className="w-full bg-transparent outline-none resize-none text-[14px] text-gray-900 placeholder:text-gray-400 px-4 pt-3 pb-1.5 leading-relaxed overflow-y-auto"
                                    style={{ minHeight: '42px', maxHeight: '200px', visibility: voiceState !== 'idle' ? 'hidden' : 'visible' }}
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
                                                                onClick={() => {
                                                                    setChatMode(m.id);
                                                                    setChatModeOpen(false);
                                                                }}
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
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${voiceState === 'recording'
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
                                            onClick={isStreaming ? handleStop : handleSend}
                                            disabled={!isStreaming && (chatImageAttachments.some(img => img.status === 'uploading') || (!inputText.trim() && !chatImageAttachments.some(img => img.status === 'uploaded' && img.url)))}
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isStreaming
                                                    ? 'bg-gray-900 text-white hover:bg-gray-700'
                                                    : (inputText.trim() || chatImageAttachments.some(img => img.status === 'uploaded' && img.url))
                                                        ? 'bg-gray-900 text-white hover:bg-gray-800'
                                                        : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                                }`}
                                        >
                                            {isStreaming ? (
                                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* ── Unified Roundtable Panel (tabs: Process | Graph) ── */}
                {(() => { if (showThinkingPanel) console.log('[RT-DEBUG] panel check', { chatMode, routedMode: currentThinking?.routedMode, rtPanelExpanded, activeGraphMsgIdx }); return null; })()}
                {showThinkingPanel && (chatMode === 'roundtable' || currentThinking?.routedMode === 'roundtable') && !rtPanelExpanded && (
                    <div className="w-[480px] shrink-0 border-l border-gray-100 flex flex-col overflow-hidden bg-white">
                        {/* Tab bar */}
                        <div className="flex items-center px-4 py-2.5 border-b border-gray-100 gap-1 shrink-0">
                            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                                <button onClick={() => setPanelTab('process')}
                                    className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                                        panelTab === 'process' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                    }`}>Process</button>
                                <button onClick={() => setPanelTab('graph')}
                                    className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                                        panelTab === 'graph' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                    }`}>Roundtable Graph</button>
                            </div>
                            <div className="flex-1" />
                            <button onClick={() => setRtPanelExpanded(true)}
                                className="w-7 h-7 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-all"
                                title="Expand">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                            </button>
                            <button onClick={() => setShowThinkingPanel(false)}
                                className="w-7 h-7 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-all">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        {/* Content */}
                        {panelTab === 'process' ? (
                            currentThinking ? (
                                <div className="flex-1 overflow-hidden">
                                    <ThinkingProcessSidePanel thinking={currentThinking} onClose={() => setShowThinkingPanel(false)} hideHeader chatMode={chatMode} />
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-[12px] text-gray-400">Waiting for a new discussion…</div>
                            )
                        ) : (
                            <div className="flex-1 overflow-hidden">
                                <RoundtableView data={currentRoundtableData}
                                    isWaiting={isStreaming && currentRoundtableData.rounds.length === 0}
                                    isLive={isStreaming}
                                    hideHeader
                                    summonPhase={summonPhase}
                                    selectedSummonIds={selectedSummonIds}
                                    onSummonToggle={(id) => setSelectedSummonIds(prev => {
                                        const next = new Set(prev);
                                        next.has(id) ? next.delete(id) : next.add(id);
                                        return next;
                                    })}
                                    onSummonConfirm={handleSummonConfirm}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* ── Fullscreen Roundtable Panel (Process 1/3 + Graph 2/3) ── */}
                {rtPanelExpanded && showThinkingPanel && (chatMode === 'roundtable' || currentThinking?.routedMode === 'roundtable') && (
                    <div className="fixed inset-0 z-50 bg-white flex flex-col">
                        {/* Header bar */}
                        <div className="flex items-center px-5 py-3 border-b border-gray-100 shrink-0">
                            <span className="text-[14px] font-bold text-gray-900">Roundtable Analysis</span>
                            <div className="flex-1" />
                            <button onClick={() => setRtPanelExpanded(false)}
                                className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-all mr-1.5"
                                title="Collapse">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>
                            </button>
                            <button onClick={() => { setRtPanelExpanded(false); setShowThinkingPanel(false); }}
                                className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-all">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        {/* Split: Process (1/3) + Graph (2/3) */}
                        <div className="flex flex-1 min-h-0">
                            <div className="w-1/3 border-r border-gray-100 overflow-hidden flex flex-col">
                                <div className="px-4 py-3 border-b border-gray-50 shrink-0">
                                    <span className="text-[13px] font-bold text-gray-800">Process</span>
                                </div>
                                {currentThinking ? (
                                    <div className="flex-1 overflow-hidden">
                                        <ThinkingProcessSidePanel thinking={currentThinking} onClose={() => { setRtPanelExpanded(false); setShowThinkingPanel(false); }} hideHeader chatMode={chatMode} />
                                    </div>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center text-[12px] text-gray-400">Waiting for a new discussion…</div>
                                )}
                            </div>
                            <div className="w-2/3 overflow-hidden flex flex-col">
                                <div className="px-4 py-3 border-b border-gray-50 shrink-0">
                                    <span className="text-[13px] font-bold text-gray-800">Roundtable Graph</span>
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <RoundtableView data={currentRoundtableData}
                                        isWaiting={isStreaming && currentRoundtableData.rounds.length === 0}
                                        isLive={isStreaming}
                                        hideHeader
                                        summonPhase={summonPhase}
                                        selectedSummonIds={selectedSummonIds}
                                        onSummonToggle={(id) => setSelectedSummonIds(prev => {
                                            const next = new Set(prev);
                                            next.has(id) ? next.delete(id) : next.add(id);
                                            return next;
                                        })}
                                        onSummonConfirm={handleSummonConfirm}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Non-roundtable: original Thinking Process Side Panel */}
                {showThinkingPanel && currentThinking && chatMode !== 'roundtable' && currentThinking.routedMode !== 'roundtable' && (
                    <div className="w-[360px] shrink-0 border-l border-gray-100 overflow-hidden">
                        <ThinkingProcessSidePanel
                            thinking={currentThinking}
                            onClose={() => setShowThinkingPanel(false)}
                            chatMode={chatMode}
                        />
                    </div>
                )}

                {/* Standalone Roundtable Panel — only for non-roundtable mode fallback */}
                {showGraphPanel && !showThinkingPanel && !sourcePanelData && chatMode !== 'roundtable' && (
                    <div className="w-[520px] shrink-0 border-l border-gray-100 overflow-hidden relative">
                        <button
                            onClick={() => setShowGraphPanel(false)}
                            className="absolute top-2 right-2 z-20 w-7 h-7 rounded-lg bg-white/80 backdrop-blur border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all shadow-sm"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        <RoundtableView data={currentRoundtableData} isWaiting={isStreaming && currentRoundtableData.rounds.length === 0} isLive={isStreaming} />
                    </div>
                )}

                {/* Sources Side Panel */}
                {sourcePanelData && !showThinkingPanel && (
                    <div className="w-[380px] shrink-0 border-l border-gray-100 flex flex-col bg-white overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                                <span className="text-[13px] font-semibold text-gray-800">{sourcePanelData.length} Sources</span>
                            </div>
                            <button
                                onClick={() => setSourcePanelData(null)}
                                className="w-7 h-7 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-all"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        {/* Source list */}
                        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
                            {sourcePanelData.map((s, si) => (
                                <a
                                    key={si}
                                    href={s.url || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block rounded-lg px-3 py-2.5 hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all group/src"
                                >
                                    <div className="flex items-start gap-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-gray-100 border border-gray-200/60 flex items-center justify-center shrink-0 mt-0.5">
                                            {s.url ? (
                                                <img
                                                    src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`}
                                                    alt=""
                                                    className="w-4 h-4 rounded-sm"
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).nextElementSibling as HTMLElement).style.removeProperty('display'); }}
                                                />
                                            ) : null}
                                            <span className={`text-[9px] text-gray-500 font-bold uppercase ${s.url ? 'hidden' : ''}`}>{(s.favicon === 'web' ? s.domain : s.favicon).slice(0, 2)}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[12.5px] font-medium text-gray-800 group-hover/src:text-blue-600 line-clamp-2 leading-snug">{s.title}</p>
                                            {s.snippet && (
                                                <p className="text-[11px] text-gray-500 mt-1 line-clamp-2 leading-relaxed">{s.snippet}</p>
                                            )}
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                <span className="text-[10px] text-gray-400">{s.domain}</span>
                                                <svg className="w-2.5 h-2.5 text-gray-300 group-hover/src:text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                            </div>
                                        </div>
                                    </div>
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {imagePreview && imagePreview.images.length > 0 && (
                <div
                    className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={closeImagePreview}
                >
                    <div className="relative max-w-[92vw] max-h-[92vh]" onClick={e => e.stopPropagation()}>
                        <img
                            src={imagePreview.images[imagePreview.index]?.url}
                            alt={imagePreview.images[imagePreview.index]?.name || 'preview'}
                            className="max-w-[92vw] max-h-[92vh] object-contain rounded-xl shadow-2xl"
                        />
                        <button
                            type="button"
                            onClick={closeImagePreview}
                            className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white text-gray-700 flex items-center justify-center shadow-lg hover:bg-gray-100"
                            title="关闭"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        {imagePreview.images.length > 1 && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => moveImagePreview(-1)}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 text-gray-700 flex items-center justify-center shadow-lg hover:bg-white"
                                    title="上一张"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => moveImagePreview(1)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 text-gray-700 flex items-center justify-center shadow-lg hover:bg-white"
                                    title="下一张"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                                </button>
                                <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[12px] text-white/90">
                                    {imagePreview.index + 1} / {imagePreview.images.length}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAgentChat;
