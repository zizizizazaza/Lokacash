/**
 * SuperAgentChat — Chat Detail Page
 * Clean chat interface similar to Surf style, with multi-agent thinking process
 */
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import * as d3 from 'd3';
import { socket } from '../services/socket';
import { api } from '../services/api';
import { renderMarkdownContent, extractQuoteSnapshot, QuoteCard, TokenCard, type TokenSnapshotData, extractHeadings, SourcesProvider } from '../utils/markdown';
import { stripInternalResearchCitations } from '../utils/researchCitations';
import { IFlytekStreamer } from '../services/iflytek';
import { I } from './Icons';
import PlanUpgradeEntry from './PlanUpgradeEntry';
import ShareChatButton from './chat/ShareChatButton';
import ImageLightbox from './chat/ImageLightbox';
import ImageCapToast from './chat/ImageCapToast';
import WebFetchPills, { type WebFetchEntry } from './chat/WebFetchPills';
import HighlightedTextarea from './chat/HighlightedTextarea';
import ModeSelector from './chat/ModeSelector';
import type { RoundtableQuota, FastQuota } from './chat/ModeSelector';
import { RoundtableWorkbench, KnowledgeGraphView, buildKnowledgeGraph } from './chat/RoundtableWorkbench';
import { Web3ToolResultCard, Web3ToolCallPills, Web3ToolPill, SearchSourcesCard } from './chat/Web3ToolRenderers';

// ── Phase-1 refactor: shared types / constants / helpers extracted to ./chat/* ──
import type {
    Message,
    SearchSource,
    DataProvider,
    SearchSubSection,
    SearchModuleData,
    AnalysisStage,
    AnalysisModuleData,
    SimPanelist,
    SimulationModuleData,
    ConsensusModuleData,
    RtDataCategory,
    RtAgentInference,
    RtRoundData,
    RtConsensusResult,
    Web3OkxSnapshot,
    Web3OkxNewsItem,
    Web3OkxSentiment,
    Web3OkxNewsBundle,
    Web3Stage,
    Web3ModuleData,
    ThinkingModule,
    ToolTraceItem,
    ThinkingFlow,
    RoundtableAgentVote,
    ConsensusRound,
    RoundtableData,
} from './chat/types';
export type { Web3Stage, ThinkingModule, ThinkingFlow } from './chat/types';
import {
    TOC_BOTTOM_RESERVE_PX,
    TOC_MIN_VIEWPORT_PX,
    TOC_STICKY_TOP_PX,
    SA_SID_KEY,
    SA_PENDING_KEY,
    SOCIAL_DOMAINS,
    ROUNDTABLE_AGENTS,
} from './chat/constants';
import {
    SUMMON_POOL,
    SYSTEM_AGENT_IDS,
    DEFAULT_SUMMON_IDS,
    getAnalystDisplayName,
    parsePersonaVerdict,
    parsePersonaReasoning,
    AGENT_COLORS,
} from './chat/persona';
export { SUMMON_POOL } from './chat/persona';
import {
    AVATAR_MAP,
    getAgentAvatar,
    prettyAgentName,
    AgentAvatarImg,
} from './chat/avatar';
export { AVATAR_MAP, AgentAvatarImg } from './chat/avatar';
import { summarizeTitle } from './chat/summarize';
import {
    CANNED_THINKING_MESSAGES,
    TOOL_SOURCE_DOMAINS,
} from './chat/canned-messages';
import {
    mergeSearchSources,
    collectThinkingSearchSources,
} from './chat/source-utils';
import {
    confidenceToPercent,
    buildTraceFromSteps,
    extractPlanningMessage,
} from './chat/trace';
import {
    reconstructRtFromMetadata,
    buildDemoRtFields,
    deriveRtDataSearchFromModules,
    reconstructRtFieldsFromConsensus,
    buildRoundtableFromConsensus,
} from './chat/rtReconstruct';
import { HtmlReportFrame } from './chat/HtmlReportFrame';
import {
    ChatChevron,
    StatusIcon,
    PlatformLogo,
    SourceFavicon,
    SourceCard,
    okxFmtUsdCompact,
    okxFmtPctSigned,
    okxSummarizeWindow,
    fmtTs,
} from './chat/ui-primitives';
export { fmtTs } from './chat/ui-primitives';
import { PlanPipeline, PlanCardBoundary } from './chat/PlanPipeline';
import { SummonCharactersView } from './chat/SummonCharactersView';
import { ThinkingInlineTrigger } from './chat/ThinkingInlineTrigger';

function saLog(...args: unknown[]) {
    console.log('[SuperAgentChat]', ...args);
}

const InputIcons = {
    Attach: () => <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>,
    Mic: () => <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>,
    Image: () => <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
};




// ─── Knowledge Graph Types ──────────────────────────────────
// ─── KnowledgeGraphView Component ──────────────────────────
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



