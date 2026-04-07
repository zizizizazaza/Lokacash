/**
 * StockAnalysisApp — A/H/US Stock Tracker adapter.
 * 
 * Now passes the raw natural language query to the backend,
 * where the Python AgentExecutor handles entity extraction via LLM
 * (no more frontend regex-based ticker extraction).
 */
import type { AgentAppAdapter } from './types';
import { registerApp } from './types';
import { socket } from '../../services/socket';

const StockAnalysisApp: AgentAppAdapter = {
  id: 'stockanalysis',
  name: 'A/H/US Stock Tracker',
  supportedModes: ['auto', 'fast', 'collaborate', 'roundtable'],
  accentColor: 'red',
  socketPrefix: 'agent:stockanalysis',
  runningLabel: 'Stock Analysis Agent is working...',
  doneLabel: 'Analysis complete',
  initLabel: 'Initializing stock analysis agent...',

  canHandle(query: string): boolean {
    // Accept any non-empty query — the LLM will determine if it's stock-related
    return query.trim().length > 0;
  },

  start({ query, sessionId }) {
    // Pass the raw query directly — let the Python AgentExecutor handle NER
    socket.emit('agent:stockanalysis', {
      message: query,
      tickers: [query], // Legacy fallback field
      sessionId,
    });

    window.dispatchEvent(new CustomEvent('session-started', {
      detail: { id: sessionId, title: `Stock Analysis: ${query.slice(0, 60)}`, agentId: 'stockanalysis' },
    }));
  },

  formatUserMessage(query: string): string {
    return query;
  },
};

registerApp(StockAnalysisApp);
export default StockAnalysisApp;
