import { BaseTool, type ToolExecutionContext, type ToolResult } from './types.js';
import { hedgefundService } from '../../services/hedgefund.service.js';

/**
 * Wraps `hedgefundService.runAnalysis` for the LLM. Used for explicit
 * "simulate / what-if / multi-investor debate" requests — drives the AI Hedge
 * Fund multi-agent backtest engine.
 */
export class PortfolioSimulateTool extends BaseTool {
  readonly name = 'portfolio_simulate';
  readonly description =
    'Run a multi-investor scenario simulation / portfolio backtest. Triggers the AI Hedge Fund engine with N analyst personas debating a position. ' +
    'Use this ONLY when the user explicitly asks for: "simulate X", "what if Fed cuts", "Buffett vs Dalio on NVDA", "multi-investor debate". ' +
    'Do NOT use for general analysis, news, or routine "should I buy X" questions — use stock_analysis for those.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      tickers: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Tickers to simulate. For broad-market macro scenarios use ["QQQ"] or ["SPY"]. For specific names use the ticker (e.g. ["NVDA"]).',
      },
      analysts: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of analyst persona ids (Buffett/Dalio/Lynch/Munger/Soros). Empty list = use defaults.',
      },
    },
    required: ['tickers'],
    additionalProperties: false,
  };

  async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const tickers = Array.isArray(args.tickers) ? (args.tickers as unknown[]).map((t) => String(t).trim()).filter(Boolean) : [];
    if (tickers.length === 0) {
      return { ok: false, content: '', error: 'portfolio_simulate: no tickers' };
    }
    const analysts = Array.isArray(args.analysts) ? (args.analysts as unknown[]).map((a) => String(a)).filter(Boolean) : undefined;

    ctx.emitter.emitModule('simulate', 'active', { tickers, analysts });

    try {
      const result = await hedgefundService.runAnalysis(
        {
          tickers,
          analysts,
          showReasoning: true,
        },
        () => {
          // progress logs swallowed for v2; v1 had richer wiring we can port later
        },
      );
      const report = hedgefundService.formatReport(result, false);
      ctx.emitter.emitModule('simulate', 'completed', { tickers });
      return {
        ok: true,
        content: (report || '(simulate returned empty)').slice(0, 8000),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.emitter.emitModule('simulate', 'completed', { error: message });
      return { ok: false, content: '', error: `portfolio_simulate failed: ${message}` };
    }
  }
}
