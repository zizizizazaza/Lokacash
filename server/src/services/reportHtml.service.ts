/**
 * Report HTML generation service
 * ==============================================================
 *
 * Builds the self-contained HTML report that renders after an
 * investment-analysis / guru-council / deep-research turn.
 *
 * Design note (2026-04-23 refactor):
 *
 *   Previously the full `<style>` block (~9 KB / ~2300 tokens for the web
 *   report, ~6.5 KB / ~1600 tokens for guru council) was embedded in the
 *   prompt and the model was asked to re-emit it on every call. That meant
 *   every generation paid 2-3K input tokens AND 2-3K output tokens just to
 *   re-produce the same CSS.
 *
 *   Now the CSS lives here as a module-level constant. The prompt only
 *   references class names; the server prepends a single `<style>` block
 *   before returning the HTML so the output stays fully self-contained
 *   (the frontend code that renders it is unchanged).
 */

import { LokaAIService } from './ai.service.js';

const aiService = new LokaAIService();


// ============================================================================
// CSS blocks (extracted from prior per-prompt <style>; kept verbatim)
// ============================================================================

const WEB_REPORT_CSS = `
  .report-wrap { max-width: 880px; margin: 0 auto; padding: 2rem 1rem 1rem; font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); }

  /* Header */
  .report-header { border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); padding-bottom: 1.5rem; margin-bottom: 2rem; }
  .report-label { font-size: 11px; letter-spacing: 0.12em; color: var(--color-text-tertiary, #999); text-transform: uppercase; margin-bottom: 0.5rem; }
  .report-title { font-size: 22px; font-weight: 500; color: var(--color-text-primary, #1a1a1a); line-height: 1.4; margin-bottom: 1rem; }
  .report-verdict { display: inline-flex; align-items: center; gap: 8px; background: var(--color-background-secondary, #f5f5f5); border: 0.5px solid var(--color-border-tertiary, #e5e5e5); border-radius: 8px; padding: 6px 14px; font-size: 13px; }
  .verdict-dot { width: 8px; height: 8px; border-radius: 50%; }

  /* KPI Cards */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 2rem; }
  .kpi-card { background: var(--color-background-secondary, #f5f5f5); border-radius: 8px; padding: 14px 16px; }
  .kpi-label { font-size: 11px; color: var(--color-text-tertiary, #999); margin-bottom: 6px; }
  .kpi-value { font-size: 20px; font-weight: 500; color: var(--color-text-primary, #1a1a1a); }
  .kpi-sub { font-size: 11px; color: var(--color-text-tertiary, #999); margin-top: 2px; }
  .kpi-up { color: #3B6D11; } .kpi-dn { color: #A32D2D; }

  /* Sections */
  .section { margin-bottom: 2rem; }
  .section-title { font-size: 13px; font-weight: 500; color: var(--color-text-secondary, #666); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 1rem; padding-bottom: 6px; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); }

  /* Thesis box */
  .thesis-box { background: var(--color-background-secondary, #f5f5f5); border-left: 2px solid #378ADD; padding: 14px 16px; font-size: 14px; line-height: 1.7; margin-bottom: 1rem; }

  /* Catalysts */
  .catalyst-list { display: flex; flex-direction: column; gap: 8px; }
  .catalyst-item { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; line-height: 1.6; }
  .catalyst-num { min-width: 20px; height: 20px; border-radius: 50%; background: #E6F1FB; color: #185FA5; font-size: 11px; font-weight: 500; display: flex; align-items: center; justify-content: center; margin-top: 2px; }

  /* Layout */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem; }

  /* Tables */
  .seg-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .seg-table th { font-size: 11px; font-weight: 500; color: var(--color-text-tertiary, #999); text-align: right; padding: 6px 0; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); }
  .seg-table th:first-child { text-align: left; }
  .seg-table td { padding: 8px 0; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); text-align: right; }
  .seg-table td:first-child { text-align: left; color: var(--color-text-secondary, #666); }

  /* Bar charts (CSS) */
  .bar-mini { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; }
  .bar-mini-label { min-width: 80px; color: var(--color-text-secondary, #666); }
  .bar-mini-track { flex: 1; height: 6px; background: var(--color-background-secondary, #f5f5f5); border-radius: 3px; overflow: hidden; }
  .bar-mini-fill { height: 100%; border-radius: 3px; }
  .bar-mini-val { min-width: 30px; text-align: right; font-weight: 500; }

  /* Scenario cards */
  .scenario-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 2rem; }
  .scenario-card { border: 0.5px solid var(--color-border-tertiary, #e5e5e5); border-radius: 12px; padding: 14px; }
  .sc-label { font-size: 11px; font-weight: 500; margin-bottom: 6px; }
  .sc-price { font-size: 22px; font-weight: 500; margin-bottom: 4px; }
  .sc-prob { font-size: 12px; color: var(--color-text-tertiary, #999); margin-bottom: 8px; }
  .sc-tag { font-size: 11px; color: var(--color-text-secondary, #666); line-height: 1.5; }
  .sc-bull { border-top: 2px solid #639922; } .sc-base { border-top: 2px solid #378ADD; }
  .sc-flat { border-top: 2px solid #888780; } .sc-bear { border-top: 2px solid #E24B4A; }

  /* Risk table */
  .risk-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .risk-table th { font-size: 11px; font-weight: 500; color: var(--color-text-tertiary, #999); text-align: left; padding: 6px 8px; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); }
  .risk-table td { padding: 9px 8px; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); vertical-align: top; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
  .pill-low { background: #EAF3DE; color: #3B6D11; } .pill-mid { background: #FAEEDA; color: #854F0B; } .pill-high { background: #FAECE7; color: #993C1D; }

  /* Expert rows */
  .expert-row { display: flex; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); font-size: 13px; }
  .expert-row:last-child { border-bottom: none; }
  .expert-name { min-width: 90px; color: var(--color-text-secondary, #666); }
  .expert-view { flex: 1; }
  .conf-bar { width: 80px; height: 6px; background: var(--color-background-secondary, #f5f5f5); border-radius: 3px; overflow: hidden; }
  .conf-fill { height: 100%; border-radius: 3px; background: #378ADD; }

  /* Expert debate cards */
  .expert-card { border: 0.5px solid var(--color-border-tertiary, #e5e5e5); border-radius: 12px; padding: 16px; margin-bottom: 10px; }
  .expert-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .expert-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--color-background-secondary, #f5f5f5); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; color: var(--color-text-secondary, #666); }
  .expert-meta { flex: 1; }
  .expert-label { font-size: 13px; font-weight: 600; color: var(--color-text-primary, #1a1a1a); }
  .expert-signal { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .expert-signal-bullish { background: #DCFCE7; color: #166534; }
  .expert-signal-bearish { background: #FEE2E2; color: #991B1B; }
  .expert-signal-neutral { background: #FEF3C7; color: #92400E; }
  .expert-body { font-size: 13px; line-height: 1.7; color: var(--color-text-primary, #1a1a1a); }
  .expert-conf { margin-top: 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--color-text-tertiary, #999); }

  /* Debate section */
  .debate-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); }
  .debate-item:last-child { border-bottom: none; }
  .debate-label { font-size: 11px; font-weight: 500; color: #185FA5; background: #E6F1FB; padding: 2px 8px; border-radius: 8px; white-space: nowrap; height: fit-content; }
  .debate-text { font-size: 13px; line-height: 1.6; color: var(--color-text-primary, #1a1a1a); }

  /* Consensus panel */
  .consensus-panel { background: var(--color-background-secondary, #f5f5f5); border-radius: 12px; padding: 20px; margin-bottom: 2rem; }
  .consensus-verdict { font-size: 18px; font-weight: 500; margin-bottom: 8px; }
  .consensus-detail { font-size: 13px; line-height: 1.7; color: var(--color-text-secondary, #666); }

  /* Monitor & Trade */
  .monitor-list { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .monitor-item { background: var(--color-background-secondary, #f5f5f5); border-radius: 8px; padding: 12px 14px; }
  .m-label { font-size: 11px; color: var(--color-text-tertiary, #999); margin-bottom: 4px; }
  .m-current { font-size: 15px; font-weight: 500; }
  .m-trigger { font-size: 11px; color: #185FA5; margin-top: 2px; }
  .trade-box { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .trade-card { border: 0.5px solid var(--color-border-tertiary, #e5e5e5); border-radius: 8px; padding: 12px 14px; }
  .t-label { font-size: 11px; color: var(--color-text-tertiary, #999); margin-bottom: 4px; }
  .t-value { font-size: 14px; font-weight: 500; }

  /* Lists */
  .report-wrap ul, .report-wrap ol { padding-left: 1.2em; margin: 0.5rem 0; }
  .report-wrap li { font-size: 13px; line-height: 1.7; color: var(--color-text-primary, #1a1a1a); margin-bottom: 4px; text-align: left; }
  .report-wrap ul { list-style: disc; }
  .report-wrap ol { list-style: decimal; }

  /* Responsive */
  @media (max-width: 600px) {
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .two-col { grid-template-columns: 1fr; }
    .scenario-grid { grid-template-columns: repeat(2, 1fr); }
    .monitor-list { grid-template-columns: 1fr; }
    .trade-box { grid-template-columns: 1fr 1fr; }
  }
`;

