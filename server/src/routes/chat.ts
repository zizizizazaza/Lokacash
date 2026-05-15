import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import prisma from '../db.js';
import { authRequired, authOptional, type AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { LokaAIService, type ChatMessage } from '../services/ai.service.js';
import { config } from '../config.js';
import { searchUserMessages, searchUserSessions } from '../services/sessionSearch.service.js';
import {
  listUserMemories,
  saveMemory,
  deleteMemory,
} from '../services/memory.service.js';

const router = Router();
const aiService = new LokaAIService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// Get chat history (optionally filter by time range or sessionId)
router.get('/history', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const where: any = { userId: req.userId };
    if (req.query.sessionId) where.sessionId = req.query.sessionId as string;
    if (req.query.from) where.createdAt = { ...(where.createdAt || {}), gte: new Date(req.query.from as string) };
    if (req.query.to) where.createdAt = { ...(where.createdAt || {}), lte: new Date(req.query.to as string) };

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// Get conversation list (group by sessionId)
router.get('/conversations', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, sessionId: true, role: true, content: true, createdAt: true, agentId: true },
    });

    // Group by sessionId (null sessionId = legacy, group by time gap)
    const sessionMap = new Map<string, { id: string; title: string; time: string; messageCount: number; firstMessageAt: string; lastMessageAt: string; agentId?: string }>();

    for (const msg of messages) {
      const sid = msg.sessionId || '__legacy__';
      const existing = sessionMap.get(sid);
      if (!existing) {
        const title = msg.role === 'user'
          ? msg.content.slice(0, 60) + (msg.content.length > 60 ? '...' : '')
          : 'New Chat';
        sessionMap.set(sid, {
          id: sid === '__legacy__' ? msg.id : sid,
          title,
          time: msg.createdAt.toISOString(),
          messageCount: 1,
          firstMessageAt: msg.createdAt.toISOString(),
          lastMessageAt: msg.createdAt.toISOString(),
          agentId: msg.agentId || undefined,
        });
      } else {
        existing.messageCount++;
        existing.lastMessageAt = msg.createdAt.toISOString();
      }
    }

    // Return newest first
    const conversations = Array.from(sessionMap.values()).sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
    );
    res.json(conversations);
  } catch (err) {
    next(err);
  }
});

// Send message to AI agent (non-streaming)
const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
  assetContext: z.object({
    name: z.string(),
    category: z.string().optional(),
    apy: z.string().optional(),
    term: z.string().optional(),
    progress: z.number().optional(),
    backers: z.number().optional(),
    description: z.string().optional(),
  }).optional(),
});