// ─── RoundtableWorkbench ─────────────────────────────────────────
// Unified workbench card (replaces RoundtableGraphInline):
//   left column  = rich agent roster (avatar + name + role + bio + tags)
//   right column = tabs (Graph | Debate) — no redundant top bar

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

    // ── Web3 Module Renderer (ReAct sub-stages) ──
    // Renders the live timeline of CoinGecko tool calls so the user can see
    // the agent working during the ~25s web3 ReAct window. Each sub-stage
    // shows a title, status, duration, and a one-line summary of the result.
    // After streaming starts the inline cards in the chat thread collapse
    // — the rich per-tool cards then live HERE in the Process panel, expanded
    // beneath each stage.
    const Web3Module: React.FC<{ mod: ThinkingModule }> = ({ mod }) => {
        const d = mod.data as Web3ModuleData | undefined;
        const stages = d?.stages;
        if (!stages || stages.length === 0) return null;
        // Process-panel labels are kept English-only by product decision —
        // matches the rest of the panel ("Searching", "Analyzing", "Done").
        return (
            <div>
                <div className="flex items-center gap-2.5 mb-3">
                    <StatusIcon status={mod.status} />
                    <span className="text-[14px] font-bold text-gray-900">Crypto Research</span>
                </div>
                <div className="ml-7 space-y-2 mb-3">
                    {stages.map((s) => {
                        const title = s.title_en;
                        const dotColor =
                            s.state === 'completed' ? 'bg-emerald-500'
                            : s.state === 'failed'   ? 'bg-rose-500'
                            : s.state === 'skipped'  ? 'bg-gray-300'
                            : 'bg-blue-500 animate-pulse';
                        const textColor =
                            s.state === 'completed' ? 'text-gray-700'
                            : s.state === 'failed'   ? 'text-rose-600'
                            : s.state === 'skipped'  ? 'text-gray-400'
                            : 'text-blue-600';
                        const durSec = typeof s.durationMs === 'number' ? (s.durationMs / 1000).toFixed(1) : null;
                        return (
                            <div key={s.stage} className={`rounded-xl border px-3 py-2 transition-all ${
                                s.state === 'active'    ? 'border-blue-100 bg-blue-50/30'
                                : s.state === 'failed'  ? 'border-rose-100 bg-rose-50/30'
                                : s.state === 'skipped' ? 'border-gray-100 bg-gray-50/30'
                                : 'border-gray-100 bg-gray-50/50'
                            }`}>
                                <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                                    <span className={`text-[12px] font-semibold flex-1 ${textColor}`}>{title}</span>
                                    {durSec && (
                                        <span className="text-[10px] text-gray-400 tabular-nums">{durSec}s</span>
                                    )}
                                </div>
                                {(s.summary || s.error) && (
                                    <div className={`mt-1 ml-3.5 text-[11px] tabular-nums ${
                                        s.state === 'failed' ? 'text-rose-500' : 'text-gray-500'
                                    }`}>
                                        {s.error || s.summary}
                                    </div>
                                )}
                                {/* Rich card unfurls under the completed stage —
                                    same component the inline-thread version
                                    used. Skipped while still loading or failed. */}
                                {s.state === 'completed' && s.rawData != null && (
                                    <div className="mt-2 ml-3.5">
                                        <Web3ToolResultCard toolName={s.stage} rawData={s.rawData} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
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
            if (mod.type === 'simulation') continue; // Simulation module hidden
            if (mod.type === 'done' && mod.status !== 'completed') continue;
            switch (mod.type) {
                case 'web3':
                    mods.push({ key: 'web3', element: <Web3Module mod={mod} /> });
                    break;
                case 'analysis':
                    mods.push({ key: 'analysis', element: <AnalysisModule mod={mod} /> });
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
        <div className="flex flex-col h-full">
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
    /** When true, the Roundtable summon flow auto-confirms after the selecting
     *  phase reveals, producing a hands-free "live demo" run from the home banner. */
    autoStartRoundtable?: boolean;
    /** When the chat starts from a Web3 trending-card click, the home page hands
     *  us the asset context so the backend orchestrator can skip the
     *  is-this-a-stock LLM guess (e.g. BLEND token vs Blend Labs Inc.). Only
     *  applied to the very first user turn.
     *
     *  Optional fields piggyback on the same hand-off so the chat can:
     *    - hand `coingeckoId` to backend so its web3 agent skips search_crypto_asset
     *    - render an instant placeholder TokenCard from `priceUsd`/`change24hPct`/
     *      `imageUrl`/`sparkline` while the web3 agent is still running
     *  All fields are optional — only `sym/name/kind` are required for routing. */
    initialAssetHint?: {
        sym: string;
        name: string;
        kind: 'crypto';
        coingeckoId?: string;
        priceUsd?: number;
        change24hPct?: number;
        imageUrl?: string;
        sparkline?: number[];
    };
    /** Active domain on the home page (Stocks / Web3 toggle). Forwarded to
     *  the backend on every `agent:chat` emit so routing can skip the LLM
     *  "is this a stock or crypto?" guess and trust the user's explicit
     *  page selection instead. Undefined when this chat was opened directly
     *  from a session URL (history restore) without a home-page context. */
    initialDomain?: 'stocks' | 'web3';
    /** Demo replay mode: when set, load `/demo/${id}.json`, hydrate state
     *  directly, and skip ALL backend interactions (no socket.emit, no
     *  history fetch, no replay buffer pull). Drives the "Roundtable Live
     *  Demo" button on the home page so new users can see a finished
     *  Roundtable render instantly without burning quota or waiting for
     *  real LLMs. The fixture id maps to a JSON file under public/demo/. */
    demoFixture?: string;
    /** Images (data URLs) the user pasted on the home screen before
     *  navigating into chat. Attached to the very first user turn alongside
     *  `initialMessage` so the vision model sees them on the kickoff send. */
    initialImages?: string[];
}

/** Shape of a demo fixture under public/demo/{id}.json. Mirrors a subset
 *  of ThinkingFlow + the user/assistant message pair so SuperAgentChat
 *  can hydrate state directly without going through the socket. */
interface DemoFixture {
    id: string;
    title?: string;
    recordedAt?: string;
    domain?: 'stocks' | 'web3';
    mode?: 'auto' | 'fast' | 'roundtable';
    userQuestion: string;
    userTimestamp?: string;
    assistantTimestamp?: string;
    assistantContent: string;
    htmlReport?: string;
    sources?: SearchSource[];
    thinkingFlow: ThinkingFlow;
    /** Optional TokenSnapshotData for crypto demos. */
    tokenCard?: TokenSnapshotData;
    /** Optional QuoteCard for stock demos. */
    quoteCard?: any;
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

const SuperAgentChat: React.FC<SuperAgentChatProps> = ({ initialMessage, onBack, agentCount = 2, selectedAgentId, initialSessionId, initialChatMode, autoStartRoundtable, initialAssetHint, initialDomain, demoFixture, initialImages }) => {
    const navigate = useNavigate();
    const { ready: privyReady, authenticated: privyAuthenticated } = usePrivy();
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
    // Skeleton state: true while we're fetching history for an existing session
    // and have nothing to show yet. Initialized true only when we have a session
    // id but no in-flight stream populated `messages`. Avoids flashing skeleton
    // for fresh chats or stream-resume scenarios.
    const [isLoadingHistory, setIsLoadingHistory] = useState(() => {
        if (!initialSessionId) return false;
        try {
            const raw = sessionStorage.getItem(SA_PENDING_KEY);
            if (raw) {
                const p = JSON.parse(raw) as { streaming?: boolean; sessionId?: string };
                if (p?.streaming && p.sessionId === initialSessionId) return false;
            }
        } catch { /* ignore */ }
        return true;
    });

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
    // Holds the replay payload when it arrives BEFORE the history-fetch
    // placeholder exists. Without this, the silent `if (c[msgIdx])` guard in
    // setMessages drops the buffered content and the user's mid-stream
    // navigation results in lost paragraphs. History fetch reads this ref to
    // pre-fill its newly-created assistant placeholder.
    const pendingReplayPayloadRef = useRef<{
        msgIdx: number;
        report: string;
        isRunning: boolean;
    } | null>(null);
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
    // Bumps whenever an auto-confirm (Live Demo) is requested; a downstream
    // effect fires handleSummonConfirm with the latest closure.
    const [autoConfirmTick, setAutoConfirmTick] = useState(0);
    const [pendingRtText, setPendingRtText] = useState<string | null>(null);
    const summonBypassRef = useRef(false);
    const rtDemoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    useEffect(() => {
        return () => { rtDemoTimersRef.current.forEach(clearTimeout); rtDemoTimersRef.current = []; };
    }, []);
    const [chatMode, setChatMode] = useState<'auto' | 'fast' | 'roundtable'>(() => initialChatMode ?? 'auto');
    const [roundtableQuota, setRoundtableQuota] = useState<RoundtableQuota | null>(null);
    const [fastQuota, setFastQuota] = useState<FastQuota | null>(null);
    const [htmlReports, setHtmlReports] = useState<Record<number, string>>({});
    const [htmlGenerating, setHtmlGenerating] = useState<Record<number, boolean>>({});
    const [msgViewMode, setMsgViewMode] = useState<Record<number, 'docs' | 'web'>>({});
    const [chatSelectedAgent, setChatSelectedAgent] = useState<string | null>(selectedAgentId || null);
    const [agentPickerOpen, setAgentPickerOpen] = useState(false);
    const agentPickerRef = useRef<HTMLDivElement>(null);
    const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
    const voiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [chatPastedImages, setChatPastedImages] = useState<string[]>(() => initialImages || []);
    const [chatLightboxSrc, setChatLightboxSrc] = useState<string | null>(null);
    const [imageCapToast, setImageCapToast] = useState<string | null>(null);
    const chatFileRef = useRef<HTMLInputElement>(null);

    /** Backend caps multimodal turns at 4 images (server/socket/index.ts
     *  normalizeIncomingImages). Enforce client-side too so the user gets
     *  immediate feedback instead of having extras silently dropped. */
    const MAX_IMAGES = 4;

    const handleChatPaste = (e: React.ClipboardEvent) => {
        const items = Array.from(e.clipboardData.items);
        const imageItems = items.filter(it => it.type.startsWith('image/'));
        if (!imageItems.length) return;
        e.preventDefault();
        let dropped = 0;
        imageItems.forEach(item => {
            const file = item.getAsFile();
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                if (!ev.target?.result) return;
                setChatPastedImages(prev => {
                    if (prev.length >= MAX_IMAGES) {
                        dropped += 1;
                        return prev;
                    }
                    return [...prev, ev.target!.result as string];
                });
                // Defer the toast so it fires after the state update batch.
                if (dropped > 0) {
                    setImageCapToast(`Up to ${MAX_IMAGES} images per message.`);
                }
            };
            reader.readAsDataURL(file);
        });
    };

    const handleChatFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        let dropped = 0;
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = ev => {
                if (!ev.target?.result) return;
                setChatPastedImages(prev => {
                    if (prev.length >= MAX_IMAGES) {
                        dropped += 1;
                        return prev;
                    }
                    return [...prev, ev.target!.result as string];
                });
                if (dropped > 0) {
                    setImageCapToast(`Up to ${MAX_IMAGES} images per message.`);
                }
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

    // Fetch Fast / Roundtable usage quotas so the mode selector can show
    // remaining counts (matches SuperAgentHome behavior — same picker, same badges).
    // Wait for Privy to resolve before deciding. Without this, the cold-load
    // path runs once with `api.isAuthenticated === false` (token not yet
    // injected) and never retries — quota badges stay empty even after login.
    useEffect(() => {
        if (!privyReady) return;
        if (!privyAuthenticated) {
            setRoundtableQuota(null);
            setFastQuota(null);
            return;
        }
        let cancelled = false;
        api.getQuota()
            .then(q => {
                if (cancelled) return;
                setRoundtableQuota({ used: q.roundtable.used, limit: q.roundtable.limit });
                if (q.fast) setFastQuota({ used: q.fast.used, limit: q.fast.limit });
            })
            .catch(() => {
                if (cancelled) return;
                setRoundtableQuota({ used: 1, limit: 3 });
                setFastQuota({ used: 4, limit: 20 });
            });
        return () => { cancelled = true; };
    }, [privyReady, privyAuthenticated]);

    useEffect(() => {
        if (!agentPickerOpen) return;
        const h = (e: MouseEvent) => { if (agentPickerRef.current && !agentPickerRef.current.contains(e.target as Node)) setAgentPickerOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [agentPickerOpen]);

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
    // Token snapshot cards keyed by message index (live CoinGecko data injected via agent:chat:token)
    const [tokenCards, setTokenCards] = useState<Record<number, TokenSnapshotData>>({});
    /** Auto-fetched URL pills, keyed by the assistant message index they
     *  belong to. Populated from `agent:chat:webfetch` events emitted by
     *  the backend's webFetch pre-step (see services/webFetch). */
    const [webFetchEntries, setWebFetchEntries] = useState<Record<number, WebFetchEntry[]>>({});
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
    const showToc = tocHeadings.length >= 3 && !tocMsgInWebMode;

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

            // Determine which assistant message's TOC to show.
            //
            // Each conversation turn is [user message, assistant message]. The
            // turn visually begins at the user bubble, not at the assistant
            // answer's first heading — so we anchor off the USER message
            // wrapper (the msg at idx-1) rather than the answer's first H2.
            // This makes the TOC switch as soon as the next user question
            // scrolls to the top, instead of waiting for the answer body's
            // first heading (which can be hundreds of pixels down past the
            // price card / Docs-Web tabs / opening paragraphs).
            //
            // Falls back to the assistant wrapper itself if the preceding
            // message isn't a user turn (e.g. the very first message).
            let bestIdx = tocIndices[0];
            for (const idx of tocIndices) {
                const anchorIdx = idx - 1 >= 0 && messages[idx - 1]?.role === 'user' ? idx - 1 : idx;
                const anchorEl = document.getElementById(`msg-wrap-${anchorIdx}`);
                if (anchorEl) {
                    const top = anchorEl.getBoundingClientRect().top - containerRect.top;
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

    // ── Scroll-to-bottom floating button ──
    // Shown only when the user has scrolled meaningfully above the latest
    // message (> ~1 viewport's worth). Click does a smooth scroll to the
    // messages-end anchor. Matches the standard chat-app pattern.
    const [showScrollToBottom, setShowScrollToBottom] = useState(false);
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        let rafId = 0;
        const check = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            const distFromBottom = scrollHeight - scrollTop - clientHeight;
            // 240px ≈ roughly one answer-card's worth; below that we treat as
            // "near the bottom" and hide the button to avoid visual clutter.
            setShowScrollToBottom(distFromBottom > 240);
        };
        const onScroll = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(check);
        };
        container.addEventListener('scroll', onScroll, { passive: true });
        check();
        // Also re-evaluate on content size changes (streaming tokens, images,
        // quote cards) so the button appears/disappears without needing a
        // manual scroll to trigger it.
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScroll) : null;
        if (ro && container.firstElementChild instanceof HTMLElement) ro.observe(container.firstElementChild);
        return () => {
            cancelAnimationFrame(rafId);
            container.removeEventListener('scroll', onScroll);
            ro?.disconnect();
        };
    }, [messages.length]);

    const handleScrollToBottom = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }, []);

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
                // Prefer server content as the source of truth on stream_done.
                // The server may post-process the streamed text (e.g. substitute
                // canonical tables that the LLM wasn't trusted to author —
                // see EXPERT_TABLE_PLACEHOLDER on the backend). Falling back to
                // streamed content keeps reconnect / partial-stream cases working.
                const streamed = updated[msgIdx].content || '';
                const server = data.content || '';
                const finalContent = server || streamed;
                updated[msgIdx] = {
                    ...updated[msgIdx],
                    content: finalContent,
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
            // Refresh quota counts after a successful turn so the ModeSelector
            // badges ("18 left" / "1 left") decrement immediately. The Privy
            // mount-time fetch is one-shot and won't see usage changes from
            // chats sent later in the same session. Best-effort: keep stale
            // counts if the refetch fails.
            if (privyAuthenticated) {
                api.getQuota()
                    .then((q) => {
                        setRoundtableQuota({ used: q.roundtable.used, limit: q.roundtable.limit });
                        if (q.fast) setFastQuota({ used: q.fast.used, limit: q.fast.limit });
                    })
                    .catch(() => { /* keep last good values */ });
            }
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
            // Quota may have been consumed before the error fired (the backend
            // charges as soon as the run is routed to fast/roundtable). Refetch
            // so the badge reflects reality even on a failed turn.
            if (privyAuthenticated) {
                api.getQuota()
                    .then((q) => {
                        setRoundtableQuota({ used: q.roundtable.used, limit: q.roundtable.limit });
                        if (q.fast) setFastQuota({ used: q.fast.used, limit: q.fast.limit });
                    })
                    .catch(() => { /* keep last good values */ });
            }
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
            const reached = result?.consensus?.consensusReached !== false;

            // Derive each persona's conclusion verdict/confidence from its raw answer.
            const conclusions = resp.map((r) => ({
                agentName: getAnalystDisplayName(r.agentId),
                verdict: parsePersonaVerdict(r.answer),
                confidence: Math.round((r.confidence || 0) * 100),
            }));

            // ── Final confidence (live-emit path) ────────────────────────
            // aegean's `consensus.confidence` is sometimes 0 the moment the
            // committee finishes — the structured consensus metric hasn't
            // been finalized yet. The DB-restore path falls back to 0.5
            // (50%), which is why switching tabs makes the value "appear
            // correct" even though both are guesses. Prefer a real value:
            //   1. Use aegean's confidence if it's a sensible non-zero pct.
            //   2. Otherwise mean of per-agent confidences (match what the
            //      canonical expert table on the backend uses).
            //   3. Last-resort 50%.
            let finalConfidencePct = Math.round(((result?.consensus?.confidence as number) || 0) * 100);
            if (finalConfidencePct <= 0 && conclusions.length > 0) {
                const sum = conclusions.reduce((s, c) => s + (c.confidence || 0), 0);
                finalConfidencePct = Math.round(sum / conclusions.length);
            }
            if (finalConfidencePct <= 0) finalConfidencePct = 50;

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

        const onToken = (data: { sessionId: string; token: TokenSnapshotData }) => {
            if (data.sessionId !== sessionId) return;
            const msgIdx = activeMsgIdxRef.current;
            if (msgIdx < 0 || !data.token?.id) return;
            setTokenCards(prev => {
                const replacing = prev[msgIdx];
                saLog('TokenCard upgraded (placeholder → full)', {
                    msgIdx,
                    placeholderHadPrice: typeof replacing?.market?.priceUsd === 'number',
                    fullId: data.token.id,
                    fullSym: data.token.symbol,
                });
                return { ...prev, [msgIdx]: data.token };
            });
        };

        const onHtmlReady = (data: { sessionId: string; msgIdx: number; html: string }) => {
            if (data.sessionId !== sessionId) return;
            setHtmlGenerating(prev => { const n = { ...prev }; delete n[data.msgIdx]; return n; });
            setHtmlReports(prev => ({ ...prev, [data.msgIdx]: data.html }));
            // Note: we deliberately do NOT auto-switch the view mode to 'web' here.
            // Auto-jumping the user from the markdown answer they're reading into
            // the HTML report card is jarring and loses their place. The default
            // is 'docs', and the Docs/Web toggle in the actions bar lets the user
            // opt in when they want the Bloomberg-style HTML view.
        };

        const onHtmlGenerating = (data: { sessionId: string; msgIdx: number }) => {
            if (data.sessionId !== sessionId) return;
            setHtmlGenerating(prev => ({ ...prev, [data.msgIdx]: true }));
        };

        const onWebFetch = (data: {
            sessionId: string;
            phase: 'start' | 'page' | 'done';
            urls?: string[];
            url?: string;
            ok?: boolean;
            title?: string;
            domain?: string;
            provider?: 'jina' | 'tavily' | 'cache';
            durationMs?: number;
            truncated?: boolean;
            code?: string;
            message?: string;
        }) => {
            if (data.sessionId !== sessionId) return;
            // Always attach to the in-flight assistant message slot. If for
            // some reason the active idx is unknown, fall back to the last
            // index so the pills still surface somewhere visible.
            const idx = activeMsgIdxRef.current >= 0
                ? activeMsgIdxRef.current
                : Math.max(0, messages.length - 1);

            setWebFetchEntries(prev => {
                const list = [...(prev[idx] || [])];
                if (data.phase === 'start' && Array.isArray(data.urls)) {
                    for (const url of data.urls) {
                        if (!list.find(e => e.url === url)) {
                            const domain = (() => {
                                try { return new URL(url).hostname; } catch { return url; }
                            })();
                            list.push({ url, domain, state: 'fetching' });
                        }
                    }
                } else if (data.phase === 'page' && data.url) {
                    const existing = list.findIndex(e => e.url === data.url);
                    const next: WebFetchEntry = {
                        url: data.url,
                        domain: data.domain || data.url,
                        state: data.ok ? 'ok' : 'error',
                        title: data.title,
                        provider: data.provider,
                        durationMs: data.durationMs,
                        truncated: data.truncated,
                        code: data.code,
                        message: data.message,
                    };
                    if (existing >= 0) list[existing] = next;
                    else list.push(next);
                }
                return { ...prev, [idx]: list };
            });
        };

        socket.on('agent:chat:webfetch', onWebFetch);
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
        socket.on('agent:chat:token', onToken);
        socket.on('agent:chat:html_ready', onHtmlReady);
        socket.on('agent:chat:html_generating', onHtmlGenerating);
        // New Roundtable persona events (log-only in Stage 4)
        socket.on('agent:chat:analysts_selected', onAnalystsSelected);
        socket.on('agent:chat:agent_responded', onAgentResponded);
        socket.on('agent:chat:round_started', onRoundStarted);
        socket.on('agent:chat:round_completed', onRoundCompleted);

        return () => {
            socket.off('agent:chat:webfetch', onWebFetch);
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
            socket.off('agent:chat:token', onToken);
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
                    /** Actual post-routing mode. Auto can resolve to 'roundtable'/'fast'/'simple';
                     *  this drives the panel's roundtable-only UI on replay. */
                    routedMode?: string;
                    report?: string;
                    status?: string;
                    tokenCard?: TokenSnapshotData;
                    /** Roundtable agent-debate event stream — applied in order to
                     *  rebuild rtRounds + rtConsensus on the Workbench. */
                    rtEvents?: Array<{ type: string; payload: any }>;
                }) => {
                    saLog('replay ack', { ok: res?.ok, stepsLen: Array.isArray(res?.steps) ? res.steps.length : 0, modulesLen: Array.isArray(res?.modules) ? res.modules.length : 0, mode: res?.mode, routedMode: res?.routedMode, isRunning: res?.isRunning, status: res?.status });
                    // Determine the effective routed mode. `routedMode` (post-Auto-routing
                    // actual tier) wins over `mode` (originally requested), so an Auto
                    // → roundtable session correctly restores the roundtable UI.
                    const effectiveRoutedMode = res?.routedMode || res?.mode;
                    // Restore roundtable chatMode so the right-side panel picks the correct variant
                    // when a client returns mid-stream to a roundtable session.
                    if (effectiveRoutedMode === 'roundtable' && chatMode !== 'roundtable') {
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
                                    route: effectiveRoutedMode === 'roundtable' ? 'Roundtable' : 'Investment Analyst',
                                }),
                                ...(hasModules ? { modules: rebuiltModules } : {}),
                                ...(trace !== undefined ? { toolTrace: trace } : {}),
                                ...(planning !== undefined ? { planningMessage: planning } : {}),
                                // routedMode drives the 5-stage pipeline + Workbench UI.
                                // Use `effectiveRoutedMode` so Auto-resolved-to-roundtable
                                // sessions restore the proper UI.
                                ...(effectiveRoutedMode ? { routedMode: effectiveRoutedMode } : {}),
                                // Workbench gate (5647): renders when rtPreparationStatus
                                // is 'done' OR rtRounds/rtDataSearch is non-empty. Live
                                // mode sets this in handleSummonConfirm immediately, so
                                // we mirror that on replay too — otherwise mid-stream
                                // session switches (when no agent_responded has fired
                                // yet) hide the Workbench until consensus_done lands,
                                // even though the live experience showed it the whole time.
                                ...(effectiveRoutedMode === 'roundtable' ? { rtPreparationStatus: 'done' as const } : {}),
                                isActive: !!res.isRunning,
                            },
                        }));
                        // Restore TokenCard from buffer if the user navigated away after
                        // web3 finished but before the page-level history fetch had a
                        // persisted metadata.tokenCard to draw from.
                        if (res.tokenCard && (res.tokenCard as any).id) {
                            setTokenCards(prev => ({ ...prev, [msgIdx]: res.tokenCard as TokenSnapshotData }));
                        }

                        // ── Replay roundtable agent-debate events ──
                        // Rebuild Workbench state (selectedAgentIds, rtRounds,
                        // rtConsensus, rtPreparationStatus) by folding the buffered
                        // event stream in order. This mirrors the live socket
                        // handlers (onAnalystsSelected / onRoundStarted / etc.) so
                        // a session-switch mid-roundtable shows the EXACT same
                        // panel state it would if the user had stayed connected.
                        if (Array.isArray(res.rtEvents) && res.rtEvents.length > 0) {
                            let selectedAgentIds: string[] | undefined;
                            let rtRounds: RtRoundData[] = [];
                            let rtConsensus: RtConsensusResult | undefined;
                            let rtReportStatus: 'pending' | 'active' | 'done' | undefined;

                            for (const ev of res.rtEvents) {
                                if (ev.type === 'analysts_selected') {
                                    const analysts = ev.payload?.analysts;
                                    if (Array.isArray(analysts)) {
                                        selectedAgentIds = analysts.map((a: any) => a.id);
                                    }
                                } else if (ev.type === 'round_started') {
                                    const r = Number(ev.payload?.round);
                                    if (Number.isFinite(r)) {
                                        const idx = rtRounds.findIndex(x => x.round === r);
                                        if (idx === -1) {
                                            rtRounds.push({ round: r, status: 'active', agents: [] });
                                        } else {
                                            rtRounds[idx] = { ...rtRounds[idx], status: 'active' };
                                        }
                                    }
                                } else if (ev.type === 'round_completed') {
                                    const r = Number(ev.payload?.round);
                                    const idx = rtRounds.findIndex(x => x.round === r);
                                    if (idx !== -1) {
                                        rtRounds[idx] = {
                                            ...rtRounds[idx],
                                            status: 'done',
                                            agents: rtRounds[idx].agents.map(a => ({ ...a, status: 'done' })),
                                        };
                                    }
                                } else if (ev.type === 'agent_responded') {
                                    const { analystId, round, confidence, answer } = ev.payload || {};
                                    if (typeof analystId === 'string' && Number.isFinite(round)) {
                                        const verdict = parsePersonaVerdict(answer || '');
                                        const reasoning = parsePersonaReasoning(answer || '');
                                        const confPct = Math.round((confidence || 0) * 100);
                                        const newAgent: RtAgentInference = {
                                            agentId: analystId,
                                            agentName: getAnalystDisplayName(analystId),
                                            status: 'done',
                                            verdict,
                                            confidence: confPct,
                                            reasoning,
                                        };
                                        const idx = rtRounds.findIndex(x => x.round === round);
                                        if (idx === -1) {
                                            rtRounds.push({ round, status: 'active', agents: [newAgent] });
                                        } else {
                                            const agents = [...rtRounds[idx].agents];
                                            const pos = agents.findIndex(a => a.agentId === analystId);
                                            if (pos === -1) agents.push(newAgent);
                                            else agents[pos] = { ...agents[pos], ...newAgent };
                                            rtRounds[idx] = { ...rtRounds[idx], agents };
                                        }
                                    }
                                } else if (ev.type === 'consensus_done') {
                                    const result = ev.payload?.result || {};
                                    const resp: Array<{ agentId: string; answer: string; confidence: number }> =
                                        result?.consensus?.agentResponses || [];
                                    const reached = result?.consensus?.consensusReached !== false;
                                    const conclusions = resp.map((r) => ({
                                        agentName: getAnalystDisplayName(r.agentId),
                                        verdict: parsePersonaVerdict(r.answer || ''),
                                        confidence: Math.round((r.confidence || 0) * 100),
                                    }));
                                    let finalConfidencePct = Math.round(((result?.consensus?.confidence as number) || 0) * 100);
                                    if (finalConfidencePct <= 0 && conclusions.length > 0) {
                                        const sum = conclusions.reduce((s, c) => s + (c.confidence || 0), 0);
                                        finalConfidencePct = Math.round(sum / conclusions.length);
                                    }
                                    if (finalConfidencePct <= 0) finalConfidencePct = 50;
                                    const tally: Record<string, number> = { Bullish: 0, Bearish: 0, Neutral: 0 };
                                    for (const c of conclusions) tally[c.verdict] = (tally[c.verdict] || 0) + 1;
                                    const finalVerdict =
                                        (Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] as string) || 'Neutral';
                                    const majorityCount = tally[finalVerdict] || 0;
                                    const conflictRate =
                                        conclusions.length > 0
                                            ? Math.round(((conclusions.length - majorityCount) / conclusions.length) * 100)
                                            : 0;
                                    rtConsensus = {
                                        status: 'done',
                                        hasConsensus: reached,
                                        conflictRate,
                                        agentConclusions: conclusions,
                                        finalVerdict,
                                        finalConfidence: finalConfidencePct,
                                    };
                                    rtReportStatus = 'active';
                                }
                            }

                            // Apply once.
                            setThinkingProcesses(prev => {
                                const existing = prev[msgIdx];
                                if (!existing) return prev;
                                return {
                                    ...prev,
                                    [msgIdx]: {
                                        ...existing,
                                        // Workbench renders when ANY of these is set,
                                        // so always seed rtPreparationStatus so the
                                        // panel becomes visible the moment replay
                                        // returns (even before round events arrive).
                                        rtPreparationStatus: 'done',
                                        ...(selectedAgentIds ? { selectedAgentIds } : {}),
                                        ...(rtRounds.length > 0 ? { rtRounds } : {}),
                                        ...(rtConsensus ? { rtConsensus } : {}),
                                        ...(rtReportStatus ? { rtReportStatus } : {}),
                                    },
                                };
                            });
                        }
                        if (res.report) {
                            // Stash the payload so a slow history fetch can still
                            // pick it up after the placeholder lands. Replay can
                            // arrive (~10ms socket roundtrip) before history fetch
                            // (~100-500ms HTTP); without this the silent
                            // `if (c[msgIdx])` guard below would drop the content.
                            pendingReplayPayloadRef.current = {
                                msgIdx,
                                report: res.report,
                                isRunning: !!res.isRunning,
                            };
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
                                        // CRITICAL: keep isStreaming=true while the server is
                                        // still running, otherwise onProgress / onStreamDone
                                        // both bail out via their `if (!isStreaming) return`
                                        // guards and the user sees a frozen partial message
                                        // until the html_ready fallback fires.
                                        isStreaming: !!res.isRunning,
                                        timestamp: new Date().toLocaleTimeString(),
                                    };
                                    // Applied successfully — clear the ref so a later
                                    // history fetch doesn't double-apply.
                                    pendingReplayPayloadRef.current = null;
                                }
                                return c;
                            });
                            if (!res.isRunning) setIsStreaming(false);
                            else setIsStreaming(true);
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
                            domain: initialDomain,
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

    const sendToAI = useCallback((text: string, existingMessages?: Message[], analystIds?: string[], assetHint?: SuperAgentChatProps['initialAssetHint'], imagesArg?: string[]) => {
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
        // Roundtable mode: panel stays closed by default; user can open it
        // from the thinking indicator on the assistant message.
        if (chatMode === 'roundtable') {
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
            // assetHint is only attached on the very first turn (the one started
            // from the Web3 trending card). Backend treats it as a hard override
            // for the LLM-based "is this crypto or stock?" guess. We only forward
            // the fields the backend actually uses; price/spark/icon stay
            // client-side for the placeholder TokenCard render.
            ...(assetHint ? {
                assetHint: {
                    sym: assetHint.sym,
                    name: assetHint.name,
                    kind: assetHint.kind,
                    ...(assetHint.coingeckoId ? { coingeckoId: assetHint.coingeckoId } : {}),
                },
            } : {}),
            // domain: explicit Stocks/Web3 page selection from the home screen.
            // Backend uses this to bypass the LLM "stock or crypto?" guess and
            // route deterministically — see socket/index.ts domain override.
            ...(initialDomain ? { domain: initialDomain } : {}),
            // Vision attachments — backend's normalizeIncomingImages expects
            // `{ url }[]`. The data: URL captured from clipboard/file is a
            // valid `url` value, so we send it as-is (capped at 4 server-side).
            ...(imagesArg && imagesArg.length > 0
                ? { images: imagesArg.slice(0, 4).map((url) => ({ url })) }
                : {}),
        });
        saLog('sendToAI emit agent:chat done (see [LokaSocket] for queued vs live)');

    }, [chatMode, sessionId, chatSelectedAgent, initialDomain]);

    // ─── Fetch History ──────────────────────────
    useEffect(() => {
        if (initialSessionId) {
            api.getChatHistory(undefined, undefined, initialSessionId).then(history => {
                setIsLoadingHistory(false);
                if (history && history.length > 0) {
                    const transformedHistory: Message[] = history.map(
                        (m: { role: string; content?: string; createdAt: string; metadata?: string | null }) => {
                            let sources: SearchSource[] | undefined;
                            // For user turns the backend persists `{ images: [{ url }] }`
                            // in metadata so the bubble can re-render the same
                            // attachment thumbnails after reload. Pull both in
                            // one parse so we don't double-decode.
                            let images: string[] | undefined;
                            if (m.metadata) {
                                try {
                                    const parsed = JSON.parse(m.metadata) as any;
                                    sources = parsed?.sources;
                                    if (m.role === 'user' && Array.isArray(parsed?.images)) {
                                        const urls = parsed.images
                                            .map((img: any) => (typeof img?.url === 'string' ? img.url : null))
                                            .filter(Boolean) as string[];
                                        if (urls.length) images = urls;
                                    }
                                } catch {}
                            }
                            return {
                                role: m.role as 'user' | 'assistant',
                                content: m.content || '',
                                timestamp: new Date(m.createdAt).toLocaleTimeString(),
                                isStreaming: false,
                                metadata: m.metadata ?? null,
                                sources,
                                ...(images ? { images } : {}),
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
                        // If replay already came back ahead of us with buffered
                        // content (typical on session-switch mid-stream), seed
                        // the placeholder with that content + the actual running
                        // state, so the user sees the prior paragraphs instantly
                        // and onProgress can continue appending.
                        // We match by "there IS a pending payload" rather than
                        // by exact msgIdx, since replay's default msgIdx is 1
                        // but multi-turn sessions may have the placeholder at
                        // a higher index. The just-created placeholder is
                        // always the last message in the array, so the index
                        // alignment is implicit.
                        const pending = pendingReplayPayloadRef.current;
                        const placeholderIdx = transformedHistory.length;
                        setMessages([
                            ...transformedHistory,
                            {
                                role: 'assistant',
                                content: pending ? pending.report : '',
                                timestamp: new Date().toLocaleTimeString(),
                                isStreaming: pending ? pending.isRunning : true,
                            },
                        ]);
                        if (pending) {
                            // Update activeMsgIdxRef so subsequent onProgress
                            // chunks land on the right message.
                            activeMsgIdxRef.current = placeholderIdx;
                            pendingReplayPayloadRef.current = null;
                            // Sync the top-level streaming flag so the input
                            // shows the "Waiting for reply" state while the
                            // server keeps pushing chunks.
                            setIsStreaming(pending.isRunning);
                        } else {
                            // No replay payload: still align activeMsgIdxRef
                            // so live onProgress can find the placeholder.
                            activeMsgIdxRef.current = placeholderIdx;
                        }
                    } else {
                        setMessages(transformedHistory);
                    }
                    const restoredThinking: Record<number, ThinkingFlow> = {};
                    const restoredConsensus: Record<number, any> = {};
                    const restoredQuotes: Record<number, any> = {};
                    const restoredTokens: Record<number, TokenSnapshotData> = {};
                    const restoredHtml: Record<number, string> = {};
                    const restoredViewModes: Record<number, 'docs' | 'web'> = {};
                    let hasRoundtableHistory = false;
                    history.forEach(
                        (m: { role: string; metadata?: string | null }, idx: number) => {
                            if (m.role !== 'assistant' || !m.metadata) return;
                            try {
                                const meta = JSON.parse(m.metadata) as { thinkingFlow?: ThinkingFlow; consensusResult?: any; quoteCard?: any; tokenCard?: TokenSnapshotData; htmlReport?: string; sources?: SearchSource[] };
                                if (meta.thinkingFlow && Array.isArray(meta.thinkingFlow.modules)) {
                                    const isRt = meta.thinkingFlow.routedMode === 'roundtable' || !!meta.consensusResult;
                                    if (isRt) {
                                        // Try to reconstruct REAL debate from metadata first.
                                        // Priority: liveDebateLog (full SSE capture) →
                                        // consensusResult.discussionRounds → agentResponses.
                                        // Only if all three are empty do we fall back to the
                                        // demo fixture — and even then we keep its shape only
                                        // as an empty-state placeholder.
                                        const real = reconstructRtFromMetadata(meta);
                                        if (real) {
                                            restoredThinking[idx] = {
                                                ...meta.thinkingFlow,
                                                isActive: false,
                                                routedMode: 'roundtable',
                                                selectedAgentIds: real.selectedAgentIds,
                                                rtPreparationStatus: 'done',
                                                rtRounds: real.rtRounds,
                                                rtConsensus: real.rtConsensus,
                                                rtReportStatus: 'done',
                                            };
                                        } else {
                                            // No real data — show the canonical 7-agent demo
                                            // shape so the Roundtable UI doesn't crash empty.
                                            restoredThinking[idx] = {
                                                ...meta.thinkingFlow,
                                                isActive: false,
                                                routedMode: 'roundtable',
                                                ...buildDemoRtFields(),
                                            };
                                        }
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
                                if (meta.tokenCard && meta.tokenCard.id) {
                                    restoredTokens[idx] = meta.tokenCard;
                                }
                                if (meta.htmlReport) {
                                    restoredHtml[idx] = meta.htmlReport;
                                    // Deliberately do NOT default the view mode to 'web' on history
                                    // restore. Older sessions persist `htmlReport` in metadata
                                    // regardless of which tab the user last looked at, and
                                    // auto-jumping every restored message into the HTML card hides
                                    // the markdown answer they actually came back to read. Default
                                    // is 'docs' (set by the useState initializer); they can opt
                                    // into the HTML view via the Docs/Web toggle when they want it.
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
                    if (Object.keys(restoredTokens).length > 0) {
                        setTokenCards(prev => ({ ...prev, ...restoredTokens }));
                    }
                    if (Object.keys(restoredHtml).length > 0) {
                        setHtmlReports(prev => ({ ...prev, ...restoredHtml }));
                        setMsgViewMode(prev => ({ ...prev, ...restoredViewModes }));
                    }
                    // If we appended a streaming placeholder, point activeMsgIdxRef at it
                    // so incoming socket chunks write into the placeholder, not the last user msg.
                    activeMsgIdxRef.current = streamStillActive ? transformedHistory.length : transformedHistory.length - 1;
                }
            }).catch((err) => {
                setIsLoadingHistory(false);
                console.error(err);
            });
        }
    }, [initialSessionId]);

    // ─── Push URL / Sync Session ID ────────────────────────
    useEffect(() => {
        // Demo mode: keep the ?demo=... URL the user came in on, don't
        // overwrite it with a fake sessionId.
        if (demoFixture) return;
        if (!initialSessionId && !window.location.search.includes('session=')) {
            window.history.replaceState(null, '', `/?session=${sessionId}`);
        }
    }, [sessionId, initialSessionId, demoFixture]);

    // ─── Demo fixture loader ───────────────────────────────
    // When `demoFixture` is set, fetch the static JSON under public/demo/
    // and hydrate state directly — no socket.emit, no history fetch, no
    // replay buffer pull. The fixture carries a finished user/assistant
    // exchange + complete ThinkingFlow (Roundtable rounds, consensus,
    // module summaries) so the chat thread renders the same way it would
    // after a real run that just completed.
    useEffect(() => {
        if (!demoFixture) return;
        if (hasSentInitial.current) return;
        hasSentInitial.current = true;
        saLog('demo: loading fixture', { fixture: demoFixture });
        const ac = new AbortController();
        (async () => {
            try {
                const r = await fetch(`/demo/${demoFixture}.json`, { signal: ac.signal });
                if (!r.ok) {
                    console.error(`[SuperAgentChat] demo fixture ${demoFixture} HTTP ${r.status}`);
                    return;
                }
                const fx = (await r.json()) as DemoFixture;
                // Hydrate user + assistant message pair.
                const userMsg: Message = {
                    role: 'user',
                    content: fx.userQuestion || '',
                    timestamp: fx.userTimestamp || new Date().toLocaleTimeString(),
                };
                const assistantMsg: Message = {
                    role: 'assistant',
                    content: fx.assistantContent || '',
                    timestamp: fx.assistantTimestamp || new Date().toLocaleTimeString(),
                    sources: fx.sources,
                };
                setMessages([userMsg, assistantMsg]);
                // The assistant slot is index 1.
                activeMsgIdxRef.current = 1;
                setActiveGraphMsgIdx(1);
                // Hydrate thinking flow so the right-side panel + the
                // Roundtable Workbench come up populated.
                setThinkingProcesses({ 1: fx.thinkingFlow });
                // Hydrate HTML report if present, but keep the view mode on
                // 'docs' (the markdown-rendered native chat surface). The user
                // can still toggle to 'web' via the Docs / Web tabs if they
                // want to see the polished HTML — but the default first-run
                // experience for the demo is the docs view, matching the look
                // a normal Roundtable result has when synthesis just finished.
                if (fx.htmlReport) {
                    setHtmlReports({ 1: fx.htmlReport });
                    setMsgViewMode({ 1: 'docs' });
                }
                // Hydrate token / quote cards if the fixture is a crypto demo.
                if (fx.tokenCard) setTokenCards({ 1: fx.tokenCard });
                if (fx.quoteCard) setQuoteCards({ 1: fx.quoteCard });
                // Sync routedMode + chatMode from fixture so PlanPipeline
                // and Workbench render the right variant.
                if (fx.mode === 'roundtable') setChatMode('roundtable');
                saLog('demo: fixture loaded', {
                    fixture: demoFixture,
                    rounds: fx.thinkingFlow?.rtRounds?.length ?? 0,
                    sources: fx.sources?.length ?? 0,
                });
            } catch (err: any) {
                if (err?.name === 'AbortError') return;
                console.error('[SuperAgentChat] demo fixture load failed:', err);
            }
        })();
        return () => ac.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [demoFixture]);

    // ─── Auto-send initial message ──────────────────────────
    useEffect(() => {
        // Demo mode: skip — the fixture loader above hydrated everything.
        if (demoFixture) { hasSentInitial.current = true; return; }
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

        const initialImgs = (initialImages || []).slice(0, 4);
        const userMsg: Message = {
            role: 'user',
            content: initialMessage,
            timestamp: new Date().toLocaleTimeString(),
            ...(initialImgs.length ? { images: initialImgs } : {}),
        };
        const initialMessages = [userMsg];
        setMessages(initialMessages);

        // Render an instant placeholder TokenCard from the trending-card snapshot
        // we already have client-side. The card sits at msgIdx=1 (the assistant
        // message slot we're about to create) and is overwritten the moment the
        // backend's `agent:chat:token` event fires with the full TokenSnapshot.
        // Without this, the user stares at a blank screen for ~35s while the
        // web3 ReAct loop runs through all 4 tools.
        if (initialAssetHint?.kind === 'crypto' && initialAssetHint.coingeckoId) {
            const placeholder: TokenSnapshotData = {
                id: initialAssetHint.coingeckoId,
                symbol: initialAssetHint.sym,
                name: initialAssetHint.name,
                imageUrl: initialAssetHint.imageUrl,
                market: {
                    priceUsd: initialAssetHint.priceUsd,
                    change24hPct: initialAssetHint.change24hPct,
                },
                community: {},
                developer: {},
            };
            setTokenCards(prev => ({ ...prev, 1: placeholder }));
            saLog('placeholder TokenCard rendered from assetHint', {
                id: initialAssetHint.coingeckoId,
                sym: initialAssetHint.sym,
                priceUsd: initialAssetHint.priceUsd,
                hasIcon: !!initialAssetHint.imageUrl,
            });
        }

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
            // Live Demo: pre-pick a few lenses and request auto-confirm so the
            // visitor sees the full Roundtable run without any clicks.
            if (autoStartRoundtable) {
                setTimeout(() => {
                    setSelectedSummonIds(new Set(['buffett_style', 'munger_style', 'lynch_style', 'sentiment_focus']));
                }, 3600);
                setTimeout(() => { setAutoConfirmTick(Date.now()); }, 4800);
            }
            return;
        }

        saLog('initial: schedule sendToAI in 50ms', { initialPreview: initialMessage.slice(0, 80), imageCount: initialImgs.length, ...socket.getDebugState() });
        setTimeout(() => {
            sendToAI(initialMessage, initialMessages, undefined, initialAssetHint, initialImgs.length ? initialImgs : undefined);
            // Clear the seeded preview strip — initialImages was a one-shot
            // hand-off from the home page, not a sticky attachment.
            if (initialImgs.length) setChatPastedImages([]);
            setTimeout(scrollUserMsgToTop, 150);
        }, 50);
        // `initialImages` is intentionally NOT in the dep array — it's a
        // one-shot hand-off captured on mount. Including it would re-fire
        // this effect when the home page clears its `pastedImages` state
        // (after `tryStartChat` runs), producing a duplicate `agent:chat`
        // emit that races with the first run AND drops the image. The
        // value is read inside the effect via the closure.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialMessage, sendToAI, initialSessionId, sessionId, chatSelectedAgent, scrollUserMsgToTop, chatMode, initialAssetHint]);

    // ─── Handle send ────────────────────────────────────────
    const handleSummonConfirm = useCallback(() => {
        const text = pendingRtText;
        if (!text) return;
        setSummonPhase('idle');
        setPendingRtText(null);
        summonBypassRef.current = true;
        // Process panel stays closed by default — users can open it from the
        // thinking indicator on the assistant message if they want the animation.
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

        // First-turn-only: forward initialAssetHint when the roundtable confirm
        // fires the very first sendToAI (messages still empty before the user
        // turn was appended). Subsequent roundtable turns must NOT carry the
        // stale hint.
        const isFirstTurn = (messages?.length ?? 0) === 0
            || (messages?.length === 1 && messages[0]?.role === 'user');
        sendToAI(text, messages, realAnalystIds, isFirstTurn ? initialAssetHint : undefined);
        setTimeout(scrollUserMsgToTop, 150);
    }, [pendingRtText, messages, sendToAI, scrollUserMsgToTop, selectedSummonIds, initialAssetHint]);

    // Live Demo: when autoConfirmTick bumps, fire the confirm with the latest
    // closure so the pre-selected lenses are picked up correctly.
    useEffect(() => {
        if (!autoConfirmTick) return;
        handleSummonConfirm();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoConfirmTick]);

    const handleSend = () => {
        if ((!inputText.trim() && chatPastedImages.length === 0) || isStreaming) return;
        const text = inputText.trim();
        const imgs = chatPastedImages.slice(0, 4);
        saLog('handleSend', { textPreview: text.slice(0, 80), imageCount: imgs.length, isStreaming, ...socket.getDebugState() });

        // Roundtable mode: intercept to show summon character selection inline
        if (chatMode === 'roundtable' && !summonBypassRef.current) {
            const userMsg: Message = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString(), ...(imgs.length ? { images: imgs } : {}) };
            setMessages(prev => [...prev, userMsg]);
            setInputText('');
            setChatPastedImages([]);
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
        const userMsg: Message = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString(), ...(imgs.length ? { images: imgs } : {}) };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInputText('');
        setChatPastedImages([]);
        sendToAI(text, newMessages, undefined, undefined, imgs.length ? imgs : undefined);
        // Scroll so the user’s question appears at the top
        setTimeout(scrollUserMsgToTop, 150);
    };

    /**
     * Dev-only fixture exporter. Reads the current chat state (the user/
     * assistant message pair, sources, ThinkingFlow, HTML report) and
     * downloads a JSON file shaped like a DemoFixture, ready to drop into
     * public/demo/<id>.json. Used once after a fresh real Roundtable run to
     * capture a high-quality replay; the Roundtable Live Demo button on
     * the home page then loads that file so visitors see the same render
     * instantly without burning quota.
     *
     * Visible only when `import.meta.env.DEV` is true (i.e. local dev), so
     * it never ships to production users. Lives next to handleStop so it
     * can grab a snapshot mid-stream too if you click before stream_done.
     */
    const handleExportDemoFixture = () => {
        const userMsg = messages.find((m) => m.role === 'user');
        // Prefer the last assistant message that actually has content.
        const assistantMsg = [...messages].reverse().find((m) => m.role === 'assistant' && m.content?.trim());
        const assistantIdx = assistantMsg ? messages.lastIndexOf(assistantMsg) : -1;
        const flow = assistantIdx >= 0 ? thinkingProcesses[assistantIdx] : undefined;
        const html = assistantIdx >= 0 ? htmlReports[assistantIdx] : undefined;
        const tokenCard = assistantIdx >= 0 ? tokenCards[assistantIdx] : undefined;
        const quoteCard = assistantIdx >= 0 ? quoteCards[assistantIdx] : undefined;

        const fixture = {
            $schema: 'loka-demo-fixture-v1',
            id: `roundtable-${(userMsg?.content || 'untitled').slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
            title: userMsg?.content?.slice(0, 60) || 'Untitled demo',
            recordedAt: new Date().toISOString().slice(0, 10),
            domain: initialDomain || 'stocks',
            mode: chatMode,
            userQuestion: userMsg?.content || '',
            userTimestamp: userMsg?.timestamp,
            assistantTimestamp: assistantMsg?.timestamp,
            assistantContent: assistantMsg?.content || '',
            htmlReport: html || '',
            sources: assistantMsg?.sources || [],
            thinkingFlow: flow || { modules: [], isActive: false },
            tokenCard,
            quoteCard,
        };
        const blob = new Blob([JSON.stringify(fixture, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fixture.id}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        saLog('demo: exported fixture', { id: fixture.id, sizeKb: Math.round(blob.size / 1024) });
    };

    // Dev-only: expose the exporter on `window` so the on-screen button
    // doesn't have to ship. To capture a new demo fixture during local dev:
    //   1. Run a real Roundtable session through to completion
    //   2. Open browser DevTools console
    //   3. Call: window.__lokaExportDemoFixture()
    //   4. JSON downloads → drop into public/demo/<id>.json
    // The branch is gated by import.meta.env.DEV so Vite tree-shakes it out
    // of production builds entirely (string + function both gone from the
    // shipped bundle).
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        (window as any).__lokaExportDemoFixture = handleExportDemoFixture;
        return () => {
            try { delete (window as any).__lokaExportDemoFixture; } catch { /* ignore */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, thinkingProcesses, htmlReports, tokenCards, quoteCards, chatMode, initialDomain]);

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
        // Clear the sidebar's spinner immediately. The backend will also emit
        // `agent:chat:cancelled` (which Sidebar also listens to), but doing
        // it here means the indicator clears even if the ack is delayed.
        if (sessionId) {
            try { window.dispatchEvent(new CustomEvent('session-done', { detail: { id: sessionId } })); } catch { /* ignore */ }
        }
    };

    return (
        <div className="flex h-full bg-white overflow-hidden">
            <ImageLightbox src={chatLightboxSrc} onClose={() => setChatLightboxSrc(null)} />
            <ImageCapToast message={imageCapToast} onDismiss={() => setImageCapToast(null)} />
            <style>{`
                @keyframes voice-bar { 0%,100%{height:3px} 50%{height:10px} }
                .voice-bar { min-height: 3px; display:inline-block; border-radius:9999px; background:#9ca3af; }
                @keyframes summon-float { 0% { opacity: 0; transform: translateY(30px) scale(0.6); } 50% { opacity: 0.7; transform: translateY(-6px) scale(1.04); } 70% { transform: translateY(3px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
                @keyframes summon-hover { 0%,100% { transform: translate(-50%,-50%) translateY(0); } 50% { transform: translate(-50%,-50%) translateY(-6px); } }
                @keyframes summon-text { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes summon-dot { 0%,80%,100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }
                @keyframes summon-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } 50% { box-shadow: 0 0 12px 2px rgba(34,197,94,0.25); } }

                /* Mode icon hover animations */
                @keyframes mode-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes mode-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }
                @keyframes mode-shake { 0%,100% { transform: translateX(0) rotate(0); } 25% { transform: translateX(-1px) rotate(-6deg); } 75% { transform: translateX(1px) rotate(6deg); } }
                .mode-icon-anim { display: inline-flex; transition: transform .2s ease; transform-origin: center; }
                .mode-icon-auto:hover .mode-icon-anim { animation: mode-pulse 1.1s ease-in-out infinite; }
                .mode-icon-fast:hover .mode-icon-anim { animation: mode-shake .45s ease-in-out infinite; }
                .mode-icon-roundtable:hover .mode-icon-anim { animation: mode-spin 2.4s linear infinite; }
            `}</style>

            {/* ══ Content Row — two independent full-height columns ══ */}
            <div className="flex flex-1 overflow-hidden">
                {/* Chat column */}
                <div className="relative flex flex-col flex-1 min-w-0 overflow-hidden">
                    {/* Chat column header (above chat content only) */}
                    <div className="flex items-center justify-between px-5 py-4 shrink-0">
                        <h1 className="text-[13px] font-semibold text-gray-800 truncate flex-1 min-w-0 mr-4">{chatTitle}</h1>
                        <div className="flex items-center gap-1 shrink-0">
                            <ShareChatButton
                                sessionId={demoFixture ? null : sessionId}
                                hasContent={!demoFixture && messages.some(m => m.role === 'assistant' && (m.content || '').trim().length > 0)}
                                staticShareUrl={demoFixture ? `${window.location.origin}/?demo=${encodeURIComponent(demoFixture)}` : undefined}
                                lang="en"
                            />
                            <PlanUpgradeEntry size="sm" hideIfMax />
                        </div>
                    </div>
                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-y-contain px-4 md:px-6 xl:px-8 py-8 pb-28">
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
                                                <p className="px-2 pb-2 text-[13px] font-bold text-gray-900 tracking-tight sticky top-0 bg-white/95 backdrop-blur-md z-10">Sections</p>
                                                <ul className="space-y-0.5">
                                                    {(() => {
                                                        // Filter and optimize TOC hierarchy:
                                                        // 1. If there's only one level-2 heading, promote its
                                                        //    level-3 children to top-level (avoid the "1 section
                                                        //    → everything under it" redundant tree).
                                                        // 2. Otherwise, collapse level-3 items when the level-2
                                                        //    parent has only 1 child.
                                                        const filtered = tocHeadings.filter(h => h.level >= 2);
                                                        const level2Count = filtered.filter(h => h.level === 2).length;
                                                        let optimized: typeof filtered = [];
                                                        if (level2Count <= 1) {
                                                            optimized = filtered
                                                                .filter(h => h.level >= 3)
                                                                .map(h => ({ ...h, level: 2 }));
                                                            if (optimized.length === 0) optimized = filtered;
                                                        } else {
                                                            for (let fi = 0; fi < filtered.length; fi++) {
                                                                const h = filtered[fi];
                                                                if (h.level === 2) {
                                                                    optimized.push(h);
                                                                } else if (h.level >= 3) {
                                                                    let siblingCount = 0;
                                                                    for (let si = fi; si < filtered.length && filtered[si].level >= 3; si++) siblingCount++;
                                                                    if (siblingCount >= 2) optimized.push(h);
                                                                }
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
                            {isLoadingHistory && messages.length === 0 && (
                                <div className="space-y-8 animate-pulse" aria-label="Loading conversation">
                                    {/* User bubble skeleton */}
                                    <div className="flex justify-end">
                                        <div className="max-w-[60%] px-4 py-3 bg-gray-100 rounded-2xl rounded-br-sm border border-gray-200/70">
                                            <div className="h-3.5 w-48 bg-gray-200 rounded" />
                                        </div>
                                    </div>
                                    {/* Assistant reply skeleton */}
                                    <div className="flex items-start gap-3">
                                        <div className="flex-1 min-w-0 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 rounded-full bg-gray-200" />
                                                <div className="h-3 w-24 bg-gray-200 rounded" />
                                            </div>
                                            <div className="h-4 w-3/5 bg-gray-200 rounded" />
                                            <div className="space-y-2 pt-2">
                                                <div className="h-3 w-full bg-gray-200/80 rounded" />
                                                <div className="h-3 w-11/12 bg-gray-200/80 rounded" />
                                                <div className="h-3 w-4/5 bg-gray-200/80 rounded" />
                                                <div className="h-3 w-2/3 bg-gray-200/80 rounded" />
                                            </div>
                                            <div className="flex gap-2 pt-3">
                                                <div className="h-16 flex-1 bg-gray-100 rounded-xl border border-gray-200/70" />
                                                <div className="h-16 flex-1 bg-gray-100 rounded-xl border border-gray-200/70" />
                                            </div>
                                        </div>
                                    </div>
                                    {/* Second user bubble skeleton */}
                                    <div className="flex justify-end">
                                        <div className="max-w-[45%] px-4 py-3 bg-gray-100 rounded-2xl rounded-br-sm border border-gray-200/70">
                                            <div className="h-3.5 w-32 bg-gray-200 rounded" />
                                        </div>
                                    </div>
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <div key={i} id={`msg-wrap-${i}`} ref={msg.role === 'user' ? lastUserMsgRef : undefined}>
                                    {msg.role === 'user' ? (
                                        <div className="flex justify-end">
                                            <div className="max-w-[72%] px-4 py-3 bg-gray-100 text-gray-900 rounded-2xl rounded-br-sm border border-gray-200/70">
                                                {msg.images && msg.images.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                        {msg.images.map((src, ii) => (
                                                            <img
                                                                key={ii}
                                                                src={src}
                                                                alt=""
                                                                className="max-h-40 max-w-[180px] rounded-lg object-cover border border-gray-200/70 cursor-zoom-in hover:ring-2 hover:ring-gray-300 transition-all"
                                                                onClick={() => setChatLightboxSrc(src)}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                                {msg.content && (
                                                    <p className="text-[15px] leading-relaxed tracking-[-0.011em]" style={{ fontFamily: "'Open Runde', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 500 }}>{msg.content}</p>
                                                )}
                                                <p className="text-[9px] text-gray-400 mt-1.5 text-right">{msg.timestamp}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-start gap-3">
                                            <div className="flex-1 min-w-0">
                                                {webFetchEntries[i] && webFetchEntries[i].length > 0 && (
                                                    <WebFetchPills entries={webFetchEntries[i]} />
                                                )}
                                                {thinkingProcesses[i] && (
                                                    <ThinkingInlineTrigger
                                                        thinking={thinkingProcesses[i]}
                                                        isOpen={showThinkingPanel && activeGraphMsgIdx === i}
                                                        streamingStarted={
                                                            msg.role === 'assistant' &&
                                                            (msg.content || '').trim().length > 0
                                                        }
                                                        onOpen={() => {
                                                            const flow = thinkingProcesses[i];
                                                            const alreadyOpen =
                                                                showThinkingPanel && activeGraphMsgIdx === i;
                                                            if (alreadyOpen) {
                                                                // Toggle: same trigger that opened the panel can close it.
                                                                setShowThinkingPanel(false);
                                                                return;
                                                            }
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
                                                {/* Bare stage pipeline — shows for all modes:
                                                    - Roundtable: 5 stages (Summon → Research → Debate → Consensus → Report)
                                                    - Fast / Auto: 3 stages (Route → Research → Respond) */}
                                                {!!thinkingProcesses[i]?.routedMode && (
                                                    <div className="mb-3 mt-1 -mx-1 px-1 overflow-x-auto md:overflow-visible md:mx-0 md:px-0" style={{ scrollbarWidth: 'none' }}>
                                                        <PlanPipeline thinking={thinkingProcesses[i]} />
                                                    </div>
                                                )}
                                                {/* ─── Inline tool pills + per-tool cards ─── */}
                                                {/* Shown in fast/auto mode (NOT roundtable) ONLY while the
                                                    assistant message has no streamed content yet. Once the
                                                    LLM emits its first token, these collapse into the right-
                                                    side Process panel (Web3Module) so the report has full
                                                    horizontal width. Pills include both web3 tool calls
                                                    AND synthesized search-module pseudo-tools (web/X/news)
                                                    so search work also gets a visible badge.
                                                    Roundtable mode has its own Workbench so we skip this. */}
                                                {(() => {
                                                    const flow = thinkingProcesses[i];
                                                    if (!flow) return null;
                                                    if (flow.routedMode === 'roundtable') return null;
                                                    // Hide once the assistant has started streaming text —
                                                    // detail then lives in the Process panel only.
                                                    const hasStreamedContent =
                                                        msg.role === 'assistant' && (msg.content || '').trim().length > 0;
                                                    if (hasStreamedContent) return null;

                                                    // ── web3 stages → calls + cards ──
                                                    const web3Mod = flow.modules?.find((m) => m.type === 'web3');
                                                    const web3Data = web3Mod?.data as Web3ModuleData | undefined;
                                                    const web3Stages = web3Data?.stages || [];
                                                    const web3Calls = web3Stages.map((s) => ({
                                                        toolName: s.stage,
                                                        args: s.argsData,
                                                        state: s.state,
                                                    }));
                                                    const web3CardStages = web3Stages.filter((s) => s.rawData != null);

                                                    // ── stocks per-tool stages (mirrors web3 shape) ──
                                                    // Sourced from analysis.toolStages — each Python tool call
                                                    // surfaces as one entry (active → completed) with argsData
                                                    // and rawData. Same Web3Stage type, same renderers — only
                                                    // the source module differs.
                                                    const analysisMod = flow.modules?.find((m) => m.type === 'analysis');
                                                    const analysisModData = analysisMod?.data as { toolStages?: Web3Stage[] } | undefined;
                                                    const stocksToolStages: Web3Stage[] = analysisModData?.toolStages || [];

                                                    // ── search module → synthesized pills ──
                                                    // The search backend doesn't expose tool-style raw output,
                                                    // but we synthesise pills from its module state so users
                                                    // see "searching web · query" / "reading X · query" with
                                                    // matching active/completed colour states.
                                                    const searchMod = flow.modules?.find((m) => m.type === 'search');
                                                    const searchData = searchMod?.data as SearchModuleData | undefined;
                                                    const searchPills: Array<{ toolName: string; args?: any; state: 'active' | 'completed' | 'failed' }> = [];
                                                    if (searchMod) {
                                                        const overall = searchMod.status;
                                                        const stateForPill: 'active' | 'completed' = overall === 'completed' ? 'completed' : 'active';
                                                        // Variants mark which sub-streams ran; we always include
                                                        // search_web + search_x for the typical fast/auto flow.
                                                        // SearchModuleData doesn't expose the upstream query
                                                        // string here, so the pills surface as bare labels.
                                                        searchPills.push({ toolName: 'search_web', state: stateForPill });
                                                        // X is included unless the variant specifically excludes
                                                        // it (the planner sometimes turns off social search).
                                                        if (searchData?.variant !== 'data_providers') {
                                                            searchPills.push({ toolName: 'search_x', state: stateForPill });
                                                        }
                                                    }

                                                    // Search sources card: combine the most useful sources
                                                    // from `sources` (top-level) AND any sub-sections so the
                                                    // user sees the same list the Process panel does — but
                                                    // inline, while waiting for synthesis.
                                                    const searchSources: any[] = [];
                                                    if (searchData) {
                                                        if (Array.isArray(searchData.sources)) {
                                                            searchSources.push(...searchData.sources);
                                                        }
                                                        if (Array.isArray(searchData.sections)) {
                                                            for (const sec of searchData.sections) {
                                                                if (Array.isArray(sec?.sources)) searchSources.push(...sec.sources);
                                                            }
                                                        }
                                                    }
                                                    // Dedup by url to avoid the same page showing twice when
                                                    // it appears in both top-level and a sub-section.
                                                    const dedupBy = new Map<string, any>();
                                                    for (const s of searchSources) {
                                                        const k = (s?.url || s?.title || '').toLowerCase();
                                                        if (k && !dedupBy.has(k)) dedupBy.set(k, s);
                                                    }
                                                    const dedupedSources = Array.from(dedupBy.values());

                                                    if (
                                                        searchPills.length === 0 &&
                                                        web3Stages.length === 0 &&
                                                        stocksToolStages.length === 0 &&
                                                        dedupedSources.length === 0
                                                    ) {
                                                        return null;
                                                    }
                                                    void web3Calls; void web3CardStages; // pairing now happens per-stage below

                                                    return (
                                                        <div className="mb-3 space-y-3">
                                                            {/* Search block: cluster of pills (web/X) over the
                                                                Sources card. Pills + card stay grouped because
                                                                a single Sources card represents both pills. */}
                                                            {(searchPills.length > 0 || dedupedSources.length > 0) && (
                                                                <div className="space-y-1.5">
                                                                    {searchPills.length > 0 && (
                                                                        <Web3ToolCallPills calls={searchPills} hideLabel />
                                                                    )}
                                                                    {dedupedSources.length > 0 && (
                                                                        <SearchSourcesCard sources={dedupedSources} initialCount={6} />
                                                                    )}
                                                                </div>
                                                            )}
                                                            {/* Web3 tool blocks: each pill paired with its card.
                                                                Card may be absent for stages still in flight
                                                                (no rawData yet) — pill alone is fine. */}
                                                            {web3Stages.map((s, idx) => (
                                                                <div key={`web3-${s.stage}-${idx}`} className="space-y-1.5">
                                                                    <Web3ToolPill
                                                                        toolName={s.stage}
                                                                        args={s.argsData}
                                                                        state={s.state}
                                                                    />
                                                                    {s.rawData != null && (
                                                                        <Web3ToolResultCard
                                                                            toolName={s.stage}
                                                                            rawData={s.rawData}
                                                                        />
                                                                    )}
                                                                </div>
                                                            ))}
                                                            {/* Stocks tool blocks: identical pill+card layout
                                                                — same Web3Stage shape, same renderers. The
                                                                source module is `analysis` instead of `web3`,
                                                                but the visual treatment is unified so the
                                                                stocks side feels just as rich. */}
                                                            {stocksToolStages.map((s, idx) => (
                                                                <div key={`stk-${s.stage}-${idx}`} className="space-y-1.5">
                                                                    <Web3ToolPill
                                                                        toolName={s.stage}
                                                                        args={s.argsData}
                                                                        state={s.state}
                                                                    />
                                                                    {s.rawData != null && (
                                                                        <Web3ToolResultCard
                                                                            toolName={s.stage}
                                                                            rawData={s.rawData}
                                                                        />
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                                {/* Roundtable Workbench — left roster + right (detail + Graph/Debate tabs) */}
                                                {thinkingProcesses[i]?.routedMode === 'roundtable'
                                                  && (thinkingProcesses[i]!.rtPreparationStatus === 'done'
                                                      || ((thinkingProcesses[i]!.rtRounds?.length ?? 0) > 0)
                                                      || ((thinkingProcesses[i]!.rtDataSearch?.length ?? 0) > 0)) && (
                                                    <PlanCardBoundary>
                                                        <RoundtableWorkbench
                                                            thinking={thinkingProcesses[i]!}
                                                            isLive={!!thinkingProcesses[i]?.isActive}
                                                            topicLabel={messages.slice(0, i).reverse().find(m => m.role === 'user')?.content || ''}
                                                        />
                                                    </PlanCardBoundary>
                                                )}
                                                {msg.content === '__cancelled__' ? (
                                                    <p className="text-[13px] text-gray-400 italic">Response cancelled</p>
                                                ) : msg.content ? (() => {
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
                                                            {/* Crypto token card (Web3 queries) — live CoinGecko snapshot.
                                                                Token-identity lens: logo / project name / FDV / supply /
                                                                socials / top exchanges / project links. */}
                                                            {tokenCards[i] && <TokenCard token={tokenCards[i]} lang={/[一-鿿]/.test(msg.content || '') ? 'zh' : 'en'} />}
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
                            {/* Scroll-to-bottom FAB: only while user is scrolled above the latest reply */}
                            {showScrollToBottom && (
                                <div className="flex justify-center mb-3">
                                    <button
                                        onClick={handleScrollToBottom}
                                        aria-label="Scroll to latest message"
                                        title="Scroll to latest"
                                        className="group w-9 h-9 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 hover:border-gray-300 shadow-md hover:shadow-lg flex items-center justify-center transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
                                        style={{ animation: 'menu-pop 0.2s ease-out', boxShadow: '0 4px 14px -2px rgba(15,23,42,0.12), 0 1px 3px rgba(15,23,42,0.08)' }}
                                    >
                                        <svg className="w-4 h-4 transition-transform group-hover:translate-y-[1px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 5v14M19 12l-7 7-7-7" />
                                        </svg>
                                    </button>
                                </div>
                            )}
                            {/* Dev-only: export current chat state as a demo
                                fixture JSON. The visible button has been removed
                                to eliminate any risk of leaking into production.
                                The function `handleExportDemoFixture` is still
                                available — to capture a new fixture, open the
                                browser console after a session completes and run:
                                  window.__lokaExportDemoFixture?.()
                                (the hook is set up just below in a useEffect). */}
                            {/* Demo-mode banner: replaces the input area's prompt
                                line so the visitor knows this is a replay. */}
                            {/* Demo-mode pill removed for production polish — the
                                fixture replay is now silent. Re-enable here if a
                                visible badge is ever desired. */}
                            <div
                                className="group/composer bg-white backdrop-blur-xl border border-gray-200/80 rounded-[20px] relative ring-1 ring-black/[0.04] transition-all duration-200 focus-within:border-gray-300 focus-within:ring-gray-300/30 focus-within:shadow-[0_20px_60px_-12px_rgba(15,23,42,0.25),0_6px_20px_-4px_rgba(15,23,42,0.12)]"
                                style={{
                                    boxShadow: '0 12px 48px -8px rgba(15,23,42,0.18), 0 4px 16px -2px rgba(15,23,42,0.10), 0 1px 3px rgba(15,23,42,0.06)',
                                    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(250,250,252,1) 100%)',
                                }}
                            >

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
                                                <img
                                                    src={src}
                                                    alt=""
                                                    className="w-12 h-12 rounded-xl object-cover border border-gray-200 shadow-sm cursor-zoom-in hover:ring-2 hover:ring-gray-300 transition-all"
                                                    onClick={() => setChatLightboxSrc(src)}
                                                />
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setChatPastedImages(prev => prev.filter((_, i) => i !== idx)); }}
                                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                                                >
                                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <HighlightedTextarea
                                    ref={textareaRef}
                                    rows={1}
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    onPaste={handleChatPaste}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!isStreaming && !demoFixture) handleSend(); } }}
                                    placeholder={
                                        voiceState !== 'idle'
                                            ? ''
                                            : demoFixture
                                                ? '🎬 Demo replay — start a new chat above to ask your own questions'
                                                : isStreaming
                                                    ? 'Waiting for reply… type your next message'
                                                    : 'Ask a follow-up…'
                                    }
                                    disabled={voiceState !== 'idle' || !!demoFixture}
                                    className="w-full bg-transparent outline-none resize-none text-[14.5px] text-gray-900 placeholder:text-gray-400 px-5 pt-4 pb-1 leading-relaxed overflow-y-auto"
                                    style={{ minHeight: '50px', maxHeight: '180px', visibility: voiceState !== 'idle' ? 'hidden' : 'visible' }}
                                />
                                <div className="flex items-center justify-between px-2.5 pb-2.5 pt-0.5">
                                    {/* Left: Mode selector — plain text, ChatGPT/Claude style */}
                                    <div className="flex items-center gap-1">
                                        <ModeSelector
                                            mode={chatMode}
                                            onModeChange={setChatMode}
                                            roundtableQuota={roundtableQuota}
                                            fastQuota={fastQuota}
                                            isGuest={!api.isAuthenticated}
                                            onLockedClick={() => window.dispatchEvent(new Event('show-auth-modal'))}
                                        />
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
                                            disabled={!!demoFixture || (!isStreaming && !inputText.trim())}
                                            title={demoFixture ? 'Demo mode — input disabled' : isStreaming ? 'Stop generating' : 'Send'}
                                            aria-label={isStreaming ? 'Stop generating' : 'Send'}
                                            className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-all ml-1 ${isStreaming
                                                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                                                    : inputText.trim()
                                                        ? 'bg-gray-700 text-white hover:bg-gray-800 shadow-[0_6px_16px_-4px_rgba(55,65,81,0.35)] hover:-translate-y-[1px]'
                                                        : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                                }`}
                                        >
                                            {isStreaming ? (
                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                                    <circle cx="12" cy="12" r="9" />
                                                    <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
                                                </svg>
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
                {/* ── Unified Process Panel (floating card, same for all modes) ── */}
                {/* Mobile: fullscreen overlay with backdrop. Desktop (md+): inline side column. */}
                {showThinkingPanel && currentThinking && (
                    <>
                        <div
                            className="md:hidden fixed inset-0 z-40 bg-black/40"
                            onClick={() => setShowThinkingPanel(false)}
                            aria-hidden="true"
                        />
                        <div className="fixed inset-0 z-50 p-3 md:static md:z-auto md:w-[440px] md:shrink-0 md:p-3 md:pl-0">
                            <div className="h-full flex flex-col overflow-hidden bg-[#fafafb] rounded-2xl border border-gray-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
                                <div className="flex items-center px-4 py-3 gap-2 shrink-0">
                                    <span className="text-[12.5px] font-bold text-gray-900 tracking-tight">Process</span>
                                    <div className="flex-1" />
                                    <button onClick={() => setShowThinkingPanel(false)}
                                        aria-label="Close"
                                        className="w-9 h-9 md:w-7 md:h-7 rounded-lg bg-white/60 hover:bg-white flex items-center justify-center text-gray-500 hover:text-gray-700 transition-all">
                                        <svg className="w-4 h-4 md:w-3.5 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                                <div className="flex-1 min-h-0 overflow-hidden">
                                    <ThinkingProcessSidePanel thinking={currentThinking} onClose={() => setShowThinkingPanel(false)} hideHeader chatMode={chatMode} />
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Standalone Roundtable Panel — only for non-roundtable mode fallback */}
                {showGraphPanel && !showThinkingPanel && !sourcePanelData && chatMode !== 'roundtable' && (
                    <>
                        <div
                            className="md:hidden fixed inset-0 z-40 bg-black/40"
                            onClick={() => setShowGraphPanel(false)}
                            aria-hidden="true"
                        />
                        <div className="fixed inset-0 z-50 p-3 md:static md:z-auto md:w-[540px] md:shrink-0 md:p-3 md:pl-0">
                            <div className="h-full flex flex-col overflow-hidden bg-white rounded-2xl border border-gray-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.08)] relative">
                                <div className="flex items-center px-4 py-3 border-b border-gray-100 gap-2 shrink-0">
                                    <div className="w-5 h-5 rounded-md bg-gray-900 flex items-center justify-center text-white text-[9px] font-black">L</div>
                                    <span className="text-[12.5px] font-bold text-gray-900 tracking-tight">Loka's Computer</span>
                                    <div className="flex-1" />
                                    <button onClick={() => setShowGraphPanel(false)}
                                        aria-label="Close"
                                        className="w-9 h-9 md:w-7 md:h-7 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-all">
                                        <svg className="w-4 h-4 md:w-3.5 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                                <div className="flex-1 min-h-0 overflow-hidden">
                                    <RoundtableView data={currentRoundtableData} isWaiting={isStreaming && (chatMode as string) === 'roundtable' && currentRoundtableData.rounds.length === 0} isLive={isStreaming && (chatMode as string) === 'roundtable'} />
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Sources Side Panel — floating card */}
                {sourcePanelData && !showThinkingPanel && (
                    <>
                        <div
                            className="md:hidden fixed inset-0 z-40 bg-black/40"
                            onClick={() => setSourcePanelData(null)}
                            aria-hidden="true"
                        />
                        <div className="fixed inset-0 z-50 p-3 md:static md:z-auto md:w-[400px] md:shrink-0 md:p-3 md:pl-0">
                            <div className="h-full flex flex-col bg-white rounded-2xl border border-gray-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.08)] overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                                <span className="text-[13px] font-semibold text-gray-800">{sourcePanelData.length} Sources</span>
                            </div>
                            <button
                                onClick={() => setSourcePanelData(null)}
                                aria-label="Close"
                                className="w-9 h-9 md:w-7 md:h-7 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-all"
                            >
                                <svg className="w-4 h-4 md:w-3.5 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
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
                    </>
                )}
            </div>
        </div>
    );
};

export default SuperAgentChat;