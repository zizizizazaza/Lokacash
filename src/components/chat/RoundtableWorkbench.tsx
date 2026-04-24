/**
 * RoundtableWorkbench — Unified Graph / Debate / Activity-Log workbench card
 * for Roundtable-mode chat turns. Extracted from SuperAgentChat.tsx so that
 * file stops being 7500+ lines long.
 *
 * What lives here:
 *   • KnowledgeGraphData + KG node/edge types (local to the graph panel)
 *   • STATIC_KG_DATA demo + buildKnowledgeGraph (kept for the empty-state
 *     fallback in RoundtableView, which is still in SuperAgentChat)
 *   • buildRealKnowledgeGraph — derives the graph from live thinking state
 *   • KnowledgeGraphView — D3 force-directed renderer
 *   • TerminalLogPanel — monospace streaming log for the Activity-Log tab
 *   • ROUNDTABLE_AGENT_PROFILES + RoundtableAgentModal
 *   • THINKING_ACTIVITIES / DEFAULT_THINKING_ACTIVITIES / ThinkingAnalystsList
 *   • RoundtableWorkbench — the card itself
 *
 * Types and small shared helpers live in SuperAgentChat and are imported
 * here via ../SuperAgentChat exports.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { ThinkingFlow, ThinkingModule } from '../SuperAgentChat';
import { AgentAvatarImg, SUMMON_POOL, fmtTs, AVATAR_MAP } from '../SuperAgentChat';

type TermLine = { ts: string; level: 'info' | 'run' | 'ok' | 'err' | 'hdr'; text: string };

/**
 * Render an agent's reasoning text with markdown citations like
 *   "...price stability ([Intellectia](https://intellectia.ai/...))..."
 * converted into compact chip-style source badges that match the main
 * report view. Raw [label](url) syntax inside chat bubbles was bleeding
 * full URLs into the transcript; this turns them into clickable pills.
 * Only matches `https?://` URLs to avoid false positives on prose brackets.
 */
