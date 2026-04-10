import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { verifyToken } from '../middleware/auth.js';
import prisma from '../db.js';
import { researchService } from '../services/research.service.js';
import { stockAnalysisService } from '../services/stockanalysis.service.js';
import { hedgefundService } from '../services/hedgefund.service.js';
import { runInvestmentAnalysis, fetchMarketData, formatForAegean, callAegeanInvestment, transformAegeanResponse } from '../services/investment.service.js';
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

      // ── Aegean Investment Pipeline ──
      // Extract stock code from tickers or raw query
      const stockCode = (data.tickers?.[0] || rawQuery).trim();

      try {
        const result = await runInvestmentAnalysis(
          stockCode,
          userId,
          (data as any).mode || 'auto',
          (stage, detail) => {
            emitToUser(userId, 'agent:stockanalysis:step', {
              sessionId,
              type: 'tool_start',
              tool: stage,
              displayName: stage.replace(/_/g, ' '),
              ...detail,
              ts: Date.now(),
            });
          },
        );

        const report = result.reportMarkdown || result.summary.thesis || 'Analysis completed.';

        try {
          await prisma.chatMessage.create({
            data: {
              userId,
              sessionId,
              role: 'assistant',
              content: report,
              agentId: 'stockanalysis',
              metadata: JSON.stringify({
                aegean: {
                  requestId: result.requestId,
                  action: result.recommendation.action,
                  confidence: result.recommendation.confidence,
                  riskGate: result.riskGate,
                  consensus: result.consensus,
                },
              }),
            }
          });
        } catch (dbErr) {
          console.error('Failed to save stockanalysis assistant message:', dbErr);
        }
        emitToUser(userId, 'agent:stockanalysis:done', { sessionId, report });
      } catch (err: any) {
        console.error('[agent:stockanalysis] Aegean pipeline error:', err.message);
        emitToUser(userId, 'agent:stockanalysis:error', { sessionId, error: err.message });
      }
      activeStockAnalysisSessions.delete(sessionId);
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
      const lastSeen = (chatDedupMap as Map<string, number>).get(dedupKey);
      if (lastSeen && now - lastSeen < 3000) {
        console.log(`[agent:chat] Dedup: skipping duplicate message for session ${sessionId}`);
        return;
      }
      (chatDedupMap as Map<string, number>).set(dedupKey, now);
      // Prune old entries periodically
      if ((chatDedupMap as Map<string, number>).size > 100) {
        for (const [k, v] of (chatDedupMap as Map<string, number>)) {
          if (now - v > 10000) (chatDedupMap as Map<string, number>).delete(k);
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
        plan = { isSimpleChat: true, capabilities: { analysis: { needed: false }, search: { needed: false }, simulate: { needed: false } } };
      }

      if (data.mode === 'roundtable') {
        plan.isSimpleChat = false;
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
        let analysisStages = [
          { id: 'fundamental', label: 'Fundamental analysis', status: 'pending', result: [] as any[] },
          { id: 'technical', label: 'Technical analysis', status: 'pending', result: [] as any[] },
          { id: 'sentiment', label: 'Sentiment analysis', status: 'pending' }
        ];
        emitter.emitModule('analysis', 'active', { stages: analysisStages });

        const analysisStockCode = (plan.capabilities.analysis.tickers?.[0] || data.content).trim();

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
                        emitToUser(userId, 'agent:chat:quote', {
                          sessionId,
                          quote: {
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
                          },
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
              if (marketData.trend_analysis) {
              const t = marketData.trend_analysis;
              const zhEn: Record<string, string> = {
                '牛市排列': 'Bullish', '多头排列': 'Bullish', '空头排列': 'Bearish', '熊市排列': 'Bearish',
                '多头': 'Bullish', '空头': 'Bearish', '震荡': 'Sideways', '盘整': 'Consolidating',
                '上升趋势': 'Uptrend', '下降趋势': 'Downtrend', '横盘': 'Sideways',
                '买入': 'Buy', '卖出': 'Sell', '持有': 'Hold', '观望': 'Wait',
                '强烈买入': 'Strong Buy', '强烈卖出': 'Strong Sell',
                '看涨': 'Bullish', '看跌': 'Bearish', '中性': 'Neutral',
              };
              const tr = (v: string) => { if (!v) return v; for (const [zh, en] of Object.entries(zhEn)) { if (v.includes(zh)) return en; } return v; };
              analysisStages[1].status = 'done';
              analysisStages[1].result = [
                t.trend_status ? { label: 'Trend', value: tr(t.trend_status), color: tr(t.trend_status)?.includes('Bull') || tr(t.trend_status)?.includes('Up') ? 'text-emerald-600' : 'text-amber-600' } : null,
                t.ma_alignment ? { label: 'MA', value: tr(t.ma_alignment), color: 'text-violet-600' } : null,
                t.buy_signal ? { label: 'Signal', value: tr(t.buy_signal), color: tr(t.buy_signal) === 'Buy' ? 'text-emerald-600' : 'text-gray-600' } : null,
              ].filter(Boolean);
            }
            if (marketData.news?.results) {
              analysisStages[2].status = 'done';
              const newsCount = Array.isArray(marketData.news.results) ? marketData.news.results.length : 0;
              (analysisStages[2] as any).result = [{ label: 'Sources', value: `${newsCount} from Web`, color: 'text-cyan-600' }];
            }
            emitter.emitModule('analysis', 'active', { stages: analysisStages });

            // Step 2: Send to Aegean
            emitToUser(userId, 'agent:chat:tool_trace', { sessionId, step: { type: 'tool_start', tool: 'aegean_consensus', displayName: 'Aegean Expert Council analysis', ts: Date.now() } });
            const aegeanMode = data.mode || 'auto';
            const payload = formatForAegean(marketData, userId, aegeanMode);
            const aegeanResult = await callAegeanInvestment(payload);
            emitToUser(userId, 'agent:chat:tool_trace', { sessionId, step: { type: 'tool_done', tool: 'aegean_consensus', displayName: 'Aegean Expert Council analysis', success: true, ts: Date.now() } });

            const result = transformAegeanResponse(aegeanResult);
            const report = result.reportMarkdown || result.summary.thesis || 'Analysis completed.';

            analysisStages.forEach(s => { s.status = 'done'; });
            finalAnalysisStages = analysisStages;
            emitter.emitModule('analysis', 'completed', { stages: analysisStages });
            return { type: 'ANALYSIS' as const, data: report };
          } catch (err: any) {
            console.error('[agent:chat] Aegean analysis pipeline error:', err.message);
            analysisStages.forEach(s => { s.status = 'done'; });
            finalAnalysisStages = analysisStages;
            emitter.emitModule('analysis', 'completed', { stages: analysisStages });
            return { type: 'ANALYSIS' as const, data: 'Error: ' + err.message };
          }
      })()
        );
}

