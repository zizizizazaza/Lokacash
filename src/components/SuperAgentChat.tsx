/**
 * SuperAgentChat — Chat Detail Page
 * Clean chat interface similar to Surf style, with multi-agent thinking process
 */
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3';
import { socket } from '../services/socket';
import { api } from '../services/api';
import { renderMarkdownContent, extractQuoteSnapshot, QuoteCard, OkxQuoteDerivatives, OkxQuoteNews, extractHeadings, SourcesProvider } from '../utils/markdown';
import { stripInternalResearchCitations } from '../utils/researchCitations';
import { IFlytekStreamer } from '../services/iflytek';
import { I } from './Icons';
import PlanUpgradeEntry from './PlanUpgradeEntry';

function saLog(...args: unknown[]) {
    console.log('[SuperAgentChat]', ...args);
}

/** Space above the bottom of the chat column reserved for the floating input bar (padding + field + controls). TOC must stay above this. */
const TOC_BOTTOM_RESERVE_PX = 148;

/** Minimum TOC panel height so the list isn't collapsed to ~3 rows before layout stabilizes */
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
  // Strip follow-up questions section — the frontend renders it separately as interactive buttons.
  // The HTML generation prompt says not to include it, but the LLM sometimes adds it anyway.
  (function() {
    var kw = ['持续跟踪','关键问题','follow-up questions','follow up questions','questions to watch','延伸思考','延伸问题'];
    function hasKw(t) { t = (t||'').toLowerCase(); return kw.some(function(k){ return t.indexOf(k.toLowerCase()) >= 0; }); }
    document.querySelectorAll('.section-title').forEach(function(el) {
      if (hasKw(el.textContent)) { var s = el.closest('.section') || el.parentElement; if (s) s.remove(); }
    });
    ['h1','h2','h3','h4','strong','b'].forEach(function(tag) {
      document.querySelectorAll(tag).forEach(function(el) {
        if (hasKw(el.textContent)) {
          var block = el.closest('div') || el.parentElement;
          if (block && block !== document.body) block.remove();
        }
      });
    });
  })();
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
    /** From DB; used to restore Thinking Process when reopening a session */
    metadata?: string | null;
    /** Verified source URLs extracted from research data */
    sources?: SearchSource[];
    /** Set when the backend had to degrade this turn to lite-mode (no-agent)
     * because the user ran out of Fast and Roundtable quota. Renders an
     * inline upgrade hint above the response. */
    liteMode?: { hint: string } | null;
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

// Lookup helpers for mapping backend analystId → frontend display name.
const SUMMON_POOL_BY_ID = new Map(SUMMON_POOL.map(a => [a.id, a]));
function getAnalystDisplayName(analystId: string, preferCN = false): string {
    const p = SUMMON_POOL_BY_ID.get(analystId);
    if (!p) return analystId;
    return preferCN ? p.nameCN : p.name;
}

/**
 * Parse a persona's raw answer into the shape the Debate Tab expects.
 * Personas are instructed to emit `SIGNAL: bullish|bearish|neutral` — that's
 * what we map to the "verdict" field. Falls back to 'Neutral' if the model
 * didn't follow the schema.
 */
function parsePersonaVerdict(answer: string): 'Bullish' | 'Bearish' | 'Neutral' {
    const m = answer?.match(/SIGNAL:\s*(bullish|bearish|neutral)/i);
    const raw = m ? m[1].toLowerCase() : 'neutral';
    if (raw === 'bullish') return 'Bullish';
    if (raw === 'bearish') return 'Bearish';
    return 'Neutral';
}

/**
 * Extract a short reasoning snippet from a persona's raw answer. Prefers the
 * RATIONALE section if the persona followed the schema, else uses the first
 * ~200 chars.
 */
function parsePersonaReasoning(answer: string): string {
    if (!answer) return '';
    const m = answer.match(/RATIONALE:\s*([\s\S]+?)(?:\n[A-Z_]+:|\n\n|$)/i);
    if (m && m[1].trim()) return m[1].trim().slice(0, 400);
    return answer.slice(0, 400);
}

const AGENT_COLORS: Record<string, string> = {
    FA: '#475569', MS: '#475569', SE: '#475569', QT: '#475569',
};

/* ── Demo RT fields — canonical 7-agent roundtable for history restoration ── */
function buildDemoRtFields() {
    const sys = SUMMON_POOL.filter(a => a.group === 'system');
    const extra = SUMMON_POOL.filter(a => ['buffett_style', 'dalio_style', 'sentiment_focus'].includes(a.id));
    const all = [...sys, ...extra];
    const r1 = all.slice(0, 2);
    const r2 = all.slice(0, 7);
    const verdicts = ['Bullish', 'Neutral', 'Bearish', 'Bullish', 'Bearish', 'Neutral', 'Bullish'];
    const confs = [78, 62, 45, 71, 82, 58, 75];
    const reasonings = [
        'Revenue grew 18% YoY to $4.2B, beating consensus by $120M. Operating margins expanded 240bps to 28.3% driven by cost optimization and scale efficiencies. Free cash flow conversion improved to 92%. Forward P/E of 22x sits below 5-year average of 26x, suggesting room for multiple expansion. RSI at 58 indicates neutral momentum with no overbought signals. Key risk: rising interest rates could compress multiples in the near term.',
        'Current valuation appears fair at 1.8x PEG ratio. Technical indicators are mixed — MACD shows a pending bullish crossover but volume has been declining for 3 consecutive weeks. The 50-day moving average ($148) is approaching the 200-day ($152), and a golden cross could trigger momentum buying. However, broad macro headwinds including hawkish Fed commentary and rising 10Y yields create uncertainty. Recommend maintaining position but not adding until clearer directional signals emerge.',
        'Sector-wide de-rating in progress as competition intensifies. Company lost 2.1% market share in the latest quarter per IDC data. Gross margins contracted 180bps sequentially. Social sentiment turned notably negative after the product recall announcement, with Twitter mention sentiment dropping from +0.42 to -0.18 in two weeks. Balance sheet remains strong with $8.2B cash and minimal debt, which provides a floor, but near-term catalysts are lacking.',
        'Tail risk assessment: correlation breakdown probability sits at 12% based on our fractal model. The current volatility regime is transitioning from low to moderate — VIX term structure shifted to contango. Max drawdown scenario under a 2-sigma stress event would be -18%. However, the company maintains a strong Altman Z-score of 4.2, suggesting minimal bankruptcy risk. Hedging cost via put spreads is relatively cheap at 45bps.',
        'This is a wonderful business at a fair price. 85% customer retention rate, $3.2B in recurring revenue, and a brand moat evidenced by 40% pricing premium vs. closest competitor. Management has demonstrated disciplined capital allocation with $2.1B returned via buybacks. The stock trades at a 21% discount to peer median. As I always say: it is far better to buy a wonderful company at a fair price than a fair company at a wonderful price.',
        'The debt cycle analysis shows we are in the late expansion phase. Central bank tightening is creating headwinds across risk assets. However, this particular company has low leverage (0.8x net debt/EBITDA) and strong cash generation, making it relatively defensive. In an all-weather framework, this position contributes positive risk-adjusted returns across 3 of 4 economic environments. Maintain position but size conservatively given macro uncertainty.',
        'Social sentiment analysis reveals a notable divergence: retail sentiment is turning bullish (+340% mention volume) while institutional positioning shows cautious accumulation. NLP analysis of recent earnings call transcripts indicates management confidence has increased — forward-looking language ratio improved from 0.42 to 0.61. The contrarian signal here is moderately bullish: when retail and institutions align gradually, the trend tends to persist.',
    ];
    return {
        selectedAgentIds: all.map(a => a.id),
        rtPreparationStatus: 'done' as const,
        rtDataSearch: [
            { id: 'indicators', label: 'Market Indicators', labelCN: '市场指标', icon: 'indicators', status: 'done' as const, count: 12, items: ['P/E', 'EPS', 'RSI', 'MACD', 'Volume', 'Revenue', 'Net Income', 'FCF'] },
            { id: 'news', label: 'News & Reports', labelCN: '新闻与报告', icon: 'news', status: 'done' as const, count: 15, sources: [
                { title: 'Q4 Earnings Beat Expectations — Revenue surges 18% YoY', domain: 'reuters.com', favicon: 'reuters', url: 'https://reuters.com' },
                { title: 'Analyst Upgrades Rating to Overweight on Margin Expansion', domain: 'bloomberg.com', favicon: 'bloomberg', url: 'https://bloomberg.com' },
                { title: 'Sector Outlook: Mixed Signals Amid Rising Rates', domain: 'wsj.com', favicon: 'wsj', url: 'https://wsj.com' },
                { title: 'New Product Line Could Drive $2B in Incremental Revenue', domain: 'cnbc.com', favicon: 'cnbc', url: 'https://cnbc.com' },
            ]},
            { id: 'social', label: 'Social Media', labelCN: '社交媒体', icon: 'social', status: 'done' as const, count: 23, sources: [
                { title: 'Bullish sentiment trending — $TICKER mentions up 340% this week', domain: 'x.com', favicon: 'x', url: 'https://x.com' },
                { title: 'Community DD: Deep value analysis with DCF model breakdown', domain: 'reddit.com', favicon: 'reddit', url: 'https://reddit.com' },
                { title: 'Institutional flow data shows heavy accumulation at support', domain: 'stocktwits.com', favicon: 'stocktwits', url: 'https://stocktwits.com' },
            ]},
        ],
        rtRounds: [
            {
                round: 1, status: 'done' as const,
                agents: r1.map((a, i) => ({ agentId: a.id, agentName: a.name, status: 'done' as const, verdict: verdicts[i], confidence: confs[i], reasoning: reasonings[i] })),
            },
            {
                round: 2, status: 'done' as const,
                agents: r2.map((a, i) => ({
                    agentId: a.id, agentName: a.name, status: 'done' as const,
                    verdict: i === 2 ? 'Neutral' : verdicts[i], confidence: confs[i] + (i === 2 ? 10 : 0), reasoning: reasonings[i],
                    changedMind: i === 2, previousVerdict: i === 2 ? 'Bearish' : undefined,
                    crossReferences: [r2[(i + 1) % r2.length]?.name, r2[(i + 2) % r2.length]?.name].filter(Boolean),
                })),
            },
        ],
        rtConsensus: {
            status: 'done' as const, hasConsensus: true, conflictRate: 20,
            agentConclusions: r2.map((a, i) => ({ agentName: a.name, verdict: i === 2 ? 'Neutral' : verdicts[i], confidence: confs[i] + (i === 2 ? 10 : 0) })),
            finalVerdict: 'Bullish', finalConfidence: 74,
        },
        rtReportStatus: 'done' as const,
    };
}

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

    // --- Reconstruct rtDataSearch from modules ---
    const searchMod = modules.find(m => m.type === 'search');
    const searchData = searchMod?.data as SearchModuleData | undefined;
    const searchSources = searchData?.sources || [];
    const sectionSources = searchData?.sections?.find((s: any) => s.id === 'social')?.sources || [];

    const newsSrc = searchSources.filter(s =>
        !['x.com', 'twitter.com', 'reddit.com', 'stocktwits.com'].includes(s.domain)
    );
    const socialSrc = [...sectionSources, ...searchSources.filter(s =>
        ['x.com', 'twitter.com', 'reddit.com', 'stocktwits.com'].includes(s.domain)
    )];

    const rtDataSearch: RtDataCategory[] = [
        { id: 'indicators', label: 'Market Indicators', labelCN: '市场指标', icon: 'indicators', status: 'done', count: 12, items: ['P/E', 'EPS', 'RSI', 'MACD', 'Volume', 'Revenue', 'Net Income', 'FCF'] },
        { id: 'news', label: 'News & Reports', labelCN: '新闻与报告', icon: 'news', status: 'done', count: newsSrc.length || 8,
            ...(newsSrc.length > 0 ? { sources: newsSrc.map(s => ({ title: s.title, domain: s.domain, favicon: s.favicon, url: s.url })) } : {}),
        },
        { id: 'social', label: 'Social Media', labelCN: '社交媒体', icon: 'social', status: 'done', count: socialSrc.length || 6,
            ...(socialSrc.length > 0 ? { sources: socialSrc.map(s => ({ title: s.title, domain: s.domain, favicon: s.favicon, url: s.url })) } : {}),
        },
    ];

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
        conflictRate: consensusReached ? 15 : 40,
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
    type: 'asset' | 'role' | 'evidence' | 'knowledge' | 'conclusion' | 'agent' | 'task' | 'stance';
    label: string;
    x: number;
    y: number;
    group?: string;
    data?: Record<string, any>;
}

interface KGEdge {
    id: string;
    source: string;
    target: string;
    label: string;
    type?: 'analyzes' | 'cites' | 'informs' | 'supports' | 'challenges' | 'converges_to' | 'has_metric' | string;
    data?: Record<string, any>;
}

interface KnowledgeGraphData {
    nodes: KGNode[];
    edges: KGEdge[];
}