const GURU_COUNCIL_CSS = `
  .report-wrap { max-width: 880px; margin: 0 auto; padding: 2rem 1rem 1rem; font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); }

  .report-header { border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); padding-bottom: 1.5rem; margin-bottom: 2rem; }
  .report-label { font-size: 11px; letter-spacing: 0.12em; color: var(--color-text-tertiary, #999); text-transform: uppercase; margin-bottom: 0.5rem; }
  .report-title { font-size: 22px; font-weight: 500; color: var(--color-text-primary, #1a1a1a); line-height: 1.4; margin-bottom: 1rem; }
  .report-verdict { display: inline-flex; align-items: center; gap: 8px; background: var(--color-background-secondary, #f5f5f5); border: 0.5px solid var(--color-border-tertiary, #e5e5e5); border-radius: 8px; padding: 6px 14px; font-size: 13px; }
  .verdict-dot { width: 8px; height: 8px; border-radius: 50%; }

  .section { margin-bottom: 2rem; }
  .section-title { font-size: 13px; font-weight: 500; color: var(--color-text-secondary, #666); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 1rem; padding-bottom: 6px; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); }

  /* Guru cards */
  .guru-grid { display: flex; flex-direction: column; gap: 16px; margin-bottom: 2rem; }
  .guru-card { position: relative; border: 0.5px solid var(--color-border-tertiary, #e5e5e5); border-radius: 12px; padding: 20px; }
  .guru-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding-right: 80px; }
  .guru-avatar { width: 48px; height: 48px; border-radius: 50%; background: #1a1a1a; border: 2px solid #1a1a1a; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: #fff; letter-spacing: -0.02em; flex-shrink: 0; overflow: hidden; }
  .guru-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .guru-name { font-size: 15px; font-weight: 500; color: var(--color-text-primary, #1a1a1a); }
  .guru-framework { font-size: 12px; color: var(--color-text-tertiary, #999); }
  .guru-signal { position: absolute; top: 16px; right: 16px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .signal-bullish { background: #DCFCE7; color: #166534; }
  .signal-bearish { background: #FEE2E2; color: #991B1B; }
  .signal-neutral { background: #FEF3C7; color: #92400E; }
  .guru-analysis { font-size: 13px; line-height: 1.7; color: var(--color-text-primary, #1a1a1a); margin-bottom: 12px; }
  .guru-footer { display: flex; align-items: center; gap: 16px; font-size: 12px; color: var(--color-text-tertiary, #999); }
  .conf-bar { width: 100px; height: 6px; background: var(--color-background-secondary, #f5f5f5); border-radius: 3px; overflow: hidden; }
  .conf-fill { height: 100%; border-radius: 3px; }

  /* Consensus panel */
  .consensus-panel { background: var(--color-background-secondary, #f5f5f5); border-radius: 12px; padding: 20px; margin-bottom: 2rem; }
  .consensus-verdict { font-size: 18px; font-weight: 500; margin-bottom: 8px; }
  .consensus-detail { font-size: 13px; line-height: 1.7; color: var(--color-text-secondary, #666); }

  /* Comparison matrix */
  .cmp-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 2rem; }
  .cmp-table th { font-size: 11px; font-weight: 500; color: var(--color-text-tertiary, #999); text-align: center; padding: 8px; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); }
  .cmp-table th:first-child { text-align: left; }
  .cmp-table td { padding: 10px 8px; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); text-align: center; }
  .cmp-table td:first-child { text-align: left; font-weight: 500; }

  /* Debate section */
  .debate-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); }
  .debate-item:last-child { border-bottom: none; }
  .debate-label { font-size: 11px; font-weight: 500; color: #185FA5; background: #E6F1FB; padding: 2px 8px; border-radius: 8px; white-space: nowrap; height: fit-content; }
  .debate-text { font-size: 13px; line-height: 1.6; color: var(--color-text-primary, #1a1a1a); }

  /* Summary stats hero */
  .stats-hero { display: flex; gap: 24px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid rgba(0,0,0,0.06); border-radius: 16px; padding: 28px; margin-bottom: 2rem; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
  .stats-gauge { flex: 0 0 140px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .gauge-ring { position: relative; width: 110px; height: 110px; }
  .gauge-ring svg { width: 110px; height: 110px; transform: rotate(-90deg); }
  .gauge-ring circle { fill: none; stroke-width: 7; stroke-linecap: round; }
  .gauge-track { stroke: #e2e8f0; }
  .gauge-value { transition: stroke-dashoffset .6s ease; filter: drop-shadow(0 0 4px rgba(0,0,0,0.08)); }
  .gauge-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .gauge-pct { font-size: 22px; font-weight: 700; color: var(--color-text-primary, #0f172a); line-height: 1; letter-spacing: -0.02em; }
  .gauge-label { font-size: 10px; color: #94a3b8; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500; }
  .stats-breakdown { flex: 1; display: flex; flex-direction: column; gap: 12px; }
  .stat-row { display: flex; align-items: center; gap: 10px; }
  .stat-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .stat-dot-bullish { background: #10b981; }
  .stat-dot-bearish { background: #f43f5e; }
  .stat-dot-neutral { background: #f59e0b; }
  .stat-name { font-size: 13px; font-weight: 600; color: var(--color-text-primary, #1e293b); min-width: 60px; }
  .stat-bar-wrap { flex: 1; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
  .stat-bar { height: 100%; border-radius: 3px; transition: width .5s ease; }
  .stat-bar-bullish { background: linear-gradient(90deg, #10b981, #34d399); }
  .stat-bar-bearish { background: linear-gradient(90deg, #f43f5e, #fb7185); }
  .stat-bar-neutral { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
  .stat-count { font-size: 13px; font-weight: 600; color: #64748b; min-width: 28px; text-align: right; }

  /* Risk items */
  .risk-list { display: flex; flex-direction: column; gap: 8px; }
  .risk-item { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; line-height: 1.6; }
  .risk-dot { min-width: 6px; height: 6px; border-radius: 50%; background: #E24B4A; margin-top: 7px; }

  .report-wrap ul, .report-wrap ol { padding-left: 1.2em; margin: 0.5rem 0; }
  .report-wrap li { font-size: 13px; line-height: 1.7; color: var(--color-text-primary, #1a1a1a); margin-bottom: 4px; text-align: left; }

  @media (max-width: 600px) {
    .stats-hero { flex-direction: column; align-items: stretch; }
    .stats-gauge { flex: 0 0 auto; }
    .guru-head { flex-wrap: wrap; }
    .cmp-table { font-size: 12px; }
  }
`;

