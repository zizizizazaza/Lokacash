import { config } from '../config.js';
import {
  ANALYST_CATALOG,
  SYSTEM_ANALYST_IDS,
  getAnalystById,
  type AnalystPersona,
} from '../catalogs/analysts.js';

const CONSENSUS_BASE = config.consensus.baseUrl;

/**
 * Wire-format agent member record sent to aegean's POST /groups/:id/members.
 *
 * aegean stores the role / capability_weight / specialization as per-group
 * metadata; the underlying system prompt is baked into the MinimalAgent at
 * aegean startup time (see tools/aegean-consensus/main.py + personas.json).
 */
export interface ConsensusGroupMember {
  agent_id: string;
  role: string;
  capability_weight: number;
  specialization: Record<string, number>;
}

function personaToMember(p: AnalystPersona): ConsensusGroupMember {
  return {
    agent_id: p.id,
    role: p.role.en.toLowerCase().replace(/\s+&\s+/g, '_').replace(/\s+/g, '_'),
    capability_weight: 1.0,
    specialization: p.specialization,
  };
}

/**
 * Default roster when the caller does not pick specific analysts.
 * Equal to the 4 mandatory system personas — the minimum legal selection.
 */
export const PRESET_AGENTS: ConsensusGroupMember[] = SYSTEM_ANALYST_IDS
  .map((id) => getAnalystById(id))
  .filter((p): p is AnalystPersona => !!p)
  .map(personaToMember);

/** Catalog display order: system → enhanced → master, preserving list order. */
const CATALOG_AGENT_ORDER: string[] = ANALYST_CATALOG.map((p) => p.id);

export function formatConsensusAgentLabel(agentId: string): string {
  const p = getAnalystById(agentId);
  if (p) return `${p.displayName.zh}（${agentId}）`;
  return agentId;
}

export function sortConsensusAgentEntries<T>(entries: [string, T][]): [string, T][] {
  return [...entries].sort(([a], [b]) => {
    const ia = CATALOG_AGENT_ORDER.indexOf(a);
    const ib = CATALOG_AGENT_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Expand a list of analyst IDs (from frontend Roundtable UI) into group
 * member records. Unknown IDs are silently dropped with a warning.
 */
function buildMembersFromAnalystIds(ids: string[]): ConsensusGroupMember[] {
  const members: ConsensusGroupMember[] = [];
  for (const id of ids) {
    const p = getAnalystById(id);
    if (!p) {
      console.warn(`[Consensus] unknown analystId=${id} — skipped`);
      continue;
    }
    members.push(personaToMember(p));
  }
  return members;
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

export interface RunConsensusOptions {
  /**
   * Optional list of analyst persona IDs to include in this run.
   * If absent, falls back to PRESET_AGENTS (4 system personas).
   * IDs must exist in ANALYST_CATALOG — unknown IDs are dropped.
   */
  analystIds?: string[];
}

export async function runConsensusEngine(
  userId: string,
  mode: string,
  message: string,
  options: RunConsensusOptions = {},
) {
  const modeMap: Record<string, string> = {
    roundtable: 'consensus',
    collaborate: 'collaboration',
    auto: 'consensus',
    fast: 'collaboration',
  };
  const apiMode = modeMap[mode] || 'consensus';

  // Pick roster: caller-supplied analystIds (from Roundtable UI) takes
  // precedence over PRESET_AGENTS (default 4 system personas).
  const members: ConsensusGroupMember[] =
    options.analystIds && options.analystIds.length > 0
      ? buildMembersFromAnalystIds(options.analystIds)
      : [...PRESET_AGENTS];

  if (members.length === 0) {
    throw new Error(
      'Consensus refused: no valid analyst IDs resolved from input ' +
      `(analystIds=${JSON.stringify(options.analystIds ?? [])}).`,
    );
  }

  console.log(
    `[Consensus] roster resolved: count=${members.length} ids=${members.map((m) => m.agent_id).join(',')}`,
  );

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
  console.log(`[Consensus] Step 2: Adding ${members.length} agents...`);
  let addedCount = 0;
  for (const agent of members) {
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
      stability_horizon: 1,
      max_rounds: 2,
    }),
  });
  console.log(`[Consensus] Step 4 ✅ Consensus finished`);
  try {
    const raw = JSON.stringify(consensusResult, null, 2);
    const max = 200_000;
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
