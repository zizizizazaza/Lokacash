import { BaseTool, type ToolExecutionContext, type ToolResult } from './types.js';
import { stockAnalysisService } from '../../services/stockanalysis.service.js';
import { recordChatToolTraceStep } from '../../services/moduleEmitter.js';

/**
 * Wraps `stockAnalysisService.runStreamAnalysis` for the LLM. Designed for
 * traditional equities (US/A-share/HK) — price action, technicals, fundamentals,
 * buy/sell/hold reasoning. Crypto tokens go through `web3_token_analysis`.
 */
export class StockAnalysisTool extends BaseTool {
  readonly name = 'stock_analysis';
  readonly description =
    'Analyze a tradeable equity ticker (US / A-share / HK). Returns technical indicators (MA/RSI/MACD), fundamentals (PE/PB/revenue), and a buy/sell/hold recommendation. ' +
    'Use this ONLY for stock tickers like AAPL, TSLA, NVDA, BABA, 600519.SH, 700.HK. ' +
    'Do NOT use for cryptocurrencies (BTC/ETH/SOL/SAHARA) — use web3_token_analysis instead.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      tickers: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of equity tickers to analyze. E.g. ["AAPL"], ["NVDA","AMD"], ["600519.SH"].',
      },
      query: {
        type: 'string',
        description:
          'Original user question, used as the analysis prompt. E.g. "深度分析阿里和腾讯的投资价值".',
      },
    },
    required: ['tickers'],
    additionalProperties: false,
  };

  async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const tickers = Array.isArray(args.tickers) ? (args.tickers as unknown[]).map((t) => String(t).trim()).filter(Boolean) : [];
    if (tickers.length === 0) {
      return { ok: false, content: '', error: 'stock_analysis: no tickers provided' };
    }
    const query = String(args.query || '').trim() || `Analyze: ${tickers.join(', ')}`;
    const isZh = /[一-鿿]/.test(query);

    ctx.emitter.emitModule('analysis', 'active', { tickers });

    // ── Helpers for QuoteCard payload (v2 only). v1 has its own copy inside
    //    socket/index.ts that runs off [UI_METADATA] events. v2 builds the
    //    same payload directly off `tool_done` for `get_realtime_quote`, and
    //    enriches with `sparkline7d` once `get_daily_history` arrives.
    const fmtVol = (v: number | null | undefined): string | undefined => {
      if (v == null) return undefined;
      if (isZh) {
        if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
        if (v >= 1e4) return (v / 1e4).toFixed(1) + '万';
      } else {
        if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
        if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
        if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
      }
      return String(v);
    };
    const fmtMv = (v: number | null | undefined): string | undefined => {
      if (v == null) return undefined;
      // 2-decimal precision so 市值 reads "999.03亿" instead of the lossy "999亿"
      // (matches Xueqiu / Eastmoney convention for stock cards).
      if (isZh) {
        if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
        if (v >= 1e4) return (v / 1e4).toFixed(1) + '万';
      } else {
        if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
        if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
      }
      return String(v);
    };
    const detectMarket = (sym: string): string | undefined => {
      if (!sym) return undefined;
      if (/^\d{6}\.(SH|SZ|SS)$/i.test(sym) || /^(sh|sz)\d{6}$/i.test(sym) || /^[0-368]\d{5}$/.test(sym))
        return isZh ? 'A股' : 'A-Share';
      if (/\.HK$/i.test(sym) || /^\d{4,5}\.HK$/i.test(sym))
        return isZh ? '港股' : 'HK';
      if (/\.(US|NASDAQ|NYSE)$/i.test(sym))
        return isZh ? '美股' : 'US';
      for (const t of tickers) {
        if (/\.(SH|SZ|SS)$/i.test(t)) return isZh ? 'A股' : 'A-Share';
        if (/\.HK$/i.test(t)) return isZh ? '港股' : 'HK';
        if (/\.(US|NASDAQ|NYSE)$/i.test(t)) return isZh ? '美股' : 'US';
      }
      if (/^[A-Z]{1,5}$/.test(sym)) return isZh ? '美股' : 'US';
      return undefined;
    };
    // Coerce step.result (object) or step.rawText (JSON string) to a plain object.
    const parseRaw = (result: any, rawText: any): any | null => {
      if (result && typeof result === 'object') return result;
      if (typeof rawText === 'string' && rawText.trim()) {
        try { return JSON.parse(rawText); } catch { return null; }
      }
      if (typeof result === 'string' && result.trim()) {
        try { return JSON.parse(result); } catch { return null; }
      }
      return null;
    };

    return await new Promise<ToolResult>((resolve) => {
      const subSessionId = `${ctx.sessionId}:analysis`;
      let report = '';
      let errored = false;
      let errorMsg = '';

      // Capture each tool's structured result. Python runs in `data_only: True`
      // mode (final answer suppressed — SuperAgent does cross-module synthesis
      // itself), so `finalReport` arrives EMPTY. The actual data lives in
      // per-tool `tool_done` events. Without aggregating them here the
      // synthesis model only sees "(stock analysis returned empty report)"
      // and falls back to fabricating prices from news article text.
      const toolResults: Array<{ tool: string; result: unknown; rawText?: string }> = [];

      // QuoteCard accumulation — `get_realtime_quote` and `get_daily_history`
      // arrive independently. Whichever comes first stores its data; the
      // second one merges and (re-)emits the card to the frontend.
      let savedQuotePayload: any = null;
      let savedSparkline7d: number[] | undefined;
      const buildQuotePayload = (q: any): any | null => {
        const symbol = q.symbol || q.code;
        if (!symbol || q.price == null) return null;
        const numPrice = typeof q.price === 'number' ? q.price : parseFloat(String(q.price));
        if (Number.isNaN(numPrice)) return null;
        return {
          symbol,
          name: q.name || undefined,
          market: detectMarket(symbol),
          lang: isZh ? 'zh' : 'en',
          price: numPrice.toFixed(2),
          change: q.change_pct != null
            ? (q.change_pct >= 0 ? '+' : '') + Number(q.change_pct).toFixed(2) + '%'
            : undefined,
          volume: fmtVol(q.volume),
          amount: fmtVol(q.amount),
          high: q.high != null ? Number(q.high).toFixed(2) : undefined,
          low: q.low != null ? Number(q.low).toFixed(2) : undefined,
          open: q.open != null ? Number(q.open).toFixed(2) : undefined,
          prevClose: (q.prev_close ?? q.pre_close) != null
            ? Number(q.prev_close ?? q.pre_close).toFixed(2) : undefined,
          marketCap: fmtMv(q.total_mv || q.circ_mv),
          pe: (q.pe ?? q.pe_ratio) != null ? Number(q.pe ?? q.pe_ratio).toFixed(2) : undefined,
          pb: (q.pb ?? q.pb_ratio) != null ? Number(q.pb ?? q.pb_ratio).toFixed(2) : undefined,
          turnover: (q.turnover ?? q.turnover_rate) != null
            ? Number(q.turnover ?? q.turnover_rate).toFixed(2) + '%' : undefined,
          sparkline7d: savedSparkline7d,
        };
      };

      stockAnalysisService.runStreamAnalysis(
        `Analyze: ${tickers.join(', ')}`,
        subSessionId,
        ctx.userId,
        (step: any) => {
          // Record raw tool_trace into the replay buffer + forward to client
          // for live UI updates. Same channel v1 uses, so frontend renderers
          // light up identically.
          recordChatToolTraceStep(ctx.sessionId, step);
          ctx.emitToUser('agent:chat:tool_trace', { sessionId: ctx.sessionId, step });

          if (step?.type === 'tool_done' && typeof step.tool === 'string' && step.success !== false) {
            toolResults.push({
              tool: step.tool,
              result: step.result,
              rawText: typeof step.rawText === 'string' ? step.rawText : undefined,
            });

            // ── v2 QuoteCard emission (mirrors v1's [UI_METADATA] path).
            const raw = parseRaw(step.result, (step as any).rawText);
            if (raw) {
              if (step.tool === 'get_daily_history' && Array.isArray((raw as any).data)) {
                const closes = ((raw as any).data as any[])
                  .map((row) => Number(row?.close ?? row?.Close))
                  .filter((n) => Number.isFinite(n));
                if (closes.length >= 2) {
                  savedSparkline7d = closes.slice(-30);
                  // If quote card already emitted, re-emit with sparkline attached.
                  if (savedQuotePayload) {
                    const updated = { ...savedQuotePayload, sparkline7d: savedSparkline7d };
                    savedQuotePayload = updated;
                    ctx.emitToUser('agent:chat:quote', { sessionId: ctx.sessionId, quote: updated });
                  }
                }
              } else if (step.tool === 'get_realtime_quote') {
                const payload = buildQuotePayload(raw);
                if (payload) {
                  savedQuotePayload = payload;
                  ctx.emitToUser('agent:chat:quote', { sessionId: ctx.sessionId, quote: payload });
                }
              }
            }
          }
        },
        (finalReport: string) => {
          report = finalReport || '';
          ctx.emitter.emitModule('analysis', 'completed', { tickers });

          // Build a structured digest from the captured tool results so the
          // synthesis model has the actual numbers (price, PE, market cap,
          // recent K-line rows) and won't hallucinate. Format: one section
          // per tool with a code-fenced JSON payload. Trim get_daily_history
          // to its last 10 rows so we don't blow the token budget.
          const summarizeResult = (tool: string, raw: unknown): string => {
            if (raw == null) return '';
            let payload: any = raw;
            if (tool === 'get_daily_history' && raw && typeof raw === 'object' && Array.isArray((raw as any).data)) {
              const rows = (raw as any).data as any[];
              const tail = rows.slice(-10);
              payload = {
                code: (raw as any).code,
                source: (raw as any).source,
                total_records: (raw as any).total_records,
                latest_rows: tail,
              };
            }
            try {
              return JSON.stringify(payload, null, 2);
            } catch {
              return String(raw);
            }
          };

          const sections: string[] = [];
          for (const tr of toolResults) {
            const summary = summarizeResult(tr.tool, tr.result);
            if (summary) {
              sections.push(`### ${tr.tool}\n\n\`\`\`json\n${summary}\n\`\`\``);
            } else if (tr.rawText) {
              sections.push(`### ${tr.tool}\n\n${tr.rawText.slice(0, 1500)}`);
            }
          }

          let content = '';
          if (sections.length > 0) {
            content = `## Raw tool results (use these numbers; do NOT compute or fabricate)\n\n${sections.join('\n\n')}`;
            if (report.trim()) {
              content += `\n\n## Agent narrative (data_only mode usually omits this)\n\n${report}`;
            }
          } else if (report.trim()) {
            content = report;
          } else {
            content = '(stock analysis returned no tool data)';
          }

          // Pack the final quote+sparkline payload as an artifact so
          // superAgentV2 can persist it to message metadata. Without this,
          // the in-memory `quoteCards[msgIdx]` is lost on page refresh /
          // history reload, and the QuoteCard silently falls back to the
          // markdown-parsed version (no sparkline).
          const artifacts: Record<string, unknown> = {};
          if (savedQuotePayload) {
            // Ensure sparkline7d is up-to-date (re-emit may have happened
            // out of order, but the saved payload's field reflects the
            // latest merge).
            artifacts.quoteCard = savedSparkline7d
              ? { ...savedQuotePayload, sparkline7d: savedSparkline7d }
              : savedQuotePayload;
          }
          resolve({
            ok: true,
            // Bump budget: 8k was tight for daily history JSON + realtime
            // quote + indicators. The synthesis model needs the structured
            // numbers — truncating them defeats the whole fix.
            content: content.slice(0, 16000),
            artifacts: Object.keys(artifacts).length > 0 ? artifacts : undefined,
          });
        },
        (errStr: string) => {
          errored = true;
          errorMsg = errStr || 'stock analysis failed';
          ctx.emitter.emitModule('analysis', 'completed', { error: errorMsg });
          resolve({ ok: false, content: '', error: errorMsg });
        },
      );

      // Honor cancellation
      ctx.abortSignal.addEventListener('abort', () => {
        if (!report && !errored) {
          resolve({ ok: false, content: '', error: 'stock_analysis: cancelled' });
        }
      });

      // Suppress unused-variable warnings for early-return refs
      void query;
    });
  }
}
