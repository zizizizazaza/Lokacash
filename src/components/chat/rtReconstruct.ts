// Roundtable reconstruction helpers — convert backend metadata / consensus
// payloads into the rtRounds / rtConsensus / RoundtableData shapes the UI
// renders. Extracted from SuperAgentChat.tsx during the Phase-1 refactor.
import type {
    AnalysisModuleData,
    ConsensusRound,
    RoundtableAgentVote,
    RoundtableData,
    RtAgentInference,
    RtConsensusResult,
    RtDataCategory,
    RtRoundData,
    SearchModuleData,
    ThinkingModule,
    Web3ModuleData,
} from './types';
import { SOCIAL_DOMAINS, ROUNDTABLE_AGENTS } from './constants';
import { SUMMON_POOL, parsePersonaVerdict, parsePersonaReasoning } from './persona';

/**
 * Reconstruct the round-by-round debate from a saved chat message's metadata.
 *
 * Priority order — pick the first source that has real data:
 *   1. `meta.liveDebateLog` — flat array of every per-agent-per-round event
 *      the SSE stream emitted. The truth: 18 turns across 3 rounds for a
 *      typical 6-agent run.
 *   2. `meta.consensusResult.consensus.discussionRounds` — aegean's structured
 *      summary, often compressed (drops rounds where no one shifted position).
 *   3. `meta.consensusResult.consensus.agentResponses` — final-round only,
 *      good for at least painting the conclusion when the structured rounds
 *      are missing entirely.
 *
 * Returns `null` when no real data is available.
 */
