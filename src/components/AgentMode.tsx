
import React, { useState } from 'react';

const AgentMode: React.FC = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);

  const generateKey = () => {
    const key = 'loka_live_' + Math.random().toString(36).substr(2, 24);
    setApiKey(key);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-12 animate-fadeIn pb-20 px-4 sm:px-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        <div className="space-y-10">
          <div className="glass p-6 sm:p-12 rounded-3xl sm:rounded-[40px] bg-white border border-gray-100 h-full flex flex-col justify-between">
            <div>
              <div className="inline-block px-3 py-1 bg-gray-50 rounded-full text-[10px] font-bold text-gray-500 tracking-widest  mb-6 border border-gray-100">x402 Protocol</div>
              <h2 className="font-serif text-3xl sm:text-5xl italic mb-6 text-black">Monetizing the Machine.</h2>
              <p className="text-gray-500 leading-relaxed mb-8">
                Deploy autonomous payment capabilities. The x402 standard allows agents to programmatically mint, stream, and settle treasury value without human friction.
              </p>
              
              <div className="space-y-6">
                 <FeatureItem title="Machine-Speed Value" desc="Instant settlement for high-frequency compute tool calls." />
                 <FeatureItem title="Autonomous Routing" desc="Smart routing of AIUSD across agent toolchains." />
                 <FeatureItem title="Trustless Billing" desc="Programmable escrow for agent-to-agent task fulfillment." />
              </div>
            </div>

            <button 
              onClick={generateKey}
              className="mt-12 w-full py-6 rounded-full bg-black text-white font-bold  text-[11px] tracking-[0.3em] hover:bg-gray-800 transition-all shadow-lg"
            >
              {apiKey ? 'Rotate Credentials' : 'Provision Agent Key'}
            </button>
          </div>
        </div>

        <div className="space-y-6 flex flex-col">
          <div className="flex-1 glass p-10 rounded-[40px] bg-white border border-gray-100">
            <h3 className="text-[10px] font-bold tracking-[0.2em] text-gray-400 mb-8  flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-black" />
              Developer Sandbox
            </h3>

            {apiKey ? (
               <div className="space-y-8 animate-fadeIn">
                 <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 font-mono text-xs">
                    <p className="text-gray-400 mb-2  text-[9px]">Provisioned Access Key</p>
                    <p className="text-black break-all">{apiKey}</p>
                 </div>
                 
                 <div className="space-y-4">
                    <p className="text-[10px] text-gray-400 font-bold tracking-widest ">Implementation Snippet</p>
                    <div className="bg-[#121212] p-8 rounded-3xl border border-black font-mono text-[11px] text-gray-400 leading-relaxed shadow-xl">
                      <span className="text-blue-400">const</span> agent = <span className="text-white">new</span> <span className="text-teal-400">LokaAgent</span>({`{`}<br/>
                      &nbsp;&nbsp;apiKey: <span className="text-orange-300">'{apiKey.slice(0, 10)}...'</span>,<br/>
                      &nbsp;&nbsp;protocol: <span className="text-orange-300">'x402'</span><br/>
                      {`}`});<br/><br/>
                      <span className="text-gray-600">// Conditional task settlement</span><br/>
                      <span className="text-white">await</span> agent.<span className="text-teal-400">settle</span>(<span className="text-orange-300">'TASK_ID_882'</span>, {`{`}<br/>
                      &nbsp;&nbsp;value: <span className="text-white">0.42</span>,<br/>
                      &nbsp;&nbsp;currency: <span className="text-orange-300">'AIUSD'</span><br/>
                      {`}`});
                    </div>
                 </div>
               </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-20">
                <div className="w-12 h-12 bg-black rounded-full mb-6" />
                <p className="text-xs font-bold tracking-widest ">No Active Session</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const FeatureItem: React.FC<{ title: string; desc: string }> = ({ title, desc }) => (
  <div className="flex items-start gap-4">
    <div className="mt-1 w-1 h-1 rounded-full bg-black" />
    <div>
      <h4 className="text-black font-bold text-xs  tracking-widest mb-1">{title}</h4>
      <p className="text-[11px] text-gray-500 leading-relaxed tracking-tight">{desc}</p>
    </div>
  </div>
);

export default AgentMode;
