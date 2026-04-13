/**
 * SuperAgentChat — Chat Detail Page
 * Clean chat interface similar to Surf style, with multi-agent thinking process
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { socket } from '../services/socket';
import { api } from '../services/api';
import { renderMarkdownContent, extractQuoteSnapshot, QuoteCard, extractHeadings } from '../utils/markdown';
import { stripInternalResearchCitations } from '../utils/researchCitations';


function saLog(...args: unknown[]) {
    console.log('[SuperAgentChat]', ...args);
}

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
                setIframeHeight(Math.min(e.data.height + 20, 5000));
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
  { id: 'auto' as const,        label: 'Auto',        desc: 'Smart auto-routing to the optimal pipeline', icon: () => <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" /></svg> },
  { id: 'fast' as const,        label: 'Fast',        desc: 'Direct response, minimal orchestration',    icon: () => <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg> },
  { id: 'roundtable' as const,  label: 'Roundtable',  desc: 'Multi-agent debate with iterative consensus', icon: () => <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M14 5.5a7.5 7.5 0 014.5 12" /><path d="M17 19.5H7" /><path d="M5.5 17A7.5 7.5 0 0110 5.5" /></svg> },
];

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    isStreaming?: boolean;
    /** From DB; used to restore Thinking Process when reopening a session */
    metadata?: string | null;
}