// ============================================================================
// Prompts (inline <style> blocks removed — host injects CSS server-side)
// ============================================================================

function buildWebReportPrompt(userContent: string, inputContext: string): string {
  return `You are a senior research director at a top-tier investment research firm AND a world-class frontend designer.

Your task is to produce a professional-grade DEEP RESEARCH REPORT rendered as a SELF-CONTAINED HTML document. Think: Bloomberg Terminal meets Apple design aesthetics.

=== INPUT ===
Topic: ${userContent}
${inputContext}

=== OUTPUT FORMAT ===
Output a single <div class="report-wrap">...</div> block. Do NOT use markdown. Output raw HTML only — no \`\`\`html fences, no explanatory text before or after.

CRITICAL: Do NOT emit <style> or <link> tags. The host page injects the full CSS stylesheet before rendering. Only emit structural HTML using the predefined class names. Inline <script> tags (e.g., Chart.js init) are OK when needed.

The HTML must:
1. Be a single <div class="report-wrap"> (no <style> tag inside)
2. Be mobile-responsive — the injected CSS already handles breakpoints
3. Use Chart.js from CDN for any charts (bar, line, etc)

=== AVAILABLE CSS CLASSES ===
Layout:
  .report-wrap (root), .report-header, .report-label, .report-title, .report-verdict (with .verdict-dot), .section, .section-title, .two-col (2-column grid)

KPI grid:
  .kpi-grid > .kpi-card > { .kpi-label, .kpi-value [.kpi-up|.kpi-dn], .kpi-sub }

Thesis / Catalysts:
  .thesis-box (left-bordered callout)
  .catalyst-list > .catalyst-item with .catalyst-num (numbered badge)

Tables:
  .seg-table — segmented financial table
  .risk-table — risk matrix; use .pill.pill-low / .pill-mid / .pill-high for probability/impact

Bar charts (pure CSS):
  .bar-mini > { .bar-mini-label, .bar-mini-track > .bar-mini-fill, .bar-mini-val }

Scenario cards (4-up):
  .scenario-grid > .scenario-card.sc-bull|.sc-base|.sc-flat|.sc-bear
  Each: .sc-label, .sc-price, .sc-prob, .sc-tag

Expert debate (when expert data is present):
  .expert-row OR full .expert-card with:
    .expert-card-head > .expert-avatar + .expert-meta > (.expert-label + .expert-signal.expert-signal-bullish|bearish|neutral)
    .expert-body, .expert-conf with .conf-bar > .conf-fill
  .debate-item with .debate-label + .debate-text

Consensus:
  .consensus-panel > .consensus-verdict + .consensus-detail

Monitoring & Action:
  .monitor-list > .monitor-item > { .m-label, .m-current, .m-trigger }
  .trade-box > .trade-card > { .t-label, .t-value }

Lists:
  Standard <ul>/<ol>/<li> inside .report-wrap are already styled.

=== REPORT STRUCTURE (adapt sections to topic) ===
1. Report Header: label, title, verdict badge with colored dot
2. KPI Grid: 3-4 key metrics with sub-labels (use .kpi-grid)
3. Core Thesis: thesis-box with catalysts list
4. Data Visualization: two-col layout with bar charts (.bar-mini) and tables (.seg-table)
5. Scenario Analysis: 3-4 scenario cards (.scenario-grid with .sc-bull/.sc-base/.sc-flat/.sc-bear)
6. Risk Matrix: table with probability/impact pills (.pill-low/.pill-mid/.pill-high)
7. Expert Debate Panel (MANDATORY when expert debate data is in the input): Present each expert's debate journey + core arguments. Include:
   - **COVERAGE RULE — render an expert card for EVERY SINGLE expert that appears in the input. If the input has 6 experts, your output MUST have 6 expert cards. NEVER pick a subset, NEVER merge two experts into one card, NEVER skip an expert because their view "looks similar" to another's. The user wants to see every voice represented.**
   - Expert cards: each expert with name, **strongest directional stance during debate** (bullish/bearish/neutral), confidence bar, and 2-3 sentence core argument (NOT 1 sentence — give each persona room to make their case).
   - **HARD DATA RULE — the input organizes each expert under \`=== {Name} ===\` with a \`[Round N STRONGEST stance]\` block (verdict + confidence + reasoning) and a \`[Round M FINAL stance after debate]\` block. For the Signal column / signal pill use the STRONGEST stance VERDICT verbatim. For the Confidence bar use the STRONGEST stance CONFIDENCE verbatim. NEVER default every expert to "Neutral / 65%". NEVER re-infer the signal — the explicit VERDICT field is authoritative.**
   - **NARRATIVE RULE — when the strongest and final stances differ, your prose MUST narrate the journey. Example pattern: "X's lens initially called this Bearish (Round 1), but conceded to Neutral after Y's argument about [specific data]." Don't just list opinions — show how minds moved.**
   - Points of Agreement: where experts converged in the final round
   - Points of Contention: where experts had divergent strongest stances; what data would have resolved it
   - Synthesis: how the debate journey shaped the final consensus
8. Key Monitoring: monitor-list with current values and triggers.
   - **COVERAGE RULE — render a monitor-item for EVERY metric / indicator that appears in the input's "Key Monitoring Indicators" or equivalent section. NEVER pick a "top 3" or skip metrics you consider less important. The user is monitoring all of them.**
9. Action Strategy: trade-box with entry/stop/target cards.
   - **COVERAGE RULE — if the input describes a long-entry plan, a short-entry plan, AND a range-bound alternative, render all three as separate trade-box rows. Do NOT compress them into one summary box. Each plan should keep its full detail (entry condition + stop + target + position size) — these are the actionable instructions and must NOT be paraphrased away.**
10. The report ENDS here after Action Strategy. Do NOT add a Related Questions section — the frontend renders that separately.

=== CRITICAL RULES ===
1. Output ONLY the HTML starting with <div class="report-wrap">. No <style> tag, no markdown, no code fences, no explanation text.
2. All text content must be data-driven and analytical — use the actual research data provided.
3. Use REAL numbers from the input data. Never fabricate financial figures.
4. LANGUAGE: Match the user's language. Chinese query = all Chinese content. English = all English.
5. Use Chart.js (CDN: https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js) for complex charts. Put <script> tags at the end.
6. Canvas elements MUST have unique IDs.
7. Use semantic colors in inline styles when needed: green (#3B6D11/#639922) for positive, red (#A32D2D/#E24B4A) for negative, blue (#378ADD/#185FA5) for neutral/info.
8. For non-stock topics, adapt the template — skip stock-specific widgets, add relevant ones using the available classes.
9. Be data-dense AND comprehensive. When the input is rich (long markdown, multi-section, multi-expert debate), render every section the input contains — do NOT summarize for the sake of brevity. The Bloomberg/Apple aesthetic means dense and structured, not minimal. If the input has 6 experts, 7 monitoring metrics, and 3 trade strategies, your output MUST have 6 expert cards, 7 monitoring items, 3 trade-box rows. Token budget is 16K — use it.
10. Do NOT use markdown syntax anywhere: no **bold**, no *italic*, no -- dashes for lists. All text must be plain HTML (<strong>, <em>, <ul>/<li>).
11. Section titles and headings must be plain text inside HTML tags. Never wrap titles in ** asterisks.
12. The report ends after Action Strategy / Key Monitoring. Do NOT add a Related Questions section, "Data Sources" footnote, or any extra text — the frontend renders those separately.
`;
}

