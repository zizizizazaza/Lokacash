// PlanPipeline — compact stage stepper used at the top of the Roundtable
// process panel. Pushes "process as result" into the left column instead of
// burying it in the right panel. English only — we intentionally ignore
// backend-provided `planningMessage` which may be Chinese.
// Extracted from SuperAgentChat.tsx during the Phase-2 refactor.
import React, { useMemo } from 'react';
import type { ThinkingFlow } from './types';

export const PlanPipeline: React.FC<{ thinking: ThinkingFlow; compact?: boolean }> = ({ thinking, compact }) => {
    // A turn counts as Roundtable as soon as ANY of these signals exist —
    // routedMode arrives only after backend routing completes, but
    // rtPreparationStatus / selectedAgentIds are set the moment the user
    // confirms Summon, so the stepper appears immediately for RT flows.
    const isRt = thinking.routedMode === 'roundtable'
        || thinking.rtPreparationStatus !== undefined
        || (thinking.selectedAgentIds?.length ?? 0) > 0;

    const stages = useMemo(() => {
        if (isRt) {
            // ── Roundtable 5-dot stepper, driven by REAL backend signals ──
            const dataArr = thinking.rtDataSearch || [];
            const dataActive = dataArr.some(s => s.status === 'active');
            const dataDoneFromDemo = dataArr.length > 0 && dataArr.every(s => s.status === 'done');
            const roundsArr = thinking.rtRounds || [];
            const roundsActive = roundsArr.some(r => r.status === 'active');
            const roundsDone = roundsArr.length > 0 && roundsArr.every(r => r.status === 'done');
            const mods = thinking.modules || [];
            const dataModuleCompleted = mods.some(
                m => (m.type === 'search' || m.type === 'analysis' || m.type === 'web3') && m.status === 'completed'
            );
            const dataModuleActive = mods.some(
                m =>
                    (m.type === 'search' || m.type === 'analysis' || m.type === 'web3') &&
                    (m.status === 'active' || (m.status as string) === 'analyzing')
            );
            const consensusDone = thinking.rtConsensus?.status === 'done';
            const consensusActive = thinking.rtConsensus?.status === 'active'
                || mods.some(m => m.type === 'consensus' && m.status === 'active');
            const reportActive = thinking.isActive && consensusDone;
            const reportDone = thinking.rtReportStatus === 'done'
                || (!thinking.isActive && consensusDone);

            return [
                { key: 'summon', label: 'Summon',
                    done: roundsArr.length > 0 || roundsActive || consensusActive || consensusDone || thinking.rtPreparationStatus === 'done',
                    active: thinking.rtPreparationStatus !== 'done' && roundsArr.length === 0 && !consensusActive && !consensusDone },
                { key: 'research', label: 'Research',
                    done: dataModuleCompleted || dataDoneFromDemo,
                    active: !dataModuleCompleted && (dataActive || dataModuleActive) },
                { key: 'debate', label: 'Debate',
                    done: roundsDone || consensusDone,
                    active: !consensusDone && (roundsActive || (roundsArr.length > 0 && !roundsDone)) },
                { key: 'consensus', label: 'Consensus',
                    done: consensusDone,
                    active: !consensusDone && consensusActive },
                { key: 'report', label: 'Report',
                    done: reportDone,
                    active: !reportDone && reportActive },
            ];
        }
        const trace = thinking.toolTrace || [];
        const anyToolRunning = trace.some(t => t.status === 'running');
        const anyToolDone = trace.some(t => t.status === 'done');
        const standardMods = thinking.modules || [];
        const isDataMod = (t: string) => t === 'search' || t === 'analysis' || t === 'web3';
        const anyModActive = standardMods.some(
            m => isDataMod(m.type) && (m.status === 'active' || (m.status as string) === 'analyzing')
        );
        const anyModDone = standardMods.some(
            m => isDataMod(m.type) && m.status === 'completed'
        );
        const anyRunning = anyToolRunning || anyModActive;
        const anyDone = anyToolDone || anyModDone;
        const researchDone = anyDone && !anyRunning;
        return [
            { key: 'route', label: 'Route',
                done: !!thinking.routedMode, active: !thinking.routedMode && thinking.isActive },
            { key: 'research', label: 'Research',
                done: researchDone,
                active: anyRunning },
            { key: 'respond', label: 'Respond',
                done: !thinking.isActive,
                active: thinking.isActive && !anyRunning && !!thinking.routedMode },
        ];
    }, [thinking, isRt]);

    // Product decision: the progress stepper is Roundtable-only. Standard
    // Auto / Fast queries don't render it at all.
    if (!isRt) return null;
    if (stages.every(s => !s.done && !s.active)) return null;

    const txtCls = compact ? 'text-[10px]' : 'text-[10.5px]';

    return (
        <div className="inline-flex items-center gap-1.5">
            {stages.map((s, i) => {
                const state: 'done' | 'active' | 'pending' = s.done ? 'done' : s.active ? 'active' : 'pending';
                const prev = i > 0 ? stages[i - 1] : null;
                const connectorFilled = !!prev && prev.done;
                const connectorAnimating = connectorFilled && state === 'active';
                return (
                    <React.Fragment key={s.key}>
                        {i > 0 && (
                            connectorAnimating ? (
                                <span className="relative h-px w-4 rounded-full overflow-hidden bg-gray-200">
                                    <span className="absolute inset-0 bg-emerald-500/20" />
                                    <span
                                        className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
                                        style={{ animation: 'stepper-connector-flow 1.4s ease-in-out infinite' }}
                                    />
                                </span>
                            ) : (
                                <span className={`h-px w-4 rounded-full transition-colors duration-500 ${connectorFilled ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                            )
                        )}
                        <span className="inline-flex items-center gap-1">
                            {state === 'done' ? (
                                <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500 text-white shrink-0 shadow-[0_0_0_2px_rgba(16,185,129,0.12)]">
                                    <svg className="w-[8px] h-[8px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M5 13l4 4L19 7" style={{ strokeDasharray: 24, strokeDashoffset: 0, animation: 'stepper-check-draw 0.35s ease-out' }} />
                                    </svg>
                                </span>
                            ) : state === 'active' ? (
                                <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
                                    <span className="absolute inset-0 rounded-full border-2 border-gray-900/25" style={{ animation: 'stepper-active-ring 1.6s ease-in-out infinite' }} />
                                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 24 24" style={{ animation: 'stepper-spin 1.2s linear infinite' }}>
                                        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
                                            className="text-gray-900" strokeDasharray="14 42" />
                                    </svg>
                                    <span className="relative w-1.5 h-1.5 rounded-full bg-gray-900" />
                                </span>
                            ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                            )}
                            <span className={`${txtCls} tracking-wide transition-colors ${
                                state === 'done' ? 'text-gray-600 font-medium'
                                : state === 'active' ? 'text-gray-900 font-semibold'
                                : 'text-gray-400'
                            }`}>{s.label}</span>
                        </span>
                    </React.Fragment>
                );
            })}
        </div>
    );
};

// Kept as a no-op alias so older imports don't break during the merge into
// RoundtableGraphInline. Safe to remove in a follow-up cleanup.
export class PlanCardBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(err: unknown, info: unknown) { console.error('[PlanCard crashed]', err, info); }
    render() { return this.state.hasError ? null : this.props.children; }
}
