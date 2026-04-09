/**
 * GenericChatApp — Default chat adapter for normal conversations.
 * Handles auto/fast/roundtable modes via the standard agent:chat socket.
 */
import type { AgentAppAdapter } from './types';
import { registerApp } from './types';
import { socket } from '../../services/socket';
import type { ChatMode } from '../../types/chat';

const GenericChatApp: AgentAppAdapter = {
  id: 'generic',
  name: 'Loka SuperAgent',
  supportedModes: ['auto', 'fast', 'roundtable'],
  accentColor: 'blue',
  socketPrefix: 'agent:chat',
  runningLabel: 'Thinking...',
  doneLabel: 'Response complete',
  initLabel: 'Processing...',

  canHandle(): boolean {
    return true; // Generic chat handles any input
  },

  start({ query, sessionId, mode, hidden }) {
    socket.emit('agent:chat', {
      content: query,
      mode,
      sessionId,
      hidden,
      agentId: 'superagent',
    });

    window.dispatchEvent(new CustomEvent('session-started', {
      detail: { id: sessionId, title: query.slice(0, 60), agentId: 'superagent' },
    }));
  },

  formatUserMessage(query: string): string {
    return query;
  },
};

registerApp(GenericChatApp);
export default GenericChatApp;
