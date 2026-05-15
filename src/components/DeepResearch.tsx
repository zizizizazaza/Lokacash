import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { socket } from '../services/socket';
import { api } from '../services/api';
import * as d3 from 'd3';

type Message = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  topic?: string;
  logs?: string[];
  isRunning?: boolean;
  isError?: boolean;
  timestamp?: string;
};

/* ═══════════════════════════════════════════════════════════════
   Knowledge Graph – Signal Radar edition
   ═══════════════════════════════════════════════════════════════ */
interface KGNode { id: string; type: 'source' | 'topic' | 'signal'; label: string; x: number; y: number }
interface KGEdge { id: string; source: string; target: string; label: string }
interface KGData  { nodes: KGNode[]; edges: KGEdge[] }

function buildResearchGraph(topic: string, logs: string[]): KGData {
  const nodes: KGNode[] = [
    { id: 'topic', type: 'topic', label: topic.length > 20 ? topic.slice(0, 18) + '…' : topic, x: 0, y: 0 },
  ];
  const edges: KGEdge[] = [];
  const seen = new Set<string>();

  // Mine source names from logs
  const sourcePatterns: [RegExp, string, string][] = [
    [/Reddit/i,       'reddit',     'Reddit'],
    [/YouTube/i,      'youtube',    'YouTube'],
    [/HN|Hacker/i,    'hn',         'HN'],
    [/Polymarket/i,   'polymarket', 'Polymarket'],
    [/TikTok/i,       'tiktok',     'TikTok'],
    [/Instagram/i,    'instagram',  'Instagram'],
    [/Bluesky/i,      'bluesky',    'Bluesky'],
    [/X:|Twitter/i,   'x',          'X / Twitter'],
    [/Xiaohongshu/i,  'xhs',        'Xiaohongshu'],
    [/Web/i,          'web',        'Web Search'],
    [/AI Synthesis/i, 'ai',         'AI Synthesis'],
  ];

  for (const log of logs) {
    for (const [re, id, label] of sourcePatterns) {
      if (re.test(log) && !seen.has(id)) {
        seen.add(id);
        nodes.push({ id, type: 'source', label, x: 0, y: 0 });
        edges.push({ id: `e-${id}`, source: id, target: 'topic', label: 'researches' });
      }
    }
  }

  // Extract signal nodes from milestones
  const signalPatterns: [RegExp, string, string][] = [
    [/Found (\d+) threads/,  'sig_reddit',  'Reddit threads'],
    [/Found (\d+) videos/,   'sig_yt',      'YT videos'],
    [/Found (\d+) stories/,  'sig_hn',      'HN stories'],
    [/Report generated/i,    'sig_report',  'Final Report'],
  ];
  for (const log of logs) {
    for (const [re, id, label] of signalPatterns) {
      const m = log.match(re);
      if (m && !seen.has(id)) {
        seen.add(id);
        const displayLabel = m[1] ? `${label} (${m[1]})` : label;
        nodes.push({ id, type: 'signal', label: displayLabel, x: 0, y: 0 });
        edges.push({ id: `e-${id}`, source: 'topic', target: id, label: 'produces' });
      }
    }
  }

  return { nodes, edges };
}

