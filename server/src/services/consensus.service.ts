import { config } from '../config.js';

const CONSENSUS_BASE = config.consensus.baseUrl;

export const PRESET_AGENTS = [
  { agent_id: 'agent_0', role: 'risk_analyst', capability_weight: 1.0, specialization: { credit: 0.95, fraud: 0.80 } },
  { agent_id: 'agent_1', role: 'market_analyst', capability_weight: 1.0, specialization: { market: 0.90, valuation: 0.85 } },
  { agent_id: 'agent_2', role: 'research_agent', capability_weight: 1.0, specialization: { news: 0.90, sentiment: 0.80 } },
  { agent_id: 'agent_3', role: 'trading_strategist', capability_weight: 1.0, specialization: { technical: 0.85, strategy: 0.90 } },
];


const AGENT_LABEL_ZH: Record<string, string> = {
  agent_0: '风险分析',
  agent_1: '市场分析',
  agent_2: '研究情报',
  agent_3: '交易策略',
};

const AGENT_ID_ORDER = ['agent_0', 'agent_1', 'agent_2', 'agent_3'] as const;

export function formatConsensusAgentLabel(agentId: string): string {
  const zh = AGENT_LABEL_ZH[agentId];
  if (zh) return `${zh}（${agentId}）`;
  const p = PRESET_AGENTS.find((a) => a.agent_id === agentId);
  return p ? `${p.role}（${agentId}）` : agentId;
}


export function sortConsensusAgentEntries<T>(entries: [string, T][]): [string, T][] {
  return [...entries].sort(([a], [b]) => {
    const ia = AGENT_ID_ORDER.indexOf(a as (typeof AGENT_ID_ORDER)[number]);
    const ib = AGENT_ID_ORDER.indexOf(b as (typeof AGENT_ID_ORDER)[number]);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });
}

export async function pyFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${CONSENSUS_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Python API ${res.status}: ${body}`);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export async function runConsensusEngine(userId: string, mode: string, message: string) {
  const modeMap: Record<string, string> = {
    roundtable: 'consensus',
    collaborate: 'collaboration',
    auto: 'consensus',
    fast: 'collaboration',
  };
  const apiMode = modeMap[mode] || 'consensus';

  // ── Step 1: Create group ─────────────────────────────────
  console.log(`[Consensus] Step 1: Creating group (mode=${apiMode})...`);
  const group = await pyFetch('/groups', {
    method: 'POST',
    body: JSON.stringify({
      group_name: `session_${Date.now()}`,
      description: `User ${userId} session`,
      mode: apiMode,
      created_by: userId,
    }),
  });
  const groupId = group.group_id;
  console.log(`[Consensus] Step 1 ✅ Group created: ${groupId}`);

  // ── Step 2: Add agent members ────────────────────────────
  console.log(`[Consensus] Step 2: Adding ${PRESET_AGENTS.length} agents...`);
  let addedCount = 0;
  for (const agent of PRESET_AGENTS) {
    try {
      await pyFetch(`/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify(agent),
      });
      addedCount++;
    } catch (err: any) {
      console.error(`[Consensus]   ❌ Failed to add ${agent.agent_id}: ${err.message}`);
    }
  }

  if (addedCount === 0) {
    throw new Error('No agents could be added to the group. The Python consensus engine rejected all agent registrations.');
  }

  // ── Step 3: Post user message ────────────────────────────
  console.log(`[Consensus] Step 3: Posting user message...`);
  const msgResult = await pyFetch(`/groups/${groupId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      sender_id: userId,
      sender_type: 'user',
      content: message,
    }),
  });
  const messageId = msgResult.message_id;

  // ── Step 4: Execute consensus ────────────────────────────
  console.log(`[Consensus] Step 4: Executing consensus (threshold=0.6)...`);
  const consensusResult = await pyFetch(`/groups/${groupId}/consensus`, {
    method: 'POST',
    body: JSON.stringify({
      task: message,
      message_id: messageId,
      quorum_threshold: 0.6,
      stability_horizon: 2,
      max_rounds: 3,
    }),
  });
  console.log(`[Consensus] Step 4 ✅ Consensus finished`);
  try {
    const raw = JSON.stringify(consensusResult, null, 2);
    const max = 200_000;
    console.log(
      `[Consensus] FULL API response (${raw.length} chars, log truncated to ${max}):\n${raw.length > max ? raw.slice(0, max) + '\n…[truncated]' : raw}`,
    );
  } catch (e) {
    console.warn('[Consensus] Failed to stringify full response:', e);
  }

  // ── Step 5: Format result ───────────────────────────────
  return {
    groupId,
    mode: apiMode,
    consensus: {
      id: consensusResult.consensus_id,
      finalAnswer: consensusResult.final_solution?.answer || '',
      confidence: consensusResult.final_solution?.confidence || 0,
      agentResponses: (consensusResult.agent_responses || []).map((a: any) => ({
        agentId: a.agent_id,
        answer: a.answer,
        confidence: a.confidence,
      })),
      weightedVotes: consensusResult.weighted_votes || {},
      roundsUsed: consensusResult.rounds_used || 1,
      executionTime: consensusResult.execution_time || 0,
      consensusReached: consensusResult.consensus_reached ?? true,
      finalSolution: consensusResult.final_solution ?? null,
      discussionRounds: Array.isArray(consensusResult.discussion_rounds)
        ? consensusResult.discussion_rounds
        : [],
    },
  };
}
