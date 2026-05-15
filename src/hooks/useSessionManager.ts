/**
 * useSessionManager — Manages chat session lifecycle.
 * Generates a stable session ID. Does NOT touch the URL —
 * URL sync is handled by the sidebar via 'session-started' events.
 */
import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

interface SessionManagerOptions {
  restoreSessionId?: string;
}

interface SessionManager {
  sessionId: string;
  isRestoring: boolean;
}

export function useSessionManager(options: SessionManagerOptions = {}): SessionManager {
  const { restoreSessionId } = options;

  // Generate a stable session ID that persists across re-renders
  const [generatedId] = useState(() => crypto.randomUUID());
  const sessionId = restoreSessionId || generatedId;

  return {
    sessionId,
    isRestoring: !!restoreSessionId,
  };
}

/**
 * Fetch chat history for a session from the server.
 */
export async function fetchChatHistory(sessionId: string) {
  const token = sessionStorage.getItem('loka_token') || localStorage.getItem('loka_token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/chat/history?sessionId=${sessionId}`, { headers });
  if (!res.ok) throw new Error(`Failed to load history: ${res.status}`);
  return res.json();
}
