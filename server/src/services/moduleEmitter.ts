import { emitToUser } from '../socket/index.js';

/**
 * Per-chat-session replay buffer. Captures module + tool_trace events as they
 * fire so a client that navigates away and returns mid-stream can reconstruct
 * the Thinking Process panel via `agent:chat:replay`.
 */
export interface ChatReplayModuleEvent {
  moduleType: string;
  status: 'pending' | 'active' | 'done' | 'completed' | 'concluded';
  data?: any;
}

export interface ChatReplayBuffer {
  modules: ChatReplayModuleEvent[];
  toolTraceSteps: any[];
  content: string;
  status: 'running' | 'done';
  /** Chat mode the session was started with (e.g. 'roundtable') — used by the
   *  client to restore the correct right-side panel variant after navigating
   *  back to a session whose stream is still mid-flight. */
  mode?: string;
  completedAt?: number;
  /** Last time anything was pushed into this buffer. Used by the periodic
   *  cleanup cron to evict stale buffers — when a user navigates away
   *  mid-stream the original finish hook never fires, so the buffer would
   *  otherwise leak forever. */
  lastTouchedAt: number;
  /** Most recent TokenCard snapshot pushed via `agent:chat:token`. Stored here
   *  so a client navigating away mid-stream and back can restore the card from
   *  replay (the underlying socket event fires only once and is otherwise lost
   *  on `socket.off`). Type kept as `any` to avoid an upward dependency on the
   *  TokenSnapshot type that lives in the web3 CLI. */
  tokenCard?: any;
  /** Actual mode chosen post-Auto-routing (e.g. user picked 'auto' but plan
   *  resolved to 'roundtable'). Captured from `agent:chat:routed` so a client
   *  reconnecting mid-stream can restore the 5-stage pipeline / Workbench UI
   *  even when `mode` (the originally requested mode) is still 'auto'. */
  routedMode?: string;
  /** Roundtable agent-debate event stream (analysts_selected,
   *  round_started/completed, agent_responded, consensus_done). The frontend
   *  Workbench (Agent Room + Graph + Debate) is built from these one-shot
   *  events; without buffering, navigating away mid-stream loses every event
   *  fired before the new SuperAgentChat instance subscribed. Re-played in
   *  order on the client to rebuild rtRounds + rtConsensus. */
  rtEvents?: Array<{ type: string; payload: any }>;
}

const chatReplayBuffers = new Map<string, ChatReplayBuffer>();
const REPLAY_TTL_MS = 60_000;
/** Buffers idle longer than this get force-evicted by the cleanup cron — the
 *  user clearly navigated away mid-stream or the run never finished cleanly. */
const STALE_BUFFER_THRESHOLD_MS = 10 * 60 * 1000; // 10 min
/** How often the cleanup cron runs. */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 min

function touchBuffer(b: ChatReplayBuffer): void {
  b.lastTouchedAt = Date.now();
}

export function startChatReplayBuffer(sessionId: string, mode?: string): void {
  chatReplayBuffers.set(sessionId, {
    modules: [],
    toolTraceSteps: [],
    content: '',
    status: 'running',
    mode,
    lastTouchedAt: Date.now(),
  });
}

export function getChatReplayBuffer(sessionId: string): ChatReplayBuffer | undefined {
  const b = chatReplayBuffers.get(sessionId);
  if (b) touchBuffer(b);
  return b;
}

export function recordChatToolTraceStep(sessionId: string, step: any): void {
  const b = chatReplayBuffers.get(sessionId);
  if (b && b.status === 'running') {
    b.toolTraceSteps.push(step);
    touchBuffer(b);
  }
}

/**
 * Persist the latest TokenCard snapshot into the replay buffer so a client
 * that navigates away mid-stream can restore the card via `agent:chat:replay`.
 * Called from the same place that `emitToUser('agent:chat:token', ...)` fires.
 */
export function recordChatTokenCard(sessionId: string, tokenCard: any): void {
  const b = chatReplayBuffers.get(sessionId);
  if (b) {
    b.tokenCard = tokenCard;
    touchBuffer(b);
  }
}

/**
 * Persist the post-routing actual mode so replay can restore the
 * roundtable-only UI (5-stage pipeline, Workbench) even when the buffer's
 * top-level `mode` field is still the originally-requested 'auto'.
 */
export function recordChatRoutedMode(sessionId: string, routedMode: string): void {
  const b = chatReplayBuffers.get(sessionId);
  if (b) {
    b.routedMode = routedMode;
    touchBuffer(b);
  }
}

