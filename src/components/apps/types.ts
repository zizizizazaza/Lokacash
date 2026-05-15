/**
 * Agent App Adapter — Interface and registry.
 * Each "app" (Hedge Fund, Stock Analysis, etc.) implements this interface.
 */
import React from 'react';
import type { ChatMode, Message } from '../../types/chat';
import { socket } from '../../services/socket';

/**
 * Abstract interface for all agent apps.
 * The ChatContainer uses this to delegate app-specific logic.
 */
export interface AgentAppAdapter {
  /** Unique app identifier */
  id: string;
  /** Display name */
  name: string;
  /** Which chat modes this app supports. Empty = mode selector hidden */
  supportedModes: ChatMode[];
  /** Accent color for progress UI */
  accentColor: string;

  /**
   * Check if user input is valid for this app.
   * e.g., HedgeFund requires ticker symbols — "TSLA" → true, "你好" → false.
   * Return false to fall back to generic chat.
   */
  canHandle(query: string): boolean;

  /**
   * Start the app. Called when user sends a message.
   * The adapter emits the appropriate socket event.
   */
  start(params: {
    query: string;
    sessionId: string;
    mode: ChatMode;
    hidden?: boolean;
  }): void;

  /**
   * Parse user input into clean display message.
   * e.g., "AAPL, MSFT, GOOGL" → "Analyze AAPL, MSFT, GOOGL using AI Hedge Fund"
   */
  formatUserMessage(query: string): string;

  /**
   * Socket event prefix for this app.
   * e.g., 'agent:hedgefund' → will listen for started/progress/done/error
   */
  socketPrefix: string;

  /** Labels for progress UI */
  runningLabel: string;
  doneLabel: string;
  initLabel: string;
}

// ─── App Registry ───────────────────────────────────────────
const registry: Record<string, AgentAppAdapter> = {};

export function registerApp(adapter: AgentAppAdapter) {
  registry[adapter.id] = adapter;
}

export function getApp(id: string): AgentAppAdapter | undefined {
  return registry[id];
}

export function getAllApps(): AgentAppAdapter[] {
  return Object.values(registry);
}