interface SearchSource {
    favicon: string;
    title: string;
    domain: string;
    url?: string;
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

const AGENT_COLORS: Record<string, string> = {
    FA: '#475569', MS: '#475569', SE: '#475569', QT: '#475569',
};

// Unified robot icon for all agent avatars
const ROBOT_ICON = <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {/* antenna */}<line x1="12" y1="2" x2="12" y2="6" /><circle cx="12" cy="2" r="1" fill="currentColor" />
    {/* head */}<rect x="4" y="6" width="16" height="12" rx="3" />
    {/* eyes */}<circle cx="9" cy="12" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" />
    {/* mouth */}<line x1="9" y1="16" x2="15" y2="16" />
    {/* ears */}<line x1="2" y1="10" x2="4" y2="10" /><line x1="20" y1="10" x2="22" y2="10" />
</svg>;

const AGENT_ICON = (_initials: string) => ROBOT_ICON;

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

// ─── RoundtableView Component ──────────────────────────
const RoundtableView: React.FC<{ data: RoundtableData; isWaiting?: boolean; isLive?: boolean }> = ({ data, isWaiting, isLive }) => {
    // Empty / waiting state: show the roundtable graphic with agents but no rounds
    if (data.rounds.length === 0) {
        const emptyAgents = ROUNDTABLE_AGENTS;
        const E_SIZE = 220, E_CTR = E_SIZE / 2, E_R = 72, E_AV = 38, E_HALF = E_AV / 2;
        const emptyPositions = emptyAgents.map((_, i) => {
            const a = (i / emptyAgents.length) * 2 * Math.PI - Math.PI / 2;
            return { x: E_CTR + E_R * Math.cos(a), y: E_CTR + E_R * Math.sin(a) };
        });
        return (
            <div className="flex flex-col h-full bg-white">
                <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-[14px] font-bold text-gray-900">Roundtable Consensus</h2>
                    <p className="text-[11px] text-gray-400 mt-0.5">Multi-agent discussion panel</p>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center px-5">
                    <div className="relative" style={{ width: E_SIZE, height: E_SIZE + 24 }}>
                        <svg className="absolute pointer-events-none" style={{ left: 0, top: 0, width: E_SIZE, height: E_SIZE }} viewBox={`0 0 ${E_SIZE} ${E_SIZE}`}>
                            <circle cx={E_CTR} cy={E_CTR} r={E_R + 26} fill="none" stroke="#f5f5f5" strokeWidth="1" />
                            <circle cx={E_CTR} cy={E_CTR} r={E_R} fill="none" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 4" />
                            {emptyPositions.map((p, i) => (
                                <line key={i} x1={E_CTR} y1={E_CTR} x2={p.x} y2={p.y} stroke="#f0f0f0" strokeWidth="1" strokeDasharray="3 3" />
                            ))}
                        </svg>
                        {/* Center indicator */}
                        <div className="absolute flex items-center justify-center" style={{ left: E_CTR - 26, top: E_CTR - 26, width: 52, height: 52 }}>
                            {isWaiting ? (
                                <div className="w-[52px] h-[52px] rounded-full bg-blue-50/80 border-2 border-blue-200 flex flex-col items-center justify-center">
                                    <div className="flex gap-[3px] mb-1">
                                        {[0, 1, 2].map(d => (
                                            <div key={d} className="w-[5px] h-[5px] rounded-full bg-blue-400 rt-pulse-dot" style={{ animationDelay: `${d * 0.2}s` }} />
                                        ))}
                                    </div>
                                    <span className="text-[8px] text-blue-400 font-bold">PREP</span>
                                </div>
                            ) : (
                                <div className="w-[52px] h-[52px] rounded-full bg-gray-50 border-2 border-gray-200 flex items-center justify-center">
                                    <span className="text-[10px] text-gray-300 font-bold">IDLE</span>
                                </div>
                            )}
                        </div>
                        {/* Agent avatars — orbit when waiting */}
                        {isWaiting ? (
                            <div className="absolute rt-orbit" style={{ left: 0, top: 0, width: E_SIZE, height: E_SIZE + 24, transformOrigin: `${E_CTR}px ${E_CTR}px` }}>
                                {emptyAgents.map((agent, i) => {
                                    const pos = emptyPositions[i];
                                    const color = AGENT_COLORS[agent.initials] || '#6b7280';
                                    return (
                                        <div key={agent.initials} className="absolute flex flex-col items-center rt-counter-orbit"
                                            style={{ left: pos.x - E_HALF, top: pos.y - E_HALF, width: E_AV, transformOrigin: `${E_HALF}px ${E_HALF}px` }}>
                                            <div className="rounded-full flex items-center justify-center text-white shadow-sm ring-2 ring-blue-200/40 ring-offset-1"
                                                style={{ backgroundColor: color, width: E_AV, height: E_AV, opacity: 0.8 }}>
                                                {AGENT_ICON(agent.initials)}
                                            </div>
                                            <span className="text-[8px] text-gray-500 mt-1 whitespace-nowrap font-medium leading-none text-center">
                                                {agent.name}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            emptyAgents.map((agent, i) => {
                                const pos = emptyPositions[i];
                                const color = AGENT_COLORS[agent.initials] || '#6b7280';
                                return (
                                    <div key={agent.initials} className="absolute flex flex-col items-center"
                                        style={{ left: pos.x - E_HALF, top: pos.y - E_HALF, width: E_AV }}>
                                        <div className="rounded-full flex items-center justify-center text-white/50 shadow-sm"
                                            style={{ backgroundColor: color, width: E_AV, height: E_AV, opacity: 0.45 }}>
                                            {AGENT_ICON(agent.initials)}
                                        </div>
                                        <span className="text-[8px] text-gray-400 mt-1 whitespace-nowrap font-medium leading-none text-center">
                                            {agent.name}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    {isWaiting ? (
                        <p className="text-[12px] font-medium text-blue-500 mt-4">Analyzing & gathering data...</p>
                    ) : (
                        <p className="text-[12px] text-gray-400 mt-4 text-center leading-relaxed">Waiting for a <span className="font-medium text-gray-500">Roundtable</span> discussion</p>
                    )}
                </div>
            </div>
        );
    }

    const [expandedRound, setExpandedRound] = useState<number | null>(data.rounds.length > 0 ? data.rounds[data.rounds.length - 1].round : null);
    // Always use all 4 agents for the graph, regardless of how many responded in data
    const graphAgents = ROUNDTABLE_AGENTS;
    const totalRounds = data.rounds.length;

    type PlayPhase = 'discussing' | 'voted' | 'consensus';
    const [playPhase, setPlayPhase] = useState<PlayPhase>('discussing');
    const [playRoundIdx, setPlayRoundIdx] = useState(0);
    const [visibleVotes, setVisibleVotes] = useState(0);

    useEffect(() => {
        // If not live (viewing past result), jump straight to final state — no animation
        if (!isLive && totalRounds > 0) {
            setPlayRoundIdx(totalRounds - 1);
            setPlayPhase('consensus');
            setVisibleVotes(graphAgents.length);
            return;
        }
        const timers: ReturnType<typeof setTimeout>[] = [];
        let t = 0;
        for (let r = 0; r < totalRounds; r++) {
            const rr = r;
            timers.push(setTimeout(() => { setPlayRoundIdx(rr); setPlayPhase('discussing'); setVisibleVotes(0); }, t));
            t += 2800;
            timers.push(setTimeout(() => { setPlayPhase('voted'); setVisibleVotes(0); }, t));
            const numAgents = graphAgents.length;
            for (let a = 0; a < numAgents; a++) {
                const aa = a;
                timers.push(setTimeout(() => { setVisibleVotes(aa + 1); }, t + (aa + 1) * 300));
            }
            t += 300 * numAgents + 800;
        }
        timers.push(setTimeout(() => { setPlayPhase('consensus'); setVisibleVotes(graphAgents.length); }, t));
        return () => timers.forEach(clearTimeout);
    }, [totalRounds, isLive]);

    const isSpinning = playPhase === 'discussing';
    const isConsensusReached = playPhase === 'consensus';
    const currentRound = data.rounds[playRoundIdx];

    const SIZE = 220;
    const CTR = SIZE / 2;
    const R = 72;
    const agentPositions = graphAgents.map((_, i) => {
        const a = (i / graphAgents.length) * 2 * Math.PI - Math.PI / 2;
        return { x: CTR + R * Math.cos(a), y: CTR + R * Math.sin(a) };
    });
    const AVATAR = 38;
    const HALF = AVATAR / 2;

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-[14px] font-bold text-gray-900">Roundtable Consensus</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">{data.rounds.length} round{data.rounds.length > 1 ? 's' : ''} of discussion</p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {/* Animated Roundtable Graphic */}
                <div className="relative flex flex-col items-center pb-4 border-b border-gray-100">
                    <style>{`
                        @keyframes rt-ring-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                        @keyframes rt-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                        @keyframes rt-counter-orbit { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
                        @keyframes rt-pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
                        @keyframes rt-float-up { 0% { opacity: 1; transform: translateY(0) scale(1); } 60% { opacity: 1; transform: translateY(-16px) scale(1.15); } 100% { opacity: 0; transform: translateY(-24px) scale(0.8); } }
                        .rt-ring-spin { animation: rt-ring-spin 5s linear infinite; }
                        .rt-ring-spin.stopped { animation-play-state: paused; }
                        .rt-orbit { animation: rt-orbit 12s linear infinite; }
                        .rt-orbit.stopped { animation: none; }
                        .rt-counter-orbit { animation: rt-counter-orbit 12s linear infinite; }
                        .rt-counter-orbit.stopped { animation: none; }
                        .rt-pulse-dot { animation: rt-pulse 1s ease-in-out infinite; }
                        .rt-float-vote { animation: rt-float-up 1.2s ease-out both; }
                    `}</style>

                    <div className="relative" style={{ width: SIZE, height: SIZE + 24 }}>
                        <svg className="absolute pointer-events-none" style={{ left: 0, top: 0, width: SIZE, height: SIZE }} viewBox={`0 0 ${SIZE} ${SIZE}`} preserveAspectRatio="none">
                            <circle cx={CTR} cy={CTR} r={R + 26} fill="none" stroke="#f5f5f5" strokeWidth="1" />
                            <circle cx={CTR} cy={CTR} r={R} fill="none" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 4" />
                            {agentPositions.map((p, i) => (
                                <line key={i} x1={CTR} y1={CTR} x2={p.x} y2={p.y}
                                    stroke="#f0f0f0" strokeWidth="1" strokeDasharray="3 3" />
                            ))}
                        </svg>

                        <div className={`absolute rt-ring-spin ${!isSpinning ? 'stopped' : ''}`}
                            style={{ left: 0, top: 0, width: SIZE, height: SIZE, pointerEvents: 'none' }}>
                            <svg style={{ width: SIZE, height: SIZE }} viewBox={`0 0 ${SIZE} ${SIZE}`} preserveAspectRatio="none">
                                <circle cx={CTR} cy={CTR} r={R + 12} fill="none"
                                    stroke="url(#rtArcGrad)" strokeWidth="2.5"
                                    strokeDasharray={`${Math.PI * (R + 12) * 0.35} ${Math.PI * (R + 12) * 1.65}`}
                                    strokeLinecap="round" opacity={isSpinning ? 1 : 0}
                                    style={{ transition: 'opacity 0.3s' }}
                                />
                                <defs>
                                    <linearGradient id="rtArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.7" />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>

                        <div className="absolute flex items-center justify-center"
                            style={{ left: CTR - 26, top: CTR - 26, width: 52, height: 52 }}>
                            <div className={`w-[52px] h-[52px] rounded-full flex flex-col items-center justify-center transition-all duration-500 ${
                                isSpinning
                                    ? 'bg-blue-50/80 border-2 border-blue-200'
                                    : 'bg-gray-50 border-2 border-gray-200'
                            }`}>
                                {isSpinning ? (
                                    <>
                                        <div className="flex gap-[3px] mb-1">
                                            {[0, 1, 2].map(i => (
                                                <div key={i} className="w-[5px] h-[5px] rounded-full bg-blue-400 rt-pulse-dot" style={{ animationDelay: `${i * 0.2}s` }} />
                                            ))}
                                        </div>
                                        <span className="text-[9px] text-blue-500 font-bold">R{playRoundIdx + 1}</span>
                                    </>
                                ) : (
                                    <span className="text-[11px] text-gray-500 font-bold">R{playRoundIdx + 1}</span>
                                )}
                            </div>
                        </div>

                        <div className={`absolute rt-orbit ${!isSpinning ? 'stopped' : ''}`}
                            style={{ left: 0, top: 0, width: SIZE, height: SIZE + 24, transformOrigin: `${CTR}px ${CTR}px` }}>
                        {graphAgents.map((agent, i) => {
                            const pos = agentPositions[i];
                            const color = AGENT_COLORS[agent.initials] || '#6b7280';
                            const roundAgent = currentRound?.agents.find(a => a.agentId === agent.agentId);
                            const hasResponse = !!roundAgent;
                            const conf = roundAgent?.confidence ?? 0;
                            const showVote = hasResponse && (playPhase === 'voted' || playPhase === 'consensus') && i < visibleVotes;
                            const ringCls = isSpinning ? 'ring-2 ring-blue-200/60 ring-offset-1' : '';
                            return (
                                <div key={agent.initials} className={`absolute flex flex-col items-center rt-counter-orbit ${!isSpinning ? 'stopped' : ''}`}
                                    style={{ left: pos.x - HALF, top: pos.y - HALF, width: AVATAR, transformOrigin: `${HALF}px ${HALF}px` }}>
                                    <div className="relative flex justify-center">
                                        <div className={`rounded-full flex items-center justify-center text-white shadow-sm transition-all duration-300 ${ringCls}`}
                                            style={{ backgroundColor: color, width: AVATAR, height: AVATAR }}>
                                            {AGENT_ICON(agent.initials)}
                                        </div>
                                        {showVote && (
                                            <div key={`${playRoundIdx}-${agent.initials}`}
                                                className="absolute -top-2 left-1/2 -translate-x-1/2 rt-float-vote pointer-events-none">
                                                <span className="text-[11px] font-bold bg-white/90 backdrop-blur rounded-full px-1.5 py-0.5 shadow-sm text-blue-600 border border-blue-100">{conf}%</span>
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[8px] text-gray-500 mt-1 whitespace-nowrap font-medium leading-none text-center">
                                        {agent.name}
                                    </span>
                                </div>
                            );
                        })}
                        </div>
                    </div>

                    <div className={`text-[12px] font-semibold transition-colors duration-300 ${
                        isConsensusReached ? 'text-emerald-600' : isSpinning ? 'text-blue-500' : 'text-gray-500'
                    }`}>
                        {isConsensusReached
                            ? '✓ Consensus Reached'
                            : isSpinning
                                ? `Round ${playRoundIdx + 1} — Discussing...`
                                : `Round ${playRoundIdx + 1} — Votes In`}
                    </div>
                </div>

                {/* Rounds */}
                {data.rounds.map((round) => {
                    const isExpanded = expandedRound === round.round;
                    const isReached = round.status === 'reached';
                    const statusLabel = isReached ? '✓ Consensus' : '→ Next Round';
                    const statusCls = isReached ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500';
                    return (
                        <div key={round.round} className="relative">
                            {round.round < data.rounds.length && (
                                <div className="absolute left-[15px] top-[36px] bottom-[-16px] w-px bg-gray-200" />
                            )}
                            <button
                                onClick={() => setExpandedRound(isExpanded ? null : round.round)}
                                className="flex items-center gap-3 w-full text-left group"
                            >
                                <div className={`w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${
                                    isReached ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                    R{round.round}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[13px] font-semibold text-gray-800">Round {round.round}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusCls}`}>
                                            {statusLabel}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{round.summary}</p>
                                </div>
                                <svg className={`w-4 h-4 text-gray-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {isExpanded && (
                                <div className="mt-3 ml-[42px] space-y-2.5">
                                    {(() => {
                                        // Group agents with identical reasoning to avoid duplicate text
                                        const groups: { agents: typeof round.agents; reasoning: string }[] = [];
                                        for (const agent of round.agents) {
                                            const key = (agent.reasoning || '').trim();
                                            const existing = groups.find(g => g.reasoning === key);
                                            if (existing) {
                                                existing.agents.push(agent);
                                            } else {
                                                groups.push({ agents: [agent], reasoning: key });
                                            }
                                        }
                                        return groups.map((group, gi) => {
                                            const isMerged = group.agents.length > 1;
                                            const avgConf = Math.round(group.agents.reduce((s, a) => s + a.confidence, 0) / group.agents.length);
                                            const confColor = avgConf >= 75 ? 'bg-emerald-500' : avgConf >= 50 ? 'bg-blue-500' : 'bg-amber-500';
                                            return (
                                                <div key={gi} className="rounded-xl border border-gray-200 bg-white px-3.5 py-3">
                                                    {/* Header: agent(s) + confidence */}
                                                    {isMerged ? (
                                                        <>
                                                            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                                                {group.agents.map(a => {
                                                                    const color = AGENT_COLORS[a.initials] || '#6b7280';
                                                                    return (
                                                                        <div key={a.initials} className="flex items-center gap-1 bg-gray-50 rounded-full pl-0.5 pr-2 py-0.5">
                                                                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: color }}>
                                                                                <span className="[&>svg]:w-2.5 [&>svg]:h-2.5">{AGENT_ICON(a.initials)}</span>
                                                                            </div>
                                                                            <span className="text-[10px] font-medium text-gray-600">{a.name}</span>
                                                                            <span className="text-[9px] text-gray-400">{a.confidence}%</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            <p className="text-[10px] text-gray-400 mb-1.5 italic">Shared consensus view (avg. {avgConf}% confidence)</p>
                                                        </>
                                                    ) : (
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: AGENT_COLORS[group.agents[0].initials] || '#6b7280' }}>
                                                                    <span className="[&>svg]:w-3 [&>svg]:h-3">{AGENT_ICON(group.agents[0].initials)}</span>
                                                                </div>
                                                                <span className="text-[12px] font-semibold text-gray-800">{group.agents[0].name}</span>
                                                            </div>
                                                            <span className="text-[11px] font-bold text-gray-500">{group.agents[0].confidence}%</span>
                                                        </div>
                                                    )}
                                                    {/* Confidence bar */}
                                                    <div className="w-full h-1.5 bg-gray-100 rounded-full mb-2 overflow-hidden">
                                                        <div className={`h-full rounded-full transition-all duration-500 ${confColor}`} style={{ width: `${isMerged ? avgConf : group.agents[0].confidence}%` }} />
                                                    </div>
                                                    {/* Reasoning — formatted */}
                                                    {group.reasoning && (
                                                        <div className="text-[11px] text-gray-600 leading-relaxed [&>p]:mb-1.5 [&>ul]:ml-3 [&>ul]:list-disc [&>ul]:mb-1.5 [&>ol]:ml-3 [&>ol]:list-decimal [&>ol]:mb-1.5">
                                                            {group.reasoning.split(/\n{2,}/).map((para, pi) => {
                                                                const trimmed = para.trim();
                                                                if (!trimmed) return null;
                                                                if (/^[-•*]\s/.test(trimmed)) {
                                                                    const items = trimmed.split(/\n/).filter(Boolean);
                                                                    return (<ul key={pi}>{items.map((item, ii) => (<li key={ii}>{item.replace(/^[-•*]\s*/, '')}</li>))}</ul>);
                                                                }
                                                                if (/^\d+[.)]\s/.test(trimmed)) {
                                                                    const items = trimmed.split(/\n/).filter(Boolean);
                                                                    return (<ol key={pi}>{items.map((item, ii) => (<li key={ii}>{item.replace(/^\d+[.)]\s*/, '')}</li>))}</ol>);
                                                                }
                                                                return (
                                                                    <p key={pi}>
                                                                        {trimmed.split('\n').map((line, li, arr) => {
                                                                            const parts = line.split(/(\*\*[^*]+\*\*)/g);
                                                                            return (
                                                                                <span key={li}>
                                                                                    {parts.map((part, pk) =>
                                                                                        /^\*\*(.+)\*\*$/.test(part)
                                                                                            ? <strong key={pk} className="font-semibold text-gray-700">{part.slice(2, -2)}</strong>
                                                                                            : <span key={pk}>{part}</span>
                                                                                    )}
                                                                                    {li < arr.length - 1 && <br />}
                                                                                </span>
                                                                            );
                                                                        })}
                                                                    </p>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        });
                                    })()}
                                    <div className="flex items-start gap-2 py-2 px-1">
                                        <svg className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <p className="text-[11px] text-gray-500 leading-relaxed">{round.summary}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Final Verdict */}
                <div className="mt-2 pt-4 border-t border-gray-100">
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl px-4 py-4 border border-blue-100">
                        <div className="flex items-center gap-2 mb-2">
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-[13px] font-bold text-gray-900">Final Verdict</span>
                            <span className="text-[12px] text-gray-500 ml-auto">Confidence: <span className="font-semibold text-gray-700">{data.finalVerdict.confidence}%</span></span>
                        </div>
                        <p className="text-[12px] text-gray-600 leading-relaxed">{data.finalVerdict.summary}</p>
                    </div>
                </div>
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
    const durLabel =
        typeof dur === 'number' && !Number.isNaN(dur) ? String(dur) : '?';
    const activeModule = thinking.modules.find(m => m.status === 'active');
    const labels: Record<string, string> = { search: 'Searching...', analysis: 'Analyzing...', simulation: 'Simulating...', consensus: 'Reaching consensus...' };
    const label = thinking.isActive ? (activeModule ? labels[activeModule.type] || 'Processing...' : 'Processing...') : `Loka completed in ${durLabel}s`;

    const isSimple = thinking.routedMode === 'fast';

    if (isSimple) {
        return (
            <div className="flex items-center gap-2 py-1.5 mb-2">
                {thinking.isActive ? (
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                ) : (
                    <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                )}
                <span className="text-[13px] font-medium text-gray-400">{label}</span>
            </div>
        );
    }

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
    if (status === 'error' || status === 'failed') return <svg className={`${s} text-red-500 shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>;
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

const SourceCard: React.FC<{ source: SearchSource }> = ({ source }) => {
    const content = (
        <>
            <div className="shrink-0 w-5 h-5 flex items-center justify-center"><PlatformLogo platform={source.favicon} /></div>
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
                                <span key={`${t.tool}-${i}`} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                                    t.status === 'running' ? 'bg-blue-50 text-blue-600 animate-pulse' :
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
                                        <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                                            p.status === 'done' ? 'bg-emerald-50 text-emerald-700' :
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
                            <div key={stage.id || stage.label} className={`rounded-xl border transition-all duration-300 overflow-hidden ${
                                stage.status === 'done' ? 'border-gray-100 bg-gray-50/50' :
                                stage.status === 'active' ? 'border-blue-100 bg-blue-50/30' :
                                'border-gray-100 bg-white'
                            }`}>
                                <div className="flex items-center gap-2 px-3 py-2">
                                    <span className="text-[13px]">{icon}</span>
                                    <span className={`text-[12px] font-medium flex-1 ${
                                        stage.status === 'done' ? 'text-gray-700' :
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
                                        {p.verdict} · {confidenceToPercent(p.confidence)}% confidence
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
                                {d.prediction.verdict} · {confidenceToPercent(d.prediction.confidence)}%
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
                                <span className="text-[12px] font-semibold text-gray-700">{confidenceToPercent(d.conclusion.confidence)}%</span>
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
        return (
            <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2.5">
                    <StatusIcon status="done" />
                    <span className="text-[14px] font-bold text-gray-900">Done</span>
                    {showDur && <span className="text-[11px] text-gray-400 ml-auto">{dur}s</span>}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                    <h2 className="text-[14px] font-bold text-gray-900">Thinking Process</h2>
                </div>
                <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Searching module: combines Basic Data (toolTrace) + Market Data (search module) */}
                {(() => {
                    const searchMod = thinking.modules.find(m => m.type === 'search');
                    const hasToolTrace = thinking.toolTrace && thinking.toolTrace.length > 0;
                    const hasPlanning = !!thinking.planningMessage;
                    const hasSearch = !!searchMod;
                    if (hasToolTrace || hasPlanning || hasSearch) {
                        return <SearchModule
                            mod={searchMod || { type: 'search', status: 'active' }}
                            toolTrace={thinking.toolTrace}
                            planningMessage={thinking.planningMessage}
                        />;
                    }
                    return null;
                })()}
                {thinking.modules.filter(m => (m.type !== 'done' && m.type !== 'search') || (m.type === 'done' && m.status === 'completed')).map((mod) => {
                    switch (mod.type) {
                        case 'analysis': return <AnalysisModule key="analysis" mod={mod} />;
                        case 'simulation': return <SimulationModule key="simulation" mod={mod} />;
                        case 'consensus': return <ConsensusModule key="consensus" mod={mod} />;
                        case 'done': return <DoneModule key="done" mod={mod} />;
                        default: return null;
                    }
                })}
            </div>
        </div>
    );
};

// ─── Summarize user question into a short topic title ──────
const STOP_WORDS = new Set(['THE','AND','FOR','NOT','ARE','BUT','HOW','WHY','CAN','YOU','HAS','WAS','HIS','HER','ALL','ANY','WHO','ITS','GET','LET','MAY','OUR','SAY','SHE','TOO','USE','WAY','NOW']);
function summarizeTitle(raw: string): string {
    if (!raw) return 'New Chat';
    const q = raw.replace(/[？?！!。]+$/g, '').trim();
    const tickers = [...new Set((q.match(/\b[A-Z]{2,5}\b/g) || []).filter(t => !STOP_WORDS.has(t)))];

    const cmpMatch = q.match(/(?:compare|对比|vs\.?)\s+(.{2,15})\s+(?:vs\.?|and|与|和|跟)\s+(.{2,15})/i);
    if (cmpMatch) return `${cmpMatch[1].trim()} vs ${cmpMatch[2].trim().replace(/\s*(fundamentals|for|的|基本面).*/i, '')} Comparison`;

    const analyzeMatch = q.match(/(?:analyze|analysis|分析|研究|evaluate|评估)\s+(.{2,30}?)(?:\s+(?:stock|recent|latest|最近|performance|表现|情况).*)?$/i);
    if (analyzeMatch) return `${analyzeMatch[1].replace(/^(the|a|an|this)\s+/i, '').replace(/'s$/,'').trim()} Analysis`;

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
        return topicMatch ? `${topicMatch[1].replace(/[？?]$/,'').trim()} Market Research` : 'Market Research';
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

const SuperAgentChat: React.FC<SuperAgentChatProps> = ({ initialMessage, onBack, agentCount = 2, selectedAgentId, initialSessionId, initialChatMode }) => {
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
                streaming?: boolean;
            };
            const sid = sessionStorage.getItem(SA_SID_KEY);
            if (!p?.streaming || !p.userContent || p.sessionId !== sid) return [];
            return [
                { role: 'user', content: p.userContent, timestamp: new Date().toLocaleTimeString() },
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
            const sid = sessionStorage.getItem(SA_SID_KEY);
            return !!(p?.streaming && p.sessionId === sid);
        } catch {
            return false;
        }
    });
    const [thinkingProcesses, setThinkingProcesses] = useState<Record<number, ThinkingFlow>>({});
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
                return !!(p?.streaming && p.sessionId === sessionStorage.getItem(SA_SID_KEY));
            } catch {
                return false;
            }
        })(),
    );
    // ─── Right Side Panel ─────────────────────────────────────
    const [showGraphPanel, setShowGraphPanel] = useState(() => (initialChatMode ?? 'auto') === 'roundtable');
    const [showThinkingPanel, setShowThinkingPanel] = useState(false);
    const [activeGraphMsgIdx, setActiveGraphMsgIdx] = useState<number | null>(null);
    const [chatMode, setChatMode] = useState<'auto' | 'fast' | 'roundtable'>(() => initialChatMode ?? 'auto');
    const [chatModeOpen, setChatModeOpen] = useState(false);
    const chatModeRef = useRef<HTMLDivElement>(null);
    const [htmlReports, setHtmlReports] = useState<Record<number, string>>({});
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

    /** Extract "Questions to watch" / follow-up questions from the end of a synthesis response */
    const extractFollowUpQuestions = useCallback((content: string): { body: string; questions: string[] } => {
        // Match a bold/heading title containing question/watch/关注/问题 keywords,
        // then a bullet list. Allow optional trailing tags/text after the bullet list.
        // Covers: **Questions to watch:**, ## Follow-up Questions, **值得关注的问题：**, etc.
        const pattern = /\n(?:---\s*\n+)?(?:\*\*|#{1,3}\s*)[^\n]*?(?:question|watch|关注|问题|考虑|思考)[^\n]*?(?:\*\*)?\s*\n((?:\s*(?:[-•*]|\d+[.)]\s).+\n?)+)/i;
        const match = content.match(pattern);
        if (match) {
            const questions = match[1].split('\n')
                .map(l => l.trim())
                .filter(l => /^(?:[-•*]|\d+[.)]\s)/.test(l))
                .map(l => l.replace(/^(?:[-•*]|\d+[.)]\s)\s*/, '').trim())
                .filter(Boolean);
            if (questions.length > 0) {
                // Strip everything from the questions heading onwards
                return { body: content.slice(0, match.index).trimEnd(), questions };
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
                const h = extractHeadings(noQuote, j);
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

    // Scroll-spy: track which heading is currently in view + TOC position + which message's TOC to show
    const [tocTopPx, setTocTopPx] = useState(0);
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const tocIndices = Object.keys(allTocHeadings).map(Number);
        if (tocIndices.length === 0) return;

        const onScroll = () => {
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

            // Float position – clamp between the answer's h1 title and its action-bar
            const firstEl = ids[0] ? document.getElementById(ids[0]) : null;
            if (firstEl) {
                const floatTop = Math.max(8, firstEl.offsetTop - container.scrollTop);

                // Bottom boundary: when TOC would overlap the action bar, let it scroll away with content
                const actionsEl = document.getElementById(`msg-actions-${bestIdx}`);
                const tocH = tocNavRef.current?.offsetHeight || 0;
                if (actionsEl && tocH > 0) {
                    const pinnedTop = actionsEl.offsetTop - container.scrollTop - tocH - 16;
                    setTocTopPx(Math.min(floatTop, pinnedTop));
                } else {
                    setTocTopPx(floatTop);
                }
            }
        };
        container.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        return () => container.removeEventListener('scroll', onScroll);
    }, [allTocHeadings]);

    // Scroll user’s question to top when a new message is sent
    const scrollUserMsgToTop = useCallback(() => {
        requestAnimationFrame(() => {
            const el = lastUserMsgRef.current;
            const container = scrollContainerRef.current;
            if (el && container) {
                const elTop = el.offsetTop - container.offsetTop;
                container.scrollTo({ top: elTop - 24, behavior: 'smooth' });
            }
        });
    }, []);

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
            setThinkingProcesses(prev => ({
                ...prev, [activeMsgIdxRef.current]: { modules: [], isActive: true, route: 'Routing...', _gen: activeChatGenRef.current }
            }));
        };

        const onRouted = (data: { sessionId: string; mode: string }) => {
            saLog('← agent:chat:routed', { expect: sessionId, got: data?.sessionId, mode: data?.mode, match: data.sessionId === sessionId });
            if (data.sessionId !== sessionId) return;
            setThinkingProcesses(prev => {
                const msgIdx = activeMsgIdxRef.current;
                const flow = prev[msgIdx];
                if (!flow) return prev;
                return { ...prev, [msgIdx]: { ...flow, routedMode: data.mode } };
            });
        };

        const onStarted = (data: { sessionId: string; mode: string; route: string }) => {
            saLog('← agent:chat:started', { expect: sessionId, got: data?.sessionId, route: data?.route, match: data.sessionId === sessionId });
            if (data.sessionId !== sessionId) return;
             setThinkingProcesses(prev => ({
                 ...prev, [activeMsgIdxRef.current]: { modules: [], isActive: true, route: data.route }
             }));
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
                        (prevStatus === 'completed' || prevStatus === 'done' || prevStatus === 'concluded');
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

        const onStreamDone = (data: { sessionId: string; content?: string }) => {
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
                    timestamp: new Date().toLocaleTimeString() 
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

        const onError = (data: { sessionId: string; error: string }) => {
            saLog('← agent:chat:error', { expect: sessionId, got: data?.sessionId, error: data?.error, match: data.sessionId === sessionId });
            if (data.sessionId !== sessionId) return;
            try {
                sessionStorage.removeItem(SA_PENDING_KEY);
            } catch {
                /* ignore */
            }
            setMessages(prev => {
                const updated = [...prev];
                const msgIdx = activeMsgIdxRef.current;
                if (!updated[msgIdx]) return prev;
                updated[msgIdx] = { ...updated[msgIdx], content: updated[msgIdx].content + '\n\n**Error:** ' + data.error, isStreaming: false };
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
            saLog('← agent:chat:consensus_done', { expect: sessionId, got: data?.sessionId, match: data.sessionId === sessionId });
            if (data.sessionId !== sessionId) return;
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            setConsensusResults(prev => ({ ...prev, [msgIdx]: data.result }));
        };

        const onQuote = (data: { sessionId: string; quote: any }) => {
            if (data.sessionId !== sessionId) return;
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0) return;
            setQuoteCards(prev => ({ ...prev, [msgIdx]: data.quote }));
        };

        const onHtmlReady = (data: { sessionId: string; msgIdx: number; html: string }) => {
            if (data.sessionId !== sessionId) return;
            setHtmlReports(prev => ({ ...prev, [data.msgIdx]: data.html }));
            setMsgViewMode(prev => ({ ...prev, [data.msgIdx]: 'web' }));
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
        socket.on('agent:chat:html_ready', onHtmlReady);

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
            socket.off('agent:chat:html_ready', onHtmlReady);
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
                    report?: string;
                    status?: string;
                }) => {
                    saLog('replay ack', { ok: res?.ok, stepsLen: Array.isArray(res?.steps) ? res.steps.length : 0, isRunning: res?.isRunning, status: res?.status });

                    const stepsLen = Array.isArray(res?.steps) ? res.steps.length : 0;
                    const hasSteps = stepsLen > 0;

                    if (res?.ok && hasSteps) {
                        const msgIdx = activeMsgIdxRef.current >= 0 ? activeMsgIdxRef.current : 1;
                        const trace = buildTraceFromSteps(res.steps!);
                        const planning = extractPlanningMessage(res.steps!);
                        setThinkingProcesses(prev => ({
                            ...prev,
                            [msgIdx]: {
                                ...(prev[msgIdx] || {
                                    modules: [],
                                    isActive: !!res.isRunning,
                                    route: 'Investment Analyst',
                                }),
                                toolTrace: trace,
                                planningMessage: planning,
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
                            [msgIdx]: { modules: [], isActive: true, route: 'Routing...' },
                        }));
                        setIsStreaming(true);
                        socket.emit('agent:chat', {
                            content: pending!.userContent!,
                            mode: chatMode,
                            sessionId,
                            agentId: chatSelectedAgent,
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

    const sendToAI = useCallback((text: string, existingMessages?: Message[]) => {
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
        // Keep graph panel open in roundtable mode so user sees the waiting state
        if (chatMode !== 'roundtable') setShowGraphPanel(false);

        setThinkingProcesses(prev => ({
            ...prev, [msgIdx]: { modules: [], isActive: true, route: 'Routing...' }
        }));

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
            agentId: chatSelectedAgent,
        });
        saLog('sendToAI emit agent:chat done (see [LokaSocket] for queued vs live)');

    }, [chatMode, sessionId, chatSelectedAgent]);

    // ─── Fetch History ──────────────────────────
    useEffect(() => {
        if (initialSessionId) {
            api.getChatHistory(undefined, undefined, initialSessionId).then(history => {
                if (history && history.length > 0) {
                    setMessages(
                        history.map((m: { role: string; content?: string; createdAt: string; metadata?: string | null }) => ({
                            role: m.role as 'user' | 'assistant',
                            content: m.content || '',
                            timestamp: new Date(m.createdAt).toLocaleTimeString(),
                            isStreaming: false,
                            metadata: m.metadata ?? null,
                        })),
                    );
                    const restoredThinking: Record<number, ThinkingFlow> = {};
                    const restoredConsensus: Record<number, any> = {};
                    const restoredQuotes: Record<number, any> = {};
                    const restoredHtml: Record<number, string> = {};
                    const restoredViewModes: Record<number, 'docs' | 'web'> = {};
                    history.forEach(
                        (m: { role: string; metadata?: string | null }, idx: number) => {
                            if (m.role !== 'assistant' || !m.metadata) return;
                            try {
                                const meta = JSON.parse(m.metadata) as { thinkingFlow?: ThinkingFlow; consensusResult?: any; quoteCard?: any; htmlReport?: string };
                                if (meta.thinkingFlow && Array.isArray(meta.thinkingFlow.modules)) {
                                    restoredThinking[idx] = {
                                        ...meta.thinkingFlow,
                                        isActive: false,
                                    };
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
                    setThinkingProcesses(restoredThinking);
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
                    activeMsgIdxRef.current = history.length - 1;
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
        saLog('initial: schedule sendToAI in 50ms', { initialPreview: initialMessage.slice(0, 80), ...socket.getDebugState() });
        setTimeout(() => { sendToAI(initialMessage, initialMessages); setTimeout(scrollUserMsgToTop, 80); }, 50);
    }, [initialMessage, sendToAI, initialSessionId, sessionId, chatSelectedAgent, scrollUserMsgToTop]);

    // ─── Handle send ────────────────────────────────────────
    const handleSend = () => {
        if (!inputText.trim() || isStreaming) return;
        const text = inputText.trim();
        saLog('handleSend', { textPreview: text.slice(0, 80), isStreaming, ...socket.getDebugState() });
        const userMsg: Message = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString() };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInputText('');
        sendToAI(text, newMessages);
        // Scroll so the user’s question appears at the top
        setTimeout(scrollUserMsgToTop, 80);
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
            `}</style>
            {/* ══ Header: chat title + graph toggle ══ */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                <h1 className="text-[13px] font-semibold text-gray-800 truncate max-w-[60%]">{chatTitle}</h1>
                <div className="flex items-center gap-1.5">
                    <button
                    onClick={() => {
                        setShowGraphPanel(p => {
                            if (!p && activeGraphMsgIdx === null) {
                                // Find latest msg with a thinking process
                                for (let j = messages.length - 1; j >= 0; j--) {
                                    if (thinkingProcesses[j]) { setActiveGraphMsgIdx(j); break; }
                                }
                            }
                            return !p;
                        });
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                        showGraphPanel ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                    }`}
                >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="5" r="2.5" /><circle cx="19" cy="19" r="2.5" />
                        <path d="M7.5 11L16.5 6M7.5 13L16.5 18" />
                    </svg>
                    Roundtable Graph
                </button>
                </div>
            </div>

            {/* ══ Content Row ══ */}
            <div className="flex flex-1 overflow-hidden">
                {/* Chat column */}
                <div className="relative flex flex-col flex-1 min-w-0 overflow-hidden">
                    {/* TOC floating panel */}
                    {showToc && (
                        <nav
                            ref={tocNavRef}
                            className="absolute left-3 z-30 hidden md:block transition-all duration-150"
                            style={{ top: tocTopPx }}
                        >
                            <div className="w-[220px] bg-white/95 backdrop-blur-md border border-gray-200/60 rounded-xl shadow-lg shadow-gray-200/30 py-3 px-2">
                                <p className="px-2 pb-1.5 text-[11px] font-semibold text-gray-500 tracking-wide">Sections</p>
                                <ul className="space-y-0.5">
                                    {tocHeadings.filter(h => h.level >= 2).map((h, idx) => {
                                        const isActive = activeTocId === h.id;
                                        const sectionNum = h.level === 2
                                            ? tocHeadings.filter(x => x.level === 2).indexOf(h) + 1
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
                    )}
                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 md:px-10 py-8 pb-28">
                        <div className={`max-w-4xl mx-auto space-y-8 transition-all duration-200 ${showToc ? 'md:ml-[228px]' : ''}`}>
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
                                                            setActiveGraphMsgIdx(i);
                                                            setShowThinkingPanel(true);
                                                            setShowGraphPanel(false);
                                                        }}
                                                    />
                                                )}
                                                {/* Clickable badge to view past roundtable consensus */}
                                                {consensusResults[i] && !msg.isStreaming && (
                                                    <button
                                                        onClick={() => { setActiveGraphMsgIdx(i); setShowGraphPanel(true); setShowThinkingPanel(false); }}
                                                        className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 text-[11px] text-indigo-600 font-medium transition-colors"
                                                    >
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                                                        Roundtable
                                                    </button>
                                                )}
                                                {/* Per-message Docs / Web tab toggle */}
                                                {msg.role === 'assistant' && htmlReports[i] && !msg.isStreaming && (
                                                    <div className="flex items-center gap-0.5 mb-2 p-0.5 bg-gray-100 rounded-lg w-fit">
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
                                                {msg.content === '__cancelled__' ? (() => {
                                                    const prevUser = messages.slice(0, i).reverse().find(m => m.role === 'user');
                                                    const isChinese = prevUser && /[\u4e00-\u9fff]/.test(prevUser.content);
                                                    return <p className="text-[13px] text-gray-400 italic">{isChinese ? '回复已取消' : 'Response cancelled'}</p>;
                                                })() : msg.content ? (() => {
                                                    const cleaned = msg.role === 'assistant' ? stripInternalResearchCitations(msg.content) : msg.content;
                                                    const { body: bodyNoQuestions } = msg.role === 'assistant' && !msg.isStreaming
                                                        ? extractFollowUpQuestions(cleaned)
                                                        : { body: cleaned };
                                                    const { quote, body } = msg.role === 'assistant' && !msg.isStreaming
                                                        ? extractQuoteSnapshot(bodyNoQuestions)
                                                        : { quote: null, body: bodyNoQuestions };
                                                    const liveQuote = quoteCards[i];
                                                    const showWebView = msgViewMode[i] === 'web' && htmlReports[i];
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
                                                                    </div>
                                                                );
                                                            })()}
                                                            {/* Fallback: markdown-parsed quote card */}
                                                            {!liveQuote && quote && <QuoteCard quote={quote} />}
                                                            {showWebView ? (
                                                                <HtmlReportFrame html={htmlReports[i]} isStreaming={false} />
                                                            ) : (
                                                            <div className="markdown-content text-[14.5px] text-gray-700 leading-relaxed space-y-1.5 [&_a]:break-words [&_ul]:pl-1 [&_ol]:pl-1">
                                                                {renderMarkdownContent(body, i)}
                                                            </div>
                                                            )}
                                                        </>
                                                    );
                                                })() : null}
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
                                                                setTimeout(scrollUserMsgToTop, 80);
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
                                                                            setTimeout(scrollUserMsgToTop, 80);
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
                            <div ref={messagesEndRef} />
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
                                                                    // Auto-open Roundtable Graph when selecting roundtable mode
                                                                    if (m.id === 'roundtable') {
                                                                        setShowGraphPanel(true);
                                                                        setShowThinkingPanel(false);
                                                                    }
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
                                            onClick={isStreaming ? handleStop : handleSend}
                                            disabled={!isStreaming && !inputText.trim()}
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                                isStreaming
                                                    ? 'bg-gray-900 text-white hover:bg-gray-700'
                                                    : inputText.trim()
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

                {/* Thinking Process Side Panel */}
                {showThinkingPanel && currentThinking && (
                    <div className="w-[360px] shrink-0 border-l border-gray-100 overflow-hidden">
                        <ThinkingProcessSidePanel
                            thinking={currentThinking}
                            onClose={() => setShowThinkingPanel(false)}
                        />
                    </div>
                )}

                {/* Roundtable Consensus Panel */}
                {showGraphPanel && !showThinkingPanel && (
                    <div className="w-[400px] shrink-0 border-l border-gray-100 overflow-hidden relative">
                        <button
                            onClick={() => setShowGraphPanel(false)}
                            className="absolute top-2 right-2 z-20 w-7 h-7 rounded-lg bg-white/80 backdrop-blur border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all shadow-sm"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        <RoundtableView data={currentRoundtableData} isWaiting={isStreaming && chatMode === 'roundtable' && currentRoundtableData.rounds.length === 0} isLive={isStreaming && chatMode === 'roundtable'} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default SuperAgentChat;