router.post('/send', authOptional, async (req: AuthRequest, res, next) => {
  try {
    const { content, agentId, sessionId } = sendMessageSchema.parse(req.body);
    const userId = req.userId;
    const isAnonymous = !userId;

    // Save user message (skip for anonymous — no valid FK)
    let userMessage: any = { role: 'user', content, timestamp: new Date() };
    if (!isAnonymous) {
      userMessage = await prisma.chatMessage.create({
        data: { userId, sessionId, role: 'user', content, agentId },
      });
    }

    // Get conversation context (same session, last 20)
    let context: any[] = [];
    if (!isAnonymous) {
      context = await prisma.chatMessage.findMany({
        where: { userId, ...(sessionId ? { sessionId } : {}) },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
    } else {
      context = [{ role: 'user', content }];
    }

    // Call AI service
    const aiResponse = await aiService.chat(context, agentId);

    // Save AI response (skip for anonymous)
    let assistantMessage: any = { role: 'assistant', content: aiResponse.content, timestamp: new Date() };
    if (!isAnonymous) {
      assistantMessage = await prisma.chatMessage.create({
        data: {
          userId,
          sessionId,
          role: 'assistant',
          content: aiResponse.content,
          agentId: aiResponse.agentId,
          metadata: aiResponse.metadata ? JSON.stringify(aiResponse.metadata) : null,
        },
      });
    }

    res.json({ userMessage, assistantMessage });
  } catch (err) {
    next(err);
  }
});

// Send message with streaming (SSE)
router.post('/stream', authOptional, async (req: AuthRequest, res, next) => {
  try {
    const { content, agentId, sessionId } = sendMessageSchema.parse(req.body);
    const userId = req.userId;
    const isAnonymous = !userId;

    // Save user message (skip for anonymous)
    if (!isAnonymous) {
      await prisma.chatMessage.create({
        data: { userId, sessionId, role: 'user', content, agentId },
      });
    }

    // Get conversation context (same session)
    let context: any[] = [];
    if (!isAnonymous) {
      context = await prisma.chatMessage.findMany({
        where: { userId, ...(sessionId ? { sessionId } : {}) },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
    } else {
      context = [{ role: 'user', content }];
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const assetCtx = sendMessageSchema.parse(req.body).assetContext;
    const stream = await aiService.chatStream(context, agentId, assetCtx);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE lines from the upstream API
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n');
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullContent += delta;
                res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
              }
            } catch {
              // Skip unparseable chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Save complete AI response to DB (skip for anonymous)
    if (fullContent && !isAnonymous) {
      await prisma.chatMessage.create({
        data: {
          userId,
          sessionId,
          role: 'assistant',
          content: fullContent,
          agentId: agentId || 'loka-agent',
        },
      });
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    // If headers already sent, just end the response
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      res.end();
    } else {
      next(err);
    }
  }
});

// Clear all chat history
router.delete('/history', authRequired, async (req: AuthRequest, res, next) => {
  try {
    await prisma.chatMessage.deleteMany({
      where: { userId: req.userId },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Delete a single conversation by sessionId
router.delete('/conversations/:sessionId', authRequired, async (req: AuthRequest, res, next) => {
  try {
    await prisma.chatMessage.deleteMany({
      where: { userId: req.userId, sessionId: req.params.sessionId as string },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Shared chat links ────────────────────────────────────────────────
// Generate a URL-safe short token (no padding, no slashes). 12 bytes →
// 16 base64url chars, ~96 bits of entropy. Plenty for unguessable links.
function makeShareToken(): string {
  return crypto.randomBytes(12).toString('base64url');
}

// Create a share link for one of the caller's own sessions.
const createShareSchema = z.object({ sessionId: z.string().min(1) });

router.post('/share', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const { sessionId } = createShareSchema.parse(req.body);

    // Verify the session belongs to this user (and exists).
    const own = await prisma.chatMessage.findFirst({
      where: { userId: req.userId, sessionId },
      select: { id: true },
    });
    if (!own) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Reuse an active token for the same session if one exists, so users
    // who click "Share" repeatedly get a stable link.
    const existing = await prisma.sharedChat.findFirst({
      where: { userId: req.userId!, sessionId, revoked: false },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      res.json({ token: existing.id, createdAt: existing.createdAt });
      return;
    }

    const token = makeShareToken();
    const created = await prisma.sharedChat.create({
      data: { id: token, userId: req.userId!, sessionId },
    });
    res.json({ token: created.id, createdAt: created.createdAt });
  } catch (err) {
    next(err);
  }
});

// Public read-only fetch. No auth — anyone with the link can view.
// Returns the conversation messages with personal fields stripped.
router.get('/share/:token', async (req, res, next) => {
  try {
    const token = req.params.token;
    const link = await prisma.sharedChat.findUnique({ where: { id: token } });
    if (!link || link.revoked) {
      res.status(404).json({ error: 'Share link not found or revoked' });
      return;
    }

    const rows = await prisma.chatMessage.findMany({
      where: { userId: link.userId, sessionId: link.sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        agentId: true,
        metadata: true,
        createdAt: true,
      },
      take: 500,
    });

    res.json({
      token,
      sessionId: link.sessionId,
      createdAt: link.createdAt,
      messages: rows,
    });
  } catch (err) {
    next(err);
  }
});

// Owner can revoke any of their own share links.
router.delete('/share/:token', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const token = req.params.token as string;
    const link = await prisma.sharedChat.findUnique({ where: { id: token } });
    if (!link || link.userId !== req.userId) {
      res.status(404).json({ error: 'Share link not found' });
      return;
    }
    await prisma.sharedChat.update({ where: { id: token }, data: { revoked: true } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Transcribe audio (Whisper-compatible API for iOS/Firefox fallback)
router.post('/transcribe', authRequired, upload.single('audio'), async (req: AuthRequest, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No audio file provided' });
      return;
    }

    const language = (req.body?.language as string) || 'en';

    // If we have an OpenAI-compatible API configured, use it
    const apiKey = config.lokaAi.apiKey;
    const baseUrl = config.lokaAi.baseUrl;

    if (!apiKey || !baseUrl) {
      // No API configured — return a helpful error
      res.status(503).json({ error: 'Speech transcription service not configured' });
      return;
    }

    // Build OpenAI-compatible Whisper request
    // baseUrl may be full endpoint like "https://api.x.cn/v1/chat/completions"
    // or just base like "https://api.x.cn/v1" — extract origin and build Whisper URL
    const urlOrigin = baseUrl.replace(/\/v1\/.*$/, '').replace(/\/v1\/?$/, '');
    const whisperUrl = `${urlOrigin}/v1/audio/transcriptions`;
    console.log('[Transcribe] baseUrl:', baseUrl, '→ whisperUrl:', whisperUrl);

    const formData = new FormData();
    formData.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', language.split('-')[0]); // 'en-US' → 'en'
    formData.append('response_format', 'json');

    const response = await fetch(whisperUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[Transcribe] Whisper API error:', response.status, response.statusText, errBody);
      res.status(502).json({ error: 'Transcription service error', detail: errBody });
      return;
    }

    const result = await response.json() as { text?: string };
    res.json({ text: result.text || '' });
  } catch (err) {
    next(err);
  }
});

// ─── Phase 2.2 — Per-user FTS over chat history ───────────────────────
//
// GET /chat/search?q=...&sessionId=...&limit=...
//   Returns up to `limit` (≤50) past messages where `content` matched the
//   query via Postgres pg_trgm similarity. Always scoped to the calling
//   user — no cross-user leakage possible.
router.get('/search', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'auth_required' });
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ hits: [], sessions: [] });
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const sessionId = req.query.sessionId ? String(req.query.sessionId) : undefined;
    const wantSessions = String(req.query.groupBySession || '') === '1';
    if (wantSessions && !sessionId) {
      const sessions = await searchUserSessions(userId, q, limit);
      return res.json({ sessions });
    }
    const hits = await searchUserMessages(userId, q, { limit, sessionId });
    return res.json({ hits });
  } catch (err) {
    next(err);
  }
});

// ─── Phase 2.1 — User memory CRUD (for the Settings UI) ─────────────────
router.get('/memories', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'auth_required' });
    const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? '100'), 10) || 100));
    const memories = await listUserMemories(userId, limit);
    return res.json({ memories });
  } catch (err) {
    next(err);
  }
});

router.post('/memories', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'auth_required' });
    const schema = z.object({
      content: z.string().min(2).max(2000),
      tags: z.array(z.string()).optional(),
      importance: z.number().int().min(0).max(100).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.format() });
    const saved = await saveMemory({
      userId,
      content: parsed.data.content,
      tags: parsed.data.tags,
      importance: parsed.data.importance,
    });
    return res.json({ memory: saved });
  } catch (err) {
    next(err);
  }
});

router.delete('/memories/:id', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'auth_required' });
    const ok = await deleteMemory(userId, String(req.params.id));
    return res.json({ ok });
  } catch (err) {
    next(err);
  }
});

export default router;
