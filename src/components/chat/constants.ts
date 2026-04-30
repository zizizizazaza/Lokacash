// Shared constants for the Super Agent chat UI. Extracted from
// SuperAgentChat.tsx during the Phase-1 refactor.

/** Space above the bottom of the chat column reserved for the floating input bar (padding + field + controls). TOC must stay above this. */
export const TOC_BOTTOM_RESERVE_PX = 148;

/** Minimum TOC panel height so the list isn't collapsed to ~3 rows before layout stabilizes */
export const TOC_MIN_VIEWPORT_PX = 220;

/** Standard sticky offset for the left TOC rail. */
export const TOC_STICKY_TOP_PX = 24;

// ── Session storage keys ────────────────────────────────────────
export const SA_SID_KEY = 'loka_superagent_sid';
export const SA_PENDING_KEY = 'loka_sa_analysis_pending';

// ── Domains classified as social (for splitting news vs social sources) ──
export const SOCIAL_DOMAINS = new Set(['x.com', 'twitter.com', 'reddit.com', 'stocktwits.com']);

// ── Default 4-agent roundtable line-up (used for placeholder/demo data) ──
export const ROUNDTABLE_AGENTS = [
    { name: 'Fundamental Analyst', initials: 'FA', agentId: 'agent_0' },
    { name: 'Macro Strategist', initials: 'MS', agentId: 'agent_1' },
    { name: 'Sentiment Engine', initials: 'SE', agentId: 'agent_2' },
    { name: 'Quant Tracker', initials: 'QT', agentId: 'agent_3' },
];
