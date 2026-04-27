/**
 * aegeanDeepAnalysisTransform.ts
 *
 * Maps aegean's `/investment/analyze` response shape onto the shape the
 * existing Workbench UI expects (the same shape `runConsensusEngine` returns).
 *
 * Goal: the frontend renders the deep-dive exactly like an existing Roundtable
 * result — no new components, no new event types. Just rich data in the same
 * slots: Agent Room roster, Debate tab rounds, D3 knowledge graph, and the
 * bottom markdown report.
 *
 * The aegean response has more structure than the legacy consensus result
 * (bull_case / bear_case / scenarios / masters_panel). We fold that extra
 * structure into a single well-formatted markdown report and keep the rest
 * of the fields identical to what the frontend already reads.
 */

import type { AegeanDeepAnalysisResponse } from './aegeanDeepAnalysis.service.js';

// ── Shape that mirrors `runConsensusEngine`'s return value ──
// (see server/src/services/consensus.service.ts, ~line 135)
export interface TransformedDeepAnalysis {
  groupId: string;
  mode: string;
  consensus: {
    id: string;
    finalAnswer: string;
    confidence: number;
    agentResponses: Array<{
      agentId: string;
      answer: string;
      confidence: number;
    }>;
    weightedVotes: Record<string, number>;
    roundsUsed: number;
    executionTime: number;
    consensusReached: boolean;
    finalSolution: any;
    discussionRounds: any[];
  };
  /** Extra fields unique to deep-dive — optional so existing renderers ignore them gracefully. */
  deepDive?: {
    recommendation: { action: string; confidence: number; rationale?: string };
    bullCase: string[];
    bearCase: string[];
    scenarios: Array<{ name?: string; probability?: number; description?: string }>;
    mastersPanel: Array<{ persona?: string; take?: string }>;
    riskGate?: any;
    knowledgeGraph?: any;
  };
}

// ── Helpers ──
const isZh = (s: string) => /[一-鿿]/.test(s || '');

function escapeMd(s: unknown): string {
  return typeof s === 'string' ? s.trim() : String(s ?? '');
}

/**
 * Detect a Python dict repr like `{'title': '...', 'source': '...'}` that
 * leaked through aegean's external-evidence builder before we fixed it.
 * Extract a readable string; if extraction fails, skip the item entirely.
 */
function cleanDictRepr(s: string): string {
  if (!s.startsWith("{'") && !s.startsWith('{"')) return s;
  const pick = (key: string): string => {
    const m = s.match(new RegExp(`'${key}':\\s*'([^']*)'`)) ||
              s.match(new RegExp(`"${key}":\\s*"([^"]*)"`));
    return m ? m[1].trim() : '';
  };
  const title = pick('title');
  const summary = pick('summary');
  const source = pick('source') || pick('provider');
  const parts: string[] = [];
  if (title) parts.push(title);
  if (summary && summary !== title) {
    parts.push(summary.length > 220 ? summary.slice(0, 220).trimEnd() + '…' : summary);
  }
  let joined = parts.join(' — ');
  if (source) joined = joined ? `${joined} [${source}]` : source;
  return joined || '';  // return '' to signal "skip this item"
}

function formatListBullets(items: unknown[]): string {
  if (!items || !items.length) return '';
  const seenAgentFallback = new Set<string>();
  return items
    .map((it) => {
      let text = '';
      if (typeof it === 'string') {
        text = cleanDictRepr(it.trim());
      } else if (it && typeof it === 'object') {
        const obj = it as Record<string, unknown>;
        const primary = obj.description || obj.text || obj.content || obj.summary || obj.reason;
        text = primary ? escapeMd(primary) : '';
      } else {
        text = escapeMd(it);
      }
      if (!text) return '';
      // Swallow the "[agent_X] Unable to analyze without LLM" fallback strings:
      // they signal upstream LLM outage, not useful analysis, and showing them
      // once per bullet section (summary/bull/bear) pollutes the report.
      const m = text.match(/^\[agent_\d+\]\s*Unable to analyze without LLM\s*$/);
      if (m) {
        if (seenAgentFallback.has(text)) return '';
        seenAgentFallback.add(text);
        return `- _(agent ${text.match(/agent_\d+/)?.[0]} had no LLM response for this question)_`;
      }
      return `- ${text}`;
    })
    .filter(Boolean)
    .join('\n');
}

