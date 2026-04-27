# Aegean Deep Analysis Migration Plan

**Status:** In Progress
**Owner:** juncheng
**Started:** 2026-04-23
**Target completion:** 2026-05-14 (~3 weeks)

---

## Background

As of 2026-04-23, the teammate working on `aegean-consensus` pushed a major upstream upgrade (22 commits, ~7000 lines) on `feat/only-super-agent` → upstream `dev`. The big addition is the `investment/` module: 7 data providers (YFinance/Tushare/FMP/Finnhub/CoinGecko/Tavily/Exa/SerpAPI), a 3-layer sentiment pipeline, Masters-style analyst personas (Buffett/Munger/Burry/Lynch/Wood), adversarial Bull/Bear/Risk/Chair debate, portfolio risk engine, backtest engine with role memory, and PDF/10-K document analysis. All exposed via a single `POST /investment/analyze` endpoint.

**Current state:**
- Our Roundtable mode orchestrates Phase 1 data gathering (research + web3Router + stockAnalysisService) in Node, packs everything into a big text prompt, then calls aegean's old `/consensus` endpoint for multi-agent debate.
- Aegean's new `/investment/analyze` endpoint is NOT called anywhere (`runInvestmentAnalysis` is dead code).
- User research shows 90% of Roundtable queries are "analyze [specific stock/coin]" — a natural fit for `/investment/analyze`.

**Goal:** Route single-asset Roundtable questions to aegean's `/investment/analyze`, get the richer analysis (Masters + Bull/Bear + structured output) for free. Fall back to Fast mode for non-single-asset questions (~10%).

---

## Decisions

| # | Question | Decision |
|---|----------|----------|
| Q1 | Non-single-asset questions (10%) — how to degrade? | **A. Silent fallback to Fast mode** with a top-bar toast "未识别到具体资产，已切换到 Fast 模式" |
| Q2 | Asset extraction method? | **B (LLM only, no regex)** — call lightweight DeepSeek prompt; regex had bad results previously |
| Q3 | Frontend changes? | **None.** Map aegean response into Ellie's existing Workbench UI. New data, old components. |
| Q4 | Fast mode? | **Unchanged.** Keep current Node-orchestrated multi-tool parallel + LLM synthesis. |

---

## Architecture

```
                         User message
                              ↓
                    ┌────────────────────┐
                    │  Auto Router       │
                    │  (existing)        │
                    └────────────────────┘
                              ↓
         ┌────────────────────┴────────────────────┐
         ▼                                         ▼
  ┌──────────────┐                      ┌──────────────────────┐
  │  Fast mode   │                      │  Roundtable mode     │
  │  (unchanged) │                      │                      │
  └──────────────┘                      │  ┌─ extractAsset() ─┐│
                                        │  │  LLM call         ││
                                        │  └──────┬────────────┘│
                                        │         ↓             │
                                        │   ┌─────┴──────┐     │
                                        │   │ asset?     │     │
                                        │   └──┬────┬────┘     │
                                        │  Yes │    │ No       │
                                        │      ↓    ↓          │
                                        │  aegean  silent      │
                                        │  /inv-   fallback    │
                                        │  estment/ to Fast    │
                                        │  analyze + toast     │
                                        │      │               │
                                        │      ↓               │
                                        │  translate events    │
                                        │  → existing emitter  │
                                        │                      │
                                        │  transform response  │
                                        │  → markdown+agents+  │
                                        │    rounds+graph      │
                                        └──────────────────────┘
```

---

## Phase 0 — Local verification & deploy (user-driven)

**Depends on:** Today's aegean replacement (already done — upstream dev copied into `server/tools/aegean-consensus/`, backup saved to `/e/temp/aegean-backups/`).

**Goal:** Verify the upstream aegean boots cleanly and the existing Roundtable path still works BEFORE starting Phase 1 code.

### Checklist

- [ ] Commit aegean replacement + `.gitignore` update
- [ ] Rebuild Python venv via the existing npm script (auto-handles Python 3.11 + pip upgrade + deps):
  ```bash
  cd server
  npm run setup:aegean:win     # Windows
  # OR
  npm run setup:aegean:linux   # Linux/Mac server
  ```
- [ ] Start aegean locally: `npm run dev:aegean` (from `server/`, already scripted with reload)
  - Or start full stack: `npm run dev` (Node + aegean concurrently)
- [ ] `curl http://localhost:8100/health` → expect 200 OK
- [ ] Start lokacash dev (Node backend + frontend)
- [ ] Send a Roundtable message end-to-end — confirm the OLD flow still works (calls `/groups` + `/consensus`, returns a report)
- [ ] Commit this milestone, push `dev`
- [ ] Server deploy: `pm2 restart Aegean && pm2 logs Aegean` — observe for errors

