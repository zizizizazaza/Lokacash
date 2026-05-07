/**
 * Lokacash OpenAI-compatible Chat Completions endpoint.
 *
 *   POST /api/v1/chat/completions
 *
 * Wire-compatible with OpenAI's `chat.completions` so any platform that
 * speaks the OpenAI protocol (火山引擎 / Coze / Dify / LangChain /
 * Cline / 智谱魔搭 / Cursor / and most "BYO model" pickers) can plug
 * Loka in as a drop-in model with a one-line base-URL change.
 *
 * Architecture: this endpoint is a thin SHELL over the same socket
 * `agent:chat` orchestrator that powers the frontend chat box. We
 * connect to ourselves over an in-process socket.io-client, drive the
 * orchestrator, and translate its events into OpenAI chunk format.
 *
 * The benefit: HTTP callers see exactly the same answer quality the
 * frontend produces — full routing (web3 / stocks / fast / roundtable),
 * full tool chain (CoinGecko / OKX / Tavily / Python stocks), URL
 * auto-fetch, real-time prices, vision-ready, etc. — without us
 * re-implementing any of it.
 *
 * Routing:
 *   model="auto"       → frontend's auto mode (router decides path)
 *   model="fast"       → frontend's fast mode (web search → synth)
 *   model="roundtable" → frontend's roundtable mode (multi-agent debate)
 *   anything else      → falls back to "auto"
 *
 * Response:
 *   stream=false → standard chat.completion JSON (single message)
 *   stream=true  → text/event-stream of chat.completion.chunk events
 *                  terminated by `data: [DONE]\n\n`
 */
import { Router, type Request, type Response as ExpressResponse } from 'express';
import { runInternalChat } from '../services/internalChat/chatAdapter.js';
import crypto from 'crypto';

const router = Router();

// ─────────────────────────────────────────────────────────────────
// Request shape (subset — we accept extra fields and ignore them so
// new OpenAI features don't reject our endpoint).
// ─────────────────────────────────────────────────────────────────
interface OpenAIChatRequest {
  model?: string;
  messages?: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | Array<{ type: string; text?: string }>;
    name?: string;
  }>;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
}

interface ChatChunkChoice {
  index: number;
  delta: { role?: string; content?: string };
  finish_reason?: 'stop' | 'length' | 'content_filter' | null;
}

function makeId(): string {
  return `chatcmpl-${crypto.randomBytes(12).toString('base64url')}`;
}

function nowEpoch(): number { return Math.floor(Date.now() / 1000); }

/** Reduce OpenAI's array-content (used for multimodal) back to plain text
 *  so the downstream services can consume strings. We don't yet wire
 *  vision through this path — vision belongs over the socket emit's
 *  `images` field which the frontend uses; we'll add a dedicated
 *  translator the day we expose images via OpenAI's content[] block. */
