import React, { useState } from 'react';

export const CreateAgentModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  type AgentType = 'single' | 'multi';
  type MultiMode = 'loka' | 'mirrorfish' | null;
  type Visibility = 'public' | 'group' | 'private';
  type Pricing = 'free' | 'subscription' | 'pay_per_use';
  type Step = 'type' | 'behavior' | 'info' | 'publish' | 'done';

  const STEPS: Step[] = ['type', 'behavior', 'info', 'publish'];
  const STEP_LABELS: Record<Step, string> = {
    type: 'Agent Type',
    behavior: 'Behavior',
    info: 'Basic Info',
    publish: 'Publish',
    done: 'Done',
  };

  const [step, setStep] = useState<Step>('type');
  const [agentType, setAgentType] = useState<AgentType>('single');
  const [multiMode, setMultiMode] = useState<MultiMode>(null);
  const [model, setModel] = useState('gpt-4o');
  const [prompt, setPrompt] = useState('');
  const [capabilities, setCapabilities] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [category, setCategory] = useState('Research');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [pricing, setPricing] = useState<Pricing>('free');
  const [premiumPrice, setPremiumPrice] = useState('');
  // Cross-Check config
  const [ccDomain, setCcDomain] = useState<string[]>([]);
  const [ccThreshold, setCcThreshold] = useState(67);
  const [ccMode, setCcMode] = useState<'consensus' | 'collaboration'>('consensus');
  const [ccDepth, setCcDepth] = useState<1 | 2 | 3>(2);
  // MirrorFish config
  const [mfSeed, setMfSeed] = useState('');
  const [mfTask, setMfTask] = useState('');
  const [mfFiles, setMfFiles] = useState<File[]>([]);
  const [mfTemperature, setMfTemperature] = useState(50);
  const [mfDuration, setMfDuration] = useState<24 | 72 | 168>(72);
  // Multi-agent model panel: [{modelId, count}]
  const [agentPanel, setAgentPanel] = useState<{ modelId: string; count: number }[]>([
    { modelId: 'gpt-4o', count: 1 }
  ]);
  const totalAgentCount = agentPanel.reduce((s, r) => s + r.count, 0);
  const updatePanelRow = (idx: number, field: 'modelId' | 'count', val: string | number) =>
    setAgentPanel(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  const removePanelRow = (idx: number) =>
    setAgentPanel(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  const addPanelRow = () =>
    setAgentPanel(prev => [...prev, { modelId: 'gpt-4o', count: 1 }]);
  const [openPanelDropdown, setOpenPanelDropdown] = useState<number | null>(null);

  const stepIdx = STEPS.indexOf(step);
  const canNext = step === 'type'
    ? (agentType === 'single' || multiMode !== null)
    : step === 'behavior'
      ? (agentType === 'multi' && multiMode === 'mirrorfish' ? mfSeed.trim().length > 0 : prompt.trim().length > 0)
      : step === 'info'
        ? name.trim().length > 0
        : true;


  const MODELS = [
    { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'OpenAI' },
    { id: 'gpt-3-5-turbo', label: 'GPT-3.5 Turbo', provider: 'OpenAI' },
    { id: 'claude-3-5', label: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
    { id: 'claude-3-haiku', label: 'Claude 3 Haiku', provider: 'Anthropic' },
    { id: 'gemini-1-5-pro', label: 'Gemini 1.5 Pro', provider: 'Google' },
    { id: 'gemini-flash', label: 'Gemini 1.5 Flash', provider: 'Google' },
    { id: 'loka-fast', label: 'Loka Fast', provider: 'Loka' },
  ];
  const modelDotColor = (id: string) =>
    id.startsWith('gpt') ? 'bg-green-500' : id.startsWith('claude') ? 'bg-violet-500' : id.startsWith('gemini') ? 'bg-blue-500' : 'bg-indigo-400';
  const CATEGORIES = ['Research', 'Analysis', 'Strategy', 'Data', 'Forecasting', 'Automation'];
  const CAPS = ['Web Search', 'File Analysis', 'On-chain Data', 'Chart Generation'];

  const toggleCap = (c: string) =>
    setCapabilities(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const next = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };
  const prev = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-gray-50 md:bg-gray-100/80">
      <div className="flex-1 p-4 sm:p-8 md:p-10 lg:p-12 max-w-[960px] mx-auto w-full pb-24 animate-fadeIn">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            {stepIdx > 0 && step !== 'done' && (
              <button onClick={prev} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
            <div>
              <h1 className="text-[20px] font-semibold text-gray-900">
                {agentType === 'multi' && stepIdx > 0 ? 'Create Multi-agent' : 'Create Agent'}
              </h1>
              {step !== 'done' && (
                <p className="text-[12px] text-gray-400 mt-0.5">Step {stepIdx + 1} of 4 鈥?{STEP_LABELS[step]}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <div key={s} className={`w-2 h-2 rounded-full transition-all ${i <= stepIdx ? 'bg-gray-900' : 'bg-gray-200'}`} />
              ))}
            </div>
            <button onClick={onClose} className="text-[12px] font-medium text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
          </div>
        </div>

        {/* Body Card 鈥?hidden when done (done screen is rendered outside) */}
        {step !== 'done' && <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">

          {/* Step 1: Agent Type  */}
          {step === 'type' && (
            <div>
              <p className="text-[12px] text-gray-400 mb-5">Choose how your agent operates. You can always change this later.</p>

              {/* Top: Single vs Multi (side-by-side)  */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {/* Single Agent Card */}
                <button
                  onClick={() => { setAgentType('single'); setMultiMode(null); }}
                  className={`relative p-5 rounded-2xl border-2 text-left transition-all overflow-hidden group ${agentType === 'single' ? 'border-gray-900 ring-1 ring-gray-900/5' : 'border-gray-100 hover:border-gray-300'
                    }`}
                >
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <p className="text-[14px] font-bold text-gray-900 mb-1">Single Agent</p>
                    <p className="text-[11px] text-gray-400 leading-relaxed">A standalone AI with custom persona, instructions, and tools. Best for focused tasks.</p>
                    {agentType === 'single' && (
                      <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-gray-700">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        Selected
                      </div>
                    )}
                  </div>
                </button>

                {/* Multi-Agent Card */}
                <button
                  onClick={() => setAgentType('multi')}
                  className={`relative p-5 rounded-2xl border-2 text-left transition-all overflow-hidden group ${agentType === 'multi' ? 'border-gray-900 ring-1 ring-gray-900/5' : 'border-gray-100 hover:border-gray-300'
                    }`}
                >
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="text-[14px] font-bold text-gray-900">Multi-Agent</p>
                      <span className="text-[9px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">Advanced</span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">Multiple agents collaborate to deliver more reliable and powerful results.</p>
                    {agentType === 'multi' && (
                      <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-gray-700">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        Choose a mode below
                      </div>
                    )}
                  </div>
                </button>
              </div>

              {/* Multi-Agent Mode Selection  */}
              {agentType === 'multi' && (
                <div className="animate-fadeIn">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Choose collaboration mode</p>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Cross-Check Precision */}
                    <div
                      onClick={() => setMultiMode('loka')}
                      className={`relative rounded-2xl border text-left transition-all cursor-pointer overflow-hidden flex flex-col ${multiMode === 'loka' ? 'border-indigo-300 shadow-sm shadow-indigo-100' : 'border-gray-150 hover:border-gray-200 bg-white'
                        }`}
                    >
                      {/* Hero: Cross-Check compact triangle */}
                      <div className="h-28 bg-slate-50 flex items-center justify-center">
                        <svg viewBox="0 0 160 96" width="160" height="96" fill="none" xmlns="http://www.w3.org/2000/svg">
                          {/* 3 nodes: tight equilateral triangle */}
                          {/* A top */}
                          <circle cx="80" cy="20" r="10" fill="white" stroke="#6366f1" strokeWidth="1.2" />
                          <path d="M76.5 20l2.5 2.5 5-5" stroke="#6366f1" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          {/* B bottom-left */}
                          <circle cx="44" cy="78" r="10" fill="white" stroke="#6366f1" strokeWidth="1.2" />
                          <path d="M40.5 78l2.5 2.5 5-5" stroke="#6366f1" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          {/* C bottom-right */}
                          <circle cx="116" cy="78" r="10" fill="white" stroke="#6366f1" strokeWidth="1.2" />
                          <path d="M112.5 78l2.5 2.5 5-5" stroke="#6366f1" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          {/* Edges */}
                          <line x1="74" y1="29" x2="50" y2="69" stroke="#c7d2fe" strokeWidth="0.8" strokeDasharray="4 3" />
                          <line x1="86" y1="29" x2="110" y2="69" stroke="#c7d2fe" strokeWidth="0.8" strokeDasharray="4 3" />
                          <line x1="54" y1="78" x2="106" y2="78" stroke="#c7d2fe" strokeWidth="0.8" strokeDasharray="4 3" />
                        </svg>
                      </div>
                      {/* Content */}
                      <div className="p-4 flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[13px] font-semibold text-gray-900">Cross-Check Precision</p>
                          <div className={`w-4 h-4 rounded-full border-2 transition-all shrink-0 ${multiMode === 'loka' ? 'border-indigo-500 bg-indigo-500' : 'border-gray-200'
                            }`}>
                            {multiMode === 'loka' && <div className="w-1.5 h-1.5 rounded-full bg-white mx-auto mt-[3px]" />}
                          </div>
                        </div>
                        <p className="text-[11px] text-gray-400 leading-relaxed mb-3">Agents cross-verify each other's output for maximum factual accuracy.</p>
                        <div className="border-t border-gray-100 pt-3 mt-auto">
                          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Ideal for</p>
                          <div className="space-y-1.5">
                            {[
                              { icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z', title: 'Financial Report Audit' },
                              { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', title: 'Legal Document Review' },
                              { icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4', title: 'Code Quality Analysis' },
                              { icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z', title: 'Research Fact-Check' },
                            ].map(ex => (
                              <div key={ex.title} className="flex items-center gap-2 py-0.5">
                                <div className="w-4 h-4 rounded bg-slate-100 flex items-center justify-center shrink-0">
                                  <svg className="w-2.5 h-2.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={ex.icon} /></svg>
                                </div>
                                <p className="text-[10px] text-gray-500">{ex.title}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Predictive Insight */}
                    <div
                      onClick={() => setMultiMode('mirrorfish')}
                      className={`relative rounded-2xl border text-left transition-all cursor-pointer overflow-hidden flex flex-col ${multiMode === 'mirrorfish' ? 'border-indigo-300 shadow-sm shadow-indigo-100' : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                    >
                      {/* Hero: Predictive 鈥?compact fan tree */}
                      <div className="h-28 bg-slate-50 flex items-center justify-center">
                        <svg viewBox="0 0 160 96" width="160" height="96" fill="none" xmlns="http://www.w3.org/2000/svg">
                          {/* Root */}
                          <circle cx="80" cy="14" r="9" fill="white" stroke="#6366f1" strokeWidth="1.2" />
                          <circle cx="80" cy="14" r="3.5" fill="#6366f1" opacity="0.35" />
                          {/* L1 branches */}
                          <line x1="74" y1="22" x2="50" y2="46" stroke="#a5b4fc" strokeWidth="0.9" strokeDasharray="3.5 2.5" />
                          <line x1="80" y1="23" x2="80" y2="46" stroke="#a5b4fc" strokeWidth="0.9" strokeDasharray="3.5 2.5" />
                          <line x1="86" y1="22" x2="110" y2="46" stroke="#a5b4fc" strokeWidth="0.9" strokeDasharray="3.5 2.5" />
                          {/* L1 nodes */}
                          <circle cx="50" cy="48" r="6" fill="white" stroke="#818cf8" strokeWidth="1" />
                          <circle cx="80" cy="48" r="6" fill="white" stroke="#818cf8" strokeWidth="1" />
                          <circle cx="110" cy="48" r="6" fill="white" stroke="#818cf8" strokeWidth="1" />
                          {/* L2 branches from each */}
                          <line x1="45" y1="54" x2="32" y2="76" stroke="#c7d2fe" strokeWidth="0.7" strokeDasharray="3 2" />
                          <line x1="55" y1="54" x2="58" y2="76" stroke="#c7d2fe" strokeWidth="0.7" strokeDasharray="3 2" />
                          <line x1="76" y1="54" x2="70" y2="76" stroke="#c7d2fe" strokeWidth="0.7" strokeDasharray="3 2" />
                          <line x1="84" y1="54" x2="90" y2="76" stroke="#c7d2fe" strokeWidth="0.7" strokeDasharray="3 2" />
                          <line x1="105" y1="54" x2="102" y2="76" stroke="#c7d2fe" strokeWidth="0.7" strokeDasharray="3 2" />
                          <line x1="115" y1="54" x2="124" y2="76" stroke="#c7d2fe" strokeWidth="0.7" strokeDasharray="3 2" />
                          {/* L2 dots */}
                          <circle cx="32" cy="78" r="3" fill="#c7d2fe" />
                          <circle cx="58" cy="78" r="3" fill="#c7d2fe" />
                          <circle cx="70" cy="78" r="3" fill="#c7d2fe" />
                          <circle cx="90" cy="78" r="3" fill="#c7d2fe" />
                          <circle cx="102" cy="78" r="3" fill="#c7d2fe" />
                          <circle cx="124" cy="78" r="3" fill="#c7d2fe" />
                        </svg>
                      </div>
                      {/* Content */}
                      <div className="p-4 flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[13px] font-semibold text-gray-900">Predictive Insight</p>
                            <span className="text-[8px] font-semibold text-indigo-400 bg-indigo-50 border border-indigo-100 px-1 py-0.5 rounded">Prediction</span>
                          </div>
                          <div className={`w-4 h-4 rounded-full border-2 transition-all shrink-0 ${multiMode === 'mirrorfish' ? 'border-indigo-500 bg-indigo-500' : 'border-gray-200'
                            }`}>
                            {multiMode === 'mirrorfish' && <div className="w-1.5 h-1.5 rounded-full bg-white mx-auto mt-[3px]" />}
                          </div>
                        </div>
                        <p className="text-[11px] text-gray-400 leading-relaxed mb-3">Multiple models debate to generate probabilistic forecasts and trends.</p>
                        <div className="border-t border-gray-100 pt-3 mt-auto">
                          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Try something like</p>
                          <div className="space-y-1.5">
                            {[
                              { icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Predict BTC Price Tomorrow' },
                              { icon: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z', title: 'Forecast Q2 Market Trends' },
                              { icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', title: 'Predict Story Endings (Novel)' },
                              { icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Election Outcome Analysis' },
                            ].map(ex => (
                              <div key={ex.title} className="flex items-center gap-2 py-0.5">
                                <div className="w-4 h-4 rounded bg-slate-100 flex items-center justify-center shrink-0">
                                  <svg className="w-2.5 h-2.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={ex.icon} /></svg>
                                </div>
                                <p className="text-[10px] text-gray-500">{ex.title}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Behavior  */}
          {step === 'behavior' && (
            <div className="space-y-4">
              {/* Model 鈥?single pick for single; dynamic panel for multi-agent */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[13px] font-semibold text-gray-500">
                    {agentType === 'multi' ? 'Agent Panel' : 'Model'}
                  </label>
                  {agentType === 'multi' && (
                    <span className="text-[12px] text-gray-400">
                      {totalAgentCount} agent{totalAgentCount !== 1 ? 's' : ''} total
                    </span>
                  )}
                </div>

                {/* Single: radio list */}
                {agentType === 'single' && (
                  <div className="space-y-2">
                    {MODELS.map(m => (
                      <button key={m.id} onClick={() => setModel(m.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${model === m.id ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-200'
                          }`}
                      >
                        <div className={`w-2 h-2 rounded-full shrink-0 ${modelDotColor(m.id)}`} />
                        <div className="flex-1">
                          <p className="text-[13px] font-bold text-gray-900">{m.label}</p>
                          <p className="text-[12px] text-gray-400">{m.provider}</p>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${model === m.id ? 'border-gray-900 bg-gray-900' : 'border-gray-200'
                          }`}>
                          {model === m.id && <div className="w-1.5 h-1.5 rounded-full bg-white mx-auto mt-[2px]" />}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Multi: dynamic panel builder */}
                {agentType === 'multi' && (
                  <div className="space-y-2">
                    {agentPanel.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-100 bg-gray-50/60">
                        {/* Color dot */}
                        <div className={`w-2 h-2 rounded-full shrink-0 ${modelDotColor(row.modelId)}`} />

                        {/* Custom dropdown */}
                        <div className="relative w-48">
                          <button
                            onClick={() => setOpenPanelDropdown(openPanelDropdown === idx ? null : idx)}
                            className="w-full flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] font-medium text-gray-800 hover:border-gray-300 transition-all text-left"
                          >
                            <span className="flex-1 truncate">{MODELS.find(m => m.id === row.modelId)?.label}</span>
                            <svg className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${openPanelDropdown === idx ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {openPanelDropdown === idx && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenPanelDropdown(null)} />
                              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-20 min-w-full py-1 overflow-hidden">
                                {MODELS.map(m => (
                                  <button
                                    key={m.id}
                                    onClick={() => { updatePanelRow(idx, 'modelId', m.id); setOpenPanelDropdown(null); }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors ${row.modelId === m.id
                                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                                      : 'text-gray-700 hover:bg-gray-50'
                                      }`}
                                  >
                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${modelDotColor(m.id)}`} />
                                    <span className="flex-1">{m.label}</span>
                                    <span className="text-[12px] text-gray-400">{m.provider}</span>
                                    {row.modelId === m.id && (
                                      <svg className="w-3 h-3 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Count input */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[12px] text-gray-400">脳</span>
                          <input
                            type="number" min={1} max={20} value={row.count}
                            onChange={e => updatePanelRow(idx, 'count', Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                            className="w-20 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-gray-800 text-center focus:outline-none focus:border-indigo-300"
                          />
                          <span className="text-[12px] text-gray-400">agent{row.count !== 1 ? 's' : ''}</span>
                        </div>

                        {/* Remove row */}
                        <button
                          onClick={() => removePanelRow(idx)}
                          disabled={agentPanel.length === 1}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-200 transition-all disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                    {/* Add row button */}
                    <button
                      onClick={addPanelRow}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-200 text-[11px] font-medium text-gray-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all w-full"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      Add another model
                    </button>
                  </div>
                )}
              </div>

              {/* System prompt 鈥?skip for MirrorFish */}
              {(agentType === 'single' || multiMode === 'loka') && (
                <div>
                  <label className="text-[13px] font-semibold text-gray-500 mb-2 block">Background Context</label>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder={agentType === 'multi'
                      ? 'Provide background context or domain information for the agent panel...'
                      : 'Describe the role, background, and expertise of this agent...'}
                    className="w-full h-32 px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-gray-400 resize-none leading-relaxed"
                  />
                </div>
              )}

              {/* 鈹€鈹€ Cross-Check Precision config 鈹€鈹€ */}
              {agentType === 'multi' && multiMode === 'loka' && (
                <div className="space-y-5 pt-1">

                  {/* Decision Mode 鈥?FIRST, with SVG illustrations */}
                  <div>
                    <label className="text-[13px] font-semibold text-gray-500 mb-2 block">Decision Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                      {/* Consensus card */}
                      <button onClick={() => setCcMode('consensus')}
                        className={`rounded-xl border text-left transition-all overflow-hidden ${ccMode === 'consensus' ? 'border-indigo-300 shadow-sm shadow-indigo-100' : 'border-gray-100 hover:border-gray-200'
                          }`}
                      >
                        {/* SVG: all agents output full answers, then debate 鈫?merge */}
                        <div className="h-20 bg-slate-50 flex items-center justify-center">
                          <svg viewBox="0 0 140 72" width="140" height="72" fill="none">
                            {/* 3 agent nodes on left */}
                            <circle cx="22" cy="18" r="8" fill="white" stroke="#6366f1" strokeWidth="1.2" />
                            <circle cx="22" cy="36" r="8" fill="white" stroke="#6366f1" strokeWidth="1.2" />
                            <circle cx="22" cy="54" r="8" fill="white" stroke="#6366f1" strokeWidth="1.2" />
                            {/* Speech bubble dots = full answer */}
                            {[18, 36, 54].map(y => <>
                              <circle key={`d1-${y}`} cx="18" cy={y} r="1.2" fill="#6366f1" />
                              <circle key={`d2-${y}`} cx="22" cy={y} r="1.2" fill="#6366f1" />
                              <circle key={`d3-${y}`} cx="26" cy={y} r="1.2" fill="#6366f1" />
                            </>)}
                            {/* Arrows right toward center discussion */}
                            <line x1="30" y1="18" x2="60" y2="36" stroke="#a5b4fc" strokeWidth="0.9" strokeDasharray="3 2" />
                            <line x1="30" y1="36" x2="60" y2="36" stroke="#a5b4fc" strokeWidth="0.9" strokeDasharray="3 2" />
                            <line x1="30" y1="54" x2="60" y2="36" stroke="#a5b4fc" strokeWidth="0.9" strokeDasharray="3 2" />
                            {/* Discussion circle */}
                            <circle cx="75" cy="36" r="14" fill="white" stroke="#818cf8" strokeWidth="1" />
                            {/* Debate arrows inside */}
                            <path d="M67 33 Q75 28 83 33" stroke="#818cf8" strokeWidth="0.9" fill="none" markerEnd="url(#arr)" />
                            <path d="M83 39 Q75 44 67 39" stroke="#818cf8" strokeWidth="0.9" fill="none" />
                            {/* Arrow out to result */}
                            <line x1="89" y1="36" x2="112" y2="36" stroke="#6366f1" strokeWidth="1" />
                            <polygon points="112,33 118,36 112,39" fill="#6366f1" />
                            {/* Result node */}
                            <circle cx="126" cy="36" r="8" fill="#eef2ff" stroke="#6366f1" strokeWidth="1.2" />
                            <path d="M122.5 36l2.5 2.5 5-5" stroke="#6366f1" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <div className="p-3">
                          <p className={`text-[13px] font-semibold mb-0.5 ${ccMode === 'consensus' ? 'text-indigo-700' : 'text-gray-700'}`}>Consensus</p>
                          <p className="text-[11px] text-gray-400 leading-tight">Each agent produces a full answer, then agents debate until agreement is reached.</p>
                        </div>
                      </button>

                      {/* Collaboration card */}
                      <button onClick={() => setCcMode('collaboration')}
                        className={`rounded-xl border text-left transition-all overflow-hidden ${ccMode === 'collaboration' ? 'border-indigo-300 shadow-sm shadow-indigo-100' : 'border-gray-100 hover:border-gray-200'
                          }`}
                      >
                        {/* SVG: 4 agents each handle one part 鈫?combined output */}
                        <div className="h-20 bg-slate-50 flex items-center justify-center">
                          <svg viewBox="0 0 140 72" width="140" height="72" fill="none">
                            {/* 4 agent nodes stacked */}
                            <circle cx="22" cy="12" r="7" fill="white" stroke="#6366f1" strokeWidth="1.2" />
                            <circle cx="22" cy="28" r="7" fill="white" stroke="#6366f1" strokeWidth="1.2" />
                            <circle cx="22" cy="44" r="7" fill="white" stroke="#6366f1" strokeWidth="1.2" />
                            <circle cx="22" cy="60" r="7" fill="white" stroke="#6366f1" strokeWidth="1.2" />
                            {/* Partial output bars (each has 1 bar = one part) */}
                            <rect x="33" y="10" width="20" height="4" rx="2" fill="#c7d2fe" />
                            <rect x="33" y="26" width="20" height="4" rx="2" fill="#a5b4fc" />
                            <rect x="33" y="42" width="20" height="4" rx="2" fill="#818cf8" />
                            <rect x="33" y="58" width="20" height="4" rx="2" fill="#6366f1" />
                            {/* Merge arrows */}
                            <line x1="53" y1="12" x2="82" y2="30" stroke="#a5b4fc" strokeWidth="0.8" strokeDasharray="3 2" />
                            <line x1="53" y1="28" x2="82" y2="33" stroke="#a5b4fc" strokeWidth="0.8" strokeDasharray="3 2" />
                            <line x1="53" y1="44" x2="82" y2="39" stroke="#a5b4fc" strokeWidth="0.8" strokeDasharray="3 2" />
                            <line x1="53" y1="60" x2="82" y2="42" stroke="#a5b4fc" strokeWidth="0.8" strokeDasharray="3 2" />
                            {/* Assembled output block */}
                            <rect x="82" y="26" width="28" height="4" rx="2" fill="#c7d2fe" />
                            <rect x="82" y="32" width="28" height="4" rx="2" fill="#a5b4fc" />
                            <rect x="82" y="38" width="28" height="4" rx="2" fill="#818cf8" />
                            <rect x="82" y="44" width="28" height="4" rx="2" fill="#6366f1" />
                            {/* Border around assembled */}
                            <rect x="81" y="24" width="30" height="26" rx="3" stroke="#6366f1" strokeWidth="1" fill="none" />
                            {/* Arrow to final */}
                            <line x1="111" y1="36" x2="124" y2="36" stroke="#6366f1" strokeWidth="1" />
                            <polygon points="124,33 130,36 124,39" fill="#6366f1" />
                          </svg>
                        </div>
                        <div className="p-3">
                          <p className={`text-[13px] font-semibold mb-0.5 ${ccMode === 'collaboration' ? 'text-indigo-700' : 'text-gray-700'}`}>Collaboration</p>
                          <p className="text-[11px] text-gray-400 leading-tight">Each agent handles one segment; results are assembled into a unified output.</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Agreement threshold 鈥?Consensus only */}
                  {ccMode === 'consensus' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[13px] font-semibold text-gray-500">Agreement Threshold</label>
                        <span className="text-[12px] font-semibold text-indigo-600">{ccThreshold}%</span>
                      </div>
                      <p className="text-[12px] text-gray-400 mb-2.5">When this percentage of agents reach the same conclusion, it counts as a pass.</p>
                      <div className="relative">
                        <input type="range" min={50} max={95} step={5} value={ccThreshold}
                          onChange={e => setCcThreshold(Number(e.target.value))}
                          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                          style={{ background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${(ccThreshold - 50) / 45 * 100}%, #e5e7eb ${(ccThreshold - 50) / 45 * 100}%, #e5e7eb 100%)` }}
                        />
                        <div className="flex justify-between mt-1">
                          <span className="text-[11px] text-gray-400">Lenient 50%</span>
                          <span className="text-[11px] text-gray-400">Strict 95%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Analysis depth 鈥?Consensus only */}
                  {ccMode === 'consensus' && (
                    <div>
                      <label className="text-[13px] font-semibold text-gray-500 mb-2 block">Analysis Depth</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { rounds: 1 as const, label: 'Fast', sub: '1 round' },
                          { rounds: 2 as const, label: 'Standard', sub: '2 rounds' },
                          { rounds: 3 as const, label: 'Deep', sub: '3 rounds' },
                        ].map(d => (
                          <button key={d.rounds} onClick={() => setCcDepth(d.rounds)}
                            className={`p-2.5 rounded-xl border text-left transition-all ${ccDepth === d.rounds ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'
                              }`}
                          >
                            <p className={`text-[13px] font-semibold mb-0.5 ${ccDepth === d.rounds ? 'text-indigo-700' : 'text-gray-700'}`}>{d.label}</p>
                            <p className="text-[11px] text-gray-400">{d.sub}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 鈹€鈹€ MirrorFish / Predictive config 鈹€鈹€ */}
              {agentType === 'multi' && multiMode === 'mirrorfish' && (
                <div className="space-y-5 pt-1">

                  {/* 1. Background Context (Seed) */}
                  <div>
                    <label className="text-[13px] font-semibold text-gray-700 mb-1 block">Background Context</label>
                    <p className="text-[12px] text-gray-400 mb-2.5">Provide background information as the seed for the simulation. You can type directly or upload a file.</p>
                    <textarea
                      value={mfSeed}
                      onChange={e => setMfSeed(e.target.value)}
                      placeholder="e.g. Recent macro data, company financials, event context..."
                      className="w-full h-24 px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-indigo-300 resize-none leading-relaxed"
                    />
                    {/* File upload */}
                    <div className="mt-2">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="file"
                          multiple
                          accept=".txt,.pdf,.md,.csv,.json,.docx"
                          className="hidden"
                          onChange={e => setMfFiles(prev => [...prev, ...Array.from(e.target.files || [])])}
                        />
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-gray-200 text-[12px] text-gray-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/40 transition-all">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          Attach file
                        </div>
                      </label>
                      {/* Attached file chips */}
                      {mfFiles.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {mfFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 text-[11px] text-gray-600">
                              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="max-w-[120px] truncate">{f.name}</span>
                              <button
                                onClick={() => setMfFiles(prev => prev.filter((_, j) => j !== i))}
                                className="text-gray-400 hover:text-gray-700 transition-colors ml-0.5"
                              >脳</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. Task */}
                  <div>
                    <label className="text-[13px] font-semibold text-gray-700 mb-1 block">Task</label>
                    <p className="text-[12px] text-gray-400 mb-2.5">Describe the specific scenario or event you want the agents to simulate and forecast.</p>
                    <textarea
                      value={mfTask}
                      onChange={e => setMfTask(e.target.value)}
                      placeholder="e.g. Predict BTC price movement in the 72 hours following the next Fed rate decision..."
                      className="w-full h-24 px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-indigo-300 resize-none leading-relaxed"
                    />
                  </div>

                  {/* Creativity / Temperature */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[13px] font-semibold text-gray-500">Creativity</label>
                      <span className="text-[12px] text-gray-400">
                        {mfTemperature < 35 ? 'Conservative' : mfTemperature < 65 ? 'Balanced' : 'Exploratory'}
                      </span>
                    </div>
                    <p className="text-[12px] text-gray-400 mb-2.5">Higher values produce more speculative, diverse forecasts; lower stays closer to consensus.</p>
                    <input type="range" min={0} max={100} step={5} value={mfTemperature}
                      onChange={e => setMfTemperature(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${mfTemperature}%, #e5e7eb ${mfTemperature}%, #e5e7eb 100%)` }}
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-[11px] text-gray-400">Conservative</span>
                      <span className="text-[11px] text-gray-400">Exploratory</span>
                    </div>
                  </div>

                  {/* Simulation duration */}
                  <div>
                    <label className="text-[13px] font-semibold text-gray-500 mb-2 block">Simulation Depth</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { h: 24 as const, label: 'Fast', sub: '24 hours' },
                        { h: 72 as const, label: 'Standard', sub: '72 hours' },
                        { h: 168 as const, label: 'Deep', sub: '7 days' },
                      ].map(d => (
                        <button key={d.h} onClick={() => setMfDuration(d.h)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${mfDuration === d.h ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'
                            }`}
                        >
                          <p className={`text-[13px] font-semibold mb-0.5 ${mfDuration === d.h ? 'text-indigo-700' : 'text-gray-700'}`}>{d.label}</p>
                          <p className="text-[11px] text-gray-400">{d.sub}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Capabilities */}
              <div>
                <label className="text-[13px] font-semibold text-gray-500 mb-2 block">Capabilities</label>
                <div className="grid grid-cols-2 gap-2">
                  {CAPS.map(c => (
                    <button key={c} onClick={() => toggleCap(c)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${capabilities.has(c) ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-200'
                        }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${capabilities.has(c) ? 'bg-gray-900 border-gray-900' : 'border-gray-300'
                        }`}>
                        {capabilities.has(c) && <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <span className="text-[11px] font-medium text-gray-700">{c}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 鈹€鈹€ Step 3: Basic Info 鈹€鈹€ */}
          {step === 'info' && (
            <div className="space-y-4">
              {/* Avatar upload */}
              <div className="flex justify-center mb-2">
                <label className="cursor-pointer group relative">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const url = URL.createObjectURL(file);
                        setAvatarUrl(url);
                      }
                    }}
                  />
                  {/* Preview or placeholder */}
                  <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-md relative">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-2xl">
                        {name ? name[0].toUpperCase() : 'A'}
                      </div>
                    )}
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 text-center mt-1.5">Upload photo</p>
                </label>
              </div>
              <div>
                <label className="text-[13px] font-semibold text-gray-500 mb-1.5 block">Name *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Market Research Assistant"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-gray-500 mb-1.5 block">Description</label>
                <textarea
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="A short description to help others understand what this agent does..."
                  className="w-full h-20 px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-gray-400 resize-none"
                />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-gray-500 mb-1.5 block">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setCategory(c)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${category === c ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>{c}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 鈹€鈹€ Step 4: Publish 鈹€鈹€ */}
          {step === 'publish' && (
            <div className="space-y-5">
              {/* Visibility */}
              <div>
                <label className="text-[13px] font-semibold text-gray-500 mb-2 block">Visibility</label>
                <div className="space-y-2">
                  {([
                    {
                      id: 'public' as const, label: 'Public', desc: 'Anyone on Loka can discover and use this agent.',
                      icon: <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="1.5" /><path strokeLinecap="round" strokeWidth="1.5" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" /></svg>
                    },
                    {
                      id: 'group' as const, label: 'Group', desc: 'Only members of your groups can access this agent.',
                      icon: <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    },
                    {
                      id: 'private' as const, label: 'Private', desc: 'Only you can see and use this agent.',
                      icon: <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" strokeWidth="1.5" /><path strokeLinecap="round" strokeWidth="1.5" d="M7 11V7a5 5 0 0110 0v4" /></svg>
                    },
                  ]).map(v => (
                    <button key={v.id} onClick={() => setVisibility(v.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${visibility === v.id ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-200'
                        }`}
                    >
                      {v.icon}
                      <div className="flex-1">
                        <p className="text-[13px] font-bold text-gray-900">{v.label}</p>
                        <p className="text-[12px] text-gray-400">{v.desc}</p>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${visibility === v.id ? 'border-gray-900 bg-gray-900' : 'border-gray-200'
                        }`}>
                        {visibility === v.id && <div className="w-1.5 h-1.5 rounded-full bg-white mx-auto mt-[2px]" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Pricing */}
              <div>
                <label className="text-[13px] font-semibold text-gray-500 mb-2 block">Creator Premium</label>
                <div className="space-y-2">
                  <button onClick={() => setPricing('free')}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${pricing === 'free' ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-200'
                      }`}
                  >
                    <div className="flex-1">
                      <p className="text-[13px] font-bold text-gray-900">Free</p>
                      <p className="text-[12px] text-gray-400">Users only pay the model base cost. No extra charge from you.</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${pricing === 'free' ? 'border-gray-900 bg-gray-900' : 'border-gray-200'}`}>
                      {pricing === 'free' && <div className="w-1.5 h-1.5 rounded-full bg-white mx-auto mt-[2px]" />}
                    </div>
                  </button>
                  <button onClick={() => setPricing('subscription')}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${pricing === 'subscription' ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-200'
                      }`}
                  >
                    <div className="flex-1">
                      <p className="text-[13px] font-bold text-gray-900">Subscription</p>
                      <p className="text-[12px] text-gray-400">Users pay a monthly fee to access your agent.</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${pricing === 'subscription' ? 'border-gray-900 bg-gray-900' : 'border-gray-200'}`}>
                      {pricing === 'subscription' && <div className="w-1.5 h-1.5 rounded-full bg-white mx-auto mt-[2px]" />}
                    </div>
                  </button>
                  {pricing === 'subscription' && (
                    <div className="ml-4 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input type="number" value={premiumPrice} onChange={e => setPremiumPrice(e.target.value)}
                          placeholder="0.00" className="w-24 px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-800 focus:outline-none focus:border-gray-400" />
                        <span className="text-[11px] text-gray-400 font-medium">USDC / month</span>
                      </div>
                      <p className="text-[11px] text-amber-600 flex items-center gap-1">
                        <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Platform takes a 10% fee. You receive {premiumPrice ? (Number(premiumPrice) * 0.9).toFixed(2) : '...'} USDC / month.
                      </p>
                    </div>
                  )}
                  <button onClick={() => setPricing('pay_per_use')}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${pricing === 'pay_per_use' ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-200'
                      }`}
                  >
                    <div className="flex-1">
                      <p className="text-[13px] font-bold text-gray-900">Pay per use</p>
                      <p className="text-[12px] text-gray-400">Charge an extra fee on top of model cost per message.</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${pricing === 'pay_per_use' ? 'border-gray-900 bg-gray-900' : 'border-gray-200'}`}>
                      {pricing === 'pay_per_use' && <div className="w-1.5 h-1.5 rounded-full bg-white mx-auto mt-[2px]" />}
                    </div>
                  </button>
                  {pricing === 'pay_per_use' && (
                    <div className="ml-4 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input type="number" value={premiumPrice} onChange={e => setPremiumPrice(e.target.value)}
                          placeholder="0.00" className="w-24 px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-800 focus:outline-none focus:border-gray-400" />
                        <span className="text-[11px] text-gray-400 font-medium">USDC / message</span>
                      </div>
                      <p className="text-[11px] text-amber-600 flex items-center gap-1">
                        <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Platform takes a 10% fee. You receive {premiumPrice ? (Number(premiumPrice) * 0.9).toFixed(4) : '...'} USDC / message.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>}

        {/* 鈹€鈹€ Done: Success screen 鈹€鈹€ */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center py-12 text-center">

            {/* Celebration icon */}
            <div className="relative mb-6"
              style={{ animation: 'scaleIn 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
              {/* Outer glow ring */}
              <div className="w-24 h-24 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-gray-900 flex items-center justify-center">
                  {/* Sparkle / check */}
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    style={{ strokeDasharray: 30, strokeDashoffset: 30, animation: 'drawCheck 0.4s ease 0.35s forwards' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              {/* Decorative dots */}
              <span style={{ position: 'absolute', top: '-4px', right: '4px', width: 8, height: 8, borderRadius: '50%', background: '#6366f1', animation: 'popIn 0.3s ease 0.5s both' }} />
              <span style={{ position: 'absolute', top: '10px', right: '-8px', width: 5, height: 5, borderRadius: '50%', background: '#a5b4fc', animation: 'popIn 0.3s ease 0.6s both' }} />
              <span style={{ position: 'absolute', bottom: '4px', right: '-6px', width: 6, height: 6, borderRadius: '50%', background: '#4f46e5', animation: 'popIn 0.3s ease 0.7s both' }} />
              <span style={{ position: 'absolute', top: '-2px', left: '6px', width: 6, height: 6, borderRadius: '50%', background: '#c7d2fe', animation: 'popIn 0.3s ease 0.55s both' }} />
              <span style={{ position: 'absolute', bottom: '2px', left: '-6px', width: 5, height: 5, borderRadius: '50%', background: '#818cf8', animation: 'popIn 0.3s ease 0.65s both' }} />
            </div>

            <h2 className="text-[20px] font-bold text-gray-900 mb-1.5">Agent published!</h2>
            <p className="text-[13px] text-gray-400 mb-6 max-w-[220px] leading-relaxed">
              <span className="font-semibold text-gray-700">{name || 'Your agent'}</span> is now live
              {visibility === 'public' ? ' and discoverable by everyone' : visibility === 'group' ? ' for your group members' : ' (private)'}.
            </p>

            {/* Summary chips */}
            <div className="flex flex-wrap gap-2 justify-center mb-8">
              {agentType === 'multi' && multiMode && (
                <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[11px] font-semibold">
                  {multiMode === 'loka' ? 'Cross-check' : 'MirrorFace'}
                </span>
              )}
              {agentType !== 'multi' && (
                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-[11px] font-semibold">
                  {MODELS.find(m => m.id === model)?.label}
                </span>
              )}
              {category && (
                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-[11px] font-semibold">
                  {category}
                </span>
              )}
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${pricing === 'free' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
                }`}>
                {pricing === 'free' ? 'Free' : pricing === 'subscription' ? `${premiumPrice || '...'} USDC/mo` : `${premiumPrice || '...'} USDC/msg`}
              </span>
            </div>

            {/* CTAs */}
            <div className="flex gap-2.5">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-500 hover:bg-gray-50 transition-all"
              >
                Close
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-[13px] font-bold transition-all active:scale-[0.98] flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Chat with Agent
              </button>
            </div>

            <style>{`
                @keyframes scaleIn {
                  from { transform: scale(0.5); opacity: 0; }
                  to   { transform: scale(1);   opacity: 1; }
                }
                @keyframes drawCheck {
                  to { stroke-dashoffset: 0; }
                }
                @keyframes popIn {
                  from { transform: scale(0); opacity: 0; }
                  to   { transform: scale(1); opacity: 1; }
                }
              `}</style>
          </div>
        )}

        {/* Footer hidden on done screen */}
        {step !== 'done' && <div className="mt-6 flex justify-end">
          {step === 'publish' ? (
            <button
              onClick={() => setStep('done')}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-[13px] font-bold transition-all active:scale-[0.98]"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              Publish Agent
            </button>
          ) : (
            <button
              onClick={next}
              disabled={!canNext}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-[13px] font-bold transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
        </div>}
      </div>
    </div>
  );
};

export default CreateAgentModal;
