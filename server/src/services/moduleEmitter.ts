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

    emitStreamDone(content: string) {
      emitToUser(userId, 'agent:chat:stream_done', { sessionId, content });
    },

    emitStarted(mode: string, route: string, hidden?: boolean) {
      emitToUser(userId, 'agent:chat:started', { sessionId, mode, route, hidden });
    }
  };
}
