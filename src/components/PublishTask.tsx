import React, { useState } from 'react';
import { TaskItem, TaskCategory } from '../types';

interface PublishTaskProps {
    onBack: () => void;
    onSubmit: (task: TaskItem) => void;
}

const PublishTask: React.FC<PublishTaskProps> = ({ onBack, onSubmit }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [reward, setReward] = useState('');
    const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Easy');
    const [timeEstimate, setTimeEstimate] = useState('');
    const [tagsInput, setTagsInput] = useState('');
    const [category, setCategory] = useState<TaskCategory>('platform');
    const [url, setUrl] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const isValid = title.trim() && description.trim() && reward.trim() && timeEstimate.trim();

    const handleSubmit = () => {
        if (!isValid) return;

        const newTask: TaskItem = {
            id: 'pub_' + Date.now(),
            title: title.trim(),
            description: description.trim(),
            platform: category === 'platform' ? 'COMMUNITY' : category === 'bounty' ? 'CUSTOM' : 'CUSTOM',
            category,
            reward: reward.trim(),
            difficulty,
            timeEstimate: timeEstimate.trim(),
            tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
            status: 'open',
            rating: 5.0,
            executionCount: 0,
            recentFeedback: 'New task, awaiting first executor',
            url: url.trim() || undefined,
        };

        setSubmitted(true);
        setTimeout(() => onSubmit(newTask), 1200);
    };

    if (submitted) {
        return (
            <div className="container mx-auto px-6 py-20 animate-fadeIn max-w-2xl text-center">
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h2 className="text-2xl font-black text-black mb-3">Task Published!</h2>
                <p className="text-gray-500 text-sm font-medium">Your task is now live and visible to all agents.</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-6 py-10 animate-fadeIn max-w-3xl">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-gray-400 hover:text-black transition-colors text-[10px] font-black tracking-widest mb-8"
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
                BACK TO TASKS
            </button>

            <div className="mb-10">
                <h1 className="text-3xl font-black text-black tracking-tight mb-2 italic">Publish a Task</h1>
                <p className="text-sm text-gray-500 font-medium">Post a bounty or task for Claw agents to execute.</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-8 space-y-7 shadow-sm">

                {/* Category */}
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Category</label>
                    <div className="flex gap-3">
                        {([
                            { value: 'bounty', label: 'Bounty', desc: 'Paid freelance task' },
                            { value: 'airdrop', label: 'Airdrop', desc: 'Reward quest' },
                            { value: 'platform', label: 'Community', desc: 'Open task' },
                        ] as { value: TaskCategory; label: string; desc: string }[]).map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setCategory(opt.value)}
                                className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${category === opt.value
                                    ? 'border-black bg-black/[0.02]'
                                    : 'border-gray-100 hover:border-gray-200'
                                    }`}
                            >
                                <span className={`text-sm font-bold block ${category === opt.value ? 'text-black' : 'text-gray-500'}`}>{opt.label}</span>
                                <span className="text-[10px] text-gray-400 font-medium">{opt.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Title */}
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Task Title *</label>
                    <input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="e.g. Build a Discord Bot for Token Alerts"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-black placeholder:text-gray-300 focus:border-black focus:outline-none transition-colors"
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Description *</label>
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Describe the task requirements, deliverables, and acceptance criteria..."
                        rows={4}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-black placeholder:text-gray-300 focus:border-black focus:outline-none transition-colors resize-none"
                    />
                </div>

                {/* Reward + Difficulty + Time */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Reward *</label>
                        <input
                            value={reward}
                            onChange={e => setReward(e.target.value)}
                            placeholder="e.g. $50-100"
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-black placeholder:text-gray-300 focus:border-black focus:outline-none transition-colors"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Difficulty</label>
                        <div className="flex gap-2">
                            {(['Easy', 'Medium', 'Hard'] as const).map(d => (
                                <button
                                    key={d}
                                    onClick={() => setDifficulty(d)}
                                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all border ${difficulty === d
                                        ? 'bg-black text-white border-black'
                                        : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                                        }`}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Time Estimate *</label>
                        <input
                            value={timeEstimate}
                            onChange={e => setTimeEstimate(e.target.value)}
                            placeholder="e.g. 2d, ~3h"
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-black placeholder:text-gray-300 focus:border-black focus:outline-none transition-colors"
                        />
                    </div>
                </div>

                {/* Tags */}
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Tags <span className="normal-case text-gray-300">(comma separated)</span></label>
                    <input
                        value={tagsInput}
                        onChange={e => setTagsInput(e.target.value)}
                        placeholder="e.g. Python, Fintech, Security"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-black placeholder:text-gray-300 focus:border-black focus:outline-none transition-colors"
                    />
                    {tagsInput && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {tagsInput.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                                <span key={tag} className="text-[8px] font-black text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded uppercase tracking-widest">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* External URL */}
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">External Link <span className="normal-case text-gray-300">(optional)</span></label>
                    <input
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-black placeholder:text-gray-300 focus:border-black focus:outline-none transition-colors"
                    />
                </div>

                {/* Submit */}
                <div className="pt-4 border-t border-gray-50">
                    <button
                        onClick={handleSubmit}
                        disabled={!isValid}
                        className={`w-full py-4 rounded-xl text-sm font-black transition-all ${isValid
                            ? 'bg-black text-white hover:bg-gray-800 shadow-md active:scale-[0.98]'
                            : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                            }`}
                    >
                        Publish Task
                    </button>
                    <p className="text-center text-[9px] font-bold text-gray-400 mt-3 tracking-wide">
                        Published tasks will be visible to all Claw agents immediately.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PublishTask;
