import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { verifyToken } from '../middleware/auth.js';
import prisma from '../db.js';
import { researchService } from '../services/research.service.js';
import { stockAnalysisService } from '../services/stockanalysis.service.js';
import { hedgefundService } from '../services/hedgefund.service.js';
import { LokaAIService } from '../services/ai.service.js';
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

    socket.on('agent:chat', async (data: { content: string; mode: string; sessionId?: string; agentId?: string; hidden?: boolean }) => {
      if (!data?.content) return;

      console.log('[agent:chat]', {
        sessionId: data.sessionId,
        contentPreview: data.content.slice(0, 80),
      });

      const sessionId = data.sessionId || crypto.randomUUID();
      const emitter = createModuleEmitter(userId, sessionId);

      if (!data.hidden) {
        try {
          await prisma.chatMessage.create({
            data: { userId, sessionId, role: 'user', content: data.content, agentId: 'superagent' }
          });
        } catch (dbErr) {}
      }

      activeChatSessions.set(sessionId, 'running');
      emitter.emitStarted('auto', 'Super Agent', data.hidden);
      socket.emit('agent:chat:routing', { sessionId });

      let plan: any;
      try {
        plan = await aiService.evaluateRouting(data.content);
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
            if (done) break;
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
        let activeSections = [{ id: 'data_providers', label: 'Fetching market data', status: 'pending', providers: [] }];
        let analysisStages = [
          {id: 'fundamental', label: 'Fundamental analysis', status: 'pending', result: [] as any[]},
          {id: 'technical', label: 'Technical analysis', status: 'pending', result: [] as any[]},
          {id: 'sentiment', label: 'Sentiment analysis', status: 'pending'}
        ];
        emitter.emitModule('analysis', 'active', { stages: analysisStages });

        promises.push(
          new Promise(resolve => {
            stockAnalysisService.runStreamAnalysis(
              "Analyze: " + (plan.capabilities.analysis.tickers?.join(', ') || data.content),
              sessionId,
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
                  } catch(e){}
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
      let contextString = "【User Original Request】\n" + data.content + "\n\n";
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          contextString += `【${r.value.type} REPORT】\n${r.value.data}\n\n`;
        }
      });

      streamToChat('*Orchestrator synthesizing raw reports...*\n\n');

      const synthesizePrompt = `You are the Final Investment Synthesizer Agent — the "Big Boss" and quality gatekeeper of the entire multi-agent research pipeline.

Your sole responsibility: take the raw outputs from multiple specialist agents below and synthesize them into ONE single, coherent, professional final report for the user.

**Internal Analysis (do NOT output, do in your head first):**
- What is each agent's core finding?
- Where do they agree? Where do they contradict?
- What is the most actionable alpha signal for the user?
- What are the top risks the user MUST know?

**Output the Final Report using this exact structure:**

# [A precise report title tailored to the user's actual question]

**Executive Summary** — 3-5 sentences capturing the essential market narrative or investment thesis.

## Key Findings
Bullet points ordered by importance. For each finding, cite its source:
- If the fact comes from the Search Report AND a specific URL is available in that report, cite it as a clickable Markdown link, e.g. ([Reddit](https://reddit.com/...)) or ([Bloomberg](https://bloomberg.com/...)). Use the most relevant URL from the search report for that specific fact.
- If no specific URL is available for a search finding, write [Search].
- For analysis or simulation findings, write [Analysis] or [Simulation] respectively.

## Deep Analysis
Discuss market data, macro context, sentiment, technical signals. Use **bold text** for any subsections — NEVER use ### or ####.
Reference agents inline: e.g., [Analysis Agent], [Search Agent], [Simulation Agent].
If simulation reports include multiple analyst panelists (e.g., Warren Buffett, Charlie Munger, etc.), you MUST list EVERY SINGLE panelist with their signal and key reasoning — do not omit anyone.

## Risk & Uncertainty
List the top 3 risks as bullet points with severity (High / Medium / Low) and impact on the decision.
If any data is missing or conflicting, explicitly state: "Data insufficient — recommend triggering [Agent name] for supplementary query."

## Scenario Forecast
- **Base Case (most likely):** ...
- **Bull Case (optimistic):** ...
- **Bear Case (pessimistic):** ...

## Action Recommendation
State clearly: Buy / Hold / Sell / Watch — with key entry/exit signals and suggested position sizing or allocation guidance.
If this is a broad market query (not a specific stock), give macro allocation guidance instead.

## Confidence Score: X/10
Brief justification. Deduct points for data gaps, conflicting signals, or high macro uncertainty.

---
**⚡ Bottom Line:** [One single sentence — the clearest possible conclusion for the user's question.]

═══ ABSOLUTE RULES ═══
1. DO NOT use '### ' or '#### ' heading levels — they break the frontend UI renderer. Use **bold text** for subsections.
2. Synthesize, do not concatenate. Connect findings across all agents. Surface agreements, contradictions, and emergent insights.
3. Never fabricate. Only use information present in the raw reports below.
4. INLINE CITATIONS: If search reports contain URLs or news sources, retain them as clickable Markdown links (e.g., [Bloomberg](https://...)) next to relevant facts.
5. Mirror the user's language. If the user wrote in Chinese, respond in Chinese. If English, respond in English.
6. Length: 600-1000 words. Clarity over length.

Begin directly with the report title. No meta-commentary like "Here is the synthesized report".

═══ RAW AGENT REPORTS ═══
${contextString}
═══ END OF REPORTS ═══

Write the final synthesis report now:
`;

      try {
        const synthesisStream = await aiService.chatStream([{ role: 'user', content: synthesizePrompt }], 'superagent');
        const synReader = synthesisStream.getReader();
        const synDecoder = new TextDecoder();
        let synFullContent = '';
        let synBuffer = '';
        
        while (true) {
          const { done, value } = await synReader.read();
          if (done) {
            if (synBuffer.trim().startsWith('data: ') && synBuffer.trim() !== 'data: [DONE]') {
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
          try {
            streamToChat('\n\n*Sending report to Expert Council for consensus evaluation...*\n');
            const consensusTask = `Please review this Synthesized Financial Report and provide your final Verdict and Analysis:\n\n${synFullContent}`;
            const consensusResult = await runConsensusEngine(userId, 'roundtable', consensusTask);
            
            const finalAnswerText = consensusResult.consensus?.finalAnswer || '';
            let expertDebateText = '';
            
            if (consensusResult.consensus?.agentResponses?.length) {
              expertDebateText += `\n\n#### 🕵️‍♂️ Individual Expert Analysis\n\n`;
              consensusResult.consensus.agentResponses.forEach((resp: any, idx: number) => {
                const agentNames = ['Fundamental Analyst', 'Macro Strategist', 'Sentiment Engine', 'Quant Tracker'];
                let name = agentNames[idx] || resp.agentId;
                // mapping agent_0, agent_1 to names if possible
                if (resp.agentId === 'agent_0') name = 'Fundamental Analyst';
                if (resp.agentId === 'agent_1') name = 'Macro Strategist';
                if (resp.agentId === 'agent_2') name = 'Sentiment Engine';
                if (resp.agentId === 'agent_3') name = 'Quant Tracker';
                
                expertDebateText += `**${name}** (Confidence: ${Math.round(resp.confidence * 100)}%):\n${resp.answer}\n\n`;
              });
            }

            if (finalAnswerText) {
              const fullConsensusText = `\n\n### ⚡ Expert Council Verdict\n${finalAnswerText}${expertDebateText}`;
              finalDbContent += fullConsensusText;
              streamToChat(fullConsensusText);
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
            finalDbContent += `\n\n### ⚠️ Consensus Error\n${e.message}`;
            streamToChat(`\n\n### ⚠️ Consensus Error\n${e.message}`);
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
        emitToUser(userId, 'agent:chat:error', { sessionId, error: err.message });
        emitter.emitModule('done', 'completed', { duration: 0 });
      }
      activeChatSessions.delete(sessionId);
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

