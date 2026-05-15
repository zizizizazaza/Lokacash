// SummonCharactersView — bubble selection grid for picking which analysts
// participate in a Roundtable run. Renders a "loading" placeholder while the
// system pre-summons base agents, then a selectable grid of optional
// enhanced/master analysts.
// Extracted from SuperAgentChat.tsx during the Phase-2 refactor.
import React from 'react';
import { SUMMON_POOL } from './persona';
import { AgentAvatarImg } from './avatar';

export const SummonCharactersView: React.FC<{
    phase: 'loading' | 'selecting';
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    onConfirm: () => void;
}> = ({ phase, selectedIds, onToggle, onConfirm }) => {
    if (phase === 'loading') {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16">
                <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-[3px] border-blue-100" />
                    <div className="absolute inset-0 rounded-full border-[3px] border-blue-400 border-t-transparent animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="9" cy="7" r="3" /><circle cx="15" cy="7" r="3" />
                            <path d="M3 21v-1a4 4 0 014-4h2M13 16h4a4 4 0 014 4v1" />
                        </svg>
                    </div>
                </div>
                <div className="text-center space-y-1">
                    <p className="text-[13px] text-gray-700 font-medium">Summoning analysts for your question…</p>
                    <p className="text-[11px] text-gray-400">Summoning analysts for this discussion</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="px-5 py-3 shrink-0">
                <p className="text-[12px] text-gray-500">Select analysts for this discussion, or continue directly</p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
                {/* ── All agents in one grid: system (locked) + toggleable ── */}
                <div className="flex flex-wrap justify-center gap-5 content-center">
                    {SUMMON_POOL.map((agent, i) => {
                        const isSystem = agent.group === 'system';
                        const selected = selectedIds.has(agent.id);
                        if (isSystem) {
                            return (
                                <div key={agent.id}
                                    className="flex flex-col items-center gap-1.5 relative group"
                                    style={{ animation: `summon-pop 0.4s ease-out ${i * 0.05}s both` }}
                                >
                                    <div className="relative w-[56px] h-[56px] rounded-full overflow-hidden opacity-50 grayscale-[30%] cursor-default">
                                        <AgentAvatarImg nameOrId={agent.id} size={56} />
                                        <div className="absolute bottom-0 right-0 w-[16px] h-[16px] bg-gray-400 rounded-full flex items-center justify-center">
                                            <svg className="w-[8px] h-[8px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                            </svg>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-semibold text-gray-400 text-center leading-tight max-w-[68px]">{agent.name}</span>
                                    <span className="text-[9px] text-gray-400 text-center leading-tight max-w-[68px]">{agent.role}</span>
                                    {/* Tooltip */}
                                    <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-[9px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 shadow-lg">
                                        Auto-Assigned
                                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[3px] border-r-[3px] border-t-[3px] border-l-transparent border-r-transparent border-t-gray-800" />
                                    </div>
                                </div>
                            );
                        }
                        return (
                            <button key={agent.id}
                                onClick={() => onToggle(agent.id)}
                                className="flex flex-col items-center gap-1.5 group transition-all"
                                style={{ animation: `summon-pop 0.4s ease-out ${i * 0.05}s both` }}
                            >
                                <div className={`relative w-[56px] h-[56px] rounded-full overflow-hidden
                                    transition-all duration-200 cursor-pointer ${selected
                                        ? 'ring-[2.5px] ring-offset-2 ring-blue-400 scale-105 shadow-lg'
                                        : 'opacity-45 grayscale hover:opacity-75 hover:grayscale-0'
                                    }`}
                                >
                                    <AgentAvatarImg nameOrId={agent.id} size={56} />
                                    {selected && (
                                        <div className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] bg-blue-500 rounded-full flex items-center justify-center shadow-sm">
                                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    )}
                                </div>
                                <span className={`text-[10px] font-semibold text-center leading-tight max-w-[68px] transition-colors ${selected ? 'text-gray-800' : 'text-gray-400'}`}>{agent.name}</span>
                                <span className="text-[9px] text-gray-400 text-center leading-tight max-w-[68px]">{agent.role}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 shrink-0">
                <button onClick={onConfirm}
                    disabled={selectedIds.size === 0}
                    className="w-full py-2.5 bg-gray-900 text-white text-[13px] font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Continue · {selectedIds.size} analyst{selectedIds.size > 1 ? 's' : ''}
                </button>
            </div>
        </div>
    );
};
