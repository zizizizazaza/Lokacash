/**
 * AppProgressLogs — Reusable progress log display for agent apps.
 * 
 * Supports TWO rendering modes:
 * 1. Legacy: string[] logs (used by HedgeFund and other apps)
 * 2. Structured: StepEvent[] steps with tool_start/done spinners, elapsed time, etc.
 */
import React from 'react';

// ── Structured step event type (from stock analysis agent) ──
export interface StepEvent {
  type: 'thinking' | 'tool_start' | 'tool_done' | 'generating' | 'done' | 'error';
  step?: number;
  tool?: string;
  displayName?: string;
  message?: string;
  success?: boolean;
  duration?: number;
  content?: string;
  ts?: number;
}

interface AppProgressLogsProps {
  /** Legacy: array of raw log strings */
  logs?: string[];
  /** Structured: array of step events (from stock analysis) */
  steps?: StepEvent[];
  isRunning: boolean;
  /** Accent color for the spinner: 'blue' | 'emerald' | 'red' etc. */
  accentColor?: string;
  runningLabel?: string;
  doneLabel?: string;
  initLabel?: string;
}

const colorMap: Record<string, { spinnerBorder: string; textActive: string; headerBg: string; headerIcon: string }> = {
  blue:    { spinnerBorder: 'border-blue-500', textActive: 'text-blue-600', headerBg: 'bg-blue-100', headerIcon: 'text-blue-600' },
  emerald: { spinnerBorder: 'border-emerald-500', textActive: 'text-emerald-600', headerBg: 'bg-emerald-100', headerIcon: 'text-emerald-600' },
  red:     { spinnerBorder: 'border-red-500', textActive: 'text-red-600', headerBg: 'bg-red-100', headerIcon: 'text-red-600' },
};

const AppProgressLogs: React.FC<AppProgressLogsProps> = ({
  logs,
  steps,
  isRunning,
  accentColor = 'blue',
  runningLabel = 'Agents analyzing...',
  doneLabel = 'Analysis complete',
  initLabel = 'Initializing execution layer...',
}) => {
  const c = colorMap[accentColor] || colorMap.blue;

  // If structured steps are provided, use the structured renderer
  const hasSteps = steps && steps.length > 0;

  return (
    <div className="mb-4">
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        {isRunning ? (
          <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className={`w-3.5 h-3.5 rounded-full ${c.headerBg} flex items-center justify-center`}>
            <svg className={`w-2 h-2 ${c.headerIcon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        <span className="text-[11px] font-semibold text-gray-500">
          {isRunning ? runningLabel : doneLabel}
        </span>
      </div>

      {/* Content */}
      <div className="pl-2 border-l-2 border-gray-100 ml-[7px] space-y-0.5 max-h-[350px] overflow-y-auto">
        {/* Empty + running: show init spinner */}
        {!hasSteps && (!logs || logs.length === 0) && isRunning && (
          <div className="flex items-center gap-1.5 py-0.5">
            <div className={`w-2.5 h-2.5 border ${c.spinnerBorder} border-t-transparent rounded-full animate-spin shrink-0`} />
            <span className={`text-[11px] ${c.textActive} font-bold`}>{initLabel}</span>
          </div>
        )}

        {/* ── Structured step rendering ── */}
        {hasSteps && steps!.map((step, idx) => {
          // Skip 'done' and 'error' events in the step list (they're handled elsewhere)
          if (step.type === 'done' || step.type === 'error') return null;

          const isLast = idx === steps!.length - 1;
          const isActive = isLast && isRunning && (step.type === 'thinking' || step.type === 'tool_start' || step.type === 'generating');

          if (step.type === 'thinking') {
            return (
              <div key={idx} className="flex items-center gap-1.5 py-0.5">
                {isActive ? (
                  <div className={`w-2.5 h-2.5 border ${c.spinnerBorder} border-t-transparent rounded-full animate-spin shrink-0`} />
                ) : (
                  <svg className="w-2.5 h-2.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <span className={`text-[11px] leading-snug flex-1 ${isActive ? `${c.textActive} font-bold` : 'text-gray-500 font-medium'}`}>
                  💭 {step.message || '正在思考...'}
                </span>
              </div>
            );
          }

          if (step.type === 'tool_start') {
            // Check if there's a matching tool_done after this
            const doneEvent = steps!.slice(idx + 1).find(
              s => s.type === 'tool_done' && s.tool === step.tool
            );
            const isDone = !!doneEvent;

            return (
              <div key={idx} className="flex items-center gap-1.5 py-0.5">
                {isDone ? (
                  <svg className="w-2.5 h-2.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : isActive ? (
                  <div className={`w-2.5 h-2.5 border ${c.spinnerBorder} border-t-transparent rounded-full animate-spin shrink-0`} />
                ) : (
                  <svg className="w-2.5 h-2.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <span className={`text-[11px] leading-snug flex-1 ${isDone ? 'text-gray-600 font-medium' : isActive ? `${c.textActive} font-bold` : 'text-gray-600 font-medium'}`}>
                  {step.displayName || step.tool}
                  {isDone && doneEvent.duration !== undefined && (
                    <span className="ml-1.5 text-[10px] text-gray-400 font-normal">
                      ({doneEvent.duration.toFixed(1)}s)
                    </span>
                  )}
                </span>
              </div>
            );
          }

          // tool_done: skip (rendered inline with tool_start above)
          if (step.type === 'tool_done') return null;

          if (step.type === 'generating') {
            return (
              <div key={idx} className="flex items-center gap-1.5 py-0.5">
                {isActive ? (
                  <div className={`w-2.5 h-2.5 border ${c.spinnerBorder} border-t-transparent rounded-full animate-spin shrink-0`} />
                ) : (
                  <svg className="w-2.5 h-2.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <span className={`text-[11px] leading-snug flex-1 ${isActive ? `${c.textActive} font-bold` : 'text-gray-600 font-medium'}`}>
                  📝 {step.message || '正在生成分析报告...'}
                </span>
              </div>
            );
          }

          return null;
        })}

        {/* ── Legacy string log rendering ── */}
        {!hasSteps && logs && logs.map((l, idx) => {
          const isLast = idx === logs.length - 1;
          const isDone = !isRunning || !isLast;
          const cleanLog = l.replace(/\x1b\[[0-9;]*m/g, '').trim();
          if (!cleanLog) return null;
          return (
            <div key={idx} className="flex items-center gap-1.5 py-0.5">
              {isDone ? (
                <svg className="w-2.5 h-2.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <div className={`w-2.5 h-2.5 border ${c.spinnerBorder} border-t-transparent rounded-full animate-spin shrink-0`} />
              )}
              <span className={`text-[11px] leading-snug break-words flex-1 ${isDone ? 'text-gray-600 font-medium' : `${c.textActive} font-bold`}`}>
                {cleanLog}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AppProgressLogs;