**If anything breaks, roll back with `tar xzf /e/temp/aegean-backups/aegean-consensus-*.tgz -C server/tools/` and investigate.**

---

## Phase 1 — Backend: asset extractor + aegean client (Claude-driven)

**Depends on:** Phase 0 green.
**Est:** 2-3 days.

### 1.1 LLM-based asset extractor

**New file:** `server/src/services/assetExtractor.ts`

```typescript
export type AssetInfo = {
    symbol: string;
    market: 'US' | 'HK' | 'CN' | 'CRYPTO';
    asset_type: 'stock' | 'crypto' | 'bond' | 'other';
    display_name?: string;
};

export async function extractAsset(userMessage: string): Promise<AssetInfo | null>;
```

- Calls a lightweight DeepSeek prompt asking for JSON `{ symbol, market, asset_type }` or `{ symbol: null }` for macro/multi-asset/open questions
- Parses and validates JSON response
- Returns `null` on any ambiguity (safer to fall through to Fast than error)
- Log the extraction result for observability

### 1.2 Aegean `/investment/analyze` client

**New file:** `server/src/services/aegeanDeepAnalysis.service.ts`

```typescript
export async function runAegeanDeepAnalysis(
    userId: string,
    asset: AssetInfo,
    userQuestion: string,
    onEvent: (e: AegeanEvent) => void
): Promise<InvestmentAnalysisResponse>;
```

- Calls `POST /investment/analyze` via existing `pyFetch` helper
- Builds the `InvestmentAnalysisRequest` payload with `custom_question = userQuestion`
- Streams events back via `onEvent` callback (for Phase 2 translation)

### 1.3 Socket handler routing

**Modify:** `server/src/socket/index.ts` → `agent:chat` handler, Roundtable branch.

Logic:
```
if (routedMode === 'roundtable') {
  const asset = await extractAsset(userContent);
  if (asset) {
    await runAegeanDeepAnalysis(...)
  } else {
    emitter.emitModule('info', 'active', { hint: '未识别到具体资产，已切换到 Fast 模式' });
    // downgrade to Fast path
  }
}
```

**Deliverable:** End-to-end call works locally. Given "分析 AAPL", the new path runs; given "美联储降息影响", Fast path runs with toast.

---

## Phase 2 — Event translation + Fast fallback (Claude-driven)

**Depends on:** Phase 1 complete.
**Est:** 2 days.

### Event mapping table

| aegean event | existing emitter module |
|--------------|-------------------------|
| `analysis_started` | `summon` active |
| `agents_selected` | `summon` done (also push roster data) |
| `normalized_data_ready` | `research` done |
| `masters_consultation_*` | `debate` active (sub-type `masters`) |
| `bull_bear_debate_round` | `debate` active (sub-type `bull_bear`) |
| `risk_gate_applied` | `consensus` active |
| `recommendation_synthesized` | `report` done |

**New helper:** `translateAegeanEvent(event, emitter, state)` — maintains round counters, de-dupes, maps event payload to the shape the frontend Workbench expects.

### Fast fallback refinement

- Reuse existing Fast path function (extract out of `agent:chat` handler if needed)
- Emit a one-time `info` event so the frontend can show the top-bar toast
- Persist the hint in the saved message metadata so the toast also appears on history replay

---

## Phase 3 — Data transformation for existing Workbench UI (Claude-driven)

**Depends on:** Phase 2 complete.
**Est:** 2-3 days.

### Transform function

**New helper:** `transformAegeanToFrontend(result: InvestmentAnalysisResponse)` returning the shape the existing Workbench expects:

| existing field (GroupConsensusResult) | source in aegean response |
|---------------------------------------|---------------------------|
| `finalAnswer` (markdown string) | Built from `recommendation` + `summary` + `bull_case` + `bear_case` + `scenarios` + `masters_panel` |
| `agentResponses` (Agent Room roster) | `agents_panel` |
| `discussionRounds` (Debate tab) | `discussion_rounds` |
| `knowledgeGraph` (D3 Graph) | `knowledge_graph` |
| `confidence` | `recommendation.confidence` |

### Markdown template

A standardized layout so aegean's structured output looks consistent with existing Roundtable reports:

```markdown
## 结论
**{{action}} · 信心 {{confidence}}%**

{{summary}}

## 看多论据
- {{bull_case[0]}}
- ...

## 看空风险
- {{bear_case[0]}}
- ...

## 情景规划
### 牛市情景
{{scenarios.bull}}
### 中性情景
{{scenarios.base}}
### 熊市情景
{{scenarios.bear}}

## 大师观点
- **{{masters_panel[0].persona}}**: {{masters_panel[0].take}}
- ...
```

