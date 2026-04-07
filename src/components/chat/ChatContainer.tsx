/**
 * ChatContainer — Unified chat shell replacing the 1456-line SuperAgentChat.
 *
 * Responsibilities:
 *  - Render messages (user + assistant)
 *  - Delegate app-specific logic to AgentAppAdapters
 *  - Manage thinking process panel for consensus modes
 *  - Provide mode switching and input
 *
 * What it does NOT do:
 *  - Know about specific apps (hedge fund, stock analysis, etc.)
 *  - Contain duplicated socket handlers
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { socket } from '../../services/socket';
import { renderMarkdownContent } from '../../utils/markdown';

import type { ChatMode, Message, ThinkingProcess, AgentThought, KnowledgeGraphData } from '../../types/chat';
import { MODES, AGENT_COUNCIL, buildKnowledgeGraph, AGENT_APPS } from '../../constants/modes';
import { getApp } from '../apps';
import type { AgentAppAdapter } from '../apps';

import ModeSelector from './ModeSelector';
import ThinkingPanel from './ThinkingPanel';
import KnowledgeGraph from './KnowledgeGraph';
import AppProgressLogs from './AppProgressLogs';

import { useAgentSocket, useMultiAgentSocket } from '../../hooks/useAgentSocket';
import { useSessionManager, fetchChatHistory } from '../../hooks/useSessionManager';

// ─── Icons (minimal, local) ────────────────────────────────
const SendIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
  </svg>
);
const BackIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);
const AttachIcon = () => <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>;
const ImageIcon = () => <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
const MicIcon = () => <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>;

// ═════════════════════════════════════════════════════════════
// ChatContainer — Main Component
// ═════════════════════════════════════════════════════════════
interface ChatContainerProps {
  /** The app to use: 'hedgefund' | 'stockanalysis' | null (generic chat) */
  app?: string | null;
  /** Initial user query */
  initialMessage?: string;
  /** Restore an existing session */
  restoreSessionId?: string;
  /** Initial chat mode */
  mode?: ChatMode;
  /** Go back to home */
  onBack: () => void;
}

