// ThinkingInlineTrigger — Grok-style pill button + ticker that doubles as a
// "Done · X tools · Y sources · Zs" summary once the assistant starts
// streaming. Clicking it opens the Thinking Process side panel.
// Extracted from SuperAgentChat.tsx during the Phase-2 refactor.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ThinkingFlow, Web3ModuleData, SearchModuleData } from './types';
import { TOOL_SOURCE_DOMAINS, CANNED_THINKING_MESSAGES } from './canned-messages';

// ─── ThinkingInlineTrigger (Grok-style with staged progress rows) ──────
export const ThinkingInlineTrigger: React.FC<{
    thinking: ThinkingFlow;
    onOpen: () => void;
    /** True when the Process panel is currently showing this trigger's flow.
     *  Used to (a) flip the chevron from `→` (open) to `←` (close) and
     *  (b) drive the toggle behaviour so a second click closes the panel. */
    isOpen?: boolean;
    /** True when the assistant message has already started streaming text.
     *  At this point the tools-collection phase is done — the typewriter is
     *  conveying progress, so the trigger should switch to its "Done · X
     *  tools · Y sources · Zs" pill instead of staying as a spinning
     *  "Synthesizing report" indicator that confuses users into thinking
     *  the run is stuck. */
    streamingStarted?: boolean;
}> = ({ thinking, onOpen, isOpen, streamingStarted }) => {
    const doneModule = thinking.modules.find(m => m.type === 'done');
    const dur = doneModule?.status === 'completed' ? (doneModule.data as any)?.duration : null;
    const durLabel =
        typeof dur === 'number' && !Number.isNaN(dur) ? String(dur) : '?';
    const activeModule = thinking.modules.find(m => m.status === 'active');
    const trace = thinking.toolTrace || [];

    // ── Tools-phase elapsed counter (LangGraph-style) ──
    // Industry convention is to STOP the elapsed counter once the agent's
    // tool-collection phase finishes — the synthesis stream that follows is
    // already conveyed by the typewriter effect, so a still-incrementing
    // timer is double-reporting and makes a 25s tools run + 50s stream look
    // like "75s of waiting".
    //
    // Lock rule: as soon as a `synthesis` (or `report`) module appears we
    // freeze the displayed seconds at "tools done" — the moment Claude /
    // DeepSeek start prefilling the final report. While tools are still
    // running, the counter ticks live every 1s.
    const synthesisModuleIdx = thinking.modules.findIndex(
        (m) => m.type === 'synthesis' || m.type === 'report',
    );
    const toolsPhaseRunning = thinking.isActive && synthesisModuleIdx === -1;
    const [nowMs, setNowMs] = useState(Date.now());
    useEffect(() => {
        if (!toolsPhaseRunning) return;
        const id = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(id);
    }, [toolsPhaseRunning]);
    // Capture and freeze the tools-phase elapsed at the transition. We can't
    // use a ref-based snapshot because re-renders may run before the ref
    // updates, so derive deterministically: while tools running → live, after
    // synthesis appears → freeze at the moment the live counter last saw.
    const toolsElapsedRef = useRef<number>(0);
    if (thinking.isActive && thinking.startTime) {
        const live = Math.max(0, Math.floor((nowMs - thinking.startTime) / 1000));
        if (toolsPhaseRunning) {
            toolsElapsedRef.current = live;
        }
    } else if (!thinking.isActive) {
        // Run completed: keep whatever was last captured (or fall back to 0).
    }
    const elapsedSec = toolsElapsedRef.current;

    // Aggregate counts for the LangGraph-style "Done · X tools · Y sources" pill.
    // Tools = number of distinct stages run in the web3 module (preferred) +
    // 1 if search ran. Sources = total dedup'd source count from search +
    // web3 modules.
    const { toolsCount, sourcesCount } = useMemo(() => {
        let tools = 0;
        let sources = 0;
        for (const mod of thinking.modules) {
            if (mod.type === 'web3') {
                const md = mod.data as Web3ModuleData | undefined;
                if (md?.stages) tools += md.stages.length;
            } else if (mod.type === 'search') {
                tools += 1;
                const sd = mod.data as SearchModuleData | undefined;
                if (sd) {
                    if (Array.isArray(sd.sources)) sources += sd.sources.length;
                    if (Array.isArray(sd.sections)) {
                        for (const sec of sd.sections) {
                            if (Array.isArray(sec?.sources)) sources += sec.sources.length;
                        }
                    }
                }
            } else if (mod.type === 'analysis' || mod.type === 'simulation' || mod.type === 'consensus') {
                tools += 1;
            }
        }
        return { toolsCount: tools, sourcesCount: sources };
    }, [thinking.modules]);

    // ── Line 1: summary title (English only) ──
    // Walks through the agent lifecycle so the trigger isn't stuck on a stale
    // "Searching the web" while routing or synthesis are actually running:
    //   1. No modules at all       → "Planning…"           (routing window)
    //   2. Some module is active   → that module's label   (working)
    //   3. All tools done, no syn  → "Drafting response"   (Claude prefill)
    //   4. Synthesis active/done   → "Synthesizing report"
    //   5. Run completed           → "Done · X tools · Y sources · Zs"
    // Treat the trigger as "completed" the moment the assistant starts
    // streaming text — even if `thinking.isActive` is still true (it stays
    // true until `stream_done`). This is what avoids the "spinner stuck for
    // 50s while text is already flowing" UX bug.
    const showAsCompleted = !thinking.isActive || !!streamingStarted;
    const phaseLabel = useMemo<React.ReactNode>(() => {
        if (showAsCompleted) {
            // LangGraph-style summary with colored numerical highlights so
            // the most informative bits (counts + duration) are visually
            // distinct from the muted "tools / sources / s" units.
            // Priority: live capture → backend-persisted toolsPhaseDurationS
            // → done.duration (ancient sessions). The middle one fixes the
            // history-restore case where the live timer never ran but the
            // session was originally captured with the new code path.
            const persistedToolsSec = thinking.toolsPhaseDurationS;
            const finalSec = toolsElapsedRef.current > 0
                ? toolsElapsedRef.current
                : (typeof persistedToolsSec === 'number' && persistedToolsSec > 0
                    ? persistedToolsSec
                    : (typeof dur === 'number' && !Number.isNaN(dur) ? dur : 0));
            const segments: React.ReactNode[] = [];
            segments.push(
                <span key="done" className="text-emerald-600 font-semibold">Done</span>,
            );
            if (toolsCount > 0) {
                segments.push(
                    <span key="tools" className="inline-flex items-baseline gap-1">
                        <span className="font-semibold text-blue-600 tabular-nums">{toolsCount}</span>
                        <span className="text-gray-400">{toolsCount === 1 ? 'tool' : 'tools'}</span>
                    </span>,
                );
            }
            if (sourcesCount > 0) {
                segments.push(
                    <span key="sources" className="inline-flex items-baseline gap-1">
                        <span className="font-semibold text-violet-600 tabular-nums">{sourcesCount}</span>
                        <span className="text-gray-400">{sourcesCount === 1 ? 'source' : 'sources'}</span>
                    </span>,
                );
            }
            if (finalSec > 0) {
                segments.push(
                    <span key="time" className="inline-flex items-baseline gap-0.5">
                        <span className="font-semibold text-gray-800 tabular-nums">{finalSec}</span>
                        <span className="text-gray-400">s</span>
                    </span>,
                );
            }
            // Interleave with muted "·" separators.
            return segments.flatMap((seg, i) =>
                i === 0 ? [seg] : [<span key={`sep-${i}`} className="text-gray-300">·</span>, seg],
            );
        }
        const labels: Record<string, string> = {
            search: 'Searching the web',
            analysis: 'Analyzing data',
            simulation: 'Running simulations',
            consensus: 'Reaching consensus',
            web3: 'Querying market data',
            synthesis: 'Synthesizing report',
            report: 'Synthesizing report',
        };
        // Branded prefix used for the lifecycle states between specific tool
        // phases (Planning / Drafting / Thinking). Tool-specific labels stay
        // unprefixed so the verb ("Searching the web", etc.) reads naturally.
        const brandedPrefix = (
            <span className="inline-flex items-baseline gap-1.5">
                <span className="font-semibold text-gray-900">Loka Agent</span>
                <span className="text-gray-300">·</span>
            </span>
        );
        if (activeModule) return labels[activeModule.type] || 'Thinking';
        // No active module — figure out which lifecycle phase we're in.
        const mods = thinking.modules || [];
        if (mods.length === 0) return <>{brandedPrefix} <span>Planning…</span></>;
        const synthMod = mods.find((m) => m.type === 'synthesis' || m.type === 'report');
        if (synthMod) {
            // synthesis exists but isn't 'active' → either pre-LLM or post-stream.
            // If it's 'completed' the inline trigger normally hides anyway, so
            // showing "Synthesizing report" briefly is correct.
            return 'Synthesizing report';
        }
        // Tools wrapped up but synthesis hasn't fired yet — Claude is in the
        // prefill stage. Tell the user we're drafting so the panel doesn't
        // look frozen for the 10-15s of prefill.
        const toolMods = mods.filter((m) => m.type === 'search' || m.type === 'web3' || m.type === 'analysis' || m.type === 'simulation');
        if (toolMods.length > 0 && toolMods.every((m) => m.status === 'completed')) {
            return <>{brandedPrefix} <span>Drafting response</span></>;
        }
        return <>{brandedPrefix} <span>Thinking</span></>;
    }, [showAsCompleted, activeModule, thinking.modules, thinking.toolsPhaseDurationS, durLabel, toolsCount, sourcesCount, dur]);

    // ── Ticker: blend real trace items + canned busy messages for a rich
    // rotation across all modes (stock / research / web3 / simulation / roundtable).
    // Real events show authentic tool names; canned messages fill gaps so the
    // ticker always feels "busy" regardless of backend emission pattern.
    const allTickerItems = useMemo(() => {
        if (!thinking.isActive) return [];
        const items: string[] = [];
        const seen = new Set<string>();
        for (const t of trace) {
            if (t.displayName && !seen.has(t.displayName)) {
                seen.add(t.displayName);
                items.push(t.displayName);
            }
            const domains = (t.tool && TOOL_SOURCE_DOMAINS[t.tool]) || [];
            for (const d of domains) {
                if (d === 'loka-db' || seen.has(d)) continue;
                seen.add(d);
                items.push(d);
            }
        }
        // Always interleave with canned messages for the active phase, so every
        // mode — not just stock — gets the Grok-style busy-ticker feel.
        const activeType = activeModule?.type || 'default';
        const canned = CANNED_THINKING_MESSAGES[activeType] || CANNED_THINKING_MESSAGES.default;
        for (const c of canned) {
            if (!seen.has(c)) {
                seen.add(c);
                items.push(c);
            }
        }
        return items;
    }, [trace, thinking.isActive, activeModule]);

    const [tickerIdx, setTickerIdx] = useState(0);

    useEffect(() => {
        if (!thinking.isActive || allTickerItems.length <= 1) return;
        const id = setInterval(() => {
            setTickerIdx(i => (i + 1) % allTickerItems.length);
        }, 1800);
        return () => clearInterval(id);
    }, [thinking.isActive, allTickerItems.length]);

    useEffect(() => { setTickerIdx(0); }, [allTickerItems.length]);

    // Unified rich mode for all routed modes (fast / roundtable / undefined):
    // clickable button to open Process panel + rotating ticker of live progress.
    // Pill-shaped affordance with hover state + an end-cap chevron makes the
    // tap target obviously interactive — matches the LangGraph reference UI.
    // Borderless variant per design feedback — the elliptical pill chrome
    // (rounded-full / border / bg-white / shadow) felt too heavy for both the
    // loading and the "Done · N tools · …" summary states. Render as a plain
    // clickable text row instead; the icon + label still convey the state.
    return (
        <button
            onClick={onOpen}
            className="group inline-flex flex-col items-start gap-0.5 mb-2 text-left transition-colors"
        >
            {/* Top row: spinner/check + title + elapsed + arrow.
                Spinner ↔ check switches the moment streaming starts (not when
                the run fully ends), so users see "Done" while text flows. */}
            <div className="inline-flex items-center gap-2">
                {showAsCompleted ? (
                    <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                ) : (
                    <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                )}
                <span className="inline-flex items-baseline gap-1.5 text-[13px] font-medium text-gray-700 group-hover:text-gray-900">{phaseLabel}</span>
                {/* Show elapsed only DURING the tools-collection phase. Once
                    synthesis starts (Claude/DeepSeek prefilling and streaming
                    the report), the typewriter effect itself conveys progress
                    — adding a still-incrementing timer just inflates the
                    perceived wait time without giving the user new info.
                    LangGraph / Perplexity / Phind all follow this convention. */}
                {toolsPhaseRunning && !streamingStarted && elapsedSec > 0 && (
                    <span className="text-[12px] font-semibold text-gray-700 tabular-nums">{elapsedSec}s</span>
                )}
                {/* Chevron flips between "open panel" → and "close panel" when
                    the panel is already open. Subtle slide animation hints
                    that the click does something. */}
                <svg
                    className={`w-3 h-3 transition-all shrink-0 ${
                        isOpen
                            ? 'rotate-180 text-blue-500 group-hover:text-blue-700'
                            : 'text-gray-400 group-hover:text-gray-700 group-hover:translate-x-0.5'
                    }`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
            </div>
            {/* Ticker row: one item at a time, cycling with slide-in animation.
                Stops once streaming starts — at that point the typewriter
                in the message bubble is the live progress signal. */}
            {thinking.isActive && !streamingStarted && allTickerItems.length > 0 && (
                <div className="pl-5 h-[16px] overflow-hidden">
                    <span key={tickerIdx} className="block text-[11px] text-gray-400 ticker-in">
                        {allTickerItems[tickerIdx % allTickerItems.length]}
                    </span>
                </div>
            )}
        </button>
    );
};

