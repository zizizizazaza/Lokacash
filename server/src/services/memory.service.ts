/**
 * Phase 2.1 — Persistent cross-session memory.
 *
 * Stores per-user notes the agent decides are worth remembering (preferences,
 * holdings, strategy notes, watchlists). On every new user message we recall
 * the top-N most relevant memories and prepend them to the LLM prompt so the
 * agent feels like it "remembers" the user across sessions.
 *
 * Strict per-user isolation:
 *   - Every read query starts with WHERE userId = ? (FK + index enforced)
 *   - Guest users (no User row) silently get an empty memory set
 *   - User deletion cascades and wipes all memories
 *
 * Recall scoring (v1 — keyword match, no embeddings):
 *   - Tag overlap with query keywords: +30 per hit
 *   - Substring match in content: +20 per query keyword
 *   - Importance baseline: +importance / 5
 *   - Recency bonus: +max(0, 10 - daysOld)
 *   - Final results sorted by total score, top N returned
 *
 * v2 future: swap the keyword scorer for OpenAI embedding similarity. The
 * `recallRelevantMemories` interface stays the same.
 */
import prisma from '../db.js';

export interface MemoryRecord {
  id: string;
  content: string;
  tags: string[];
  importance: number;
  createdAt: Date;
}

const STOPWORDS_EN = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'and', 'or', 'but', 'if',
  'i', 'me', 'my', 'you', 'your', 'we', 'us', 'our', 'this', 'that', 'it',
  'on', 'in', 'at', 'to', 'of', 'for', 'with', 'as', 'by', 'from',
  'do', 'does', 'did', 'have', 'has', 'had', 'be', 'been', 'being',
  'what', 'which', 'who', 'when', 'where', 'why', 'how',
  'analyze', 'analysis', 'check', 'show', 'tell',
]);
const STOPWORDS_ZH = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有',
  '看', '好', '请', '吧', '吗', '呢', '啊', '哦',
  '分析', '一下', '帮我', '怎么', '什么', '哪个', '为什么',
]);

function tokenize(text: string): string[] {
  if (!text) return [];
  // Mix of CJK character bigrams and ASCII word tokens.
  const out: string[] = [];
  // ASCII / Latin words
  const ascii = text.match(/[a-zA-Z][a-zA-Z0-9_]{1,30}/g) || [];
  for (const w of ascii) {
    const lw = w.toLowerCase();
    if (lw.length >= 2 && !STOPWORDS_EN.has(lw)) out.push(lw);
  }
  // CJK bigrams (covers Chinese / Japanese / Korean blocks)
  const cjk = text.match(/[一-鿿㐀-䶿]+/g) || [];
  for (const seg of cjk) {
    if (STOPWORDS_ZH.has(seg)) continue;
    if (seg.length === 1) {
      out.push(seg);
    } else {
      for (let i = 0; i < seg.length - 1; i++) {
        const bigram = seg.slice(i, i + 2);
        if (!STOPWORDS_ZH.has(bigram)) out.push(bigram);
      }
    }
  }
  return [...new Set(out)];
}

export interface SaveMemoryArgs {
  userId: string;
  content: string;
  tags?: string[];
  importance?: number;
}

/**
 * Persist a new memory. Caller is responsible for de-duplicating against
 * existing memories — a simple substring check is performed here to avoid
 * the most obvious duplicates but exact-match dedup is the agent's job.
 */
