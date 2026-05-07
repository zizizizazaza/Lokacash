/**
 * Internal chat adapter — drives the existing socket `agent:chat`
 * orchestrator from a server-side caller (the OpenAI-compat HTTP
 * endpoint) without re-implementing any of the routing / tool / synth
 * logic. The adapter:
 *
 *   1. Opens a socket.io-client connection to the same server.
 *   2. Authenticates with the service token (bypasses guest quota +
 *      mode gates — the upstream HTTP surface owns its own auth).
 *   3. Emits `agent:chat` exactly as the frontend would.
 *   4. Subscribes to the chat lifecycle events and re-emits them via
 *      a structured callback API so the caller can:
 *        - stream text deltas as they arrive (`onText`)
 *        - observe tool / module progress for tool_calls translation
 *          (`onTool`)
 *        - hear once when the run is done (`onDone`)
 *        - hear errors immediately (`onError`)
 *
 * Connection lifecycle is fully managed by `runChat()`: it returns a
 * disposable handle whose promise resolves once `stream_done` lands or
 * an error fires. Cleanup runs in either path so a hanging socket can
 * never leak.
 */
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import { getServiceAuthToken } from './serviceToken.js';

export interface InternalChatRequest {
  content: string;
  /** auto / fast / roundtable — same vocabulary the frontend uses. */
  mode?: 'auto' | 'fast' | 'roundtable';
  /** Stable session id. Auto-generated when caller doesn't have one. */
  sessionId?: string;
  /** Optional analyst roster for roundtable mode. */
  analystIds?: string[];
  /** Pinning a domain skips the LLM "stock vs crypto" guess. */
  domain?: 'stocks' | 'web3';
  /** Hard ceiling for the whole run (router + tools + synth). Default 4 min. */
  timeoutMs?: number;
}

export interface InternalChatCallbacks {
  /** Fires for every assistant text delta — concatenate to get the
   *  final message. Already de-duplicated; do not buffer twice. */
  onText?: (delta: string) => void;
  /** Fires when a tool / module starts or completes. Translate this
   *  into OpenAI `tool_calls` deltas if you want clients to see
   *  "calling search_web" pills. Optional. */
  onTool?: (event: ToolEvent) => void;
  /** Fires once with the final assistant text and metadata. The
   *  promise returned by `runChat` resolves shortly after this. */
  onDone?: (final: { content: string; sessionId: string }) => void;
  /** Fires if the orchestrator emits `agent:chat:error`. The promise
   *  rejects after this. */
  onError?: (err: { code: string; message: string }) => void;
  /** Optional structured trace for callers that want full visibility. */
  onProgress?: (event: ProgressEvent) => void;
}

export interface ToolEvent {
  toolName: string;
  status: 'started' | 'completed' | 'failed';
  argsPreview?: string;
}

export interface ProgressEvent {
  type: string;
  payload: unknown;
}

/**
 * Run one chat turn through the in-process socket pipeline. Returns a
 * promise that resolves with the full assistant text once streaming
 * completes, or rejects on error / timeout.
 */
