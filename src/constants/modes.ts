/**
 * Chat Modes & Agent Council — Single Source of Truth
 * Previously duplicated in SuperAgentHome and SuperAgentChat.
 */
import React from 'react';
import type { ChatMode, AgentAppConfig } from '../types/chat';

// ─── Mode Definitions ───────────────────────────────────────
export interface ModeConfig {
  id: ChatMode;
  label: string;
  desc: string;
  icon: React.FC;
}

export const MODES: ModeConfig[] = [
  {
    id: 'auto', label: 'Auto', desc: 'Smart routing — picks the best pipeline',
    icon: () => React.createElement('svg', { className: 'w-3.5 h-3.5', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
      React.createElement('path', { d: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1' }),
      React.createElement('circle', { cx: 12, cy: 12, r: 3.5 }))
  },
  {
    id: 'fast', label: 'Fast', desc: 'Single-agent answer',
    icon: () => React.createElement('svg', { className: 'w-3.5 h-3.5', viewBox: '0 0 24 24', fill: 'currentColor' },
      React.createElement('path', { d: 'M13 2L3.5 13.5a.5.5 0 00.4.8h6.3l-1.3 6.5a.5.5 0 00.9.35L20 9.5a.5.5 0 00-.4-.8h-6.3l1.3-5.7a.5.5 0 00-.9-.35z' }))
  },
  {
    id: 'roundtable', label: 'Roundtable', desc: 'Multi-agent debate + vote',
    icon: () => React.createElement('svg', { className: 'w-3.5 h-3.5', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
      React.createElement('circle', { cx: 12, cy: 12, r: 8.5, strokeDasharray: '2 2', opacity: 0.35 }),
      React.createElement('circle', { cx: 12, cy: 4, r: 2, fill: 'currentColor' }),
      React.createElement('circle', { cx: 20, cy: 14, r: 2, fill: 'currentColor' }),
      React.createElement('circle', { cx: 4, cy: 14, r: 2, fill: 'currentColor' }),
      React.createElement('circle', { cx: 12, cy: 20, r: 2, fill: 'currentColor' }))
  },
];

// ─── Agent Council (for consensus modes) ────────────────────
export interface AgentCouncilMember {
  id: string;
  name: string;
  icon: string; // SVG path d
  color: string; // Tailwind bg class
  steps: string[];
}

export const AGENT_COUNCIL: AgentCouncilMember[] = [
  { id: 'agent_0', name: 'Fundamental Analyst', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', color: 'bg-emerald-500', steps: ['Ingesting 10-K & financial statements', 'Calculating DCF valuation models', 'Evaluating balance sheet health', 'Formulating core thesis'] },
  { id: 'agent_1', name: 'Macro Strategist', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'bg-blue-500', steps: ['Analyzing cross-asset correlations', 'Evaluating interest rate impact', 'Scanning global liquidity trends', 'Synthesizing macro regime context'] },
  { id: 'agent_2', name: 'Sentiment Engine', icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z', color: 'bg-violet-500', steps: ['Parsing FinTwit & Retail sentiment', 'Scanning news & events momentum', 'Analyzing option market skew', 'Identifying market pivot risks'] },
  { id: 'agent_3', name: 'Quant Tracker', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', color: 'bg-rose-500', steps: ['Processing Stock OHLC Data', 'Evaluating moving average bounds', 'Calculating RSI & Volatility bands', 'Detecting anomalous trading volume'] },
];

// ─── Static Knowledge Graph Data ────────────────────────────
import type { KnowledgeGraphData } from '../types/chat';

export const STATIC_KG_DATA: KnowledgeGraphData = {
  nodes: [
    { id: 'agent_0', type: 'agent', label: 'agent_0', x: 0, y: 0 },
    { id: 'agent_1', type: 'agent', label: 'agent_1', x: 0, y: 0 },
    { id: 'agent_2', type: 'agent', label: 'agent_2', x: 0, y: 0 },
    { id: 'agent_3', type: 'agent', label: 'agent_3', x: 0, y: 0 },
    { id: 'round_1', type: 'task', label: 'Round 1', x: 0, y: 0 },
    { id: 'round_2', type: 'task', label: 'Round 2', x: 0, y: 0 },
    { id: 'round_3', type: 'task', label: 'Round 3', x: 0, y: 0 },
    { id: 'round_4', type: 'task', label: 'Round 4', x: 0, y: 0 },
    { id: 'node_A', type: 'stance', label: 'A', x: 0, y: 0 },
    { id: 'node_B', type: 'stance', label: 'B', x: 0, y: 0 },
  ],
  edges: [
    { id: 'e1', source: 'agent_1', target: 'round_2', label: 'participates_in' },
    { id: 'e2', source: 'agent_1', target: 'round_3', label: 'participates_in' },
    { id: 'e3', source: 'agent_1', target: 'round_4', label: 'participates_in' },
    { id: 'e4', source: 'agent_1', target: 'node_B', label: 'supports' },
    { id: 'e5', source: 'agent_3', target: 'round_2', label: 'participates_in' },
    { id: 'e6', source: 'agent_3', target: 'round_3', label: 'participates_in' },
    { id: 'e7', source: 'agent_3', target: 'round_4', label: 'participates_in' },
    { id: 'e8', source: 'agent_3', target: 'node_B', label: 'supports' },
    { id: 'e9', source: 'agent_2', target: 'round_1', label: 'participates_in' },
    { id: 'e10', source: 'agent_2', target: 'round_2', label: 'participates_in' },
    { id: 'e11', source: 'agent_2', target: 'round_3', label: 'participates_in' },
    { id: 'e12', source: 'agent_2', target: 'round_4', label: 'participates_in' },
    { id: 'e13', source: 'agent_2', target: 'node_A', label: 'supports' },
    { id: 'e14', source: 'agent_2', target: 'node_B', label: 'supports' },
    { id: 'e15', source: 'agent_0', target: 'round_1', label: 'participates_in' },
    { id: 'e16', source: 'agent_0', target: 'round_2', label: 'participates_in' },
    { id: 'e17', source: 'agent_0', target: 'round_3', label: 'participates_in' },
    { id: 'e18', source: 'agent_0', target: 'round_4', label: 'participates_in' },
    { id: 'e19', source: 'agent_0', target: 'node_B', label: 'supports' },
  ],
};

export const buildKnowledgeGraph = (): KnowledgeGraphData => STATIC_KG_DATA;

// ─── Agent App Configs ──────────────────────────────────────
export const AGENT_APPS: Record<string, AgentAppConfig> = {
  hedgefund: {
    id: 'hedgefund',
    name: 'AI Hedge Fund',
    supportedModes: [], // Ignores mode — always uses its own pipeline
    socketPrefix: 'agent:hedgefund',
    accentColor: 'emerald',
    runningLabel: 'Hedge Fund agents analyzing...',
    doneLabel: 'Analysis complete',
  },
  stockanalysis: {
    id: 'stockanalysis',
    name: 'A/H/US Stock Tracker',
    supportedModes: [], // Ignores mode
    socketPrefix: 'agent:stockanalysis',
    accentColor: 'red',
    runningLabel: 'Stock Analysis gathering data...',
    doneLabel: 'Analysis complete',
  },
  research: {
    id: 'research',
    name: 'Signal Radar',
    supportedModes: ['fast', 'roundtable'],
    socketPrefix: 'agent:research',
    accentColor: 'blue',
    runningLabel: 'Signal Radar acquiring intelligence...',
    doneLabel: 'Report generated',
  },
};
