import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { verifyToken } from '../middleware/auth.js';
import prisma from '../db.js';
import { researchService, type XProfileSnapshot } from '../services/research.service.js';
import { web3ResearchService, type Web3ResearchResult } from '../services/web3Research.service.js';
import { stockAnalysisService } from '../services/stockanalysis.service.js';
import { hedgefundService } from '../services/hedgefund.service.js';
import { LokaAIService, getGlobalTimeContext } from '../services/ai.service.js';
import { isCryptoSymbol, isAmbiguousSymbol, filterOutCryptoTickers } from '../constants/cryptoAssets.js';
import {
  formatConsensusAgentLabel,
  runConsensusEngine,
  sortConsensusAgentEntries,
} from '../services/consensus.service.js';
import * as crypto from 'crypto';
import {
  createModuleEmitter,
  startChatReplayBuffer,
  finishChatReplayBuffer,
  getChatReplayBuffer,
  recordChatToolTraceStep,
} from '../services/moduleEmitter.js';
import {
  mergeSignalSources,
  sourcesFromSignalRadarLogLine,
  sourcesFromSignalRadarSummary,
  sourcesFromLast30DaysCompact,
  type SignalSearchSource,
} from '../services/signalRadarThinking.js';

let io: Server;
const aiService = new LokaAIService();

// ── Online status tracking ──
const onlineUsers = new Set<string>();
const activeResearchSessions = new Set<string>();
const activeHedgeFundSessions = new Set<string>();
const activeStockAnalysisSessions = new Set<string>();
const activeChatSessions = new Map<string, string>();
/** Abort controllers keyed by sessionId — used to cancel a previous agent:chat run when a new one arrives */
const chatAbortControllers = new Map<string, AbortController>();
/** Dedup map keyed by sessionId::content — prevents duplicate messages from queue flush + direct emit race */
const chatDedupMap = new Map<string, number>();

interface AgentChatImage {
  url: string;
  mime?: string;
  name?: string;
}

/** Fallback when the router omits `search.showXAccountProfile` (language-agnostic hints only). */
function wantsTwitterProjectProfileHint(q: string): boolean {
  return /推特|Twitter|推文|X平台|[\s，、]X[\s，、]|x\.com|社交平台.*(项目|账号)|调研.*(推特|Twitter|推文)|分析.*(推特|Twitter|推文)|twitter.*project/i.test(
    q,
  );
}

const SOCIAL_HANDLE_STOPWORDS = new Set([
  'twitter',
  'x',
  'com',
  'project',
  'account',
  'profile',
  'analysis',
  'research',
  'about',
  'the',
  'and',
  'for',
  'with',
  'what',
  'how',
]);

function toSafeNumber(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function candidateTokensFromQuery(userContent: string): string[] {
  const q = (userContent || '').toLowerCase();
  const explicit = Array.from(new Set((q.match(/@([a-z0-9_]{1,15})\b/gi) || [])
    .map((x) => x.replace(/^@/, '').toLowerCase())));
  if (explicit.length) return explicit;

  const words = Array.from(new Set((q.match(/\b[a-z][a-z0-9_]{2,30}\b/g) || [])
    .map((w) => w.toLowerCase())
    .filter((w) => !SOCIAL_HANDLE_STOPWORDS.has(w))));
  return words.slice(0, 8);
}

function explicitHandlesFromText(text: string): string[] {
  const q = (text || '').toLowerCase();
  return Array.from(
    new Set(
      (q.match(/@([a-z0-9_]{1,15})\b/gi) || [])
        .map((x) => x.replace(/^@/, '').toLowerCase()),
    ),
  );
}

function pickXProfileForUser(profiles: XProfileSnapshot[], userContent: string): XProfileSnapshot | null {
  if (!profiles.length) return null;
  const q = (userContent || '').toLowerCase();
  const explicitHandles = Array.from(new Set((q.match(/@([a-z0-9_]{1,15})\b/gi) || [])
    .map((x) => x.replace(/^@/, '').toLowerCase())));
  const normalizedProfiles = profiles.map((p) => ({
    profile: p,
    handle: (p.handle || '').trim().toLowerCase(),
    followers: toSafeNumber(p.followers),
  })).filter((x) => x.handle.length > 0);

  // High-confidence path: explicit @handle must match exactly, otherwise do not show card.
  if (explicitHandles.length > 0) {
    const exactMatches = normalizedProfiles.filter((p) => explicitHandles.includes(p.handle));
    if (!exactMatches.length) return null;
    exactMatches.sort((a, b) => b.followers - a.followers);
    return exactMatches[0].profile;
  }

  // Soft path (e.g. "twitter 的 Erebor"): try token containment, pick highest-followers candidate.
  const tokens = candidateTokensFromQuery(userContent);
  if (!tokens.length) return null;
  const softMatches = normalizedProfiles.filter((p) =>
    tokens.some((t) => p.handle.includes(t) || t.includes(p.handle)),
  );
  if (!softMatches.length) return null;
  softMatches.sort((a, b) => b.followers - a.followers);
  return softMatches[0].profile;
}

const MARKET_HEAVY_WEB3_INTENTS = new Set([
  'token_quote',
  'multi_asset_compare',
  'market_scan',
  'category_scan',
]);

function isMarketHeavyWeb3Intent(intent?: string): boolean {
  return typeof intent === 'string' && MARKET_HEAVY_WEB3_INTENTS.has(intent);
}

function buildWeb3ProviderSources(raw: Web3ResearchResult['raw'] | undefined): SignalSearchSource[] {
  if (!raw) return [];
  const assets = (raw.assets || []).filter((a) => a && (a.name || a.id));
  const assetLabel = assets
    .slice(0, 4)
    .map((a) => a.symbol ? `${a.name || a.id} (${String(a.symbol).toUpperCase()})` : (a.name || a.id || ''))
    .filter(Boolean)
    .join(', ');
  const intent = raw.intent || 'web3';
  const intentLabelMap: Record<string, string> = {
    token_quote: 'CoinGecko Market Data',
    multi_asset_compare: 'CoinGecko Compare Data',
    market_scan: 'CoinGecko Market Scanner',
    category_scan: 'CoinGecko Category Data',
    token_deep_dive: 'CoinGecko Asset Data',
    onchain_scan: 'CoinGecko / GeckoTerminal',
    nft_scan: 'CoinGecko NFT Data',
  };
  const snippetBase = assetLabel
    ? `Structured ${intent.replace(/_/g, ' ')} data for ${assetLabel}.`
    : `Structured ${intent.replace(/_/g, ' ')} data returned by CoinGecko.`;
  const out: SignalSearchSource[] = [
    {
      favicon: 'web',
      title: intentLabelMap[intent] || 'CoinGecko Data',
      domain: 'coingecko.com',
      url: 'https://www.coingecko.com/en/api/documentation',
      snippet: snippetBase,
    },
  ];
  if (raw.via === 'rest') {
    out.push({
      favicon: 'web',
      title: 'CoinGecko REST API',
      domain: 'api.coingecko.com',
      url: 'https://www.coingecko.com/en/api/documentation',
      snippet: 'REST market snapshot used by the Web3 pipeline for deterministic filtering and comparison.',
    });
  }
  return out;
}

function web3FocusTokens(raw: Web3ResearchResult['raw'] | undefined): string[] {
  const tokens = new Set<string>();
  for (const asset of raw?.assets || []) {
    const id = String(asset.id || '').trim().toLowerCase();
    const symbol = String(asset.symbol || '').trim().toLowerCase();
    const name = String(asset.name || '').trim().toLowerCase();
    if (id) tokens.add(id);
    if (symbol) tokens.add(symbol);
    if (name) {
      name.split(/\s+/).filter(Boolean).forEach((part) => tokens.add(part.toLowerCase()));
      tokens.add(name);
    }
  }
  return Array.from(tokens).filter((t) => /^[a-z0-9][a-z0-9\s_-]{1,30}$/.test(t));
}

function xAuthorFromSource(source: SignalSearchSource): string {
  const url = (source.url || '').trim();
  const m = url.match(/^https?:\/\/(?:www\.)?x\.com\/([A-Za-z0-9_]{1,15})\//i);
  return m?.[1]?.toLowerCase() || '';
}

function tokenizeSourceText(source: SignalSearchSource): string[] {
  return `${source.title || ''} ${source.snippet || ''}`
    .toLowerCase()
    .match(/\b[a-z][a-z0-9_]{1,20}\b/g) || [];
}

function xSourceTemplateFamily(source: SignalSearchSource): string {
  if ((source.domain || '').toLowerCase() !== 'x.com') return '';
  const text = `${source.title || ''} ${source.snippet || ''}`.toLowerCase();
  if (/crypto prices? update|current cryptocurrency prices?|crypto prices?\s+\|/.test(text)) return 'price_update';
  if (/fear\s*&\s*greed|btc dom|market movements|market snapshot/.test(text)) return 'market_snapshot';
  if (/trending:|top gainers|top losers|most volatile/.test(text)) return 'trending_board';
  if (/etf|netflow|net flow/.test(text)) return 'etf_flow';
  return '';
}

function sourceMentionsCount(source: SignalSearchSource, focusTokens: string[]): number {
  if (!focusTokens.length) return 0;
  const text = `${source.title || ''} ${source.snippet || ''}`.toLowerCase();
  return focusTokens.filter((token) => token && new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)).length;
}

function looksLikeLowValuePriceBotSource(source: SignalSearchSource): boolean {
  if ((source.domain || '').toLowerCase() !== 'x.com') return false;
  const text = `${source.title || ''} ${source.snippet || ''}`.toLowerCase();
  const boilerplatePatterns = [
    /crypto prices? update/,
    /current cryptocurrency prices?/,
    /fear\s*&\s*greed/,
    /trending:/,
    /\b\d{1,2}:\d{2}\s*(am|pm)\b/,
    /% Δ/,
  ];
  const distinctTickers = new Set(
    (text.match(/\b(btc|eth|sol|xrp|bnb|dot|mog|pepe|doge|ada|trx|link|usdc|usdt|ordi|based|rave)\b/g) || [])
      .map((m) => m.toLowerCase()),
  ).size;
  return boilerplatePatterns.some((pattern) => pattern.test(text)) || distinctTickers >= 4;
}

function rankAndLimitSources(
  sources: SignalSearchSource[],
  options: { web3Intent?: string; max?: number; focusTokens?: string[] } = {},
): SignalSearchSource[] {
  const max = options.max || 20;
  const marketHeavy = isMarketHeavyWeb3Intent(options.web3Intent);
  const seen = new Set<string>();
  const domainCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  const templateCounts = new Map<string, number>();
  const focusTokens = Array.from(new Set((options.focusTokens || []).map((t) => t.toLowerCase()).filter(Boolean)));
  const ranked = [...sources]
    .map((source, idx) => {
      const domain = (source.domain || '').toLowerCase();
      const text = `${source.title || ''} ${source.snippet || ''}`.toLowerCase();
      const author = xAuthorFromSource(source);
      const templateFamily = xSourceTemplateFamily(source);
      const tokenList = tokenizeSourceText(source);
      const distinctTickers = new Set(
        tokenList.filter((m) => /^(btc|bitcoin|eth|ethereum|sol|solana|xrp|bnb|dot|mog|pepe|doge|ada|trx|link|usdc|usdt|ordi|based|rave|siren)$/i.test(m)),
      ).size;
      const focusHits = sourceMentionsCount(source, focusTokens);
      let score = 0;
      if (domain === 'coingecko.com' || domain === 'api.coingecko.com') score += 120;
      if (/coinmarketcap|kraken|okx|binance|coindesk|theblock|cointelegraph|decrypt|blockworks/.test(domain)) score += 60;
      if (domain === 'exa.ai') score -= 10;
      if (marketHeavy && domain === 'x.com') score -= 35;
      if (marketHeavy && looksLikeLowValuePriceBotSource(source)) score -= 35;
      if (marketHeavy && templateFamily) score -= 20;
      if (marketHeavy && distinctTickers >= 5) score -= 20;
      if (marketHeavy && focusTokens.length > 0) {
        if (focusHits === 0) score -= 30;
        else score += Math.min(18, focusHits * 6);
        if (distinctTickers > Math.max(3, focusHits + 1)) score -= 15;
      }
      if (marketHeavy && /price|market cap|24h|compare|comparison|scanner|structured/i.test(text)) score += 12;
      if (!marketHeavy && domain === 'x.com') score += 15;
      return { source, idx, score, author, templateFamily };
    })
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  const out: SignalSearchSource[] = [];
  for (const entry of ranked) {
    const source = entry.source;
    const key = `${source.domain}|${source.url || source.title}`;
    if (seen.has(key)) continue;
    const domain = (source.domain || '').toLowerCase();
    const count = domainCounts.get(domain) || 0;
    const domainLimit = marketHeavy
      ? (domain === 'x.com' ? 2 : domain === 'exa.ai' ? 1 : 4)
      : (domain === 'x.com' ? 6 : 4);
    if (count >= domainLimit) continue;
    if (marketHeavy && domain === 'x.com') {
      if (entry.author) {
        const authorCount = authorCounts.get(entry.author) || 0;
        if (authorCount >= 1) continue;
        authorCounts.set(entry.author, authorCount + 1);
      }
      if (entry.templateFamily) {
        const templateCount = templateCounts.get(entry.templateFamily) || 0;
        if (templateCount >= 1) continue;
        templateCounts.set(entry.templateFamily, templateCount + 1);
      }
    }
    seen.add(key);
    domainCounts.set(domain, count + 1);
    out.push(source);
    if (out.length >= max) break;
  }
  return out;
}

function combinePreferredSources(
  searchSources: SignalSearchSource[],
  web3Sources: SignalSearchSource[],
  options: { web3Intent?: string; max?: number; focusTokens?: string[] } = {},
): SignalSearchSource[] {
  const merged = mergeSignalSources(web3Sources, searchSources, Math.max(options.max || 20, 30));
  return rankAndLimitSources(merged, options);
}

function normalizeIncomingImages(images: unknown): AgentChatImage[] {
  if (!Array.isArray(images)) return [];
  const normalized: AgentChatImage[] = [];
  for (const img of images) {
    if (!img || typeof img !== 'object') continue;
    const candidate = img as { url?: unknown; mime?: unknown; name?: unknown };
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
    if (!url) continue;
    normalized.push({
      url,
      mime: typeof candidate.mime === 'string' ? candidate.mime : undefined,
      name: typeof candidate.name === 'string' ? candidate.name : undefined,
    });
    if (normalized.length >= 4) break;
  }
  return normalized;
}

type ChatMeta = {
  images?: AgentChatImage[];
  /** Text-only image understanding for the current user turn, produced before routing. */
  routeImageDigest?: string;
  /** ISO timestamp when routeImageDigest was generated */
  routeImageDigestAt?: string;
  /** Textual memory of prior user image turns (vision stripped from model context). */
  imageSummary?: string;
  /** ISO timestamp when imageSummary was generated */
  imageSummaryAt?: string;
  /** Original images archived when converting a user image turn to summary-only */
  archivedImages?: AgentChatImage[];
  [key: string]: unknown;
};

function safeParseChatMeta(raw: string | null | undefined): ChatMeta | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ChatMeta;
  } catch {
    return null;
  }
}

function stringifyChatMeta(meta: ChatMeta): string {
  return JSON.stringify(meta);
}

function appendImageArchiveToUserText(userText: string, urls: string[]): string {
  const unique = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean)));
  if (unique.length === 0) return userText;
  const isZh = /[\u4e00-\u9fff]/.test(userText);
  const header = isZh ? '【历史图片链接】' : '[Earlier image links]';
  const lines = unique.map((u, i) => (isZh ? `${i + 1}. ${u}` : `${i + 1}. ${u}`)).join('\n');
  const block = `${header}\n${lines}`;
  if (!userText.trim()) return block;
  return `${userText.trim()}\n\n${block}`;
}

function buildModelUserContent(originalText: string, meta: ChatMeta | null): string {
  const urls = (meta?.archivedImages || []).map((i) => i.url).filter(Boolean);
  const summary = typeof meta?.imageSummary === 'string' ? meta.imageSummary.trim() : '';
  const routeImageDigest = typeof meta?.routeImageDigest === 'string' ? meta.routeImageDigest.trim() : '';
  let text = originalText || '';
  if (routeImageDigest) {
    const isZh = /[\u4e00-\u9fff]/.test(originalText) || /[\u4e00-\u9fff]/.test(routeImageDigest);
    const header = isZh ? '【图片理解】' : '[Image understanding]';
    text = text.trim() ? `${text.trim()}\n\n${header}\n${routeImageDigest}` : `${header}\n${routeImageDigest}`;
  }
  if (summary) {
    const isZh = /[\u4e00-\u9fff]/.test(originalText) || /[\u4e00-\u9fff]/.test(summary);
    const header = isZh ? '【历史图片摘要】' : '[Earlier image summary]';
    text = text.trim() ? `${text.trim()}\n\n${header}\n${summary}` : `${header}\n${summary}`;
  }
  if (urls.length) {
    text = appendImageArchiveToUserText(text, urls);
  }
  return text;
}

async function summarizeImagesForUserTurn(args: {
  ai: LokaAIService;
  userText: string;
  images: AgentChatImage[];
}): Promise<string> {
  const { ai, userText, images } = args;
  if (!images.length) return '';
  if (!ai.isConfigured) return '';

  const isZh = /[\u4e00-\u9fff]/.test(userText);

  const prompt = `You are extracting durable chat memory from images for a multi-turn assistant.
Return JSON ONLY (no markdown) with this schema:
{"summary":"..."}

Rules:
- Write the summary in ${isZh ? 'Chinese' : 'English'}.
- Be faithful; if unreadable, say so briefly.
- Focus on text, numbers, charts, UI labels, logos, and any task implied by the image(s).
- Keep it compact: <= 900 characters.
- Do not include chain-of-thought.

User message text (may be empty):
${userText || '(empty)'}`;

  const res = await ai.chat([{ role: 'user', content: prompt, images }], 'system', undefined);
  const raw = (res.content || '').trim();
  try {
    const parsed = JSON.parse(raw) as { summary?: string };
    return typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return '';
    try {
      const parsed = JSON.parse(m[0]) as { summary?: string };
      return typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    } catch {
      return '';
    }
  }
}

