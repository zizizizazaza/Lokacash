/**
 * App Registry — Import all adapters to register them.
 * Import this file once at app startup.
 */
import './GenericChatApp';
import './HedgeFundApp';
import './StockAnalysisApp';

// Re-export registry utilities
export { getApp, getAllApps } from './types';
export type { AgentAppAdapter } from './types';
