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
          } catch(e) {
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
        } catch (dbErr) {}
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
          const stream = await aiService.chatStream(mappedContext, 'superagent');
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
                } catch (e) {}
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
          } catch (e) {}
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
            {name: 'Yahoo Finance'}, {name: 'Bloomberg API'}, {name: 'Alpha Vantage'}, 
            {name: 'Polygon.io'}, {name: 'CoinGecko'}, {name: 'TradingView'}
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
              onSynthesisToken: () => {},
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
                {name: 'Yahoo Finance'}, {name: 'Bloomberg API'}, {name: 'Alpha Vantage'}, 
                {name: 'Polygon.io'}, {name: 'CoinGecko'}, {name: 'TradingView'}
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
          {id: 'fundamental', label: 'Fundamental analysis', status: 'pending', result: [] as any[]},
          {id: 'technical', label: 'Technical analysis', status: 'pending', result: [] as any[]},
          {id: 'sentiment', label: 'Sentiment analysis', status: 'pending'}
        ];
        emitter.emitModule('analysis', 'active', { stages: analysisStages });

        const analysisStockCode = (plan.capabilities.analysis.tickers?.[0] || data.content).trim();

        promises.push(
          (async () => {
            try {
              // Step 1: Fetch raw market data
              emitToUser(userId, 'agent:chat:tool_trace', { sessionId, step: { type: 'tool_start', tool: 'fetch_market_data', displayName: 'Fetching market data', ts: Date.now() } });
              const marketData = await fetchMarketData(analysisStockCode);
              emitToUser(userId, 'agent:chat:tool_trace', { sessionId, step: { type: 'tool_done', tool: 'fetch_market_data', displayName: 'Fetching market data', success: true, ts: Date.now() } });

              // Populate analysis stages from fetched data
              if (marketData.realtime_quote) {
                const q = marketData.realtime_quote;
                analysisStages[0].status = 'done';
                analysisStages[0].result = [
                  q.pe_ratio != null ? { label: 'PE', value: typeof q.pe_ratio === 'number' ? q.pe_ratio.toFixed(1) + 'x' : String(q.pe_ratio), color: 'text-blue-600' } : null,
                  q.pb_ratio != null ? { label: 'PB', value: typeof q.pb_ratio === 'number' ? q.pb_ratio.toFixed(2) + 'x' : String(q.pb_ratio), color: 'text-indigo-600' } : null,
                  q.turnover_rate != null ? { label: 'Turnover', value: typeof q.turnover_rate === 'number' ? q.turnover_rate.toFixed(2) + '%' : String(q.turnover_rate), color: 'text-amber-600' } : null,
                ].filter(Boolean);
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
          hedgefundService.runAnalysis({ tickers, showReasoning: true }, () => {})
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

      streamToChat('*Orchestrator synthesizing raw reports...*\n\n');

      const synthesizePrompt = getGlobalTimeContext() + `You are the Final Investment Synthesizer — a senior analyst who writes sharp, opinionated research reports that people actually want to read.

Your job: take raw outputs from multiple specialist agents and synthesize them into ONE cohesive, insightful analysis. Write like a top-tier analyst blogger — authoritative, direct, with clear opinions backed by evidence.

**Internal Analysis (do NOT output, think through first):**
- What is the core narrative here?
- Where do agents agree? Where do they contradict?
- What is the real alpha signal?
- What claim sounds right but might be wrong?

**Writing Style:**
- Write in an analyst blog tone — confident, clear, opinionated. Use "My take:" to give direct assessments.
- Use narrative paragraphs, NOT bullet-point dumps. Mix in tables when comparing claims/evidence.
- Every section title must be UNIQUE and topic-specific — never generic labels like "Key Findings" or "Deep Analysis".
- Use **bold text** for subsections. NEVER use ### or #### headings.

**Report Structure (adapt section count and titles to the topic):**

# [A sharp, specific headline that captures the core insight — like a news article title]

## Key Takeaways
- 4-6 bullet points. Each one a standalone insight. No fluff.

## [Topic-Specific Section Title — e.g., "The Liquidity Squeeze Nobody's Talking About"]
Narrative analysis. Mix data points with interpretation. Use "My take:" for your direct opinion.
If search reports contain URLs, cite them as clickable Markdown links inline, e.g. ([Bloomberg](https://...)).
For analysis/simulation findings, cite as [Analysis] or [Simulation].

## [Another Topic-Specific Section Title — e.g., "Why the Bears Are Wrong This Time"]
Continue the analysis. Challenge assumptions. Surface contradictions between agents.

If simulation reports include multiple analyst panelists, present them in a table:

| Claim | Evidence | Market Reaction | My Take |
|-------|----------|-----------------|---------|
| ... | ... | ... | ... |

## [Risk Section with Topic-Specific Title — e.g., "Three Things That Could Blow This Up"]
Top risks as narrative bullets with severity context. Be specific, not generic.

**Bottom line:** [One paragraph — the clearest, most actionable conclusion. State Buy/Hold/Sell/Watch if applicable, with entry/exit signals.]

Significance: [High / Medium / Low] · Categories: [2-3 relevant tags, e.g., "Market Structure, Macro, Sentiment"]

---

**Questions to watch:**
- [Forward-looking question that would change the thesis]
- [Question about a data point that needs monitoring]
- [Question about a risk that could materialize]

═══ ABSOLUTE RULES ═══
1. DO NOT use '### ' or '#### ' heading levels — they break the frontend. Use **bold text** for subsections.
2. Section titles MUST be unique and specific to the topic. NEVER use generic titles like "Key Findings", "Deep Analysis", "Risk & Uncertainty", "Scenario Forecast", or "Action Recommendation".
3. Synthesize, do not concatenate. Connect findings across agents. Surface agreements, contradictions, and emergent insights.
4. Never fabricate. Only use information present in the raw reports below.
5. INLINE CITATIONS: Retain URLs from search reports as clickable Markdown links next to relevant facts.
6. Mirror the user's language. If the user wrote in Chinese, respond in Chinese. If English, respond in English.
7. Length: 600-1200 words. Depth over brevity, but no padding.
8. End with "Questions to watch" — 3-4 forward-looking questions that would change the investment thesis.
9. If conversation history is present, write as a CONTINUATION. Do NOT repeat facts already covered in previous turns. Reference prior analysis naturally (e.g., "Following up on the Shenzhen analysis, Hong Kong shows...").

Begin directly with the headline. No meta-commentary.

═══ RAW AGENT REPORTS ═══
${contextString}
═══ END OF REPORTS ═══

Write the final synthesis report now:
`;

      try {
        console.log('[agent:chat] Starting synthesis stream, prompt length:', synthesizePrompt.length);
        const synthesisStream = await aiService.chatStream([{ role: 'user', content: synthesizePrompt }], 'superagent');
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
                if (delta) { synFullContent += delta; streamToChat(delta); }
              } catch(e) {}
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
                if (delta) { synFullContent += delta; streamToChat(delta); }
              } catch (e) {}
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
          emitter.emitModule('consensus', 'active', { status: 'building', round: 1, maxRounds: 3 });
          emitter.emitModule('consensus', 'active', { status: 'discussing', round: 1, maxRounds: 3 });

          // Strip trailing "Questions to watch" section from synthesis before sending to consensus
          // (it will be extracted by the frontend and shown outside the answer)
          const questionsPattern = /\n(?:---\s*\n+)?(?:\*\*|#{1,3}\s*)[^\n]*?(?:question|watch|关注|问题)[^\n]*?\n((?:\s*(?:[-•*]|\d+[.)]\s).+\n?)+)\s*$/i;
          const questionsMatch = synFullContent.match(questionsPattern);
          const cleanedSynthesis = questionsMatch
            ? synFullContent.slice(0, questionsMatch.index).trimEnd()
            : synFullContent;
          // Keep the questions for appending after consensus
          const questionsSection = questionsMatch ? questionsMatch[0] : '';

          // If questions were found and stripped, replace the streamed content so the
          // frontend no longer shows them in the middle of the response.
          if (questionsMatch) {
            emitter.emitContentReplace(cleanedSynthesis);
          }

          try {
            streamToChat('\n\n*Sending report to Expert Council for consensus evaluation...*\n');
            const consensusTask = getGlobalTimeContext() + `Please review this Synthesized Financial Report and provide your final Verdict and Analysis:\n\n${cleanedSynthesis}`;
            const consensusResult = await runConsensusEngine(userId, 'roundtable', consensusTask);
            
            const finalAnswerText = consensusResult.consensus?.finalAnswer || '';
            
            // Build Expert Council section — only show individual experts if they differ
            let expertSection = '';
            const agentResponses = consensusResult.consensus?.agentResponses || [];
            if (agentResponses.length > 0) {
              const agentNames = ['Fundamental Analyst', 'Macro Strategist', 'Sentiment Engine', 'Quant Tracker'];
              const nameMap: Record<string, string> = {
                agent_0: 'Fundamental Analyst',
                agent_1: 'Macro Strategist',
                agent_2: 'Sentiment Engine',
                agent_3: 'Quant Tracker',
              };
              // Check if all experts gave the same answer (consensus engine often duplicates)
              const answers = agentResponses.map((r: any) => r.answer?.trim());
              const uniqueAnswers = new Set(answers);
              
              if (uniqueAnswers.size > 1) {
                // Experts actually disagree — show individual perspectives
                expertSection += `\n\n**Individual Expert Perspectives:**\n\n`;
                agentResponses.forEach((resp: any, idx: number) => {
                  const name = nameMap[resp.agentId] || agentNames[idx] || resp.agentId;
                  const conf = Math.round(resp.confidence * 100);
                  expertSection += `**${name}** (${conf}% confidence):\n${resp.answer}\n\n`;
                });
              }
            }

            if (finalAnswerText) {
              const fullConsensusText = `\n\n---\n\n## Expert Council Verdict\n\n${finalAnswerText}${expertSection}`;
              finalDbContent = cleanedSynthesis + fullConsensusText + questionsSection;
              streamToChat(fullConsensusText + questionsSection);
            } else {
              finalDbContent = cleanedSynthesis + questionsSection;
            }
            
            if (consensusResult.consensus) {
              consensusResult.consensus.finalAnswer = finalDbContent;
            }

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
              round: Math.min(3, Number(consensusResult.consensus?.roundsUsed ?? 3) || 3),
              maxRounds: 3,
              conclusion: { verdict: verdictLabel, confidence: conf },
            };
            emitter.emitModule('consensus', 'completed', consensusFlowData);
            
            socket.emit('agent:chat:consensus_done', {
              sessionId,
              result: consensusResult
            });
          } catch (e: any) {
            finalDbContent = cleanedSynthesis + `\n\n---\n\n## ⚠️ Consensus Error\n${e.message}` + questionsSection;
            streamToChat(`\n\n---\n\n## ⚠️ Consensus Error\n${e.message}` + questionsSection);
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