function renderReasoningWithCitations(text: string): React.ReactNode[] {
    if (!text) return [];
    const parts: React.ReactNode[] = [];
    const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    // Strip trailing or surrounding parens around the whole citation.
    while ((match = re.exec(text)) !== null) {
        const [full, label, url] = match;
        // Plain text before this citation
        let start = match.index;
        let end = start + full.length;
        // Trim a leading ' (' and trailing ')' if the LLM wrapped the whole
        // citation in parentheses (a common pattern).
        const before = text.slice(last, start);
        const trailing = text.slice(end, end + 1);
        const cleanedBefore = before.replace(/\s*\(\s*$/, '');
        const ate = before.length - cleanedBefore.length;
        if (ate > 0 && trailing === ')') {
            end += 1; // skip the closing paren too
        }
        if (cleanedBefore) parts.push(<span key={`t${key++}`}>{cleanedBefore}</span>);
        const host = (() => {
            try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
        })();
        const shortLabel = label.length > 18 ? label.slice(0, 16) + '…' : label;
        parts.push(
            <a
                key={`c${key++}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={host}
                className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-[1px] rounded-full text-[10.5px] font-medium leading-tight text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200/60 transition-colors no-underline hover:no-underline align-middle"
            >
                <svg className="w-2.5 h-2.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span>{shortLabel}</span>
            </a>
        );
        last = end;
    }
    const tail = text.slice(last);
    if (tail) parts.push(<span key={`t${key++}`}>{tail}</span>);
    return parts;
}

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

export const buildKnowledgeGraph = (): KnowledgeGraphData => STATIC_KG_DATA;

/**
 * Build a progressive knowledge graph from whatever roundtable state is
 * available right now — the graph grows in stages as data arrives:
 *
 *   Stage 0: Summon done                → topic + N pending role nodes
 *   Stage 1: Research modules complete  → + knowledge source nodes
 *   Stage 2: Round 1 agents respond     → + evidence nodes (per stance)
 *   Stage 3: Consensus done             → + conclusion node + challenge edges
 *
 * Never returns null and never falls back to demo AAPL data. At minimum
 * returns the topic node + selected agents (pending). The caller can trust
 * this to render a meaningful graph at every stage of a roundtable turn.
 */
function buildRealKnowledgeGraph(
    thinking: ThinkingFlow | undefined,
    topicLabel: string = 'Research Topic',
): KnowledgeGraphData {
    const nodes: KGNode[] = [];
    const edges: KGEdge[] = [];

    const agentIds = thinking?.selectedAgentIds || [];
    const rounds = thinking?.rtRounds || [];
    const consensus = thinking?.rtConsensus;
    const modules = thinking?.modules || [];

    // 1. Topic node — always present
    const topicDisplay = topicLabel.length > 26 ? topicLabel.slice(0, 24) + '…' : topicLabel;
    nodes.push({
        id: 'topic_main',
        type: 'asset',
        label: topicDisplay || 'Research Topic',
        group: 'center',
        x: 0, y: 0,
        data: { summary: topicLabel || 'Pending research topic' },
    });

    // 2. Knowledge source nodes — hub + source children.
    // For each data-gathering track (search / web3 / analysis), create a hub
    // node connected to the topic, plus up to `MAX_SOURCES_PER_HUB` individual
    // source children branching off the hub. Lets users see the actual
    // domains that informed the debate (coingecko, x.com, coindesk, …)
    // without cluttering the graph with all 15+ items at once.
    const MAX_SOURCES_PER_HUB = 5;
    const knowledgeMeta: Array<{
        id: string; label: string; kind: string; summary: string;
        moduleType: 'search' | 'web3' | 'analysis';
    }> = [];
    const seenKinds = new Set<string>();
    for (const m of modules) {
        if (m.status !== 'completed' && m.status !== 'active') continue;
        const t = m.type;
        if (seenKinds.has(t)) continue;
        if (t === 'search') {
            knowledgeMeta.push({ id: 'knowledge_search', label: 'News & Reports', kind: 'news_feed', summary: 'Web search results — news, filings, analyst reports.', moduleType: 'search' });
            seenKinds.add(t);
        } else if (t === 'web3') {
            knowledgeMeta.push({ id: 'knowledge_web3', label: 'On-chain Data', kind: 'data_feed', summary: 'OKX price, funding, open interest + CoinGecko markets.', moduleType: 'web3' });
            seenKinds.add(t);
        } else if (t === 'analysis') {
            knowledgeMeta.push({ id: 'knowledge_analysis', label: 'Stock Fundamentals', kind: 'data_feed', summary: 'Realtime quote + fundamentals + historical OHLC.', moduleType: 'analysis' });
            seenKinds.add(t);
        }
    }
    // Helper: dedupe + cap by domain so we don't render 15 coindesk entries.
    const pickTopSources = (mod: ThinkingModule | undefined, limit: number): Array<{ domain: string; title: string; url?: string }> => {
        if (!mod) return [];
        const raw: Array<{ domain: string; title: string; url?: string }> = [];
        const d = mod.data as any;
        if (Array.isArray(d?.sources)) {
            for (const s of d.sources) raw.push({ domain: s.domain, title: s.title, url: s.url });
        }
        if (Array.isArray(d?.sections)) {
            for (const sec of d.sections) {
                if (Array.isArray(sec?.sources)) {
                    for (const s of sec.sources) raw.push({ domain: s.domain, title: s.title, url: s.url });
                }
            }
        }
        const byDomain = new Map<string, { domain: string; title: string; url?: string }>();
        for (const item of raw) {
            if (!item?.domain) continue;
            if (!byDomain.has(item.domain)) byDomain.set(item.domain, item);
            if (byDomain.size >= limit) break;
        }
        return Array.from(byDomain.values());
    };
    for (const k of knowledgeMeta) {
        nodes.push({
            id: k.id, type: 'knowledge', label: k.label, group: 'knowledge',
            x: 0, y: 0,
            data: { knowledge_type: k.kind, summary: k.summary },
        });
        edges.push({
            id: `edge_${k.id}_topic`,
            source: k.id, target: 'topic_main',
            type: 'informs', label: 'informs',
        });
        // Add up to N source sub-nodes branching off this hub.
        const mod = modules.find(m => m.type === k.moduleType);
        const topSources = pickTopSources(mod, MAX_SOURCES_PER_HUB);
        for (const src of topSources) {
            const sid = `src_${k.moduleType}_${src.domain.replace(/[^a-z0-9]/gi, '_')}`;
            // Avoid duplicate id if same domain appears under two hubs
            if (nodes.find(n => n.id === sid)) continue;
            const shortTitle = src.title && src.title.length > 0
                ? (src.title.length > 28 ? src.title.slice(0, 26) + '…' : src.title)
                : src.domain;
            nodes.push({
                id: sid, type: 'knowledge', label: shortTitle, group: 'knowledge',
                x: 0, y: 0,
                data: {
                    knowledge_type: 'source',
                    summary: `${src.domain}${src.url ? ' — ' + src.url : ''}`,
                    detail: src.title || src.domain,
                },
            });
            edges.push({
                id: `edge_${k.id}_${sid}`,
                source: k.id, target: sid,
                type: 'informs', label: 'provides',
            });
        }
    }

    // 3. Agent role nodes — from selectedAgentIds. Pending until the
    //    backend emits a per-agent response, then filled in progressively.
    const firstRoundAgents = rounds[0]?.agents || [];
    const lastRoundAgents = rounds[rounds.length - 1]?.agents || [];

    for (const agentId of agentIds) {
        const meta = SUMMON_POOL.find(a => a.id === agentId);
        if (!meta) continue;
        const first = firstRoundAgents.find(a => a.agentId === agentId);
        const last = lastRoundAgents.find(a => a.agentId === agentId);
        const initial = (first?.verdict || '').toLowerCase();
        const final = (last?.verdict || initial || '').toLowerCase();
        const confidence = ((last?.confidence ?? first?.confidence ?? 0) as number) / 100;
        const summary = last?.reasoning || first?.reasoning || meta.role;
        const changed = !!initial && !!final && initial !== final;
        const roleId = `role_${agentId}`;
        nodes.push({
            id: roleId, type: 'role', label: meta.name, group: 'role',
            x: 0, y: 0,
            data: {
                agentId, color: meta.color,
                initial_signal: initial || 'pending',
                final_signal: final || 'pending',
                confidence,
                changed_position: changed,
                summary,
            },
        });
        edges.push({
            id: `edge_${roleId}_topic`,
            source: roleId, target: 'topic_main',
            type: 'analyzes', label: 'analyzes',
        });
        // Every role draws from every knowledge source — visually shows
        // the committee is informed by the same evidence pool.
        for (const k of knowledgeMeta) {
            edges.push({
                id: `edge_${k.id}_${roleId}`,
                source: k.id, target: roleId,
                type: 'informs', label: 'informs',
            });
        }
    }

    // 4. Evidence nodes — one per agent who has reached a verdict. The
    //    evidence label compresses the agent's stance into a short phrase
    //    and polarity is inferred from bullish/bearish/buy/sell keywords.
    const strongAgents = lastRoundAgents.filter(a => a.status === 'done' && a.verdict);
    for (const a of strongAgents) {
        const meta = SUMMON_POOL.find(s => s.id === a.agentId);
        if (!meta) continue;
        const verdict = (a.verdict || '').toLowerCase();
        const polarity =
            /bull|buy|long|加多|看多|看涨|买入/.test(verdict) ? 'positive'
            : /bear|sell|short|看空|看跌|做空|卖出/.test(verdict) ? 'negative'
            : 'neutral';
        const eid = `evidence_${a.agentId}`;
        const label = `${meta.name} · ${a.verdict}`;
        nodes.push({
            id: eid, type: 'evidence',
            label,
            group: polarity === 'positive' ? 'evidence_positive'
                 : polarity === 'negative' ? 'evidence_negative'
                 : 'evidence_neutral',
            x: 0, y: 0,
            data: {
                polarity,
                importance: 'medium',
                category: 'stance',
                detail: a.reasoning || '',
                cited_by: [meta.name],
            },
        });
        edges.push({
            id: `edge_role_${a.agentId}_${eid}`,
            source: `role_${a.agentId}`, target: eid,
            type: 'cites', label: 'cites',
        });
    }

    // 5. Conclusion node + converges/challenges edges — only after
    //    consensus is reached.
    const hasConclusion = consensus && (consensus.status === 'done' || !!consensus.finalVerdict);
    if (hasConclusion) {
        const finalVerdict = (consensus!.finalVerdict || 'HOLD').toUpperCase();
        const finalConf = Math.round(consensus!.finalConfidence ?? 50);
        const conflict = Math.round(consensus!.conflictRate ?? 0);
        nodes.push({
            id: 'conclusion_action', type: 'conclusion',
            label: `Final: ${finalVerdict} · ${finalConf}%`,
            group: 'conclusion',
            x: 0, y: 0,
            data: {
                action: finalVerdict.toLowerCase(),
                confidence: finalConf / 100,
                summary: `Committee verdict: ${finalVerdict}. Weighted confidence ${finalConf}%. Conflict rate ${conflict}%.`,
            },
        });
        // Each role → conclusion
        for (const agentId of agentIds) {
            const roleId = `role_${agentId}`;
            if (!nodes.find(n => n.id === roleId)) continue;
            const last = lastRoundAgents.find(a => a.agentId === agentId);
            const vlow = (last?.verdict || '').toLowerCase();
            edges.push({
                id: `edge_${roleId}_final`,
                source: roleId, target: 'conclusion_action',
                type: 'converges_to',
                label: vlow ? `supports_${vlow}` : 'converges_to',
            });
        }
        // Each evidence → conclusion
        for (const a of strongAgents) {
            const eid = `evidence_${a.agentId}`;
            if (!nodes.find(n => n.id === eid)) continue;
            edges.push({
                id: `edge_${eid}_final`,
                source: eid, target: 'conclusion_action',
                type: 'supports', label: 'supports',
            });
        }
        // Pairwise disagreement between roles (drawn once per pair)
        for (let i = 0; i < agentIds.length; i++) {
            for (let j = i + 1; j < agentIds.length; j++) {
                const a = lastRoundAgents.find(x => x.agentId === agentIds[i]);
                const b = lastRoundAgents.find(x => x.agentId === agentIds[j]);
                const av = (a?.verdict || '').toLowerCase();
                const bv = (b?.verdict || '').toLowerCase();
                if (av && bv && av !== bv) {
                    edges.push({
                        id: `edge_challenge_${agentIds[i]}_${agentIds[j]}`,
                        source: `role_${agentIds[i]}`, target: `role_${agentIds[j]}`,
                        type: 'challenges', label: 'disagrees',
                    });
                }
            }
        }
    }

    return { nodes, edges };
}

export const KnowledgeGraphView: React.FC<{ data: KnowledgeGraphData; animate?: boolean }> = ({ data, animate = false }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoverNode, setHoverNode] = useState<{ node: any; x: number; y: number } | null>(null);
    // Position cache: when `data` changes (new node added mid-flight), seed
    // the simulation with each existing node's last-known x/y so only the
    // NEW nodes get placed by force, old nodes stay anchored. Without this
    // the whole graph re-shuffles on every progressive reveal and the user
    // sees the scene jump.
    const positionCacheRef = useRef<Map<string, { x: number; y: number }>>(new Map());

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

        // Seed positions from cache so progressive reveals don't reshuffle.
        // Existing nodes keep their last-known coordinates; only brand-new
        // nodes enter the simulation without a position (force will place
        // them near their neighbours via the link/charge forces).
        const cache = positionCacheRef.current;
        nodes.forEach((n: any) => {
            const cached = cache.get(n.id);
            if (cached) {
                n.x = cached.x;
                n.y = cached.y;
            }
        });

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

            // Persist positions so the next data refresh can rehydrate from
            // the same coordinates and avoid the reshuffle jump.
            nodes.forEach((n: any) => {
                if (typeof n.x === 'number' && typeof n.y === 'number') {
                    cache.set(n.id, { x: n.x, y: n.y });
                }
            });
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
export const RoundtableWorkbench: React.FC<{
    thinking: ThinkingFlow;
    isLive: boolean;
    topicLabel?: string;
}> = ({ thinking, isLive, topicLabel }) => {
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

    // ── Memoize graph data so the D3 simulation doesn't thrash on every
    // streaming token. We key on serialized snapshots of ONLY the fields
    // that change the graph structure — adding/removing agents, rounds
    // completing, consensus arriving, modules transitioning from active
    // to completed, and source lists growing. Content streaming, TOC
    // updates, scroll state etc. no longer invalidate the graph.
    const graphStructureKey = useMemo(() => {
        const agents = (thinking.selectedAgentIds || []).join('|');
        const roundsKey = (thinking.rtRounds || [])
            .map(r => r.agents.map(a => `${a.agentId}:${a.verdict || ''}:${a.confidence ?? ''}`).join(','))
            .join(';');
        const c = thinking.rtConsensus;
        const consensusKey = c ? `${c.status}|${c.finalVerdict || ''}|${c.finalConfidence ?? ''}|${c.conflictRate ?? ''}` : '';
        const modulesKey = (thinking.modules || [])
            .map(m => {
                const sources = (m.data as any)?.sources?.length ?? 0;
                const sections = (m.data as any)?.sections?.length ?? 0;
                return `${m.type}:${m.status}:${sources}:${sections}`;
            })
            .join(';');
        return `${agents}#${roundsKey}#${consensusKey}#${modulesKey}#${topicLabel}`;
    }, [thinking, topicLabel]);

    const graphData = useMemo(
        () => buildRealKnowledgeGraph(thinking, topicLabel),
        // Intentionally skip `thinking` reference — we key off the
        // derived structure snapshot so content-only updates don't thrash.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [graphStructureKey],
    );

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
                            <KnowledgeGraphView
                                data={graphData}
                                animate={isLive}
                            />
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
                                                                        <p className="text-[11.5px] leading-relaxed text-gray-700 whitespace-pre-wrap">{renderReasoningWithCitations(a.reasoning)}</p>
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

