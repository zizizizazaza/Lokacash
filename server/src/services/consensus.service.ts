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

/**
 * Stream events from aegean's POST /groups/:id/consensus/stream SSE endpoint.
 *
 * Each `data: ...\\n\\n` chunk is a JSON event from the coordinator's
 * event_sink. The terminating event is `{type:'final_result', result:{...}}`
 * — we resolve the returned promise with `result`. Intermediate events are
 * forwarded to `onEvent` so the caller can fire socket emits in real time.
 */
async function streamConsensus(
  groupId: string,
  body: Record<string, unknown>,
  onEvent: (event: ConsensusStreamEvent) => void,
): Promise<any> {
  const url = `${CONSENSUS_BASE}/groups/${groupId}/consensus/stream`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Python SSE ${res.status}: ${text.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let finalResult: any = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE messages are separated by blank lines.
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        const dataLine = part.split('\n').find((l) => l.startsWith('data: '));
        if (!dataLine) continue;
        const json = dataLine.slice('data: '.length).trim();
        if (!json) continue;
        let evt: ConsensusStreamEvent;
        try {
          evt = JSON.parse(json) as ConsensusStreamEvent;
        } catch (parseErr) {
          console.warn('[Consensus SSE] bad JSON:', json.slice(0, 120));
          continue;
        }
        try {
          onEvent(evt);
        } catch (cbErr) {
          console.warn('[Consensus SSE] onEvent threw:', (cbErr as Error).message);
        }
        if (evt.type === 'final_result') finalResult = evt.result;
        if (evt.type === 'error') {
          throw new Error(`aegean stream error: ${evt.message}`);
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }

  if (!finalResult) {
    throw new Error('aegean SSE closed without a final_result event');
  }
  return finalResult;
}

/** Live event from aegean's per-agent SSE stream during consensus. */
export type ConsensusStreamEvent =
  | { type: 'consensus_started'; consensus_id: string; task_preview?: string }
  | { type: 'leader_elected'; consensus_id: string; agent_id: string }
  | { type: 'round_started'; consensus_id: string; round_number: number; is_refinement: boolean }
  | { type: 'agent_completed'; consensus_id: string; agent_id: string; round_number: number; is_refinement: boolean; answer: string; confidence: number }
  | { type: 'agent_failed'; consensus_id: string; agent_id: string; round_number: number; is_refinement: boolean; error: string }
  | { type: 'round_completed'; consensus_id: string; round_number: number; solution_count: number }
  | { type: 'consensus_completed'; consensus_id: string; success: boolean; rounds_used: number; consensus_reached: boolean; execution_time: number }
  | { type: 'final_result'; result: any }
  | { type: 'error'; message: string };

export interface RunConsensusOptions {
  /**
   * Optional list of analyst persona IDs to include in this run.
   * If absent, falls back to PRESET_AGENTS (4 system personas).
   * IDs must exist in ANALYST_CATALOG — unknown IDs are dropped.
   */
  analystIds?: string[];
  /**
   * Optional callback fired for every live event emitted during the
   * consensus run (per-agent completion, round transitions, etc.).
   * When provided, this function uses the SSE streaming endpoint instead
   * of the synchronous POST /consensus and forwards each event to the
   * callback in real time.
   */
  onLiveEvent?: (event: ConsensusStreamEvent) => void;
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
  // max_rounds is computed dynamically from the roster size, not hard-coded.
  // Reasoning: more personas need more refinement turns to read each other's
  // peer stances and adjust. With 4 personas 3 rounds is enough; with 12 you
  // want ~6. Aegean's stability_horizon also kicks in for early-stop when
  // the candidate stops moving (rare with divergent personas, but possible).
  //
  // Tunable via env:
  //   CONSENSUS_MIN_ROUNDS       (default 3) — never go below this
  //   CONSENSUS_MAX_ROUNDS_CAP   (default 6) — hard upper bound (cost gate)
  //   CONSENSUS_ROUNDS_PER_AGENT (default 0.5) — multiplier on roster size
  //   CONSENSUS_STABILITY_HORIZON (default 2) — consecutive stable rounds for early-stop
  //
  // Reference: aegean's own defaults (env.example: AEGEAN_MAX_ROUNDS=5,
  //            ConsensusConfig Pydantic default: 5, group_chat_api: 3).
  const minRounds = Number(process.env.CONSENSUS_MIN_ROUNDS || 3);
  const maxRoundsCap = Number(process.env.CONSENSUS_MAX_ROUNDS_CAP || 6);
  const roundsPerAgent = Number(process.env.CONSENSUS_ROUNDS_PER_AGENT || 0.5);
  const stabilityHorizon = Number(process.env.CONSENSUS_STABILITY_HORIZON || 2);
  const dynamicMaxRounds = Math.min(
    maxRoundsCap,
    Math.max(minRounds, Math.ceil(members.length * roundsPerAgent)),
  );
  console.log(
    `[Consensus] Step 4: Executing consensus (members=${members.length} max_rounds=${dynamicMaxRounds} stability_horizon=${stabilityHorizon} streaming=${options.onLiveEvent ? 'yes' : 'no'})...`,
  );
  const consensusBody = {
    task: message,
    message_id: messageId,
    quorum_threshold: 0.6,
    stability_horizon: stabilityHorizon,
    max_rounds: dynamicMaxRounds,
  };

  let consensusResult: any;
  if (options.onLiveEvent) {
    // ── Streaming path: consume SSE so the caller sees per-agent events ──
    try {
      consensusResult = await streamConsensus(
        groupId,
        consensusBody,
        options.onLiveEvent,
      );
    } catch (sseErr) {
      const msg = (sseErr as Error).message || String(sseErr);
      // Graceful fallback: if aegean hasn't been restarted with the new
      // /consensus/stream endpoint, the server returns 404. Roll back to
      // the synchronous POST so the request still completes, and log a
      // clear hint so the operator knows to restart aegean.
      if (msg.includes('404')) {
        console.warn(
          `[Consensus] /consensus/stream returned 404 — aegean likely needs restart. ` +
          `Falling back to non-streaming POST /consensus.`,
        );
        consensusResult = await pyFetch(`/groups/${groupId}/consensus`, {
          method: 'POST',
          body: JSON.stringify(consensusBody),
        });
      } else {
        throw sseErr;
      }
    }
  } else {
    // ── Legacy synchronous path (no live progress) ──
    consensusResult = await pyFetch(`/groups/${groupId}/consensus`, {
      method: 'POST',
      body: JSON.stringify(consensusBody),
    });
  }
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
