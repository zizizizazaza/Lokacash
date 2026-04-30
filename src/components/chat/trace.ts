// Tool-trace + planning-message helpers. Extracted from SuperAgentChat.tsx
// during the Phase-1 refactor.
import type { ToolTraceItem } from './types';

/** Backend may send 0–1 or 0–100 */
export function confidenceToPercent(n: number | undefined): number {
    if (n == null || Number.isNaN(n)) return 0;
    if (n >= 0 && n <= 1) return Math.round(n * 100);
    return Math.round(Math.min(100, Math.max(0, n)));
}

export function buildTraceFromSteps(steps: unknown[]): ToolTraceItem[] {
    const trace: ToolTraceItem[] = [];
    if (!Array.isArray(steps)) return trace;
    for (const raw of steps) {
        const s = raw as Record<string, unknown>;
        if (!s || typeof s !== 'object') continue;
        if (s.type === 'tool_start') {
            trace.push({
                tool: s.tool as string | undefined,
                displayName: (s.displayName as string) || (s.tool as string) || 'tool',
                status: 'running',
            });
        } else if (s.type === 'tool_done') {
            for (let i = trace.length - 1; i >= 0; i--) {
                if (trace[i].status === 'running' && trace[i].tool === s.tool) {
                    trace[i] = {
                        ...trace[i],
                        status: s.success === false ? 'error' : 'done',
                        durationSec: typeof s.duration === 'number' ? s.duration : undefined,
                    };
                    break;
                }
            }
        }
    }
    return trace;
}

export function extractPlanningMessage(steps: unknown[]): string | undefined {
    if (!Array.isArray(steps)) return undefined;
    let last: string | undefined;
    for (const raw of steps) {
        const s = raw as Record<string, unknown>;
        if (s?.type === 'thinking' && typeof s.message === 'string') last = s.message;
    }
    return last;
}