export function reconstructRtFromMetadata(meta: any): {
    selectedAgentIds: string[];
    rtRounds: RtRoundData[];
    rtConsensus?: RtConsensusResult;
} | null {
    if (!meta || typeof meta !== 'object') return null;

    const agentNameMap: Record<string, string> = {
        agent_0: 'Fundamental Analyst',
        agent_1: 'Macro Strategist',
        agent_2: 'Sentiment Engine',
        agent_3: 'Quant Tracker',
    };
    const nameOf = (id: string) => agentNameMap[id] || id;

    let rtRounds: RtRoundData[] = [];
    const allAgentIds = new Set<string>();

    // Source 1 — live debate log (preferred)
    const live = Array.isArray(meta.liveDebateLog) ? meta.liveDebateLog : null;
    if (live && live.length > 0) {
        const byRound = new Map<number, RtAgentInference[]>();
        for (const e of live) {
            const r = Number(e.round);
            const aid = String(e.agentId || '');
            if (!Number.isFinite(r) || !aid) continue;
            allAgentIds.add(aid);
            if (!byRound.has(r)) byRound.set(r, []);
            byRound.get(r)!.push({
                agentId: aid,
                agentName: nameOf(aid),
                status: 'done',
                verdict: parsePersonaVerdict(e.answer || ''),
                confidence: Math.round((Number(e.confidence) || 0) * 100),
                reasoning: parsePersonaReasoning(e.answer || ''),
            });
        }
        for (const round of [...byRound.keys()].sort((a, b) => a - b)) {
            rtRounds.push({ round, status: 'done', agents: byRound.get(round)! });
        }
        // Detect changedMind across rounds (R1 → Rn verdict diff)
        if (rtRounds.length > 1) {
            const initialByAgent = new Map<string, string>();
            for (const a of rtRounds[0].agents) initialByAgent.set(a.agentId, a.verdict || '');
            for (let r = 1; r < rtRounds.length; r++) {
                for (const a of rtRounds[r].agents) {
                    const init = initialByAgent.get(a.agentId);
                    if (init && a.verdict && init !== a.verdict) {
                        a.changedMind = true;
                        a.previousVerdict = init;
                    }
                }
            }
        }
    }

    // Source 2 — aegean discussionRounds (fallback)
    if (rtRounds.length === 0) {
        const consensus = meta.consensusResult?.consensus;
        const discussionRounds: any[] = consensus?.discussionRounds || [];
        if (discussionRounds.length > 0) {
            discussionRounds.forEach((dr: any, rIdx: number) => {
                const map: Record<string, any> = dr.agent_responses || {};
                const agents: RtAgentInference[] = [];
                for (const [aid, resp] of Object.entries(map)) {
                    allAgentIds.add(aid);
                    const r = resp as any;
                    agents.push({
                        agentId: aid,
                        agentName: nameOf(aid),
                        status: 'done',
                        verdict: r?.verdict || parsePersonaVerdict(r?.answer || ''),
                        confidence: Math.round((Number(r?.confidence) || 0) * 100),
                        reasoning: parsePersonaReasoning(r?.answer || r?.reasoning || ''),
                    });
                }
                rtRounds.push({ round: rIdx + 1, status: 'done', agents });
            });
        }
    }

    // Source 3 — agentResponses (last-resort single round)
    if (rtRounds.length === 0) {
        const consensus = meta.consensusResult?.consensus;
        const responses: any[] = consensus?.agentResponses || [];
        if (responses.length > 0) {
            const agents: RtAgentInference[] = responses.map((r: any) => {
                allAgentIds.add(r.agentId);
                return {
                    agentId: r.agentId,
                    agentName: nameOf(r.agentId),
                    status: 'done',
                    verdict: r.verdict || parsePersonaVerdict(r.answer || ''),
                    confidence: Math.round((Number(r.confidence) || 0) * 100),
                    reasoning: parsePersonaReasoning(r.answer || r.reasoning || ''),
                };
            });
            rtRounds.push({ round: 1, status: 'done', agents });
        }
    }

    if (rtRounds.length === 0) return null;

    const consensus = meta.consensusResult?.consensus;
    const rawConf = Number(consensus?.confidence ?? 0);
    let finalConfPct = Math.round(rawConf > 1 ? rawConf : rawConf * 100);
    const lastRoundAgents = rtRounds[rtRounds.length - 1].agents;
    if (finalConfPct <= 0 && lastRoundAgents.length > 0) {
        const sum = lastRoundAgents.reduce((s, a) => s + (a.confidence || 0), 0);
        finalConfPct = Math.round(sum / lastRoundAgents.length);
    }
    if (finalConfPct <= 0) finalConfPct = 50;

    const tally: Record<string, number> = { Bullish: 0, Bearish: 0, Neutral: 0 };
    const conclusions: { agentName: string; verdict: string; confidence: number }[] = [];
    for (const a of lastRoundAgents) {
        const v = (a.verdict || 'Neutral').toString();
        const norm = /bull|long|看多/i.test(v) ? 'Bullish' : /bear|short|看空/i.test(v) ? 'Bearish' : 'Neutral';
        tally[norm] = (tally[norm] || 0) + 1;
        conclusions.push({ agentName: a.agentName || a.agentId, verdict: norm, confidence: a.confidence || 0 });
    }
    const finalVerdict = (Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] as string) || 'Neutral';
    const majorityCount = tally[finalVerdict] || 0;
    const conflictRate = lastRoundAgents.length > 0
        ? Math.round(((lastRoundAgents.length - majorityCount) / lastRoundAgents.length) * 100)
        : 0;

    const rtConsensus: RtConsensusResult = {
        status: 'done',
        hasConsensus: consensus?.consensusReached !== false,
        conflictRate,
        agentConclusions: conclusions,
        finalVerdict,
        finalConfidence: finalConfPct,
    };

    return {
        selectedAgentIds: Array.from(allAgentIds),
        rtRounds,
        rtConsensus,
    };
}

