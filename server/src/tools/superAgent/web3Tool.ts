import { BaseTool, type ToolExecutionContext, type ToolResult, type SignalSearchSource } from './types.js';
import { web3RouterService } from '../../services/web3Router.service.js';
import { recordChatTokenCard } from '../../services/moduleEmitter.js';
import type { Web3StageEvent } from '../../services/web3Research.service.js';

interface Web3StageRecord {
  /** Display name (e.g. "get_token_price_and_market") — used as the pill label. */
  stage: string;
  /** Internal dedup key — `${instanceId}:${stage}`. Frontend merge code uses
   *  this to avoid collisions across parallel web3 calls without polluting
   *  the visible stage label. */
  dedupKey: string;
  title_en: string;
  title_zh: string;
  state: 'active' | 'completed' | 'failed' | 'skipped';
  startedAt: number;
  durationMs?: number;
  summary?: string;
  error?: string;
  argsData?: unknown;
  rawData?: unknown;
}

/**
 * Wraps `web3RouterService.runQuery` for the LLM. Used for any crypto /
 * on-chain / DEX / token query — the same code path the v1 Plan-Execute uses
 * when `capabilities.web3.needed = true`.
 */
export class Web3TokenTool extends BaseTool {
  readonly name = 'web3_token_analysis';
  readonly description =
    'Analyze a cryptocurrency or on-chain token. Returns spot price, market cap, derivatives funding rate, recent news sentiment, and on-chain context. ' +
    'Use this for: BTC/ETH/SOL/SAHARA-style tickers, DeFi tokens, NFT floors, "trending crypto", or any "now is it a good time to long/short X" crypto question. ' +
    'Do NOT use for traditional equities (AAPL/TSLA/NVDA) — use stock_analysis instead.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description:
          'A natural-language query echoing the user intent. Include the token symbol(s) and what aspect to analyze (price, funding, on-chain, news). E.g. "Sahara token SAHARA price funding rate liquidations" or "current Bitcoin BTC spot price USD".',
      },
    },
    required: ['query'],
    additionalProperties: false,
  };

  async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const query = String(args.query || '').trim();
    if (!query) {
      return { ok: false, content: '', error: 'web3_token_analysis: empty query' };
    }

    // Per-instance prefix so parallel web3 tool calls (e.g. SOL + ETH in one
    // turn) don't collide on the frontend onModule dedupe. Stage IDs from
    // different tool instances now look like `a3f2:get_token_price_and_market`
    // vs `b8e1:get_token_price_and_market` — the SuperAgentChat merger treats
    // them as distinct stages and the "X tools" count reflects reality.
    const instanceId = Math.random().toString(36).slice(2, 8);

    // Maintain a live stages array driven by the web3RouterService onStage
    // callback. Mirrors v1's web3OnStage handler so the frontend's Process
    // panel + "Done · X tools" pill render accurately.
    const stages: Web3StageRecord[] = [];
    const emitWeb3Module = (status: 'active' | 'completed') => {
      ctx.emitter.emitModule('web3', status, {
        variant: 'coingecko_mcp',
        label: 'CoinGecko MCP',
        stages: stages.map((s) => ({
          stage: s.stage,
          dedupKey: s.dedupKey,
          title_en: s.title_en,
          title_zh: s.title_zh,
          state: s.state,
          durationMs: s.durationMs,
          summary: s.summary,
          error: s.error,
          argsData: s.argsData,
          rawData: s.rawData,
        })),
      });
    };
    emitWeb3Module('active');

    const onStage = (ev: Web3StageEvent) => {
      // dedupKey = instanceId + stage so parallel calls don't collide on
      // the frontend merge. stage stays clean for the pill label so the UI
      // shows "get_token_price_and_market" not "nzyy6f:get_token_...".
      const dedupKey = `${instanceId}:${ev.stage}`;
      const activeIdx = stages.findIndex((s) => s.dedupKey === dedupKey && s.state === 'active');
      if (ev.state === 'active') {
        const dupIdx = stages.findIndex((s) => s.dedupKey === dedupKey);
        const entry: Web3StageRecord = {
          stage: ev.stage,
          dedupKey,
          title_en: ev.title_en,
          title_zh: ev.title_zh,
          state: 'active',
          startedAt: Date.now(),
          argsData: ev.argsData,
        };
        if (dupIdx >= 0) stages[dupIdx] = entry;
        else stages.push(entry);
      } else if (activeIdx >= 0) {
        stages[activeIdx] = {
          ...stages[activeIdx],
          state: ev.state,
          durationMs: ev.durationMs,
          summary: ev.summary,
          error: ev.error,
          rawData: ev.rawData ?? stages[activeIdx].rawData,
        };
      } else {
        stages.push({
          stage: ev.stage,
          dedupKey,
          title_en: ev.title_en,
          title_zh: ev.title_zh,
          state: ev.state,
          startedAt: Date.now(),
          durationMs: ev.durationMs,
          summary: ev.summary,
          error: ev.error,
          argsData: ev.argsData,
          rawData: ev.rawData,
        });
      }
      emitWeb3Module('active');
    };

    const hint =
      ctx.assetHint?.kind === 'crypto' && ctx.assetHint?.coingeckoId
        ? {
            coingeckoId: ctx.assetHint.coingeckoId,
            symbol: ctx.assetHint.sym,
            name: ctx.assetHint.name,
          }
        : null;

    const result = await web3RouterService.runQuery(query, {
      hint: hint || undefined,
      onStage,
    });

    // Surface the tokenCard via the same event v1 emits, so the existing
    // frontend renderer picks it up unchanged. Also record into the replay
    // buffer so a client that navigates away mid-stream still gets the card.
    const snap = result?.raw?.tokenSnapshot;
    if (snap && (snap as any).id) {
      recordChatTokenCard(ctx.sessionId, snap);
      ctx.emitToUser('agent:chat:token', { sessionId: ctx.sessionId, token: snap });
    }

    const sources: SignalSearchSource[] = [];
    const assets = Array.isArray(result?.raw?.assets) ? result.raw.assets : [];
    for (const a of assets) {
      if (a?.id) {
        sources.push({
          favicon: 'web',
          title: a.name ? `${a.name} (${a.symbol || ''})` : a.id,
          domain: 'coingecko.com',
          url: `https://www.coingecko.com/en/coins/${a.id}`,
        });
      }
    }

    emitWeb3Module('completed');

    // Bump content cap to 16k chars — the synthesis pass needs the full
    // OKX market+derivatives+news payload to write a data-rich report. v1
    // sent its full contextString (~10k+ chars) to the synthesis LLM, so
    // 16k per tool gives roughly 2x headroom for crypto deep-dives.
    const content = (result?.report || '').slice(0, 16000);

    return {
      ok: true,
      content: content || '(web3 router returned empty report)',
      sources,
      artifacts: snap ? { tokenCard: snap, web3Stages: stages } : { web3Stages: stages },
    };
  }
}
