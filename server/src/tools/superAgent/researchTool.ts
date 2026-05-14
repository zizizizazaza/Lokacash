import { BaseTool, type ToolExecutionContext, type ToolResult, type SignalSearchSource } from './types.js';
import { researchService } from '../../services/research.service.js';

/**
 * Wraps `researchService.runDeepResearch` for the LLM. Triggers Twitter/X
 * (Bird) + Web (Exa) search across the last 30 days and synthesises a brief.
 */
export class WebResearchTool extends BaseTool {
  readonly name = 'web_research';
  readonly description =
    'Search the web (Exa) and social platforms (Twitter/X) for the user\'s topic. Use this for any question about recent news, market sentiment, public opinion, competitive analysis, industry research, business strategy, on-chain narratives or general "what do people think" research. ' +
    'Provide a concise English query — the search backend will translate the user\'s intent. Set `showXAccountProfile=true` ONLY when the user is researching a specific Twitter/X account/project as an entity (founder, brand, official handle).';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description:
          'Concise English search query echoing user intent. Include entity names, asset symbols, and one or two key topic words. E.g. "Sahara AI token SAHARA price surge reasons" or "Apple Vision Pro consumer demand 2026".',
      },
      showXAccountProfile: {
        type: 'boolean',
        description:
          'Set to true when the query is explicitly asking about a project/founder/brand "as seen on X" — i.e. follower counts, account profile, on-CT presence. Default false.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  };

  async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const query = String(args.query || '').trim();
    if (!query) {
      return { ok: false, content: '', error: 'web_research: empty query' };
    }
    ctx.emitter.emitModule('search', 'active', {
      query: query.slice(0, 80),
      showXAccountProfile: !!args.showXAccountProfile,
    });

    // Prefer a focused, fast search (X + Web) for the v2 path. Roundtable
    // mode still falls through to v1 which controls its own depth selection.
    const searchSources = (process.env.SUPERAGENT_LAST30DAYS_SEARCH || 'x,web').trim();

    let summary = '';
    let extracted: SignalSearchSource[] = [];
    let xProfilesPresent = false;

    try {
      const result = await researchService.runDeepResearch(
        query,
        {
          deep: false,
          days: 30,
          searchSources: searchSources || undefined,
          // v2 lets the main LLM do the synthesis using the tool result, so
          // we skip the Python-side inner synthesis to save 3-5 seconds.
          skipInnerSynthesis: true,
          // Propagate "you're queued" signals to the chat layer so the user
          // sees a position+ETA indicator while waiting for a Python slot.
          onQueued: (position, etaMs) => {
            ctx.emitToUser('agent:chat:queued', {
              sessionId: ctx.sessionId,
              tool: 'web_research',
              position,
              etaMs,
              message: `You're #${position} in queue — research backend is busy. Starting in ~${Math.round(etaMs / 1000)}s.`,
            });
          },
        },
      );
      summary = result.summary || '';
      // researchService.extractedSources already conforms to the canonical
      // SignalSearchSource shape (favicon/title/domain/url/snippet) — pass
      // through verbatim, normalising only fields the frontend reads.
      extracted = (result.extractedSources || []).map((s: any) => ({
        favicon: s.favicon || 'web',
        title: s.title || s.domain || '',
        domain: s.domain || '',
        url: s.url,
        snippet: s.snippet,
      }));
      xProfilesPresent = Array.isArray(result.xProfiles) && result.xProfiles.length > 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.emitter.emitModule('search', 'completed', { error: message });
      return { ok: false, content: '', error: `web_research failed: ${message}` };
    }

    // Pass the sources array on the module data — the SuperAgentChat
    // ThinkingInlineTrigger reads sd.sources to compute the "Y sources" pill.
    ctx.emitter.emitModule('search', 'completed', {
      variant: 'web_x',
      label: 'Web + X research',
      sources: extracted,
      xProfiles: xProfilesPresent,
    });

    return {
      ok: true,
      // Match the synthesis-context budget used for web3 (16k). The full
      // research summary often runs 5-10k chars and contains the X/Web
      // citations the cryptoMemoPrompt expects to cite.
      content: (summary || '(research returned no summary)').slice(0, 16000),
      sources: extracted,
    };
  }
}