export function buildDemoRtFields() {
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

/**
 * Derive Roundtable Data Collection categories from the live thinking `modules`.
 *
 * Market Indicators come from the real `analysis` module's stages[].result[].label.
 * News & Social sources come from the real `search` module. Category status is
 * derived from the underlying module status so the panel can update live as
 * events stream in — not only at consensus_done.
 */
export const deriveRtDataSearchFromModules = (modules: ThinkingModule[]): RtDataCategory[] => {
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
export const reconstructRtFieldsFromConsensus = (
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
        const agents = agentResponses.map((r: any) => toAgent(r.agentId, r));
        rtRounds.push({ round: 1, status: 'done', agents });
        if (roundsUsed > 1) {
            const r2agents = agents.map(a => ({
                ...a,
                crossReferences: agents.filter(o => o.agentId !== a.agentId).map(o => o.agentName),
            }));
            rtRounds.push({ round: 2, status: 'done', agents: r2agents });
        }
    }

    const consensusReached = consensus.consensusReached !== false;
    const finalText = consensus.finalAnswer || '';
    const verdictMatch = finalText.match(/\*\*Verdict:\*\*\s*([^\n*]+)/i);

    const allAgents = rtRounds.length > 0 ? rtRounds[rtRounds.length - 1].agents : [];
    const normVerdict = (v?: string): string => {
        const s = (v || 'Neutral').toLowerCase();
        if (s.includes('bull') || s.includes('positive') || s.includes('long')) return 'Bullish';
        if (s.includes('bear') || s.includes('negative') || s.includes('short')) return 'Bearish';
        return 'Neutral';
    };
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
export const buildRoundtableFromConsensus = (result: any): RoundtableData => {
    const consensus = result?.consensus;
    if (!consensus) return { rounds: [], finalVerdict: { summary: '', confidence: 0 } };

    const consensusReached: boolean = consensus.consensusReached !== false;

    const agentNameMap: Record<string, { name: string; initials: string }> = {};
    ROUNDTABLE_AGENTS.forEach(a => { agentNameMap[a.agentId] = { name: a.name, initials: a.initials }; });

    const toVote = (agentId: string, resp: any, idx: number): RoundtableAgentVote => {
        const meta = agentNameMap[agentId] || ROUNDTABLE_AGENTS[idx] || { name: agentId, initials: '??', agentId };
        const conf = Math.round((resp.confidence ?? 0) * 100);
        const fullText = resp.answer || resp.reasoning || '';
        return {
            name: meta.name,
            initials: meta.initials,
            agentId,
            answer: '',
            reasoning: fullText,
            confidence: conf,
        };
    };

    const discussionRounds: any[] = consensus.discussionRounds || [];
    const rounds: ConsensusRound[] = [];

    if (discussionRounds.length > 0) {
        let prevFingerprint = '';
        for (const dr of discussionRounds) {
            const roundNum: number = dr.round_number ?? (rounds.length + 1);
            const agentMap: Record<string, any> = dr.agent_responses || {};
            const agents: RoundtableAgentVote[] = [];
            let idx = 0;
            for (const ra of ROUNDTABLE_AGENTS) {
                const resp = agentMap[ra.agentId];
                if (resp) {
                    agents.push(toVote(ra.agentId, resp, idx));
                }
                idx++;
            }
            for (const [aid, resp] of Object.entries(agentMap)) {
                if (!ROUNDTABLE_AGENTS.some(a => a.agentId === aid)) {
                    agents.push(toVote(aid, resp, agents.length));
                }
            }

            const fingerprint = agents.map(a => a.reasoning).join('|||');
            if (fingerprint === prevFingerprint && rounds.length > 0) {
                rounds[rounds.length - 1].status = 'reached';
                rounds[rounds.length - 1].summary = `${agents.length} experts reached consensus.`;
                continue;
            }
            prevFingerprint = fingerprint;

            const isLastRound = dr === discussionRounds[discussionRounds.length - 1];
            const status: 'forming' | 'reached' | 'diverging' =
                dr.consensus_status === 'reached' || dr.consensus_status === 'diverging'
                    ? dr.consensus_status
                    : isLastRound
                        ? (consensusReached ? 'reached' : 'diverging')
                        : 'diverging';

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