async function archivePriorUserImageTurns(args: {
  ai: LokaAIService;
  userId: string;
  sessionId: string;
  currentMessageId: string;
}) {
  const { ai, userId, sessionId, currentMessageId } = args;
  try {
    const prior = await prisma.chatMessage.findMany({
      where: { userId, sessionId, role: 'user' },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, content: true, metadata: true, createdAt: true },
    });

    for (const row of prior) {
      if (row.id === currentMessageId) continue;
      const meta = safeParseChatMeta(row.metadata);
      const imgs = normalizeIncomingImages(meta?.images);
      if (!imgs.length) continue;
      if (meta?.imageSummary && String(meta.imageSummary).trim()) continue;

      const summary = await summarizeImagesForUserTurn({ ai, userText: row.content || '', images: imgs });
      const nextMeta: ChatMeta = { ...(meta || {}) };
      nextMeta.archivedImages = imgs;
      delete nextMeta.images;
      nextMeta.imageSummary = summary || (imgs.length ? '（图片内容摘要生成失败：已保留链接）' : '');
      nextMeta.imageSummaryAt = new Date().toISOString();

      await prisma.chatMessage.update({
        where: { id: row.id },
        data: { metadata: stringifyChatMeta(nextMeta) },
      });
    }
  } catch (e: any) {
    console.warn('[agent:chat] archivePriorUserImageTurns failed:', e?.message || e);
  }
}