// Investment Committee Explainability Graph (AAPL demo) — 7-agent committee
const STATIC_KG_DATA: KnowledgeGraphData = {
    nodes: [
        { id: 'asset_aapl', type: 'asset', label: 'AAPL', group: 'center', x: 0, y: 0, data: { symbol: 'AAPL', market: 'US', asset_type: 'equity', summary: 'Apple Inc. — US equity under committee review for position sizing and tactical call.' } },

        // 7 Role nodes (match buildDemoRtFields pool: 4 system + buffett + dalio + sentiment)
        { id: 'role_fundamental', type: 'role', label: 'Fundamental Analyst', group: 'role', x: 0, y: 0, data: { agentId: 'fundamental_specialist', color: '#3B82F6', initial_signal: 'buy',  final_signal: 'hold', confidence: 0.71, changed_position: true,  summary: 'Revenue +18% YoY, margins expanding, but flagged valuation risk in round 2.' } },
        { id: 'role_valuation',   type: 'role', label: 'Valuation Analyst',   group: 'role', x: 0, y: 0, data: { agentId: 'valuation_specialist',   color: '#6366F1', initial_signal: 'hold', final_signal: 'hold', confidence: 0.62, changed_position: false, summary: 'PEG fair at 1.8x, forward P/E slightly rich vs 5Y average.' } },
        { id: 'role_macro',       type: 'role', label: 'Macro Analyst',       group: 'role', x: 0, y: 0, data: { agentId: 'macro_specialist',       color: '#8B5CF6', initial_signal: 'sell', final_signal: 'hold', confidence: 0.55, changed_position: true,  summary: 'Hawkish Fed + rising 10Y yields create headwinds; revised up on resilient liquidity.' } },
        { id: 'role_risk',        type: 'role', label: 'Risk Analyst',        group: 'role', x: 0, y: 0, data: { agentId: 'risk_specialist',        color: '#EF4444', initial_signal: 'hold', final_signal: 'hold', confidence: 0.70, changed_position: false, summary: 'Tail risk 12%, max drawdown -18% under 2σ stress. Strong Z-score.' } },
        { id: 'role_buffett',     type: 'role', label: 'Warren Buffett',      group: 'role', x: 0, y: 0, data: { agentId: 'buffett_style',          color: '#1E40AF', initial_signal: 'buy',  final_signal: 'buy',  confidence: 0.82, changed_position: false, summary: 'Wonderful business at fair price — 85% retention, 40% pricing premium.' } },
        { id: 'role_dalio',       type: 'role', label: 'Ray Dalio',           group: 'role', x: 0, y: 0, data: { agentId: 'dalio_style',            color: '#1D4ED8', initial_signal: 'hold', final_signal: 'hold', confidence: 0.58, changed_position: false, summary: 'Late expansion phase; defensive due to low leverage and strong FCF.' } },
        { id: 'role_sentiment',   type: 'role', label: 'Sentiment Analyst',   group: 'role', x: 0, y: 0, data: { agentId: 'sentiment_focus',        color: '#0891B2', initial_signal: 'buy',  final_signal: 'buy',  confidence: 0.75, changed_position: false, summary: 'Retail mentions +340%, management forward-language ratio 0.42→0.61.' } },

        // Evidence — consensus (green) drives alignment; divergence (red) fuels debate
        { id: 'evidence_rev_growth',      type: 'evidence', label: 'Revenue Growth Resilient (+18% YoY)', group: 'evidence_positive', x: 0, y: 0, data: { polarity: 'positive', importance: 'high',   category: 'fundamentals', detail: 'Q4 revenue $4.2B, beat consensus by $120M. Operating margin +240bps.', cited_by: ['Fundamental', 'Buffett'] } },
        { id: 'evidence_margin_quality',  type: 'evidence', label: 'Business Quality Moat',               group: 'evidence_positive', x: 0, y: 0, data: { polarity: 'positive', importance: 'medium', category: 'fundamentals', detail: '85% retention, 40% pricing premium vs closest peer, 92% FCF conversion.', cited_by: ['Fundamental', 'Buffett'] } },
        { id: 'evidence_retail_flow',     type: 'evidence', label: 'Retail Sentiment Turning Bullish',    group: 'evidence_positive', x: 0, y: 0, data: { polarity: 'positive', importance: 'medium', category: 'sentiment',    detail: 'Twitter mention volume +340% this week, institutional accumulation at support.', cited_by: ['Sentiment'] } },
        { id: 'evidence_pe_rich',         type: 'evidence', label: 'Valuation Above Historical Median',   group: 'evidence_negative', x: 0, y: 0, data: { polarity: 'negative', importance: 'high',   category: 'valuation',    detail: 'Forward P/E 22x vs 5Y average 26x — moderately rich on risk-adjusted basis.', cited_by: ['Valuation', 'Dalio'] } },
        { id: 'evidence_macro_uncertain', type: 'evidence', label: 'Macro Liquidity Uncertain',            group: 'evidence_negative', x: 0, y: 0, data: { polarity: 'negative', importance: 'medium', category: 'macro',        detail: 'Fed hawkish stance + 10Y yield rise creates multi-expansion risk.', cited_by: ['Macro', 'Dalio'] } },
        { id: 'evidence_event_risk',      type: 'evidence', label: 'Upcoming Event Risk',                 group: 'evidence_negative', x: 0, y: 0, data: { polarity: 'negative', importance: 'high',   category: 'risk',         detail: 'Upcoming product event + supply chain audit — tail risk 12%, -18% max DD under 2σ.', cited_by: ['Risk'] } },

        // Knowledge bases
        { id: 'knowledge_doc_valuation', type: 'knowledge', label: 'Valuation Playbook',           group: 'knowledge', x: 0, y: 0, data: { knowledge_type: 'document',        summary: 'Internal playbook for large-cap valuation decision rules.' } },
        { id: 'knowledge_case_similar',  type: 'knowledge', label: 'Historical Case: Hold Setup',  group: 'knowledge', x: 0, y: 0, data: { knowledge_type: 'historical_case', summary: 'Prior large-cap hold setup (2023 Q2) — similar margin & macro backdrop.' } },
        { id: 'knowledge_market_data',   type: 'knowledge', label: 'Market Indicators Feed',       group: 'knowledge', x: 0, y: 0, data: { knowledge_type: 'data_feed',       summary: 'P/E, EPS, RSI, MACD, Volume, Revenue, FCF, Net Income — 12 indicators.' } },
        { id: 'knowledge_news_feed',     type: 'knowledge', label: 'News & Reports',               group: 'knowledge', x: 0, y: 0, data: { knowledge_type: 'news_feed',       summary: '15 articles from Reuters / Bloomberg / WSJ / CNBC ingested this session.' } },
        { id: 'knowledge_social_feed',   type: 'knowledge', label: 'Social Sentiment Feed',        group: 'knowledge', x: 0, y: 0, data: { knowledge_type: 'social_feed',     summary: '23 sources from X / Reddit / StockTwits tracked for retail sentiment signals.' } },

        // Final conclusion (single node — metrics folded into the main label)
        { id: 'conclusion_action', type: 'conclusion', label: 'Final: HOLD · 74% · 5%', group: 'conclusion', x: 0, y: 0, data: { action: 'hold', confidence: 0.74, target_exposure_pct: 0.05, summary: 'Committee converged to HOLD after 2 rounds; 20% conflict rate; 74% weighted confidence; target exposure 5%.' } },
    ],
    edges: [
        // All 7 roles analyze the asset
        { id: 'edge_role_fundamental_asset', source: 'role_fundamental', target: 'asset_aapl', type: 'analyzes', label: 'analyzes' },
        { id: 'edge_role_valuation_asset',   source: 'role_valuation',   target: 'asset_aapl', type: 'analyzes', label: 'analyzes' },
        { id: 'edge_role_macro_asset',       source: 'role_macro',       target: 'asset_aapl', type: 'analyzes', label: 'analyzes' },
        { id: 'edge_role_risk_asset',        source: 'role_risk',        target: 'asset_aapl', type: 'analyzes', label: 'analyzes' },
        { id: 'edge_role_buffett_asset',     source: 'role_buffett',     target: 'asset_aapl', type: 'analyzes', label: 'analyzes' },
        { id: 'edge_role_dalio_asset',       source: 'role_dalio',       target: 'asset_aapl', type: 'analyzes', label: 'analyzes' },
        { id: 'edge_role_sentiment_asset',   source: 'role_sentiment',   target: 'asset_aapl', type: 'analyzes', label: 'analyzes' },

        // roles cite evidence
        { id: 'edge_fundamental_rev',    source: 'role_fundamental', target: 'evidence_rev_growth',      type: 'cites', label: 'cites' },
        { id: 'edge_fundamental_margin', source: 'role_fundamental', target: 'evidence_margin_quality',  type: 'cites', label: 'cites' },
        { id: 'edge_buffett_margin',     source: 'role_buffett',     target: 'evidence_margin_quality',  type: 'cites', label: 'cites' },
        { id: 'edge_buffett_rev',        source: 'role_buffett',     target: 'evidence_rev_growth',      type: 'cites', label: 'cites' },
        { id: 'edge_valuation_pe',       source: 'role_valuation',   target: 'evidence_pe_rich',         type: 'cites', label: 'cites' },
        { id: 'edge_dalio_pe',           source: 'role_dalio',       target: 'evidence_pe_rich',         type: 'cites', label: 'cites' },
        { id: 'edge_macro_liquidity',    source: 'role_macro',       target: 'evidence_macro_uncertain', type: 'cites', label: 'cites' },
        { id: 'edge_dalio_macro',        source: 'role_dalio',       target: 'evidence_macro_uncertain', type: 'cites', label: 'cites' },
        { id: 'edge_risk_event',         source: 'role_risk',        target: 'evidence_event_risk',      type: 'cites', label: 'cites' },
        { id: 'edge_sentiment_retail',   source: 'role_sentiment',   target: 'evidence_retail_flow',     type: 'cites', label: 'cites' },

        // knowledge informs roles
        { id: 'edge_doc_to_valuation', source: 'knowledge_doc_valuation', target: 'role_valuation', type: 'informs', label: 'informs' },
        { id: 'edge_case_to_risk',     source: 'knowledge_case_similar',  target: 'role_risk',      type: 'informs', label: 'informs' },
        { id: 'edge_doc_to_buffett',   source: 'knowledge_doc_valuation', target: 'role_buffett',   type: 'informs', label: 'informs' },
        { id: 'edge_mkt_to_fundamental', source: 'knowledge_market_data', target: 'role_fundamental', type: 'informs', label: 'informs' },
        { id: 'edge_mkt_to_valuation',   source: 'knowledge_market_data', target: 'role_valuation',   type: 'informs', label: 'informs' },
        { id: 'edge_news_to_macro',      source: 'knowledge_news_feed',   target: 'role_macro',       type: 'informs', label: 'informs' },
        { id: 'edge_news_to_dalio',      source: 'knowledge_news_feed',   target: 'role_dalio',       type: 'informs', label: 'informs' },
        { id: 'edge_social_to_sentiment', source: 'knowledge_social_feed', target: 'role_sentiment',  type: 'informs', label: 'informs' },

        // evidence supports conclusion
        { id: 'edge_rev_to_conclusion',    source: 'evidence_rev_growth',      target: 'conclusion_action', type: 'supports', label: 'supports' },
        { id: 'edge_margin_to_conclusion', source: 'evidence_margin_quality',  target: 'conclusion_action', type: 'supports', label: 'supports' },
        { id: 'edge_retail_to_conclusion', source: 'evidence_retail_flow',     target: 'conclusion_action', type: 'supports', label: 'supports' },
        { id: 'edge_pe_to_conclusion',     source: 'evidence_pe_rich',         target: 'conclusion_action', type: 'supports', label: 'supports_hold' },
        { id: 'edge_macro_to_conclusion',  source: 'evidence_macro_uncertain', target: 'conclusion_action', type: 'supports', label: 'supports_hold' },
        { id: 'edge_risk_to_conclusion',   source: 'evidence_event_risk',      target: 'conclusion_action', type: 'supports', label: 'supports_hold' },

        // challenges (debate — 分歧)
        { id: 'edge_valuation_challenges_fundamental', source: 'role_valuation', target: 'role_fundamental', type: 'challenges', label: 'challenges optimism' },
        { id: 'edge_macro_challenges_fundamental',     source: 'role_macro',     target: 'role_fundamental', type: 'challenges', label: 'questions timing' },
        { id: 'edge_risk_challenges_buffett',          source: 'role_risk',      target: 'role_buffett',     type: 'challenges', label: 'flags event risk' },
        { id: 'edge_dalio_challenges_sentiment',       source: 'role_dalio',     target: 'role_sentiment',   type: 'challenges', label: 'cautions on retail froth' },

        // roles converge to final conclusion
        { id: 'edge_fundamental_to_final', source: 'role_fundamental', target: 'conclusion_action', type: 'converges_to', label: 'revises_to_hold' },
        { id: 'edge_valuation_to_final',   source: 'role_valuation',   target: 'conclusion_action', type: 'converges_to', label: 'supports_hold' },
        { id: 'edge_macro_to_final',       source: 'role_macro',       target: 'conclusion_action', type: 'converges_to', label: 'supports_hold' },
        { id: 'edge_risk_to_final',        source: 'role_risk',        target: 'conclusion_action', type: 'converges_to', label: 'supports_hold' },
        { id: 'edge_buffett_to_final',     source: 'role_buffett',     target: 'conclusion_action', type: 'converges_to', label: 'supports_hold' },
        { id: 'edge_dalio_to_final',       source: 'role_dalio',       target: 'conclusion_action', type: 'converges_to', label: 'supports_hold' },
        { id: 'edge_sentiment_to_final',   source: 'role_sentiment',   target: 'conclusion_action', type: 'converges_to', label: 'supports_hold' },
    ]
};

const buildKnowledgeGraph = (): KnowledgeGraphData => STATIC_KG_DATA;