function formatScenarios(
  scenarios: AegeanDeepAnalysisResponse['scenarios'] = [],
  zh: boolean,
): string {
  if (!scenarios.length) return '';
  const lines: string[] = [];
  for (const s of scenarios) {
    const name = escapeMd(s?.name) || (zh ? '情景' : 'Scenario');
    const prob = typeof s?.probability === 'number' ? ` (${Math.round(s.probability * 100)}%)` : '';
    const desc = escapeMd(s?.description);
    lines.push(`### ${name}${prob}`);
    if (desc) lines.push(desc);
    lines.push('');
  }
  return lines.join('\n').trim();
}

function formatMasters(
  masters: AegeanDeepAnalysisResponse['masters_panel'] = [],
): string {
  if (!masters || !masters.length) return '';
  return masters
    .map((m) => {
      const obj = m as Record<string, unknown>;
      const persona = escapeMd(obj.persona ?? obj.name ?? obj.role);
      const take = escapeMd(obj.take ?? obj.view ?? obj.summary ?? obj.reasoning);
      if (!persona && !take) return '';
      return `- **${persona || 'Master'}**: ${take}`;
    })
    .filter(Boolean)
    .join('\n');
}

function buildMarkdownReport(raw: AegeanDeepAnalysisResponse, userQuestion: string): string {
  const zh = isZh(userQuestion);
  const L = {
    conclusion:    zh ? '## 结论'          : '## Conclusion',
    action:        zh ? '**建议**'          : '**Recommendation**',
    confidence:    zh ? '信心'              : 'Confidence',
    thesis:        zh ? '**核心论点**'      : '**Thesis**',
    drivers:       zh ? '### 关键驱动'      : '### Key Drivers',
    risks:         zh ? '### 关键风险'      : '### Key Risks',
    bullCase:      zh ? '## 看多论据'       : '## Bull Case',
    bearCase:      zh ? '## 看空风险'       : '## Bear Case',
    scenarios:     zh ? '## 情景规划'       : '## Scenarios',
    masters:       zh ? '## 大师视角'       : '## Masters Panel',
    riskGate:      zh ? '## 风险门禁'       : '## Risk Gate',
  };

  const parts: string[] = [];
  const rec = raw.recommendation;
  if (rec) {
    const conf = typeof rec.confidence === 'number'
      ? `${Math.round(rec.confidence <= 1 ? rec.confidence * 100 : rec.confidence)}%`
      : '';
    parts.push(L.conclusion);
    parts.push(`${L.action}: **${escapeMd(rec.action)}** · ${L.confidence} ${conf}`.trim());
    if (rec.decision_rationale) parts.push(escapeMd(rec.decision_rationale));
    parts.push('');
  }

  const summary = raw.summary;
  if (summary?.thesis) {
    parts.push(`${L.thesis}: ${escapeMd(summary.thesis)}`);
    parts.push('');
  }
  const drivers = formatListBullets(summary?.key_drivers || []);
  if (drivers) {
    parts.push(L.drivers);
    parts.push(drivers);
    parts.push('');
  }
  const risks = formatListBullets(summary?.key_risks || []);
  if (risks) {
    parts.push(L.risks);
    parts.push(risks);
    parts.push('');
  }

  const bull = formatListBullets(raw.bull_case || []);
  if (bull) {
    parts.push(L.bullCase);
    parts.push(bull);
    parts.push('');
  }
  const bear = formatListBullets(raw.bear_case || []);
  if (bear) {
    parts.push(L.bearCase);
    parts.push(bear);
    parts.push('');
  }

  const scenarios = formatScenarios(raw.scenarios, zh);
  if (scenarios) {
    parts.push(L.scenarios);
    parts.push(scenarios);
    parts.push('');
  }

  const masters = formatMasters(raw.masters_panel);
  if (masters) {
    parts.push(L.masters);
    parts.push(masters);
    parts.push('');
  }

  const riskGateSummary = (raw.risk_gate?.review_summary ?? raw.risk_gate?.summary) as string | undefined;
  if (riskGateSummary) {
    parts.push(L.riskGate);
    parts.push(escapeMd(riskGateSummary));
    parts.push('');
  }

  return parts.join('\n').trim();
}

