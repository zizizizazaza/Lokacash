/**
 * BaseTool framework for the SuperAgent v2 orchestrator (Phase 1).
 *
 * Mirrors the Vibe-Trading ToolRegistry pattern but in TypeScript. Each tool
 * exposes:
 *   - name        — function name visible to the LLM
 *   - description — used by the LLM to choose tools
 *   - parameters  — JSONSchema fed via OpenAI tools API
 *   - execute()   — runs against the wrapped service and returns a normalized
 *                   ToolResult (text content + sources + optional artifacts)
 *
 * The dispatcher (runSuperAgentV2) calls tools in parallel, then feeds their
 * results back to the LLM as `role: "tool"` messages for final synthesis.
 */
import type { Socket } from 'socket.io';

// Re-export the canonical source shape so frontend renderers (which require
// favicon + title + domain) don't crash on `(s.favicon ?? s.domain).slice()`.
export type { SignalSearchSource } from '../../services/signalRadarThinking.js';
import type { SignalSearchSource } from '../../services/signalRadarThinking.js';

export interface ToolExecutionContext {
  userId: string;
  sessionId: string;
  socket: Socket;
  /** When true, suppresses DB persistence for guest users. */
  isGuest: boolean;
  /** AbortController.signal for the current chat turn. */
  abortSignal: AbortSignal;
  /** Helpers tools may use to push UI events back to the client. */
  emitToUser: (event: string, payload: unknown) => void;
  emitter: {
    emitModule: (
      moduleType: string,
      status: 'pending' | 'active' | 'done' | 'completed' | 'concluded',
      data?: unknown,
    ) => void;
    emitProgress: (chunk: string) => void;
  };
  /** Domain hint from the frontend — when 'web3', tools should bias crypto path. */
  domain?: 'stocks' | 'web3';
  /** Asset hint from a trending-card click on the home page. */
  assetHint?: { sym?: string; name?: string; kind?: string; coingeckoId?: string };
}

export interface ToolResult {
  ok: boolean;
  /** Markdown/plain text fed back to the LLM as the role:tool message body. */
  content: string;
  /** Citations to surface in the final UI footer. */
  sources?: SignalSearchSource[];
  /** Frontend-renderable cards (tokenCard, quoteCard, etc). Best-effort, not all tools emit. */
  artifacts?: Record<string, unknown>;
  /** Set when ok=false. */
  error?: string;
  /** Wall-clock duration in ms. Filled by registry. */
  durationMs?: number;
}

export interface OpenAIToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: OpenAIToolSchema['function']['parameters'];

  abstract execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult>;

  toOpenAISchema(): OpenAIToolSchema {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, BaseTool>();

  register(tool: BaseTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  list(): BaseTool[] {
    return [...this.tools.values()];
  }

  toOpenAITools(): OpenAIToolSchema[] {
    return this.list().map((t) => t.toOpenAISchema());
  }

  async execute(name: string, args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { ok: false, content: '', error: `Unknown tool: ${name}` };
    }
    const startedAt = Date.now();
    try {
      const result = await tool.execute(args, ctx);
      return { ...result, durationMs: Date.now() - startedAt };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, content: '', error: message, durationMs: Date.now() - startedAt };
    }
  }
}