export function setupSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: [config.frontendUrl, 'https://www.loka.cash', 'https://loka.cash', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'https://localhost', 'capacitor://localhost'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/api/socket.io',
  });

  // JWT authentication middleware for WebSocket
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = await verifyToken(token as string);
      (socket as any).userId = payload.userId || payload.sub?.replace('did:privy:', '');
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as any).userId as string;
    console.log(`🔌 Client connected: ${socket.id} (user: ${userId})`);

    // Auto-join the user's personal room
    socket.join(`user:${userId}`);

    // ── Online status ──
    onlineUsers.add(userId);
    // Broadcast to all connected clients (friends will filter client-side)
    socket.broadcast.emit('user:online', { userId });

    // ── Auto-join group rooms from DB ──
    // This is vastly superior to relying on frontend `join-group` emits, as it intrinsically survives 
    // WebSocket disconnects/reconnects without dropping frames or losing synchrony.
    prisma.groupMember.findMany({ where: { userId } })
      .then(members => {
        members.forEach(m => socket.join(`group:${m.groupId}`));
      })
      .catch(err => console.error('Failed to auto-join DB groups:', err));

    // Join group chat room (validated - userId is already authenticated)
    socket.on('join-group', (groupId: string) => {
      if (typeof groupId === 'string' && groupId.length < 100) {
        socket.join(`group:${groupId}`);
      }
    });

    socket.on('leave-group', (groupId: string) => {
      if (typeof groupId === 'string') {
        socket.leave(`group:${groupId}`);
      }
    });

    // ── DM: typing indicator ──
    socket.on('dm:typing', (data: { conversationId: string; recipientId: string }) => {
      if (data?.recipientId && data?.conversationId) {
        emitToUser(data.recipientId, 'dm:typing', {
          userId,
          conversationId: data.conversationId,
        });
      }
    });

    // ── Get online users (client request) ──
    socket.on('get-online-users', (callback: (ids: string[]) => void) => {
      if (typeof callback === 'function') {
        callback(Array.from(onlineUsers));
      }
    });

    socket.on('agent:research:check', (data: { sessionId: string }, callback: (res: { isRunning: boolean }) => void) => {
      if (typeof callback === 'function') {
        callback({ isRunning: activeResearchSessions.has(data.sessionId) });
      }
    });

    // ── Deep Research Agent ──
    socket.on('agent:research', async (data: { topic: string; deep?: boolean; days?: number; sessionId?: string }) => {
      if (!data?.topic) return;
      socket.emit('agent:research:started', { topic: data.topic });

      const sessionId = data.sessionId || crypto.randomUUID();
      activeResearchSessions.add(sessionId);

      try {
        await prisma.chatMessage.create({
          data: {
            userId,
            sessionId,
            role: 'user',
            content: data.topic,
            agentId: 'research'
          }
        });
      } catch (dbErr) {
        console.error('Failed to save user message:', dbErr);
      }

      try {
        const result = await researchService.runDeepResearch(
          data.topic,
          { deep: data.deep, days: data.days },
          (log) => {
            emitToUser(userId, 'agent:research:progress', { topic: data.topic, sessionId, log });
          }
        );

        try {
          await prisma.chatMessage.create({
            data: {
              userId,
              sessionId,
              role: 'assistant',
              content: result.summary,
              agentId: 'research'
            }
          });
        } catch (dbErr) {
          console.error('Failed to save assistant message:', dbErr);
        }

        emitToUser(userId, 'agent:research:done', { ...result, sessionId });
        activeResearchSessions.delete(sessionId);
      } catch (err: any) {
        emitToUser(userId, 'agent:research:error', { topic: data.topic, sessionId, error: err.message });
        activeResearchSessions.delete(sessionId);
      }
    });

    // ── AI Hedge Fund Agent ──
    socket.on('agent:hedgefund:check', (data: { sessionId: string }, callback: (res: { isRunning: boolean }) => void) => {
      if (typeof callback === 'function') {
        callback({ isRunning: activeHedgeFundSessions.has(data.sessionId) });
      }
    });

    socket.on('agent:hedgefund', async (data: { tickers: string[]; sessionId?: string; showReasoning?: boolean }) => {
      if (!data?.tickers?.length) return;

      const sessionId = data.sessionId || crypto.randomUUID();
      activeHedgeFundSessions.add(sessionId);

      let processedTickers = [...data.tickers];

      // Extraction for natural language queries
      if (processedTickers.length === 1) {
        const query = processedTickers[0];
        const hasActionVerb = /^(分析|看|查|帮|对比|能不能)/.test(query);
        const isSentence = hasActionVerb || (query.length > 5 && /[\u4e00-\u9fa5]/.test(query)) || query.split(' ').length > 2;
        if (isSentence) {
          emitToUser(userId, 'agent:hedgefund:progress', { sessionId, log: '[NameResolver] AI is extracting stock codes from your query...' });
          try {
            const extPrompt = `You are a strict Named Entity Recognition (NER) system for finance.
Extract ONLY company names, stock tickers, or cryptocurrency symbols from the user's text.
Rules:
1. Return ONLY a comma-separated list of the recognized entities.
2. Strip out all conversational words, verbs, and punctuation.
3. If no companies, tickers, or assets are found, return the word "NONE". Do NOT return the original text.

Examples:
"能简单帮我分析腾讯么" -> 腾讯
"看看AAPL和特斯拉" -> AAPL,特斯拉
"你能做什么？" -> NONE
"帮我查一下BTC最新的情况" -> BTC

Text: "${query}"`;
            const extResponse = await aiService.chat([{ role: 'user', content: extPrompt }], 'system');
            const extracted = extResponse.content?.trim() || 'NONE';
            if (extracted !== 'NONE' && extracted !== query) {
              processedTickers = extracted.split(',').map(s => s.trim());
              emitToUser(userId, 'agent:hedgefund:progress', { sessionId, log: `[NameResolver] AI Extracted: ${processedTickers.join(', ')}` });
            }
          } catch (e) {
            console.error('AI Extraction failed', e);
          }
        }
      }

      const tickerStr = processedTickers.join(', ');
      emitToUser(userId, 'agent:hedgefund:started', { tickers: processedTickers, sessionId });

      // Save user message
      try {
        await prisma.chatMessage.create({
          data: {
            userId,
            sessionId,
            role: 'user',
            content: `Analyze ${tickerStr} using AI Hedge Fund`,
            agentId: 'hedgefund'
          }
        });
      } catch (dbErr) {
        console.error('Failed to save hedgefund user message:', dbErr);
      }

      try {
        const result = await hedgefundService.runAnalysis(
          {
            tickers: processedTickers,
            showReasoning: data.showReasoning ?? true,
          },
          (log) => {
            emitToUser(userId, 'agent:hedgefund:progress', { sessionId, log });
          }
        );

        const report = hedgefundService.formatReport(result);

        // Save assistant message
        try {
          await prisma.chatMessage.create({
            data: {
              userId,
              sessionId,
              role: 'assistant',
              content: report,
              agentId: 'hedgefund'
            }
          });
        } catch (dbErr) {
          console.error('Failed to save hedgefund assistant message:', dbErr);
        }

        emitToUser(userId, 'agent:hedgefund:done', { sessionId, report });
        activeHedgeFundSessions.delete(sessionId);
      } catch (err: any) {
        emitToUser(userId, 'agent:hedgefund:error', { sessionId, error: err.message });
        activeHedgeFundSessions.delete(sessionId);
      }
    });

    // ── Stock Analysis Agent (Structured Stream + Reconnection) ──
    socket.on('agent:stockanalysis:check', (data: { sessionId: string }, callback: (res: { isRunning: boolean; steps?: any[]; report?: string }) => void) => {
      if (typeof callback === 'function') {
        const buffer = stockAnalysisService.getSessionBuffer(data.sessionId);
        if (buffer) {
          callback({
            isRunning: buffer.status === 'running',
            steps: buffer.steps,
            report: buffer.finalReport,
          });
        } else {
          callback({ isRunning: activeStockAnalysisSessions.has(data.sessionId) });
        }
      }
    });

    socket.on('agent:stockanalysis', async (data: { tickers: string[]; sessionId?: string; message?: string }) => {
      if (!data?.tickers?.length && !data?.message) return;

      const sessionId = data.sessionId || crypto.randomUUID();
      activeStockAnalysisSessions.add(sessionId);

      // Use raw message if provided (natural language), else join tickers
      const rawQuery = data.message || (data.tickers || []).join(', ');
      const userContent = data.message || `Analyze ${(data.tickers || []).join(', ')} using Stock Analysis Agent`;

      emitToUser(userId, 'agent:stockanalysis:started', { sessionId, query: rawQuery });

      // Save user message
      try {
        await prisma.chatMessage.create({
          data: {
            userId,
            sessionId,
            role: 'user',
            content: userContent,
            agentId: 'stockanalysis'
          }
        });
      } catch (dbErr) {
        console.error('Failed to save stockanalysis user message:', dbErr);
      }

      // Use the new stream-based analysis (structured JSONL events)
      stockAnalysisService.runStreamAnalysis(
        rawQuery,
        sessionId,
        userId,
        // onStep: forward structured step events
        (step) => {
          emitToUser(userId, 'agent:stockanalysis:step', { sessionId, ...step });
        },
        // onDone: save report + notify
        async (report: string) => {
          try {
            await prisma.chatMessage.create({
              data: {
                userId,
                sessionId,
                role: 'assistant',
                content: report,
                agentId: 'stockanalysis'
              }
            });
          } catch (dbErr) {
            console.error('Failed to save stockanalysis assistant message:', dbErr);
          }
          emitToUser(userId, 'agent:stockanalysis:done', { sessionId, report });
          activeStockAnalysisSessions.delete(sessionId);
        },
        // onError
        (error: string) => {
          emitToUser(userId, 'agent:stockanalysis:error', { sessionId, error });
          activeStockAnalysisSessions.delete(sessionId);
        }
      );
    });

    // ── SuperAgent Chat (Streaming & Consensus) ──
    socket.on('agent:chat:check', (data: { sessionId: string }, callback: (res: { isRunning: boolean; mode?: string }) => void) => {
      if (typeof callback === 'function') {
        callback({ isRunning: activeChatSessions.has(data.sessionId), mode: activeChatSessions.get(data.sessionId) });
      }
    });

    /**
     * Reconnect: return buffered stock-analysis steps + optional final report (session + buffer + search).
     */
    socket.on(
      'agent:chat:replay',
      (
        data: { sessionId: string },
        callback?: (res: {
          ok: boolean;
          isRunning?: boolean;
          steps?: unknown[];
          report?: string;
          status?: string;
        }) => void,
      ) => {
        if (typeof callback !== 'function') return;
        const sid = data?.sessionId;
        if (!sid) {
          callback({ ok: false });
          return;
        }
        const chatBuffer = getChatReplayBuffer(sid);
        if (chatBuffer) {
          callback({
            ok: true,
            isRunning: chatBuffer.status === 'running',
            steps: chatBuffer.toolTraceSteps,
            modules: chatBuffer.modules,
            mode: chatBuffer.mode,
            report: chatBuffer.content || undefined,
            status: chatBuffer.status,
          } as any);
          return;
        }
        const buffer = stockAnalysisService.getSessionBuffer(sid);
        if (buffer) {
          callback({
            ok: true,
            isRunning: buffer.status === 'running',
            steps: buffer.steps,
            report: buffer.finalReport,
            status: buffer.status,
          });
          return;
        }
        if (activeChatSessions.has(sid) || activeStockAnalysisSessions.has(sid)) {
          callback({ ok: true, isRunning: true, steps: [], status: 'running' });
          return;
        }
        callback({ ok: false, isRunning: false, steps: [], status: 'unknown' });
      },
    );

    socket.on('agent:chat:stop', (data: { sessionId?: string }) => {
      const sid = data?.sessionId;
      if (!sid) return;
      const ctrl = chatAbortControllers.get(sid);
      if (ctrl) {
        console.log(`[agent:chat:stop] User-initiated abort for session ${sid}`);
        ctrl.abort();
        chatAbortControllers.delete(sid);
      }
    });

    socket.on('agent:chat', async (data: { content?: string; mode: string; sessionId?: string; agentId?: string; hidden?: boolean; images?: AgentChatImage[] }) => {
      const userContent = typeof data?.content === 'string' ? data.content : '';
      const images = normalizeIncomingImages(data?.images);
      const hasImages = images.length > 0;
      if (!userContent.trim() && !hasImages) return;

      const sessionId = data.sessionId || crypto.randomUUID();
      const dedupImageKey = images.map((img) => img.url).join('|');

      // ── Dedup guard: skip identical content for the same session within 3s ──
      const dedupKey = `${sessionId}::${userContent}::${dedupImageKey}`;
      const now = Date.now();
      const lastSeen = chatDedupMap.get(dedupKey);
      if (lastSeen && now - lastSeen < 3000) {
        console.log(`[agent:chat] Dedup: skipping duplicate message for session ${sessionId}`);
        return;
      }
      chatDedupMap.set(dedupKey, now);
      // Prune old entries periodically
      if (chatDedupMap.size > 100) {
        for (const [k, v] of chatDedupMap) {
          if (now - v > 10000) chatDedupMap.delete(k);
        }
      }

      // ── Cancel any previous in-flight run for the same session ──
      const prevAbort = chatAbortControllers.get(sessionId);
      if (prevAbort) {
        console.log(`[agent:chat] Aborting previous run for session ${sessionId}`);
        prevAbort.abort();
      }
      const abortController = new AbortController();
      chatAbortControllers.set(sessionId, abortController);
      const isAborted = () => abortController.signal.aborted;

      console.log('[agent:chat]', {
        sessionId,
        contentPreview: userContent.slice(0, 80),
        images: images.length,
      });

      const emitter = createModuleEmitter(userId, sessionId);

      let latestUserMessageId: string | null = null;
      if (!data.hidden) {
        try {
          const userMeta = hasImages ? JSON.stringify({ images }) : null;
          const createdUser = await prisma.chatMessage.create({
            data: { userId, sessionId, role: 'user', content: userContent, agentId: 'superagent', metadata: userMeta },
            select: { id: true },
          });
          latestUserMessageId = createdUser.id;
        } catch (dbErr) { }
      }

      // When a new user image turn arrives, archive prior user image turns into summary+links
      // so subsequent model calls only keep the latest round as true vision input.
      if (latestUserMessageId) {
        await archivePriorUserImageTurns({
          ai: aiService,
          userId,
          sessionId,
          currentMessageId: latestUserMessageId,
        });
      }

      // ── Query session history for multi-turn context ──
      const MAX_HISTORY_FOR_ROUTING = 6;
      const MAX_HISTORY_FOR_SYNTHESIS = 8;
      const ASSISTANT_CONTENT_CAP = 300;

      const sessionHistory = await prisma.chatMessage.findMany({
        where: { userId, sessionId },
        orderBy: { createdAt: 'asc' },
        take: MAX_HISTORY_FOR_SYNTHESIS,
        select: { role: true, content: true, metadata: true },
      });

      const formatHistory = (messages: { role: string; content: string; metadata: string | null }[], limit: number): string => {
        return messages
          .slice(-limit)
          .map(m => {
            const label = m.role === 'user' ? 'User' : 'Assistant';
            const meta = m.role === 'user' ? safeParseChatMeta(m.metadata) : null;
            const baseText = m.role === 'user' ? buildModelUserContent(m.content || '', meta) : m.content;
            const text = m.role === 'assistant' && baseText.length > ASSISTANT_CONTENT_CAP
              ? baseText.slice(0, ASSISTANT_CONTENT_CAP) + '...(truncated)'
              : baseText;
            return `[${label}]: ${text}`;
          })
          .join('\n');
      };

      activeChatSessions.set(sessionId, 'running');
      startChatReplayBuffer(sessionId, data.mode);
      emitter.emitStarted('auto', 'Super Agent', data.hidden);
      socket.emit('agent:chat:routing', { sessionId });
      const requestStartedAt = Date.now();
      const sinceRequestStart = () => Date.now() - requestStartedAt;
      const asSeconds = (ms: number) => (ms / 1000).toFixed(3);

      let routeImageDigest = '';
      if (hasImages) {
        const digestStartedAt = Date.now();
        try {
          routeImageDigest = await aiService.analyzeImagesForRouting(userContent, images);
          if (latestUserMessageId && routeImageDigest) {
            await prisma.chatMessage.update({
              where: { id: latestUserMessageId },
              data: {
                metadata: stringifyChatMeta({
                  images,
                  routeImageDigest,
                  routeImageDigestAt: new Date().toISOString(),
                }),
              },
            });
          }
          console.log(
            `[agent:chat:timing] image_digest_s=${asSeconds(Date.now() - digestStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId} digest_len=${routeImageDigest.length}`,
          );
        } catch (digestErr: any) {
          console.warn('[agent:chat] route image digest failed:', digestErr?.message || digestErr);
        }
      }

      let plan: any;
      const routingStartedAt = Date.now();
      try {
        const routingHistory = formatHistory(sessionHistory, MAX_HISTORY_FOR_ROUTING);
        const routingDigest =
          routeImageDigest && routeImageDigest.length > 180
            ? `${routeImageDigest.slice(0, 180)}...(truncated)`
            : routeImageDigest;
        const routingDigestBlock = routeImageDigest
          ? `\n\n【Latest Image Digest】\n${routingDigest}`
          : '';
        const routingQuery = routingHistory
          ? `【Conversation Context】\n${routingHistory}\n\n【Latest User Message】\n${userContent}${routingDigestBlock}`
          : `${userContent}${routingDigestBlock}`;
        plan = await aiService.evaluateRouting(routingQuery);
        if (routeImageDigest) {
          plan.imageDigest = routeImageDigest;
        }
        console.log(
          `[agent:chat:timing] routing_s=${asSeconds(Date.now() - routingStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId} digest_len=${routeImageDigest.length}`,
        );
      } catch (routingErr: any) {
        console.error('evaluateRouting failed:', routingErr.message);
        plan = {
          isSimpleChat: true,
          queryType: 'general',
          imageDigest: routeImageDigest,
          capabilities: { analysis: { needed: false }, search: { needed: false }, simulate: { needed: false }, web3: { needed: false } },
        };
      }

      if (!hasImages && data.mode === 'roundtable') {
        plan.isSimpleChat = false;
      }

      // Guardrail: image-heavy stock questions can be misrouted as general when digest is terse.
      // If user explicitly asks about stocks and routing says simple chat, force analysis/search.
      if (hasImages && routeImageDigest && plan.isSimpleChat) {
        const stockIntent = /股票|A股|港股|美股|个股|标的|行情|涨停|跌停|分析|估值|stock|stocks|share|ticker|equity|price/i.test(
          `${userContent}\n${routeImageDigest}`,
        );
        if (stockIntent) {
          const tickersFromDigest = Array.from(
            new Set((routeImageDigest.match(/\b\d{6}\b/g) || []).slice(0, 5)),
          );
          const digestForSearch = routeImageDigest.replace(/\s+/g, ' ').trim().slice(0, 220);
          const isZhIntent = /[\u4e00-\u9fff]/.test(userContent || routeImageDigest || '');
          const fallbackSearchQuery = isZhIntent
            ? `${digestForSearch} 股票分析 最新消息`
            : `${digestForSearch} stock analysis latest news`;
          plan = {
            ...plan,
            isSimpleChat: false,
            queryType: 'investment-analysis',
            capabilities: {
              ...plan.capabilities,
              analysis: {
                ...plan.capabilities.analysis,
                needed: true,
                tickers: tickersFromDigest.length > 0 ? tickersFromDigest : plan.capabilities.analysis?.tickers,
              },
              search: {
                ...plan.capabilities.search,
                needed: true,
                query: plan.capabilities.search?.query || fallbackSearchQuery,
              },
              simulate: { ...plan.capabilities.simulate, needed: false },
              web3: { ...plan.capabilities.web3, needed: false },
            },
          };
          console.warn(
            `[agent:chat:routing] image-stock safeguard activated. digest_len=${routeImageDigest.length} tickers=${tickersFromDigest.join(',') || 'none'}`,
          );
        }
      }

      // Guru Council mode: always trigger simulation + search (including with images)
      if (data.agentId === 'guru-council') {
        plan.isSimpleChat = false;
        plan.queryType = 'guru-council';
        plan.capabilities.simulate.needed = true;
        // Always search so gurus have real-world context and sources to cite
        if (!plan.capabilities.search.needed) {
          plan.capabilities.search.needed = true;
          plan.capabilities.search.query = plan.capabilities.search.query || data.content;
        }
        // Use tickers from routing if available, otherwise default to broad market
        if (!plan.capabilities.simulate.tickers?.length) {
          plan.capabilities.simulate.tickers = plan.capabilities.analysis?.tickers?.length
            ? plan.capabilities.analysis.tickers
            : ['SPY', 'QQQ'];
        }
        // Detect if user mentioned specific named gurus
        const GURU_NAME_MAP: Record<string, string> = {
          'damodaran': 'aswath_damodaran', 'aswath damodaran': 'aswath_damodaran',
          'ben graham': 'ben_graham', 'graham': 'ben_graham', 'benjamin graham': 'ben_graham',
          'bill ackman': 'bill_ackman', 'ackman': 'bill_ackman',
          'cathie wood': 'cathie_wood', 'cathie': 'cathie_wood',
          'charlie munger': 'charlie_munger', 'munger': 'charlie_munger',
          'michael burry': 'michael_burry', 'burry': 'michael_burry', 'dr. burry': 'michael_burry',
          'mohnish pabrai': 'mohnish_pabrai', 'pabrai': 'mohnish_pabrai',
          'nassim taleb': 'nassim_taleb', 'taleb': 'nassim_taleb',
          'peter lynch': 'peter_lynch', 'lynch': 'peter_lynch',
          'phil fisher': 'phil_fisher', 'fisher': 'phil_fisher', 'philip fisher': 'phil_fisher',
          'rakesh jhunjhunwala': 'rakesh_jhunjhunwala', 'rakesh': 'rakesh_jhunjhunwala', 'jhunjhunwala': 'rakesh_jhunjhunwala',
          'stanley druckenmiller': 'stanley_druckenmiller', 'druckenmiller': 'stanley_druckenmiller',
          'warren buffett': 'warren_buffett', 'buffett': 'warren_buffett', 'warren': 'warren_buffett',
        };
        const queryLower = userContent.toLowerCase();
        const mentionedSet = new Set<string>();
        // Sort by length descending to match longer phrases first
        const sortedKeys = Object.keys(GURU_NAME_MAP).sort((a, b) => b.length - a.length);
        for (const phrase of sortedKeys) {
          if (queryLower.includes(phrase)) {
            mentionedSet.add(GURU_NAME_MAP[phrase]);
          }
        }
        if (mentionedSet.size > 0) {
          plan.specificGurus = Array.from(mentionedSet);
        }
      }

      // Ensure search is always enabled for non-simple queries so sources are available for citations
      if (!plan.isSimpleChat && !plan.capabilities.search.needed) {
        plan.capabilities.search.needed = true;
        plan.capabilities.search.query = plan.capabilities.search.query || data.content;
      }

      // ── Layer 1: strip known crypto symbols from analysis.tickers ──────────
      if (plan.capabilities.analysis.needed && plan.capabilities.analysis.tickers?.length) {
        const cryptoHits = plan.capabilities.analysis.tickers.filter(isCryptoSymbol);
        if (cryptoHits.length > 0) {
          const filtered = filterOutCryptoTickers(plan.capabilities.analysis.tickers);
          console.log(`[routing:layer1] Stripped crypto tickers from analysis: [${cryptoHits.join(', ')}] → remaining: [${filtered.join(', ') || 'none'}]`);
          if (filtered.length === 0) {
            plan.capabilities.analysis.needed = false;
          } else {
            plan.capabilities.analysis.tickers = filtered;
          }
          // Auto-enable web3 if not already set
          if (!plan.capabilities.web3?.needed) {
            plan.capabilities.web3 = {
              needed: true,
              query: cryptoHits.map(t => t.toUpperCase()).join(' ') + ' ' + (plan.capabilities.search.query || userContent),
            };
            console.log(`[routing:layer1] Auto-enabled web3 for stripped crypto tickers: ${cryptoHits.join(', ')}`);
          }
        }
      }

      // ── Layer 3: ambiguous ticker → ask user to clarify (crypto vs stock) ──
      const allMentionedTickers = [
        ...(plan.capabilities.analysis.tickers || []),
        ...(plan.capabilities.simulate?.tickers || []),
      ];
      const ambiguous = allMentionedTickers.find(t => isAmbiguousSymbol(t) && !plan.capabilities.web3?.needed);
      if (ambiguous) {
        const asset = ambiguous.toUpperCase();
        const clarification = `I noticed you mentioned **${asset}** — did you mean the **${asset} cryptocurrency** or the **${asset} stock ticker**? Please clarify so I can route your query to the right tool.`;
        console.log(`[routing:layer3] Ambiguous ticker detected: ${asset} → sending clarification`);
        emitter.emitModule('search', 'active', { variant: 'data_providers', providers: [] });
        emitter.emitProgress(clarification);
        emitter.emitModule('done', 'completed', { duration: 0 });
        emitter.emitStreamDone(clarification);
        try {
          await prisma.chatMessage.create({
            data: { userId, sessionId, role: 'assistant', content: clarification, agentId: 'superagent' }
          });
        } catch (_) {}
        activeChatSessions.delete(sessionId);
        finishChatReplayBuffer(sessionId);
        chatAbortControllers.delete(sessionId);
        return;
      }

      socket.emit('agent:chat:routed', { 
        sessionId, 
        mode: (!hasImages && data.mode === 'roundtable') ? 'roundtable' : (plan.isSimpleChat ? 'fast' : 'auto') 
      });

      const streamToChat = (chunk: string) => {
        if (isAborted()) return;
        emitter.emitProgress(chunk);
      };

      if (plan.isSimpleChat && data.mode !== 'roundtable') {
        const simpleStart = Date.now();
        emitter.emitModule('search', 'active', { variant: 'data_providers', providers: [] });
        try {
          const context = await prisma.chatMessage.findMany({ where: { userId, sessionId }, orderBy: { createdAt: 'asc' }, take: 10 });
          const mappedContext = context.map((m) => {
            const meta = safeParseChatMeta(m.metadata);
            if (m.role === 'user') {
              return { role: m.role, content: buildModelUserContent(m.content || '', meta), agentId: m.agentId };
            }

            return { role: m.role, content: m.content, agentId: m.agentId };
          });
          const stream = await aiService.chatStream(mappedContext, 'superagent', undefined, 2560);
          emitter.emitModule('search', 'completed');

          const reader = stream.getReader();
          const decoder = new TextDecoder();
          let fullContent = '';
          let streamBuffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done || isAborted()) break;
            streamBuffer += decoder.decode(value, { stream: true });
            const lines = streamBuffer.split('\n');
            streamBuffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const sseData = trimmed.slice(6).trim();
                if (sseData === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(sseData);
                  const delta = parsed.choices?.[0]?.delta?.content || '';
                  if (delta) {
                    fullContent += delta;
                    streamToChat(delta);
                  }
                } catch (e) { }
              }
            }
          }

          const simpleFlow = {
            modules: [
              { type: 'search', status: 'completed', data: { variant: 'data_providers', providers: [] } },
              { type: 'done', status: 'completed' }
            ],
            isActive: false,
            route: 'Super Agent'
          };

          const simpleDur = Math.round((Date.now() - simpleStart) / 1000);
          if (isAborted()) {
            activeChatSessions.delete(sessionId);
        finishChatReplayBuffer(sessionId);
            chatAbortControllers.delete(sessionId);
            return;
          }
          try {
            await prisma.chatMessage.create({
              data: { userId, sessionId, role: 'assistant', content: fullContent, agentId: 'superagent', metadata: JSON.stringify({ thinkingFlow: simpleFlow }) }
            });
          } catch (e) { }
          emitter.emitModule('done', 'completed', { duration: simpleDur });
          emitter.emitStreamDone(fullContent);
        } catch (streamErr: any) {
          console.error('[agent:chat] simple chat stream failed:', streamErr.message);
          emitter.emitModule('search', 'completed');
          emitter.emitModule('done', 'completed', {});
          emitToUser(userId, 'agent:chat:error', { sessionId, error: 'Connection failed, please try again.' });
          emitter.emitStreamDone('');
        }
        activeChatSessions.delete(sessionId);
        finishChatReplayBuffer(sessionId);
        chatAbortControllers.delete(sessionId);
        return;
      }

      const promises: Promise<{ type: string; data: any }>[] = [];
      const startTime = Date.now();
      const toolDispatchStartedAt = Date.now();

      let finalSocialSources: SignalSearchSource[] = [];
      let finalSearchSourcesRaw: SignalSearchSource[] = [];
      let finalWeb3Sources: SignalSearchSource[] = [];
      let finalWeb3Intent: string | undefined;
      let finalAnalysisStages: any[] = [];
      let finalPanelists: any[] = [];
      let savedQuoteCard: any = null;
      let savedXProfileCard: Record<string, unknown> | null = null;

      if (plan.capabilities.search.needed) {
        emitter.emitModule('search', 'active', {
          variant: 'social',
          sources: [],
          providers: [
            { name: 'Yahoo Finance' }, { name: 'Bloomberg API' }, { name: 'Alpha Vantage' },
            { name: 'Polygon.io' }, { name: 'CoinGecko' }, { name: 'TradingView' }
          ]
        });
        const signalResearchLogLines: string[] = [];
        let logHintSources: any[] = [];
        // Faster default for SuperAgent chat: focus on X + web, skip slower auxiliary sources unless overridden.
        const superagentSearchSources = (process.env.SUPERAGENT_LAST30DAYS_SEARCH || 'x,web').trim();
        const routedSearchQuery = plan.capabilities.search.query || [userContent, plan.imageDigest].filter(Boolean).join(' ; ');
        const explicitHandles = explicitHandlesFromText(userContent);
        let effectiveSearchQuery = routedSearchQuery;
        if (explicitHandles.length > 0) {
          const missingHandles = explicitHandles.filter(
            (h) => !new RegExp(`@?${h}\\b`, 'i').test(routedSearchQuery),
          );
          if (missingHandles.length > 0) {
            effectiveSearchQuery = `${routedSearchQuery} ${missingHandles.map((h) => `@${h}`).join(' ')}`.trim();
            console.log(
              `[search_query] patched handles into routed query. original="${routedSearchQuery}" patched="${effectiveSearchQuery}"`,
            );
          }
        }

        promises.push(
          researchService.runDeepResearch(
            effectiveSearchQuery,
            {
              deep: false,
              searchSources: superagentSearchSources || undefined,
              // Skip last30days internal synthesis to avoid double summarization latency;
              // SuperAgent already performs final synthesis after all tools settle.
              skipInnerSynthesis: true,
            },
            {
              onResearchLine: (line) => {
                const cleanLine = line.replace(/\u001b\[[0-9;]*m/g, '');
                emitToUser(userId, 'agent:chat:thinking_log', { sessionId, line: cleanLine });
                const fromLog = sourcesFromSignalRadarLogLine(cleanLine);
                if (fromLog.length) {
                  logHintSources = mergeSignalSources(logHintSources, fromLog);
                  emitter.emitModule('search', 'active', {
                    variant: 'social',
                    sources: logHintSources,
                  });
                }
              },
              onSynthesisToken: () => { },
            }
          ).then(res => {
            const PANEL_MAX = 20;
            // Extract structured sources from raw Python stdout (has bare URLs per item)
            console.log(`[sources] rawStdout length: ${res.rawStdout?.length || 0}, has URLs: ${(res.rawStdout?.match(/https?:\/\//g) || []).length}`);
            let socialSources = sourcesFromLast30DaysCompact(res.rawStdout, PANEL_MAX);
            console.log(`[sources] compact extraction: ${socialSources.length} sources, snippets: ${socialSources.filter(s => s.snippet).length}`);
            // Fallback: try URLs from synthesized summary
            if (socialSources.length === 0) {
              socialSources = sourcesFromSignalRadarSummary(res.summary, PANEL_MAX);
              console.log(`[sources] summary fallback: ${socialSources.length} sources`);
            }
            // Fallback: log-based platform hints
            if (socialSources.length === 0) socialSources = mergeSignalSources([], logHintSources, PANEL_MAX);
            finalSearchSourcesRaw = socialSources;
            const preferredSources = combinePreferredSources(finalSearchSourcesRaw, finalWeb3Sources, {
              web3Intent: finalWeb3Intent,
              max: PANEL_MAX,
            });
            const sourceDomains = Array.from(new Set((preferredSources || []).map((s) => s.domain).filter(Boolean)));
            const sourcePreview = (preferredSources || [])
              .slice(0, 3)
              .map((s) => `${s.domain || 'unknown'}|${(s.title || '').slice(0, 60)}|${s.url || ''}`)
              .join(' || ');
            console.log(
              `[sources] final extraction: raw_count=${socialSources.length} preferred_count=${preferredSources.length} unique_domains=${sourceDomains.length} domains=${sourceDomains.join(',') || 'none'}`,
            );
            if (sourcePreview) {
              console.log(`[sources] final extraction preview: ${sourcePreview}`);
            }

            finalSocialSources = preferredSources;
            emitter.emitModule('search', 'completed', {
              variant: 'social',
              sources: preferredSources,
              providers: [
                { name: 'Yahoo Finance' }, { name: 'Bloomberg API' }, { name: 'Alpha Vantage' },
                { name: 'Polygon.io' }, { name: 'CoinGecko' }, { name: 'TradingView' }
              ]
            });
            const xProfiles = res.xProfiles || [];
            const routerXProfileFlag = plan?.capabilities?.search?.showXAccountProfile;
            const shouldShowXProfileCard =
              xProfiles.length &&
              (routerXProfileFlag === true ||
                (routerXProfileFlag !== false && wantsTwitterProjectProfileHint(userContent)));
            if (shouldShowXProfileCard) {
              const picked = pickXProfileForUser(xProfiles, userContent);
              if (picked && (picked.followers != null || picked.following != null || picked.joinedDisplay || picked.joinedRaw)) {
                const payload = {
                  handle: picked.handle,
                  profileUrl: `https://x.com/${encodeURIComponent(picked.handle)}`,
                  followers: picked.followers,
                  following: picked.following,
                  joinedDisplay: picked.joinedDisplay || picked.joinedRaw || '',
                  avatarUrl: picked.avatarUrl || '',
                };
                savedXProfileCard = payload;
                emitToUser(userId, 'agent:chat:x_profile', { sessionId, profile: payload });
                console.log(
                  `[x_profile] selected handle=@${payload.handle} followers=${payload.followers ?? 'n/a'} following=${payload.following ?? 'n/a'} query="${userContent.slice(0, 120)}"`,
                );
              } else {
                console.log(
                  `[x_profile] skipped: no high-confidence profile match for query="${userContent.slice(0, 120)}" profiles=${xProfiles.length}`,
                );
              }
            }
              return { type: 'SEARCH', data: res.summary, sources: preferredSources };
          }).catch(e => {
            emitter.emitModule('search', 'completed', {});
            return { type: 'SEARCH', data: 'Error: ' + e.message };
          })
        );
      }

      if (plan.capabilities.web3?.needed) {
        emitter.emitModule('web3', 'active', {
          variant: 'coingecko_mcp',
          label: 'CoinGecko MCP',
        });
        const routedWeb3Q = (plan.capabilities.web3.query || '').trim();
        const originalQ = userContent.trim();
        const web3Q =
          routedWeb3Q && originalQ && routedWeb3Q !== originalQ
            ? `${originalQ} ; ${routedWeb3Q}`
            : routedWeb3Q || originalQ;
        promises.push(
          web3ResearchService
            .runQuery(web3Q)
            .then((result) => {
              finalWeb3Intent = result.raw.intent || undefined;
              finalWeb3Sources = buildWeb3ProviderSources(result.raw);
              const focusTokens = web3FocusTokens(result.raw);
              if (plan.capabilities.search.needed) {
                const preferredSources = combinePreferredSources(finalSearchSourcesRaw, finalWeb3Sources, {
                  web3Intent: finalWeb3Intent,
                  max: 20,
                  focusTokens,
                });
                if (preferredSources.length > 0) {
                  finalSocialSources = preferredSources;
                  emitter.emitModule('search', 'completed', {
                    variant: 'social',
                    sources: preferredSources,
                    providers: [
                      { name: 'Yahoo Finance' }, { name: 'Bloomberg API' }, { name: 'Alpha Vantage' },
                      { name: 'Polygon.io' }, { name: 'CoinGecko' }, { name: 'TradingView' }
                    ]
                  });
                }
              } else if (finalWeb3Sources.length > 0) {
                finalSocialSources = combinePreferredSources([], finalWeb3Sources, {
                  web3Intent: finalWeb3Intent,
                  max: 20,
                  focusTokens,
                });
              }
              console.log(
                `[web3Sources] injected=${finalWeb3Sources.length} intent=${finalWeb3Intent || 'n/a'} final_sources=${finalSocialSources.length}`,
              );
              emitter.emitModule('web3', 'completed', {
                variant: 'coingecko_mcp',
                intent: result.raw.intent || 'unknown',
                assets: result.raw.assets?.length || 0,
                via: result.raw.via || 'n/a',
              });
              return { type: 'WEB3', data: result.report };
            })
            .catch((e) => {
              console.warn(
                `[web3Research] failed sessionId=${sessionId} err=${(e as Error).message}`,
              );
              emitter.emitModule('web3', 'completed', {});
              return { type: 'WEB3', data: 'Error: ' + (e as Error).message };
            }),
        );
      }

      if (plan.capabilities.analysis.needed) {
        let activeSections = [{ id: 'data_providers', label: 'Fetching market data', status: 'pending', providers: [] }];
        let analysisStages = [
          { id: 'fundamental', label: 'Fundamental analysis', status: 'pending', result: [] as any[] },
          { id: 'technical', label: 'Technical analysis', status: 'pending', result: [] as any[] },
          { id: 'sentiment', label: 'Sentiment analysis', status: 'pending' }
        ];
        emitter.emitModule('analysis', 'active', { stages: analysisStages });

        promises.push(
          new Promise(resolve => {
            // Use a derived sub-session ID to avoid replay handler returning
            // the raw analysis buffer instead of the final synthesized content
            const analysisSubSessionId = `${sessionId}:analysis`;
            stockAnalysisService.runStreamAnalysis(
              "Analyze: " + (plan.capabilities.analysis.tickers?.join(', ') || userContent),
              analysisSubSessionId,
              userId,
              (step: any) => {
                recordChatToolTraceStep(sessionId, step);
                emitToUser(userId, 'agent:chat:tool_trace', { sessionId, step });
                if (step.type === 'generating' && step.message === '[UI_METADATA]' && step.content) {
                  try {
                    const meta = JSON.parse(step.content);
                    if (meta.fundamental) {
                      analysisStages[0].status = 'done';
                      // Merge into existing result array (multiple tools may contribute)
                      const fr = analysisStages[0].result || [];
                      const set = (label: string, raw: any, fmt?: (v: any) => string, color?: string) => {
                        if (raw == null) return;
                        const idx = fr.findIndex((r: any) => r.label === label);
                        const entry = { label, value: fmt ? fmt(raw) : String(raw), color: color || 'text-gray-600' };
                        if (idx >= 0) fr[idx] = entry; else fr.push(entry);
                      };
                      set('PE', meta.fundamental.PE, v => typeof v === 'number' ? v.toFixed(1) + 'x' : v, 'text-blue-600');
                      set('PB', meta.fundamental.PB, v => typeof v === 'number' ? v.toFixed(2) + 'x' : v, 'text-indigo-600');
                      set('Turnover', meta.fundamental.Turnover, v => typeof v === 'number' ? v.toFixed(2) + '%' : v, 'text-amber-600');
                      analysisStages[0].result = fr;
                    }
                    if (meta.technical) {
                      analysisStages[1].status = 'done';
                      const tr = analysisStages[1].result || [];
                      const set = (label: string, raw: any, color?: string) => {
                        if (raw == null) return;
                        const idx = tr.findIndex((r: any) => r.label === label);
                        const entry = { label, value: String(raw), color: color || 'text-gray-600' };
                        if (idx >= 0) tr[idx] = entry; else tr.push(entry);
                      };
                      // Translate known Chinese values to English
                      const zhEn: Record<string, string> = {
                        '牛市排列': 'Bullish', '多头排列': 'Bullish', '空头排列': 'Bearish', '熊市排列': 'Bearish',
                        '多头': 'Bullish', '空头': 'Bearish', '震荡': 'Sideways', '盘整': 'Consolidating',
                        '上升趋势': 'Uptrend', '下降趋势': 'Downtrend', '横盘': 'Sideways',
                        '买入': 'Buy', '卖出': 'Sell', '持有': 'Hold', '观望': 'Wait',
                        '强烈买入': 'Strong Buy', '强烈卖出': 'Strong Sell',
                        '看涨': 'Bullish', '看跌': 'Bearish', '中性': 'Neutral',
                      };
                      const t = (v: string) => { if (!v) return v; for (const [zh, en] of Object.entries(zhEn)) { if (v.includes(zh)) return en; } return v; };
                      const trend = meta.technical.Trend ? t(meta.technical.Trend) : meta.technical.Trend;
                      const ma = meta.technical.MA_Alignment ? t(meta.technical.MA_Alignment) : meta.technical.MA_Alignment;
                      const signal = meta.technical.Signal ? t(meta.technical.Signal) : meta.technical.Signal;
                      const trendColor = (v: string) => v.includes('Up') || v.includes('Bull') ? 'text-emerald-600' : v.includes('Down') || v.includes('Bear') ? 'text-red-600' : 'text-amber-600';
                      set('Trend', trend, trend ? trendColor(trend) : undefined);
                      set('MA', ma, 'text-violet-600');
                      set('Signal', signal, signal === 'Buy' || signal === 'Strong Buy' ? 'text-emerald-600' : signal === 'Sell' || signal === 'Strong Sell' ? 'text-red-600' : 'text-gray-600');
                      analysisStages[1].result = tr;
                    }
                    if (meta.social) {
                      analysisStages[2].status = 'done';
                      const sr = analysisStages[2].result || [];
                      if (meta.social.results && Array.isArray(meta.social.results)) {
                        const count = meta.social.results.length;
                        const prov = meta.social.provider || 'Web';
                        const idx = sr.findIndex((r: any) => r.label === 'Sources');
                        const entry = { label: 'Sources', value: `${count} from ${prov}`, color: 'text-cyan-600' };
                        if (idx >= 0) sr[idx] = entry; else sr.push(entry);
                      }
                      (analysisStages[2] as any).result = sr;
                    }
                    emitter.emitModule('analysis', 'active', { stages: analysisStages });
                    // Forward stock quote card data to frontend
                    if (meta.quote && meta.quote.symbol && meta.quote.price != null) {
                      const q = meta.quote;
                      // Only show card if price is a real number (not "365 (analyst target)" etc.)
                      const numPrice = typeof q.price === 'number' ? q.price : parseFloat(String(q.price));
                      if (!isNaN(numPrice)) {
                      // Detect language from user's original message
                      const isZh = /[\u4e00-\u9fff]/.test(userContent);
                      const fmtVol = (v: number | null) => {
                        if (v == null) return undefined;
                        if (isZh) {
                          if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
                          if (v >= 1e4) return (v / 1e4).toFixed(1) + '万';
                        } else {
                          if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
                          if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
                          if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
                        }
                        return String(v);
                      };
                      const fmtMv = (v: number | null) => {
                        if (v == null) return undefined;
                        if (isZh) {
                          if (v >= 1e8) return (v / 1e8).toFixed(0) + '亿';
                          if (v >= 1e4) return (v / 1e4).toFixed(1) + '万';
                        } else {
                          if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
                          if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
                        }
                        return String(v);
                      };
                      // Detect market from symbol code, router tickers, and user query
                      const detectMarket = (sym: string) => {
                        if (!sym) return undefined;
                        // Check the symbol itself
                        if (/^\d{6}\.(SH|SZ|SS)$/i.test(sym) || /^(sh|sz)\d{6}$/i.test(sym) || /^[0-368]\d{5}$/.test(sym))
                          return isZh ? 'A股' : 'A-Share';
                        if (/\.HK$/i.test(sym) || /^\d{4,5}\.HK$/i.test(sym))
                          return isZh ? '港股' : 'HK';
                        if (/\.(US|NASDAQ|NYSE)$/i.test(sym))
                          return isZh ? '美股' : 'US';
                        // Check router tickers for market suffix (more reliable than agent's raw code)
                        const routerTickers = plan.capabilities.analysis.tickers || [];
                        for (const t of routerTickers) {
                          if (/\.(SH|SZ|SS)$/i.test(t)) return isZh ? 'A股' : 'A-Share';
                          if (/\.HK$/i.test(t)) return isZh ? '港股' : 'HK';
                          if (/\.(US|NASDAQ|NYSE)$/i.test(t)) return isZh ? '美股' : 'US';
                        }
                        // Check user query for market hints
                        const query = (userContent || '').toLowerCase();
                        if (/港股|hk\b|恒生|腾讯|美团|小米|阿里巴巴|京东|网易|百度/.test(query))
                          return isZh ? '港股' : 'HK';
                        if (/a\s*股|沪深|上证|深证|创业板|科创板|茅台|平安|招商/.test(query))
                          return isZh ? 'A股' : 'A-Share';
                        // Default: 1-5 uppercase letters = US
                        if (/^[A-Z]{1,5}$/.test(sym))
                          return isZh ? '美股' : 'US';
                        return undefined;
                      };
                      const quotePayload = {
                          symbol: q.symbol,
                          name: q.name || undefined,
                          market: detectMarket(q.symbol),
                          lang: isZh ? 'zh' : 'en',
                          price: numPrice.toFixed(2),
                          change: q.change_pct != null
                            ? (q.change_pct >= 0 ? '+' : '') + Number(q.change_pct).toFixed(2) + '%'
                            : undefined,
                          volume: fmtVol(q.volume),
                          amount: fmtVol(q.amount),
                          high: q.high != null ? Number(q.high).toFixed(2) : undefined,
                          low: q.low != null ? Number(q.low).toFixed(2) : undefined,
                          open: q.open != null ? Number(q.open).toFixed(2) : undefined,
                          prevClose: q.prev_close != null ? Number(q.prev_close).toFixed(2) : undefined,
                          marketCap: fmtMv(q.total_mv || q.circ_mv),
                          pe: q.pe != null ? Number(q.pe).toFixed(2) : undefined,
                          pb: q.pb != null ? Number(q.pb).toFixed(2) : undefined,
                          turnover: q.turnover != null ? Number(q.turnover).toFixed(2) + '%' : undefined,
                      };
                      savedQuoteCard = quotePayload;
                      // Validate: only emit the quote card if the stock name or symbol
                      // reasonably matches the user's query (prevent wrong-stock cards)
                      const queryLower = (userContent || '').toLowerCase();
                      const nameMatch = q.name && queryLower.includes(q.name.toLowerCase());
                      const symMatch = q.symbol && queryLower.includes(q.symbol.toLowerCase());
                      const tickerMatch = (plan.capabilities.analysis.tickers || []).some(
                        (t: string) => t.toLowerCase().replace(/\.\w+$/, '') === (q.symbol || '').toLowerCase()
                      );
                      if (nameMatch || symMatch || tickerMatch) {
                        emitToUser(userId, 'agent:chat:quote', {
                          sessionId,
                          quote: quotePayload,
                        });
                      }
                      } // end !isNaN(numPrice)
                    }
                  } catch (e) { }
                }
              },
              (report) => {
                analysisStages.forEach(s => { s.status = 'done'; });
                finalAnalysisStages = analysisStages;
                emitter.emitModule('analysis', 'completed', { stages: analysisStages });
                resolve({ type: 'ANALYSIS', data: report });
              },
              (error) => {
                analysisStages.forEach(s => { s.status = 'done'; });
                finalAnalysisStages = analysisStages;
                emitter.emitModule('analysis', 'completed', { stages: analysisStages });
                resolve({ type: 'ANALYSIS', data: 'Error: ' + error });
              }
            );
          })
        );
      }

      if (plan.capabilities.simulate.needed) {
        emitter.emitModule('simulation', 'active', { panelists: [{ name: 'Simulating...', status: 'active', verdict: 'Pending' }] });
        let tickers = plan.capabilities.simulate.tickers || [];
        if (!tickers.length) tickers = ['SPY', 'QQQ'];

        const GENERIC_ANALYST_KEYS = new Set(['technical_analyst', 'fundamentals_analyst', 'growth_analyst', 'news_sentiment_analyst', 'sentiment_analyst', 'valuation_analyst']);

        const analysisOptions: any = { tickers, showReasoning: true };
        if (plan.specificGurus?.length > 0) {
          analysisOptions.analysts = plan.specificGurus;
        }
        console.log(
          `[agent:chat:simulation] planned_requested=${analysisOptions.analysts?.join(',') || '(tool_default)'} tickers=${tickers.join(',')} sessionId=${sessionId}`,
        );

        promises.push(
          hedgefundService.runAnalysis(analysisOptions, () => {})
            .then(hfResult => {
              const toDisplayName = (name: string) => name.replace(/_agent$/i, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              const plannedAnalysts = (hfResult.analysts || []).map(toDisplayName);
              const producedAnalysts = Object.keys(hfResult.analyst_signals || {});
              const missingAnalysts = plannedAnalysts.filter((name) => !producedAnalysts.includes(name));
              const panelists = Object.keys(hfResult.analyst_signals || {}).map(p => ({
                name: p,
                avatar: 'L',
                status: 'done',
                verdict: Object.values(hfResult.analyst_signals[p] || {})[0]?.signal || 'Hold',
                confidence: Object.values(hfResult.analyst_signals[p] || {})[0]?.confidence || 0,
                group: GENERIC_ANALYST_KEYS.has(p) ? 'analyst' : 'guru'
              }));
              console.log(
                `[agent:chat:simulation] planned_effective=${plannedAnalysts.join(',') || '(none)'} produced=${producedAnalysts.join(',') || '(none)'} missing=${missingAnalysts.join(',') || '(none)'} sessionId=${sessionId}`,
              );
              console.log(
                `[agent:chat:simulation] frontend_panelists=${panelists.map((x) => x.name).join(',') || '(none)'} count=${panelists.length} sessionId=${sessionId}`,
              );
              finalPanelists = panelists;
              emitter.emitModule('simulation', 'completed', { panelists });
              const isGuruCouncil = plan.queryType === 'guru-council';
              const rep = hedgefundService.formatReport(hfResult, isGuruCouncil);
              return { type: 'SIMULATION', data: rep };
            })
            .catch(e => {
              emitter.emitModule('simulation', 'completed', { panelists: [] });
              return { type: 'SIMULATION', data: 'Error: ' + e.message };
            })
        );
      }

      console.log(
        `[agent:chat:timing] tool_dispatch_s=${asSeconds(Date.now() - toolDispatchStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId} tools=${promises.length}`,
      );

      const toolsWaitStartedAt = Date.now();
      const results = await Promise.allSettled(promises);
      console.log(
        `[agent:chat:timing] tools_parallel_wait_s=${asSeconds(Date.now() - toolsWaitStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId}`,
      );
      if (isAborted()) {
        console.log(`[agent:chat] Aborted after Promise.allSettled for session ${sessionId}`);
        activeChatSessions.delete(sessionId);
        finishChatReplayBuffer(sessionId);
        chatAbortControllers.delete(sessionId);
        return;
      }
      console.log('[agent:chat] Promise.allSettled completed:', results.map(r => r.status === 'fulfilled' ? `✅ ${r.value.type}` : `❌ ${(r as any).reason?.message}`).join(', '));
      
      const contextBuildStartedAt = Date.now();
      const synthHistory = formatHistory(sessionHistory, MAX_HISTORY_FOR_SYNTHESIS);
      let contextString = "";
      if (synthHistory) {
        contextString += "【CONVERSATION HISTORY — for continuity, do NOT repeat old findings】\n" + synthHistory + "\n\n";
      }
      contextString += "【User Original Request】\n" + userContent + "\n\n";
      if (plan.imageDigest) {
        contextString += `【IMAGE_DIGEST】\n${plan.imageDigest}\n\n`;
      }
      
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          contextString += `【${r.value.type} REPORT】\n${r.value.data}\n\n`;
        }
      });

      // Append structured source URLs so the report LLM can produce inline citations
      if (finalSocialSources.length > 0) {
        contextString += "【VERIFIED SOURCE URLs — CITE THESE INLINE】\n";
        contextString += "Copy-paste the markdown link after relevant claims. Each source MUST appear at least once in your report.\n";
        finalSocialSources.forEach((s, i) => {
          // Give the LLM ready-to-paste markdown links
          const displayName = s.domain.replace(/^www\./, '').replace(/\.\w+$/, '');
          const capitalName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
          contextString += `  ${i + 1}. Ready-to-paste: [${capitalName}](${s.url}) — "${s.title}"\n`;
        });
        contextString += "\n";
      }

      const isDeepResearch = data.mode === 'roundtable';

      const buildDeepResearchPrompt = (inputContext: string) => getGlobalTimeContext() + `You are a senior research director at a top-tier investment research firm.

Your task is to produce a professional-grade DEEP RESEARCH REPORT — the kind that institutional investors, fund managers, and sophisticated traders actually pay for and act on.

This is NOT a quick take or trader memo. This is a thorough, multi-dimensional research product that synthesizes all available evidence into a coherent investment thesis with rigorous supporting analysis.

=== INPUT ===
Topic: ${userContent}
${inputContext}

=== REPORT STRUCTURE ===

Report Title (MANDATORY)
- Format: # (single hash) for clear, professional framing
- Must convey the core thesis and asset/topic in one line
- Example: "# NVDA: AI Capex Cycle Peaks — Re-rating Risk Rising"
- Example: "# 英伟达深度研究：AI资本开支周期见顶，估值重评风险上升"

---

Research Overview (MANDATORY — NO HEADING, start directly)
A compact, high-density executive brief:
- **Verdict**: Bullish / Bearish / Neutral + Conviction Level (High/Medium/Low)
- **Core Thesis**: 2-3 sentences — What is the key insight the market is missing?
- **Key Catalysts**: Next 3-6 month triggers (with approximate dates if known)
- **Risk/Reward**: Quantified upside vs downside ratio

---

Methodology & Data Scope (MANDATORY) — Use ## heading
Brief statement of:
- What data sources were analyzed (news, social sentiment, on-chain/financial data, technical indicators)
- Time horizon of the analysis
- Any limitations or data gaps
- This builds credibility and helps the reader calibrate confidence

---

Core Analysis Modules (3-5 sections, DEEP)
Choose the most relevant modules from:

**A. Fundamental & Business Analysis**
- Revenue structure, growth drivers, segment-level breakdown
- Competitive positioning, moat analysis, TAM/SAM
- Management quality, capital allocation track record
- Key operating metrics and trends (not just latest quarter)

**B. Financial Deep-Dive**
- Multi-quarter/year financial trend analysis (margins, FCF, leverage)
- Balance sheet health, cash runway, debt maturity profile
- ROE/ROIC decomposition, working capital efficiency
- Quality of earnings assessment

**C. Valuation Framework**
- Multiple valuation approaches (relative + absolute if possible)
- Historical valuation range context
- Peer comparison table with key multiples
- Sensitivity analysis on key assumptions
- Analyst consensus vs your view

**D. Technical & Flow Analysis**
- Multi-timeframe price structure (daily/weekly)
- Key support/resistance levels with volume confirmation
- Institutional flow data, smart money positioning
- Options flow / derivatives positioning if relevant
- Trend strength and momentum indicators

**E. Sentiment & Narrative Analysis**
- Social media sentiment trends and shifts
- KOL/influencer positioning changes
- News flow analysis — what's priced in vs what's not
- Retail vs institutional sentiment divergence

**F. Macro & Thematic Context**
- Sector rotation dynamics
- Policy and regulatory environment
- Supply chain / industry cycle positioning
- Cross-market correlations and contagion risks

**G. Catalyst Calendar**
- Time-ordered list of upcoming events
- Expected impact and probability assessment
- Pre-positioning recommendations for each catalyst

Guidelines for modules:
- Each module MUST contain original analysis, not data recitation
- Use tables for comparative data (peer comps, financial trends, scenario modeling)
- Include specific numbers: growth rates, margins, multiples, price levels
- Cross-reference between modules — show how fundamental changes map to technical levels
- Challenge consensus view — identify where market pricing diverges from evidence

---

Risk Matrix (MANDATORY) — Use ## heading
Professional risk assessment table:

| Risk Factor | Probability | Impact | Mitigation / Monitor |
|-------------|------------|--------|---------------------|
| [specific risk] | High/Med/Low | [quantified if possible] | [what to watch] |

Include minimum 4 risks across different categories (fundamental, technical, macro, sentiment).

---

Scenario Analysis (MANDATORY) — Use ## heading
Expanded scenario modeling with more granularity than a simple bull/base/bear:

| Scenario | Probability | Price Target | Timeline | Key Assumption | Trigger to Confirm |
|----------|------------|-------------|----------|----------------|-------------------|
| Aggressive Bull | ~% | $X | Xm | [assumption] | [observable trigger] |
| Base Bull | ~% | $X | Xm | [assumption] | [observable trigger] |
| Neutral | ~% | $X | Xm | [assumption] | [observable trigger] |
| Bear | ~% | $X | Xm | [assumption] | [observable trigger] |
| Tail Risk | ~% | $X | Xm | [assumption] | [observable trigger] |

---

Expert Debate Analysis (MANDATORY when expert debate data is provided) — Use ## heading
This section is the SIGNATURE of this report — it showcases the multi-expert roundtable process.

Structure:
**a) Key Debate Points** — What did the experts focus on? What angles did each expert bring?
  - Summarize each expert's core viewpoint in 1-2 sentences with their confidence level
  - Use a table format:
  | Expert | Core View | Confidence | Key Argument |
  |--------|-----------|------------|-------------|
  | [name] | Bullish/Bearish/Neutral | X% | [1-line argument] |

**b) Points of Agreement** — Where did experts converge? What does consensus tell us?
  - List 2-3 points where most experts agreed, and explain why this convergence strengthens conviction

**c) Points of Contention** — Where did experts DISAGREE? This is the most valuable part.
  - List 2-4 specific disagreements between experts
  - For each: which experts, what they disagreed on, what data would resolve it
  - Format: "FA vs QT on [topic]: FA argues [X], QT counters [Y]. Resolution: watch [metric]"

**d) Synthesis Verdict** — How the debate shaped the final thesis
  - Did the debate change the initial analysis? If so, how?
  - What new insights emerged from the multi-perspective review?
  - Final confidence level after incorporating expert debate

If no expert debate data is provided, SKIP this section entirely.

---

Actionable Strategy (MANDATORY) — Use ## heading
Concrete implementation plan:
- **Position sizing**: % of portfolio, scaling plan
- **Entry strategy**: Specific levels, order types, timing
- **Stop loss**: Hard stop + mental stop levels with logic
- **Take profit**: Staged exits with rationale
- **Hedging**: Options overlay or pair trade recommendations if applicable
- **Timeline**: Hold period expectation
- **Review triggers**: What would make you reassess (both positive and negative)

---

Key Monitoring Dashboard (THIS MUST BE THE VERY LAST SECTION)
- Translate heading to user's language (e.g. "关键监控指标")
- 5-8 specific, quantifiable metrics/events to track going forward
- Each item: what to monitor, current value → threshold that changes thesis, frequency of check
- Format as a structured list with bold metric names

═══ ABSOLUTE RULES ═══
1. HEADING LEVELS: # for report title. ## for section headings. **Bold** for subsections within. No ### or ####. NEVER prefix headings with numbers like "1.", "2.", "3." — the frontend auto-generates numbering.
2. Section titles MUST be specific and analytical — not generic. Create proper research section titles (e.g. "收入放缓与利润弹性的博弈", "估值锚定：DCF vs 可比公司的分歧").
3. Synthesize evidence across ALL data sources. Highlight where different data dimensions agree (conviction) and where they conflict (uncertainty).
4. Never fabricate data. If exact numbers aren't available, state the directional finding and name the missing metric.
5. END-OF-PARAGRAPH CITATIONS: After a paragraph or sentence with key claims/data, place citation tags at the END of that paragraph or line, never in the middle of a sentence. Format: [Source Name](url). If multiple sources support the same paragraph, group them together at the paragraph end like: [Bloomberg](...) [Reuters](...). Do NOT place citation tags between words. Do NOT list source URLs in a separate references section. NEVER wrap citations in parentheses or add words like "数据"/"来源".
6. LANGUAGE CONSISTENCY (CRITICAL): If user wrote in Chinese, ENTIRE output in Chinese — all headings, labels, table headers, body text, metrics. No English mixed in. Vice versa for English. Non-negotiable.
7. Length: 3000-6000 words. This is a deep research product — completeness and depth are expected. But every sentence must add analytical value. No filler.
8. End with "Key Monitoring Dashboard" — this MUST be the absolute last section. Nothing after it.
12. EXPERT DEBATE: If the input contains expert debate data, the "Expert Debate Analysis" section is MANDATORY and should be one of the most detailed sections. This is the unique value of this report.
9. QUANTITATIVE DENSITY: The report should feel data-rich. Include specific numbers wherever possible. Tables are encouraged for comparative data.
10. SECTION FLEXIBILITY: For non-stock topics (macro, crypto, general), adapt modules naturally. Skip stock-specific modules. Focus on what matters for the topic.
11. CROSS-REFERENCING: Explicitly connect insights across sections. "The deteriorating margin trend (Section 3B) supports the bearish technical breakdown below $X (Section 3D)" style references add analytical rigor.

═══ STYLE RULES ═══
- Authoritative but evidence-based. Present findings with conviction backed by data.
- Professional research tone — not academic, not casual. Think Goldman Sachs equity research meets hedge fund strategy note.
- Use precise language: "15% probability of…" not "unlikely". "Support at $142 with 2.3M share volume cluster" not "there's support nearby".
- Tables and data visualization take priority over prose when data supports it.
- Each section should build the thesis progressively — the report should read as one coherent argument, not disconnected modules.

═══ INTERNAL (DO NOT OUTPUT) ═══
Before writing, build your internal thesis:
1. Clear directional stance + conviction level
2. The key variable the market is mispricing
3. 3 specific numbers that anchor your thesis
4. The one thing that would make you wrong
Do NOT output this reasoning. Begin the report directly.
`;

      const traderMemoPrompt = getGlobalTimeContext() + `You are a top-tier macro + equity research analyst with strong opinions.

Your job is NOT to summarize information.
Your job is to form a clear, tradeable view and guide decision-making — grounded in rigorous fundamental, valuation, financial, and technical analysis.

Write like a sharp internal memo or trader note — not a formal report.

=== INPUT ===
Topic: ${userContent}
Context:
${contextString}

=== OUTPUT STRUCTURE ===

Title (OPTIONAL, HIGH-SIGNAL)
- Only include a title if it helps someone decide what to do.
- Format: use # (single hash) for the title — visually larger than ## section headings. Do NOT use ##, ###, or ####.

If you include a title, it MUST:
- Reflect the core trade or decision
- Anchor on ONE key variable (not abstract themes)
- Be consistent with the Executive Snapshot Bias and Action

Good titles: highlight one key driver, challenge a specific market assumption, or define a conditional trade (e.g. "TSLA: Short Until $280 Breaks")
Avoid: abstract phrases ("paradox", "battle", "era"), generic contrasts ("growth vs valuation"), patterns like "not X, but Y"

If not included: start directly with Quote Snapshot or the Executive Snapshot (no heading).

---

0.5. Quote Snapshot (MANDATORY when analyzing a specific stock/asset)
- If the analysis involves a specific ticker, output a structured quote block BEFORE the TL;DR.
- Use the heading "## Quote Snapshot" (English) or "## 标的信息" (Chinese, following language rule).
- Format as a bullet list with bold keys. Include ONLY data available in the raw reports — do NOT fabricate numbers.
- Required fields (use whatever is available):
  - **Symbol**: TICKER
  - **Name**: Company name
  - **Last Price**: current price from the raw report
  - **Change (%)**: percentage change if available
  - **Volume**: trading volume if available
- Chinese equivalents: **证券代码**, **股票名称**, **最新价**, **涨跌幅**, **成交量**
- If no specific price data is available in the raw reports, SKIP this section entirely.

---

Executive Snapshot (MANDATORY — NO HEADING AT ALL)
- NEVER output a heading like "TL;DR", "Summary", "结论", "总结", "Executive Summary", or any variant. Start the content directly without any heading.
- First, a compact snapshot:
  Bias / Action / Confidence / Key Trigger (one line each)
- Then 2-3 sentences maximum:
  What's happening now? What is the market getting wrong? What's my unique edge?
- If writing in Chinese, translate ALL labels to Chinese. No English mixed in.

---

Deep-Dive Sections (2-4 sections, FLEXIBLE)
Pick 2-4 angles that matter MOST for this specific topic. Each section gets its own vivid, specific ## heading. Do NOT use generic titles — create headlines a reader would actually click.

Choose from (but don't feel obligated to cover all):
- **Business & Fundamentals**: revenue structure, growth drivers, segment breakdown, competitive moat, management quality
- **Valuation**: PE/PS/PEG vs peers and history, analyst targets, implied upside/downside. Use tables when data supports it
- **Financial Quality**: margins, cash flow, balance sheet, ROE — focus on inflection points and trends, not encyclopedic coverage
- **Technical & Flow**: price action, support/resistance, moving averages, fund flows, short interest, institutional positioning
- **Macro / Thematic**: sector rotation, policy tailwinds/headwinds, supply chain dynamics — when relevant
- **Catalyst Calendar**: upcoming earnings, product launches, regulatory decisions — time-sensitive events

Guidelines:
- Each section should have a POINT OF VIEW, not just describe data. "Revenue grew 15%" is description. "Ad revenue is masking a gaming collapse" is analysis.
- Use narrative paragraphs with tables where data supports it. NOT bullet-point dumps.
- If exact numbers aren't in the raw data, discuss qualitatively without fabricating.
- Cover fundamental + valuation + technical dimensions across your chosen sections. Don't skip all quantitative angles.

---

Signal vs Noise (MANDATORY) — Table format with your own creative ## heading:

| Noise (over-weighted by market) | Signal (under-weighted by market) |
|-------------------------------|----------------------------------|
| [thing + why it's noise] | [thing + why it matters] |

Positioning (MANDATORY) — Use your own creative ## heading.
Concrete: entry level, stop loss, target, position sizing logic. What to do NOW vs what to wait for. If no clear trade, say "wait for [specific catalyst]."

Stress Test (MANDATORY) — Use your own creative ## heading. NOT a disclaimer. Model 2-3 scenarios with probability and price impact:

| Scenario | Probability | Price Impact | Key Assumption |
|----------|------------|-------------|----------------|
| Bull | ~% | $X → $Y | [assumption] |
| Base | ~% | $X → $Y | [assumption] |
| Bear | ~% | $X → $Y | [assumption] |

Identify the floor price under panic conditions.

---

Tags (translate to user's language)
- Importance: High / Medium / Low · Categories: 2-3 tags

Questions to watch (THIS MUST BE THE VERY LAST SECTION — nothing after it)
- Translate heading to user's language (e.g. "值得关注的问题：")
- Format as **bold heading** followed by 3-5 bullet points
- Each bullet: ONE standalone question only — a single interrogative sentence ending with ? (English) or ？ (Chinese). Embed the metric or time horizon inside the question wording if needed.
- Do NOT add answers, explanations, "If… then…" clauses, second sentences, or any text after the question mark.
- Do NOT put markdown links, bare URLs, or [Source](url) in this section (no citations here).
- CRITICAL: No text, tags, or sections may appear after this list

═══ ABSOLUTE RULES ═══
1. HEADING LEVELS: # for report title only. ## for all section headings. No ### or ####. Use **bold** for subsections and key terms throughout the text. NEVER prefix headings with numbers like "1.", "2.", "3." — the frontend auto-generates numbering.
2. Section titles MUST be unique and topic-specific. NEVER use generic titles like "Fundamental Analysis", "Valuation", "Financial Health", "Signal vs Noise", "Positioning", "Stress Test" etc. — these are internal labels, not output headings. Create engaging, specific headings (e.g. "广告引擎点火，但游戏拖了后腿", "23倍PE：贵还是便宜？", "多空交锋：谁在买？谁在跑？").
3. Synthesize, do not concatenate. Surface agreements, contradictions, and emergent insights across agents.
4. Never fabricate data. Only use information present in the raw reports. If a quantitative threshold is useful but not in the data, name the metric and explain its importance without inventing numbers.
5. END-OF-PARAGRAPH CITATIONS: After a paragraph or sentence with key claims/data, place citation tags at the END of that paragraph or line, never in the middle of a sentence. Format: [Source Name](url). If multiple sources support the same paragraph, group them together at the paragraph end like: [Bloomberg](...) [Reuters](...). Do NOT place citation tags between words. Do NOT list source URLs in a separate references section. NEVER wrap citations in parentheses or add words like "数据"/"来源".
6. LANGUAGE CONSISTENCY (CRITICAL): If user wrote in Chinese, ENTIRE output in Chinese — all headings, labels, table headers, body text. No English mixed in. Vice versa for English. Non-negotiable.
7. Length: 1500-3500 words. Depth over brevity, but no padding. Every sentence must earn its place. Cover ALL analysis dimensions — fundamental, valuation, financial, technical, and actionable trade setup.
8. End with "Questions to watch" — 3-5 forward-looking questions with specific data triggers; each bullet question-only (one sentence, ? or ？), no follow-on prose and no links.
9. REDUCE qualitative statements, INCREASE quantitative data. "Margins are important" is worthless. "Margin below 72% = thesis broken" is actionable.
10. SECTION FLEXIBILITY: For non-stock topics (macro, crypto, general questions), adapt sections naturally — skip stock-specific sections like Quote Snapshot, Valuation, Financial Health. Focus on sections that fit the topic.

═══ STYLE RULES ═══
- Be opinionated, not neutral. Use "My take:" for direct assessments.
- No fluff, no textbook tone. Write like a trader thinking out loud.
- Short, punchy paragraphs. Each section adds NEW insight (no repetition).
- Do NOT just summarize news. Do NOT hedge excessively. Do NOT default to "it depends".
- MUST produce clear Bias + Action. MUST include Signal vs Noise table. MUST include Positioning with levels. MUST include Stress Test scenarios. Deep-dive sections are flexible — pick the angles that matter most.

═══ INTERNAL (DO NOT OUTPUT) ═══
Before writing, internally decide:
- A clear stance (bullish / bearish / neutral)
- The specific variable the market is mispricing
- Whether a title is necessary
- The quantitative thresholds that would flip your thesis

Do NOT reveal this reasoning. Begin writing directly.
`;

      // ─── Research Report Prompt ───
      const researchPrompt = `You are a senior research analyst at a top-tier consulting firm (McKinsey / Bain / BCG caliber).

Your job is NOT to summarize search results. Your job is to synthesize information into a structured, insightful research report that helps decision-makers understand a topic deeply.

Write like an internal research brief — clear, structured, data-driven, with strong conclusions.

=== INPUT ===
Topic: ${userContent}
Context:
${contextString}

=== OUTPUT STRUCTURE ===

Title
- Use # (single hash). Reflect the core research question or finding.
- Good: "东南亚外卖市场：Grab 与 GoTo 的补贴战谁能赢？"
- Avoid: generic titles like "市场研究报告"

Executive Summary (NO ## HEADING, NO numbering — start the summary text directly after the title)
- 3-5 sentences. Core findings + key conclusion. What should the reader take away?

Analysis Sections (3-5 sections, each with a ## heading)
Pick sections that best fit the topic. Each gets a vivid, specific ## heading.
Choose from:
- **Market Overview**: market size, growth rate, key trends, geographic breakdown
- **Competitive Landscape**: key players, market share, positioning, moat analysis
- **Technology & Product**: tech stack, product comparison, feature matrix, architecture
- **Business Model**: revenue model, unit economics, pricing, cost structure
- **Team & Organization**: founding team, key hires, org structure, culture
- **Funding & Financials**: funding history, valuation, revenue, burn rate, runway
- **Supply Chain / Industry Structure**: upstream/downstream, dependencies, bottlenecks
- **Regulatory & Macro**: policy environment, regulatory risks, macro factors

Guidelines:
- Each section must have a POINT OF VIEW. "Revenue grew 15%" is data. "Revenue growth is decelerating because of market saturation" is insight.
- Use tables and comparison matrices where data supports it.
- Cite sources with inline Markdown links when available.
- Do NOT fabricate data. If specific numbers aren't available, discuss qualitatively.

Key Findings — Summary table or bullet list of the most important discoveries.

Risks & Challenges — What could go wrong? What are the unknowns?

Conclusion & Recommendations — Clear, actionable takeaways. What should the reader do with this information?

Questions to Watch (LAST SECTION)
- 3-5 forward-looking questions with specific triggers or data points to monitor.
- Each bullet: one question sentence only (? or ？). No explanations, answers, or markdown links/URLs in this section.

═══ ABSOLUTE RULES ═══
1. HEADING LEVELS: # for title only. ## for sections. Use **bold** for subsections and key terms, figures, and conclusions throughout the text. NEVER prefix headings with numbers like "1.", "2.", "3." — the frontend auto-generates numbering in the Table of Contents.
2. Section titles MUST be specific and engaging, not generic labels.
3. Synthesize across sources. Surface contradictions and emergent patterns.
4. Never fabricate data. Use qualitative discussion when numbers are unavailable.
5. END-OF-PARAGRAPH CITATIONS: After a paragraph or sentence with key claims/data, place citation tags at the END of that paragraph or line, never in the middle of a sentence. Format: [Source Name](url). If multiple sources support the same paragraph, group them together at the paragraph end.
6. LANGUAGE: Match user's language entirely. Chinese query = all Chinese. English = all English.
7. Length: 1500-3000 words. Depth over breadth.
8. Tables for comparisons, bullet lists for key points, narrative for analysis.
`;

      // ─── Market Brief Prompt ───
      const marketBriefPrompt = `You are a senior market strategist writing a concise daily market briefing.

Your job is to deliver a fast, scannable overview of what happened in the market — not deep analysis. Think: morning market email that a trader reads in 2 minutes.

=== INPUT ===
Topic: ${userContent}
Context:
${contextString}

=== OUTPUT STRUCTURE ===

# [Market/Sector] Brief — [Date or Context]

## Market Overview
- Major index movements (S&P 500, Nasdaq, Dow, or relevant regional indices)
- Overall sentiment: risk-on / risk-off / mixed
- Key numbers in a compact table:

| Index | Price | Change | % |
|-------|-------|--------|---|

## Top Movers
- Top 5 gainers and losers (sectors or individual names)
- Brief reason for each major move (1 sentence max)

## Key Catalysts
- 2-4 bullet points: the events driving today's market action
- Each bullet: what happened + market reaction

## Earnings / Events Calendar
- Notable earnings released today + market reaction (beat/miss, stock move)
- Upcoming events in next 1-3 days

## Tomorrow's Watch
- 3-5 items to watch: upcoming data releases, earnings, events, technical levels

═══ RULES ═══
1. LANGUAGE: Match user's language entirely.
2. Be CONCISE. No fluff. Every sentence earns its place.
3. Use tables for data, bullets for events. Minimal narrative paragraphs.
4. Cite sources with inline links when available.
5. Never fabricate data. If specific numbers aren't in the context, say "data pending" or skip.
6. Length: 500-1200 words. This is a brief, not a report.
7. Focus on "what happened" and "what's next", not "deep analysis".
`;

      // ─── Guru Council Prompt ───
      const guruCouncilPrompt = `You are moderating a roundtable of legendary investors analyzing a specific asset or market question.

Your job is to present each guru's perspective through their known investment framework, then synthesize a consensus recommendation. This is NOT a generic summary — each guru must speak in character with their known methodology.

IMPORTANT: The raw simulation data below contains only short signal summaries (1-2 sentences per analyst). Your job is to EXPAND each guru's view into a full analysis paragraph by applying their well-known investment framework to the available data. Use the signal direction (bullish/bearish/neutral) and confidence as anchors, then reason through HOW that guru would arrive at that conclusion based on their published methodology.

=== INPUT ===
Topic: ${userContent}
Context:
${contextString}

=== OUTPUT STRUCTURE ===

# [Asset/Topic]: Guru Council Roundtable

## Asset Overview
- Asset name, ticker, current price (if available from context)
- Brief context: what makes this worth analyzing now (use search data if available)

## Guru Perspectives

For each guru in the simulation data, create a detailed subsection. If the user named specific gurus, prioritize those. Otherwise use all gurus from the simulation results.

**[Guru Name]**

- **Investment Framework**: 2-3 sentences explaining their known methodology (e.g., Buffett = circle of competence + economic moat + margin of safety; Lynch = PEG ratio + growth categories; Dalio = All Weather + macro cycles)
- **Analysis**: 4-8 sentences. This is the core — apply their specific framework to this asset using ALL available data (fundamental metrics, search results, technicals, news). Reference specific numbers when available. Explain WHY this guru would reach their signal conclusion.
- **Signal**: 🟢 Bullish / 🔴 Bearish / 🟡 Neutral (match the simulation data)
- **Conviction**: X% (match the simulation data)

## Key Disagreements
- Where do the gurus disagree? What's the core tension?
- 3-4 bullet points highlighting specific debates with data backing

## Consensus Decision
- Weighted consensus: summarize the majority view
- Recommended action with confidence level
- Key conditions or price levels that would change the recommendation

## Risk Factors
- 3-5 risk factors the gurus collectively flag
- What scenario would make them ALL wrong?

## Questions to Watch
- 3-5 forward-looking questions with specific data triggers and time horizons
- Each line: one interrogative sentence only; no answers or citations (no [Name](url), no URLs) in this section

═══ RULES ═══
1. Each guru MUST use their actual known framework — not generic "analysis". Buffett talks about moats and margin of safety. Lynch talks about PEG and growth categories. Burry talks about asymmetric bets and overlooked data.
2. EXPAND the short simulation signals into full analysis paragraphs. The raw data is just direction — you provide the reasoning depth.
3. LANGUAGE: Match user's language entirely. Chinese query = all Chinese.
4. Use actual data from context. Integrate search results + simulation signals + any financial data.
5. Gurus can and should DISAGREE. Don't force consensus where data doesn't support it.
6. END-OF-PARAGRAPH CITATIONS: After a paragraph or sentence with key claims/data, place citation tags at the END of that paragraph or line, never in the middle of a sentence. Format: [Source Name](url). If multiple sources support the same paragraph, group them together at the paragraph end like: [Bloomberg](...) [Reuters](...). Do NOT place citation tags between words. Do NOT list source URLs separately at the end. NEVER wrap citations in parentheses or add words like "数据"/"来源".
7. Length: 2000-4000 words. Each guru section should be substantial (150-300 words).
8. # for title, ## for sections, **bold** for guru names and subsections. Use markdown formatting generously: **bold** for emphasis, key numbers, and important terms. NEVER prefix headings with numbers like "1.", "2.", "3.".
`;

      // ─── Guru Council HTML Template ───
      const buildGuruCouncilHtmlPrompt = (inputContext: string) => `You are a world-class frontend designer creating a visual report for a Guru Council (multi-investor roundtable) analysis.

Your task is to produce a SELF-CONTAINED HTML document that presents each guru's analysis in a visually compelling way. Think: investor presentation deck meets Apple design.

=== INPUT ===
Topic: ${userContent}
${inputContext}

=== OUTPUT FORMAT ===
Output a COMPLETE, self-contained HTML document. Do NOT use markdown. Output raw HTML only — no \`\`\`html fences, no explanatory text.

The HTML must:
1. Be a single <div class="report-wrap"> with embedded <style> and optional <script> tags
2. Use CSS custom properties for theming (inherit from parent: --color-text-primary, --color-text-secondary, --color-text-tertiary, --color-background-secondary, --color-border-tertiary, --border-radius-md, --border-radius-lg, --font-sans)
3. Be mobile-responsive

=== DESIGN SYSTEM ===
<style>
  .report-wrap { max-width: 880px; margin: 0 auto; padding: 2rem 1rem 1rem; font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); }
  
  .report-header { border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); padding-bottom: 1.5rem; margin-bottom: 2rem; }
  .report-label { font-size: 11px; letter-spacing: 0.12em; color: var(--color-text-tertiary, #999); text-transform: uppercase; margin-bottom: 0.5rem; }
  .report-title { font-size: 22px; font-weight: 500; color: var(--color-text-primary, #1a1a1a); line-height: 1.4; margin-bottom: 1rem; }
  .report-verdict { display: inline-flex; align-items: center; gap: 8px; background: var(--color-background-secondary, #f5f5f5); border: 0.5px solid var(--color-border-tertiary, #e5e5e5); border-radius: 8px; padding: 6px 14px; font-size: 13px; }
  .verdict-dot { width: 8px; height: 8px; border-radius: 50%; }

  .section { margin-bottom: 2rem; }
  .section-title { font-size: 13px; font-weight: 500; color: var(--color-text-secondary, #666); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 1rem; padding-bottom: 6px; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); }

  /* Guru cards */
  .guru-grid { display: flex; flex-direction: column; gap: 16px; margin-bottom: 2rem; }
  .guru-card { position: relative; border: 0.5px solid var(--color-border-tertiary, #e5e5e5); border-radius: 12px; padding: 20px; }
  .guru-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding-right: 80px; }
  .guru-avatar { width: 48px; height: 48px; border-radius: 50%; background: #1a1a1a; border: 2px solid #1a1a1a; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: #fff; letter-spacing: -0.02em; flex-shrink: 0; overflow: hidden; }
  .guru-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .guru-name { font-size: 15px; font-weight: 500; color: var(--color-text-primary, #1a1a1a); }
  .guru-framework { font-size: 12px; color: var(--color-text-tertiary, #999); }
  .guru-signal { position: absolute; top: 16px; right: 16px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .signal-bullish { background: #DCFCE7; color: #166534; }
  .signal-bearish { background: #FEE2E2; color: #991B1B; }
  .signal-neutral { background: #FEF3C7; color: #92400E; }
  .guru-analysis { font-size: 13px; line-height: 1.7; color: var(--color-text-primary, #1a1a1a); margin-bottom: 12px; }
  .guru-footer { display: flex; align-items: center; gap: 16px; font-size: 12px; color: var(--color-text-tertiary, #999); }
  .conf-bar { width: 100px; height: 6px; background: var(--color-background-secondary, #f5f5f5); border-radius: 3px; overflow: hidden; }
  .conf-fill { height: 100%; border-radius: 3px; }

  /* Consensus panel */
  .consensus-panel { background: var(--color-background-secondary, #f5f5f5); border-radius: 12px; padding: 20px; margin-bottom: 2rem; }
  .consensus-verdict { font-size: 18px; font-weight: 500; margin-bottom: 8px; }
  .consensus-detail { font-size: 13px; line-height: 1.7; color: var(--color-text-secondary, #666); }

  /* Comparison matrix */
  .cmp-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 2rem; }
  .cmp-table th { font-size: 11px; font-weight: 500; color: var(--color-text-tertiary, #999); text-align: center; padding: 8px; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); }
  .cmp-table th:first-child { text-align: left; }
  .cmp-table td { padding: 10px 8px; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); text-align: center; }
  .cmp-table td:first-child { text-align: left; font-weight: 500; }

  /* Debate section */
  .debate-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); }
  .debate-item:last-child { border-bottom: none; }
  .debate-label { font-size: 11px; font-weight: 500; color: #185FA5; background: #E6F1FB; padding: 2px 8px; border-radius: 8px; white-space: nowrap; height: fit-content; }
  .debate-text { font-size: 13px; line-height: 1.6; color: var(--color-text-primary, #1a1a1a); }

  /* Summary stats hero */
  .stats-hero { display: flex; gap: 24px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid rgba(0,0,0,0.06); border-radius: 16px; padding: 28px; margin-bottom: 2rem; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
  .stats-gauge { flex: 0 0 140px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .gauge-ring { position: relative; width: 110px; height: 110px; }
  .gauge-ring svg { width: 110px; height: 110px; transform: rotate(-90deg); }
  .gauge-ring circle { fill: none; stroke-width: 7; stroke-linecap: round; }
  .gauge-track { stroke: #e2e8f0; }
  .gauge-value { transition: stroke-dashoffset .6s ease; filter: drop-shadow(0 0 4px rgba(0,0,0,0.08)); }
  .gauge-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .gauge-pct { font-size: 22px; font-weight: 700; color: var(--color-text-primary, #0f172a); line-height: 1; letter-spacing: -0.02em; }
  .gauge-label { font-size: 10px; color: #94a3b8; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500; }
  .stats-breakdown { flex: 1; display: flex; flex-direction: column; gap: 12px; }
  .stat-row { display: flex; align-items: center; gap: 10px; }
  .stat-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .stat-dot-bullish { background: #10b981; }
  .stat-dot-bearish { background: #f43f5e; }
  .stat-dot-neutral { background: #f59e0b; }
  .stat-name { font-size: 13px; font-weight: 600; color: var(--color-text-primary, #1e293b); min-width: 60px; }
  .stat-bar-wrap { flex: 1; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
  .stat-bar { height: 100%; border-radius: 3px; transition: width .5s ease; }
  .stat-bar-bullish { background: linear-gradient(90deg, #10b981, #34d399); }
  .stat-bar-bearish { background: linear-gradient(90deg, #f43f5e, #fb7185); }
  .stat-bar-neutral { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
  .stat-count { font-size: 13px; font-weight: 600; color: #64748b; min-width: 28px; text-align: right; }

  /* Risk items */
  .risk-list { display: flex; flex-direction: column; gap: 8px; }
  .risk-item { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; line-height: 1.6; }
  .risk-dot { min-width: 6px; height: 6px; border-radius: 50%; background: #E24B4A; margin-top: 7px; }

  .report-wrap ul, .report-wrap ol { padding-left: 1.2em; margin: 0.5rem 0; }
  .report-wrap li { font-size: 13px; line-height: 1.7; color: var(--color-text-primary, #1a1a1a); margin-bottom: 4px; text-align: left; }

  @media (max-width: 600px) {
    .stats-hero { flex-direction: column; align-items: stretch; }
    .stats-gauge { flex: 0 0 auto; }
    .guru-head { flex-wrap: wrap; }
    .cmp-table { font-size: 12px; }
  }
</style>

=== REPORT STRUCTURE ===
1. Report Header: label "GURU COUNCIL REPORT", title, consensus verdict badge
2. Summary Stats Hero (.stats-hero) — COPY THIS EXACT HTML STRUCTURE (fill in real values):

<div class="stats-hero">
  <div class="stats-gauge">
    <div class="gauge-ring">
      <svg viewBox="0 0 120 120">
        <circle class="gauge-track" cx="60" cy="60" r="46" stroke-dasharray="289" stroke-dashoffset="0"></circle>
        <circle class="gauge-value" cx="60" cy="60" r="46" stroke="#22C55E" stroke-dasharray="289" stroke-dashoffset="CALC_OFFSET"></circle>
      </svg>
      <div class="gauge-center">
        <span class="gauge-pct">XX%</span>
        <span class="gauge-label">Conviction</span>
      </div>
    </div>
  </div>
  <div class="stats-breakdown">
    <div class="stat-row"><span class="stat-dot stat-dot-bullish"></span><span class="stat-name">Bullish</span><div class="stat-bar-wrap"><div class="stat-bar stat-bar-bullish" style="width:XX%"></div></div><span class="stat-count">N</span></div>
    <div class="stat-row"><span class="stat-dot stat-dot-neutral"></span><span class="stat-name">Neutral</span><div class="stat-bar-wrap"><div class="stat-bar stat-bar-neutral" style="width:XX%"></div></div><span class="stat-count">N</span></div>
    <div class="stat-row"><span class="stat-dot stat-dot-bearish"></span><span class="stat-name">Bearish</span><div class="stat-bar-wrap"><div class="stat-bar stat-bar-bearish" style="width:XX%"></div></div><span class="stat-count">N</span></div>
  </div>
</div>

   CALC_OFFSET formula: offset = 289 * (1 - conviction_pct / 100). Example: 70% conviction → offset = 289 * 0.3 = 86.7. Choose stroke color by majority signal: #10b981 (bullish), #f43f5e (bearish), #f59e0b (neutral).
3. Guru Cards: one card per guru (.guru-card) with photo avatar, name, framework, analysis paragraph, conviction bar. The signal badge (.guru-signal) is positioned at the TOP-RIGHT corner of the card via CSS absolute positioning — just add it as a direct child of .guru-card. For the avatar, use: <div class="guru-avatar"><img src="/avatars/GURU_KEY.jpg" alt="Name"></div> where GURU_KEY is one of: warren_buffett, ben_graham, peter_lynch, charlie_munger, aswath_damodaran, cathie_wood, michael_burry, stanley_druckenmiller, nassim_taleb, bill_ackman, phil_fisher, mohnish_pabrai, rakesh_jhunjhunwala. If the guru is not in the list, use <div class="guru-avatar">XX</div> with initials instead.
4. Comparison Matrix: table showing all gurus × key dimensions (Signal, Conviction, Key Argument) — use .cmp-table
5. Debate Points: key disagreements between gurus (.debate-item)
6. Consensus Panel: weighted consensus, recommended action (.consensus-panel)
7. Risks: collective risk factors (.risk-list)
8. The report ENDS here after Risks. Do NOT add a Related Questions section — the frontend renders that separately.

=== CRITICAL RULES ===
1. Output ONLY the HTML starting with <style> and <div class="report-wrap">. NO preamble text, NO code fences (\`\`\`), NO explanatory sentences before or after the HTML.
2. Use REAL data from the input. Never fabricate.
3. LANGUAGE: Match the user's language.
4. Colors: green (#166534/#10b981) for bullish, red (#991B1B/#f43f5e) for bearish, amber (#92400E/#f59e0b) for neutral, blue (#378ADD/#185FA5) for info.
5. Each guru card must show their actual signal and reasoning — NOT generic placeholders.
6. Keep the design minimal, data-dense, professional.
7. The HTML must work standalone. No external JS libraries needed — use pure CSS + inline SVG for the gauge.
8. The Summary Stats Hero is MANDATORY — always render it as section 2 right after the header.
9. Do NOT use markdown syntax (**bold**, *italic*, -- dashes) anywhere inside the HTML content. All text must be plain HTML. Use <strong> instead of **, <em> instead of *, <ul>/<li> instead of dashes.
10. For the SVG gauge: both circles MUST have r="46", cx="60", cy="60". The circumference is 289. Calculate stroke-dashoffset exactly.
11. The report ends after the Risks section. No "Data Sources" footnote, no Related Questions, no horizontal rules, no extra text after the last </div>.
12. Section titles and headings must be plain text inside HTML tags. Never wrap titles in ** asterisks.
`;

      const buildWebReportPrompt = (inputContext: string) => `You are a senior research director at a top-tier investment research firm AND a world-class frontend designer.

Your task is to produce a professional-grade DEEP RESEARCH REPORT rendered as a SELF-CONTAINED HTML document. Think: Bloomberg Terminal meets Apple design aesthetics.

=== INPUT ===
Topic: ${userContent}
${inputContext}

=== OUTPUT FORMAT ===
Output a COMPLETE, self-contained HTML document. Do NOT use markdown. Output raw HTML only — no \`\`\`html fences, no explanatory text before or after.

The HTML must:
1. Be a single <div class="report-wrap"> with embedded <style> and optional <script> tags
2. Use CSS custom properties for theming (inherit from parent: --color-text-primary, --color-text-secondary, --color-text-tertiary, --color-background-secondary, --color-border-tertiary, --border-radius-md, --border-radius-lg, --font-sans)
3. Fallback colors for standalone viewing
4. Be mobile-responsive
5. Use Chart.js from CDN for any charts (bar, line, etc)

=== DESIGN SYSTEM ===
<style>
  .report-wrap { max-width: 880px; margin: 0 auto; padding: 2rem 1rem 1rem; font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); }
  
  /* Header */
  .report-header { border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); padding-bottom: 1.5rem; margin-bottom: 2rem; }
  .report-label { font-size: 11px; letter-spacing: 0.12em; color: var(--color-text-tertiary, #999); text-transform: uppercase; margin-bottom: 0.5rem; }
  .report-title { font-size: 22px; font-weight: 500; color: var(--color-text-primary, #1a1a1a); line-height: 1.4; margin-bottom: 1rem; }
  .report-verdict { display: inline-flex; align-items: center; gap: 8px; background: var(--color-background-secondary, #f5f5f5); border: 0.5px solid var(--color-border-tertiary, #e5e5e5); border-radius: 8px; padding: 6px 14px; font-size: 13px; }
  .verdict-dot { width: 8px; height: 8px; border-radius: 50%; }
  
  /* KPI Cards */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 2rem; }
  .kpi-card { background: var(--color-background-secondary, #f5f5f5); border-radius: 8px; padding: 14px 16px; }
  .kpi-label { font-size: 11px; color: var(--color-text-tertiary, #999); margin-bottom: 6px; }
  .kpi-value { font-size: 20px; font-weight: 500; color: var(--color-text-primary, #1a1a1a); }
  .kpi-sub { font-size: 11px; color: var(--color-text-tertiary, #999); margin-top: 2px; }
  .kpi-up { color: #3B6D11; } .kpi-dn { color: #A32D2D; }
  
  /* Sections */
  .section { margin-bottom: 2rem; }
  .section-title { font-size: 13px; font-weight: 500; color: var(--color-text-secondary, #666); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 1rem; padding-bottom: 6px; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); }
  
  /* Thesis box */
  .thesis-box { background: var(--color-background-secondary, #f5f5f5); border-left: 2px solid #378ADD; padding: 14px 16px; font-size: 14px; line-height: 1.7; margin-bottom: 1rem; }
  
  /* Catalysts */
  .catalyst-list { display: flex; flex-direction: column; gap: 8px; }
  .catalyst-item { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; line-height: 1.6; }
  .catalyst-num { min-width: 20px; height: 20px; border-radius: 50%; background: #E6F1FB; color: #185FA5; font-size: 11px; font-weight: 500; display: flex; align-items: center; justify-content: center; margin-top: 2px; }
  
  /* Layout */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem; }
  
  /* Tables */
  .seg-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .seg-table th { font-size: 11px; font-weight: 500; color: var(--color-text-tertiary, #999); text-align: right; padding: 6px 0; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); }
  .seg-table th:first-child { text-align: left; }
  .seg-table td { padding: 8px 0; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); text-align: right; }
  .seg-table td:first-child { text-align: left; color: var(--color-text-secondary, #666); }
  
  /* Bar charts (CSS) */
  .bar-mini { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; }
  .bar-mini-label { min-width: 80px; color: var(--color-text-secondary, #666); }
  .bar-mini-track { flex: 1; height: 6px; background: var(--color-background-secondary, #f5f5f5); border-radius: 3px; overflow: hidden; }
  .bar-mini-fill { height: 100%; border-radius: 3px; }
  .bar-mini-val { min-width: 30px; text-align: right; font-weight: 500; }
  
  /* Scenario cards */
  .scenario-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 2rem; }
  .scenario-card { border: 0.5px solid var(--color-border-tertiary, #e5e5e5); border-radius: 12px; padding: 14px; }
  .sc-label { font-size: 11px; font-weight: 500; margin-bottom: 6px; }
  .sc-price { font-size: 22px; font-weight: 500; margin-bottom: 4px; }
  .sc-prob { font-size: 12px; color: var(--color-text-tertiary, #999); margin-bottom: 8px; }
  .sc-tag { font-size: 11px; color: var(--color-text-secondary, #666); line-height: 1.5; }
  .sc-bull { border-top: 2px solid #639922; } .sc-base { border-top: 2px solid #378ADD; }
  .sc-flat { border-top: 2px solid #888780; } .sc-bear { border-top: 2px solid #E24B4A; }
  
  /* Risk table */
  .risk-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .risk-table th { font-size: 11px; font-weight: 500; color: var(--color-text-tertiary, #999); text-align: left; padding: 6px 8px; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); }
  .risk-table td { padding: 9px 8px; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); vertical-align: top; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
  .pill-low { background: #EAF3DE; color: #3B6D11; } .pill-mid { background: #FAEEDA; color: #854F0B; } .pill-high { background: #FAECE7; color: #993C1D; }
  
  /* Expert rows */
  .expert-row { display: flex; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); font-size: 13px; }
  .expert-row:last-child { border-bottom: none; }
  .expert-name { min-width: 90px; color: var(--color-text-secondary, #666); }
  .expert-view { flex: 1; }
  .conf-bar { width: 80px; height: 6px; background: var(--color-background-secondary, #f5f5f5); border-radius: 3px; overflow: hidden; }
  .conf-fill { height: 100%; border-radius: 3px; background: #378ADD; }
  
  /* Expert debate cards */
  .expert-card { border: 0.5px solid var(--color-border-tertiary, #e5e5e5); border-radius: 12px; padding: 16px; margin-bottom: 10px; }
  .expert-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .expert-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--color-background-secondary, #f5f5f5); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; color: var(--color-text-secondary, #666); }
  .expert-meta { flex: 1; }
  .expert-label { font-size: 13px; font-weight: 600; color: var(--color-text-primary, #1a1a1a); }
  .expert-signal { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .expert-signal-bullish { background: #DCFCE7; color: #166534; }
  .expert-signal-bearish { background: #FEE2E2; color: #991B1B; }
  .expert-signal-neutral { background: #FEF3C7; color: #92400E; }
  .expert-body { font-size: 13px; line-height: 1.7; color: var(--color-text-primary, #1a1a1a); }
  .expert-conf { margin-top: 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--color-text-tertiary, #999); }
  
  /* Debate section */
  .debate-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 0.5px solid var(--color-border-tertiary, #e5e5e5); }
  .debate-item:last-child { border-bottom: none; }
  .debate-label { font-size: 11px; font-weight: 500; color: #185FA5; background: #E6F1FB; padding: 2px 8px; border-radius: 8px; white-space: nowrap; height: fit-content; }
  .debate-text { font-size: 13px; line-height: 1.6; color: var(--color-text-primary, #1a1a1a); }
  
  /* Consensus panel */
  .consensus-panel { background: var(--color-background-secondary, #f5f5f5); border-radius: 12px; padding: 20px; margin-bottom: 2rem; }
  .consensus-verdict { font-size: 18px; font-weight: 500; margin-bottom: 8px; }
  .consensus-detail { font-size: 13px; line-height: 1.7; color: var(--color-text-secondary, #666); }
  
  /* Monitor & Trade */
  .monitor-list { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .monitor-item { background: var(--color-background-secondary, #f5f5f5); border-radius: 8px; padding: 12px 14px; }
  .m-label { font-size: 11px; color: var(--color-text-tertiary, #999); margin-bottom: 4px; }
  .m-current { font-size: 15px; font-weight: 500; }
  .m-trigger { font-size: 11px; color: #185FA5; margin-top: 2px; }
  .trade-box { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .trade-card { border: 0.5px solid var(--color-border-tertiary, #e5e5e5); border-radius: 8px; padding: 12px 14px; }
  .t-label { font-size: 11px; color: var(--color-text-tertiary, #999); margin-bottom: 4px; }
  .t-value { font-size: 14px; font-weight: 500; }
  
  /* Lists */
  .report-wrap ul, .report-wrap ol { padding-left: 1.2em; margin: 0.5rem 0; }
  .report-wrap li { font-size: 13px; line-height: 1.7; color: var(--color-text-primary, #1a1a1a); margin-bottom: 4px; text-align: left; }
  .report-wrap ul { list-style: disc; }
  .report-wrap ol { list-style: decimal; }

  /* Responsive */
  @media (max-width: 600px) {
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .two-col { grid-template-columns: 1fr; }
    .scenario-grid { grid-template-columns: repeat(2, 1fr); }
    .monitor-list { grid-template-columns: 1fr; }
    .trade-box { grid-template-columns: 1fr 1fr; }
  }
</style>

=== REPORT STRUCTURE (adapt sections to topic) ===
1. Report Header: label, title, verdict badge with colored dot
2. KPI Grid: 3-4 key metrics with sub-labels (use .kpi-grid)
3. Core Thesis: thesis-box with catalysts list
4. Data Visualization: two-col layout with bar charts (.bar-mini) and tables (.seg-table)
5. Scenario Analysis: 3-4 scenario cards (.scenario-grid with .sc-bull/.sc-base/.sc-flat/.sc-bear)
6. Risk Matrix: table with probability/impact pills (.pill-low/.pill-mid/.pill-high)
7. Expert Debate Panel (MANDATORY when expert debate data is in the input): Present each expert’s core view, confidence, and key argument using expert-row components. Include:
   - Expert cards: each expert with name, signal (bullish/bearish/neutral), confidence bar, and 1-2 sentence core argument
   - Points of Agreement: where experts converged
   - Points of Contention: where experts disagreed and what data would resolve it
   - Synthesis: how the debate shaped the final thesis
8. Key Monitoring: monitor-list with current values and triggers
9. Action Strategy: trade-box with entry/stop/target cards
10. The report ENDS here after Action Strategy. Do NOT add a Related Questions section — the frontend renders that separately.

=== CRITICAL RULES ===
1. Output ONLY the HTML starting with <style> and <div class="report-wrap">. No markdown, no code fences, no explanation text.
2. All text content must be data-driven and analytical — use the actual research data provided.
3. Use REAL numbers from the input data. Never fabricate financial figures.
4. LANGUAGE: Match the user's language. Chinese query = all Chinese content. English = all English.
5. Use Chart.js (CDN: https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js) for complex charts. Put <script> tags at the end.
6. Canvas elements MUST have unique IDs.
7. All colors should use semantic meaning: green (#3B6D11/#639922) for positive, red (#A32D2D/#E24B4A) for negative, blue (#378ADD/#185FA5) for neutral/info.
8. For non-stock topics, adapt the template — skip stock-specific widgets, add relevant ones.
9. Keep the design minimal, data-dense, and professional. No decorative elements.
10. The HTML must work standalone — include all styles inline.
11. Do NOT use markdown syntax anywhere: no **bold**, no *italic*, no -- dashes for lists. All text must be plain HTML (<strong>, <em>, <ul>/<li>).
12. Section titles and headings must be plain text inside HTML tags. Never wrap titles in ** asterisks.
13. The report ends after Action Strategy / Key Monitoring. Do NOT add a Related Questions section, "Data Sources" footnote, or any extra text — the frontend renders those separately.
`;

      // Route synthesis prompt by queryType
      const queryType = plan.queryType || 'investment-analysis';
      let synthesizePrompt: string;
      switch (queryType) {
        case 'research':
          synthesizePrompt = researchPrompt;
          break;
        case 'market-brief':
          synthesizePrompt = marketBriefPrompt;
          break;
        case 'guru-council':
          synthesizePrompt = guruCouncilPrompt;
          break;
        case 'investment-analysis':
        default:
          synthesizePrompt = traderMemoPrompt;
          break;
      }
      const synthesisMaxTokens = queryType === 'market-brief' ? 4096 : 8192;
      const synthesisModelOverride = config.lokaAi.synthesisModel || undefined;

      // ── Helper: run HTML generation stream and return the result ──
      const runHtmlGeneration = async (htmlInput: string): Promise<string> => {
        const htmlPrompt = queryType === 'guru-council'
          ? buildGuruCouncilHtmlPrompt(htmlInput)
          : buildWebReportPrompt(htmlInput);
        const htmlStream = await aiService.chatStream([{ role: 'user', content: htmlPrompt }], 'superagent', undefined, 8192);
        const htmlReader = htmlStream.getReader();
        const htmlDecoder = new TextDecoder();
        let htmlContent = '';
        let htmlBuf = '';
        let chunkCount = 0;
        while (true) {
          const { done, value } = await htmlReader.read();
          if (done) {
            if (htmlBuf.trim()) {
              for (const line of htmlBuf.split('\n')) {
                const t = line.trim();
                if (t.startsWith('data: ')) {
                  const d = t.slice(6).trim();
                  if (d === '[DONE]') continue;
                  try { htmlContent += JSON.parse(d).choices?.[0]?.delta?.content || ''; } catch {}
                }
              }
            }
            break;
          }
          chunkCount++;
          htmlBuf += htmlDecoder.decode(value, { stream: true });
          const htmlLines = htmlBuf.split('\n');
          htmlBuf = htmlLines.pop() || '';
          for (const line of htmlLines) {
            const t = line.trim();
            if (t.startsWith('data: ')) {
              const d = t.slice(6).trim();
              if (d === '[DONE]') continue;
              try { htmlContent += JSON.parse(d).choices?.[0]?.delta?.content || ''; } catch {}
            }
          }
        }
        console.log(`[agent:chat:html] Stream finished. chunks=${chunkCount}, htmlLength=${htmlContent.length}`);
        // Sanitize: strip LLM preamble/postamble and markdown fences
        let s = htmlContent.trim();
        s = s.replace(/^```html\s*/i, '').replace(/^```\s*/, '');
        const firstTag = Math.min(
          s.indexOf('<style') >= 0 ? s.indexOf('<style') : Infinity,
          s.indexOf('<div')   >= 0 ? s.indexOf('<div')   : Infinity,
        );
        if (firstTag > 0 && firstTag < Infinity) s = s.slice(firstTag);
        s = s.replace(/\n?```\s*$/, '').trim();
        return s;
      };

      // ── Emit HTML result to frontend + persist to DB ──
      const emitHtmlResult = async (htmlContent: string) => {
        if (htmlContent.length <= 100) {
          console.log(`[agent:chat:html] ⚠️ HTML content too short (${htmlContent.length}), skipping`);
          return;
        }
        const msgCount = await prisma.chatMessage.count({ where: { sessionId } });
        const msgIdx = msgCount - 1;
        console.log(`[agent:chat:html] msgCount=${msgCount}, msgIdx=${msgIdx}`);
        const lastMsg = await prisma.chatMessage.findFirst({ where: { sessionId, role: 'assistant' }, orderBy: { createdAt: 'desc' } });
        if (lastMsg) {
          const existingMeta = lastMsg.metadata ? JSON.parse(lastMsg.metadata as string) : {};
          existingMeta.htmlReport = htmlContent;
          await prisma.chatMessage.update({ where: { id: lastMsg.id }, data: { metadata: JSON.stringify(existingMeta) } });
          console.log(`[agent:chat:html] DB updated with htmlReport`);
        }
        emitToUser(userId, 'agent:chat:html_ready', { sessionId, msgIdx, html: htmlContent });
        console.log(`[agent:chat:html] ✅ HTML report emitted for session ${sessionId}, msgIdx=${msgIdx}, length=${htmlContent.length}`);
      };

      // ── Start REAL-PARALLEL HTML generation (runs concurrently with synthesis) ──
      // Input is `contextString` (research data) instead of waiting for synthesis output.
      // The resulting promise is awaited AFTER synthesis completes, so HTML is ready
      // immediately (or near-immediately) rather than starting a fresh 148s round trip.
      const htmlEligible = queryType === 'investment-analysis' || queryType === 'guru-council' || isDeepResearch;
      const htmlReportEnabled = htmlEligible && !config.superAgentDisableHtmlReport;
      if (htmlEligible && config.superAgentDisableHtmlReport) {
        console.log('[agent:chat:html] Skipped (SUPERAGENT_DISABLE_HTML_REPORT is set)');
      }
      const parallelHtmlStartedAt = Date.now();
      let parallelHtmlPromise: Promise<string> | null = null;
      // Enable parallel HTML for ALL eligible queries including roundtable.
      // For roundtable, the parallel HTML uses contextString (raw research data)
      // and gets overlapped with consensus + deep-research second pass. If the
      // result quality is unacceptable, the sequential fallback using
      // finalDbContent still runs after synthesis completes.
      if (htmlReportEnabled && contextString.length > 200) {
        const mode = isDeepResearch ? 'roundtable' : 'standard';
        console.log(`[agent:chat:html] Starting REAL-PARALLEL HTML generation (queryType=${queryType}, mode=${mode}), contextString length=${contextString.length}`);
        emitToUser(userId, 'agent:chat:html_generating', { sessionId, msgIdx: -1 });
        parallelHtmlPromise = runHtmlGeneration(contextString).catch(err => {
          console.error('[agent:chat:html] ❌ Parallel HTML generation failed:', err.message);
          return '';
        });
      }

      const buildLocalSynthesisFallback = (cause: string): string => {
        const compact = contextString
          .replace(/\r/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        const preview = compact.length > 1400 ? `${compact.slice(0, 1400)}\n...(truncated)` : compact;
        const isZh = /[\u4e00-\u9fff]/.test(userContent || '');
        if (isZh) {
          return [
            '## 临时降级说明',
            `最终合成阶段遇到上游模型错误（${cause}）。当前先返回降级摘要，避免你白等。`,
            '',
            '### 建议',
            '- 你可以直接回复“继续深度总结”，我会基于当前已抓取数据再次合成。',
            '- 如果连续失败，建议稍后重试或切换模型。',
            preview ? `\n### 已抓取数据摘要（截断）\n${preview}` : '',
          ].join('\n');
        }
        return [
          '## Temporary Fallback',
          `Final synthesis failed due to upstream model error (${cause}). Returning a degraded summary so the run does not fail silently.`,
          '',
          '### Next Step',
          '- Reply with "continue synthesis" to retry based on fetched data.',
          '- If this keeps failing, retry later or switch model/provider.',
          preview ? `\n### Retrieved Context (truncated)\n${preview}` : '',
        ].join('\n');
      };

      const synthesizeFallbackContent = async (cause: string): Promise<string> => {
        const compact = contextString
          .replace(/\r/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
          .slice(0, 10000);
        const isZh = /[\u4e00-\u9fff]/.test(userContent || '');
        const fallbackPrompt = isZh
          ? `你是投资研究助手的“故障降级总结器”。上游流式模型暂时失败，请基于已完成的工具结果生成一份简明、可执行的中文结论。\n\n要求：\n1) 先给结论（偏多/偏空/观望）和置信度（高/中/低）\n2) 给出3-5条关键依据（来自上下文，不编造）\n3) 给出主要风险与接下来1-2个验证动作\n4) 保持精炼（500-900字），不要输出JSON\n\n用户问题：${userContent}\n查询类型：${queryType}\n\n已获取上下文：\n${compact}`
          : `You are a fallback synthesizer for an investment research assistant. Streaming synthesis failed upstream. Generate a concise actionable summary using ONLY the fetched context.\n\nRequirements:\n1) Start with verdict (bullish/bearish/neutral) + confidence (high/medium/low)\n2) Provide 3-5 key evidence points grounded in context\n3) List major risks and 1-2 next validation steps\n4) Keep it concise (300-600 words), no JSON\n\nUser query: ${userContent}\nQuery type: ${queryType}\n\nFetched context:\n${compact}`;

        const attempts = 2;
        for (let i = 1; i <= attempts; i += 1) {
          try {
            const fallbackResp = await aiService.chat(
              [{ role: 'user', content: fallbackPrompt }],
              'superagent',
              undefined,
              synthesisModelOverride,
            );
            const content = (fallbackResp.content || '').trim();
            if (content) {
              console.log(`[agent:chat:fallback] ✅ fallback synthesis succeeded (attempt=${i})`);
              return content;
            }
          } catch (fallbackErr: any) {
            console.warn(
              `[agent:chat:fallback] attempt=${i} failed:`,
              fallbackErr?.message || String(fallbackErr),
            );
          }
          if (i < attempts) {
            await new Promise((resolve) => setTimeout(resolve, 1200 * i));
          }
        }
        console.warn('[agent:chat:fallback] all fallback attempts failed; using local degraded message');
        return buildLocalSynthesisFallback(cause);
      };

      const synthStartedAt = Date.now();
      const shouldLogSynthesisText =
        /^(1|true|yes|on)$/i.test(String(process.env.SUPERAGENT_LOG_SYNTHESIS_TEXT || '').trim());
      const logSynthesisFinalText = (kind: 'primary' | 'fallback', content: string) => {
        if (!shouldLogSynthesisText) return;
        const text = String(content ?? '');
        console.log(
          `[agent:chat:synthesis_text] kind=${kind} sessionId=${sessionId} chars=${text.length} BEGIN`,
        );
        console.log(text);
        console.log(
          `[agent:chat:synthesis_text] kind=${kind} sessionId=${sessionId} END`,
        );
      };
      try {
        console.log('[agent:chat] Starting synthesis stream (queryType=%s), prompt length:', queryType, synthesizePrompt.length);
        const synthesisStream = await aiService.chatStream(
          [{ role: 'user', content: synthesizePrompt }],
          'superagent',
          undefined,
          synthesisMaxTokens,
          synthesisModelOverride,
        );
        console.log('[agent:chat] Synthesis stream obtained, reading...');
        const synReader = synthesisStream.getReader();
        const synDecoder = new TextDecoder();
        let synFullContent = '';
        let synBuffer = '';
        let synthesisFirstTokenAt: number | null = null;

        while (true) {
          const { done, value } = await synReader.read();
          if (done || isAborted()) {
            if (!isAborted() && synBuffer.trim().startsWith('data: ') && synBuffer.trim() !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(synBuffer.trim().slice(6).trim());
                const delta = parsed.choices?.[0]?.delta?.content || '';
                if (delta) {
                  if (synthesisFirstTokenAt === null) synthesisFirstTokenAt = Date.now();
                  synFullContent += delta;
                  if (!isDeepResearch) streamToChat(delta);
                }
              } catch (e) { }
            }
            break;
          }
          synBuffer += synDecoder.decode(value, { stream: true });
          const lines = synBuffer.split('\n');
          synBuffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const sseData = trimmed.slice(6).trim();
              if (sseData === '[DONE]') continue;
              try {
                const parsed = JSON.parse(sseData);
                const delta = parsed.choices?.[0]?.delta?.content || '';
                if (delta) {
                  if (synthesisFirstTokenAt === null) synthesisFirstTokenAt = Date.now();
                  synFullContent += delta;
                  if (!isDeepResearch) streamToChat(delta);
                }
              } catch (e) { }
            }
          }
        }

        if (isAborted()) {
          console.log(`[agent:chat] Aborted after synthesis stream for session ${sessionId}`);
          activeChatSessions.delete(sessionId);
        finishChatReplayBuffer(sessionId);
          chatAbortControllers.delete(sessionId);
          return;
        }

        const flowModules: Array<{ type: string; status: string; data?: Record<string, unknown> }> = [];
        if (plan.capabilities.search.needed) flowModules.push({ type: 'search', status: 'completed', data: { variant: 'social', sources: finalSocialSources } });
        if (plan.capabilities.analysis.needed) flowModules.push({ type: 'analysis', status: 'completed', data: { stages: finalAnalysisStages } });
        if (plan.capabilities.simulate.needed) flowModules.push({ type: 'simulation', status: 'completed', data: { panelists: finalPanelists } });

        let finalDbContent = synFullContent;
        /** Matches frontend ConsensusModuleData for Thinking Process + DB replay */
        let consensusFlowData: {
          status: 'concluded';
          round: number;
          maxRounds: number;
          conclusion: { verdict: string; confidence: number };
        } | null = null;
        /** Full consensus result for DB persistence — restored on session history load */
        let savedConsensusResult: any = null;

        if (data.mode === 'roundtable') {
          // Phase 1: Initial draft is already generated silently (not streamed)
          emitter.emitModule('consensus', 'active', { status: 'building', round: 1, maxRounds: 3 });
          const roundtableStartedAt = Date.now();

          try {
            // Phase 2: Expert debate — send initial draft to consensus engine
            emitter.emitModule('consensus', 'active', { status: 'discussing', round: 1, maxRounds: 3 });
            // Detect language so experts respond consistently
            const isZhTask = /[\u4e00-\u9fff]/.test(userContent);
            const langInstruction = isZhTask
              ? '\n\n重要：你的所有分析和结论必须全部使用中文。不要评价报告本身的质量，而是对分析主题给出你自己的独立分析和判断。'
              : '\n\nIMPORTANT: Provide your own independent analysis of the topic, NOT a review of the report quality. Respond entirely in English.';
            const consensusTask = `You are a senior investment analyst. Based on the following research, provide your independent analysis and investment verdict on the topic: "${userContent}"

Focus on:
1. Your directional view (bullish/bearish/neutral) with conviction level
2. Key factors supporting your view
3. Main risks to your thesis
4. Specific price levels or targets if applicable

Research context:\n${synFullContent}${langInstruction}`;
            const consensusResult = await runConsensusEngine(userId, 'roundtable', consensusTask);
            savedConsensusResult = consensusResult;
            
            const finalAnswerText = consensusResult.consensus?.finalAnswer || '';

            // Collect individual expert perspectives with structured debate context
            let expertDebateContext = '';
            const agentResponses = consensusResult.consensus?.agentResponses || [];
            const nameMap: Record<string, string> = {
              agent_0: 'Fundamental Analyst',
              agent_1: 'Macro Strategist',
              agent_2: 'Sentiment Engine',
              agent_3: 'Quant Tracker',
            };
            const roundsUsed = Number(consensusResult.consensus?.roundsUsed ?? 1) || 1;
            const consensusReached = consensusResult.consensus?.consensusReached !== false;

            // Emit round-by-round progress so the frontend graph updates progressively
            for (let r = 1; r <= roundsUsed; r++) {
              emitter.emitModule('consensus', 'active', { status: 'discussing', round: r, maxRounds: 3 });
            }

            if (agentResponses.length > 0) {
              expertDebateContext += `\n\n【EXPERT ROUNDTABLE DEBATE】\n`;
              expertDebateContext += `Rounds of debate: ${roundsUsed}\n`;
              expertDebateContext += `Consensus reached: ${consensusReached ? 'Yes' : 'No'}\n`;
              expertDebateContext += `Consensus confidence: ${Math.round(Number(consensusResult.consensus?.confidence ?? 0) * 100)}%\n\n`;
              expertDebateContext += `Final Consensus Verdict:\n${finalAnswerText}\n\n`;
              expertDebateContext += `Individual Expert Positions:\n`;
              agentResponses.forEach((resp: any, idx: number) => {
                const name = nameMap[resp.agentId] || `Expert ${idx + 1}`;
                const conf = Math.round((resp.confidence || 0) * 100);
                expertDebateContext += `--- ${name} (${conf}% confidence) ---\n${resp.answer}\n\n`;
              });
            }

            // ── Immediately send consensus_done so frontend shows full RoundTable graph ──
            // This happens BEFORE Phase 3 (deep research), so the graph appears while the report streams.
            const conf = Number(consensusResult.consensus?.confidence ?? 0);
            const reached = consensusResult.consensus?.consensusReached !== false;
            const verdictMatch = finalAnswerText.match(/\*\*Verdict:\*\*\s*([^\n*]+)/i);
            const verdictLabel = verdictMatch
              ? verdictMatch[1].trim().slice(0, 120)
              : reached
                ? 'Consensus reached'
                : 'No consensus';

            consensusFlowData = {
              status: 'concluded',
              round: Math.min(3, roundsUsed || 3),
              maxRounds: 3,
              conclusion: { verdict: verdictLabel, confidence: conf },
            };
            emitter.emitModule('consensus', 'completed', consensusFlowData);
            socket.emit('agent:chat:consensus_done', {
              sessionId,
              result: consensusResult
            });

            // Phase 3: Deep Research synthesis — integrate raw data + initial draft + expert debate
            emitter.emitModule('consensus', 'active', { status: 'synthesizing', round: roundsUsed + 1, maxRounds: 3 });
            const deepResearchInput = `Raw Research Data:\n${contextString}\n\nInitial Analysis Draft:\n${synFullContent}${expertDebateContext}`;
            const deepResearchFinalPrompt = buildDeepResearchPrompt(deepResearchInput);

            console.log('[agent:chat] Starting Deep Research second pass, prompt length:', deepResearchFinalPrompt.length);
            const deepSecondPassStartedAt = Date.now();

            const deepStream = await aiService.chatStream(
              [{ role: 'user', content: deepResearchFinalPrompt }],
              'superagent',
              undefined,
              8192,
              synthesisModelOverride,
            );
            const deepReader = deepStream.getReader();
            const deepDecoder = new TextDecoder();
            let deepFullContent = '';
            let deepBuffer = '';

            while (true) {
              const { done, value } = await deepReader.read();
              if (done || isAborted()) {
                if (!isAborted() && deepBuffer.trim().startsWith('data: ') && deepBuffer.trim() !== 'data: [DONE]') {
                  try {
                    const parsed = JSON.parse(deepBuffer.trim().slice(6).trim());
                    const delta = parsed.choices?.[0]?.delta?.content || '';
                    if (delta) { deepFullContent += delta; }
                  } catch (e) { }
                }
                break;
              }
              deepBuffer += deepDecoder.decode(value, { stream: true });
              const lines = deepBuffer.split('\n');
              deepBuffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (!trimmed.startsWith('data: ')) continue;
                try {
                  const parsed = JSON.parse(trimmed.slice(6).trim());
                  const delta = parsed.choices?.[0]?.delta?.content || '';
                  if (delta) {
                    deepFullContent += delta;
                    // Stream directly — initial draft was never shown to user
                    streamToChat(delta);
                  }
                } catch (e) { }
              }
            }

            // Use the deep research output as final content
            finalDbContent = deepFullContent;
            console.log(
              `[agent:chat:timing] deep_second_pass_s=${asSeconds(Date.now() - deepSecondPassStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId}`,
            );

            if (consensusResult.consensus) {
              consensusResult.consensus.finalAnswer = finalDbContent;
            }
          } catch (e: any) {
            finalDbContent = synFullContent + `\n\n---\n\n## ⚠️ Consensus Error\n${e.message}`;
            streamToChat(`\n\n---\n\n## ⚠️ Consensus Error\n${e.message}`);
            consensusFlowData = {
              status: 'concluded',
              round: 1,
              maxRounds: 3,
              conclusion: { verdict: 'Consensus failed', confidence: 0 },
            };
            emitter.emitModule('consensus', 'completed', consensusFlowData);
            socket.emit('agent:chat:consensus_done', {
              sessionId,
              result: { consensus: { finalAnswer: finalDbContent, confidence: 0, executionTime: 0, agentResponses: [] } }
            });
          } finally {
            console.log(
              `[agent:chat:timing] roundtable_total_s=${asSeconds(Date.now() - roundtableStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId}`,
            );
          }
        }

        if (consensusFlowData) {
          flowModules.push({ type: 'consensus', status: 'completed', data: consensusFlowData as unknown as Record<string, unknown> });
        }
        const dur = Math.max(0, Math.round((Date.now() - startTime) / 1000));
        flowModules.push({ type: 'done', status: 'completed', data: { duration: dur } });

        await prisma.chatMessage.create({
          data: {
            userId,
            sessionId,
            role: 'assistant',
            content: finalDbContent,
            agentId: 'superagent',
            metadata: JSON.stringify({
              thinkingFlow: {
                modules: flowModules,
                isActive: false,
                route: 'Super Agent Orchestrator',
                ...(isDeepResearch ? { routedMode: 'roundtable' } : {}),
              },
              consensusResult: savedConsensusResult ?? undefined,
              quoteCard: savedQuoteCard ?? undefined,
              xProfileCard: savedXProfileCard ?? undefined,
              sources: finalSocialSources.length > 0 ? finalSocialSources : undefined,
            })
          }
        });
        logSynthesisFinalText('primary', finalDbContent);

        emitter.emitModule('done', 'completed', { duration: dur });
        const streamDoneSources = finalSocialSources.length > 0 ? finalSocialSources : undefined;
        console.log(
          `[agent:chat:sources] stream_done_sources_count=${streamDoneSources?.length || 0} sessionId=${sessionId}`,
        );
        emitter.emitStreamDone(finalDbContent, { sources: streamDoneSources });

        // --- HTML report emission: prefer parallel result, fall back to sequential ---
        // Primary path: await the promise launched BEFORE synthesis (started at
        // `parallelHtmlStartedAt`). It has been running concurrently with synthesis,
        // so typically it resolves immediately or within a short margin — saving the
        // full sequential round-trip that previously blocked ~148s.
        const htmlModeLabel = isDeepResearch ? 'roundtable' : 'standard';
        if (htmlEligible && config.superAgentDisableHtmlReport) {
          console.log('[agent:chat:html] Skipped HTML generation (SUPERAGENT_DISABLE_HTML_REPORT is set)');
        } else if (htmlEligible && finalDbContent && finalDbContent.length > 200) {
          const htmlEmitStartedAt = Date.now();
          let htmlContent = '';
          if (parallelHtmlPromise) {
            console.log(`[agent:chat:html] Awaiting REAL-PARALLEL HTML result (started ${asSeconds(Date.now() - parallelHtmlStartedAt)}s ago)`);
            try {
              htmlContent = await parallelHtmlPromise;
            } catch (_) {
              htmlContent = '';
            }
            if (htmlContent && htmlContent.length > 100) {
              console.log(`[agent:chat:html] ✅ Using PARALLEL HTML result, length=${htmlContent.length}`);
            } else {
              console.log(`[agent:chat:html] ⚠️ Parallel HTML empty/short, falling back to sequential`);
            }
          }
          if (!htmlContent || htmlContent.length <= 100) {
            const pendingMsgCount = await prisma.chatMessage.count({ where: { sessionId } });
            const genMsgIdx = pendingMsgCount - 1;
            emitToUser(userId, 'agent:chat:html_generating', { sessionId, msgIdx: genMsgIdx });
            console.log(
              `[agent:chat:html] Starting SEQUENTIAL fallback HTML generation (${htmlModeLabel}), input length=${finalDbContent.length}`,
            );
            try {
              htmlContent = await runHtmlGeneration(finalDbContent);
            } catch (htmlErr: any) {
              console.error(`[agent:chat:html] ❌ Sequential fallback HTML failed (${htmlModeLabel}):`, htmlErr.message);
              htmlContent = '';
            }
          }
          if (htmlContent && htmlContent.length > 100) {
            try { await emitHtmlResult(htmlContent); } catch (_) {}
          }
          console.log(
            `[agent:chat:timing] html_emit_s=${asSeconds(Date.now() - htmlEmitStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId} mode=${htmlModeLabel}`,
          );
        }

        console.log(
          `[agent:chat:timing] synthesizer_total_s=${asSeconds(Date.now() - synthStartedAt)} end_to_end_s=${asSeconds(sinceRequestStart())} ui_duration_s=${dur} sessionId=${sessionId}`,
        );
      } catch (err: any) {
        console.error('[agent:chat] SYNTHESIS ERROR:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
        if (isAborted()) {
          console.log(`[agent:chat] Aborted during synthesis error handling for session ${sessionId}`);
          activeChatSessions.delete(sessionId);
        finishChatReplayBuffer(sessionId);
          chatAbortControllers.delete(sessionId);
          return;
        }

        const errMsg = typeof err?.message === 'string' ? err.message : String(err);
        const fallbackContent = await synthesizeFallbackContent(errMsg);
        const dur = Math.max(0, Math.round((Date.now() - startTime) / 1000));
        const fallbackModules: Array<{ type: string; status: string; data?: Record<string, unknown> }> = [];
        if (plan.capabilities.search.needed) fallbackModules.push({ type: 'search', status: 'completed' });
        if (plan.capabilities.analysis.needed) fallbackModules.push({ type: 'analysis', status: 'completed' });
        if (plan.capabilities.simulate.needed) fallbackModules.push({ type: 'simulation', status: 'completed' });
        if (plan.capabilities.web3?.needed) fallbackModules.push({ type: 'web3', status: 'completed' });
        fallbackModules.push({
          type: 'done',
          status: 'completed',
          data: { duration: dur, degraded: true, cause: 'synthesis_error' },
        });

        await prisma.chatMessage.create({
          data: {
            userId,
            sessionId,
            role: 'assistant',
            content: fallbackContent,
            agentId: 'superagent',
            metadata: JSON.stringify({
              thinkingFlow: {
                modules: fallbackModules,
                isActive: false,
                route: 'Super Agent Orchestrator',
              },
              quoteCard: savedQuoteCard ?? undefined,
              xProfileCard: savedXProfileCard ?? undefined,
              degraded: true,
              degradedReason: errMsg,
            }),
          },
        });
        logSynthesisFinalText('fallback', fallbackContent);

        streamToChat(fallbackContent);
        emitter.emitModule('done', 'completed', { duration: dur, degraded: true, cause: 'synthesis_error' });
        const fallbackStreamSources = finalSocialSources.length > 0 ? finalSocialSources : undefined;
        console.log(
          `[agent:chat:sources] fallback_stream_done_sources_count=${fallbackStreamSources?.length || 0} sessionId=${sessionId}`,
        );
        emitter.emitStreamDone(fallbackContent, { sources: fallbackStreamSources });
        console.log(
          `[agent:chat:timing] fallback_emitted_s=${asSeconds(Date.now() - synthStartedAt)} end_to_end_s=${asSeconds(sinceRequestStart())} ui_duration_s=${dur} sessionId=${sessionId}`,
        );

        console.log(
          `[agent:chat:timing] synthesizer_total_s=${asSeconds(Date.now() - synthStartedAt)} total_s=${asSeconds(sinceRequestStart())} sessionId=${sessionId} (error)`,
        );
      }
      activeChatSessions.delete(sessionId);
        finishChatReplayBuffer(sessionId);
      chatAbortControllers.delete(sessionId);
    });
    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);

      // Check if user has other active sockets before marking offline
      const rooms = io.sockets.adapter.rooms.get(`user:${userId}`);
      if (!rooms || rooms.size === 0) {
        onlineUsers.delete(userId);
        socket.broadcast.emit('user:offline', { userId });
      }
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

// Helper to emit to specific user
export function emitToUser(userId: string, event: string, data: unknown) {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

// Helper to emit to group
export function emitToGroup(groupId: string, event: string, data: unknown) {
  if (io) {
    io.to(`group:${groupId}`).emit(event, data);
  }
}

// Helper to make a user's active sockets join a specific room
// Used when a user joins a group via REST API so they immediately receive group events
export function joinSocketRoom(userId: string, room: string) {
  if (!io) return;
  const userRoom = io.sockets.adapter.rooms.get(`user:${userId}`);
  if (userRoom) {
    for (const socketId of userRoom) {
      const s = io.sockets.sockets.get(socketId);
      if (s) s.join(room);
    }
  }
}

// Helper to get online user IDs
export function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers);
}