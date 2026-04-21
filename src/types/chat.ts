/**
 * Chat Framework — Shared Types
 * All chat/agent related types live here.
 */

// ─── Chat Mode ──────────────────────────────────────────────
export type ChatMode = 'auto' | 'fast' | 'roundtable';

// ─── Message ────────────────────────────────────────────────
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  // App-specific log trails (rendered by each App adapter)
  appLogs?: string[];
  /** Structured step events (stock analysis agent) */
  appSteps?: any[];
  isAppRunning?: boolean;
  appType?: string; // 'hedgefund' | 'stockanalysis' | etc.
  collapsibleReport?: string; // Background report to render as a collapsible <details> block
}

// ─── Agent Thinking Process ─────────────────────────────────
export interface AgentStep {
  label: string;
  status: 'done' | 'active' | 'pending';
  detailType?: 'table' | 'news';
}

export interface AgentThought {
  agentId: string;
  agentName: string;
  agentIcon: string;
  agentColor: string;
  status: 'waiting' | 'analyzing' | 'completed';
  summary: string;
  details?: string;
  verdict?: 'bullish' | 'bearish' | 'neutral';
  confidence?: number;
  steps?: AgentStep[];
}

export interface ThinkingProcess {
  agents: AgentThought[];
  consensus?: {
    verdict: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    duration: number;
  };
  isActive: boolean;
  phase?: 'generating' | 'evaluating' | 'persuading';
}

// ─── Knowledge Graph ────────────────────────────────────────
export interface KGNode {
  id: string;
  type: string; // 'agent' | 'task' | 'stance' | 'source' | 'topic' | 'signal'
  label: string;
  x: number;
  y: number;
  data?: Record<string, string>;
}

export interface KGEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface KnowledgeGraphData {
  nodes: KGNode[];
  edges: KGEdge[];
}

// ─── Agent App Adapter Interface ────────────────────────────
export interface AgentAppConfig {
  id: string;
  name: string;
  /** Which chat modes this app supports. If empty, mode selector is hidden. */
  supportedModes: ChatMode[];
  /** Socket event prefix, e.g. 'agent:hedgefund' → started/progress/done/error */
  socketPrefix: string;
  /** Color accent for the progress spinner */
  accentColor: string;
  /** Label shown during running state */
  runningLabel: string;
  /** Label shown when done */
  doneLabel: string;
}

// ─── Chat Session Init Params ───────────────────────────────
export interface ChatInitParams {
  app: string | null;     // 'hedgefund' | 'stockanalysis' | 'research' | null (generic chat)
  mode: ChatMode;
  query: string;
}
