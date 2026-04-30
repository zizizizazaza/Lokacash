// Analyst persona pool + helpers used by the Roundtable / debate UI.
// Extracted from SuperAgentChat.tsx during the Phase-1 refactor.

export interface SummonPoolEntry {
    id: string;
    name: string;
    nameCN: string;
    initials: string;
    role: string;
    roleCN: string;
    color: string;
    group: 'system' | 'enhanced' | 'master';
}

/* ── Summon pool — analyst characters for roundtable selection ── */
/* group=system → auto-selected by system, user cannot toggle */
export const SUMMON_POOL: SummonPoolEntry[] = [
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

export const SYSTEM_AGENT_IDS = new Set(SUMMON_POOL.filter(a => a.group === 'system').map(a => a.id));
export const DEFAULT_SUMMON_IDS = new Set<string>();

// Lookup helpers for mapping backend analystId → frontend display name.
const SUMMON_POOL_BY_ID = new Map(SUMMON_POOL.map(a => [a.id, a]));

export function getAnalystDisplayName(analystId: string, preferCN = false): string {
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
export function parsePersonaVerdict(answer: string): 'Bullish' | 'Bearish' | 'Neutral' {
    const m = answer?.match(/SIGNAL:\s*(bullish|bearish|neutral)/i);
    const raw = m ? m[1].toLowerCase() : 'neutral';
    if (raw === 'bullish') return 'Bullish';
    if (raw === 'bearish') return 'Bearish';
    return 'Neutral';
}

/**
 * Extract a reasoning snippet from a persona's raw answer. Prefers the
 * RATIONALE section if the persona followed the schema, else uses the body.
 * Truncates at ~800 chars but NEVER mid-word / mid-sentence.
 */
export function parsePersonaReasoning(answer: string): string {
    if (!answer) return '';
    const m = answer.match(/RATIONALE:\s*([\s\S]+?)(?:\n[A-Z_]+:|\n\n|$)/i);
    const raw = (m && m[1].trim()) ? m[1].trim() : answer;
    const MAX = 800;
    if (raw.length <= MAX) return raw;
    const chunk = raw.slice(0, MAX);
    // Prefer cutting at the last full sentence inside the window (latin + CJK).
    const sentenceEnds = [...chunk.matchAll(/[.!?。！？]/g)];
    if (sentenceEnds.length > 0) {
        const lastEnd = sentenceEnds[sentenceEnds.length - 1].index! + 1;
        if (lastEnd >= MAX * 0.55) return chunk.slice(0, lastEnd).trim() + ' …';
    }
    // Fallback: cut at last whitespace so we never chop a word in half.
    const lastWs = chunk.search(/\s\S*$/);
    if (lastWs >= MAX * 0.8) return chunk.slice(0, lastWs) + ' …';
    return chunk.trimEnd() + '…';
}

export const AGENT_COLORS: Record<string, string> = {
    FA: '#475569', MS: '#475569', SE: '#475569', QT: '#475569',
};
