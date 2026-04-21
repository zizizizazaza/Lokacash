/**
 * HedgeFundApp — AI Hedge Fund adapter.
 * Encapsulates all hedge-fund-specific socket logic and formatting.
 */
import type { AgentAppAdapter } from './types';
import { registerApp } from './types';
import { socket } from '../../services/socket';

/** Extract valid tickers from a query string */
function extractTickers(query: string): string[] {
  return query.split(',')
    .map(t => t.replace(/[^A-Za-z0-9\u4e00-\u9fa5]/g, '').trim().toUpperCase())
    .filter(t => t.length >= 1 && t.length <= 100); // valid ticker: 1-20 characters
}

const HedgeFundApp: AgentAppAdapter = {
  id: 'hedgefund',
  name: 'AI Hedge Fund',
  supportedModes: ['auto', 'fast', 'roundtable'],
  accentColor: 'emerald',
  socketPrefix: 'agent:hedgefund',
  runningLabel: 'Hedge Fund agents analyzing...',
  doneLabel: 'Analysis complete',
  initLabel: 'Initializing execution layer...',

  canHandle(query: string): boolean {
    return extractTickers(query).length > 0;
  },

  start({ query, sessionId }) {
    const tickers = extractTickers(query);

    socket.emit('agent:hedgefund', {
      tickers,
      sessionId,
      showReasoning: true,
    });

    window.dispatchEvent(new CustomEvent('session-started', {
      detail: { id: sessionId, title: `AI Hedge Fund: ${tickers.join(', ')}`, agentId: 'hedgefund' },
    }));
  },

  formatUserMessage(query: string): string {
    const tickers = extractTickers(query);
    return tickers.length > 0
      ? `Analyze ${tickers.join(', ')} using AI Hedge Fund`
      : query;
  },
};

registerApp(HedgeFundApp);
export default HedgeFundApp;

