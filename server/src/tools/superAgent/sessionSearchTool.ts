import { BaseTool, type ToolExecutionContext, type ToolResult } from './types.js';
import { searchUserMessages } from '../../services/sessionSearch.service.js';

/**
 * Lets the agent reach back into the user's prior conversations to cite or
 * compare past analyses. The killer use case: "3 days ago you asked about
 * BTC funding and it was 0.05%/8h, now it's 0.012%/8h — funding has tightened
 * 76%". Without this, the LLM has zero context across sessions.
 */
export class SessionSearchTool extends BaseTool {
  readonly name = 'session_search';
  readonly description =
    'Search this user\'s prior chat conversations for past analyses, mentions, ' +
    'or decisions. Returns the most relevant past messages (both user and assistant). ' +
    'Use this when: (a) the user asks "what did I think about X before", ' +
    '(b) you want to cite a past analysis to show change over time, ' +
    '(c) the user references something they said earlier that isn\'t in this session\'s window. ' +
    'Do NOT use for general knowledge questions — only when the answer requires the user\'s OWN history.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description:
          'Keywords or short phrase to match against past messages. Use the asset symbol or distinguishing keyword (e.g. "SAHARA tokenomics", "NVDA earnings", "Buffett framework").',
      },
      limit: {
        type: 'integer',
        description: 'Max number of past messages to return (default 5, max 15).',
      },
    },
    required: ['query'],
    additionalProperties: false,
  };

  async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    if (ctx.isGuest || !ctx.userId) {
      return {
        ok: true,
        content: '(session search disabled for guest sessions — sign in to access conversation history)',
      };
    }
    const query = String(args.query || '').trim();
    if (!query || query.length < 2) {
      return { ok: false, content: '', error: 'session_search: query too short' };
    }
    const limit = Math.max(1, Math.min(15, typeof args.limit === 'number' ? args.limit : 5));

    try {
      const hits = await searchUserMessages(ctx.userId, query, { limit });
      if (hits.length === 0) {
        return { ok: true, content: `No past messages matched "${query}".` };
      }
      const formatted = hits
        .map((h, i) => {
          const date = h.createdAt.toISOString().slice(0, 10);
          const role = h.role === 'user' ? 'User' : 'Assistant';
          return `${i + 1}. [${date} · ${role}] ${h.snippet}`;
        })
        .join('\n');
      ctx.emitter.emitModule('session_search', 'completed', { hits: hits.length });
      return {
        ok: true,
        content: `Past conversations matching "${query}" (most recent ${hits.length}):\n\n${formatted}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, content: '', error: `session_search failed: ${msg}` };
    }
  }
}
