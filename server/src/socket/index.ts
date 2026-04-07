import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { verifyToken } from '../middleware/auth.js';
import prisma from '../db.js';
import { researchService } from '../services/research.service.js';
import { stockAnalysisService } from '../services/stockanalysis.service.js';
import { hedgefundService } from '../services/hedgefund.service.js';
import { LokaAIService } from '../services/ai.service.js';
import { runConsensusEngine } from '../services/consensus.service.js';
import * as crypto from 'crypto';

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

    socket.on('agent:chat', async (data: { content: string; mode: string; sessionId?: string; agentId?: string; hidden?: boolean }) => {
      if (!data?.content) return;
      
      const sessionId = data.sessionId || crypto.randomUUID();
      let mode = data.mode || 'auto';
      let tickers: string[] | undefined;
      
      // Dynamic Routing for Auto mode
      if (mode === 'auto') {
        socket.emit('agent:chat:routing', { sessionId });
        const routingData = await aiService.evaluateRouting(data.content);
        mode = routingData.mode;
        tickers = routingData.tickers;
        
        // Frontend expects 'fast' or 'collaborate' for standard chat visualization rules
        const displayMode = (mode === 'stockanalysis' || mode === 'hedgefund') ? 'fast' : mode;
        socket.emit('agent:chat:routed', { sessionId, mode: displayMode });
        // Give frontend a tiny bit of time to render the switch if necessary
        await new Promise(r => setTimeout(r, 300));
      }

      const useConsensus = mode === 'collaborate' || mode === 'roundtable';
      const isToolMode = mode === 'stockanalysis' || mode === 'hedgefund';
      const displayMode = isToolMode ? 'fast' : mode;
      
      activeChatSessions.set(sessionId, displayMode);

      socket.emit('agent:chat:started', { content: data.content, sessionId, mode: displayMode, hidden: !!data.hidden });

      if (!data.hidden) {
        try {
          await prisma.chatMessage.create({
            data: {
              userId,
              sessionId,
              role: 'user',
              content: data.content,
              agentId: data.agentId || 'superagent'
            }
          });
        } catch (dbErr) {
          console.error('Failed to save chat user message:', dbErr);
        }
      }

      try {
        if (mode === 'stockanalysis' && tickers && tickers.length > 0) {
          emitToUser(userId, 'agent:chat:progress', { content: `*⏳ Running Stock Analysis for ${tickers.join(', ')}...*\n\n`, sessionId });
          await stockAnalysisService.runAnalysis(
            { tickers },
            sessionId,
            (log: string) => {
               // Stream intermediate logs to chat bubble if we want:
               // emitToUser(userId, 'agent:chat:progress', { content: log + '\n', sessionId });
            },
            async (report: string) => {
               try {
                 await prisma.chatMessage.create({
                   data: { userId, sessionId, role: 'assistant', content: report, agentId: 'stockanalysis' }
                 });
               } catch (e) {}
               emitToUser(userId, 'agent:chat:stream_done', { sessionId, content: `*⏳ Running Stock Analysis for ${tickers.join(', ')}...*\n\n---\n` + report });
               activeChatSessions.delete(sessionId);
            }
          );
        } else if (mode === 'hedgefund' && tickers && tickers.length > 0) {
          emitToUser(userId, 'agent:chat:progress', { content: `*🧠 Running AI Hedge Fund Analysis for ${tickers.join(', ')}...*\n\n`, sessionId });
          const hfResult = await hedgefundService.runAnalysis({ tickers, showReasoning: true }, () => {});
          const report = hedgefundService.formatReport(hfResult);
          try {
            await prisma.chatMessage.create({
              data: { userId, sessionId, role: 'assistant', content: report, agentId: 'hedgefund' }
            });
          } catch (e) {}
          emitToUser(userId, 'agent:chat:stream_done', { sessionId, content: `*🧠 Running AI Hedge Fund Analysis for ${tickers.join(', ')}...*\n\n---\n` + report });
          activeChatSessions.delete(sessionId);
        } else if (useConsensus) {
          // Consensus Mode
          const result = await runConsensusEngine(userId, mode, data.content);
          
          try {
            await prisma.chatMessage.create({
              data: {
                userId,
                sessionId,
                role: 'assistant',
                content: result.consensus.finalAnswer || 'No consensus reached.',
                agentId: data.agentId || 'superagent',
                metadata: JSON.stringify({
                  type: 'consensus',
                  mode: result.mode,
                  groupId: result.groupId,
                  confidence: result.consensus.confidence,
                  agentResponses: result.consensus.agentResponses,
                  weightedVotes: result.consensus.weightedVotes,
                  roundsUsed: result.consensus.roundsUsed,
                  executionTime: result.consensus.executionTime,
                  consensusReached: result.consensus.consensusReached,
                })
              }
            });
          } catch (dbErr) {
            console.error('Failed to save chat assistant message:', dbErr);
          }
          
          emitToUser(userId, 'agent:chat:consensus_done', { sessionId, result });
          activeChatSessions.delete(sessionId);
        } else {
          // Streaming Mode (Auto/Fast)
          const context = await prisma.chatMessage.findMany({
            where: { userId, sessionId },
            orderBy: { createdAt: 'asc' },
            take: 20,
          });
          
          // Map to format that AI service expects
          const mappedContext = context.map(m => ({
            role: m.role,
            content: m.content,
            agentId: m.agentId,
          }));
          
          const stream = await aiService.chatStream(mappedContext, data.agentId || 'loka-agent');
          const reader = stream.getReader();
          const decoder = new TextDecoder();
          let fullContent = '';
          let streamBuffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // Flush any remaining flushable content
              if (streamBuffer.trim().startsWith('data: ') && streamBuffer.trim() !== 'data: [DONE]') {
                try {
                   const parsed = JSON.parse(streamBuffer.trim().slice(6).trim());
                   const delta = parsed.choices?.[0]?.delta?.content || '';
                   if (delta) {
                     fullContent += delta;
                     emitToUser(userId, 'agent:chat:progress', { content: delta, sessionId });
                   }
                } catch(e) {}
              }
              break;
            }

            streamBuffer += decoder.decode(value, { stream: true });
            
            // SSE lines are separated by \n. We split and keep the last (potentially incomplete) piece in the buffer.
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
                    emitToUser(userId, 'agent:chat:progress', { content: delta, sessionId });
                  }
                } catch (e) {
                  // ignore parse error if somehow SSE sends broken JSON on a full line
                }
              }
            }
          }
          
          try {
            await prisma.chatMessage.create({
              data: {
                userId,
                sessionId,
                role: 'assistant',
                content: fullContent,
                agentId: data.agentId || 'superagent'
              }
            });
          } catch (dbErr) {
            console.error('Failed to save chat assistant message:', dbErr);
          }

          emitToUser(userId, 'agent:chat:stream_done', { sessionId, content: fullContent });
          activeChatSessions.delete(sessionId);
        }
      } catch (err: any) {
        emitToUser(userId, 'agent:chat:error', { sessionId, error: err.message });
        activeChatSessions.delete(sessionId);
      }
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

