import { BaseTool, type ToolExecutionContext, type ToolResult } from './types.js';
import { saveMemory } from '../../services/memory.service.js';

/**
 * Lets the LLM persist a fact about the user that should survive across
 * sessions (preferences, holdings, strategy notes, watchlists). The agent
 * is encouraged to call this when the user shares a stable fact, not for
 * one-off questions.
 */
export class RememberTool extends BaseTool {
  readonly name = 'remember';
  readonly description =
    'Save a durable fact about THIS user so future sessions can recall it. ' +
    'Use this when the user shares: (a) a position or holding ("I have 0.5 BTC at $30k"), ' +
    '(b) a preference ("I only trade spot, no leverage"), ' +
    '(c) a strategy framework ("I follow Buffett value investing"), ' +
    '(d) a watchlist ("track AAPL/NVDA/TSLA"), ' +
    '(e) account constraints ("portfolio is $50k, max 10% per position"). ' +
    'Do NOT use for transient queries or facts about the market — only for facts ABOUT THE USER. ' +
    'Keep content concise (one sentence). The agent should call this on its own initiative — no need to ask the user.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      content: {
        type: 'string',
        description:
          'The fact to remember, in one short sentence. Use the same language the user used. Examples: "用户主要做 BTC 永续，偏好空头" / "User holds 0.5 BTC at $30k cost basis" / "Watchlist: AAPL, NVDA, TSLA — Buffett-style value framework".',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional 1-4 short tags to help recall. Choose from: preference, holding, strategy, risk, watchlist, framework, sector, asset, or custom.',
      },
      importance: {
        type: 'integer',
        description:
          'How permanent / influential this fact is, 0-100. Use ~70 for stable preferences, ~50 for current positions (will change), ~30 for ephemeral context.',
      },
    },
    required: ['content'],
    additionalProperties: false,
  };

  async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    if (ctx.isGuest || !ctx.userId) {
      // Guests have no User row and no persistent storage — silently no-op.
      return { ok: true, content: '(memory disabled for guest sessions)' };
    }
    const content = String(args.content || '').trim();
    if (!content || content.length < 2) {
      return { ok: false, content: '', error: 'remember: empty content' };
    }
    const tags = Array.isArray(args.tags) ? (args.tags as unknown[]).map(String) : [];
    const importance = typeof args.importance === 'number' ? args.importance : 50;

    try {
      const saved = await saveMemory({ userId: ctx.userId, content, tags, importance });
      if (!saved) {
        return { ok: false, content: '', error: 'remember: save returned null' };
      }
      ctx.emitter.emitModule('memory', 'completed', {
        action: 'saved',
        preview: saved.content.slice(0, 80),
      });
      return {
        ok: true,
        content: `Memory saved: "${saved.content.slice(0, 100)}" [tags: ${saved.tags.join(', ') || 'none'}, importance: ${saved.importance}]`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, content: '', error: `remember failed: ${msg}` };
    }
  }
}
