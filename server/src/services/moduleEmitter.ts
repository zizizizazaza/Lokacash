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
  /** Most recent TokenCard snapshot pushed via `agent:chat:token`. Stored here
   *  so a client navigating away mid-stream and back can restore the card from
   *  replay (the underlying socket event fires only once and is otherwise lost
   *  on `socket.off`). Type kept as `any` to avoid an upward dependency on the
   *  TokenSnapshot type that lives in the web3 CLI. */
  tokenCard?: any;
}

const chatReplayBuffers = new Map<string, ChatReplayBuffer>();
const REPLAY_TTL_MS = 60_000;

export function startChatReplayBuffer(sessionId: string, mode?: string): void {
  chatReplayBuffers.set(sessionId, {
    modules: [],
    toolTraceSteps: [],
    content: '',
    status: 'running',
    mode,
  });
}

export function getChatReplayBuffer(sessionId: string): ChatReplayBuffer | undefined {
  return chatReplayBuffers.get(sessionId);
}

export function recordChatToolTraceStep(sessionId: string, step: any): void {
  const b = chatReplayBuffers.get(sessionId);
  if (b && b.status === 'running') b.toolTraceSteps.push(step);
}

/**
 * Persist the latest TokenCard snapshot into the replay buffer so a client
 * that navigates away mid-stream can restore the card via `agent:chat:replay`.
 * Called from the same place that `emitToUser('agent:chat:token', ...)` fires.
 */
export function recordChatTokenCard(sessionId: string, tokenCard: any): void {
  const b = chatReplayBuffers.get(sessionId);
  if (b) b.tokenCard = tokenCard;
}

export function appendChatReplayContent(sessionId: string, chunk: string): void {
  const b = chatReplayBuffers.get(sessionId);
  if (b && b.status === 'running') b.content += chunk;
}

export function replaceChatReplayContent(sessionId: string, content: string): void {
  const b = chatReplayBuffers.get(sessionId);
  if (b) b.content = content;
}

export function finishChatReplayBuffer(sessionId: string): void {
  const b = chatReplayBuffers.get(sessionId);
  if (!b) return;
  b.status = 'done';
  b.completedAt = Date.now();
  setTimeout(() => chatReplayBuffers.delete(sessionId), REPLAY_TTL_MS);
}

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

    emitStarted(mode: string, route: string, hidden?: boolean) {
      emitToUser(userId, 'agent:chat:started', { sessionId, mode, route, hidden });
    },

    emitContentReplace(content: string) {
      replaceChatReplayContent(sessionId, content);
      emitToUser(userId, 'agent:chat:content_replace', { sessionId, content });
    }
  };
}