const KnowledgeGraphView: React.FC<{ data: KGData }> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;
    const svg = d3.select(svgRef.current);
    const width = containerRef.current?.clientWidth || 400;
    const height = containerRef.current?.clientHeight || 600;
    svg.selectAll('*').remove();

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 4]).on('zoom', (e) => g.attr('transform', e.transform));
    svg.call(zoom as any);
    const g = svg.append('g');

    svg.append('defs').append('marker').attr('id', 'sr-arrow').attr('viewBox', '0 -5 10 10').attr('refX', 22).attr('refY', 0)
      .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto').append('path').attr('fill', '#9ca3af').attr('d', 'M0,-4L8,0L0,4');

    const nodes = data.nodes.map(d => ({ ...d }));
    const edges = data.edges.map(d => ({ ...d }));

    const simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(edges).id((d: any) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(45));

    const link = g.append('g').attr('stroke', '#9ca3af').attr('stroke-opacity', 0.8).selectAll('line').data(edges).join('line').attr('stroke-width', 1.5).attr('marker-end', 'url(#sr-arrow)');
    const linkLabel = g.append('g').selectAll('text').data(edges).join('text').text((d: any) => d.label).attr('font-size', '8px').attr('fill', '#9ca3af').attr('text-anchor', 'middle');

    const drag = d3.drag<SVGGElement, any>()
      .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; });

    const node = g.append('g').selectAll('g').data(nodes).join('g').call(drag as any).style('cursor', 'grab');

    node.append('circle')
      .attr('r', (d: any) => d.type === 'topic' ? 22 : d.type === 'source' ? 16 : 14)
      .attr('fill', (d: any) => d.type === 'topic' ? '#eef2ff' : d.type === 'source' ? '#f3f4f6' : '#ecfdf5')
      .attr('stroke', (d: any) => d.type === 'topic' ? '#6366f1' : d.type === 'source' ? '#6b7280' : '#10b981')
      .attr('stroke-width', 1.5);

    node.append('text')
      .text((d: any) => d.label.length > 16 ? d.label.slice(0, 14) + '…' : d.label)
      .attr('y', (d: any) => d.type === 'topic' ? 32 : 26)
      .attr('font-size', '9px')
      .attr('fill', (d: any) => d.type === 'topic' ? '#4338ca' : d.type === 'source' ? '#374151' : '#047857')
      .attr('text-anchor', 'middle').attr('font-weight', '500');

    simulation.on('tick', () => {
      link.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y).attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y);
      linkLabel.attr('x', (d: any) => (d.source.x + d.target.x) / 2).attr('y', (d: any) => (d.source.y + d.target.y) / 2 - 4);
      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [data.nodes.length, data.edges.length]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-white" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
      <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      <div className="absolute bottom-4 left-4 flex gap-4 z-10">
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#eef2ff] border border-[#6366f1]" /><span className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">Topic</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#f3f4f6] border border-[#6b7280]" /><span className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">Source</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#ecfdf5] border border-[#10b981]" /><span className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">Signal</span></div>
      </div>
      <div className="absolute top-4 right-4 text-[10px] text-gray-500 font-mono text-right pointer-events-none">scroll to zoom<br/>drag to pan</div>
    </div>
  );
};

import { renderMarkdownContent, parseLine } from '../utils/markdown';
import { stripInternalResearchCitations } from '../utils/researchCitations';

/* ═══════════════════════════════════════════════════════════════
   DeepResearch — Main Component
   ═══════════════════════════════════════════════════════════════ */