export function runInternalChat(
  req: InternalChatRequest,
  cb: InternalChatCallbacks = {},
): Promise<{ content: string; sessionId: string }> {
  return new Promise((resolve, reject) => {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002;
    const url = `http://127.0.0.1:${port}`;
    const sessionId = req.sessionId || `svc:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const timeoutMs = req.timeoutMs ?? 4 * 60 * 1000;

    // Use the default transport order (polling → websocket upgrade). We
    // tried `['websocket']` only, but engine.io requires the polling
    // handshake first to negotiate sid/cookies — skipping it surfaces as
    // "websocket error" the moment the client tries to open the WS frame.
    // Polling-then-upgrade is essentially zero-cost on loopback.
    //
    // NOTE: this server mounts socket.io at `/api/socket.io` (not the
    // default `/socket.io`) so the production reverse-proxy can route
    // both REST and WS through one prefix. The client MUST match.
    const sock: ClientSocket = createSocketClient(url, {
      path: '/api/socket.io',
      reconnection: false,
      timeout: 10_000,
      forceNew: true,
      auth: { serviceToken: getServiceAuthToken() },
    });

    let collected = '';
    let settled = false;
    let lastSeenLen = 0;

    const watchdog = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { sock.disconnect(); } catch { /* ignore */ }
      const err = { code: 'internal_chat_timeout', message: `runInternalChat exceeded ${timeoutMs}ms` };
      cb.onError?.(err);
      reject(new Error(err.message));
    }, timeoutMs);

    const finish = (kind: 'done' | 'error', payload: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      try { sock.disconnect(); } catch { /* ignore */ }
      if (kind === 'done') {
        const result = { content: collected, sessionId };
        cb.onDone?.(result);
        resolve(result);
      } else {
        cb.onError?.(payload);
        reject(new Error(payload.message || 'internal_chat_error'));
      }
    };

    sock.on('connect_error', (err: Error) => {
      finish('error', { code: 'connect_failed', message: err.message });
    });

    sock.on('connect', () => {
      sock.emit('agent:chat', {
        content: req.content,
        mode: req.mode || 'auto',
        sessionId,
        ...(req.analystIds && req.analystIds.length > 0 ? { analystIds: req.analystIds } : {}),
        ...(req.domain ? { domain: req.domain } : {}),
      });
    });

    // ── Text streaming ─────────────────────────────────────────────
    // The orchestrator emits `progress` events with the FULL content so
    // far each time, not deltas. Compute the delta on our side so callers
    // don't have to.
    sock.on('agent:chat:progress', (data: { sessionId?: string; content?: string }) => {
      if (data?.sessionId !== sessionId) return;
      const next = data.content || '';
      if (next.length <= lastSeenLen) return;
      const delta = next.slice(lastSeenLen);
      lastSeenLen = next.length;
      collected = next;
      if (delta) cb.onText?.(delta);
      cb.onProgress?.({ type: 'progress', payload: data });
    });

    // ── Tool / module visibility (optional) ────────────────────────
    sock.on('agent:chat:module', (data: { sessionId?: string; moduleType?: string; status?: string }) => {
      if (data?.sessionId !== sessionId) return;
      if (data.moduleType && data.status) {
        cb.onTool?.({
          toolName: data.moduleType,
          status: data.status === 'active' ? 'started' : data.status === 'completed' ? 'completed' : 'failed',
        });
      }
      cb.onProgress?.({ type: 'module', payload: data });
    });

    sock.on('agent:chat:tool_trace', (data: { sessionId?: string; tool?: string; stepType?: string; args?: unknown }) => {
      if (data?.sessionId !== sessionId) return;
      cb.onTool?.({
        toolName: data.tool || data.stepType || 'tool',
        status: data.stepType === 'tool_started' ? 'started' : 'completed',
        argsPreview: data.args ? JSON.stringify(data.args).slice(0, 200) : undefined,
      });
      cb.onProgress?.({ type: 'tool_trace', payload: data });
    });

    // ── Other progress events the caller might want to surface ─────
    for (const ev of [
      'agent:chat:routing',
      'agent:chat:routed',
      'agent:chat:started',
      'agent:chat:webfetch',
      'agent:chat:thinking_log',
      'agent:chat:consensus_done',
      'agent:chat:agent_responded',
      'agent:chat:round_started',
      'agent:chat:round_completed',
    ]) {
      sock.on(ev, (data: { sessionId?: string }) => {
        if (data?.sessionId !== sessionId) return;
        cb.onProgress?.({ type: ev, payload: data });
      });
    }

    // ── Terminal events ────────────────────────────────────────────
    sock.on('agent:chat:stream_done', (data: { sessionId?: string; content?: string }) => {
      if (data?.sessionId !== sessionId) return;
      // Final content might arrive in `content` here even when no
      // `progress` chunks fired (degraded modes / instant cache hits).
      if (typeof data.content === 'string' && data.content.length > collected.length) {
        const delta = data.content.slice(collected.length);
        if (delta) cb.onText?.(delta);
        collected = data.content;
      }
      finish('done', null);
    });

    sock.on('agent:chat:error', (data: { sessionId?: string; error?: string; hint?: string }) => {
      if (data?.sessionId && data.sessionId !== sessionId) return;
      finish('error', { code: data.error || 'unknown_error', message: data.hint || data.error || 'agent:chat:error' });
    });

    sock.on('disconnect', (reason: string) => {
      // If we disconnect before stream_done lands, surface that as an error
      // — otherwise the caller hangs on the watchdog.
      if (settled) return;
      finish('error', { code: 'disconnected', message: `Socket disconnected unexpectedly: ${reason}` });
    });
  });
}