**Deliverable:** A single Roundtable deep-dive returns data that the existing frontend renders WITHOUT any frontend code change. The agent roster, debate tab, graph, and main report all populate correctly.

---

## Phase 4 — Rollout (user-driven + Claude-supported)

**Depends on:** Phase 3 complete.

### Steps

- [ ] Add feature flag `ENABLE_AEGEAN_DEEP_ANALYSIS=false` to `server/.env`
- [ ] Guard the new code path behind the flag
- [ ] Deploy to `LokaCash_testnet` (not production) first
- [ ] Manual regression: 10 test questions (5 single-asset, 5 open) — verify correct routing + rendering
- [ ] Flip flag to `true` on testnet, observe 24 hours
- [ ] Flip flag to `true` on production
- [ ] Monitor: aegean `/investment/analyze` error rate, latency distribution, Fast-fallback hit rate

### Rollback

Flip the flag to `false` — code path reverts to existing Roundtable immediately, no deploy needed.

---

## Open questions / risks

| # | Item | Status |
|---|------|--------|
| 1 | aegean `/investment/analyze` latency for non-trivial assets (need to benchmark) | Pending Phase 0 |
| 2 | Does aegean's event_sink stream events incrementally or all at end? (affects streaming UX) | Pending Phase 0 |
| 3 | Debate round count: aegean may use 2 rounds where existing UI assumes 3 — need tolerance | Pending Phase 2 |
| 4 | If asset extractor LLM is down, whole Roundtable fails — needs a timeout + graceful skip | Pending Phase 1 |
| 5 | Historical messages saved with old `/consensus` shape — do NOT need migration, replay still works (shapes are transformed server-side now) | No action |

---

## Progress log

| Date | Phase | Action | Status |
|------|-------|--------|--------|
| 2026-04-23 | 0 | Upstream aegean copied in, backup taken | ✅ Done |
| 2026-04-23 | — | Plan doc written | ✅ Done |
| 2026-04-23 | 1.1 | `server/src/services/assetExtractor.ts` — LLM-only asset extraction | ✅ Done |
| 2026-04-23 | 1.2 | `server/src/services/aegeanDeepAnalysis.service.ts` — `/investment/analyze` client (180s timeout, abort-on-timeout) | ✅ Done |
| 2026-04-23 | 3 | `server/src/services/aegeanDeepAnalysisTransform.ts` — aegean → Workbench shape + markdown report template | ✅ Done |
| 2026-04-23 | 1.3 + 2 | Socket handler early gate (`ENABLE_AEGEAN_DEEP_ANALYSIS` flag, OFF by default) + minimal stepper emission + DB persist + Fast fallback on no-asset | ✅ Done (v1, no live streaming) |
| 2026-04-23 | — | Full server `tsc --noEmit` passes with zero new errors | ✅ Done |
| | 0 | Venv rebuild + local smoke test | ⏳ Waiting for user |
| | 0 | Deploy to server | ⏳ Waiting for user |
| | 2 | Live event translation (replace stub stepper emission with aegean `event_sink` → emitter mapping) | ⏳ Not started |
| | 3 | Polish markdown template + verify Workbench renders `deepDive` extras correctly | ⏳ Not started |
| | 4 | Enable flag on testnet + 24h observation | ⏳ Not started |
| | 4 | Enable flag on production | ⏳ Not started |

### Files touched today

- `server/src/services/assetExtractor.ts` (new)
- `server/src/services/aegeanDeepAnalysis.service.ts` (new)
- `server/src/services/aegeanDeepAnalysisTransform.ts` (new)
- `server/src/socket/index.ts` (3 new imports + early gate block ~90 lines, feature-flag-gated)

### How to enable

Set on server:
```
ENABLE_AEGEAN_DEEP_ANALYSIS=true
```
Default is unset/off → legacy Roundtable path unchanged. Flip off to instantly revert without a redeploy.

### v1 limitation (acknowledged, tracked)

Stepper events are emitted at aegean-call boundaries only (before + after), not live during aegean's internal reasoning. Workbench will show "Research active → Debate done → Consensus done" in quick succession at the end of the call rather than smoothly progressing. Phase 2 replaces this stub with real event streaming.

---

## How to use this doc

- **Every phase completion**, Claude updates the progress-log table and checks the boxes in the relevant phase section.
- **Every blocker or design tweak**, add a row to "Open questions / risks" with a resolution once answered.
- This doc is the single source of truth for this migration — don't track status in commit messages alone.