function buildGuruCouncilHtmlPrompt(userContent: string, inputContext: string): string {
  return `You are a world-class frontend designer creating a visual report for a Guru Council (multi-investor roundtable) analysis.

Your task is to produce a SELF-CONTAINED HTML document that presents each guru's analysis in a visually compelling way. Think: investor presentation deck meets Apple design.

=== INPUT ===
Topic: ${userContent}
${inputContext}

=== OUTPUT FORMAT ===
Output a single <div class="report-wrap">...</div> block. Do NOT use markdown. Output raw HTML only — no \`\`\`html fences, no explanatory text.

CRITICAL: Do NOT emit <style> or <link> tags. The host page injects the full CSS stylesheet before rendering. Only emit structural HTML using the predefined class names.

The HTML must:
1. Be a single <div class="report-wrap"> (no <style> tag inside)
2. Be mobile-responsive — the injected CSS already handles breakpoints

=== AVAILABLE CSS CLASSES ===
Layout: .report-wrap (root), .report-header, .report-label, .report-title, .report-verdict (with .verdict-dot), .section, .section-title

Guru cards:
  .guru-grid > .guru-card with:
    .guru-head > .guru-avatar (contains <img> or initials) + (.guru-name, .guru-framework)
    .guru-signal.signal-bullish|.signal-bearish|.signal-neutral (positioned top-right)
    .guru-analysis (body paragraph)
    .guru-footer with .conf-bar > .conf-fill

Consensus:
  .consensus-panel > .consensus-verdict + .consensus-detail

Comparison matrix:
  .cmp-table

Debate:
  .debate-item > .debate-label + .debate-text

Summary stats hero (MANDATORY):
  .stats-hero > .stats-gauge + .stats-breakdown
  .stats-gauge > .gauge-ring > (svg circle[.gauge-track|.gauge-value]) + .gauge-center > (.gauge-pct + .gauge-label)
  .stats-breakdown > .stat-row > .stat-dot.stat-dot-bullish|.stat-dot-bearish|.stat-dot-neutral + .stat-name + .stat-bar-wrap > .stat-bar.stat-bar-bullish|bearish|neutral + .stat-count

Risks:
  .risk-list > .risk-item > .risk-dot + text

Lists:
  Standard <ul>/<ol>/<li> inside .report-wrap are already styled.

=== REPORT STRUCTURE ===
1. Report Header: label "GURU COUNCIL REPORT", title, consensus verdict badge
2. Summary Stats Hero (.stats-hero) — COPY THIS EXACT HTML STRUCTURE (fill in real values):

<div class="stats-hero">
  <div class="stats-gauge">
    <div class="gauge-ring">
      <svg viewBox="0 0 120 120">
        <circle class="gauge-track" cx="60" cy="60" r="46" stroke-dasharray="289" stroke-dashoffset="0"></circle>
        <circle class="gauge-value" cx="60" cy="60" r="46" stroke="#22C55E" stroke-dasharray="289" stroke-dashoffset="CALC_OFFSET"></circle>
      </svg>
      <div class="gauge-center">
        <span class="gauge-pct">XX%</span>
        <span class="gauge-label">Conviction</span>
      </div>
    </div>
  </div>
  <div class="stats-breakdown">
    <div class="stat-row"><span class="stat-dot stat-dot-bullish"></span><span class="stat-name">Bullish</span><div class="stat-bar-wrap"><div class="stat-bar stat-bar-bullish" style="width:XX%"></div></div><span class="stat-count">N</span></div>
    <div class="stat-row"><span class="stat-dot stat-dot-neutral"></span><span class="stat-name">Neutral</span><div class="stat-bar-wrap"><div class="stat-bar stat-bar-neutral" style="width:XX%"></div></div><span class="stat-count">N</span></div>
    <div class="stat-row"><span class="stat-dot stat-dot-bearish"></span><span class="stat-name">Bearish</span><div class="stat-bar-wrap"><div class="stat-bar stat-bar-bearish" style="width:XX%"></div></div><span class="stat-count">N</span></div>
  </div>
</div>

   CALC_OFFSET formula: offset = 289 * (1 - conviction_pct / 100). Example: 70% conviction → offset = 289 * 0.3 = 86.7. Choose stroke color by majority signal: #10b981 (bullish), #f43f5e (bearish), #f59e0b (neutral).
3. Guru Cards: one card per guru (.guru-card) with photo avatar, name, framework, analysis paragraph, conviction bar. The signal badge (.guru-signal) is positioned at the TOP-RIGHT corner of the card via CSS absolute positioning — just add it as a direct child of .guru-card. For the avatar, use: <div class="guru-avatar"><img src="/avatars/GURU_KEY.jpg" alt="Name"></div> where GURU_KEY is one of: warren_buffett, ben_graham, peter_lynch, charlie_munger, aswath_damodaran, cathie_wood, michael_burry, stanley_druckenmiller, nassim_taleb, bill_ackman, phil_fisher, mohnish_pabrai, rakesh_jhunjhunwala. If the guru is not in the list, use <div class="guru-avatar">XX</div> with initials instead.
4. Comparison Matrix: table showing all gurus × key dimensions (Signal, Conviction, Key Argument) — use .cmp-table
5. Debate Points: key disagreements between gurus (.debate-item)
6. Consensus Panel: weighted consensus, recommended action (.consensus-panel)
7. Risks: collective risk factors (.risk-list)
8. The report ENDS here after Risks. Do NOT add a Related Questions section — the frontend renders that separately.

=== CRITICAL RULES ===
1. Output ONLY the HTML starting with <div class="report-wrap">. NO <style> tag, NO preamble text, NO code fences (\`\`\`), NO explanatory sentences before or after the HTML.
2. Use REAL data from the input. Never fabricate.
3. LANGUAGE: Match the user's language.
4. Inline color hints when needed: green (#166534/#10b981) for bullish, red (#991B1B/#f43f5e) for bearish, amber (#92400E/#f59e0b) for neutral, blue (#378ADD/#185FA5) for info.
5. Each guru card must show their actual signal and reasoning — NOT generic placeholders.
6. Keep the design minimal, data-dense, professional.
7. No external JS libraries needed — use pure inline SVG for the gauge.
8. The Summary Stats Hero is MANDATORY — always render it as section 2 right after the header.
9. Do NOT use markdown syntax (**bold**, *italic*, -- dashes) anywhere inside the HTML content. All text must be plain HTML. Use <strong> instead of **, <em> instead of *, <ul>/<li> instead of dashes.
10. For the SVG gauge: both circles MUST have r="46", cx="60", cy="60". The circumference is 289. Calculate stroke-dashoffset exactly.
11. The report ends after the Risks section. No "Data Sources" footnote, no Related Questions, no horizontal rules, no extra text after the last </div>.
12. Section titles and headings must be plain text inside HTML tags. Never wrap titles in ** asterisks.
`;
}

