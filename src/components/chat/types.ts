// Shared types for the Super Agent chat UI. Extracted from SuperAgentChat.tsx
// during the Phase-1 refactor — the same shapes the original file declared
// inline. Component files import from here so the types stay in one place.

// ── Top-level chat message ──────────────────────────────────────────────
export interface Message {
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
    /** Inline images attached to a user turn (data: URLs from clipboard /
     * file picker). Forwarded to the backend so vision models can read
     * them, and rendered under the user bubble for visual context on
     * replay. Capped at 4 by the backend on send. */
    images?: string[];
}

// ── Search / Source ─────────────────────────────────────────────────────
export interface SearchSource {
    favicon: string;
    title: string;
    domain: string;
    url?: string;
    snippet?: string;
}

export interface DataProvider {
    name: string;
    status: 'pending' | 'active' | 'done';
}

// ── Modular Thinking Flow ───────────────────────────────────────────────
export interface SearchSubSection {
    id: 'social' | 'data_providers';
    label: string;
    status: 'pending' | 'active' | 'done';
    sources?: SearchSource[];
    providers?: DataProvider[];
    totalFound?: number;
}

export interface SearchModuleData {
    variant: 'social' | 'data_providers' | 'combined';
    description?: string;
    sources?: SearchSource[];
    providers?: DataProvider[];
    totalFound?: number;
    // Combined mode: multiple sub-sections
    sections?: SearchSubSection[];
}

export interface AnalysisStage {
    id: string;
    label: string;
    status: 'pending' | 'active' | 'done';
    result?: { label: string; value: string; color?: string }[];
}

export interface AnalysisModuleData {
    stages: AnalysisStage[];
    decision?: { verdict: string; score: number; color: string; action: string };
    /** Per-tool stages for the stocks ReAct agent — mirrors Web3ModuleData.stages.
     *  Each entry is one tool call (get_realtime_quote, analyze_trend, etc.)
     *  with state/argsData/rawData so the chat thread can render per-tool
     *  pills + result cards, identical to the web3 path. */
    toolStages?: Web3Stage[];
}

export interface SimPanelist {
    name: string;
    avatar: string;
    status: 'pending' | 'active' | 'done';
    verdict?: string;
    confidence?: number;
    group?: 'guru' | 'analyst';
}

export interface SimulationModuleData {
    panelists: SimPanelist[];
    prediction?: { verdict: string; confidence: number };
}

export interface ConsensusModuleData {
    round: number;
    maxRounds: number;
    status: 'building' | 'discussing' | 'concluded';
    conclusion?: { verdict: string; confidence: number };
}

// ── Roundtable Process: 4-phase flow data ───────────────────────────────
export interface RtDataCategory {
    id: string;
    label: string;
    labelCN: string;
    icon: string;
    status: 'pending' | 'active' | 'done';
    count?: number;
    items?: string[];
    sources?: { title: string; domain: string; favicon?: string; url?: string }[];
}

export interface RtAgentInference {
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

export interface RtRoundData {
    round: number;
    status: 'pending' | 'active' | 'done';
    agents: RtAgentInference[];
    description?: string;
    descriptionCN?: string;
}

export interface RtConsensusResult {
    status: 'pending' | 'active' | 'done';
    hasConsensus: boolean;
    conflictRate?: number;      // 0-100 percentage of disagreement
    agentConclusions: { agentName: string; verdict: string; confidence: number }[];
    finalVerdict?: string;
    finalConfidence?: number;
}

// ── OKX-derived snapshots embedded in Web3 modules ──────────────────────
export interface Web3OkxSnapshot {
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

export interface Web3OkxNewsItem {
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

export interface Web3OkxSentiment {
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

export interface Web3OkxNewsBundle {
    baseCcy: string;
    latestNews: Web3OkxNewsItem[];
    sentiment: Web3OkxSentiment | null;
}

// One sub-stage of the web3 ReAct loop. Backend pushes these in real time
// (stage:'active' → 'completed'/'failed') so the user can watch the agent
// work through tool calls instead of staring at a 30s blank wait.
export interface Web3Stage {
    stage: string;
    title_en: string;
    title_zh: string;
    state: 'active' | 'completed' | 'failed' | 'skipped';
    durationMs?: number;
    summary?: string;
    error?: string;
    /** Tool input args (e.g. { id: "bittensor" }). Drives the ToolCallPills
     *  "called: 解析代币 · bittensor" labels. Set on `active` events. */
    argsData?: any;
    /** Raw tool output (parsed JSON, server-trimmed). Drives the per-tool
     *  inline cards (price card, project profile, sparkline, etc). Set on
     *  `completed` events. */
    rawData?: any;
}

export interface Web3ModuleData {
    label?: string;
    intent?: string;
    via?: string;
    assets?: number;
    okx?: Web3OkxSnapshot[];
    okxNews?: Web3OkxNewsBundle[];
    providers?: string[];
    duration?: number;
    stages?: Web3Stage[];
}

export interface ThinkingModule {
    type: 'search' | 'analysis' | 'simulation' | 'consensus' | 'web3' | 'synthesis' | 'report' | 'done';
    status: 'pending' | 'active' | 'completed';
    data?: SearchModuleData | AnalysisModuleData | SimulationModuleData | ConsensusModuleData | Web3ModuleData | { duration?: number; phase?: string };
}

export interface ToolTraceItem {
    tool?: string;
    displayName: string;
    status: 'running' | 'done' | 'error';
    durationSec?: number;
}

export interface ThinkingFlow {
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
    /** Tools-phase duration in seconds (request → tools-done; excludes the
     *  synthesis stream). Persisted in metadata.thinkingFlow on the backend
     *  so history-restored sessions display the same pill the user saw live
     *  ("Done · X tools · Y sources · Zs"). When absent (legacy data),
     *  the trigger falls back to its live capture or to done.duration. */
    toolsPhaseDurationS?: number;
}

// ── Roundtable rendering data (RoundtableView component) ────────────────
export interface RoundtableAgentVote {
    name: string;
    initials: string;
    agentId: string;
    answer: string;      // Short answer summary (first line or extracted verdict)
    reasoning: string;   // Full reasoning text
    confidence: number;  // 0–100
}

export interface ConsensusRound {
    round: number;
    agents: RoundtableAgentVote[];
    status: 'forming' | 'reached' | 'diverging';
    summary: string;
}

export interface RoundtableData {
    rounds: ConsensusRound[];
    finalVerdict: { summary: string; confidence: number };
}
