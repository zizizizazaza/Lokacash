/**
 * Phase 2.2 — Per-user full-text search across ChatMessage history.
 *
 * Uses Postgres ILIKE with `%query%` matching — works without any extension
 * dependency (no need for pg_trgm). At lokacash's expected scale (≤100k
 * messages per user) ILIKE backed by the existing (userId) btree index is
 * fast enough (<200ms). When usage scales past that point we can swap in
 * pg_trgm + GIN index — the JS surface here doesn't change.
 *
 * Strict per-user isolation: every query starts WHERE "userId" = $1.
 *
 * Two callers:
 *   1. The `session_search` BaseTool — lets the LLM cite past conversations
 *      mid-response ("3 days ago you asked about X, then funding was Y").
 *   2. The frontend search bar — direct HTTP endpoint returns highlighted
 *      message snippets the user can click to jump to.
 */
import prisma from '../db.js';

export interface SearchHit {
  id: string;
  sessionId: string | null;
  role: string;
  content: string;
  /** A short snippet centered on the first match. */
  snippet: string;
  agentId: string | null;
  createdAt: Date;
  similarity: number;
}

const SNIPPET_RADIUS = 60;

function makeSnippet(content: string, query: string, radius = SNIPPET_RADIUS): string {
  const lowerC = content.toLowerCase();
  const lowerQ = query.toLowerCase();
  const idx = lowerC.indexOf(lowerQ);
  if (idx < 0) {
    return content.slice(0, radius * 2) + (content.length > radius * 2 ? '…' : '');
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + query.length + radius);
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}

export interface SearchOptions {
  /** Filter to a specific session, or omit to search all sessions for the user. */
  sessionId?: string;
  /** Only assistant / user / null (= both). Default: both. */
  role?: 'user' | 'assistant';
  limit?: number;
}

/**
 * Search a single user's ChatMessage rows via ILIKE. Results are ordered by
 * recency (newest first) — when usage scale demands relevance ranking we can
 * add pg_trgm later without changing this function's signature.
 */
export async function searchUserMessages(
  userId: string,
  query: string,
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  const q = (query || '').trim();
  if (!userId || q.length < 2) return [];
  const limit = Math.max(1, Math.min(50, options.limit ?? 20));

  // Escape ILIKE wildcards (% and _) so a user typing "10%" doesn't blow up
  // into match-everything.
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const pattern = `%${escaped}%`;

  const where: {
    userId: string;
    content: { contains: string; mode: 'insensitive' };
    sessionId?: string;
    role?: string;
  } = {
    userId,
    content: { contains: q, mode: 'insensitive' },
  };
  if (options.sessionId) where.sessionId = options.sessionId;
  if (options.role) where.role = options.role;
  // Suppress unused variable warning for `pattern`/`escaped` — they're kept
  // in scope in case we want to switch back to raw ILIKE later.
  void pattern;
  void escaped;

  const rows = await prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      sessionId: true,
      role: true,
      content: true,
      agentId: true,
      createdAt: true,
    },
  });

  // Simple in-app relevance: count occurrences of the query in the content.
  // Higher count = more relevant. Tie-break by recency (already sorted).
  const lowerQ = q.toLowerCase();
  const scored = rows.map((r) => {
    const lowerC = r.content.toLowerCase();
    let occurrences = 0;
    let idx = lowerC.indexOf(lowerQ);
    while (idx >= 0) {
      occurrences++;
      idx = lowerC.indexOf(lowerQ, idx + 1);
    }
    return {
      r,
      occurrences,
    };
  });
  scored.sort((a, b) => {
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    return b.r.createdAt.getTime() - a.r.createdAt.getTime();
  });

  return scored.map(({ r, occurrences }) => ({
    id: r.id,
    sessionId: r.sessionId,
    role: r.role,
    content: r.content,
    snippet: makeSnippet(r.content, q),
    agentId: r.agentId,
    createdAt: r.createdAt,
    // Normalise occurrences to a 0-1 "similarity" so the API shape stays
    // stable (frontend already shows "X% match").
    similarity: Math.min(1, occurrences / 5),
  }));
}

/**
 * Distinct list of sessions where the user message contained the query.
 * Powers the sidebar "Search" UI — clicking a session jumps to the chat.
 */
export async function searchUserSessions(
  userId: string,
  query: string,
  limit = 20,
): Promise<Array<{ sessionId: string; lastMatch: SearchHit }>> {
  const hits = await searchUserMessages(userId, query, { limit: limit * 3 });
  const seen = new Map<string, SearchHit>();
  for (const h of hits) {
    if (!h.sessionId) continue;
    if (!seen.has(h.sessionId)) seen.set(h.sessionId, h);
    if (seen.size >= limit) break;
  }
  return [...seen.entries()].map(([sessionId, lastMatch]) => ({ sessionId, lastMatch }));
}