// ============================================================================
// Crypto-analysis HTML prompt (mirrors the markdown cryptoMemoPrompt)
// — adaptive sections, NO mandatory expert-debate / scenario-grid templates.
// ============================================================================

function buildCryptoHtmlPrompt(userContent: string, inputContext: string): string {
  const isZh = /[\u4e00-\u9fff]/.test(userContent || '');
  const langLock = isZh
    ? `\n=== LANGUAGE LOCK (HIGHEST PRIORITY) ===\n用户问题是中文。整篇 HTML 必须 100% 简体中文：所有 <h1>/<h2>/<h3>/.section-title 标题、所有段落、所有 <li>、所有 <th>/<td>、所有 .kpi-label / .t-label / .stat-name 等组件标签、所有 <strong>/<em> 内容、所有 <details><summary>。\n禁止任何英文句子或英文短语作为正文/标题。币种 ticker（BTC、ETH、HYPE 等）、交易所名（OKX、Binance）、缩写（FDV、OI、APR、RSI）保持英文。其他都必须中文。\n如果 Context 里的资料是英文，必须先翻译成中文再写入 HTML，禁止照抄英文段落。\n`
    : `\n=== LANGUAGE LOCK (HIGHEST PRIORITY) ===\nThe user's question is in English. The entire HTML must be 100% English: every <h1>/<h2>/<h3>/.section-title, every paragraph, every <li>, every <th>/<td>, every .kpi-label / .t-label / .stat-name, every <strong>/<em>, every <details><summary>.\nDo NOT emit any Chinese characters anywhere in the output. Tickers (BTC, ETH) and exchange names (OKX, Binance) stay as-is.\nIf the Context contains Chinese-language material, translate or summarize it in English — never copy Chinese characters into the output.\n`;
  return `You are a senior crypto trader-analyst AND a world-class frontend designer. You are producing the HTML render of a crypto memo for an experienced trader.
${langLock}
=== INPUT ===
User question: ${userContent}
Context (raw research — every datum here is fair game; numbers OUTSIDE this block are forbidden):
${inputContext}

=== HARD RULES ===

1. NO FABRICATION. Every number must come from the Context. If a needed number isn't there, write "(no data)" or skip the claim. Never guess prices, supplies, percentages, dates, holder counts, funding rates, OI, or volume.

2. ANSWER THE QUESTION. Re-read the user question. Make the dominant section answer THAT question. If the user asked about tokenomics, lead with tokenomics. If the user asked "why is X moving today", lead with the tape + news. Do NOT pad with sections the user didn't ask about.

3. NO FIXED TEMPLATE. Pick 2-5 sections based on what the data and the question demand. Section titles must be sharp and specific (e.g. "解锁前的真实抛压" / "Funding overheated vs spot"), NOT generic ("Market Analysis", "Conclusion", "Technicals", "Overview").

4. NO EXPERT-DEBATE / GURU PANEL. There is no expert debate data in the input — do NOT render any expert-card, debate-item, consensus-panel, scenario-grid, or guru-style component. If the input has no scenarios, do NOT invent them.

5. NO TOKEN SNAPSHOT BLOCK. The frontend already renders a TokenCard above this HTML (icon, price, deltas, mkt cap, FDV, top exchanges, links). Do NOT echo basic metadata — no "Token Info" / "标的信息" / "资产快照" section, no contract address, no website list, no Twitter handle.

6. LANGUAGE. Match the user's language end-to-end. Chinese question → all Chinese (headings, KPI labels, table headers). English → all English. No mixing.

=== OUTPUT FORMAT ===
Output a single <div class="report-wrap">...</div> block. Raw HTML only — NO markdown syntax (no **bold**, no *italic*, no -- dashes), NO \`\`\`html fences, NO preamble, NO trailing prose. Do NOT emit <style> or <link> tags — host injects CSS.

=== AVAILABLE CSS CLASSES (use these — don't invent class names) ===

Layout:
  .report-wrap (root) → .report-header > (.report-label + .report-title + .report-verdict[.verdict-dot])
  .section > .section-title
  .two-col (2-column responsive grid)

Executive snapshot:
  .thesis-box (left-bordered callout — use this for the opening 2-3 sentence summary)

KPIs (3-4 max — these are LIVE-DATA cards, not narrative):
  .kpi-grid > .kpi-card > (.kpi-label + .kpi-value[.kpi-up|.kpi-dn] + .kpi-sub)

Catalysts / unlock calendar / numbered drivers:
  .catalyst-list > .catalyst-item with .catalyst-num (numbered badge)

Tables (tokenomics / funding / holders / exchanges):
  .seg-table — segmented financial table

Risk matrix (probability × impact):
  .risk-table with .pill.pill-low / .pill-mid / .pill-high

Bar charts (pure CSS, for funding curves, holder concentration etc):
  .bar-mini > (.bar-mini-label + .bar-mini-track > .bar-mini-fill + .bar-mini-val)

Risk list:
  .risk-list > .risk-item > (.risk-dot + text)

Action / tradeable levels:
  .trade-box > .trade-card > (.t-label + .t-value)

Standard <ul>/<ol>/<li>, <details><summary>, <strong>, <em> are pre-styled — use them.

=== STRUCTURE (FLEXIBLE — pick what fits) ===

A. Header (.report-header) — short label like "CRYPTO MEMO" / "加密研究备忘"; title that captures the angle; .report-verdict badge with bias (Long / Short / Neutral / 看多 / 看空 / 中性). Color the .verdict-dot: green (#10b981) for long, red (#f43f5e) for short, amber (#f59e0b) for neutral.

B. Executive Snapshot (.thesis-box) — 2-3 sentences. Lead line MUST be a one-liner with: Bias / Action / Confidence / Trigger separated by " · ". Each subsequent sentence must carry at least one number from Context.

C. KPI Grid (.kpi-grid, 3-4 cards) — only the metrics that matter for THIS question. Examples:
   • Spot price + 24h Δ (color via .kpi-up/.kpi-dn)
   • Funding rate (% per 8h, annualized in .kpi-sub)
   • Open Interest in USD
   • FDV / Mkt Cap ratio
   • Holder concentration (top10 %)
   • Unlock cliff date / amount
   Skip a KPI if data is missing — do NOT fabricate to fill the grid.

D. 2-5 body sections (each <section class="section"><h2 class="section-title">…</h2>…</section>). Use whichever building blocks fit the section:
   • Tape read → KPI grid (already done) + .bar-mini for 7d/30d return + a short paragraph
   • Tokenomics / supply pressure → .seg-table for vesting + .catalyst-list for upcoming unlocks
   • What the market missed → paragraph + .seg-table comparing news vs price reaction
   • On-chain flows / holder concentration → .seg-table or .bar-mini
   • Comparison vs peers (only if user asked) → .seg-table
   • Tradeable levels → .trade-box with entry / stop / target cards

   Inside each paragraph: every claim ends with the supporting number, e.g. "<strong>Funding overheated</strong> · +0.012%/8h ≈ 13% APR (OKX)".

   Long raw tables (full holder list, complete vesting schedule, full exchange listings, deep candle table) → wrap in <details><summary>详细数据 / Show details</summary>…</details> so the main report stays scannable.

E. Risks / Kill-switch (always; section title YOUR own creative phrasing) — .risk-list with 3 items. Each item is an OBSERVABLE threshold → action. Example: "BTC -8% intraday → close all longs".

F. Tags + Questions to watch (always last — must be the final block before </div>):
   - Plain paragraph: "<strong>Tags:</strong> Importance · Categories · Time-horizon" (translate labels).
   - <strong>Questions to watch / 值得关注的问题：</strong>
   - <ul> with 3-5 single-question <li> items (each ends in ? or ？; no follow-on prose, no links).

=== CRITICAL FORMATTING RULES ===

1. ONLY HTML. No markdown anywhere — convert ** to <strong>, * to <em>, dashes to <ul>/<li>.
2. Output starts with <div class="report-wrap"> and ends with </div>. Nothing before, nothing after.
3. Section titles inside <h2 class="section-title"> must be plain text — never wrapped in ** asterisks.
4. No "Data Sources" footnote, no Related Questions block, no horizontal rules — frontend renders sources separately.
5. Use semantic colors via inline style only when no class fits: green #166534/#10b981, red #991B1B/#f43f5e, amber #92400E/#f59e0b, blue #185FA5/#378ADD.
6. Mobile-responsive grid is handled by the host CSS — don't add media queries.
`;
}