export default function DeepResearch() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionToRestore = searchParams.get('session');
  const initialTopic = location.state?.initialTopic || '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isDeep, setIsDeep] = useState(false);
  const [days, setDays] = useState(30);
  const [showGraph, setShowGraph] = useState(false);
  
  const feedRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const hasSentInitial = useRef(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (feedRef.current) feedRef.current.scrollTo({ top: feedRef.current.scrollHeight, behavior });
    });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const [sessionId] = useState(() => sessionToRestore || Date.now().toString());

  /* Socket listeners */
  useEffect(() => {
    const onStarted = (data: any) => {
      // Add if missing
      setMessages(prev => {
        if (!data.sessionId || sessionToRestore === data.sessionId || (!sessionToRestore && messages.some(m => m.isRunning))) {
           // We might already have it or we are in the right session
           return [...prev, { id: Date.now().toString(), role: 'agent', content: '', logs: [], isRunning: true, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }];
        }
        return prev;
      });
      setShowGraph(true);
    };
    const onProgress = (data: { log: string; sessionId?: string }) => {
      // Validate we are looking at the right session
      if (data.sessionId && sessionToRestore && data.sessionId !== sessionToRestore) return;
      if (!sessionToRestore && data.sessionId && sessionId !== data.sessionId) return;
      
      setMessages(prev => {
        let updated = [...prev];
        let last = updated[updated.length - 1];
        // Reconnection magic: if we don't have an active agent message, inject it!
        if (!last || last.role !== 'agent' || !last.isRunning) {
          updated.push({ id: Date.now().toString(), role: 'agent', content: '', logs: [data.log], isRunning: true, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        } else {
          updated[updated.length - 1] = { ...last, logs: [...(last.logs || []), data.log] };
        }
        return updated;
      });
    };
    const onDone = (data: { summary: string; sessionId?: string }) => {
      if (data.sessionId && sessionToRestore && data.sessionId !== sessionToRestore) return;
      if (!sessionToRestore && data.sessionId && sessionId !== data.sessionId) return;

      setMessages(prev => {
        let updated = [...prev];
        let last = updated[updated.length - 1];
        if (!last || last.role !== 'agent') {
          updated.push({ id: Date.now().toString(), role: 'agent', content: data.summary, isRunning: false, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        } else {
          updated[updated.length - 1] = { ...last, content: data.summary, isRunning: false };
        }
        return updated;
      });
      window.dispatchEvent(new CustomEvent('session-done', { detail: { id: data.sessionId || sessionId } }));
    };
    const onError = (data: { error: string; sessionId?: string }) => {
      if (data.sessionId && sessionToRestore && data.sessionId !== sessionToRestore) return;
      if (!sessionToRestore && data.sessionId && sessionId !== data.sessionId) return;

      setMessages(prev => {
        let updated = [...prev];
        let last = updated[updated.length - 1];
        if (!last || last.role !== 'agent') {
          updated.push({ id: Date.now().toString(), role: 'agent', content: data.error, isError: true, isRunning: false, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        } else {
          updated[updated.length - 1] = { ...last, content: data.error, isError: true, isRunning: false };
        }
        return updated;
      });
      window.dispatchEvent(new CustomEvent('session-done', { detail: { id: data.sessionId || sessionId } }));
    };
    socket.on('agent:research:started', onStarted);
    socket.on('agent:research:progress', onProgress);
    socket.on('agent:research:done', onDone);
    socket.on('agent:research:error', onError);
    return () => { socket.off('agent:research:started', onStarted); socket.off('agent:research:progress', onProgress); socket.off('agent:research:done', onDone); socket.off('agent:research:error', onError); };
  }, [sessionToRestore, sessionId, messages.length]);

  const sendQuery = (query: string) => {
    if (!query.trim()) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: query, topic: query, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    socket.emit('agent:research', { topic: query, deep: isDeep, days, sessionId });
    window.dispatchEvent(new CustomEvent('session-started', { 
      detail: { id: sessionId, title: query.slice(0, 60), agentId: 'research' } 
    }));
  };

  useEffect(() => { 
    if (sessionToRestore) return; // Don't auto-send if restoring
    if (initialTopic && !hasSentInitial.current) { 
      hasSentInitial.current = true; sendQuery(initialTopic); 
    } 
  }, [initialTopic, sessionToRestore]);

  useEffect(() => {
    if (!sessionToRestore) return;
    const loadHistory = async () => {
      try {
        const history = await api.getChatHistory(undefined, undefined, sessionToRestore);
        const formatted: Message[] = history.map(h => ({
          id: h.id,
          role: h.role === 'assistant' ? 'agent' : 'user',
          content: h.content,
          topic: h.role === 'user' ? h.content : undefined,
          timestamp: new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));
        setMessages(formatted);

        // Reconnect active state if the last message was the user's and backend is still processing this session
        if (formatted.length > 0 && formatted[formatted.length - 1].role === 'user') {
          socket.emit('agent:research:check', { sessionId: sessionToRestore }, (res: { isRunning: boolean }) => {
            if (res.isRunning) {
              setMessages(prev => {
                // Double check if we haven't received a progress/done in the fraction of a second since emit
                const last = prev[prev.length - 1];
                if (last && last.role === 'user') {
                  return [...prev, { id: 'reconnected-check', role: 'agent', content: '', logs: ['AI Synthesis in progress...'], isRunning: true, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }];
                }
                return prev;
              });
              // Revive sidebar spinner
              window.dispatchEvent(new CustomEvent('session-started', { 
                detail: { id: sessionToRestore, title: formatted[0].content.slice(0, 60), agentId: 'research' } 
              }));
            }
          });
        }
      } catch (err) {
        console.error('Failed to load deep research history', err);
      }
    };
    loadHistory();
  }, [sessionToRestore]);

  const handleSend = () => {
    const t = input.trim();
    if (!t || messages[messages.length - 1]?.isRunning) return;
    setInput('');
    sendQuery(t);
  };

  const getLastTopic = (idx: number) => {
    for (let j = idx - 1; j >= 0; j--) if (messages[j].role === 'user') return messages[j].content;
    return '';
  };

  /* Build graph data from the latest agent message */
  const latestAgent = [...messages].reverse().find(m => m.role === 'agent');
  const graphData = latestAgent ? buildResearchGraph(getLastTopic(messages.indexOf(latestAgent)+1) || 'Research', latestAgent.logs || []) : null;
  const hasGraphData = graphData && graphData.nodes.length > 1;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* ══ Header ══ */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
        <button onClick={() => navigate('/')} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">Signal Radar</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-[10px] text-gray-400 font-medium">Multi-Source Agent</span>
          {hasGraphData && (
            <div className="ml-2 pl-3 border-l border-gray-200 flex items-center gap-2 cursor-pointer" onClick={() => setShowGraph(g => !g)}>
              <svg className={`w-3.5 h-3.5 transition-colors ${showGraph ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="6" cy="6" r="3" strokeWidth="2"/><circle cx="18" cy="6" r="3" strokeWidth="2"/><circle cx="12" cy="18" r="3" strokeWidth="2"/>
                <line x1="8.83" y1="7.83" x2="15.17" y2="7.83" strokeWidth="1.5"/><line x1="6.93" y1="8.5" x2="11.07" y2="15.5" strokeWidth="1.5"/><line x1="17.07" y1="8.5" x2="12.93" y2="15.5" strokeWidth="1.5"/>
              </svg>
              <span className="text-[11px] font-medium text-gray-500">Research Graph</span>
              <button type="button" className={`relative inline-flex h-4 w-7 ml-1 items-center rounded-full transition-colors ${showGraph ? 'bg-blue-500' : 'bg-gray-200'}`}>
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${showGraph ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ══ Content Row ══ */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <div ref={feedRef} className="flex-1 overflow-y-auto px-4 md:px-10 py-8">
            <div className="max-w-2xl mx-auto space-y-8">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center py-20 px-4">
                   <h2 className="text-[20px] font-bold text-gray-900 mb-2">Signal Radar Agent</h2>
                   <p className="text-[14px] text-gray-500 max-w-sm">I can dive deep into the web, analyze vast protocols, and formulate comprehensive investment research reports for you.</p>
                </div>
              )}

              {messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id}>
                    {isUser ? (
                      <div className="flex flex-col items-end w-full gap-1">
                        <div className="max-w-[72%] px-4 py-3 bg-gray-900 text-white rounded-2xl rounded-br-sm shadow-sm">
                          <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>
                        {msg.timestamp && <span className="text-[10px] text-gray-400 font-medium px-1">{msg.timestamp}</span>}
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Thinking panel — Assess Risk flat list style */}
                          {(msg.isRunning || (msg.logs && msg.logs.length > 0)) && (
                            <div className="mb-4">
                              <div className="flex items-center gap-1.5 mb-2">
                                {msg.isRunning ? (
                                  <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <div className="w-3.5 h-3.5 rounded-full bg-gray-200 flex items-center justify-center">
                                    <svg className="w-2 h-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                  </div>
                                )}
                                <span className="text-[11px] font-semibold text-gray-500">{msg.isRunning ? 'Agents thinking...' : 'Analysis complete'}</span>
                              </div>
                              <div className="pl-2 border-l-2 border-gray-100 ml-[7px] space-y-0.5 max-h-[350px] overflow-y-auto">
                                {msg.logs?.length === 0 && msg.isRunning && (
                                  <div className="flex items-center gap-1.5 py-0.5">
                                    <div className="w-2.5 h-2.5 border border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                                    <span className="text-[11px] text-blue-600 font-bold">Initializing execution layer...</span>
                                  </div>
                                )}
                                {msg.logs?.map((l, idx) => {
                                  const isLast = idx === (msg.logs?.length ?? 0) - 1;
                                  const isDone = !msg.isRunning || !isLast;
                                  const cleanLog = l.replace(/\x1b\[[0-9;]*m/g, '').trim();
                                  if (!cleanLog) return null;
                                  return (
                                    <div key={idx} className="flex items-center gap-1.5 py-0.5">
                                      {isDone ? (
                                        <svg className="w-2.5 h-2.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                      ) : (
                                        <div className="w-2.5 h-2.5 border border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                                      )}
                                      <span className={`text-[11px] leading-snug break-words flex-1 ${isDone ? 'text-gray-600 font-medium' : 'text-blue-600 font-bold'}`}>{cleanLog}</span>
                                    </div>
                                  );
                                })}
                                {msg.isRunning && <div ref={logEndRef} className="h-1" />}
                              </div>
                            </div>
                          )}

                          {/* Error */}
                          {msg.isError && (
                            <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-red-600 text-[13px]">
                              <p className="font-bold flex items-center gap-2 mb-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                Script Failed
                              </p>
                              <pre className="whitespace-pre-wrap font-mono text-[11px] bg-white/60 p-2 rounded">{msg.content}</pre>
                            </div>
                          )}

                          {/* Final report */}
                          {!msg.isRunning && msg.content && !msg.isError && (
                            <div className="markdown-content text-[16px] text-gray-700 leading-relaxed space-y-1">
                              {renderMarkdownContent(
                                msg.role === 'agent' ? stripInternalResearchCitations(msg.content) : msg.content,
                              )}
                            </div>
                          )}
                          {!msg.isRunning && msg.timestamp && (
                            <div className="mt-2 text-[10px] text-gray-400 font-medium">{msg.timestamp}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="h-4" />
            </div>
          </div>

          {/* Input */}
          <div className="shrink-0 pt-2 pb-8 px-4 md:px-8 bg-gradient-to-t from-white via-white to-transparent">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-4 mb-2 px-2 opacity-80 hover:opacity-100 transition-opacity">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={isDeep} onChange={e => setIsDeep(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-600 w-3.5 h-3.5" />
                  <span className="text-[12px] font-medium text-gray-600">Deep mode</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium text-gray-600">Range:</span>
                  <select value={days} onChange={e => setDays(Number(e.target.value))} className="text-[11px] font-semibold text-gray-700 bg-gray-100 rounded-md px-1.5 py-0.5 outline-none cursor-pointer hover:bg-gray-200 transition-colors">
                    <option value={7}>7d</option>
                    <option value={30}>30d</option>
                    <option value={90}>90d</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-2 focus-within:border-gray-300 focus-within:shadow-md transition-all">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Ask Signal Radar to analyze..."
                  disabled={messages[messages.length - 1]?.isRunning}
                  className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder:text-gray-400 py-2 min-w-0"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || messages[messages.length - 1]?.isRunning}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${input.trim() && !messages[messages.length - 1]?.isRunning ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                </button>
              </div>
              <p className="text-center text-[10px] text-gray-400 mt-2.5 font-medium tracking-wide">
                Signal Radar takes 3-5 minutes to crawl protocols and formulate extensive reports.
              </p>
            </div>
          </div>
        </div>

        {/* ══ Knowledge Graph Panel (right side) ══ */}
        {showGraph && hasGraphData && graphData && (
          <div className="w-[400px] shrink-0 border-l border-gray-100 overflow-hidden relative">
            <button onClick={() => setShowGraph(false)} className="absolute top-2 right-2 z-20 w-7 h-7 rounded-lg bg-white/80 backdrop-blur border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <KnowledgeGraphView data={graphData} />
          </div>
        )}
      </div>
    </div>
  );
}