export async function saveMemory(args: SaveMemoryArgs): Promise<MemoryRecord | null> {
  const content = (args.content || '').trim();
  if (!content || content.length < 2) return null;
  const tags = (args.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8);
  const importance = Math.max(0, Math.min(100, args.importance ?? 50));

  // Quick dedup: if a near-identical memory exists for this user, bump its
  // importance + updatedAt instead of inserting a near-duplicate.
  const existing = await prisma.userMemory.findFirst({
    where: { userId: args.userId, content },
    select: { id: true, importance: true },
  });
  if (existing) {
    const updated = await prisma.userMemory.update({
      where: { id: existing.id },
      data: {
        importance: Math.min(100, Math.max(existing.importance, importance) + 5),
        tags: tags.join(','),
      },
    });
    return {
      id: updated.id,
      content: updated.content,
      tags: updated.tags.split(',').filter(Boolean),
      importance: updated.importance,
      createdAt: updated.createdAt,
    };
  }

  const created = await prisma.userMemory.create({
    data: {
      userId: args.userId,
      content,
      tags: tags.join(','),
      importance,
    },
  });
  return {
    id: created.id,
    content: created.content,
    tags: created.tags.split(',').filter(Boolean),
    importance: created.importance,
    createdAt: created.createdAt,
  };
}

/**
 * Top-N recall relevant to the user's current message. Returns memories in
 * descending order of relevance. Hard upper bound 5 to keep prompt size
 * predictable.
 */
export async function recallRelevantMemories(
  userId: string,
  userMessage: string,
  limit = 3,
): Promise<MemoryRecord[]> {
  if (!userId || !userMessage) return [];

  // Pull a candidate set first — most recent N important memories. Cheaper
  // than scanning the whole table, and the per-user index makes this O(log n).
  const candidates = await prisma.userMemory.findMany({
    where: { userId },
    orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
    take: 50,
  });
  if (candidates.length === 0) return [];

  const queryTokens = new Set(tokenize(userMessage));
  if (queryTokens.size === 0) {
    // No useful tokens — fall back to top-importance recent memories.
    return candidates.slice(0, limit).map((m) => ({
      id: m.id,
      content: m.content,
      tags: m.tags.split(',').filter(Boolean),
      importance: m.importance,
      createdAt: m.createdAt,
    }));
  }

  const now = Date.now();
  const scored = candidates.map((m) => {
    const tags = m.tags.split(',').filter(Boolean);
    const contentLower = m.content.toLowerCase();
    let score = m.importance / 5;
    // Tag overlap
    for (const tag of tags) {
      if (queryTokens.has(tag.toLowerCase())) score += 30;
    }
    // Token substring match in content
    for (const tok of queryTokens) {
      if (contentLower.includes(tok)) score += 20;
    }
    // Recency bonus (10 → 0 over 10 days)
    const daysOld = (now - m.createdAt.getTime()) / 86400000;
    score += Math.max(0, 10 - daysOld);
    return { m, score };
  });

  return scored
    .filter((s) => s.score >= 25) // require *some* signal to surface
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(5, limit)))
    .map((s) => ({
      id: s.m.id,
      content: s.m.content,
      tags: s.m.tags.split(',').filter(Boolean),
      importance: s.m.importance,
      createdAt: s.m.createdAt,
    }));
}

/**
 * List memories for a user (for the Settings UI to show "what does the agent
 * know about me"). Sorted by importance desc, recency desc.
 */
export async function listUserMemories(userId: string, limit = 100): Promise<MemoryRecord[]> {
  const rows = await prisma.userMemory.findMany({
    where: { userId },
    orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
  return rows.map((m) => ({
    id: m.id,
    content: m.content,
    tags: m.tags.split(',').filter(Boolean),
    importance: m.importance,
    createdAt: m.createdAt,
  }));
}

/** Delete a single memory (Settings → "Forget this"). User-scoped. */
export async function deleteMemory(userId: string, memoryId: string): Promise<boolean> {
  const result = await prisma.userMemory.deleteMany({
    where: { id: memoryId, userId },
  });
  return result.count > 0;
}

/** Format a recall block for prepending to the user message. */
export function formatRecallBlock(memories: MemoryRecord[], lang: 'zh' | 'en' = 'zh'): string {
  if (memories.length === 0) return '';
  const heading =
    lang === 'zh'
      ? '<recalled-memories>\n以下是我之前记住的关于这位用户的关键信息：'
      : '<recalled-memories>\nKey memories about this user from prior sessions:';
  const body = memories.map((m, i) => `${i + 1}. ${m.content}`).join('\n');
  return `${heading}\n${body}\n</recalled-memories>\n\n`;
}
