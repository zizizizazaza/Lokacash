/**
 * ThinkingPanel — Multi-agent thinking process visualization.
 * Extracted from SuperAgentChat's ThinkingProcessPanel + AgentStepPanel + CollaborationProcess.
 */
import React, { useState, useEffect } from 'react';
import type { ThinkingProcess, AgentThought, AgentStep } from '../../types/chat';

// ─── CollaborationProcess ───────────────────────────────────
const CollaborationProcess: React.FC<{ thinking: ThinkingProcess }> = ({ thinking }) => {
  const p = thinking.phase;
  const isDone = !thinking.isActive;
  const activePhase = isDone ? 3 : p === 'persuading' ? 2 : p === 'evaluating' ? 1 : 0;
  const steps = [
    { id: 0, label: 'Generating Answers' },
    { id: 1, label: 'Peer Evaluation' },
    { id: 2, label: 'Reaching Consensus' },
  ];

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 pb-1">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Agent Collaboration</span>
      <div className="space-y-1.5 ml-1">
        {steps.map(s => {
          const status = isDone || activePhase > s.id ? 'done' : activePhase === s.id ? 'active' : 'pending';
          return (
            <div key={s.id} className="flex items-center gap-2">
              {status === 'done' ? (
                <svg className="w-2.5 h-2.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              ) : status === 'active' ? (
                <div className="w-2.5 h-2.5 border border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full border border-gray-200 shrink-0" />
              )}
              <span className={`text-[10px] ${status === 'done' ? 'text-gray-400 line-through' : status === 'active' ? 'text-blue-500 font-medium' : 'text-gray-300'}`}>{s.label}</span>
            </div>
          );
        })}
      </div>
      {isDone && thinking.consensus && (
        <div className="mt-3 bg-gray-50 rounded bg-opacity-50 p-2 flex items-center justify-between">
          <span className="text-[10px] text-gray-500 font-semibold uppercase">Final Verdict</span>
          <span className={`text-[10px] font-bold ${thinking.consensus.verdict === 'bullish' ? 'text-emerald-600' : thinking.consensus.verdict === 'bearish' ? 'text-red-500' : 'text-gray-500'}`}>
            {thinking.consensus.verdict === 'bullish' ? '↑ Low Risk' : thinking.consensus.verdict === 'bearish' ? '↓ High Risk' : '— Moderate'} ({thinking.consensus.confidence}%)
          </span>
        </div>
      )}
    </div>
  );
};

// ─── ThinkingPanel (main export) ────────────────────────────
interface ThinkingPanelProps {
  thinking: ThinkingProcess;
  userQuery?: string;
  onOpenGraph?: () => void;
}

const ThinkingPanel: React.FC<ThinkingPanelProps> = ({ thinking, userQuery = '', onOpenGraph }) => {
  const [collapsed, setCollapsed] = useState(false);
  const completedCount = thinking.agents.filter(a => a.status === 'completed').length;
  const allDone = !thinking.isActive && !!thinking.consensus;

  useEffect(() => {
    if (allDone) setCollapsed(false);
  }, [allDone]);

  return (
    <div className="mb-4">
      {/* Header toggle */}
      <button onClick={() => setCollapsed(c => !c)} className="flex items-center gap-2 mb-2 w-full text-left">
        <div className="flex items-center gap-1.5">
          {thinking.isActive ? (
            <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <div className="w-3.5 h-3.5 rounded-full bg-gray-200 flex items-center justify-center">
              <svg className="w-2 h-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </div>
          )}
          <span className="text-[11px] font-semibold text-gray-500">
            {thinking.isActive ? 'Agents thinking...' : 'Analysis complete'}
          </span>
          <span className="text-[10px] text-gray-300">{completedCount}/{thinking.agents.length}</span>
        </div>
        <svg className={`w-3 h-3 text-gray-300 ml-auto transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body — flat list */}
      {!collapsed && (
        <div className="pl-2 border-l-2 border-gray-100 ml-2 space-y-3">
          {thinking.agents.map(agent => {
            const isDone = agent.status === 'completed';
            return (
              <div key={agent.agentId}>
                <div className="space-y-0.5">
                  {agent.steps?.map((step, idx) => (
                    <div key={idx} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        {step.status === 'done' ? (
                          <svg className="w-2.5 h-2.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        ) : step.status === 'active' ? (
                          <div className="w-2.5 h-2.5 border border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full border border-gray-200 shrink-0" />
                        )}
                        <span className={`text-[11px] ${step.status === 'done' ? 'text-gray-600 font-medium' : step.status === 'active' ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>{step.label}</span>
                      </div>
                      {/* Step detail renderers */}
                      {step.status !== 'pending' && step.detailType === 'table' && (
                        <div className="ml-4 mr-2 bg-gray-50 border border-gray-100 rounded p-2 overflow-x-auto">
                          <table className="w-full text-left text-[9px] text-gray-500 whitespace-nowrap">
                            <thead><tr className="border-b border-gray-200 text-gray-400"><th className="pb-1 font-medium">Metric</th><th className="pb-1 font-medium">Value</th><th className="pb-1 font-medium">Benchmark</th></tr></thead>
                            <tbody>
                              <tr className="border-b border-gray-100 last:border-0"><td className="py-1">MoM Growth</td><td className="py-1 text-gray-700">28%</td><td className="py-1">15%</td></tr>
                              <tr className="border-b border-gray-100 last:border-0"><td className="py-1">Default Prob</td><td className="py-1 text-gray-700">2.3%</td><td className="py-1">{'<'} 5.0%</td></tr>
                              <tr className="border-b border-gray-100 last:border-0"><td className="py-1">Profit Margin</td><td className="py-1 text-gray-700">65%</td><td className="py-1">40%</td></tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                      {step.status !== 'pending' && step.detailType === 'news' && (
                        <div className="ml-4 mr-2 space-y-1.5">
                          <div className="flex items-center gap-1.5 p-1.5 bg-gray-50 border border-gray-100 rounded">
                            <div className="w-4 h-4 rounded bg-gray-200 shrink-0 flex items-center justify-center text-[8px]">📰</div>
                            <span className="text-[9px] text-gray-600 truncate">Key executive departure impacts quarterly guidance</span>
                          </div>
                          <div className="flex items-center gap-1.5 p-1.5 bg-gray-50 border border-gray-100 rounded">
                            <div className="w-4 h-4 rounded bg-gray-200 shrink-0 flex items-center justify-center text-[8px]">📰</div>
                            <span className="text-[9px] text-gray-600 truncate">Institutional accumulation accelerates across top funds</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {isDone && agent.summary && (
                    <p className="text-[10px] text-gray-400 mt-1">{agent.summary}</p>
                  )}
                </div>
              </div>
            );
          })}
          <CollaborationProcess thinking={thinking} />
        </div>
      )}

      {/* Collapsed summary */}
      {collapsed && thinking.consensus && (
        <div className="flex items-center gap-3 ml-6">
          <button onClick={() => setCollapsed(false)} className="flex items-center gap-2 text-[10px] text-gray-400 hover:text-gray-600 transition-colors">
            <span className={`font-bold ${thinking.consensus.verdict === 'bullish' ? 'text-emerald-500' : thinking.consensus.verdict === 'bearish' ? 'text-red-400' : 'text-gray-500'}`}>
              {thinking.consensus.verdict === 'bullish' ? '↑ Low Risk' : thinking.consensus.verdict === 'bearish' ? '↓ High Risk' : '— Moderate'}
            </span>
            <span>· {thinking.consensus.confidence}% confidence</span>
            <span className="text-[9px] underline ml-1">Expand</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ThinkingPanel;