if (plan.capabilities.simulate.needed) {
  emitter.emitModule('simulation', 'active', { panelists: [{ name: 'Simulating...', status: 'active', verdict: 'Pending' }] });
  let tickers = plan.capabilities.simulate.tickers || [];
  if (!tickers.length) tickers = ['SPY', 'QQQ'];

  promises.push(
    hedgefundService.runAnalysis({ tickers, showReasoning: true }, () => { })
      .then(hfResult => {
        const panelists = Object.keys(hfResult.analyst_signals || {}).map(p => ({
          name: p,
          avatar: 'L',
          status: 'done',
          verdict: Object.values(hfResult.analyst_signals[p] || {})[0]?.signal || 'Hold',
          confidence: Object.values(hfResult.analyst_signals[p] || {})[0]?.confidence || 0
        }));
        finalPanelists = panelists;
        emitter.emitModule('simulation', 'completed', { panelists });
        const rep = hedgefundService.formatReport(hfResult);
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

const buildDeepResearchPrompt = (inputContext: string) => `You are a senior research director at a top-tier investment research firm.

Your task is to produce a professional-grade DEEP RESEARCH REPORT — the kind that institutional investors, fund managers, and sophisticated traders actually pay for and act on.

This is NOT a quick take or trader memo. This is a thorough, multi-dimensional research product that synthesizes all available evidence into a coherent investment thesis with rigorous supporting analysis.

=== INPUT ===
Topic: ${data.content}
${inputContext}

=== REPORT STRUCTURE ===

0. Report Title (MANDATORY)
- Format: # (single hash) for clear, professional framing
- Must convey the core thesis and asset/topic in one line
- Example: "# NVDA: AI Capex Cycle Peaks — Re-rating Risk Rising"
- Example: "# 英伟达深度研究：AI资本开支周期见顶，估值重评风险上升"

---

1. Research Overview (MANDATORY — NO HEADING, start directly)
A compact, high-density executive brief:
- **Verdict**: Bullish / Bearish / Neutral + Conviction Level (High/Medium/Low)
- **Core Thesis**: 2-3 sentences — What is the key insight the market is missing?
- **Key Catalysts**: Next 3-6 month triggers (with approximate dates if known)
- **Risk/Reward**: Quantified upside vs downside ratio

---

2. Methodology & Data Scope (MANDATORY) — Use ## heading
Brief statement of:
- What data sources were analyzed (news, social sentiment, on-chain/financial data, technical indicators)
- Time horizon of the analysis
- Any limitations or data gaps
- This builds credibility and helps the reader calibrate confidence

---

3–7. Core Analysis Modules (3-5 sections, DEEP)
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

8. Risk Matrix (MANDATORY) — Use ## heading
Professional risk assessment table:

| Risk Factor | Probability | Impact | Mitigation / Monitor |
|-------------|------------|--------|---------------------|
| [specific risk] | High/Med/Low | [quantified if possible] | [what to watch] |

Include minimum 4 risks across different categories (fundamental, technical, macro, sentiment).

---

9. Scenario Analysis (MANDATORY) — Use ## heading
Expanded scenario modeling with more granularity than a simple bull/base/bear:

| Scenario | Probability | Price Target | Timeline | Key Assumption | Trigger to Confirm |
|----------|------------|-------------|----------|----------------|-------------------|
| Aggressive Bull | ~% | $X | Xm | [assumption] | [observable trigger] |
| Base Bull | ~% | $X | Xm | [assumption] | [observable trigger] |
| Neutral | ~% | $X | Xm | [assumption] | [observable trigger] |
| Bear | ~% | $X | Xm | [assumption] | [observable trigger] |
| Tail Risk | ~% | $X | Xm | [assumption] | [observable trigger] |

---

10. Expert Debate Analysis (MANDATORY when expert debate data is provided) — Use ## heading
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

11. Actionable Strategy (MANDATORY) — Use ## heading
Concrete implementation plan:
- **Position sizing**: % of portfolio, scaling plan
- **Entry strategy**: Specific levels, order types, timing
- **Stop loss**: Hard stop + mental stop levels with logic
- **Take profit**: Staged exits with rationale
- **Hedging**: Options overlay or pair trade recommendations if applicable
- **Timeline**: Hold period expectation
- **Review triggers**: What would make you reassess (both positive and negative)

---

12. Key Monitoring Dashboard (THIS MUST BE THE VERY LAST SECTION)
- Translate heading to user's language (e.g. "关键监控指标")
- 5-8 specific, quantifiable metrics/events to track going forward
- Each item: what to monitor, current value → threshold that changes thesis, frequency of check
- Format as a structured list with bold metric names

═══ ABSOLUTE RULES ═══
1. HEADING LEVELS: # for report title. ## for section headings. **Bold** for subsections within. No ### or ####.
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

const traderMemoPrompt = `You are a top-tier macro + equity research analyst with strong opinions.

Your job is NOT to summarize information.
Your job is to form a clear, tradeable view and guide decision-making — grounded in rigorous fundamental, valuation, financial, and technical analysis.

Write like a sharp internal memo or trader note — not a formal report.

=== INPUT ===
Topic: ${data.content}
Context:
${contextString}

=== OUTPUT STRUCTURE ===

0. Title (OPTIONAL, HIGH-SIGNAL)
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

1. Executive Snapshot (MANDATORY — NO HEADING AT ALL)
- NEVER output a heading like "TL;DR", "Summary", "结论", "总结", "Executive Summary", or any variant. Start the content directly without any heading.
- First, a compact snapshot:
  Bias / Action / Confidence / Key Trigger (one line each)
- Then 2-3 sentences maximum:
  What's happening now? What is the market getting wrong? What's my unique edge?
- If writing in Chinese, translate ALL labels to Chinese. No English mixed in.

---

2–5. Deep-Dive Sections (2-4 sections, FLEXIBLE)
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

6. Signal vs Noise (MANDATORY) — Table format with your own creative ## heading:

| Noise (over-weighted by market) | Signal (under-weighted by market) |
|-------------------------------|----------------------------------|
| [thing + why it's noise] | [thing + why it matters] |

7. Positioning (MANDATORY) — Use your own creative ## heading.
Concrete: entry level, stop loss, target, position sizing logic. What to do NOW vs what to wait for. If no clear trade, say "wait for [specific catalyst]."

8. Stress Test (MANDATORY) — Use your own creative ## heading. NOT a disclaimer. Model 2-3 scenarios with probability and price impact:

| Scenario | Probability | Price Impact | Key Assumption |
|----------|------------|-------------|----------------|
| Bull | ~% | $X → $Y | [assumption] |
| Base | ~% | $X → $Y | [assumption] |
| Bear | ~% | $X → $Y | [assumption] |

Identify the floor price under panic conditions.

---

9. Tags (translate to user's language)
- Importance: High / Medium / Low · Categories: 2-3 tags

10. Questions to watch (THIS MUST BE THE VERY LAST SECTION — nothing after it)
- Translate heading to user's language (e.g. "值得关注的问题：")
- Format as **bold heading** followed by 3-5 bullet points
- Each bullet: forward-looking question tied to a specific data point or event with a time horizon
- CRITICAL: No text, tags, or sections may appear after this list

═══ ABSOLUTE RULES ═══
1. HEADING LEVELS: # for report title only. ## for all section headings. No ### or ####. Use **bold** for subsections.
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

// Round 1 always uses the trader memo prompt (quick initial draft)
// For roundtable: after consensus debate, a second Deep Research pass integrates everything
const synthesizePrompt = traderMemoPrompt;
const synthesisMaxTokens = 8192;

try {
  console.log('[agent:chat] Starting synthesis stream (%s mode), prompt length:', isDeepResearch ? 'deep-research' : 'trader-memo', synthesizePrompt.length);
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
        }
      })
    }
  });

  emitter.emitModule('done', 'completed', { duration: dur });
  emitter.emitStreamDone(finalDbContent);
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