const ChatContainer: React.FC<ChatContainerProps> = ({
  app = null,
  initialMessage,
  restoreSessionId,
  mode = 'auto',
  onBack,
}) => {
  // ─── Resolve adapter ──────────────────────────────────────
  const [restoredApp, setRestoredApp] = useState<string | null>(null);
  const activeApp = app || restoredApp;
  const adapter = activeApp ? getApp(activeApp) : getApp('generic');
  const isAppMode = !!activeApp && activeApp !== 'generic'; // dedicated app (HF, SA)

  // ─── Session ──────────────────────────────────────────────
  const { sessionId } = useSessionManager({ restoreSessionId });

  // ─── State ────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentMode, setCurrentMode] = useState<ChatMode>(mode);
  const [isRouting, setIsRouting] = useState(false);

  // Thinking process (for consensus modes)
  const [thinkingProcesses, setThinkingProcesses] = useState<Record<number, ThinkingProcess>>({});
  const [showGraphPanel, setShowGraphPanel] = useState(false);
  const [activeGraphMsgIdx, setActiveGraphMsgIdx] = useState<number | null>(null);

  // Research / App two-phase workflow
  const [workflowPhase, setWorkflowPhase] = useState<'idle' | 'research' | 'app' | 'consensus'>('idle');
  const [researchLogs, setResearchLogs] = useState<string[]>([]);
  const [researchSummary, setResearchSummary] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasSentInitial = useRef(false);
  // Refs to break closure staleness in socket handlers
  const sendGenericChatRef = useRef<(text: string, existingMessages?: Message[], hidden?: boolean) => void>(() => {});
  const currentModeRef = useRef(mode);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinkingProcesses]);

  // ─── Send to AI (generic chat) ────────────────────────────
  const sendGenericChat = useCallback((text: string, existingMessages?: Message[], hidden?: boolean) => {
    const genericAdapter = getApp('generic')!;
    genericAdapter.start({ query: text, sessionId, mode: currentMode, hidden });

    setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date().toLocaleTimeString(), isStreaming: true }]);

    if (currentMode === 'auto') return; // routing will handle panel injection

    const useConsensusEngine = currentMode === 'collaborate' || currentMode === 'roundtable';
    if (useConsensusEngine) {
      const msgIdx = (existingMessages ?? messages).length;
      const agents: AgentThought[] = AGENT_COUNCIL.map(a => ({
        agentId: a.id, agentName: a.name, agentIcon: a.icon, agentColor: a.color,
        status: 'analyzing' as const, summary: '',
        steps: [{ label: `${a.name} is thinking...`, status: 'active' as const }],
      }));
      setThinkingProcesses(prev => ({ ...prev, [msgIdx]: { agents, isActive: true, phase: 'generating' } }));
      setActiveGraphMsgIdx(msgIdx);
      setShowGraphPanel(true);
    }
  }, [sessionId, currentMode, messages]);

  // Keep refs fresh
  useEffect(() => { sendGenericChatRef.current = sendGenericChat; }, [sendGenericChat]);
  useEffect(() => { currentModeRef.current = currentMode; }, [currentMode]);

  // ─── Multi-agent chat socket handlers ─────────────────────
  useMultiAgentSocket(sessionId, {
    onStarted: () => { setShowGraphPanel(true); setIsStreaming(true); },
    onProgress: (data) => {
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (!last || last.role !== 'assistant') {
          updated.push({ role: 'assistant', content: data.content, timestamp: new Date().toLocaleTimeString(), isStreaming: true });
        } else {
          updated[updated.length - 1] = { ...last, content: (last.content || '') + data.content };
        }
        return updated;
      });
    },
    onStreamDone: (data) => {
      setIsStreaming(false);
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: data.content, isStreaming: false };
        }
        return updated;
      });
      window.dispatchEvent(new CustomEvent('session-done', { detail: { id: data.sessionId || sessionId } }));
    },
    onConsensusDone: (data) => {
      setIsStreaming(false);
      setMessages(prev => {
        const updated = [...prev];
        const msgIdx = updated.length - 1;
        if (updated[msgIdx] && updated[msgIdx].role === 'assistant') {
          const finalAnswer = data.result.consensus?.finalAnswer || 'No consensus reached.';
          updated[msgIdx] = { ...updated[msgIdx], content: finalAnswer, isStreaming: false, timestamp: new Date().toLocaleTimeString() };
        }
        return updated;
      });
      setThinkingProcesses(prev => {
        const keys = Object.keys(prev).map(Number).sort((a, b) => b - a);
        if (keys.length === 0) return prev;
        const msgIdx = keys[0];
        const tp = prev[msgIdx];
        if (!tp) return prev;
        const updatedAgents = tp.agents.map((agent: any, idx: number) => {
          const realResponse = data.result.consensus.agentResponses[idx];
          if (realResponse) {
            return { ...agent, status: 'completed', summary: realResponse.answer.slice(0, 150), details: realResponse.answer, confidence: Math.round(realResponse.confidence * 100), verdict: realResponse.confidence > 0.7 ? 'bullish' : 'neutral', steps: [{ label: `${agent.agentName} responded`, status: 'done' }] };
          }
          return { ...agent, status: 'completed', steps: [{ label: 'No response', status: 'done' }] };
        });
        return { ...prev, [msgIdx]: { ...tp, agents: updatedAgents as any, isActive: false, phase: 'persuading', consensus: { verdict: data.result.consensus.confidence > 0.7 ? 'bullish' : 'neutral', confidence: Math.round(data.result.consensus.confidence * 100), duration: data.result.consensus.executionTime } } };
      });
      window.dispatchEvent(new CustomEvent('session-done', { detail: { id: data.sessionId || sessionId } }));
    },
    onError: (data) => {
      setIsStreaming(false);
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: `⚠️ Error: ${data.error}`, isStreaming: false };
        } else {
          updated.push({ role: 'assistant', content: `⚠️ Error: ${data.error}`, timestamp: new Date().toLocaleTimeString() });
        }
        return updated;
      });
      setThinkingProcesses(prev => {
        const keys = Object.keys(prev).map(Number).sort((a, b) => b - a);
        if (keys.length === 0) return prev;
        return { ...prev, [keys[0]]: { ...prev[keys[0]], isActive: false } };
      });
      window.dispatchEvent(new CustomEvent('session-done', { detail: { id: data.sessionId || sessionId } }));
    },
    onRouting: () => setIsRouting(true),
    onRouted: (data) => {
      setIsRouting(false);
      setCurrentMode(data.mode as ChatMode);
      const useConsensusEngine = data.mode === 'collaborate' || data.mode === 'roundtable';
      if (useConsensusEngine) {
        setMessages(prev => {
          const msgIdx = prev.length - 1;
          const agents: AgentThought[] = AGENT_COUNCIL.map(a => ({
            agentId: a.id, agentName: a.name, agentIcon: a.icon, agentColor: a.color,
            status: 'analyzing' as const, summary: '',
            steps: [{ label: `${a.name} is thinking...`, status: 'active' as const }],
          }));
          setThinkingProcesses(tp => ({ ...tp, [msgIdx]: { agents, isActive: true, phase: 'generating' } }));
          setActiveGraphMsgIdx(msgIdx);
          setShowGraphPanel(true);
          return prev;
        });
      }
    },
  }, [currentMode, sendGenericChat]);

  // ─── App-specific socket handlers (HedgeFund, StockAnalysis) ──
  useAgentSocket(
    isAppMode && adapter ? adapter.socketPrefix : '',
    sessionId,
    {
      onStarted: () => setIsStreaming(true),
      onProgress: (data) => {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (!last || last.role !== 'assistant') {
            updated.push({ role: 'assistant', content: '', timestamp: new Date().toLocaleTimeString(), isStreaming: true, appLogs: [data.log], isAppRunning: true, appType: app || undefined });
          } else {
            updated[updated.length - 1] = { ...last, appLogs: [...(last.appLogs || []), data.log] };
          }
          return updated;
        });
      },
      onStep: (data) => {
        // Structured step events (stock analysis): accumulate into appSteps
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (!last || last.role !== 'assistant') {
            updated.push({ role: 'assistant', content: '', timestamp: new Date().toLocaleTimeString(), isStreaming: true, appSteps: [data], isAppRunning: true, appType: app || undefined });
          } else {
            updated[updated.length - 1] = { ...last, appSteps: [...(last.appSteps || []), data] };
          }
          return updated;
        });
      },
      onDone: (data) => {
        const report = data.report || data.summary || '';
        const mode = currentModeRef.current;
        const needsPhase2 = mode !== 'fast';

        // Mark Phase 1 complete — show raw report or setup collapsible report
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            if (needsPhase2) {
              updated[updated.length - 1] = {
                ...last,
                content: `> 📄 **System**: The underlying agent has completed the detailed data report. It is now included internally as context for the consensus engine.`,
                collapsibleReport: report,
                isStreaming: false,
                isAppRunning: false,
              };
            } else {
              updated[updated.length - 1] = { ...last, content: report, isStreaming: false, isAppRunning: false };
            }
          }
          return updated;
        });

        if (needsPhase2) {
          // Phase 2: Feed report to multi-agent chat engine
          setWorkflowPhase('consensus');
          const fullPrompt = `${initialMessage}\n\n[${adapter?.name || 'Agent'} Analysis Report]:\n${report}\n\n[System Instruction]: The above report is provided as background data. Please analyze this data and discuss it with your peers. You MUST write all your responses and thoughts purely in ENGLISH.`;
          // Construct existingMessages to fix ThinkingPanel index calculation
          const existingMessages: Message[] = [
            { role: 'user', content: initialMessage || '', timestamp: new Date().toLocaleTimeString() },
            { role: 'assistant', content: report, timestamp: new Date().toLocaleTimeString() },
          ];
          setTimeout(() => {
            sendGenericChatRef.current(fullPrompt, existingMessages, true);
          }, 200);
        } else {
          setIsStreaming(false);
          window.dispatchEvent(new CustomEvent('session-done', { detail: { id: data.sessionId || sessionId } }));
        }
      },
      onError: (data) => {
        setIsStreaming(false);
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: `⚠️ ${adapter?.name || 'App'} Error: ${data.error}`, isStreaming: false, isAppRunning: false };
          } else {
            updated.push({ role: 'assistant', content: `⚠️ Error: ${data.error}`, timestamp: new Date().toLocaleTimeString(), isAppRunning: false });
          }
          return updated;
        });
        window.dispatchEvent(new CustomEvent('session-done', { detail: { id: data.sessionId || sessionId } }));
      },
    },
    [app]
  );

  // ─── Research socket handlers (two-phase workflow) ────────
  useAgentSocket(
    workflowPhase === 'research' ? 'agent:research' : '',
    sessionId,
    {
      onStarted: () => setResearchLogs([]),
      onProgress: (data) => setResearchLogs(prev => [...prev, data.log]),
      onDone: (data) => {
        setResearchSummary(data.summary);
        setResearchLogs(prev => [...prev, '✓ Report generated successfully']);
        setWorkflowPhase('consensus');
        const fullPrompt = `${initialMessage}\n\n[Signal Radar Intercepted Data]:\n${data.summary}`;
        const existingMessages: Message[] = [{ role: 'user', content: initialMessage || '', timestamp: new Date().toLocaleTimeString() }];
        sendGenericChat(fullPrompt, existingMessages, true);
      },
      onError: (data) => {
        setResearchLogs(prev => [...prev, `⚠️ Error: ${data.error}`]);
        setWorkflowPhase('consensus');
        const existingMessages: Message[] = [{ role: 'user', content: initialMessage || '', timestamp: new Date().toLocaleTimeString() }];
        sendGenericChat(initialMessage || '', existingMessages, true);
      },
    },
    [initialMessage, sendGenericChat]
  );

  // ─── Restore history ──────────────────────────────────────
  useEffect(() => {
    if (!restoreSessionId) return;
    const load = async () => {
      setMessages([]);
      setThinkingProcesses({});
      setActiveGraphMsgIdx(null);
      setShowGraphPanel(false);
      try {
        const data = await fetchChatHistory(restoreSessionId);
        if (data.length > 0 && data[0].agentId && data[0].agentId !== 'superagent' && data[0].agentId !== 'generic') {
          setRestoredApp(data[0].agentId);
        }
        const newThinking: Record<number, ThinkingProcess> = {};
        setMessages(data.map((m: any, idx: number) => {
          if (m.metadata) {
            try {
              const parsedMeta = JSON.parse(m.metadata);
              if (parsedMeta && (parsedMeta.mode === 'collaborate' || parsedMeta.mode === 'roundtable')) {
                const agents = AGENT_COUNCIL.map((a, aIdx) => {
                  const r = parsedMeta.agentResponses && parsedMeta.agentResponses[aIdx];
                  return { agentId: a.id, agentName: a.name, agentIcon: a.icon, agentColor: a.color, status: r ? 'completed' : 'waiting', summary: r ? r.answer.slice(0, 150) : '', details: r ? r.answer : '', confidence: r ? Math.round(r.confidence * 100) : 0, verdict: r && r.confidence > 0.7 ? 'bullish' : 'neutral', steps: [{ label: r ? `${a.name} responded` : 'No response', status: 'done' }] };
                });
                newThinking[idx] = { agents: agents as any, isActive: false, phase: 'persuading', consensus: { verdict: parsedMeta.confidence > 0.7 ? 'bullish' : 'neutral', confidence: Math.round(parsedMeta.confidence * 100), duration: parsedMeta.executionTime } };
              }
            } catch (e) {}
          }
          return { role: m.role, content: m.content, timestamp: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        }));
        setThinkingProcesses(newThinking);
        if (Object.keys(newThinking).length > 0) {
          const maxIdx = Math.max(...Object.keys(newThinking).map(Number));
          setActiveGraphMsgIdx(maxIdx);
          setShowGraphPanel(true);
        }
        // Check if backend is still processing
        if (data.length > 0 && data[data.length - 1].role === 'user') {
          // Check generic chat first
          socket.emit('agent:chat:check', { sessionId: restoreSessionId }, (res: { isRunning: boolean; mode?: string }) => {
            if (res.isRunning) {
              setIsStreaming(true);
              setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date().toLocaleTimeString(), isStreaming: true }]);
              window.dispatchEvent(new CustomEvent('session-started', { detail: { id: restoreSessionId, title: data[0].content.slice(0, 60), agentId: 'superagent' } }));
            }
          });
          // Check stock analysis session (reconnection replay)
          if (activeApp === 'stockanalysis') {
            socket.emit('agent:stockanalysis:check', { sessionId: restoreSessionId }, (res: { isRunning: boolean; steps?: any[]; report?: string }) => {
              if (res.isRunning || (res.steps && res.steps.length > 0)) {
                setIsStreaming(!!res.isRunning);
                setMessages(prev => [
                  ...prev,
                  {
                    role: 'assistant',
                    content: res.report || '',
                    timestamp: new Date().toLocaleTimeString(),
                    isStreaming: !!res.isRunning,
                    appSteps: res.steps || [],
                    isAppRunning: !!res.isRunning,
                    appType: 'stockanalysis',
                  },
                ]);
                window.dispatchEvent(new CustomEvent('session-started', { detail: { id: restoreSessionId, title: data[0].content.slice(0, 60), agentId: 'stockanalysis' } }));
              }
            });
          }
        }
      } catch (err) {
        console.error('Failed to load chat history', err);
      }
    };
    load();
  }, [restoreSessionId]);

  // ─── Auto-send initial message ────────────────────────────
  useEffect(() => {
    if (hasSentInitial.current || restoreSessionId || !initialMessage) return;
    hasSentInitial.current = true;

    // Check if the app adapter can handle this query (e.g., contains valid tickers)
    const appCanHandle = isAppMode && adapter && adapter.canHandle(initialMessage);

    const userMsg: Message = {
      role: 'user',
      content: appCanHandle ? adapter!.formatUserMessage(initialMessage) : initialMessage,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages([userMsg]);

    if (appCanHandle) {
      // Dedicated app: use adapter start
      setMessages(prev => [...prev, {
        role: 'assistant', content: '', timestamp: new Date().toLocaleTimeString(),
        isStreaming: true, appLogs: [], isAppRunning: true, appType: app || undefined,
      }]);
      setIsStreaming(true);
      setTimeout(() => adapter!.start({ query: initialMessage, sessionId, mode: currentMode }), 50);
    } else if (app === 'research' && (currentMode === 'collaborate' || currentMode === 'roundtable')) {
      // Signal Radar + consensus = two-phase
      setWorkflowPhase('research');
      setTimeout(() => {
        socket.emit('agent:research', { topic: initialMessage, deep: false, days: 30, sessionId });
        window.dispatchEvent(new CustomEvent('session-started', { detail: { id: sessionId, title: initialMessage.slice(0, 60), agentId: 'superagent' } }));
      }, 50);
    } else {
      // Generic chat (fallback for apps that can't handle the input)
      setWorkflowPhase('consensus');
      setTimeout(() => sendGenericChat(initialMessage, [userMsg]), 50);
    }
  }, [initialMessage, restoreSessionId, sendGenericChat, adapter, isAppMode, app, currentMode, sessionId]);

  // ─── Handle send follow-up ────────────────────────────────
  const handleSend = () => {
    if (!inputText.trim() || isStreaming) return;
    const text = inputText.trim();
    const userMsg: Message = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText('');
    sendGenericChat(text, newMessages);
  };

  // ─── Derived state ────────────────────────────────────────
  const currentThinking = activeGraphMsgIdx !== null ? thinkingProcesses[activeGraphMsgIdx] : null;
  const currentKgData = currentThinking ? buildKnowledgeGraph() : null;
  const showModeSelector = !isAppMode || (adapter?.supportedModes?.length || 0) > 0;

  // Resolve display name: adapter > AGENT_APPS config > fallback
  const displayName = adapter?.name 
    || (app && AGENT_APPS[app]?.name) 
    || 'Loka SuperAgent';

  // ═════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* ══ Header ══ */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
        <button onClick={onBack} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all">
          <BackIcon />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center text-white text-xs font-black">L</div>
          <span className="text-sm font-semibold text-gray-900">{displayName}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-[10px] text-gray-400 font-medium">
            {isAppMode ? 'Agent Online' : '2 Agents Online'}
          </span>
          {currentKgData && (
            <div className="ml-2 pl-3 border-l border-gray-200 flex items-center gap-2 cursor-pointer" onClick={() => setShowGraphPanel(g => !g)}>
              <svg className={`w-3.5 h-3.5 transition-colors ${showGraphPanel ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="6" cy="6" r="3" strokeWidth="2"/><circle cx="18" cy="6" r="3" strokeWidth="2"/><circle cx="12" cy="18" r="3" strokeWidth="2"/>
                <line x1="8.83" y1="7.83" x2="15.17" y2="7.83" strokeWidth="1.5"/><line x1="6.93" y1="8.5" x2="11.07" y2="15.5" strokeWidth="1.5"/><line x1="17.07" y1="8.5" x2="12.93" y2="15.5" strokeWidth="1.5"/>
              </svg>
              <span className="text-[11px] font-medium text-gray-500">Multi-Agent Graph</span>
              <button type="button" className={`relative inline-flex h-4 w-7 ml-1 items-center rounded-full transition-colors ${showGraphPanel ? 'bg-blue-500' : 'bg-gray-200'}`} aria-pressed={showGraphPanel}>
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${showGraphPanel ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ══ Content Row ══ */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 md:px-10 py-8">
            <div className="max-w-2xl mx-auto space-y-8">
              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="max-w-[72%] px-4 py-3 bg-gray-900 text-white rounded-2xl rounded-br-sm shadow-sm">
                        <p className="text-[13px] leading-relaxed">{msg.content}</p>
                        <p className="text-[9px] text-gray-400 mt-1.5 text-right">{msg.timestamp}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-xl bg-gray-900 flex items-center justify-center text-white text-[10px] font-black shrink-0 mt-0.5">L</div>
                      <div className="flex-1 min-w-0">
                        {/* Research phase 1 summary */}
                        {researchSummary && i === 1 && (
                          <div className="mb-4">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-3.5 h-3.5 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              </div>
                              <span className="text-[11px] font-semibold text-gray-600">Phase 1: Signal Radar Intelligence Assembled</span>
                            </div>
                            <div className="ml-5 text-[10px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-3 max-h-32 overflow-y-auto">
                              <div className="font-semibold text-gray-700 mb-1">Raw Intelligence Report:</div>
                              {researchSummary.slice(0, 300)}... <span className="text-blue-500 underline cursor-pointer" title={researchSummary}>Hover to view</span>
                            </div>
                          </div>
                        )}

                        {/* Thinking process panel (consensus modes) */}
                        {thinkingProcesses[i] && (
                          <ThinkingPanel
                            thinking={thinkingProcesses[i]}
                            userQuery={messages.slice(0, i).reverse().find(m => m.role === 'user')?.content ?? ''}
                            onOpenGraph={() => { setActiveGraphMsgIdx(i); setShowGraphPanel(true); }}
                          />
                        )}

                        {/* App progress logs (HedgeFund, StockAnalysis, etc.) */}
                        {(msg.isAppRunning || (msg.appLogs && msg.appLogs.length > 0) || (msg.appSteps && msg.appSteps.length > 0)) && (
                          <AppProgressLogs
                            logs={msg.appLogs || []}
                            steps={msg.appSteps}
                            isRunning={!!msg.isAppRunning}
                            accentColor={adapter?.accentColor || 'blue'}
                            runningLabel={adapter?.runningLabel}
                            doneLabel={adapter?.doneLabel}
                            initLabel={adapter?.initLabel}
                          />
                        )}

                        {/* Router agent indicator */}
                        {isRouting && msg.isStreaming && i === messages.length - 1 && (
                          <div className="mb-3 mt-1 flex items-center gap-2 text-blue-500 font-mono text-[10px]">
                            <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                            Router Agent: Evaluating intent & scaling capacity...
                          </div>
                        )}

                        {/* Message content */}
                        {msg.content ? (
                          <>
                            <div className="text-[13px] text-gray-700 leading-relaxed markdown-content">
                              {renderMarkdownContent(msg.content)}
                            </div>
                            {msg.collapsibleReport && (
                              <details className="mt-4 group border border-gray-200 rounded-xl bg-gray-50 overflow-hidden text-left relative z-10 transition-all hover:bg-gray-100/50">
                                <summary className="px-4 py-3 cursor-pointer text-[12px] font-bold text-gray-700 flex items-center gap-2 select-none">
                                  <svg className="w-4 h-4 text-gray-400 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                                  Expand to view the raw background data report
                                </summary>
                                <div className="px-5 py-4 border-t border-gray-200 bg-white text-[13px] text-gray-700 leading-relaxed markdown-content">
                                  {renderMarkdownContent(msg.collapsibleReport)}
                                </div>
                              </details>
                            )}
                          </>
                        ) : msg.isStreaming ? (
                          <div className="flex items-center gap-1 py-1">
                            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
                            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
                          </div>
                        ) : null}

                        {!msg.isStreaming && msg.content && (
                          <p className="text-[9px] text-gray-400 mt-2">{msg.timestamp}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Research phase 1 progress (two-phase workflow) */}
              {workflowPhase === 'research' && messages.length === 1 && (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-xl bg-gray-900 flex items-center justify-center text-white text-[10px] font-black shrink-0 mt-0.5">L</div>
                  <div className="flex-1 min-w-0 mt-1">
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                        <span className="text-[11px] font-semibold text-gray-500">Phase 1: Signal Radar acquiring intelligence... (This may take up to 5 minutes)</span>
                      </div>
                      <div className="pl-2 border-l-2 border-gray-100 ml-1.5 space-y-1.5 max-h-64 overflow-y-auto">
                        {researchLogs.map((log, lIdx) => (
                          <div key={lIdx} className="text-[10px] text-gray-400 font-mono flex items-start gap-1.5 leading-relaxed">
                            <span className="text-gray-300 mt-0.5">&gt;</span>
                            <span className={log.includes('Error') || log.includes('error') ? 'text-red-400' : ''}>{log}</span>
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input */}
          <div className="shrink-0 pt-2 pb-8 px-4 md:px-8 bg-gradient-to-t from-white via-white to-transparent">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl shadow-sm pl-2 pr-4 py-2 focus-within:border-gray-300 focus-within:shadow-md transition-all">
                {showModeSelector && (
                  <ModeSelector mode={currentMode} onModeChange={setCurrentMode} compact />
                )}
                <input
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Ask a follow-up question..."
                  disabled={isStreaming}
                  className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder:text-gray-400 py-2 min-w-0"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all" title="Attach file"><AttachIcon /></button>
                  <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all" title="Add image"><ImageIcon /></button>
                  <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all" title="Voice input"><MicIcon /></button>
                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || isStreaming}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ml-1 ${inputText.trim() && !isStreaming ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                  >
                    <SendIcon />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Knowledge Graph Panel */}
        {showGraphPanel && currentKgData && (
          <div className="w-[400px] shrink-0 border-l border-gray-100 overflow-hidden relative">
            <button onClick={() => setShowGraphPanel(false)} className="absolute top-2 right-2 z-20 w-7 h-7 rounded-lg bg-white/80 backdrop-blur border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <KnowledgeGraph data={currentKgData} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatContainer;