function flattenMessageContent(msg: NonNullable<OpenAIChatRequest['messages']>[number]): string {
  if (typeof msg.content === 'string') return msg.content;
  if (!Array.isArray(msg.content)) return '';
  return msg.content
    .map((part) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

/** Pick the routing mode from the OpenAI `model` string. We accept the
 *  three plain names (`auto` / `fast` / `roundtable`) and default to
 *  `auto` for anything else, so platforms that auto-fill a model id we
 *  don't recognise still get sensible behaviour. */
function pickMode(modelStr?: string): 'auto' | 'fast' | 'roundtable' {
  const m = (modelStr || '').toLowerCase();
  if (m.includes('roundtable')) return 'roundtable';
  if (m.includes('fast')) return 'fast';
  return 'auto';
}

/**
 * Build the question string handed to the orchestrator from an OpenAI
 * `messages` array. The socket `agent:chat` handler is single-turn —
 * it expects a single user prompt. To accommodate multi-turn callers
 * we concatenate prior assistant context into the latest user prompt,
 * preserving conversational flow without changing the orchestrator.
 */
function buildPromptFromMessages(messages: NonNullable<OpenAIChatRequest['messages']>): string {
  const cleaned = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'))
    .map((m) => ({ role: m.role, content: flattenMessageContent(m).trim() }))
    .filter((m) => m.content.length > 0);
  if (!cleaned.length) return '';
  const latestUserIdx = cleaned.map((m) => m.role).lastIndexOf('user');
  // No user message → just stitch everything together as best-effort.
  if (latestUserIdx < 0) return cleaned.map((m) => m.content).join('\n\n');

  const latestUser = cleaned[latestUserIdx];
  // If there's no prior context, send the user's question verbatim.
  if (latestUserIdx === 0) return latestUser.content;

  const priorTurns = cleaned.slice(0, latestUserIdx);
  const transcript = priorTurns
    .map((m) => `${m.role === 'system' ? 'System' : m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n\n');
  return `Previous conversation:\n${transcript}\n\nLatest user question:\n${latestUser.content}`;
}

/** Build a synthetic OpenAI chat.completion.chunk envelope. */
function chunkEnvelope(id: string, model: string, choice: ChatChunkChoice) {
  return {
    id,
    object: 'chat.completion.chunk',
    created: nowEpoch(),
    model,
    choices: [choice],
  };
}

function writeSseChunk(res: ExpressResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  // Flush past Node's HTTP buffer so SSE consumers see chunks live.
  (res as any).flush?.();
}

// ─────────────────────────────────────────────────────────────────
// Streaming handler — drives the socket adapter and emits each text
// delta as an OpenAI chat.completion.chunk SSE event.
// ─────────────────────────────────────────────────────────────────
async function handleStream(
  res: ExpressResponse,
  parsed: OpenAIChatRequest,
  prompt: string,
  mode: 'auto' | 'fast' | 'roundtable',
  model: string,
): Promise<void> {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const id = makeId();
  let opened = false;
  let aborted = false;
  res.on('close', () => { aborted = true; });

  const ensureRoleOpened = () => {
    if (opened) return;
    opened = true;
    writeSseChunk(res, chunkEnvelope(id, model, { index: 0, delta: { role: 'assistant' } }));
  };

  try {
    await runInternalChat(
      { content: prompt, mode },
      {
        onText: (delta) => {
          if (aborted) return;
          ensureRoleOpened();
          writeSseChunk(res, chunkEnvelope(id, model, { index: 0, delta: { content: delta } }));
        },
        onError: (err) => {
          if (aborted || res.writableEnded) return;
          // Surface as an OpenAI-shaped error event before terminating.
          writeSseChunk(res, {
            id,
            object: 'chat.completion.chunk',
            created: nowEpoch(),
            model,
            choices: [],
            error: { message: err.message, type: 'server_error', code: err.code },
          });
        },
      },
    );
    ensureRoleOpened(); // empty replies still need a role chunk so clients open the message
    writeSseChunk(res, chunkEnvelope(id, model, { index: 0, delta: {}, finish_reason: 'stop' }));
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
    if (res.writableEnded || aborted) {
      try { res.end(); } catch { /* ignore */ }
      return;
    }
    // We already pushed an `error` chunk via onError above; just close.
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

// ─────────────────────────────────────────────────────────────────
// Synchronous handler — drains the orchestrator into a single
// chat.completion JSON. Internally still streams (because the
// orchestrator only streams) — we just buffer the deltas.
// ─────────────────────────────────────────────────────────────────
async function handleSync(
  res: ExpressResponse,
  prompt: string,
  mode: 'auto' | 'fast' | 'roundtable',
  model: string,
): Promise<void> {
  try {
    const result = await runInternalChat({ content: prompt, mode });
    res.json({
      id: makeId(),
      object: 'chat.completion',
      created: nowEpoch(),
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: result.content },
          finish_reason: 'stop',
        },
      ],
      // Usage is unknown at this layer — return zeros rather than lying.
      // Will populate once the API Key + accounting layer lands.
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  } catch (err: any) {
    if (res.headersSent || res.writableEnded) {
      try { res.end(); } catch { /* ignore */ }
      return;
    }
    res.status(502).json({
      error: {
        message: err?.message || 'Upstream chat orchestrator failed',
        type: 'server_error',
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────────

router.post('/chat/completions', async (req: Request, res: ExpressResponse) => {
  const parsed = (req.body || {}) as OpenAIChatRequest;
  const messagesRaw = Array.isArray(parsed.messages) ? parsed.messages : [];
  if (!messagesRaw.length) {
    res.status(400).json({
      error: { message: '`messages` must be a non-empty array.', type: 'invalid_request_error' },
    });
    return;
  }

  const prompt = buildPromptFromMessages(messagesRaw);
  if (!prompt.trim()) {
    res.status(400).json({
      error: { message: 'No usable text content in `messages`.', type: 'invalid_request_error' },
    });
    return;
  }

  const mode = pickMode(parsed.model);
  const model = parsed.model || 'auto';

  try {
    if (parsed.stream) {
      await handleStream(res, parsed, prompt, mode, model);
    } else {
      await handleSync(res, prompt, mode, model);
    }
  } catch (err: any) {
    console.error('[openaiCompat] error:', err?.message || err);
    if (res.headersSent || res.writableEnded) {
      try { res.end(); } catch { /* ignore */ }
      return;
    }
    res.status(500).json({
      error: {
        message: err?.message || 'Internal error',
        type: 'server_error',
      },
    });
  }
});

/**
 * GET /api/v1/models — minimal "models list" endpoint so OpenAI clients
 * that probe for available models don't break. We expose Loka's three
 * routing modes as separate model ids.
 */
router.get('/models', (_req: Request, res: ExpressResponse) => {
  res.json({
    object: 'list',
    data: [
      { id: 'auto', object: 'model', created: nowEpoch(), owned_by: 'lokacash' },
      { id: 'fast', object: 'model', created: nowEpoch(), owned_by: 'lokacash' },
      { id: 'roundtable', object: 'model', created: nowEpoch(), owned_by: 'lokacash' },
    ],
  });
});

export default router;
