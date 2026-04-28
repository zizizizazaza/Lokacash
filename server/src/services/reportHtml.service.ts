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
7. Expert Debate Panel (MANDATORY when expert debate data is in the input): Present each expert's core view, confidence, and key argument using expert-row components. Include:
   - Expert cards: each expert with name, signal (bullish/bearish/neutral), confidence bar, and 1-2 sentence core argument
   - **HARD DATA RULE — every expert section in the input is labelled like \`--- {Name} | VERDICT: Bullish | CONFIDENCE: 78% ---\`. The Signal column / signal pill MUST copy the VERDICT value verbatim (Bullish / Bearish / Neutral). The Confidence bar / value MUST copy the CONFIDENCE percentage verbatim. NEVER default every expert to "Neutral / 65%". NEVER re-infer the signal by re-reading the prose — the explicit VERDICT field is authoritative.**
   - Points of Agreement: where experts converged
   - Points of Contention: where experts disagreed and what data would resolve it
   - Synthesis: how the debate shaped the final thesis
8. Key Monitoring: monitor-list with current values and triggers
9. Action Strategy: trade-box with entry/stop/target cards
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
9. Keep the design minimal, data-dense, and professional. No decorative elements.
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
// Main entry point
// ============================================================================

export interface RunHtmlGenerationParams {
  userContent: string;
  contextString: string;
  queryType: string;
}

/**
 * Call the LLM to generate the report HTML, then wrap it with the
 * server-side CSS so the output is still a fully self-contained document.
 */
export async function runHtmlGeneration(params: RunHtmlGenerationParams): Promise<string> {
  const { userContent, contextString, queryType } = params;
  const isGuru = queryType === 'guru-council';

  const htmlPrompt = isGuru
    ? buildGuruCouncilHtmlPrompt(userContent, contextString)
    : buildWebReportPrompt(userContent, contextString);
  const cssBlock = isGuru ? GURU_COUNCIL_CSS : WEB_REPORT_CSS;

  const htmlStream = await aiService.chatStream(
    [{ role: 'user', content: htmlPrompt }],
    'superagent',
    undefined,
    8192,
  );

  // Parse OpenAI-style SSE stream → plain text
  const htmlReader = htmlStream.getReader();
  const htmlDecoder = new TextDecoder();
  let htmlContent = '';
  let htmlBuf = '';
  let chunkCount = 0;
  while (true) {
    const { done, value } = await htmlReader.read();
    if (done) {
      if (htmlBuf.trim()) {
        for (const line of htmlBuf.split('\n')) {
          const t = line.trim();
          if (t.startsWith('data: ')) {
            const d = t.slice(6).trim();
            if (d === '[DONE]') continue;
            try { htmlContent += JSON.parse(d).choices?.[0]?.delta?.content || ''; } catch {}
          }
        }
      }
      break;
    }
    chunkCount++;
    htmlBuf += htmlDecoder.decode(value, { stream: true });
    const htmlLines = htmlBuf.split('\n');
    htmlBuf = htmlLines.pop() || '';
    for (const line of htmlLines) {
      const t = line.trim();
      if (t.startsWith('data: ')) {
        const d = t.slice(6).trim();
        if (d === '[DONE]') continue;
        try { htmlContent += JSON.parse(d).choices?.[0]?.delta?.content || ''; } catch {}
      }
    }
  }
  console.log(`[agent:chat:html] Stream finished. chunks=${chunkCount}, htmlLength=${htmlContent.length}`);

  // Sanitize: strip markdown fences, strip any leaked <style> (we inject our own below),
  // then slice to the first <div>.
  let s = htmlContent.trim();
  s = s.replace(/^```html\s*/i, '').replace(/^```\s*/, '');
  s = s.replace(/\n?```\s*$/, '');
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>\s*/gi, '');
  s = s.trim();
  const divIdx = s.indexOf('<div');
  if (divIdx > 0) s = s.slice(divIdx);

  // Prepend the server-side CSS block so the output is still a fully
  // self-contained HTML snippet (the frontend code that renders it is
  // unchanged — it still receives <style>...</style><div class="report-wrap">...).
  return `<style>${cssBlock}</style>${s}`;
}