/**
 * Persist a roundtable agent-debate event so a reconnecting client can rebuild
 * the Workbench (Agent Room + Graph + Debate) panel exactly as it would have
 * appeared if the client had stayed connected. Events are appended in the
 * order they fire and replayed verbatim on the client.
 */
export function recordChatRtEvent(sessionId: string, type: string, payload: any): void {
  const b = chatReplayBuffers.get(sessionId);
  if (!b || b.status !== 'running') return;
  if (!b.rtEvents) b.rtEvents = [];
  b.rtEvents.push({ type, payload });
  touchBuffer(b);
}

export function appendChatReplayContent(sessionId: string, chunk: string): void {
  const b = chatReplayBuffers.get(sessionId);
  if (b && b.status === 'running') {
    b.content += chunk;
    touchBuffer(b);
  }
}

export function replaceChatReplayContent(sessionId: string, content: string): void {
  const b = chatReplayBuffers.get(sessionId);
  if (b) {
    b.content = content;
    touchBuffer(b);
  }
}

export function finishChatReplayBuffer(sessionId: string): void {
  const b = chatReplayBuffers.get(sessionId);
  if (!b) return;
  b.status = 'done';
  b.completedAt = Date.now();
  setTimeout(() => chatReplayBuffers.delete(sessionId), REPLAY_TTL_MS);
}

// ─────────────────────────────────────────────────────────────────
//   Stale-buffer cleanup cron
//   Buffers can leak when the user navigates away mid-stream and
//   finishChatReplayBuffer() is never called. Every 5 minutes we
//   scan and evict buffers idle for >10 minutes. Logs a one-line
//   summary when evictions happen so ops can spot anomalies.
// ─────────────────────────────────────────────────────────────────
let lastCleanupReportedAt = 0;
setInterval(() => {
  const now = Date.now();
  let evicted = 0;
  let remaining = 0;
  for (const [sessionId, buf] of chatReplayBuffers) {
    const idleMs = now - buf.lastTouchedAt;
    if (idleMs > STALE_BUFFER_THRESHOLD_MS) {
      chatReplayBuffers.delete(sessionId);
      evicted += 1;
    } else {
      remaining += 1;
    }
  }
  if (evicted > 0) {
    console.log(
      `[replayBuffer] cleanup: evicted=${evicted} stale buffer(s) (idle > ${STALE_BUFFER_THRESHOLD_MS / 60_000}min), remaining=${remaining}`,
    );
    lastCleanupReportedAt = now;
  } else if (remaining > 50 && now - lastCleanupReportedAt > 30 * 60 * 1000) {
    // Periodic sanity log if buffer count climbs high without evictions
    console.log(`[replayBuffer] status: buffers=${remaining} (cleanup found 0 stale this cycle)`);
    lastCleanupReportedAt = now;
  }
}, CLEANUP_INTERVAL_MS).unref();

export function createModuleEmitter(userId: string, sessionId: string) {
  return {
    emitModule(moduleType: string, status: 'pending' | 'active' | 'done' | 'completed' | 'concluded', data?: any) {
      const b = chatReplayBuffers.get(sessionId);
      if (b && b.status === 'running') {
        b.modules.push({ moduleType, status, data });
      }
      emitToUser(userId, 'agent:chat:module', {
        sessionId,
        moduleType,
        status,
        data,
      });
    },

    emitProgress(content: string) {
      appendChatReplayContent(sessionId, content);
      emitToUser(userId, 'agent:chat:progress', { sessionId, content });
    },

    emitStreamDone(content: string, extra?: Record<string, unknown>) {
      replaceChatReplayContent(sessionId, content);
      emitToUser(userId, 'agent:chat:stream_done', { sessionId, content, ...extra });
    },

    /**
     * Notify the client that the stream was user-cancelled (Stop button) so it
     * can clear loading indicators on every surface listening to this socket
     * (chat thread, sidebar Recents row, etc). Emitted from every isAborted()
     * early-return branch in agent:chat. Distinct event from stream_done so
     * the chat thread doesn't accidentally treat partial output as the final
     * answer (the client uses the local `__cancelled__` placeholder instead).
     */
    emitStreamCancelled(reason?: string) {
      emitToUser(userId, 'agent:chat:cancelled', { sessionId, reason: reason || 'user_stop' });
    },

    emitStarted(mode: string, route: string, hidden?: boolean) {
      emitToUser(userId, 'agent:chat:started', { sessionId, mode, route, hidden });
    },

    emitContentReplace(content: string) {
      replaceChatReplayContent(sessionId, content);
      emitToUser(userId, 'agent:chat:content_replace', { sessionId, content });
    }
  };
}
