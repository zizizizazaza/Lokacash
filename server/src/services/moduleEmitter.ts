import { emitToUser } from '../socket/index.js';

export function createModuleEmitter(userId: string, sessionId: string) {
  return {
    emitModule(moduleType: string, status: 'pending' | 'active' | 'done' | 'completed' | 'concluded', data?: any) {
      emitToUser(userId, 'agent:chat:module', {
        sessionId,
        moduleType,
        status,
        data,
      });
    },

    emitProgress(content: string) {
      emitToUser(userId, 'agent:chat:progress', { sessionId, content });
    },

    emitStreamDone(content: string, extra?: Record<string, unknown>) {
      emitToUser(userId, 'agent:chat:stream_done', { sessionId, content, ...extra });
    },

    emitStarted(mode: string, route: string, hidden?: boolean) {
      emitToUser(userId, 'agent:chat:started', { sessionId, mode, route, hidden });
    },

    emitContentReplace(content: string) {
      emitToUser(userId, 'agent:chat:content_replace', { sessionId, content });
    }
  };
}
