import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { I, InputIcons, UseCaseIcons } from './Icons';
import { QUICK_ACTIONS, USE_CASES, AGENT_GUIDES, FEATURED_GROUPS, FEATURED_AGENTS } from '../constants';
import SuperAgentChat from './SuperAgentChat';

const SuperAgentHome: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [input, setInput] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [mode, setMode] = useState<'auto' | 'fast' | 'collaborate' | 'roundtable'>('auto');
  const [modeOpen, setModeOpen] = useState(false);
  const modeRef = useRef<HTMLDivElement>(null);
  const [chatMessage, setChatMessage] = useState<string | null>(null);
  const [phIdx, setPhIdx] = useState(0);
  const [pastedImages, setPastedImages] = useState<string[]>([]);
  const homeFileRef = useRef<HTMLInputElement>(null);
  const [homeVoiceState, setHomeVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const homeVoiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const HOME_MOCK_TRANSCRIPTIONS = [
    'Is NVIDIA still a strong buy after Q4 earnings?',
    'Compare Bitcoin and Ethereum momentum over the past 30 days',
    'Which AI infrastructure companies have the strongest moat?',
    'Build me a diversified portfolio for a 3-year horizon',
    'Show me the latest market sentiment analysis on Tesla',
  ];

  const stopHomeRecording = () => {
    if (homeVoiceTimerRef.current) clearTimeout(homeVoiceTimerRef.current);
    setHomeVoiceState('transcribing');
    homeVoiceTimerRef.current = setTimeout(() => {
      const t = HOME_MOCK_TRANSCRIPTIONS[Math.floor(Math.random() * HOME_MOCK_TRANSCRIPTIONS.length)];
      setInput(t);
      setHomeVoiceState('idle');
    }, 1800);
  };

  const handleHomeVoiceClick = () => {
    if (homeVoiceState === 'idle') {
      setHomeVoiceState('recording');
      homeVoiceTimerRef.current = setTimeout(stopHomeRecording, 8000);
    } else if (homeVoiceState === 'recording') {
      stopHomeRecording();
    }
  };

  const handleHomePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(it => it.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    imageItems.forEach(item => {
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        if (ev.target?.result) setPastedImages(prev => [...prev, ev.target!.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleHomeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        if (ev.target?.result) setPastedImages(prev => [...prev, ev.target!.result as string]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const PLACEHOLDERS = [
    'Ask about any asset, market, or investing idea…',
    'Is NVIDIA still a strong buy after Q4?',
    'Compare Tesla vs BYD fundamentals for 2026',
    'Which AI infrastructure companies have the best moat?',
    'Build me a diversified portfolio for a 3-year horizon',
  ];

  // Reset to home when sidebar "New Chat" is clicked
  useEffect(() => {
    if ((location.state as any)?.newChat) {
      setChatMessage(null);
      setInput('');
    }
  }, [(location.state as any)?.newChat]); // eslint-disable-line

  useEffect(() => {
    if (input) return;
    const id = setInterval(() => setPhIdx(i => (i + 1) % PLACEHOLDERS.length), 3500);
    return () => clearInterval(id);
  }, [input]);

  const MODES = [
    { id: 'auto' as const, label: 'Auto', desc: 'System picks the best mode for you', icon: () => <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" /></svg> },
    { id: 'fast' as const, label: 'Fast', desc: 'Single agent, quick response', icon: () => <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg> },
    { id: 'collaborate' as const, label: 'Deep', desc: 'Agents split work, assemble one answer', icon: () => <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
    { id: 'roundtable' as const, label: 'Roundtable', desc: 'Multi-agent debate & cross-validation', icon: () => <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M14 5.5a7.5 7.5 0 014.5 12" /><path d="M17 19.5H7" /><path d="M5.5 17A7.5 7.5 0 0110 5.5" /></svg> },
  ];
  const currentMode = MODES.find(m => m.id === mode)!;

  useEffect(() => {
    if (!modeOpen) return;
    const h = (e: MouseEvent) => { if (modeRef.current && !modeRef.current.contains(e.target as Node)) setModeOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [modeOpen]);

  if (chatMessage) {
    return <SuperAgentChat initialMessage={chatMessage} selectedAgentId={selectedAgent || undefined} onBack={() => setChatMessage(null)} />;
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto">
      {/* ── Hero + Input ── */}
      <div className="hero-zone flex flex-col items-center pt-16 md:pt-28 pb-6 px-4">
        <div className="max-w-[640px] w-full space-y-7" style={{ position: 'relative', zIndex: 1 }}>
          {/* Title */}
          <div className="text-center hero-title space-y-2">
            <h1 className="text-[38px] md:text-[46px] font-extrabold tracking-tight leading-[1.15]">
              <span className="text-gray-900">Where would you like to </span>
              <span style={{ color: 'var(--accent)' }}>invest?</span>
            </h1>
            <p className="text-[14px] text-gray-400 font-normal">
              Multi-agent AI built for investment intelligence.
            </p>
          </div>

          {/* Input Box */}
          <div className="input-box hero-input bg-white border border-gray-200 rounded-2xl relative" style={{ boxShadow: '0 2px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)' }}>
            <style>{`
              @keyframes home-voice-bar { 0%,100%{height:3px} 50%{height:10px} }
              .home-voice-bar { min-height:3px; display:inline-block; border-radius:9999px; background:#9ca3af; }
            `}</style>
            {/* Voice overlay: Recording */}
            {homeVoiceState === 'recording' && (
              <div className="absolute inset-x-0 top-0 bottom-[52px] flex items-center justify-center">
                <div className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <div className="flex items-end gap-[3px] h-4">
                    {[
                      { delay: '0s',    dur: '1.8s' },
                      { delay: '0.3s',  dur: '1.2s' },
                      { delay: '0.6s',  dur: '2.1s' },
                      { delay: '0.15s', dur: '1.5s' },
                      { delay: '0.45s', dur: '1.9s' },
                    ].map(({ delay, dur }, i) => (
                      <span key={i} className="home-voice-bar w-[3px]" style={{ animationName: 'home-voice-bar', animationDuration: dur, animationDelay: delay, animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite' }} />
                    ))}
                  </div>
                  <button onClick={stopHomeRecording} className="ml-0.5 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            )}
            {/* Voice overlay: Transcribing */}
            {homeVoiceState === 'transcribing' && (
              <div className="absolute inset-x-0 top-0 bottom-[52px] flex items-center justify-center">
                <div className="flex items-center bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm">
                  <span className="text-[13px] text-gray-500 font-medium">Thinking…</span>
                </div>
              </div>
            )}
            {/* Hidden file input */}
            <input ref={homeFileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleHomeFileChange} />
            {/* Image preview strip */}
            {pastedImages.length > 0 && homeVoiceState === 'idle' && (
              <div className="flex items-center gap-2 px-4 pt-3 flex-wrap">
                {pastedImages.map((src, idx) => (
                  <div key={idx} className="relative group shrink-0">
                    <img src={src} alt="" className="w-14 h-14 rounded-xl object-cover border border-gray-200 shadow-sm" />
                    <button
                      onClick={() => setPastedImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              key={phIdx}
              value={input}
              onChange={e => setInput(e.target.value)}
              onPaste={handleHomePaste}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                  e.preventDefault();
                  setChatMessage(input.trim());
                }
              }}
              placeholder={homeVoiceState !== 'idle' ? '' : PLACEHOLDERS[phIdx]}
              rows={3}
              disabled={homeVoiceState !== 'idle'}
              className="ph-fade-in w-full bg-transparent outline-none text-[15px] text-gray-900 placeholder:text-gray-400 px-4 pt-4 pb-2 resize-none"
              style={{ visibility: homeVoiceState !== 'idle' ? 'hidden' : 'visible' }}
            />
            {/* Input toolbar */}
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1">
                <div className="relative" ref={modeRef}>
                  <button
                    onClick={() => setModeOpen(v => !v)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-gray-500 hover:bg-gray-100 transition-all"
                  >
                    {React.createElement(currentMode.icon)}
                    {currentMode.label}
                    <InputIcons.Chevron />
                  </button>
                  {modeOpen && (
                    <div className="absolute bottom-full left-0 mb-1.5 w-64 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden z-30" style={{ animation: 'menu-pop 0.15s ease-out' }}>
                      {MODES.map(m => {
                        const MIcon = m.icon;
                        const isActive = mode === m.id;
                        return (
                          <button
                            key={m.id}
                            onClick={() => { setMode(m.id); setModeOpen(false); }}
                            className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${isActive ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                          >
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
                              <MIcon />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-[12px] font-semibold ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>{m.label}</p>
                              <p className="text-[10px] text-gray-400 leading-tight">{m.desc}</p>
                            </div>
                            {isActive && (
                              <svg className="w-3.5 h-3.5 text-gray-900 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* Selected Agent tag — sits right next to mode selector */}
                {selectedAgent && (() => {
                  const ag = QUICK_ACTIONS.find(a => a.id === selectedAgent);
                  if (!ag) return null;
                  const AgIc = ag.icon;
                  return (
                    <div className="agent-tag flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-[12px] font-medium">
                      <AgIc />
                      <span>{ag.label}</span>
                      <button
                        onClick={() => setSelectedAgent(null)}
                        className="ml-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-blue-100 transition-colors"
                      >
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => homeFileRef.current?.click()} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all" title="Attach file">
                  <InputIcons.Attach />
                </button>
                <button
                  onClick={handleHomeVoiceClick}
                  title={homeVoiceState === 'recording' ? 'Stop recording' : 'Voice input'}
                  disabled={homeVoiceState === 'transcribing'}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    homeVoiceState === 'recording'
                      ? 'text-red-500 bg-red-50 hover:bg-red-100'
                      : homeVoiceState === 'transcribing'
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {homeVoiceState === 'recording' ? (
                    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                  ) : (
                    <InputIcons.Mic />
                  )}
                </button>
                <button
                  onClick={() => {
                    setChatMessage(input.trim());
                  }}
                  className={`send-btn-active w-8 h-8 rounded-lg flex items-center justify-center transition-all ${input.trim() ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    }`}>
                  <I.Send />
                </button>
              </div>
            </div>
          </div>

          {/* Agent Guide — only when an agent is selected */}
          {selectedAgent && AGENT_GUIDES[selectedAgent] && (
            <div className="hero-guide space-y-3" style={{ animation: 'fade-up 0.35s var(--ease-out-expo) both' }}>
              <p className="text-[13px] font-semibold text-gray-700">{AGENT_GUIDES[selectedAgent].desc}</p>

              {AGENT_GUIDES[selectedAgent].scenarios && (
                <div className="flex flex-wrap gap-2">
                  {AGENT_GUIDES[selectedAgent].scenarios!.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedScenario(selectedScenario === s.id ? null : s.id)}
                      className={`scenario-pill px-3 py-1.5 rounded-full text-[12px] font-medium border ${selectedScenario === s.id
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
                        }`}
                    >{s.label}</button>
                  ))}
                </div>
              )}

              {(() => {
                const guide = AGENT_GUIDES[selectedAgent];
                const prompts = guide.scenarios
                  ? guide.scenarios.find(s => s.id === selectedScenario)?.prompts ?? []
                  : guide.prompts ?? [];
                if (!prompts.length) return null;
                return (
                  <div className="space-y-1">
                    <p className="text-[13px] font-semibold text-gray-700 px-1 mb-2">Explore Ideas</p>
                    {prompts.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => setInput(p)}
                        className="prompt-item w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-left text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent hover:border-gray-100 transition-colors group"
                      >
                        <span>{p}</span>
                        <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-400 shrink-0 ml-3 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Agent pills — outside max-w-640, full width row */}
        {!selectedAgent && (
          <div className="hero-actions pt-6 pb-5 px-4 flex flex-col items-center gap-3">
            {/* Row 1: first 5 pills */}
            <div className="flex items-center gap-2">
              {FEATURED_AGENTS.slice(0, 5).map(a => {
                const Ic = a.icon;
                return (
                  <button key={a.id}
                    onClick={() => {
                      if ((a as any).agentId) { setSelectedAgent((a as any).agentId); setSelectedScenario(null); }
                      else if (a.route) { navigate(a.route); }
                      else if (a.prompt) { setChatMessage(a.prompt); }
                    }}
                    className="qa-pill flex items-center gap-2 px-4 py-2.5 rounded-full border border-gray-200 bg-white text-[13px] font-medium text-gray-600 hover:border-gray-300 hover:text-gray-900 hover:shadow-sm whitespace-nowrap">
                    <Ic /> {a.name}
                  </button>
                );
              })}
            </div>
            {/* Row 2: remaining pills */}
            <div className="flex items-center gap-2">
              {FEATURED_AGENTS.slice(5).map(a => {
                const Ic = a.icon;
                return (
                  <button key={a.id}
                    onClick={() => {
                      if ((a as any).agentId) { setSelectedAgent((a as any).agentId); setSelectedScenario(null); }
                      else if (a.route) { navigate(a.route); }
                      else if (a.prompt) { setChatMessage(a.prompt); }
                    }}
                    className="qa-pill flex items-center gap-2 px-4 py-2.5 rounded-full border border-gray-200 bg-white text-[13px] font-medium text-gray-600 hover:border-gray-300 hover:text-gray-900 hover:shadow-sm whitespace-nowrap">
                    <Ic /> {a.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Use Cases — only on top-level, hidden when an agent is active ── */}
      {!selectedAgent && (
        <div className="px-4 pb-10 pt-8 max-w-[640px] w-full mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <span style={{ display: 'inline-block', width: 3, height: 14, borderRadius: 2, backgroundColor: 'var(--accent)', flexShrink: 0 }} />
            <h2 className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Explore Use Cases</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {USE_CASES.map(uc => (
              <button
                key={uc.id}
                onClick={() => setChatMessage(uc.prompt)}
                className="usecase-card group text-left bg-white border border-gray-100 rounded-xl p-3 cursor-pointer"
              >
                <div className="w-6 h-6 rounded-md bg-gray-50 flex items-center justify-center text-gray-400 mb-2">{UseCaseIcons[uc.id] ? React.createElement(UseCaseIcons[uc.id]) : null}</div>
                <h3 className="text-[12px] font-semibold text-gray-900 mb-0.5 leading-snug">{uc.title}</h3>
                <p className="text-[11px] text-gray-400 leading-snug mb-2">{uc.desc}</p>
                <div className="flex flex-wrap gap-1">
                  {uc.tags.map(tag => (
                    <span key={tag} className="px-1.5 py-px rounded bg-gray-50 text-[10px] font-medium text-gray-400">{tag}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Featured Groups — only on top-level ── */}
      {!selectedAgent && (() => {
        const avatarColors = ['bg-blue-400', 'bg-emerald-400', 'bg-violet-400', 'bg-amber-400', 'bg-rose-400', 'bg-cyan-400', 'bg-indigo-400'];
        return (
          <div className="pb-12 px-4 max-w-[640px] w-full mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <span style={{ display: 'inline-block', width: 3, height: 14, borderRadius: 2, backgroundColor: 'var(--accent)', flexShrink: 0 }} />
              <h2 className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Featured Groups</h2>
            </div>
            <div className="flex flex-col gap-2.5">
              {FEATURED_GROUPS.map(g => (
                <button key={g.id}
                  onClick={() => navigate(`/chat?group=${g.id}`)}
                  className="group w-full text-left bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all duration-200 overflow-hidden cursor-pointer"
                >
                  <div className="px-4 py-3.5">
                    <div className="flex items-center gap-3 mb-2">
                      {/* Stacked member avatars */}
                      <div className="relative shrink-0 flex items-center h-7" style={{ width: Math.min(g.avatars.length, 4) * 18 + 12 }}>
                        {g.avatars.slice(0, 4).map((initials, i) => (
                          <div key={i} className={`absolute w-7 h-7 rounded-full ${avatarColors[i % avatarColors.length]} text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white shadow-sm transition-transform hover:-translate-y-0.5`} style={{ left: i * 16, zIndex: 10 - i }}>{initials}</div>
                        ))}
                        {g.avatars.length > 4 && (
                          <div className="absolute w-7 h-7 rounded-full bg-gray-50 text-gray-400 text-[9px] font-bold flex items-center justify-center ring-2 ring-white shadow-sm" style={{ left: 4 * 16, zIndex: 0 }}>
                            +{g.avatars.length - 4}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-bold text-gray-900 leading-tight truncate">{g.name}</p>
                          <span className="text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0" style={{ color: 'var(--accent)' }}>View →</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-snug line-clamp-1 mb-2.5">{g.desc}</p>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
                        {g.memberCount} members
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" /></svg>
                        {g.agentCount} agents
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                        {g.online} online
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

    </div>
  );
};

export default SuperAgentHome;