// ============================================================================
// Adaptive "Doc → Visual Web" prompt
// ============================================================================
//
// The earlier prompts (`buildGuruCouncilHtmlPrompt`, `buildWebReportPrompt`,
// `buildCryptoHtmlPrompt`) hard-coded section lists, mandatory cards, and
// fixed grids. Every Web report ended up with the same template feel and the
// model had to flatten rich Doc content into rigid slots.
//
// This single adaptive prompt treats the already-finished Doc as the source
// of truth and asks the model to DISTILL it into a denser visual layout:
// KPI cards for the numbers the Doc mentions, expert cards for the debate it
// contains, comparison tables for the dimensions it actually compares — and
// nothing more. No "MANDATORY: include section X" rules.

function buildAdaptiveWebReportPrompt(userContent: string, doc: string, queryType: string): string {
  const isZh = /[\u4e00-\u9fff]/.test(userContent || doc);
  const isGuru = queryType === 'guru-council';
  const langLock = isZh
    ? `\n=== LANGUAGE LOCK ===\nThe Doc is in Chinese (or the user asked in Chinese). The entire HTML must be 100% 简体中文 — titles, labels, paragraphs, table cells, pill text. Tickers (BTC, NVDA), exchange names (OKX), and standard abbreviations (PE, FDV, OI) stay in their original form.\n`
    : `\n=== LANGUAGE LOCK ===\nThe Doc is in English. The entire HTML must be 100% English. Do not emit Chinese characters.\n`;

  return `You are a senior research analyst AND a visual report designer. You are given a finished long-form research report ("Doc") in markdown. Your job is to render a SHORT, VISUAL Web version that distills the Doc — NOT a verbatim rewrite.
${langLock}
=== USER QUESTION ===
${userContent}

=== DOC (source of truth — every claim, number, and conclusion must come from here) ===
${doc}

=== GOAL ===
Produce a CONDENSED, VISUALLY DENSE HTML report. Compared to the Doc, the Web version should be:
- ~30-50% shorter in raw word count
- Information-dense in KPI cards, comparison tables, and small charts instead of paragraphs
- Skimmable: a senior PM should grasp the verdict + key drivers in <30 seconds

=== HARD RULES ===
1. NO FABRICATION. Every number, name, quote, and conclusion must come from the Doc. If a number isn't in the Doc, do not invent it. If a section has no data in the Doc, skip it — do NOT pad with generic content.
2. NO FIXED TEMPLATE. Choose 3-6 sections based on what the Doc actually contains. Never include a section just because the spec mentions it.
3. The Doc's overall verdict (bullish/bearish/neutral, buy/hold/sell, etc.) MUST be surfaced prominently in the header.
4. Section titles must be SPECIFIC ("Q4 margin compression risk", "Funding rate vs spot divergence"), not generic ("Analysis", "Conclusion", "Overview").
5. Output a single <div class="report-wrap">...</div>. NO <style> tags (host injects CSS). NO <script> tags. NO markdown fences. NO preamble or trailing text.
6. Do NOT include a "Follow-up Questions" / "Related Questions" / "持续跟踪" section — the frontend renders that separately.

=== AVAILABLE BUILDING BLOCKS (use only what fits) ===

Header (always include):
  <div class="report-header">
    <div class="report-label">${isGuru ? (isZh ? '圆桌报告' : 'ROUNDTABLE REPORT') : (isZh ? '研究报告' : 'RESEARCH REPORT')}</div>
    <div class="report-title">… concise title derived from Doc …</div>
    <span class="report-verdict"><span class="verdict-dot" style="background:#10b981|#f43f5e|#f59e0b"></span> Bullish | Bearish | Neutral · Confidence: High|Med|Low</span>
  </div>

KPI grid (use when Doc has 3-8 hard numbers — price targets, PE, FDV, growth, drawdowns):
  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-label">…</div><div class="kpi-value kpi-up|kpi-dn">…</div><div class="kpi-sub">…</div></div>
    …
  </div>

Thesis callout (one-paragraph distillation of the Doc's central argument):
  <div class="thesis-box">…</div>

Catalyst list (numbered items, when Doc enumerates 2-5 drivers/catalysts):
  <div class="catalyst-list"><div class="catalyst-item"><div class="catalyst-num">1</div><div>…</div></div>…</div>

Bar chart row (use for any side-by-side comparable values — segment revenue, exposure %, holdings split):
  <div class="bar-mini"><span class="bar-mini-label">Name</span><div class="bar-mini-track"><div class="bar-mini-fill" style="width:N%;background:#378ADD"></div></div><span class="bar-mini-val">N%</span></div>

Scenario grid (use when Doc presents Bull / Base / Bear or similar 3-4 outcomes):
  <div class="scenario-grid">
    <div class="scenario-card sc-bull"><div class="sc-label">Bull</div><div class="sc-price">…</div><div class="sc-prob">…</div><div class="sc-tag">…</div></div>
    …
  </div>

Risk table (use when Doc lists 3+ risks with likelihood/impact):
  <table class="risk-table"><tr><th>Risk</th><th>Prob</th><th>Impact</th></tr>
    <tr><td>…</td><td><span class="pill pill-low|pill-mid|pill-high">…</span></td><td>…</td></tr>
  </table>

${isGuru ? `Guru cards (use when Doc contains a multi-expert debate):
  <div class="guru-grid">
    <div class="guru-card">
      <div class="guru-head">
        <div class="guru-avatar"><img src="/avatars/GURU_KEY.jpg" alt="Name"></div>
        <div><div class="guru-name">Name</div><div class="guru-framework">One-line framework</div></div>
      </div>
      <span class="guru-signal signal-bullish|signal-bearish|signal-neutral">Bullish|Bearish|Neutral</span>
      <div class="guru-analysis">2-3 sentence distillation — NOT the Doc's full paragraph</div>
      <div class="guru-footer"><div class="conf-bar"><div class="conf-fill" style="width:N%"></div></div></div>
    </div>
    …
  </div>
  GURU_KEY ∈ {warren_buffett, ben_graham, peter_lynch, charlie_munger, aswath_damodaran, cathie_wood, michael_burry, stanley_druckenmiller, nassim_taleb, bill_ackman, phil_fisher, mohnish_pabrai, rakesh_jhunjhunwala}; if the expert isn't in the list, use initials inside <div class="guru-avatar">XX</div>.

Comparison matrix (use when Doc compares experts/scenarios across 2+ dimensions):
  <table class="cmp-table"><tr><th>Expert</th><th>Signal</th><th>Key argument</th></tr>…</table>

Debate row (use for 1-3 sharp disagreements pulled from the Doc):
  <div class="debate-item"><div class="debate-label">Issue:</div><div class="debate-text">…</div></div>

Consensus panel (always include if Doc has a verdict):
  <div class="consensus-panel"><div class="consensus-verdict">Verdict</div><div class="consensus-detail">…</div></div>
` : ''}

Standard HTML inside .report-wrap (<p>, <ul>, <strong>, <table>, etc.) is already styled. Use sparingly — only when no card/grid block fits.

=== CRITICAL OUTPUT FORMAT ===
- Output ONLY the HTML starting with \`<div class="report-wrap">\` and ending with \`</div>\`.
- No code fences, no commentary, no <style> or <script>.
- Plain HTML — no markdown (\`**bold**\`, \`*italic*\`, \`-- dashes\`). Use <strong>, <em>, <ul><li>.
`;
}

