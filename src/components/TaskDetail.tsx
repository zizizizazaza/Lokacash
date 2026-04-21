import React from 'react';
import { TaskItem } from '../types';

interface TaskDetailProps {
    task: TaskItem;
    onBack: () => void;
}

const TaskDetail: React.FC<TaskDetailProps> = ({ task, onBack }) => {
    const categoryColors = {
        bounty: 'text-blue-500 bg-blue-50',
        airdrop: 'text-[#a3ff12] bg-black',
        platform: 'text-purple-500 bg-purple-50'
    };

    return (
        <div className="container mx-auto px-6 py-10 animate-fadeIn max-w-5xl">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-gray-400 hover:text-black transition-colors text-[10px] font-black tracking-widest mb-8"
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                BACK TO DASHBOARD
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10">
                {/* Left Column: Content */}
                <div className="space-y-8">
                    <div className="space-y-5">
                        <div className="flex items-center gap-4">
                            <div className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-[0.2em] ${categoryColors[task.category]}`}>
                                {task.platform}
                            </div>
                            <div className="h-px flex-1 bg-gray-100" />
                        </div>

                        <h1 className="text-3xl md:text-5xl font-black text-black leading-tight tracking-tight">
                            {task.title}
                        </h1>

                        <div className="flex flex-wrap gap-2.5 mt-2">
                            {task.tags.map(tag => (
                                <span key={tag} className="px-2.5 py-1 bg-gray-50 text-gray-400 text-[9px] font-black tracking-widest rounded border border-gray-100 uppercase">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="prose max-w-none">
                        <h3 className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-3">Description</h3>
                        <p className="text-gray-600 font-medium leading-relaxed text-base">
                            {task.description}
                        </p>
                    </div>

                    {/* Execution Strategy */}
                    <div className="bg-white border border-gray-100 rounded-2xl p-8 space-y-6 shadow-sm">
                        <div>
                            <h3 className="text-[10px] font-black text-black uppercase tracking-widest mb-4 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#a3ff12]"></span>
                                Claw Execution Protocol
                            </h3>
                            <p className="text-sm text-gray-500 font-medium mb-2">
                                Recommended technical path for automated completion.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-gray-50">
                            <StrategySection
                                title="Prerequisites"
                                items={[
                                    'Wallet connected ($1+ gas)',
                                    'Claw v3.x runtime active',
                                    'Skill module initialized'
                                ]}
                            />
                            <StrategySection
                                title="Action Steps"
                                items={[
                                    'API Authentication flow',
                                    'Draft generation/validation',
                                    'Signed proof submission'
                                ]}
                            />
                        </div>
                    </div>
                </div>

                {/* Right Column: Dynamic Action Box */}
                <div className="space-y-6">
                    <div className="bg-black rounded-2xl p-7 text-white space-y-6 sticky top-32 shadow-xl border border-white/5 group">
                        <div className="space-y-4 relative z-10">
                            <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em]">Estimate Reward</span>
                                <div className="text-3xl font-black text-[#a3ff12] tracking-tight">{task.reward}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 py-5 border-y border-white/10">
                                <div>
                                    <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Difficulty</span>
                                    <div className="text-xs font-bold text-white">{task.difficulty}</div>
                                </div>
                                <div>
                                    <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Time Est.</span>
                                    <div className="text-xs font-bold text-white">{task.timeEstimate}</div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 relative z-10">
                            <button className="w-full py-4 bg-[#a3ff12] text-black rounded-xl text-sm font-black hover:bg-[#b4ff3a] transition-all">
                                Execute via Claw
                            </button>
                            <p className="text-center text-[9px] font-bold text-gray-500 tracking-wide">
                                Secured via escrow agreement
                            </p>
                        </div>
                    </div>

                    <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-3">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Source Reference</span>
                        <a
                            href={task.url || '#'}
                            target={task.url ? '_blank' : undefined}
                            rel={task.url ? 'noopener noreferrer' : undefined}
                            className="text-[11px] font-bold text-black border-b border-black/10 hover:border-black transition-all inline-flex items-center gap-1.5 truncate"
                        >
                            {task.url || `${task.platform.toLowerCase()}.io/tasks/${task.id}`}
                            {task.url && (
                                <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            )}
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

const StrategySection: React.FC<{ title: string; items: string[] }> = ({ title, items }) => (
    <div className="space-y-3">
        <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{title}</h4>
        <ul className="space-y-2">
            {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                    <span className="text-xs font-bold text-gray-600 leading-tight">{item}</span>
                </li>
            ))}
        </ul>
    </div>
);

export default TaskDetail;