// ─── KnowledgeGraphView Component ──────────────────────────
const KnowledgeGraphView: React.FC<{ data: KnowledgeGraphData; animate?: boolean }> = ({ data, animate = false }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoverNode, setHoverNode] = useState<{ node: any; x: number; y: number } | null>(null);

    // Styling maps by node.type — simplified palette: neutral + 3 semantic accents
    const NEUTRAL = { fill: '#f8fafc', stroke: '#94a3b8', text: '#334155' };
    const NODE_STYLE: Record<string, { fill: string; stroke: string; text: string; r: number }> = {
        asset:      { fill: '#fef3c7', stroke: '#d97706', text: '#92400e', r: 26 },
        role:       { ...NEUTRAL, r: 20 },
        evidence:   { ...NEUTRAL, r: 14 },
        knowledge:  { ...NEUTRAL, r: 14 },
        conclusion: { fill: '#dcfce7', stroke: '#16a34a', text: '#14532d', r: 18 },
        agent:      { ...NEUTRAL, r: 18 },
        task:       { ...NEUTRAL, r: 14 },
        stance:     { ...NEUTRAL, r: 14 },
    };
    // Evidence colored only by polarity: green = 共识点, red = 分歧点, else neutral
    const getNodeStyle = (n: any) => {
        const base = NODE_STYLE[n.type] || NODE_STYLE.evidence;
        if (n.type === 'evidence') {
            const polarity = n.data?.polarity;
            if (polarity === 'positive') return { fill: '#dcfce7', stroke: '#16a34a', text: '#14532d', r: 14 };
            if (polarity === 'negative') return { fill: '#fee2e2', stroke: '#dc2626', text: '#991b1b', r: 14 };
        }
        return base;
    };

    // Unified edge styling: single light-gray stroke, no labels, no per-type color
    const EDGE_STYLE_DEFAULT = { stroke: '#cbd5e1', width: 1.2, marker: 'arrow-gray' };
    const getEdgeStyle = (_e: any) => EDGE_STYLE_DEFAULT;

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

        // Define one arrow marker per stroke color
        const defs = svg.append('defs');
        const markers: { id: string; fill: string }[] = [
            { id: 'arrow-gray',   fill: '#cbd5e1' },
        ];
        markers.forEach(m => {
            defs.append('marker')
                .attr('id', m.id)
                .attr('viewBox', '0 -5 10 10')
                .attr('refX', 22)
                .attr('refY', 0)
                .attr('markerWidth', 5)
                .attr('markerHeight', 5)
                .attr('orient', 'auto')
                .append('path')
                .attr('fill', m.fill)
                .attr('d', 'M0,-4L8,0L0,4');
        });

        const nodes = data.nodes.map(d => ({ ...d }));
        const edges = data.edges.map(d => ({ ...d }));

        // ── Staged reveal: stages match left-panel phases ──
        // Stage 0 = Team summoned (asset + roles) — visible immediately
        // Stage 1 = Data Collection (gray knowledge feeds)
        // Stage 2 = Round 1 (positive/consensus evidence — green)
        // Stage 3 = Round 2 (negative/divergence evidence — red + challenges)
        // Stage 4 = Conclusion
        const stageOf = (n: any): number => {
            if (n.type === 'asset') return 0;
            if (n.type === 'role') return 0;
            if (n.type === 'knowledge') return 1;
            if (n.type === 'evidence') return n.data?.polarity === 'negative' ? 3 : 2;
            if (n.type === 'conclusion') return 4;
            return 0;
        };
        nodes.forEach((n: any) => { n._stage = stageOf(n); });
        const stageById = new Map<string, number>(nodes.map((n: any) => [n.id, n._stage]));
        edges.forEach((e: any) => {
            const src = typeof e.source === 'string' ? e.source : e.source?.id;
            const tgt = typeof e.target === 'string' ? e.target : e.target?.id;
            let st = Math.max(stageById.get(src) ?? 0, stageById.get(tgt) ?? 0);
            // Debate edges belong to Round 2 regardless of endpoints
            if (e.type === 'challenges') st = Math.max(st, 3);
            // analyzes (role → asset) is part of team assembly — instant
            if (e.type === 'analyzes') st = 0;
            e._stage = st;
        });

        const simulation = d3.forceSimulation(nodes as any)
            .force('link', d3.forceLink(edges).id((d: any) => d.id).distance((d: any) => {
                // Longer links by relationship semantics — spreads the graph
                if (d.type === 'analyzes') return 180;
                if (d.type === 'cites') return 170;
                if (d.type === 'supports' || d.type === 'converges_to') return 210;
                if (d.type === 'challenges') return 150;
                if (d.type === 'informs') return 160;
                return 180;
            }).strength(0.35))
            .force('charge', d3.forceManyBody().strength(-1100).distanceMin(30).distanceMax(width))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('x', d3.forceX(width / 2).strength(0.04))
            .force('y', d3.forceY(height / 2).strength(0.04))
            .force('collide', d3.forceCollide().radius((d: any) => (getNodeStyle(d).r + 32)).strength(0.9));

        const link = g.append('g')
            .selectAll('line')
            .data(edges)
            .join('line')
            .attr('stroke', (d: any) => getEdgeStyle(d).stroke)
            .attr('stroke-opacity', 0)
            .attr('stroke-width', (d: any) => getEdgeStyle(d).width)
            .attr('marker-end', (d: any) => `url(#${getEdgeStyle(d).marker})`);

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
            .style('cursor', 'grab')
            .style('opacity', 0);

        node.append('circle')
            .attr('r', (d: any) => getNodeStyle(d).r)
            .attr('fill', (d: any) => d.type === 'role' ? '#ffffff' : getNodeStyle(d).fill)
            .attr('stroke', (d: any) => d.type === 'role' && d.data?.color ? d.data.color : getNodeStyle(d).stroke)
            .attr('stroke-width', (d: any) => d.type === 'role' ? 2.5 : (d.type === 'asset' || d.type === 'conclusion' ? 2 : 1.5));

        // Avatar <image> for role nodes (clipped to circle)
        node.filter((d: any) => d.type === 'role' && !!d.data?.agentId)
            .append('clipPath')
            .attr('id', (d: any) => `clip-${d.id}`)
            .append('circle')
            .attr('r', (d: any) => getNodeStyle(d).r - 3);
        node.filter((d: any) => d.type === 'role' && !!d.data?.agentId)
            .append('image')
            .attr('href', (d: any) => AVATAR_MAP[d.data.agentId] || '/avatars/default.jpg')
            .attr('x', (d: any) => -(getNodeStyle(d).r - 3))
            .attr('y', (d: any) => -(getNodeStyle(d).r - 3))
            .attr('width', (d: any) => 2 * (getNodeStyle(d).r - 3))
            .attr('height', (d: any) => 2 * (getNodeStyle(d).r - 3))
            .attr('clip-path', (d: any) => `url(#clip-${d.id})`)
            .attr('preserveAspectRatio', 'xMidYMid slice');

        // Short label (inside circle) only for asset — role now shows avatar instead
        node.append('text')
            .text((d: any) => d.type === 'asset' ? d.label : '')
            .attr('y', 4)
            .attr('font-size', '11px')
            .attr('fill', (d: any) => getNodeStyle(d).text)
            .attr('text-anchor', 'middle')
            .attr('font-weight', 600);

        // Hover handlers — show tooltip via React state
        node
            .on('mouseenter', function (this: any, event: MouseEvent, d: any) {
                const rect = containerRef.current?.getBoundingClientRect();
                const x = rect ? event.clientX - rect.left : event.offsetX;
                const y = rect ? event.clientY - rect.top : event.offsetY;
                setHoverNode({ node: d, x, y });
                d3.select(this).select('circle').attr('stroke-width', 4);
            })
            .on('mousemove', function (_event: MouseEvent, _d: any) { /* position fixed on enter */ })
            .on('mouseleave', function (this: any, _event: MouseEvent, d: any) {
                setHoverNode(null);
                d3.select(this).select('circle')
                    .attr('stroke-width', d.type === 'role' ? 2.5 : (d.type === 'asset' || d.type === 'conclusion' ? 2 : 1.5));
            });

        // External label below circle (wrap long labels)
        node.each(function (this: any, d: any) {
            const sel = d3.select(this as SVGGElement);
            const style = getNodeStyle(d);
            const raw = d.label || '';
            const maxLen = 22;
            const words = raw.split(' ');
            const lines: string[] = [];
            let cur = '';
            for (const w of words) {
                if ((cur + ' ' + w).trim().length > maxLen) {
                    if (cur) lines.push(cur);
                    cur = w;
                } else {
                    cur = (cur + ' ' + w).trim();
                }
                if (lines.length >= 2) break;
            }
            if (cur && lines.length < 2) lines.push(cur);
            if (lines.length === 0) lines.push(raw.slice(0, maxLen));
            // For asset/role: show label outside; for others: show label outside as primary text
            const showOutside = d.type !== 'asset';
            if (!showOutside) return;
            const startY = style.r + 12;
            lines.forEach((ln, i) => {
                sel.append('text')
                    .text(ln)
                    .attr('y', startY + i * 11)
                    .attr('font-size', '9px')
                    .attr('fill', style.text)
                    .attr('text-anchor', 'middle')
                    .attr('font-weight', d.type === 'conclusion' ? 600 : 500);
            });
        });

        simulation.on('tick', () => {
            link
                .attr('x1', (d: any) => d.source.x)
                .attr('y1', (d: any) => d.source.y)
                .attr('x2', (d: any) => d.target.x)
                .attr('y2', (d: any) => d.target.y);

            node
                .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
        });

        // ── Auto-fit: scale the whole graph to the container once the layout settles ──
        const fitToBounds = (padding = 32) => {
            if (!nodes.length) return;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            nodes.forEach((n: any) => {
                const r = (getNodeStyle(n).r || 14) + 14; // include label/shadow
                if (typeof n.x !== 'number' || typeof n.y !== 'number') return;
                if (n.x - r < minX) minX = n.x - r;
                if (n.y - r < minY) minY = n.y - r;
                if (n.x + r > maxX) maxX = n.x + r;
                if (n.y + r > maxY) maxY = n.y + r;
            });
            if (!isFinite(minX) || !isFinite(maxX)) return;
            const bw = maxX - minX;
            const bh = maxY - minY;
            if (bw <= 0 || bh <= 0) return;
            const scale = Math.min(
                (width  - padding * 2) / bw,
                (height - padding * 2) / bh,
                1, // never zoom in beyond 1x — keep it readable
            );
            const tx = width  / 2 - ((minX + maxX) / 2) * scale;
            const ty = height / 2 - ((minY + maxY) / 2) * scale;
            svg.transition().duration(500).call(
                (zoom as any).transform,
                d3.zoomIdentity.translate(tx, ty).scale(scale),
            );
        };
        // Schedule fit once the force layout has settled. For animated reveals
        // we wait until the last stage finished fading in, so every node has
        // settled into position before we measure the bounds.
        // ── Staged reveal animation constants (must be declared before fitDelay uses them) ──
        const MAX_STAGE = 4;
        const STEP_MS = 900;
        const FADE_MS = 550;
        const fitDelay = animate ? (400 + 4 * STEP_MS + 700) : 900;
        const fitTimer = setTimeout(() => fitToBounds(40), fitDelay);
        // Also refit if the container resizes
        const ro = typeof ResizeObserver !== 'undefined' && containerRef.current
            ? new ResizeObserver(() => fitToBounds(40))
            : null;
        if (ro && containerRef.current) ro.observe(containerRef.current);

        // ── Staged reveal animation (only when animate=true, i.e. first generation) ──
        // Historical messages open fully visible — no fade-in.
        const timers: ReturnType<typeof setTimeout>[] = [];
        if (!animate) {
            // Show everything immediately
            node.style('opacity', 1);
            link.attr('stroke-opacity', 0.7);
        } else {
            // Stage 0 — team + asset, instant
            node.filter((d: any) => d._stage === 0).style('opacity', 1);
            link.filter((d: any) => d._stage === 0).attr('stroke-opacity', 0.7);
            // Stages 1..4 — staggered fade-in
            for (let s = 1; s <= MAX_STAGE; s++) {
                const t = setTimeout(() => {
                    node.filter((d: any) => d._stage === s)
                        .transition().duration(FADE_MS).style('opacity', 1);
                    link.filter((d: any) => d._stage === s)
                        .transition().duration(FADE_MS).attr('stroke-opacity', 0.7);
                    simulation.alphaTarget(0.12).restart();
                    const cool = setTimeout(() => simulation.alphaTarget(0), 500);
                    timers.push(cool);
                }, 400 + (s - 1) * STEP_MS);
                timers.push(t);
            }
        }

        return () => {
            timers.forEach(clearTimeout);
            clearTimeout(fitTimer);
            if (ro) ro.disconnect();
            simulation.stop();
        };
    }, [data.nodes, data.edges, animate]);

    return (
        <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-white" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
            <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
            <div className="absolute bottom-4 left-4 flex flex-wrap gap-x-3 gap-y-1.5 z-10 max-w-[calc(100%-2rem)]">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#f8fafc] border border-[#94a3b8]"></div><span className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">News / Knowledge</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#dcfce7] border border-[#16a34a]"></div><span className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">Consensus</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#fee2e2] border border-[#dc2626]"></div><span className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">Divergence</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#dcfce7] border border-[#16a34a]" style={{ borderWidth: 2 }}></div><span className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">Conclusion</span></div>
            </div>
            <div className="absolute top-4 right-4 text-[10px] text-gray-500 font-mono text-right pointer-events-none">
                scroll to zoom<br/>drag to pan
            </div>
            {hoverNode && (() => {
                const n = hoverNode.node;
                const d = n.data || {};
                const rect = containerRef.current?.getBoundingClientRect();
                const W = rect?.width ?? 400;
                const H = rect?.height ?? 600;
                const tipW = 240;
                const tipH = 160;
                const left = Math.min(Math.max(hoverNode.x + 16, 8), W - tipW - 8);
                const top = Math.min(Math.max(hoverNode.y + 16, 8), H - tipH - 8);
                const kv: [string, string][] = [];
                kv.push(['Type', n.type]);
                kv.push(['ID', n.id]);
                if (n.type === 'asset') { if (d.symbol) kv.push(['Symbol', d.symbol]); if (d.market) kv.push(['Market', d.market]); if (d.asset_type) kv.push(['Class', d.asset_type]); }
                if (n.type === 'role') {
                    if (d.initial_signal) kv.push(['Initial', String(d.initial_signal).toUpperCase()]);
                    if (d.final_signal)   kv.push(['Final',   String(d.final_signal).toUpperCase()]);
                    if (typeof d.confidence === 'number') kv.push(['Confidence', `${Math.round(d.confidence * 100)}%`]);
                    if (d.changed_position) kv.push(['Changed Mind', 'Yes']);
                }
                if (n.type === 'evidence') {
                    if (d.polarity) kv.push(['Polarity', d.polarity === 'positive' ? 'Consensus (+)' : d.polarity === 'negative' ? 'Divergence (−)' : 'Neutral']);
                    if (d.importance) kv.push(['Importance', d.importance]);
                    if (d.category) kv.push(['Category', d.category]);
                    if (Array.isArray(d.cited_by)) kv.push(['Cited by', d.cited_by.join(', ')]);
                }
                if (n.type === 'knowledge') { if (d.knowledge_type) kv.push(['Kind', d.knowledge_type]); }
                if (n.type === 'conclusion') {
                    if (d.action) kv.push(['Action', String(d.action).toUpperCase()]);
                    if (typeof d.confidence === 'number') kv.push(['Confidence', `${Math.round(d.confidence * 100)}%`]);
                    if (typeof d.target_exposure_pct === 'number') kv.push(['Exposure', `${Math.round(d.target_exposure_pct * 100)}%`]);
                }
                const detail = d.detail || d.summary;
                return (
                    <div
                        className="absolute z-20 pointer-events-none bg-white/95 backdrop-blur border border-gray-200 rounded-lg shadow-lg px-3 py-2.5"
                        style={{ left, top, width: tipW, maxHeight: tipH + 40 }}
                    >
                        <div className="flex items-center gap-2 mb-1.5">
                            {n.type === 'role' && d.agentId ? (
                                <img src={AVATAR_MAP[d.agentId] || '/avatars/default.jpg'} alt="" className="w-7 h-7 rounded-full object-cover" style={{ border: `2px solid ${d.color || '#94a3b8'}` }} />
                            ) : (
                                <div className="w-7 h-7 rounded-full" style={{ background: getNodeStyle(n).fill, border: `2px solid ${getNodeStyle(n).stroke}` }} />
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="text-[12px] font-semibold text-gray-900 truncate">{n.label}</div>
                                <div className="text-[10px] uppercase tracking-wider text-gray-400 font-mono">{n.type}</div>
                            </div>
                        </div>
                        {detail && (
                            <div className="text-[11px] text-gray-600 leading-snug mb-1.5 line-clamp-3">{detail}</div>
                        )}
                        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                            {kv.slice(0, 5).map(([k, v]) => (
                                <React.Fragment key={k}>
                                    <div className="text-[10px] uppercase tracking-wider text-gray-400 font-mono">{k}</div>
                                    <div className="text-[10px] text-gray-700 font-medium truncate">{v}</div>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                );
            })()}
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
                <KnowledgeGraphView data={buildKnowledgeGraph()} animate={!!isLive} />
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
        'Pulling perpetual funding rates',
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

// ─── PlanPipeline — compact stage pipeline (reused by Roundtable header) ──
// Pushes "process as result" into the left column instead of burying it in
// the right panel. English only — we intentionally ignore backend-provided
// `planningMessage` which may be Chinese.
const PlanPipeline: React.FC<{ thinking: ThinkingFlow; compact?: boolean }> = ({ thinking, compact }) => {
    const isRt = thinking.routedMode === 'roundtable';

    const stages = useMemo(() => {
        if (isRt) {
            // ── Roundtable 5-dot stepper, driven by REAL backend signals ──
            // Previously these dots were driven by `rtDataSearch` /
            // `rtRounds` / `rtPreparationStatus` etc, which were populated
            // by the demo timer chain in handleSummonConfirm. After we
            // disabled the demo, those signals never advance, so the dots
            // would freeze. Now we read directly from:
            //   • thinking.modules         — real backend emitter events
            //   • thinking.rtRounds        — fed by agent_responded events
            //   • thinking.rtConsensus     — fed by consensus_done event
            //   • thinking.isActive        — false once stream_done fires
            const dataArr = thinking.rtDataSearch || [];
            const dataActive = dataArr.some(s => s.status === 'active');
            const dataDoneFromDemo = dataArr.length > 0 && dataArr.every(s => s.status === 'done');
            const roundsArr = thinking.rtRounds || [];
            const roundsActive = roundsArr.some(r => r.status === 'active');
            const roundsDone = roundsArr.length > 0 && roundsArr.every(r => r.status === 'done');
            const mods = thinking.modules || [];
            const dataModuleCompleted = mods.some(
                m => (m.type === 'search' || m.type === 'analysis' || m.type === 'web3') && m.status === 'completed'
            );
            const dataModuleActive = mods.some(
                m =>
                    (m.type === 'search' || m.type === 'analysis' || m.type === 'web3') &&
                    (m.status === 'active' || (m.status as string) === 'analyzing')
            );
            const consensusDone = thinking.rtConsensus?.status === 'done';
            const consensusActive = thinking.rtConsensus?.status === 'active'
                || mods.some(m => m.type === 'consensus' && m.status === 'active');
            const reportActive = thinking.isActive && consensusDone;
            const reportDone = thinking.rtReportStatus === 'done'
                || (!thinking.isActive && consensusDone);

            return [
                { key: 'summon', label: 'Summon',
                    done: roundsArr.length > 0 || roundsActive || consensusActive || consensusDone || thinking.rtPreparationStatus === 'done',
                    active: thinking.rtPreparationStatus !== 'done' && roundsArr.length === 0 && !consensusActive && !consensusDone },
                { key: 'research', label: 'Research',
                    done: dataModuleCompleted || dataDoneFromDemo,
                    active: !dataModuleCompleted && (dataActive || dataModuleActive) },
                { key: 'debate', label: 'Debate',
                    done: roundsDone || consensusDone,
                    active: !consensusDone && (roundsActive || (roundsArr.length > 0 && !roundsDone)) },
                { key: 'consensus', label: 'Consensus',
                    done: consensusDone,
                    active: !consensusDone && consensusActive },
                { key: 'report', label: 'Report',
                    done: reportDone,
                    active: !reportDone && reportActive },
            ];
        }
        const trace = thinking.toolTrace || [];
        const anyRunning = trace.some(t => t.status === 'running');
        const anyDone = trace.some(t => t.status === 'done');
        // Research turns green once all tools stop running — don't gate on
        // !thinking.isActive, since that's also true during the Respond/
        // synthesis phase (tools are done but model is still streaming).
        const researchDone = anyDone && !anyRunning;
        return [
            { key: 'route', label: 'Route',
                done: !!thinking.routedMode, active: !thinking.routedMode && thinking.isActive },
            { key: 'research', label: 'Research',
                done: researchDone,
                active: anyRunning },
            { key: 'respond', label: 'Respond',
                done: !thinking.isActive,
                active: thinking.isActive && !anyRunning && !!thinking.routedMode },
        ];
    }, [thinking, isRt]);

    if (stages.every(s => !s.done && !s.active)) return null;

    const txtCls = compact ? 'text-[10px]' : 'text-[10.5px]';

    return (
        <div className="inline-flex items-center gap-1.5">
            {stages.map((s, i) => {
                const state: 'done' | 'active' | 'pending' = s.done ? 'done' : s.active ? 'active' : 'pending';
                const prev = i > 0 ? stages[i - 1] : null;
                // Connector filled only when prev step is done. If current step is active,
                // animate a gradient sweep from prev (green) → current (gray) to visualize progress.
                const connectorFilled = !!prev && prev.done;
                const connectorAnimating = connectorFilled && state === 'active';
                return (
                    <React.Fragment key={s.key}>
                        {i > 0 && (
                            connectorAnimating ? (
                                <span className="relative h-px w-4 rounded-full overflow-hidden bg-gray-200">
                                    {/* base tint so it's not fully grey */}
                                    <span className="absolute inset-0 bg-emerald-500/20" />
                                    {/* moving shimmer */}
                                    <span
                                        className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
                                        style={{ animation: 'stepper-connector-flow 1.4s ease-in-out infinite' }}
                                    />
                                </span>
                            ) : (
                                <span className={`h-px w-4 rounded-full transition-colors duration-500 ${connectorFilled ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                            )
                        )}
                        <span className="inline-flex items-center gap-1">
                            {state === 'done' ? (
                                <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500 text-white shrink-0 shadow-[0_0_0_2px_rgba(16,185,129,0.12)]">
                                    <svg className="w-[8px] h-[8px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M5 13l4 4L19 7" style={{ strokeDasharray: 24, strokeDashoffset: 0, animation: 'stepper-check-draw 0.35s ease-out' }} />
                                    </svg>
                                </span>
                            ) : state === 'active' ? (
                                <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
                                    {/* outer expanding ring */}
                                    <span className="absolute inset-0 rounded-full border-2 border-gray-900/25" style={{ animation: 'stepper-active-ring 1.6s ease-in-out infinite' }} />
                                    {/* rotating arc */}
                                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 24 24" style={{ animation: 'stepper-spin 1.2s linear infinite' }}>
                                        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
                                            className="text-gray-900" strokeDasharray="14 42" />
                                    </svg>
                                    {/* center solid dot */}
                                    <span className="relative w-1.5 h-1.5 rounded-full bg-gray-900" />
                                </span>
                            ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                            )}
                            <span className={`${txtCls} tracking-wide transition-colors ${
                                state === 'done' ? 'text-gray-600 font-medium'
                                : state === 'active' ? 'text-gray-900 font-semibold'
                                : 'text-gray-400'
                            }`}>{s.label}</span>
                        </span>
                    </React.Fragment>
                );
            })}
        </div>
    );
};

// Kept as a no-op alias so older imports in this file don't break during the
// merge into RoundtableGraphInline. Safe to remove in a follow-up cleanup.
class PlanCardBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(err: unknown, info: unknown) { console.error('[PlanCard crashed]', err, info); }
    render() { return this.state.hasError ? null : this.props.children; }
}

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

    // Unified rich mode for all routed modes (fast / roundtable / undefined):
    // clickable button to open Process panel + rotating ticker of live progress.
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

// ─── TerminalLogPanel (monospace streaming logs) ──────────────
type TermLine = { ts: string; level: 'info' | 'run' | 'ok' | 'err' | 'hdr'; text: string };

const fmtTs = (ms: number) => {
    const d = new Date(ms);
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

const TerminalLogPanel: React.FC<{ thinking: ThinkingFlow | null }> = ({ thinking }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const logRef = useRef<TermLine[]>([]);
    const seenRef = useRef<Set<string>>(new Set());
    const sessionIdRef = useRef<string>('');
    const taskIdRef = useRef<string>('');
    const [, forceTick] = useState(0);

    // Reset log when we switch to a fresh thinking flow
    useEffect(() => {
        logRef.current = [];
        seenRef.current = new Set();
        sessionIdRef.current = '';
        taskIdRef.current = '';
        forceTick(x => x + 1);
    }, [thinking?.startTime, thinking?.route]);

    // Emit new lines as the thinking flow evolves
    useEffect(() => {
        if (!thinking) return;
        const push = (key: string, level: TermLine['level'], text: string) => {
            if (seenRef.current.has(key)) return;
            seenRef.current.add(key);
            logRef.current.push({ ts: fmtTs(Date.now()), level, text });
        };

        // Session header (once per flow)
        if (!sessionIdRef.current) {
            const rand = Math.random().toString(16).slice(2, 14);
            sessionIdRef.current = `sess_${rand}`;
            const startMs = thinking.startTime || Date.now();
            logRef.current.push({ ts: fmtTs(startMs), level: 'hdr', text: sessionIdRef.current });
            logRef.current.push({ ts: fmtTs(startMs), level: 'info', text: 'Session initialized' });
            if (thinking.routedMode) {
                logRef.current.push({ ts: fmtTs(startMs), level: 'info', text: `Route: ${thinking.routedMode}` });
            }
        }

        // Planning message (once)
        if (thinking.planningMessage) {
            push(`plan:${thinking.planningMessage}`, 'info', thinking.planningMessage);
        }

        // Tool trace — detect transitions per index
        const trace = thinking.toolTrace || [];
        trace.forEach((t, idx) => {
            const name = t.displayName || t.tool || 'tool';
            if (t.status === 'running') {
                push(`tool:${idx}:run`, 'run', `→ ${name}`);
            } else if (t.status === 'done') {
                const d = typeof t.durationSec === 'number' ? ` (${t.durationSec.toFixed(2)}s)` : '';
                push(`tool:${idx}:ok`, 'ok', `✓ ${name}${d}`);
            } else if (t.status === 'error') {
                push(`tool:${idx}:err`, 'err', `✗ ${name} failed`);
            }
        });

        // Roundtable milestones
        if (thinking.routedMode === 'roundtable') {
            if (thinking.rtPreparationStatus === 'loading') {
                push('rt:prep:start', 'info', 'Summoning roundtable…');
            }
            if (thinking.rtPreparationStatus === 'done') {
                push('rt:prep:done', 'ok', '✓ Team summoned');
                if (!taskIdRef.current) {
                    taskIdRef.current = `task_rt_${Date.now()}`;
                    push('rt:task', 'info', `Task: ${taskIdRef.current}`);
                }
            }
            const ds = thinking.rtDataSearch || [];
            ds.forEach((cat: any, idx: number) => {
                const label = cat?.category || cat?.label || `category ${idx + 1}`;
                if (cat?.status === 'active' || cat?.status === 'running') {
                    push(`rt:data:${idx}:run`, 'run', `→ Data search: ${label}`);
                }
                if (cat?.status === 'done' || cat?.status === 'completed') {
                    const n = Array.isArray(cat?.results) ? cat.results.length : (cat?.count ?? 0);
                    push(`rt:data:${idx}:ok`, 'ok', `✓ ${label}: ${n} items`);
                }
            });
            const rounds = thinking.rtRounds || [];
            rounds.forEach((r: any, idx: number) => {
                const n = idx + 1;
                if (r?.status === 'active' || r?.status === 'running') {
                    push(`rt:round:${idx}:run`, 'run', `→ Round ${n} debating…`);
                }
                if (r?.status === 'done' || r?.status === 'completed') {
                    const spk = Array.isArray(r?.speeches) ? r.speeches.length : (r?.count ?? 0);
                    push(`rt:round:${idx}:ok`, 'ok', `✓ Round ${n} completed: ${spk} speeches`);
                }
            });
            if (thinking.rtConsensus) {
                push('rt:consensus', 'ok', '✓ Consensus reached');
            }
            if (thinking.rtReportStatus === 'active') {
                push('rt:report:start', 'run', '→ Generating report…');
            }
            if (thinking.rtReportStatus === 'done') {
                push('rt:report:done', 'ok', '✓ Report completed');
            }
        }

        // Signal research log (last30days)
        if (thinking.signalResearchLog) {
            const raw = thinking.signalResearchLog.split('\n').map(s => s.trim()).filter(Boolean);
            raw.forEach((l, idx) => push(`sig:${idx}:${l.slice(0, 40)}`, 'info', l));
        }

        forceTick(x => x + 1);
    }, [thinking, thinking?.toolTrace, thinking?.signalResearchLog, thinking?.planningMessage,
        thinking?.rtPreparationStatus, thinking?.rtDataSearch, thinking?.rtRounds,
        thinking?.rtConsensus, thinking?.rtReportStatus]);

    // Auto-scroll to bottom as new lines arrive
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [logRef.current.length]);

    if (!thinking) {
        return <div className="flex-1 flex items-center justify-center text-[12px] text-gray-400 bg-[#0f1419]">No active session</div>;
    }

    const colorFor = (lv: TermLine['level']) =>
        lv === 'run' ? 'text-sky-400' :
        lv === 'ok'  ? 'text-emerald-400' :
        lv === 'err' ? 'text-red-400' :
        lv === 'hdr' ? 'text-amber-300' :
        'text-gray-400';

    const lines = logRef.current;

    return (
        <div className="flex-1 flex flex-col bg-[#0b0f14] overflow-hidden">
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-[1.6]">
                {lines.length === 0 ? (
                    <div className="text-gray-600 italic">Waiting for activity…</div>
                ) : (
                    lines.map((l, i) => (
                        <div key={i} className="flex gap-2 items-baseline whitespace-pre-wrap break-all">
                            <span className="shrink-0 text-gray-600 tabular-nums">{l.ts}</span>
                            <span className={`${colorFor(l.level)} ${l.level === 'hdr' ? 'font-semibold' : ''}`}>{l.text}</span>
                        </div>
                    ))
                )}
                {thinking.isActive && (
                    <div className="flex gap-2 items-center mt-1">
                        <span className="text-gray-600 tabular-nums">{fmtTs(Date.now()).slice(0, 8)}</span>
                        <span className="inline-block w-1.5 h-3 bg-emerald-400 animate-pulse" />
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── RoundtableWorkbench ─────────────────────────────────────────
// Unified workbench card (replaces RoundtableGraphInline):
//   left column  = rich agent roster (avatar + name + role + bio + tags)
//   right column = tabs (Graph | Debate) — no redundant top bar
const ROUNDTABLE_AGENT_PROFILES: Record<string, { bio: string; tags: string[]; skills: string[]; framework: string }> = {
    fundamental_specialist: { bio: 'Deep-dives into financial statements, earnings quality, and intrinsic value.', tags: ['Financials', 'Earnings', 'Valuation'], skills: ['DCF Modeling', 'Ratio Analysis', 'Earnings Quality'], framework: 'Bottom-up fundamental analysis with emphasis on margin of safety.' },
    valuation_specialist:    { bio: 'Builds multi-scenario valuation models to determine fair value ranges.', tags: ['DCF', 'Comparable', 'Models'], skills: ['DCF', 'Relative Valuation', 'Sum-of-Parts'], framework: 'Multi-model convergence with scenario-weighted fair value.' },
    macro_specialist:        { bio: 'Tracks macro trends, interest rates, and policy shifts that move markets.', tags: ['Macro', 'Rates', 'Policy'], skills: ['Macro Forecasting', 'Cross-Asset', 'Policy Analysis'], framework: 'Top-down macro overlay with cross-asset correlation analysis.' },
    risk_specialist:         { bio: 'Identifies tail risks, stress-tests portfolios, and models downside scenarios.', tags: ['Risk', 'Hedging', 'Stress Test'], skills: ['VaR', 'Stress Testing', 'Scenario Analysis'], framework: 'Risk-first approach with pre-mortem analysis and Monte Carlo simulations.' },
    allocation_specialist:   { bio: 'Optimizes asset allocation across ETFs, sectors, and geographies.', tags: ['ETF', 'Allocation', 'Diversification'], skills: ['MPT', 'Factor Exposure', 'Rebalancing'], framework: 'Modern portfolio theory with factor-based tilts.' },
    fund_specialist:         { bio: 'Evaluates fund performance, manager quality, and fee structures.', tags: ['Funds', 'Alpha', 'Selection'], skills: ['Fund Screening', 'Alpha Analysis', 'Fee Optimization'], framework: 'Quantitative fund selection with qualitative manager assessment.' },
    options_specialist:      { bio: 'Designs options strategies and analyzes Greeks for risk/reward optimization.', tags: ['Options', 'Greeks', 'Volatility'], skills: ['Options Pricing', 'Greeks Analysis', 'Vol Surface'], framework: 'Volatility-driven strategy selection with Greeks-based risk management.' },
    crypto_specialist:       { bio: 'Analyzes crypto assets, on-chain data, and DeFi protocol metrics.', tags: ['Crypto', 'On-Chain', 'DeFi'], skills: ['On-Chain Analysis', 'Token Economics', 'Protocol Metrics'], framework: 'On-chain data analysis combined with token economic modeling.' },
    macro_enhanced:          { bio: 'Advanced macro analysis with emphasis on regime changes and cross-asset flows.', tags: ['Deep Macro', 'Regimes', 'Flows'], skills: ['Regime Detection', 'Flow Analysis', 'Cycle Mapping'], framework: 'Multi-layer macro regime identification with flow-of-funds tracking.' },
    risk_enhanced:           { bio: 'Fractal risk modeling with advanced tail-risk and correlation-breakdown detection.', tags: ['Fractal', 'Tail Risk', 'Correlation'], skills: ['Fractal Analysis', 'Extreme Value Theory', 'Contagion Modeling'], framework: 'Non-linear risk modeling using fractal geometry and extreme value theory.' },
    event_driven:            { bio: 'Identifies catalysts, earnings surprises, and event-driven trading opportunities.', tags: ['Events', 'Catalysts', 'M&A'], skills: ['Event Detection', 'Catalyst Mapping', 'Timeline Analysis'], framework: 'Event timeline analysis with probability-weighted outcome modeling.' },
    sentiment_focus:         { bio: 'Gauges market sentiment from social media, news flow, and positioning data.', tags: ['Sentiment', 'Social', 'NLP'], skills: ['NLP Sentiment', 'Social Listening', 'Positioning Analysis'], framework: 'Multi-source sentiment aggregation with contrarian signal detection.' },
    portfolio_view:          { bio: 'Evaluates how positions fit within an overall portfolio context.', tags: ['Portfolio', 'Fit', 'Impact'], skills: ['Position Sizing', 'Correlation Analysis', 'Rebalancing'], framework: 'Portfolio-aware evaluation with correlation-adjusted sizing.' },
    buffett_style:           { bio: 'Value-investing lens — wide moats, durable economics, and margin of safety.', tags: ['Value', 'Moats', 'Long-term'], skills: ['Moat Analysis', 'Owner Earnings', 'Margin of Safety'], framework: 'Buy wonderful businesses at fair prices, hold forever.' },
    munger_style:            { bio: 'Mental-models multidisciplinary thinking with inversion and circle of competence.', tags: ['Mental Models', 'Inversion', 'Quality'], skills: ['Inversion', 'Lollapalooza Effects', 'Circle of Competence'], framework: 'Multidisciplinary mental models with inversion checks.' },
    dalio_style:             { bio: 'All-weather regime thinking — balance risk across macro environments.', tags: ['All-Weather', 'Regime', 'Macro'], skills: ['Risk Parity', 'Macro Cycles', 'Diversification'], framework: 'Balance risk across growth/inflation regimes — all-weather.' },
    soros_style:             { bio: 'Reflexivity-driven macro bets when market beliefs and fundamentals diverge.', tags: ['Reflexivity', 'Macro', 'Asymmetric'], skills: ['Reflexivity Detection', 'Macro Thesis', 'Asymmetric Bets'], framework: 'Find reflexive feedback loops — bet when conviction is high.' },
    lynch_style:             { bio: 'Invest in what you know — find fast growers at reasonable prices.', tags: ['GARP', 'Growth', 'Stock Picking'], skills: ['Fast Grower Detection', 'PEG Analysis', 'Stock Categories'], framework: 'Invest in what you understand — find fast growers at reasonable valuation.' },
    graham_style:            { bio: 'Classic deep-value screening — NCAV, net-net, Mr. Market psychology.', tags: ['Deep Value', 'NCAV', 'Mr. Market'] , skills: ['Net-Net Screening', 'Margin of Safety', 'Mr. Market Discipline'], framework: 'Defensive investing — wide margin of safety, Mr. Market as servant.' },
};

// ─── RoundtableAgentModal — click an agent card to expand full details ──
const RoundtableAgentModal: React.FC<{ agentId: string; onClose: () => void }> = ({ agentId, onClose }) => {
    const agent = SUMMON_POOL.find(a => a.id === agentId);
    const profile = ROUNDTABLE_AGENT_PROFILES[agentId];
    useEffect(() => {
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
    }, [onClose]);
    if (!agent) return null;
    const isMaster = agent.group === 'master';
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className={`bg-white rounded-2xl shadow-2xl w-[360px] max-h-[85vh] overflow-hidden mx-4 relative ${isMaster ? 'master-card-shine' : ''}`}
                style={isMaster ? { background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 45%, #fff7ed 100%)' } : undefined}
                onClick={e => e.stopPropagation()}
            >
                {/* Colored top bar tied to agent color */}
                <div className="h-1" style={{ background: `linear-gradient(90deg, ${agent.color}, ${agent.color}60)` }} />
                <div className="relative px-5 pt-5 pb-4 border-b border-gray-100">
                    <button onClick={onClose} className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="rounded-full p-[2px] shrink-0" style={{ background: `linear-gradient(135deg, ${agent.color}, ${agent.color}88)` }}>
                            <div className="rounded-full border-2 border-white overflow-hidden">
                                <AgentAvatarImg nameOrId={agent.id} size={52} />
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-[15px] font-bold text-gray-900 truncate">{agent.name}</h3>
                            <p className="text-[11px] text-gray-500 mt-0.5">{agent.role}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                        <span className={`text-[9px] px-2 py-[2px] rounded-full font-semibold tracking-wide uppercase ${
                            agent.group === 'system' ? 'bg-blue-50 text-blue-500 border border-blue-100' :
                            isMaster ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                            'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}>{agent.group === 'system' ? 'Core' : isMaster ? 'Master' : 'Specialist'}</span>
                        {profile?.tags.map((tag, i) => (
                            <span key={i} className="text-[9.5px] px-1.5 py-[2px] rounded-md bg-gray-100 text-gray-500 font-medium">{tag}</span>
                        ))}
                    </div>
                </div>
                {profile && (
                    <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[60vh]">
                        <div>
                            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.08em] mb-1.5">About</h4>
                            <p className="text-[12.5px] text-gray-700 leading-relaxed">{profile.bio}</p>
                        </div>
                        <div>
                            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.08em] mb-1.5">Skills</h4>
                            <div className="flex flex-wrap gap-1.5">
                                {profile.skills.map((s, i) => (
                                    <span key={i} className="px-2 py-[3px] bg-blue-50 border border-blue-100 rounded-md text-[10.5px] text-blue-600 font-medium">{s}</span>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.08em] mb-1.5">Thinking Framework</h4>
                            <p className="text-[12.5px] text-gray-700 leading-relaxed">{profile.framework}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

/**
 * Per-persona "thinking…" rotating activity messages so the panel feels
 * alive while we wait for backend agents to finish their LLM calls.
 * Each persona category gets a tailored activity vocabulary so the user
 * sees what kind of work each analyst is actually doing.
 */
const THINKING_ACTIVITIES: Record<string, string[]> = {
    fundamental_specialist: [
        'Parsing latest 10-K filing…', 'Cross-checking peer margins…', 'Inspecting FCF conversion…', 'Stress-testing the moat…', 'Screening earnings quality…',
    ],
    valuation_specialist: [
        'Building DCF model…', 'Calibrating WACC…', 'Reverse-engineering implied growth…', 'Comparing peer multiples…', 'Sizing margin of safety…',
    ],
    macro_specialist: [
        'Reading latest CPI print…', 'Watching the yield curve…', 'Gauging liquidity regime…', 'Mapping cycle position…', 'Decoding central-bank tone…',
    ],
    risk_specialist: [
        'Estimating tail-risk exposure…', 'Running stress scenarios…', 'Tracking correlation shifts…', 'Modeling max drawdown…', 'Pricing hedge cost…',
    ],
    sentiment_focus: [
        'Sampling social sentiment…', 'Scoring news polarity…', 'Counting insider transactions…', 'Spotting retail/institutional divergence…', 'Calibrating bull/bear ratio…',
    ],
    event_driven: [
        'Mapping the catalyst calendar…', 'Hunting M&A signals…', 'Assessing regulatory moves…', 'Reading option-implied moves…', 'Pricing event premium…',
    ],
    allocation_specialist: [
        'Computing marginal correlation…', 'Evaluating portfolio fit…', 'Auditing sector exposure…', 'Checking rebalance thresholds…', 'Sizing tracking error…',
    ],
    fund_specialist: [
        'Analyzing holdings concentration…', 'Comparing fee structures…', 'Detecting style drift…', 'Calibrating capture ratios…', 'Reviewing manager incentives…',
    ],
    options_specialist: [
        'Reading the vol surface…', 'Calibrating Greeks exposure…', 'Comparing IV vs RV…', 'Measuring put/call skew…', 'Modeling theta decay…',
    ],
    crypto_specialist: [
        'Counting active on-chain addresses…', 'Watching exchange netflow…', 'Tracking stablecoin supply…', 'Measuring TVL deltas…', 'Comparing funding rates…',
    ],
    buffett_style: [
        'Inspecting moat durability…', 'Grading capital allocation…', 'Calibrating intrinsic value…', 'Demanding margin of safety…', 'Testing circle of competence…',
    ],
    munger_style: [
        'Inverting the failure paths…', 'Auditing management incentives…', 'Applying mental models…', 'Probing accounting choices…', 'Stress-testing common sense…',
    ],
    burry_style: [
        'Hunting deep contrarian setups…', 'Reading the debt maturity wall…', 'Comparing EV vs liquidation…', 'Spotting insider anomalies…', 'Pinpointing concrete catalysts…',
    ],
    lynch_style: [
        'Computing PEG ratio…', 'Inspecting unit economics…', 'Watching insider buying…', 'Sharpening the two-minute thesis…', 'Sniffing for diworsification…',
    ],
    wood_style: [
        "Applying Wright's Law…", 'Projecting 5-yr TAM…', 'Sizing R&D intensity…', 'Mapping cost curves…', 'Pricing platform optionality…',
    ],
    soros_style: [
        'Identifying reflexive loops…', 'Spotting narrative dislocations…', 'Watching trend inflection points…', 'Probing policy credibility…', 'Reading positioning extremes…',
    ],
    dalio_style: [
        'Locating the debt-cycle phase…', 'Calibrating all-weather exposure…', 'Pricing currency-debasement risk…', 'Tracking cross-asset correlation…', 'Auditing risk-parity weights…',
    ],
};
const DEFAULT_THINKING_ACTIVITIES = [
    'Gathering relevant data…', 'Analyzing market structure…', 'Calibrating valuation inputs…', 'Comparing historical analogs…', 'Forming an independent view…',
];

const ThinkingAnalystsList: React.FC<{ allAgents: typeof SUMMON_POOL }> = ({ allAgents }) => {
    // Cycle index advances every 1.6s. All agents share the same tick to
    // keep animations in sync; per-agent variation comes from index offset.
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1600);
        return () => clearInterval(id);
    }, []);
    if (!allAgents.length) {
        return (
            <div className="h-full flex items-center justify-center py-6">
                <span className="text-[12px] text-gray-400 italic">Summoning analysts…</span>
            </div>
        );
    }
    return (
        <div className="space-y-2 py-1">
            {allAgents.map((a, i) => {
                const activities = THINKING_ACTIVITIES[a.id] || DEFAULT_THINKING_ACTIVITIES;
                // Stagger per-agent so they don't all switch text at the same instant.
                const idx = (tick + i * 2) % activities.length;
                const activity = activities[idx];
                return (
                    <div
                        key={a.id}
                        className="flex items-center gap-2 px-2 py-1.5"
                        style={{ animation: `summon-text 0.4s ease-out ${i * 80}ms both` }}
                    >
                        <div
                            className="shrink-0 rounded-full p-[2px]"
                            style={{ background: `linear-gradient(135deg, ${a.color}, ${a.color}88)` }}
                        >
                            <div className="rounded-full border-2 border-white overflow-hidden" style={{ width: 24, height: 24 }}>
                                <AgentAvatarImg nameOrId={a.id} size={24} />
                            </div>
                        </div>
                        <span className="text-[12px] font-medium text-gray-700 shrink-0">
                            {a.name}
                        </span>
                        <span className="inline-flex gap-0.5 ml-0.5 shrink-0">
                            {[0, 1, 2].map(d => (
                                <span key={d} className="w-1 h-1 rounded-full bg-gray-400"
                                    style={{ animation: `summon-dot 1.2s ease-in-out ${d * 0.18}s infinite` }} />
                            ))}
                        </span>
                        {/* Rolling activity text — each tick fades old line out and new line in */}
                        <span
                            key={`${a.id}-${idx}`}
                            className="text-[11px] text-gray-500 italic ml-1 truncate"
                            style={{ animation: 'summon-text 0.45s ease-out both' }}
                            title={activity}
                        >
                            {activity}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

const RoundtableWorkbench: React.FC<{
    thinking: ThinkingFlow;
    isLive: boolean;
}> = ({ thinking, isLive }) => {
    const agentIds = thinking.selectedAgentIds || [];
    const systemAgents = SUMMON_POOL.filter(a => a.group === 'system');
    const pickedExtras = SUMMON_POOL.filter(a => agentIds.includes(a.id) && a.group !== 'system');
    const allAgents = useMemo(() => {
        const out = [...systemAgents];
        const seen = new Set(systemAgents.map(a => a.id));
        for (const a of pickedExtras) {
            if (!seen.has(a.id)) { out.push(a); seen.add(a.id); }
        }
        return out;
    }, [agentIds]);

    const [activeAgentId, setActiveAgentId] = useState<string>(allAgents[0]?.id || '');
    const [tab, setTab] = useState<'graph' | 'debate' | 'log'>('graph');
    const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
    const [fullscreen, setFullscreen] = useState(false);
    const debateScrollRef = useRef<HTMLDivElement | null>(null);

    // Close fullscreen on ESC
    useEffect(() => {
        if (!fullscreen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [fullscreen]);

    // Keep active agent valid when roster changes
    useEffect(() => {
        if (!allAgents.find(a => a.id === activeAgentId) && allAgents[0]) {
            setActiveAgentId(allAgents[0].id);
        }
    }, [allAgents, activeAgentId]);

    const rounds = thinking.rtRounds || [];
    const totalOps = rounds.reduce((n, r) => n + r.agents.length, 0);

    // Scroll active agent's first utterance into view when on Debate tab
    useEffect(() => {
        if (tab !== 'debate' || !activeAgentId || !debateScrollRef.current) return;
        const el = debateScrollRef.current.querySelector<HTMLDivElement>(`[data-agent="${activeAgentId}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [activeAgentId, tab]);

    if (!allAgents.length) return null;

    const statusDot = (s?: 'pending' | 'active' | 'done') =>
        s === 'done' ? 'bg-emerald-500'
        : s === 'active' ? 'bg-blue-500 animate-pulse'
        : 'bg-gray-300';

    const verdictPillCls = (v?: string) => {
        if (!v) return 'bg-gray-100 text-gray-500';
        const up = v.toLowerCase();
        if (up.includes('bull') || up.includes('buy')) return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20';
        if (up.includes('bear') || up.includes('sell')) return 'bg-red-50 text-red-700 ring-1 ring-red-500/20';
        return 'bg-gray-100 text-gray-600 ring-1 ring-gray-200';
    };

    return (
        <div className="mb-8">
            <div
                className={fullscreen
                    ? "fixed inset-0 z-[70] bg-slate-50 overflow-hidden flex"
                    : "rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100/70 shadow-[0_2px_14px_-3px_rgba(71,85,105,0.16)] overflow-hidden flex"}
                style={fullscreen ? undefined : { height: 600 }}
            >
            {/* ── LEFT: Rich agent roster ── */}
            <div className="w-[260px] shrink-0 border-r border-slate-200/70 flex flex-col bg-slate-100/50 backdrop-blur-sm">
                <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-gray-700">Agent Room</span>
                    <span className="text-[10px] font-semibold text-gray-400 tabular-nums">({allAgents.length})</span>
                </div>
                <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1.5">
                    {allAgents.map(a => {
                        const state = rounds.length > 0
                            ? rounds[rounds.length - 1].agents.find(x => x.agentId === a.id)?.status
                            : (isLive ? 'active' : 'pending');
                        const profile = ROUNDTABLE_AGENT_PROFILES[a.id];
                        const isMaster = a.group === 'master';
                        return (
                            <div
                                key={a.id}
                                className={`group relative w-full rounded-xl cursor-pointer overflow-hidden transition-all ${
                                    isMaster ? 'master-card-shine' : ''
                                } hover:bg-white hover:shadow-sm hover:-translate-y-px`}
                                style={isMaster ? { background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 45%, #fff7ed 100%)' } : undefined}
                                onClick={() => setExpandedAgent(a.id)}
                            >
                                <div className="flex items-start gap-2.5 p-2.5 relative">
                                    {/* Colored ring around avatar */}
                                    <div className="relative shrink-0">
                                        <div
                                            className="rounded-full p-[2px]"
                                            style={{ background: `linear-gradient(135deg, ${a.color}, ${a.color}88)` }}
                                        >
                                            <div className="rounded-full border-2 border-white overflow-hidden">
                                                <AgentAvatarImg nameOrId={a.id} size={38} />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[12px] font-bold truncate text-gray-800">{a.name}</p>
                                        {profile?.bio && (
                                            <p className="text-[10.5px] text-gray-500 leading-snug mt-0.5 line-clamp-2">{profile.bio}</p>
                                        )}
                                        {profile?.tags && profile.tags.length > 0 && (
                                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                                {profile.tags.slice(0, 3).map(t => (
                                                    <span key={t} className="text-[9px] font-medium px-1.5 py-[1px] rounded-full bg-gray-100 text-gray-500">{t}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── RIGHT: tabs only (no redundant detail header) ── */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center border-b border-gray-100 px-3 shrink-0">
                    {(['graph', 'debate', 'log'] as const).map(t => {
                        const isActive = tab === t;
                        const label = t === 'graph' ? 'Graph' : t === 'debate' ? 'Debate' : 'Activity Log';
                        return (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`relative px-3 py-2.5 text-[12px] font-semibold transition-colors ${isActive ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <span className="flex items-center gap-1.5">
                                    {label}
                                    {t === 'debate' && totalOps > 0 && (
                                        <span className="text-[9.5px] font-semibold px-1.5 py-[1px] rounded-full bg-gray-100 text-gray-500">{totalOps}</span>
                                    )}
                                    {t === 'log' && isLive && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    )}
                                </span>
                                {isActive && <span className="absolute left-3 right-3 -bottom-px h-[2px] bg-gray-900 rounded-full" />}
                            </button>
                        );
                    })}
                    {isLive && (
                        <span className="ml-auto mr-2 inline-flex items-center gap-1 text-[10px] text-blue-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />live
                        </span>
                    )}
                    <button
                        onClick={() => setFullscreen(f => !f)}
                        className={`${isLive ? '' : 'ml-auto'} mr-1 w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors`}
                        title={fullscreen ? 'Exit fullscreen (ESC)' : 'Expand'}
                    >
                        {fullscreen ? (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
                            </svg>
                        ) : (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                            </svg>
                        )}
                    </button>
                </div>

                <div className="flex-1 min-h-0 relative">
                    {tab === 'graph' ? (
                        <div className="absolute inset-0">
                            <KnowledgeGraphView data={buildKnowledgeGraph()} animate={isLive} />
                        </div>
                    ) : tab === 'log' ? (
                        <div className="absolute inset-0 flex flex-col">
                            <TerminalLogPanel thinking={thinking} />
                        </div>
                    ) : (
                        <div ref={debateScrollRef} className="absolute inset-0 overflow-y-auto px-4 py-3">
                            {rounds.length === 0 ? (
                                isLive ? (
                                    <ThinkingAnalystsList allAgents={allAgents} />
                                ) : (
                                    <div className="h-full flex items-center justify-center">
                                        <p className="text-[12px] text-gray-400 italic">Debate hasn't started yet…</p>
                                    </div>
                                )
                            ) : (
                                <div className={fullscreen ? "space-y-8" : "space-y-5"}>
                                    {rounds.map(round => {
                                        const roundLabel = round.round === 1 ? 'Thesis Formation' : round.round === 2 ? 'Cross Validation' : `Round ${round.round}`;
                                        return (
                                        <div key={round.round}>
                                            <div className="flex items-center gap-2 mb-2.5 sticky top-0 py-1 z-10">
                                                <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-gray-500">
                                                    <span className="text-gray-400">Round {round.round} · </span>{roundLabel}
                                                </span>
                                                {round.status === 'active' && (
                                                    <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold px-1.5 py-[1px] rounded-full bg-blue-500/10 text-blue-600">
                                                        <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />live
                                                    </span>
                                                )}
                                                {round.status === 'done' && (
                                                    <span className="text-[9.5px] font-semibold px-1.5 py-[1px] rounded-full bg-emerald-500/10 text-emerald-700">done</span>
                                                )}
                                            </div>
                                            <div className={fullscreen ? "space-y-5" : "space-y-3"}>
                                                {round.agents.map(a => {
                                                    const pool = SUMMON_POOL.find(p => p.id === a.agentId);
                                                    const isActiveAgent = a.agentId === activeAgentId;
                                                    const accentColor = pool?.color || '#6B7280';
                                                    // Position: Bullish → left, Bearish → right. Others default to left.
                                                    const verdictLower = (a.verdict || '').toLowerCase();
                                                    const isBearish = verdictLower.includes('bear') || verdictLower.includes('sell');
                                                    const side: 'left' | 'right' = isBearish ? 'right' : 'left';
                                                    return (
                                                        <div
                                                            key={`${round.round}-${a.agentId}`}
                                                            data-agent={a.agentId}
                                                            className={`flex items-start gap-2.5 ${side === 'right' ? 'flex-row-reverse' : ''}`}
                                                        >
                                                            {/* Avatar with colored gradient ring — matches left roster */}
                                                            <button
                                                                onClick={() => setActiveAgentId(a.agentId)}
                                                                className="shrink-0 rounded-full p-[2px]"
                                                                style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}88)` }}
                                                                title={pool?.name || a.agentName}
                                                            >
                                                                <div className="rounded-full border-2 border-white overflow-hidden">
                                                                    <AgentAvatarImg nameOrId={a.agentId} size={30} />
                                                                </div>
                                                            </button>
                                                            <div className={`min-w-0 max-w-[78%] pt-0.5 flex flex-col ${side === 'right' ? 'items-end' : 'items-start'}`}>
                                                                {/* Name + meta row (outside bubble, social-chat style) */}
                                                                <div className={`flex items-center gap-1.5 mb-1 px-1 flex-wrap leading-none ${side === 'right' ? 'flex-row-reverse' : ''}`}>
                                                                    <span className="text-[11px] font-semibold text-gray-700">{pool?.name || a.agentName}</span>
                                                                    {a.verdict && (
                                                                        <span className={`text-[9.5px] font-bold px-1.5 py-[1px] rounded-full ${verdictPillCls(a.verdict)}`}>
                                                                            {a.verdict}
                                                                        </span>
                                                                    )}
                                                                    {a.changedMind && (
                                                                        <span className="text-[9.5px] font-semibold px-1.5 py-[1px] rounded-full bg-amber-500/10 text-amber-700">changed mind</span>
                                                                    )}
                                                                </div>
                                                                {/* Bubble — content only */}
                                                                {a.reasoning && (
                                                                    <div
                                                                        className={`inline-block max-w-full border border-gray-200/80 bg-white px-3 py-2 transition-shadow rounded-2xl ${side === 'right' ? 'rounded-tr-md' : 'rounded-tl-md'} ${isActiveAgent ? 'shadow-sm' : ''}`}
                                                                    >
                                                                        <p className="text-[11.5px] leading-relaxed text-gray-700 whitespace-pre-wrap">{a.reasoning}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {/* Placeholders for agents in this round who have not
                                                    responded YET. Without these, an active round looks
                                                    blank for 5-15s while LLM calls run. We render a
                                                    lightweight "thinking" row per pending persona so
                                                    the user sees who's still working. */}
                                                {round.status !== 'done' && (() => {
                                                    const respondedIds = new Set(round.agents.map(a => a.agentId));
                                                    const pending = allAgents.filter(a => !respondedIds.has(a.id));
                                                    if (pending.length === 0) return null;
                                                    return (
                                                        <div className="space-y-2 pt-1">
                                                            {pending.map((a, pi) => {
                                                                const activities = THINKING_ACTIVITIES[a.id] || DEFAULT_THINKING_ACTIVITIES;
                                                                // Use round number + agent index as a stable rotation seed
                                                                // so each row shows a different activity message.
                                                                const idx = (round.round * 7 + pi * 3) % activities.length;
                                                                return (
                                                                    <div
                                                                        key={`${round.round}-pending-${a.id}`}
                                                                        className="flex items-center gap-2 px-2 py-1 opacity-70"
                                                                        style={{ animation: `summon-text 0.4s ease-out ${pi * 60}ms both` }}
                                                                    >
                                                                        <div
                                                                            className="shrink-0 rounded-full p-[2px]"
                                                                            style={{ background: `linear-gradient(135deg, ${a.color}, ${a.color}88)` }}
                                                                        >
                                                                            <div className="rounded-full border-2 border-white overflow-hidden" style={{ width: 22, height: 22 }}>
                                                                                <AgentAvatarImg nameOrId={a.id} size={22} />
                                                                            </div>
                                                                        </div>
                                                                        <span className="text-[11.5px] font-medium text-gray-600 shrink-0">
                                                                            {a.name}
                                                                        </span>
                                                                        <span className="inline-flex gap-0.5 ml-0.5 shrink-0">
                                                                            {[0, 1, 2].map(d => (
                                                                                <span key={d} className="w-1 h-1 rounded-full bg-gray-400"
                                                                                    style={{ animation: `summon-dot 1.2s ease-in-out ${d * 0.18}s infinite` }} />
                                                                            ))}
                                                                        </span>
                                                                        <span className="text-[10.5px] text-gray-400 italic ml-1 truncate">
                                                                            {activities[idx]}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            </div>
            {/* Status caption below the workbench */}
            {(() => {
                const reportStatus = thinking.rtReportStatus;
                const consensusStatus = thinking.rtConsensus?.status;
                const roundsArr = thinking.rtRounds || [];
                const debating = roundsArr.some(r => r.status === 'active');
                const researching = (thinking.rtDataSearch || []).some(s => s.status === 'active');
                const agentCount = allAgents.length;
                const agentWord = agentCount === 1 ? 'Agent' : 'Agents';
                let label = '';
                let done = false;
                if (reportStatus === 'done') { label = `${agentCount} ${agentWord} finished the debate — report ready`; done = true; }
                else if (reportStatus === 'active') label = `Consensus reached — ${agentCount} ${agentWord} finalizing the report…`;
                else if (consensusStatus === 'active') label = `${agentCount} ${agentWord} reaching consensus…`;
                else if (debating) label = `${agentCount} ${agentWord} debating at the roundtable…`;
                else if (researching) label = 'Gathering background research…';
                else if (thinking.rtPreparationStatus === 'done' && isLive) label = `${agentCount} ${agentWord} assembled — debate starting`;
                if (!label) return null;
                return (
                    <div className="mt-5 flex items-center gap-2.5 px-1">
                        {/* Avatar stack */}
                        <div className="flex -space-x-1.5">
                            {allAgents.slice(0, 6).map(a => (
                                <div
                                    key={a.id}
                                    className="w-5 h-5 rounded-full border-[1.5px] border-white overflow-hidden shadow-sm"
                                    title={a.name}
                                    style={{ background: `linear-gradient(135deg, ${a.color}, ${a.color}88)` }}
                                >
                                    <AgentAvatarImg nameOrId={a.id} size={18} />
                                </div>
                            ))}
                            {allAgents.length > 6 && (
                                <div className="w-5 h-5 rounded-full border-[1.5px] border-white bg-gray-200 flex items-center justify-center text-[9px] font-semibold text-gray-600 shadow-sm">
                                    +{allAgents.length - 6}
                                </div>
                            )}
                        </div>
                        {!done && isLive && (
                            <span className="relative flex w-1.5 h-1.5 shrink-0">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-violet-500 opacity-60 animate-ping" />
                                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-violet-500" />
                            </span>
                        )}
                        <span className={`text-[11.5px] font-medium tracking-wide ${done ? 'text-gray-600' : 'text-gray-500'}`}>{label}</span>
                    </div>
                );
            })()}
            {expandedAgent && (
                <RoundtableAgentModal agentId={expandedAgent} onClose={() => setExpandedAgent(null)} />
            )}
        </div>
    );
};

// Legacy alias kept for any lingering references during the refactor.
const RoundtableGraphInline = RoundtableWorkbench;

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
    const AnalysisStageIcon: React.FC<{ id: string; className?: string }> = ({ id, className = 'w-3.5 h-3.5' }) => {
        switch (id) {
            case 'fundamental':
                return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>;
            case 'technical':
                return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>;
            case 'sentiment':
                return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>;
            default:
                return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>;
        }
    };

    const AnalysisModule: React.FC<{ mod: ThinkingModule }> = ({ mod }) => {
        const d = mod.data as AnalysisModuleData | undefined;
        if (!d) return null;

        return (
            <div>
                <div className="flex items-center gap-2.5 mb-3">
                    <StatusIcon status={mod.status} />
                    <span className="text-[14px] font-bold text-gray-900">Analyzing</span>
                </div>
                <div className="ml-7 space-y-2.5 mb-3">
                    {d.stages.map((stage) => {
                        const hasResults = stage.status === 'done' && stage.result && stage.result.length > 0;
                        const iconColor = stage.status === 'done' ? 'text-gray-500' : stage.status === 'active' ? 'text-blue-500' : 'text-gray-300';
                        return (
                            <div key={stage.id || stage.label} className={`rounded-xl border transition-all duration-300 overflow-hidden ${stage.status === 'done' ? 'border-gray-100 bg-gray-50/50' :
                                stage.status === 'active' ? 'border-blue-100 bg-blue-50/30' :
                                    'border-gray-100 bg-white'
                                }`}>
                                <div className="flex items-center gap-2 px-3 py-2">
                                    <span className={`shrink-0 ${iconColor}`}><AnalysisStageIcon id={stage.id || ''} /></span>
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
        // Merge sources from search module if available
        const searchMod = thinking.modules.find(m => m.type === 'search');
        const searchData = searchMod?.data as SearchModuleData | undefined;
        const searchSources = searchData?.sources || [];
        const sectionSources = searchData?.sections?.find(s => s.id === 'social')?.sources || [];

        const categories: RtDataCategory[] = thinking.rtDataSearch || [
            { id: 'indicators', label: 'Market Indicators', labelCN: '市场指标', icon: 'indicators', status: 'pending' },
            { id: 'news', label: 'News & Reports', labelCN: '新闻与报告', icon: 'news', status: 'pending' },
            { id: 'social', label: 'Social Media', labelCN: '社交媒体', icon: 'social', status: 'pending' },
        ];

        // Auto-inject search sources into news/social if they have no sources yet
        const enriched = categories.map(cat => {
            if (cat.sources && cat.sources.length > 0) return cat;
            if (cat.id === 'news') {
                const newsSrc = searchSources.filter(s =>
                    !['x.com', 'twitter.com', 'reddit.com', 'stocktwits.com'].includes(s.domain)
                );
                if (newsSrc.length > 0) return { ...cat, sources: newsSrc.map(s => ({ title: s.title, domain: s.domain, favicon: s.favicon, url: s.url })), count: cat.count ?? newsSrc.length };
            }
            if (cat.id === 'social') {
                const socialSrc = [...sectionSources, ...searchSources.filter(s =>
                    ['x.com', 'twitter.com', 'reddit.com', 'stocktwits.com'].includes(s.domain)
                )];
                if (socialSrc.length > 0) return { ...cat, sources: socialSrc.map(s => ({ title: s.title, domain: s.domain, favicon: s.favicon, url: s.url })), count: cat.count ?? socialSrc.length };
            }
            return cat;
        });

        const anyActive = enriched.some(c => c.status === 'active');
        const allDone = enriched.every(c => c.status === 'done');
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
                    <StepBadge step={3} done={allDone} />
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
                    <StepBadge step={4} done={allDone} />
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
                    <StepBadge step={5} done={consensus.status === 'done'} />
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
            <div className="space-y-5 ml-1">
                <RtPhasePreparation />
                <RtPhaseDataSearch />
                {hasR1 && <RtPhaseRound1 />}
                {hasR2 && <RtPhaseRound2 />}
                {hasCons && <RtPhaseConsensus />}
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
                {orderedModules.map((item) => (
                    <div key={item.key}>{item.element}</div>
                ))}
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

    const analyzeMatch = q.match(/(?:analyze|analysis|分析|研究|evaluate|评估)\s+(.{2,30}?)(?:\s+(?:stock|recent|latest|最近|performance|表现|情况).*)?$/i);
    if (analyzeMatch) return `${analyzeMatch[1].replace(/^(the|a|an|this)\s+/i, '').replace(/'s$/, '').trim()} Analysis`;

    const buyMatch = q.match(/(?:is|should|are|值得|适合|能不能|可以)\s+(.{2,20}?)\s+(?:still\s+)?(?:a\s+)?(?:buy|worth|invest|入手|买入|购买)/i);
    if (buyMatch) return `${buyMatch[1].replace(/^(i|we)\s+/i, '').trim()} Investment Outlook`;

    if (/risk|风险/.test(q)) {
        const subject = q.match(/(?:risk|风险)\s*(?:of|assessment|评估)?\s*(?:of|for)?\s*(.{2,20})/i);
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
    onBack: () => void;
    agentCount?: number;
    selectedAgentId?: string;
    initialSessionId?: string;
    /** From home screen mode selector (not used when opening history-only session). */
    initialChatMode?: 'auto' | 'fast' | 'roundtable';
}

/** Replace bare [Source Name] citations with [Source Name](url) using the sources list,
 *  AND linkify plain-text mentions of source domains / publication names. */
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

    // Remove bare source-name text leaked right after its own markdown link
    result = result.replace(/(\[([^\]]+)\]\([^)]+\))\s*\n?\s*\2\s*\n?/g, '$1 ');

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

    // Clean repeated blank lines left by cleanup.
    result = result.replace(/\n{3,}/g, '\n\n').trim();
    return result;
}

const SuperAgentChat: React.FC<SuperAgentChatProps> = ({ initialMessage, onBack, agentCount = 2, selectedAgentId, initialSessionId, initialChatMode }) => {
    const navigate = useNavigate();
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
            if (raw) {
                const p = JSON.parse(raw) as {
                    sessionId?: string;
                    userContent?: string;
                    streaming?: boolean;
                };
                // When viewing an existing session, the "effective" sid is initialSessionId.
                // Falling back to SA_SID_KEY is only correct when starting a brand-new chat.
                const effectiveSid = initialSessionId || sessionStorage.getItem(SA_SID_KEY);
                if (p?.streaming && p.userContent && p.sessionId === effectiveSid) {
                    return [
                        { role: 'user', content: p.userContent, timestamp: new Date().toLocaleTimeString() },
                        {
                            role: 'assistant',
                            content: '',
                            timestamp: new Date().toLocaleTimeString(),
                            isStreaming: true,
                        },
                    ];
                }
            }
            // Guest mode: restore chat history from localStorage so their
            // conversation survives reloads. Only when there's no in-flight
            // session and the caller didn't pass a fresh initialMessage.
            if (!initialMessage && !api.isAuthenticated) {
                const guestRaw = localStorage.getItem('loka_guest_chat_history');
                if (guestRaw) {
                    const parsed = JSON.parse(guestRaw) as { messages?: Message[]; savedAt?: number };
                    const savedAt = parsed?.savedAt || 0;
                    const SEVEN_DAYS_MS = 7 * 86400_000;
                    if (Array.isArray(parsed?.messages) && Date.now() - savedAt < SEVEN_DAYS_MS) {
                        return parsed.messages;
                    }
                }
            }
            return [];
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

    // Guest-only: persist chat history to localStorage so conversations
    // survive reloads. Authenticated users are already persisted in the DB.
    useEffect(() => {
        if (api.isAuthenticated) return;
        if (!messages.length) return;
        try {
            localStorage.setItem('loka_guest_chat_history', JSON.stringify({
                messages,
                savedAt: Date.now(),
            }));
        } catch {
            /* localStorage full or disabled — silently degrade */
        }
    }, [messages]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const lastUserMsgRef = useRef<HTMLDivElement>(null);
    const tocNavRef = useRef<HTMLDivElement>(null);
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
    const [panelTab, setPanelTab] = useState<'process' | 'terminal'>('process');
    // Terminal dock (inside Process panel) — collapsible bottom drawer
    const [terminalDockOpen, setTerminalDockOpen] = useState(true);
    const [rtPanelExpanded, setRtPanelExpanded] = useState(false);
    const [summonPhase, setSummonPhase] = useState<'idle' | 'loading' | 'narrating' | 'selecting'>('idle');
    const [selectedSummonIds, setSelectedSummonIds] = useState(() => new Set(DEFAULT_SUMMON_IDS));
    const [pendingRtText, setPendingRtText] = useState<string | null>(null);
    const summonBypassRef = useRef(false);
    const rtDemoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    useEffect(() => {
        return () => { rtDemoTimersRef.current.forEach(clearTimeout); rtDemoTimersRef.current = []; };
    }, []);
    const [chatMode, setChatMode] = useState<'auto' | 'fast' | 'roundtable'>(() => initialChatMode ?? 'auto');
    const [chatModeOpen, setChatModeOpen] = useState(false);
    const chatModeRef = useRef<HTMLDivElement>(null);
    const [htmlReports, setHtmlReports] = useState<Record<number, string>>({});
    const [htmlGenerating, setHtmlGenerating] = useState<Record<number, boolean>>({});
    const [msgViewMode, setMsgViewMode] = useState<Record<number, 'docs' | 'web'>>({});
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

    const handleCopy = (idx: number, content: string) => {
        navigator.clipboard.writeText(content).then(() => {
            setCopied(prev => ({ ...prev, [idx]: true }));
            setTimeout(() => setCopied(prev => ({ ...prev, [idx]: false })), 2000);
        });
    };

    const handleReaction = (idx: number, type: 'liked' | 'disliked') => {
        setReactions(prev => ({ ...prev, [idx]: prev[idx] === type ? null : type }));
    };

    /** Extract "Questions to watch" / follow-up questions from the end of a synthesis response */
    const extractFollowUpQuestions = useCallback((content: string): { body: string; questions: string[] } => {
        // Match a bold/heading title that clearly announces a follow-up / suggested-question
        // section, followed by a bullet list that is the LAST thing in the response.
        // The `\s*$` anchor prevents over-matching headings that merely mention "问题"
        // in the middle of the analysis (which used to swallow analytical bullets into
        // the "相关问题" UI).
        // Covers: **Questions to watch:**, ## Follow-up Questions, **值得关注的问题：**, etc.
        const pattern = /\n(?:---\s*\n+)?(?:\*\*|#{1,3}\s*)[^\n]*?(?:follow.?up|questions?\s+to\s+watch|值得[^\n]{0,6}(?:关注|思考)|需要[^\n]{0,6}关注|持续关注|持续跟踪|后续[^\n]{0,3}问题|延伸[^\n]{0,3}问题|关注[^\n]{0,3}问题|关键问题|follow-?up\s+questions?)[^\n]*?(?:\*\*)?\s*\n((?:\s*(?:[-•*]|\d+[.)]\s).+\n?)+)\s*$/i;
        const match = content.match(pattern);
        if (match) {
            const rawLines = match[1].split('\n')
                .map(l => l.trim())
                .filter(l => /^(?:[-•*]|\d+[.)]\s)/.test(l))
                .map(l => l.replace(/^(?:[-•*]|\d+[.)]\s)\s*/, '').replace(/\*\*/g, '').trim())
                .filter(Boolean);
            // Extra safety: a true follow-up section should contain questions — require
            // at least one item to look interrogative. This blocks analytical bullets
            // (declarative statements) from being hijacked.
            const looksLikeQuestion = (s: string) => /[?？]/.test(s) || /(吗|呢|是否|如何|怎样|为何|何时|是不是|要不要|还是)\s*[?？]?\s*$/.test(s) || /^(should|can|will|why|how|what|when|where|who|is|are|do|does)\b/i.test(s);
            const hasAnyQuestion = rawLines.some(looksLikeQuestion);
            if (rawLines.length > 0 && hasAnyQuestion) {
                return { body: content.slice(0, match.index).trimEnd(), questions: rawLines };
            }
        }
        return { body: content, questions: [] };
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
    // X profile cards keyed by message index
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
    // Demo mode: RoundtableView graph renders when current message has roundtable data.
    // We put a sentinel round so RoundtableView's `rounds.length > 0` check passes and the KG shows.
    // Mount as soon as roundtable preparation is staged (so stages 0-1 of the reveal animation can run).
    const hasRtThinking = currentThinking?.routedMode === 'roundtable'
        && (((currentThinking.rtRounds?.length ?? 0) > 0)
            || currentThinking.rtPreparationStatus === 'done'
            || (currentThinking.rtDataSearch?.length ?? 0) > 0);
    const currentRoundtableData: RoundtableData = hasRtThinking
        ? { rounds: [{ round: 1, agents: [], status: 'done' } as any], finalVerdict: { summary: '', confidence: 0 } }
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

    // Scroll-spy: track which heading is currently in view + TOC floating position.
    // Uses rAF throttling + ResizeObserver + delayed recalcs so the active item
    // stays in sync even as markdown, quote cards, and fonts load asynchronously.
    const [tocTopPx, setTocTopPx] = useState(0);
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

            // Float position – the TOC pins near the top of the viewport while
            // the answer is being read. Only when the bottom action bar approaches
            // the TOC do we let it scroll up with content.
            const TOC_PINNED_TOP = 24;   // desired top offset while reading
            const TOC_MIN_TOP = 8;       // absolute minimum (TOC can't go above this)
            const firstEl = ids[0] ? document.getElementById(ids[0]) : null;
            if (firstEl) {
                // Start from where the heading currently sits vertically, but
                // CAP it so that when the heading is still far below the
                // viewport top the TOC pins to TOC_PINNED_TOP (not pushed down
                // to wherever the heading happens to be).
                let floatTop = firstEl.offsetTop - container.scrollTop;
                floatTop = Math.min(floatTop, TOC_PINNED_TOP);

                // Bottom boundary: when the action bar approaches, pull TOC up with content
                const actionsEl = document.getElementById(`msg-actions-${bestIdx}`);
                const tocH = tocNavRef.current?.offsetHeight || 0;
                if (actionsEl && tocH > 0) {
                    const pinnedTop = actionsEl.offsetTop - container.scrollTop - tocH - 16;
                    floatTop = Math.min(floatTop, pinnedTop);
                }

                // Clamp floor — don't go above the viewport top
                floatTop = Math.max(TOC_MIN_TOP, floatTop);

                // Ensure TOC doesn't overlap the input bar (reserve 80px at bottom)
                const maxTop = container.clientHeight - 80;
                floatTop = Math.min(floatTop, maxTop);
                setTocTopPx(floatTop);
            }
        };

        container.addEventListener('scroll', scheduleRecalc, { passive: true });
        window.addEventListener('resize', scheduleRecalc);
        scheduleRecalc();

        // Observe late layout shifts from markdown, quote cards, fonts, and side panels.
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
            window.setTimeout(scheduleRecalc, delay),
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

        const onRouted = (data: { sessionId: string; mode: string; actualTier?: string; requested?: string; autoResolved?: string | null; degraded?: boolean }) => {
            saLog('← agent:chat:routed', { expect: sessionId, got: data?.sessionId, mode: data?.mode, actual: data?.actualTier, auto: data?.autoResolved, degraded: data?.degraded, match: data.sessionId === sessionId });
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

        const onQuotaDegraded = (data: { sessionId: string; reason: string; hint: string }) => {
            saLog('← agent:chat:quota_degraded', { sessionId: data?.sessionId, reason: data?.reason });
            if (data.sessionId !== sessionId) return;
            setMessages(prev => {
                const updated = [...prev];
                const msgIdx = activeMsgIdxRef.current;
                if (!updated[msgIdx]) return prev;
                updated[msgIdx] = { ...updated[msgIdx], liteMode: { hint: data.hint } };
                return updated;
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
                        // When we block a status downgrade, also protect the
                        // nested data.status field so renderers (e.g. ConsensusModule
                        // which reads data.status to drive its sub-step UI) don't
                        // see the module flip back to an earlier state.
                        const incomingData = isDowngradeToActive
                            ? Object.fromEntries(
                                Object.entries(data.data).filter(([k]) => k !== 'status'),
                            )
                            : data.data;
                        mods[modIdx].data = { ...(mods[modIdx].data || {}), ...incomingData };
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
                updated[msgIdx] = {
                    ...updated[msgIdx],
                    // Only use server content if we have nothing accumulated (e.g. reconnect)
                    content: updated[msgIdx].content || data.content || '',
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
                return { ...prev, [msgIdx]: { ...prev[msgIdx], isActive: false } };
            });
        };

        const onError = (data: { sessionId: string; error: string; mode?: string; resetAt?: string; hint?: string }) => {
            saLog('← agent:chat:error', { expect: sessionId, got: data?.sessionId, error: data?.error, match: data.sessionId === sessionId });
            if (data.sessionId !== sessionId) return;
            try {
                sessionStorage.removeItem(SA_PENDING_KEY);
            } catch {
                /* ignore */
            }
            // Quota exhaustion gets a friendlier, actionable message
            let displayMsg = data.error;
            if (data.error === 'quota_exhausted') {
                const modeLabel = data.mode === 'roundtable' ? 'Roundtable' : 'Fast';
                const resetTxt = data.resetAt ? ` Resets ${new Date(data.resetAt).toLocaleString()}.` : '';
                displayMsg = `Your ${modeLabel} quota is exhausted.${resetTxt} Switch to Auto mode (always free) or upgrade your plan.`;
                // Invalidate cached plan/quota so Settings + mode selector refresh
                try { window.dispatchEvent(new CustomEvent('plan-changed')); } catch { /* ignore */ }
            } else if (data.error === 'guest_quota_exhausted' || data.error === 'guest_ip_quota_exhausted') {
                const resetTxt = data.resetAt ? ` Resets ${new Date(data.resetAt).toLocaleString()}.` : '';
                displayMsg = `You've used all your free Auto turns for now.${resetTxt} Sign in to get more Auto turns plus Fast and Roundtable modes.`;
                try { window.dispatchEvent(new Event('show-auth-modal')); } catch { /* ignore */ }
            } else if (data.error === 'login_required') {
                displayMsg = 'Sign in to unlock Fast and Roundtable modes. Auto mode is always free.';
                try { window.dispatchEvent(new Event('show-auth-modal')); } catch { /* ignore */ }
            }
            setMessages(prev => {
                const updated = [...prev];
                const msgIdx = activeMsgIdxRef.current;
                if (!updated[msgIdx]) return prev;
                updated[msgIdx] = { ...updated[msgIdx], content: updated[msgIdx].content + '\n\n**Error:** ' + displayMsg, isStreaming: false };
                return updated;
            });
            setIsStreaming(false);
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
            if (data.sessionId !== sessionId) return;
            saLog('← agent:chat:consensus_done (live → overwrite demo)', {
                sessionId: data.sessionId,
                rounds: data?.result?.consensus?.roundsUsed,
                reached: data?.result?.consensus?.consensusReached,
            });
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            const result = data.result || {};
            const resp: Array<{ agentId: string; answer: string; confidence: number }> =
                result?.consensus?.agentResponses || [];
            const finalAnswer: string = result?.consensus?.finalAnswer || '';
            const finalConfidencePct = Math.round(
                ((result?.consensus?.confidence as number) || 0) * 100,
            );
            const reached = result?.consensus?.consensusReached !== false;

            // Derive each persona's conclusion verdict/confidence from its raw answer.
            const conclusions = resp.map((r) => ({
                agentName: getAnalystDisplayName(r.agentId),
                verdict: parsePersonaVerdict(r.answer),
                confidence: Math.round((r.confidence || 0) * 100),
            }));

            // Majority signal across personas → surface as finalVerdict.
            const tally: Record<string, number> = { Bullish: 0, Bearish: 0, Neutral: 0 };
            for (const c of conclusions) {
                tally[c.verdict] = (tally[c.verdict] || 0) + 1;
            }
            const finalVerdict =
                (Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] as string) || 'Neutral';

            // Rough conflict rate: 100% minus the majority share.
            const majorityCount = tally[finalVerdict] || 0;
            const conflictRate =
                conclusions.length > 0
                    ? Math.round(((conclusions.length - majorityCount) / conclusions.length) * 100)
                    : 0;

            setThinkingProcesses((prev) => {
                const existing = prev[msgIdx];
                if (!existing) return prev;
                const next: RtConsensusResult = {
                    status: 'done',
                    hasConsensus: reached,
                    conflictRate,
                    agentConclusions: conclusions,
                    finalVerdict,
                    finalConfidence: finalConfidencePct,
                };
                return {
                    ...prev,
                    [msgIdx]: {
                        ...existing,
                        rtConsensus: next,
                        rtReportStatus: 'active',
                    },
                };
            });
        };

        // ─── NEW Roundtable persona events (Stage 4 protocol, Stage 5 wire-up) ──
        // These handlers overlay real backend data onto thinkingProcesses.
        // The demo animation in handleSummonConfirm still runs in parallel
        // (for initial UI smoothness while we wait for the backend to return);
        // once real events arrive, they overwrite the demo state so the
        // AgentRoom / Debate Tab end up showing the actual personas' verdicts.
        const onAnalystsSelected = (data: {
            sessionId: string;
            analysts: Array<{
                id: string;
                displayName: { zh: string; en: string };
                role: { zh: string; en: string };
                initials: string;
                color: string;
                category: 'system' | 'enhanced' | 'master';
            }>;
        }) => {
            if (data.sessionId !== sessionId) return;
            saLog('← agent:chat:analysts_selected', {
                count: data.analysts.length,
                ids: data.analysts.map((a) => a.id).join(','),
            });
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            const ids = data.analysts.map((a) => a.id);
            setThinkingProcesses((prev) => {
                const existing = prev[msgIdx];
                if (!existing) return prev;
                return {
                    ...prev,
                    [msgIdx]: {
                        ...existing,
                        // Overwrite demo roster with the real backend-resolved one.
                        selectedAgentIds: ids,
                    },
                };
            });
        };
        const onAgentResponded = (data: {
            sessionId: string;
            analystId: string;
            round: number;
            confidence: number;
            summary: string;
            answer: string;
        }) => {
            if (data.sessionId !== sessionId) return;
            saLog('← agent:chat:agent_responded', {
                analystId: data.analystId,
                round: data.round,
                confidence: data.confidence,
                len: data.answer?.length ?? 0,
            });
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            const displayName = getAnalystDisplayName(data.analystId);
            const verdict = parsePersonaVerdict(data.answer);
            const reasoning = parsePersonaReasoning(data.answer);
            const confPct = Math.round((data.confidence || 0) * 100);
            setThinkingProcesses((prev) => {
                const existing = prev[msgIdx];
                if (!existing) return prev;
                const existingRounds = existing.rtRounds || [];
                let rounds = [...existingRounds];
                const roundIdx = rounds.findIndex((r) => r.round === data.round);
                const newAgent: RtAgentInference = {
                    agentId: data.analystId,
                    agentName: displayName,
                    status: 'done',
                    verdict,
                    confidence: confPct,
                    reasoning,
                };
                if (roundIdx === -1) {
                    rounds.push({ round: data.round, status: 'active', agents: [newAgent] });
                } else {
                    const agents = [...rounds[roundIdx].agents];
                    const agentPos = agents.findIndex((a) => a.agentId === data.analystId);
                    if (agentPos === -1) {
                        agents.push(newAgent);
                    } else {
                        agents[agentPos] = { ...agents[agentPos], ...newAgent };
                    }
                    rounds[roundIdx] = { ...rounds[roundIdx], agents };
                }
                return {
                    ...prev,
                    [msgIdx]: { ...existing, rtRounds: rounds },
                };
            });
        };
        const onRoundStarted = (data: { sessionId: string; round: number; maxRounds: number }) => {
            if (data.sessionId !== sessionId) return;
            saLog('← agent:chat:round_started', { round: data.round, maxRounds: data.maxRounds });
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            setThinkingProcesses((prev) => {
                const existing = prev[msgIdx];
                if (!existing) return prev;
                const rounds = [...(existing.rtRounds || [])];
                const idx = rounds.findIndex((r) => r.round === data.round);
                if (idx === -1) {
                    rounds.push({ round: data.round, status: 'active', agents: [] });
                } else if (rounds[idx].status !== 'done') {
                    rounds[idx] = { ...rounds[idx], status: 'active' };
                }
                return { ...prev, [msgIdx]: { ...existing, rtRounds: rounds } };
            });
        };
        const onRoundCompleted = (data: { sessionId: string; round: number; maxRounds: number }) => {
            if (data.sessionId !== sessionId) return;
            saLog('← agent:chat:round_completed', { round: data.round, maxRounds: data.maxRounds });
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            setThinkingProcesses((prev) => {
                const existing = prev[msgIdx];
                if (!existing) return prev;
                const rounds = [...(existing.rtRounds || [])];
                const idx = rounds.findIndex((r) => r.round === data.round);
                if (idx === -1) return prev;
                rounds[idx] = { ...rounds[idx], status: 'done' };
                return { ...prev, [msgIdx]: { ...existing, rtRounds: rounds } };
            });
        };

        const onQuote = (data: { sessionId: string; quote: any }) => {
            if (data.sessionId !== sessionId) return;
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            setQuoteCards(prev => ({ ...prev, [msgIdx]: data.quote }));
        };

        const onHtmlReady = (data: { sessionId: string; msgIdx: number; html: string }) => {
            if (data.sessionId !== sessionId) return;
            setHtmlGenerating(prev => { const n = { ...prev }; delete n[data.msgIdx]; return n; });
            setHtmlReports(prev => ({ ...prev, [data.msgIdx]: data.html }));
            setMsgViewMode(prev => ({ ...prev, [data.msgIdx]: 'web' }));
        };

        const onHtmlGenerating = (data: { sessionId: string; msgIdx: number }) => {
            if (data.sessionId !== sessionId) return;
            setHtmlGenerating(prev => ({ ...prev, [data.msgIdx]: true }));
        };

        socket.on('agent:chat:routing', onRouting);
        socket.on('agent:chat:routed', onRouted);
        socket.on('agent:chat:quota_degraded', onQuotaDegraded);
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
        socket.on('agent:chat:html_ready', onHtmlReady);
        socket.on('agent:chat:html_generating', onHtmlGenerating);
        // New Roundtable persona events (log-only in Stage 4)
        socket.on('agent:chat:analysts_selected', onAnalystsSelected);
        socket.on('agent:chat:agent_responded', onAgentResponded);
        socket.on('agent:chat:round_started', onRoundStarted);
        socket.on('agent:chat:round_completed', onRoundCompleted);

        return () => {
            socket.off('agent:chat:routing', onRouting);
            socket.off('agent:chat:routed', onRouted);
            socket.off('agent:chat:quota_degraded', onQuotaDegraded);
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
            socket.off('agent:chat:html_ready', onHtmlReady);
            socket.off('agent:chat:html_generating', onHtmlGenerating);
            socket.off('agent:chat:analysts_selected', onAnalystsSelected);
            socket.off('agent:chat:agent_responded', onAgentResponded);
            socket.off('agent:chat:round_started', onRoundStarted);
            socket.off('agent:chat:round_completed', onRoundCompleted);
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
                        // Reduce the raw module event stream into final per-type module
                        // state so the Thinking Process panel can render after A→B→A.
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
                    let pending: { streaming?: boolean; sessionId?: string; userContent?: string; assistantMsgIdx?: number } | null = null;
                    try {
                        const raw = sessionStorage.getItem(SA_PENDING_KEY);
                        pending = raw ? (JSON.parse(raw) as typeof pending) : null;
                    } catch {
                        pending = null;
                    }
                    const canResend =
                        pending?.streaming &&
                        pending.sessionId === sessionId &&
                        typeof pending.userContent === 'string' &&
                        pending.userContent.length > 0 &&
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
                            content: pending!.userContent!,
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

    const sendToAI = useCallback((text: string, existingMessages?: Message[], analystIds?: string[]) => {
        // Bump generation so stale events from a previous run are dropped
        chatGenRef.current += 1;
        activeChatGenRef.current = chatGenRef.current;

        saLog('sendToAI()', {
            textPreview: text.slice(0, 100),
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
                    assistantMsgIdx: msgIdx,
                    streaming: true,
                }),
            );
        } catch {
            /* ignore */
        }

        socket.emit('agent:chat', {
            content: text,
            mode: chatMode,
            sessionId,
            // Only send agentId on the first message (the one that started this session).
            // Subsequent messages let the router decide based on content — prevents
            // sticky guru-council mode when user switches topics.
            agentId: currentMessages.length === 0 ? chatSelectedAgent : undefined,
            // Roundtable persona selection — sent only when user picks analysts.
            // Must include the 4 system IDs + ≥1 user-picked (validated server-side).
            ...(analystIds && analystIds.length > 0 ? { analystIds } : {}),
        });
        saLog('sendToAI emit agent:chat done (see [LokaSocket] for queued vs live)');

    }, [chatMode, sessionId, chatSelectedAgent]);

    // ─── Fetch History ──────────────────────────
    useEffect(() => {
        if (initialSessionId) {
            api.getChatHistory(undefined, undefined, initialSessionId).then(history => {
                if (history && history.length > 0) {
                    const transformedHistory: Message[] = history.map(
                        (m: { role: string; content?: string; createdAt: string; metadata?: string | null }) => {
                            let sources: SearchSource[] | undefined;
                            if (m.metadata) {
                                try { sources = (JSON.parse(m.metadata) as any).sources; } catch {}
                            }
                            return {
                                role: m.role as 'user' | 'assistant',
                                content: m.content || '',
                                timestamp: new Date(m.createdAt).toLocaleTimeString(),
                                isStreaming: false,
                                metadata: m.metadata ?? null,
                                sources,
                            };
                        },
                    );
                    // If the last persisted message is a user msg or an empty assistant msg,
                    // the stream is likely still in-flight — append a placeholder so socket
                    // replay / live events have a target to fill, rather than returning early
                    // and leaving the chat blank.
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
                    const restoredHtml: Record<number, string> = {};
                    const restoredViewModes: Record<number, 'docs' | 'web'> = {};
                    let hasRoundtableHistory = false;
                    history.forEach(
                        (m: { role: string; metadata?: string | null }, idx: number) => {
                            if (m.role !== 'assistant' || !m.metadata) return;
                            try {
                                const meta = JSON.parse(m.metadata) as { thinkingFlow?: ThinkingFlow; consensusResult?: any; quoteCard?: any; htmlReport?: string; sources?: SearchSource[] };
                                if (meta.thinkingFlow && Array.isArray(meta.thinkingFlow.modules)) {
                                    const isRt = meta.thinkingFlow.routedMode === 'roundtable' || !!meta.consensusResult;
                                    if (isRt) {
                                        // Demo mode: always override with canonical 7-agent demo data
                                        restoredThinking[idx] = {
                                            ...meta.thinkingFlow,
                                            isActive: false,
                                            routedMode: 'roundtable',
                                            ...buildDemoRtFields(),
                                        };
                                        hasRoundtableHistory = true;
                                    } else {
                                        restoredThinking[idx] = {
                                            ...meta.thinkingFlow,
                                            isActive: false,
                                        };
                                    }
                                }
                                if (meta.consensusResult) {
                                    restoredConsensus[idx] = meta.consensusResult;
                                }
                                if (meta.quoteCard) {
                                    restoredQuotes[idx] = meta.quoteCard;
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
                    const placeholderIdx = transformedHistory.length;
                    // Recover start time from the last user message's createdAt so the
                    // elapsed counter ("12s") keeps showing across A→B→A switches. The
                    // socket-side `startTime` local isn't persisted to DB, so this is the
                    // best available proxy (off by at most the routing latency).
                    const lastUserCreatedAt = (() => {
                        for (let k = history.length - 1; k >= 0; k--) {
                            if (history[k]?.role === 'user' && history[k]?.createdAt) {
                                const t = Date.parse(history[k].createdAt);
                                if (!Number.isNaN(t)) return t;
                            }
                        }
                        return undefined;
                    })();
                    setThinkingProcesses(prev => {
                        const merged: Record<number, ThinkingFlow> = { ...prev, ...restoredThinking };
                        if (streamStillActive) {
                            const existing = merged[placeholderIdx];
                            merged[placeholderIdx] = {
                                modules: existing?.modules ?? [],
                                route: existing?.route || 'Investment Analyst',
                                ...existing,
                                isActive: true,
                                startTime: existing?.startTime ?? lastUserCreatedAt ?? Date.now(),
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
                    if (Object.keys(restoredHtml).length > 0) {
                        setHtmlReports(prev => ({ ...prev, ...restoredHtml }));
                        setMsgViewMode(prev => ({ ...prev, ...restoredViewModes }));
                    }
                    // If we appended a streaming placeholder, point activeMsgIdxRef at it
                    // so incoming socket chunks write into the placeholder, not the last user msg.
                    activeMsgIdxRef.current = streamStillActive ? transformedHistory.length : transformedHistory.length - 1;
                }
            }).catch(console.error);
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
            // If the history restore appended a streaming placeholder (A→B→A case
            // where the previous session's stream is still mid-flight), point
            // activeMsgIdxRef at it so modules / tool_trace events that arrive
            // before history fetch resolves land on the correct slot. Without this,
            // events write to index -1 and are lost, leaving the Thinking panel empty.
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
        if (!initialMessage.trim()) return;
        hasSentInitial.current = true;

        // Broadcast new session for sidebar
        window.dispatchEvent(new CustomEvent('session-started', {
            detail: { id: sessionId, title: summarizeTitle(initialMessage), agentId: chatSelectedAgent || 'auto' }
        }));

        const userMsg: Message = { role: 'user', content: initialMessage, timestamp: new Date().toLocaleTimeString() };
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
        setTimeout(() => { sendToAI(initialMessage, initialMessages); setTimeout(scrollUserMsgToTop, 150); }, 50);
    }, [initialMessage, sendToAI, initialSessionId, sessionId, chatSelectedAgent, scrollUserMsgToTop, chatMode]);

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
        setPanelTab('process');
        // Store roundtable context in thinking process (with demo data for UI preview)
        const agentIds = [...selectedSummonIds];
        const nextMsgIdx = messages.length; // assistant message will be at this index
        const selectedAgents = SUMMON_POOL.filter(a => agentIds.includes(a.id));
        const systemAgents = SUMMON_POOL.filter(a => a.group === 'system');
        const allAgents = [...systemAgents, ...selectedAgents];
        // Demo: if no user-selected agents, inject some defaults for preview
        const demoExtraIds = allAgents.length <= 4 ? ['buffett_style', 'dalio_style', 'sentiment_focus'] : [];
        const demoExtras = SUMMON_POOL.filter(a => demoExtraIds.includes(a.id));
        const demoAllAgents = [...allAgents, ...demoExtras];
        const demoAgentIds = demoAllAgents.map(a => a.id);
        // Use up to 4 for round 1, all for round 2
        const r1Agents = demoAllAgents.slice(0, 2);
        const r2Agents = demoAllAgents.slice(0, Math.min(7, demoAllAgents.length));
        const verdicts = ['Bullish', 'Neutral', 'Bearish', 'Bullish', 'Bearish', 'Neutral', 'Bullish'];
        const confs = [78, 62, 45, 71, 82, 58, 75];
        const reasonings = [
            'Revenue grew 18% YoY to $4.2B, beating consensus by $120M. Operating margins expanded 240bps to 28.3% driven by cost optimization and scale efficiencies. Free cash flow conversion improved to 92%. Forward P/E of 22x sits below 5-year average of 26x, suggesting room for multiple expansion. RSI at 58 indicates neutral momentum with no overbought signals. Key risk: rising interest rates could compress multiples in the near term.',
            'Current valuation appears fair at 1.8x PEG ratio. Technical indicators are mixed — MACD shows a pending bullish crossover but volume has been declining for 3 consecutive weeks. The 50-day moving average ($148) is approaching the 200-day ($152), and a golden cross could trigger momentum buying. However, broad macro headwinds including hawkish Fed commentary and rising 10Y yields create uncertainty. Recommend maintaining position but not adding until clearer directional signals emerge.',
            'Sector-wide de-rating in progress as competition intensifies. Company lost 2.1% market share in the latest quarter per IDC data. Gross margins contracted 180bps sequentially. Social sentiment turned notably negative after the product recall announcement, with Twitter mention sentiment dropping from +0.42 to -0.18 in two weeks. Balance sheet remains strong with $8.2B cash and minimal debt, which provides a floor, but near-term catalysts are lacking.',
            'Tail risk assessment: correlation breakdown probability sits at 12% based on our fractal model. The current volatility regime is transitioning from low to moderate — VIX term structure shifted to contango. Max drawdown scenario under a 2-sigma stress event would be -18%. However, the company maintains a strong Altman Z-score of 4.2, suggesting minimal bankruptcy risk. Hedging cost via put spreads is relatively cheap at 45bps.',
            'This is a wonderful business at a fair price. 85% customer retention rate, $3.2B in recurring revenue, and a brand moat evidenced by 40% pricing premium vs. closest competitor. Management has demonstrated disciplined capital allocation with $2.1B returned via buybacks. The stock trades at a 21% discount to peer median. As I always say: it is far better to buy a wonderful company at a fair price than a fair company at a wonderful price.',
            'The debt cycle analysis shows we are in the late expansion phase. Central bank tightening is creating headwinds across risk assets. However, this particular company has low leverage (0.8x net debt/EBITDA) and strong cash generation, making it relatively defensive. In an all-weather framework, this position contributes positive risk-adjusted returns across 3 of 4 economic environments. Maintain position but size conservatively given macro uncertainty.',
            'Social sentiment analysis reveals a notable divergence: retail sentiment is turning bullish (+340% mention volume) while institutional positioning shows cautious accumulation. NLP analysis of recent earnings call transcripts indicates management confidence has increased — forward-looking language ratio improved from 0.42 to 0.61. The contrarian signal here is moderately bullish: when retail and institutions align gradually, the trend tends to persist.',
        ];
        setThinkingProcesses(prev => {
            const flow = prev[nextMsgIdx] || { modules: [], isActive: true, route: 'Roundtable' };
            return {
                ...prev,
                [nextMsgIdx]: {
                    ...flow,
                    selectedAgentIds: demoAgentIds,
                    startTime: Date.now(),
                    routedMode: 'roundtable',
                    rtPreparationStatus: 'done',
                    // Phase 1: Data Collection — start all pending, stream below
                    rtDataSearch: [
                        { id: 'indicators', label: 'Market Indicators', labelCN: '市场指标', icon: 'indicators', status: 'pending', count: 12, items: ['P/E', 'EPS', 'RSI', 'MACD', 'Volume', 'Revenue', 'Net Income', 'FCF'] },
                        { id: 'news', label: 'News & Reports', labelCN: '新闻与报告', icon: 'news', status: 'pending', count: 15, sources: [
                            { title: 'Q4 Earnings Beat Expectations — Revenue surges 18% YoY', domain: 'reuters.com', favicon: 'reuters', url: 'https://reuters.com' },
                            { title: 'Analyst Upgrades Rating to Overweight on Margin Expansion', domain: 'bloomberg.com', favicon: 'bloomberg', url: 'https://bloomberg.com' },
                            { title: 'Sector Outlook: Mixed Signals Amid Rising Rates', domain: 'wsj.com', favicon: 'wsj', url: 'https://wsj.com' },
                            { title: 'New Product Line Could Drive $2B in Incremental Revenue', domain: 'cnbc.com', favicon: 'cnbc', url: 'https://cnbc.com' },
                        ]},
                        { id: 'social', label: 'Social Media', labelCN: '社交媒体', icon: 'social', status: 'pending', count: 23, sources: [
                            { title: 'Bullish sentiment trending — $TICKER mentions up 340% this week', domain: 'x.com', favicon: 'x', url: 'https://x.com' },
                            { title: 'Community DD: Deep value analysis with DCF model breakdown', domain: 'reddit.com', favicon: 'reddit', url: 'https://reddit.com' },
                            { title: 'Institutional flow data shows heavy accumulation at support', domain: 'stocktwits.com', favicon: 'stocktwits', url: 'https://stocktwits.com' },
                        ]},
                    ],
                    // Rounds & consensus will be populated by the timeline below
                    rtRounds: [],
                    rtConsensus: {
                        status: 'pending',
                        hasConsensus: false,
                        agentConclusions: [],
                    },
                    rtReportStatus: 'pending',
                },
            };
        });

        // ── Demo animation gate ──
        // When true, the legacy mock-data + timed reveal still runs
        // (useful for offline UI previewing). When false (default in
        // production), the panel scaffolds empty and waits for real
        // backend events to fill it in. We turned this OFF after Stage 5
        // wired the AgentRoom / Debate Tab to live socket events —
        // otherwise users see ~30s of fake "Revenue grew 18%" mock
        // before real consensus output arrives.
        const USE_DEMO_ANIMATION = false;

        // ── Build final-state data (used to hydrate each stage) ──
        const finalR1Agents: RtAgentInference[] = r1Agents.map((a, i) => ({
            agentId: a.id,
            agentName: a.name,
            status: 'done' as const,
            verdict: verdicts[i],
            confidence: confs[i],
            reasoning: reasonings[i],
        }));
        const finalR2Agents: RtAgentInference[] = r2Agents.map((a, i) => ({
            agentId: a.id,
            agentName: a.name,
            status: 'done' as const,
            verdict: i === 2 ? 'Neutral' : verdicts[i],
            confidence: confs[i] + (i === 2 ? 10 : 0),
            reasoning: reasonings[i],
            changedMind: i === 2,
            previousVerdict: i === 2 ? 'Bearish' : undefined,
            crossReferences: [r2Agents[(i + 1) % r2Agents.length]?.name, r2Agents[(i + 2) % r2Agents.length]?.name].filter(Boolean) as string[],
        }));
        const finalConsensus: RtConsensusResult = {
            status: 'done',
            hasConsensus: true,
            conflictRate: 20,
            agentConclusions: r2Agents.map((a, i) => ({
                agentName: a.name,
                verdict: i === 2 ? 'Neutral' : verdicts[i],
                confidence: confs[i] + (i === 2 ? 10 : 0),
            })),
            finalVerdict: 'Bullish',
            finalConfidence: 74,
        };

        // ── Staged reveal (mirrors the graph's 5 phases) ──
        const patch = (fn: (f: ThinkingFlow) => ThinkingFlow) => {
            setThinkingProcesses(prev => {
                const cur = prev[nextMsgIdx] || { modules: [], isActive: true, route: 'Roundtable', routedMode: 'roundtable' };
                return { ...prev, [nextMsgIdx]: fn(cur) };
            });
        };
        const setDataStatus = (idx: number, status: 'pending' | 'active' | 'done') => patch(c => ({
            ...c,
            rtDataSearch: (c.rtDataSearch || []).map((d, i) => i === idx ? { ...d, status } : d),
        }));

        // Tuning: each phase gets enough dwell time to feel intentional (total ~10s)
        const T_DATA_STEP = 900;          // per feed
        const T_ROUND1_START = T_DATA_STEP * 3 + 300;   // 3000ms
        const T_R1_AGENT_STEP = 600;
        const T_ROUND2_START = T_ROUND1_START + T_R1_AGENT_STEP * 2 + 200; // ~4400ms
        const T_R2_AGENT_STEP = 500;
        const steps: { t: number; run: () => void }[] = [
            // Data collection streams
            { t: 0,                     run: () => setDataStatus(0, 'active') },
            { t: T_DATA_STEP,           run: () => { setDataStatus(0, 'done'); setDataStatus(1, 'active'); } },
            { t: T_DATA_STEP * 2,       run: () => { setDataStatus(1, 'done'); setDataStatus(2, 'active'); } },
            { t: T_DATA_STEP * 3,       run: () => { setDataStatus(2, 'done'); } },
            // Round 1 spawn
            { t: T_ROUND1_START, run: () => patch(c => ({
                ...c,
                rtRounds: [{
                    round: 1,
                    status: 'active',
                    agents: finalR1Agents.map((a, i) => ({ ...a, status: i === 0 ? 'active' : 'pending' })),
                }],
            })) },
            { t: T_ROUND1_START + T_R1_AGENT_STEP, run: () => patch(c => ({
                ...c,
                rtRounds: c.rtRounds && c.rtRounds[0] ? [{
                    ...c.rtRounds[0],
                    agents: c.rtRounds[0].agents.map((a, i) => i === 0 ? { ...a, status: 'done' } : i === 1 ? { ...a, status: 'active' } : a),
                }] : c.rtRounds,
            })) },
            // Round 2 spawn (closes Round 1, opens Round 2 agent 0)
            { t: T_ROUND2_START, run: () => patch(c => ({
                ...c,
                rtRounds: [
                    c.rtRounds && c.rtRounds[0]
                        ? { ...c.rtRounds[0], status: 'done', agents: c.rtRounds[0].agents.map(a => ({ ...a, status: 'done' })) }
                        : { round: 1, status: 'done', agents: finalR1Agents },
                    { round: 2, status: 'active', agents: finalR2Agents.map((a, i) => ({ ...a, status: i === 0 ? 'active' : 'pending' })) },
                ],
            })) },
        ];
        // Round 2 agents stream
        for (let i = 1; i < finalR2Agents.length; i++) {
            const k = i;
            steps.push({ t: T_ROUND2_START + T_R2_AGENT_STEP * k, run: () => patch(c => ({
                ...c,
                rtRounds: c.rtRounds && c.rtRounds[1] ? [c.rtRounds[0], {
                    ...c.rtRounds[1],
                    agents: c.rtRounds[1].agents.map((a, j) => j < k ? { ...a, status: 'done' } : j === k ? { ...a, status: 'active' } : a),
                }] : c.rtRounds,
            })) });
        }
        const r2EndT = T_ROUND2_START + T_R2_AGENT_STEP * finalR2Agents.length;
        steps.push({ t: r2EndT, run: () => patch(c => ({
            ...c,
            rtRounds: c.rtRounds && c.rtRounds[1]
                ? [c.rtRounds[0], { ...c.rtRounds[1], status: 'done', agents: c.rtRounds[1].agents.map(a => ({ ...a, status: 'done' })) }]
                : c.rtRounds,
            rtConsensus: { ...(c.rtConsensus || finalConsensus), status: 'active' },
        })) });
        steps.push({ t: r2EndT + 700, run: () => patch(c => ({
            ...c,
            rtConsensus: finalConsensus,
            rtReportStatus: 'active',
        })) });
        steps.push({ t: r2EndT + 1600, run: () => patch(c => ({ ...c, rtReportStatus: 'done' })) });

        // Clear any previous timers (e.g. rapid re-confirm) before scheduling
        rtDemoTimersRef.current.forEach(clearTimeout);
        rtDemoTimersRef.current = USE_DEMO_ANIMATION
            ? steps.map(s => setTimeout(s.run, s.t))
            : [];
        // Send REAL selection to backend — 4 system (always on) + user-picked
        // enhanced/master personas. Demo injection above is UI preview only.
        const systemIds = SUMMON_POOL.filter(a => a.group === 'system').map(a => a.id);
        const userPickedIds = [...selectedSummonIds].filter(id => !systemIds.includes(id));
        const realAnalystIds = [...systemIds, ...userPickedIds];

        // When demo is off, also overwrite the demo state init's
        // `selectedAgentIds: demoAgentIds` (which can include 3 unrelated
        // master personas as "preview" picks) with the actual roster the
        // user chose. The onAnalystsSelected socket event will refresh this
        // again with backend-resolved metadata, but doing it eagerly avoids
        // a momentary flash of the wrong avatars in the AgentRoom.
        if (!USE_DEMO_ANIMATION) {
            setThinkingProcesses(prev => {
                const existing = prev[nextMsgIdx];
                if (!existing) return prev;
                return {
                    ...prev,
                    [nextMsgIdx]: {
                        ...existing,
                        selectedAgentIds: realAnalystIds,
                    },
                };
            });
        }

        sendToAI(text, messages, realAnalystIds);
        setTimeout(scrollUserMsgToTop, 150);
    }, [pendingRtText, messages, sendToAI, scrollUserMsgToTop, selectedSummonIds]);

    const handleSend = () => {
        if (!inputText.trim() || isStreaming) return;
        const text = inputText.trim();
        saLog('handleSend', { textPreview: text.slice(0, 80), isStreaming, ...socket.getDebugState() });

        // Roundtable mode: intercept to show summon character selection inline
        if (chatMode === 'roundtable' && !summonBypassRef.current) {
            const userMsg: Message = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString() };
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
        const userMsg: Message = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString() };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInputText('');
        sendToAI(text, newMessages);
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
        <div className="flex h-full bg-white overflow-hidden">
            <style>{`
                @keyframes voice-bar { 0%,100%{height:3px} 50%{height:10px} }
                .voice-bar { min-height: 3px; display:inline-block; border-radius:9999px; background:#9ca3af; }
                @keyframes summon-float { 0% { opacity: 0; transform: translateY(30px) scale(0.6); } 50% { opacity: 0.7; transform: translateY(-6px) scale(1.04); } 70% { transform: translateY(3px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
                @keyframes summon-hover { 0%,100% { transform: translate(-50%,-50%) translateY(0); } 50% { transform: translate(-50%,-50%) translateY(-6px); } }
                @keyframes summon-text { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes summon-dot { 0%,80%,100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }
                @keyframes summon-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } 50% { box-shadow: 0 0 12px 2px rgba(34,197,94,0.25); } }
            `}</style>

            {/* ══ Content Row — two independent full-height columns ══ */}
            <div className="flex flex-1 overflow-hidden">
                {/* Chat column */}
                <div className="relative flex flex-col flex-1 min-w-0 overflow-hidden">
                    {/* Chat column header (above chat content only) */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                        <h1 className="text-[13px] font-semibold text-gray-800 truncate max-w-[60%]">{chatTitle}</h1>
                        <PlanUpgradeEntry size="sm" hideIfMax />
                    </div>
                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 md:px-6 xl:px-8 py-8 pb-28">
                        <div className={`mx-auto w-full ${showToc ? 'max-w-[1380px]' : 'max-w-4xl'}`}>
                            <div className={`flex items-start gap-6 xl:gap-8 ${showToc ? '' : 'justify-center'}`}>
                                {showToc && (
                                    <aside className="hidden md:block w-[220px] shrink-0 self-start sticky" style={{ top: TOC_STICKY_TOP_PX }}>
                                        <nav
                                            ref={tocNavRef}
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
                            {messages.map((msg, i) => (
                                <div key={i} ref={msg.role === 'user' ? lastUserMsgRef : undefined}>
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
                                                {/* Lite-mode banner: Auto fell back to no-agent because both buckets are empty */}
                                                {msg.role === 'assistant' && msg.liteMode && (
                                                    <div className="mb-3 flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                                                        <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[12px] font-semibold text-amber-900 leading-snug">Running in lite mode</p>
                                                            <p className="text-[11px] text-amber-800 leading-snug mt-0.5">{msg.liteMode.hint}</p>
                                                        </div>
                                                        <button
                                                            onClick={() => navigate('/settings')}
                                                            className="shrink-0 text-[11px] font-bold text-amber-900 hover:text-amber-950 underline underline-offset-2"
                                                        >
                                                            Upgrade
                                                        </button>
                                                    </div>
                                                )}
                                                {/* Per-message view tabs: Docs / Web / Roundtable — single row */}
                                                {msg.role === 'assistant' && !msg.isStreaming && (htmlReports[i] || htmlGenerating[i]) && (
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
                                                    </div>
                                                )}
                                                {/* Bare stage pipeline — shows for all modes:
                                                    - Roundtable: 5 stages (Summon → Research → Debate → Consensus → Report)
                                                    - Fast / Auto: 3 stages (Route → Research → Respond) */}
                                                {!!thinkingProcesses[i]?.routedMode && (
                                                    <div className="mb-3 mt-1">
                                                        <PlanPipeline thinking={thinkingProcesses[i]} />
                                                    </div>
                                                )}
                                                {/* Roundtable Workbench — left roster + right (detail + Graph/Debate tabs) */}
                                                {thinkingProcesses[i]?.routedMode === 'roundtable'
                                                  && (thinkingProcesses[i]!.rtPreparationStatus === 'done'
                                                      || ((thinkingProcesses[i]!.rtRounds?.length ?? 0) > 0)
                                                      || ((thinkingProcesses[i]!.rtDataSearch?.length ?? 0) > 0)) && (
                                                    <PlanCardBoundary>
                                                        <RoundtableWorkbench
                                                            thinking={thinkingProcesses[i]!}
                                                            isLive={!!thinkingProcesses[i]?.isActive}
                                                        />
                                                    </PlanCardBoundary>
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
                                                                <HtmlReportFrame html={htmlReports[i]} isStreaming={false} />
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
                                                        {/* Docs / Web view toggle — relocated here from above the answer */}
                                                        {msg.role === 'assistant' && (htmlReports[i] || htmlGenerating[i]) && (
                                                            <>
                                                                <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-lg mr-1">
                                                                    <button
                                                                        onClick={() => setMsgViewMode(prev => ({ ...prev, [i]: 'docs' }))}
                                                                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                                                                            (msgViewMode[i] || 'docs') === 'docs'
                                                                                ? 'bg-white text-gray-900 shadow-sm'
                                                                                : 'text-gray-500 hover:text-gray-700'
                                                                        }`}
                                                                    >
                                                                        Docs
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setMsgViewMode(prev => ({ ...prev, [i]: 'web' }))}
                                                                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                                                                            msgViewMode[i] === 'web'
                                                                                ? 'bg-white text-gray-900 shadow-sm'
                                                                                : 'text-gray-500 hover:text-gray-700'
                                                                        }`}
                                                                    >
                                                                        Web
                                                                    </button>
                                                                </div>
                                                                <div className="w-px h-4 bg-gray-200 mx-1" />
                                                            </>
                                                        )}
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
                    <div className="absolute bottom-0 left-0 right-0 pt-2 pb-4 px-4 md:px-8 pointer-events-none" style={{ zIndex: 10 }}>
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
                                    className="w-full bg-transparent outline-none resize-none text-[14px] text-gray-900 placeholder:text-gray-400 px-4 pt-3.5 pb-1 leading-relaxed overflow-y-auto"
                                    style={{ minHeight: '46px', maxHeight: '180px', visibility: voiceState !== 'idle' ? 'hidden' : 'visible' }}
                                />
                                <div className="flex items-center justify-between px-3 pb-2.5">
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
                                    <div className="flex items-center gap-0.5">
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
                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                                            ) : (
                                                <InputIcons.Mic />
                                            )}
                                        </button>
                                        <button
                                            onClick={isStreaming ? handleStop : handleSend}
                                            disabled={!isStreaming && !inputText.trim()}
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ml-0.5 ${isStreaming
                                                    ? 'bg-gray-900 text-white hover:bg-gray-700'
                                                    : inputText.trim()
                                                        ? 'bg-gray-900 text-white hover:bg-gray-800'
                                                        : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                                }`}
                                        >
                                            {isStreaming ? (
                                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                                            ) : (
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
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
                {/* ── Unified Process Panel (floating card, same for all modes) ── */}
                {showThinkingPanel && currentThinking && (
                    <div className="w-[440px] shrink-0 p-3 pl-0">
                        <div className="h-full flex flex-col overflow-hidden bg-white rounded-2xl border border-gray-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
                            <div className="flex items-center px-4 py-3 border-b border-gray-100 gap-2 shrink-0">
                                <div className="w-5 h-5 rounded-md bg-gray-900 flex items-center justify-center text-white text-[9px] font-black">L</div>
                                <span className="text-[12.5px] font-bold text-gray-900 tracking-tight">Process</span>
                                <div className="flex-1" />
                                <button onClick={() => setShowThinkingPanel(false)}
                                    className="w-7 h-7 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-all">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            <div className="flex-1 min-h-0 overflow-hidden">
                                <ThinkingProcessSidePanel thinking={currentThinking} onClose={() => setShowThinkingPanel(false)} hideHeader chatMode={chatMode} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Standalone Roundtable Panel — only for non-roundtable mode fallback */}
                {showGraphPanel && !showThinkingPanel && !sourcePanelData && chatMode !== 'roundtable' && (
                    <div className="w-[540px] shrink-0 p-3 pl-0">
                        <div className="h-full flex flex-col overflow-hidden bg-white rounded-2xl border border-gray-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.08)] relative">
                            <div className="flex items-center px-4 py-3 border-b border-gray-100 gap-2 shrink-0">
                                <div className="w-5 h-5 rounded-md bg-gray-900 flex items-center justify-center text-white text-[9px] font-black">L</div>
                                <span className="text-[12.5px] font-bold text-gray-900 tracking-tight">Loka's Computer</span>
                                <div className="flex-1" />
                                <button onClick={() => setShowGraphPanel(false)}
                                    className="w-7 h-7 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-all">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            <div className="flex-1 min-h-0 overflow-hidden">
                                <RoundtableView data={currentRoundtableData} isWaiting={isStreaming && (chatMode as string) === 'roundtable' && currentRoundtableData.rounds.length === 0} isLive={isStreaming && (chatMode as string) === 'roundtable'} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Sources Side Panel — floating card */}
                {sourcePanelData && !showThinkingPanel && (
                    <div className="w-[400px] shrink-0 p-3 pl-0">
                        <div className="h-full flex flex-col bg-white rounded-2xl border border-gray-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.08)] overflow-hidden">
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
                    </div>
                )}
            </div>
        </div>
    );
};

export default SuperAgentChat;