// ============================================================================
// Main entry point
// ============================================================================

export interface RunHtmlGenerationParams {
  userContent: string;
  contextString: string;
  queryType: string;
}

/**
 * Generate the Web HTML report by asking the model to DISTILL the finished
 * Doc into a denser, more visual layout. The Doc is the source of truth —
 * the model cannot invent numbers or pad sections the Doc doesn't support.
 * CSS is injected server-side; the model only emits structural HTML using
 * known class names.
 */
export async function runHtmlGeneration(params: RunHtmlGenerationParams): Promise<string> {
  const { userContent, contextString, queryType } = params;
  const doc = (contextString || '').trim();
  if (!doc) return '';

  const isGuru = queryType === 'guru-council';
  const cssBlock = isGuru ? GURU_COUNCIL_CSS : WEB_REPORT_CSS;
  const htmlPrompt = buildAdaptiveWebReportPrompt(userContent, doc, queryType);

  const htmlStream = await aiService.chatStream(
    [{ role: 'user', content: htmlPrompt }],
    'superagent',
    undefined,
    12288,
  );

  const reader = htmlStream.getReader();
  const decoder = new TextDecoder();
  let htmlContent = '';
  let buf = '';
  const parseSseLine = (line: string) => {
    const t = line.trim();
    if (!t.startsWith('data: ')) return;
    const d = t.slice(6).trim();
    if (d === '[DONE]') return;
    try { htmlContent += JSON.parse(d).choices?.[0]?.delta?.content || ''; } catch {}
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buf.trim()) buf.split('\n').forEach(parseSseLine);
      break;
    }
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    lines.forEach(parseSseLine);
  }

  let s = htmlContent.trim();
  s = s.replace(/^```html\s*/i, '').replace(/^```\s*/, '');
  s = s.replace(/\n?```\s*$/, '');
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>\s*/gi, '');
  s = s.replace(/<script[^>]*>[\s\S]*?<\/script>\s*/gi, '');
  s = s.trim();
  const divIdx = s.indexOf('<div');
  if (divIdx > 0) s = s.slice(divIdx);
  if (s.length < 100) return '';

  return `<style>${cssBlock}</style>${s}`;
}
