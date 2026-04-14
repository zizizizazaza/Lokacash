import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { verifyToken } from '../middleware/auth.js';
import prisma from '../db.js';
import { researchService } from '../services/research.service.js';
import { stockAnalysisService } from '../services/stockanalysis.service.js';
import { hedgefundService } from '../services/hedgefund.service.js';
import { LokaAIService, getGlobalTimeContext } from '../services/ai.service.js';
import {
  formatConsensusAgentLabel,
  runConsensusEngine,
  sortConsensusAgentEntries,
} from '../services/consensus.service.js';
import * as crypto from 'crypto';
import { createModuleEmitter } from '../services/moduleEmitter.js';
import {
  mergeSignalSources,
  sourcesFromSignalRadarLogLine,
  sourcesFromSignalRadarSummary,
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

    socket.on('agent:chat', async (data: { content: string; mode: string; sessionId?: string; agentId?: string; hidden?: boolean }) => {
      if (!data?.content) return;

      const sessionId = data.sessionId || crypto.randomUUID();

      // ── Dedup guard: skip identical content for the same session within 3s ──
      const dedupKey = `${sessionId}::${data.content}`;
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
        contentPreview: data.content.slice(0, 80),
      });

      const emitter = createModuleEmitter(userId, sessionId);

      if (!data.hidden) {
        try {
          await prisma.chatMessage.create({
            data: { userId, sessionId, role: 'user', content: data.content, agentId: 'superagent' }
          });
        } catch (dbErr) { }
      }

      // ── Query session history for multi-turn context ──
      const MAX_HISTORY_FOR_ROUTING = 6;
      const MAX_HISTORY_FOR_SYNTHESIS = 8;
      const ASSISTANT_CONTENT_CAP = 300;

      const sessionHistory = await prisma.chatMessage.findMany({
        where: { userId, sessionId },
        orderBy: { createdAt: 'asc' },
        take: MAX_HISTORY_FOR_SYNTHESIS,
        select: { role: true, content: true },
      });

      const formatHistory = (messages: { role: string; content: string }[], limit: number): string => {
        return messages
          .slice(-limit)
          .map(m => {
            const label = m.role === 'user' ? 'User' : 'Assistant';
            const text = m.role === 'assistant' && m.content.length > ASSISTANT_CONTENT_CAP
              ? m.content.slice(0, ASSISTANT_CONTENT_CAP) + '...(truncated)'
              : m.content;
            return `[${label}]: ${text}`;
          })
          .join('\n');
      };

      activeChatSessions.set(sessionId, 'running');
      emitter.emitStarted('auto', 'Super Agent', data.hidden);
      socket.emit('agent:chat:routing', { sessionId });

      let plan: any;
      try {
        const routingHistory = formatHistory(sessionHistory, MAX_HISTORY_FOR_ROUTING);
        const routingQuery = routingHistory
          ? `【Conversation Context】\n${routingHistory}\n\n【Latest User Message】\n${data.content}`
          : data.content;
        plan = await aiService.evaluateRouting(routingQuery);
      } catch (routingErr: any) {
        console.error('evaluateRouting failed:', routingErr.message);
        plan = { isSimpleChat: true, queryType: 'general', capabilities: { analysis: { needed: false }, search: { needed: false }, simulate: { needed: false } } };
      }

      if (data.mode === 'roundtable') {
        plan.isSimpleChat = false;
      }

      // Guru Council mode: always trigger simulation
      if (data.agentId === 'guru-council') {
        plan.isSimpleChat = false;
        plan.queryType = 'guru-council';
        plan.capabilities.simulate.needed = true;
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
        const queryLower = data.content.toLowerCase();
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
      
      socket.emit('agent:chat:routed', { 
        sessionId, 
        mode: data.mode === 'roundtable' ? 'roundtable' : (plan.isSimpleChat ? 'fast' : 'auto') 
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
          const mappedContext = context.map(m => ({ role: m.role, content: m.content, agentId: m.agentId }));
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
        chatAbortControllers.delete(sessionId);
        return;
      }

      const promises: Promise<{ type: string; data: any }>[] = [];
      const startTime = Date.now();

      let finalSocialSources: any[] = [];
      let finalAnalysisStages: any[] = [];
      let finalPanelists: any[] = [];
      let savedQuoteCard: any = null;

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

        promises.push(
          researchService.runDeepResearch(
            plan.capabilities.search.query || data.content,
            { deep: false },
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
            let socialSources = mergeSignalSources([], res.extractedSources ?? [], PANEL_MAX);
            socialSources = mergeSignalSources(socialSources, sourcesFromSignalRadarSummary(res.summary, PANEL_MAX), PANEL_MAX);
            if (socialSources.length === 0) socialSources = mergeSignalSources([], logHintSources, PANEL_MAX);

            finalSocialSources = socialSources;
            emitter.emitModule('search', 'completed', {
              variant: 'social',
              sources: socialSources,
              providers: [
                { name: 'Yahoo Finance' }, { name: 'Bloomberg API' }, { name: 'Alpha Vantage' },
                { name: 'Polygon.io' }, { name: 'CoinGecko' }, { name: 'TradingView' }
              ]
            });
            return { type: 'SEARCH', data: res.summary };
          }).catch(e => {
            emitter.emitModule('search', 'completed', {});
            return { type: 'SEARCH', data: 'Error: ' + e.message };
          })
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
              "Analyze: " + (plan.capabilities.analysis.tickers?.join(', ') || data.content),
              analysisSubSessionId,
              userId,
              (step: any) => {
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
                      const isZh = /[\u4e00-\u9fff]/.test(data.content);
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
                      // Detect market from symbol code
                      const detectMarket = (sym: string) => {
                        if (!sym) return undefined;
                        if (/^\d{6}\.(SH|SS)$/.test(sym) || /^(sh|sz)\d{6}$/i.test(sym) || /^[036]\d{5}$/.test(sym))
                          return isZh ? 'A股' : 'A-Share';
                        if (/\.HK$/i.test(sym) || /^0[0-9]{4}\.?$/i.test(sym))
                          return isZh ? '港股' : 'HK';
                        if (/^[A-Z]{1,5}$/.test(sym) || /\.(US|NASDAQ|NYSE)$/i.test(sym))
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
                      emitToUser(userId, 'agent:chat:quote', {
                        sessionId,
                        quote: quotePayload,
                      });
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

        promises.push(
          hedgefundService.runAnalysis(analysisOptions, () => {})
            .then(hfResult => {
              const panelists = Object.keys(hfResult.analyst_signals || {}).map(p => ({
                name: p,
                avatar: 'L',
                status: 'done',
                verdict: Object.values(hfResult.analyst_signals[p] || {})[0]?.signal || 'Hold',
                confidence: Object.values(hfResult.analyst_signals[p] || {})[0]?.confidence || 0,
                group: GENERIC_ANALYST_KEYS.has(p) ? 'analyst' : 'guru'
              }));
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

      const results = await Promise.allSettled(promises);
      if (isAborted()) {
        console.log(`[agent:chat] Aborted after Promise.allSettled for session ${sessionId}`);
        activeChatSessions.delete(sessionId);
        chatAbortControllers.delete(sessionId);
        return;
      }
      console.log('[agent:chat] Promise.allSettled completed:', results.map(r => r.status === 'fulfilled' ? `✅ ${r.value.type}` : `❌ ${(r as any).reason?.message}`).join(', '));
      
      const synthHistory = formatHistory(sessionHistory, MAX_HISTORY_FOR_SYNTHESIS);
      let contextString = "";
      if (synthHistory) {
        contextString += "【CONVERSATION HISTORY — for continuity, do NOT repeat old findings】\n" + synthHistory + "\n\n";
      }
      contextString += "【User Original Request】\n" + data.content + "\n\n";
      
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          contextString += `【${r.value.type} REPORT】\n${r.value.data}\n\n`;
        }
      });

      const isDeepResearch = data.mode === 'roundtable';

      const buildDeepResearchPrompt = (inputContext: string) => getGlobalTimeContext() + `You are a senior research director at a top-tier investment research firm.

Your task is to produce a professional-grade DEEP RESEARCH REPORT — the kind that institutional investors, fund managers, and sophisticated traders actually pay for and act on.

This is NOT a quick take or trader memo. This is a thorough, multi-dimensional research product that synthesizes all available evidence into a coherent investment thesis with rigorous supporting analysis.

=== INPUT ===
Topic: ${data.content}
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
5. INLINE CITATIONS: Retain all URLs from raw data as clickable Markdown links.
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
Topic: ${data.content}
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
- Each bullet: forward-looking question tied to a specific data point or event with a time horizon
- CRITICAL: No text, tags, or sections may appear after this list

═══ ABSOLUTE RULES ═══
1. HEADING LEVELS: # for report title only. ## for all section headings. No ### or ####. Use **bold** for subsections and key terms throughout the text. NEVER prefix headings with numbers like "1.", "2.", "3." — the frontend auto-generates numbering.
2. Section titles MUST be unique and topic-specific. NEVER use generic titles like "Fundamental Analysis", "Valuation", "Financial Health", "Signal vs Noise", "Positioning", "Stress Test" etc. — these are internal labels, not output headings. Create engaging, specific headings (e.g. "广告引擎点火，但游戏拖了后腿", "23倍PE：贵还是便宜？", "多空交锋：谁在买？谁在跑？").
3. Synthesize, do not concatenate. Surface agreements, contradictions, and emergent insights across agents.
4. Never fabricate data. Only use information present in the raw reports. If a quantitative threshold is useful but not in the data, name the metric and explain its importance without inventing numbers.
5. INLINE CITATIONS: Retain URLs from search reports as clickable Markdown links, e.g. ([Bloomberg](https://...)).
6. LANGUAGE CONSISTENCY (CRITICAL): If user wrote in Chinese, ENTIRE output in Chinese — all headings, labels, table headers, body text. No English mixed in. Vice versa for English. Non-negotiable.
7. Length: 1500-3500 words. Depth over brevity, but no padding. Every sentence must earn its place. Cover ALL analysis dimensions — fundamental, valuation, financial, technical, and actionable trade setup.
8. End with "Questions to watch" — 3-5 forward-looking questions with specific data triggers.
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
Topic: ${data.content}
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

═══ ABSOLUTE RULES ═══
1. HEADING LEVELS: # for title only. ## for sections. Use **bold** for subsections and key terms, figures, and conclusions throughout the text. NEVER prefix headings with numbers like "1.", "2.", "3." — the frontend auto-generates numbering in the Table of Contents.
2. Section titles MUST be specific and engaging, not generic labels.
3. Synthesize across sources. Surface contradictions and emergent patterns.
4. Never fabricate data. Use qualitative discussion when numbers are unavailable.
5. INLINE CITATIONS: Retain URLs as clickable Markdown links.
6. LANGUAGE: Match user's language entirely. Chinese query = all Chinese. English = all English.
7. Length: 1500-3000 words. Depth over breadth.
8. Tables for comparisons, bullet lists for key points, narrative for analysis.
`;

      // ─── Market Brief Prompt ───
      const marketBriefPrompt = `You are a senior market strategist writing a concise daily market briefing.

Your job is to deliver a fast, scannable overview of what happened in the market — not deep analysis. Think: morning market email that a trader reads in 2 minutes.

=== INPUT ===
Topic: ${data.content}
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
Topic: ${data.content}
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

═══ RULES ═══
1. Each guru MUST use their actual known framework — not generic "analysis". Buffett talks about moats and margin of safety. Lynch talks about PEG and growth categories. Burry talks about asymmetric bets and overlooked data.
2. EXPAND the short simulation signals into full analysis paragraphs. The raw data is just direction — you provide the reasoning depth.
3. LANGUAGE: Match user's language entirely. Chinese query = all Chinese.
4. Use actual data from context. Integrate search results + simulation signals + any financial data.
5. Gurus can and should DISAGREE. Don't force consensus where data doesn't support it.
6. Cite sources with inline links when available.
7. Length: 2000-4000 words. Each guru section should be substantial (150-300 words).
8. # for title, ## for sections, **bold** for guru names and subsections. Use markdown formatting generously: **bold** for emphasis, key numbers, and important terms. NEVER prefix headings with numbers like "1.", "2.", "3.".
`;

      // ─── Guru Council HTML Template ───
      const buildGuruCouncilHtmlPrompt = (inputContext: string) => `You are a world-class frontend designer creating a visual report for a Guru Council (multi-investor roundtable) analysis.

Your task is to produce a SELF-CONTAINED HTML document that presents each guru's analysis in a visually compelling way. Think: investor presentation deck meets Apple design.

=== INPUT ===
Topic: ${data.content}
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
  .guru-avatar { width: 44px; height: 44px; border-radius: 50%; background: var(--color-background-secondary, #f5f5f5); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 600; color: var(--color-text-secondary, #666); }
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
3. Guru Cards: one card per guru (.guru-card) with avatar initial, name, framework, analysis paragraph, conviction bar. The signal badge (.guru-signal) is positioned at the TOP-RIGHT corner of the card via CSS absolute positioning — just add it as a direct child of .guru-card.
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
Topic: ${data.content}
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

      // ── Helper: run HTML generation stream and return the result ──
      const runHtmlGeneration = async (htmlInput: string): Promise<string> => {
        const htmlPrompt = queryType === 'guru-council'
          ? buildGuruCouncilHtmlPrompt(htmlInput)
          : buildWebReportPrompt(htmlInput);
        const htmlStream = await aiService.chatStream([{ role: 'user', content: htmlPrompt }], 'superagent', undefined, 16384);
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

      // ── Start parallel HTML generation for non-roundtable eligible queries ──
      const htmlEligible = queryType === 'investment-analysis' || queryType === 'guru-council' || isDeepResearch;
      let parallelHtmlPromise: Promise<string> | null = null;
      if (htmlEligible && !isDeepResearch && contextString.length > 200) {
        console.log(`[agent:chat:html] Starting PARALLEL HTML generation (queryType=${queryType}), contextString length=${contextString.length}`);
        emitToUser(userId, 'agent:chat:html_generating', { sessionId, msgIdx: -1 }); // msgIdx resolved later
        parallelHtmlPromise = runHtmlGeneration(contextString).catch(err => {
          console.error('[agent:chat:html] ❌ Parallel HTML generation failed:', err.message);
          return '';
        });
      }

      try {
        console.log('[agent:chat] Starting synthesis stream (queryType=%s), prompt length:', queryType, synthesizePrompt.length);
        const synthesisStream = await aiService.chatStream([{ role: 'user', content: synthesizePrompt }], 'superagent', undefined, synthesisMaxTokens);
        console.log('[agent:chat] Synthesis stream obtained, reading...');
        const synReader = synthesisStream.getReader();
        const synDecoder = new TextDecoder();
        let synFullContent = '';
        let synBuffer = '';

        while (true) {
          const { done, value } = await synReader.read();
          if (done || isAborted()) {
            if (!isAborted() && synBuffer.trim().startsWith('data: ') && synBuffer.trim() !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(synBuffer.trim().slice(6).trim());
                const delta = parsed.choices?.[0]?.delta?.content || '';
                if (delta) { synFullContent += delta; if (!isDeepResearch) streamToChat(delta); }
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
                if (delta) { synFullContent += delta; if (!isDeepResearch) streamToChat(delta); }
              } catch (e) { }
            }
          }
        }

        if (isAborted()) {
          console.log(`[agent:chat] Aborted after synthesis stream for session ${sessionId}`);
          activeChatSessions.delete(sessionId);
          chatAbortControllers.delete(sessionId);
          return;
        }

        const dur = Math.max(0, Math.round((Date.now() - startTime) / 1000));

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

          try {
            // Phase 2: Expert debate — send initial draft to consensus engine
            emitter.emitModule('consensus', 'active', { status: 'discussing', round: 1, maxRounds: 3 });
            // Detect language so experts respond consistently
            const isZhTask = /[\u4e00-\u9fff]/.test(data.content);
            const langInstruction = isZhTask
              ? '\n\n重要：你的所有分析和结论必须全部使用中文。不要评价报告本身的质量，而是对分析主题给出你自己的独立分析和判断。'
              : '\n\nIMPORTANT: Provide your own independent analysis of the topic, NOT a review of the report quality. Respond entirely in English.';
            const consensusTask = `You are a senior investment analyst. Based on the following research, provide your independent analysis and investment verdict on the topic: "${data.content}"

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

            const deepStream = await aiService.chatStream([{ role: 'user', content: deepResearchFinalPrompt }], 'superagent', undefined, 16384);
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
          }
        }

        if (consensusFlowData) {
          flowModules.push({ type: 'consensus', status: 'completed', data: consensusFlowData as unknown as Record<string, unknown> });
        }
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
                route: 'Super Agent Orchestrator'
              },
              consensusResult: savedConsensusResult ?? undefined,
              quoteCard: savedQuoteCard ?? undefined,
            })
          }
        });

        emitter.emitModule('done', 'completed', { duration: dur });
        emitter.emitStreamDone(finalDbContent);

        // --- HTML report: await parallel result or generate sequentially for roundtable ---
        if (parallelHtmlPromise) {
          // Non-roundtable: HTML was already generating in parallel, just await it
          console.log(`[agent:chat:html] Awaiting parallel HTML promise...`);
          const htmlContent = await parallelHtmlPromise;
          await emitHtmlResult(htmlContent);
        } else if (htmlEligible && isDeepResearch && finalDbContent && finalDbContent.length > 200) {
          // Roundtable / deep research: generate sequentially since we need the full consensus content
          const pendingMsgCount = await prisma.chatMessage.count({ where: { sessionId } });
          const genMsgIdx = pendingMsgCount - 1;
          emitToUser(userId, 'agent:chat:html_generating', { sessionId, msgIdx: genMsgIdx });
          console.log(`[agent:chat:html] Starting SEQUENTIAL HTML generation for roundtable, input length=${finalDbContent.length}`);
          try {
            const htmlContent = await runHtmlGeneration(finalDbContent);
            await emitHtmlResult(htmlContent);
          } catch (htmlErr: any) {
            console.error('[agent:chat:html] ❌ Roundtable HTML generation failed:', htmlErr.message);
          }
        }
      } catch (err: any) {
        console.error('[agent:chat] SYNTHESIS ERROR:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
        emitToUser(userId, 'agent:chat:error', { sessionId, error: err.message });
        emitter.emitModule('done', 'completed', { duration: 0 });
      }
      activeChatSessions.delete(sessionId);
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