function transformAgentResponses(raw: AegeanDeepAnalysisResponse): TransformedDeepAnalysis['consensus']['agentResponses'] {
  // aegean may return either `agent_outputs` or `agents_panel` — prefer
  // `agent_outputs` for the actual per-agent verdicts.
  const source = (raw.agent_outputs?.length ? raw.agent_outputs : raw.agents_panel) || [];
  return source.map((a: any) => ({
    agentId: String(a.agent_id ?? a.agent ?? a.id ?? 'agent'),
    answer: String(a.summary ?? a.reasoning ?? a.view ?? a.take ?? ''),
    confidence: typeof a.confidence === 'number' ? a.confidence : 0,
  }));
}

function transformWeightedVotes(raw: AegeanDeepAnalysisResponse): Record<string, number> {
  // aegean's verdict tally — if absent, derive a simple tally from agent_outputs
  if (raw.consensus?.weighted_votes && typeof raw.consensus.weighted_votes === 'object') {
    return raw.consensus.weighted_votes as Record<string, number>;
  }
  const tally: Record<string, number> = {};
  for (const a of (raw.agent_outputs || []) as any[]) {
    const signal = String(a.signal ?? a.verdict ?? '').toLowerCase();
    if (!signal) continue;
    tally[signal] = (tally[signal] || 0) + (typeof a.confidence === 'number' ? a.confidence : 1);
  }
  return tally;
}

/**
 * Transform aegean's `/investment/analyze` response into the shape the
 * existing Workbench UI already knows how to render.
 */
export function transformAegeanDeepAnalysis(
  raw: AegeanDeepAnalysisResponse,
  userQuestion: string,
): TransformedDeepAnalysis {
  const markdown = buildMarkdownReport(raw, userQuestion);

  const confidence =
    typeof raw.recommendation?.confidence === 'number'
      ? (raw.recommendation.confidence <= 1
          ? raw.recommendation.confidence
          : raw.recommendation.confidence / 100)
      : 0;

  return {
    groupId: raw.request_id || '',
    mode: raw.mode || 'roundtable',
    consensus: {
      id: raw.request_id || '',
      finalAnswer: markdown,
      confidence,
      agentResponses: transformAgentResponses(raw),
      weightedVotes: transformWeightedVotes(raw),
      roundsUsed: raw.consensus?.rounds_used ?? raw.discussion_rounds?.length ?? 1,
      executionTime: typeof raw.metadata?.execution_time === 'number' ? raw.metadata.execution_time : 0,
      consensusReached: raw.recommendation?.action !== undefined,
      finalSolution: {
        answer: markdown,
        confidence,
      },
      discussionRounds: Array.isArray(raw.discussion_rounds) ? raw.discussion_rounds : [],
    },
    deepDive: {
      recommendation: {
        action: raw.recommendation?.action || '',
        confidence,
        rationale: raw.recommendation?.decision_rationale,
      },
      bullCase: Array.isArray(raw.bull_case) ? raw.bull_case.map(escapeMd) : [],
      bearCase: Array.isArray(raw.bear_case) ? raw.bear_case.map(escapeMd) : [],
      scenarios: Array.isArray(raw.scenarios) ? raw.scenarios : [],
      mastersPanel: Array.isArray(raw.masters_panel) ? raw.masters_panel : [],
      riskGate: raw.risk_gate,
      knowledgeGraph: raw.knowledge_graph,
    },
  };
}
