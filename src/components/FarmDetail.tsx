import React, { useState, useEffect } from 'react';
import { FarmItem } from '../types';

interface FarmDetailProps {
    item: FarmItem;
    onBack: () => void;
}

const FarmDetail: React.FC<FarmDetailProps> = ({ item, onBack }) => {
    const [farming, setFarming] = useState(false);
    const [currentStep, setCurrentStep] = useState(-1);
    const [completed, setCompleted] = useState(false);

    const typeLabels = { quest: 'Quest', testnet: 'Testnet', yield: 'Yield' };
    const typeColors = {
        quest: 'text-blue-600 bg-blue-50',
        testnet: 'text-amber-600 bg-amber-50',
        yield: 'text-green-600 bg-green-50',
    };

    const startFarming = () => {
        setFarming(true);
        setCurrentStep(0);
    };

    // Simulate step execution
    useEffect(() => {
        if (!farming || !item.steps || currentStep < 0) return;
        if (currentStep >= item.steps.length) {
            setCompleted(true);
            setFarming(false);
            return;
        }
        const timer = setTimeout(() => setCurrentStep(prev => prev + 1), 1500 + Math.random() * 1000);
        return () => clearTimeout(timer);
    }, [farming, currentStep, item.steps]);

    return (
        <div className="container mx-auto px-6 py-10 animate-fadeIn max-w-5xl">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-gray-400 hover:text-black transition-colors text-[10px] font-black tracking-widest mb-8"
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
                BACK TO OPPORTUNITIES
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-10">
                {/* Left Column */}
                <div className="space-y-8">
                    {/* Header */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-[0.2em] ${typeColors[item.type]}`}>
                                {typeLabels[item.type]}
                            </span>
                            <span className="px-2.5 py-1 rounded-md bg-gray-100 text-[9px] font-bold text-gray-500">{item.chain}</span>
                            {item.isHot && <span className="text-sm">🔥</span>}
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black text-black leading-tight tracking-tight">{item.title}</h1>
                        <div className="flex items-center gap-3">
                            <div className="w-6 h-6 bg-black rounded-lg flex items-center justify-center text-[10px] font-black text-white">
                                {item.source[0]}
                            </div>
                            <span className="text-sm font-bold text-gray-500">{item.source}</span>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <h3 className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-3">Description</h3>
                        <p className="text-gray-600 font-medium leading-relaxed text-base">{item.description}</p>
                    </div>

                    {/* Execution Steps */}
                    {item.steps && (
                        <div className="bg-white border border-gray-100 rounded-2xl p-8 space-y-6 shadow-sm">
                            <div>
                                <h3 className="text-[10px] font-black text-black uppercase tracking-widest mb-1 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#a3ff12]"></span>
                                    Execution Plan
                                </h3>
                                <p className="text-sm text-gray-500 font-medium">
                                    {item.steps.length} steps will be executed automatically by your Claw Agent.
                                </p>
                            </div>

                            <div className="space-y-3">
                                {item.steps.map((step, i) => {
                                    const isDone = i < currentStep;
                                    const isActive = i === currentStep && farming;

                                    return (
                                        <div
                                            key={i}
                                            className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${isDone ? 'bg-green-50 border-green-200' :
                                                    isActive ? 'bg-blue-50 border-blue-200' :
                                                        'bg-gray-50 border-gray-100'
                                                }`}
                                        >
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${isDone ? 'bg-green-500 text-white' :
                                                    isActive ? 'bg-blue-500 text-white animate-pulse' :
                                                        'bg-gray-200 text-gray-400'
                                                }`}>
                                                {isDone ? '✓' : i + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-bold ${isDone ? 'text-green-700' : isActive ? 'text-blue-700' : 'text-gray-600'}`}>
                                                    {step.action}
                                                </p>
                                                <p className="text-[10px] text-gray-400 font-medium">via {step.protocol}</p>
                                            </div>
                                            <span className={`text-xs font-bold shrink-0 ${step.gas === 'Free' ? 'text-green-500' : 'text-gray-400'}`}>
                                                {step.gas}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Tags */}
                    <div className="flex flex-wrap gap-2">
                        {item.tags.map(tag => (
                            <span key={tag} className="px-2.5 py-1 bg-gray-50 text-gray-400 text-[9px] font-black tracking-widest rounded border border-gray-100 uppercase">
                                #{tag}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Right Column: Action Box */}
                <div className="space-y-6">
                    <div className="bg-black rounded-2xl p-7 text-white space-y-6 sticky top-32 shadow-xl border border-white/5">
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em]">Reward</span>
                                <div className={`text-3xl font-black tracking-tight ${item.rewardType === 'potential' ? 'text-amber-400' :
                                        item.rewardType === 'apy' ? 'text-green-400' :
                                            'text-[#a3ff12]'
                                    }`}>
                                    {item.reward}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 py-5 border-y border-white/10">
                                <div>
                                    <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Est. Gas</span>
                                    <div className={`text-sm font-bold ${item.estimatedGas === 'Free' ? 'text-green-400' : 'text-white'}`}>
                                        {item.estimatedGas}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Steps</span>
                                    <div className="text-sm font-bold text-white">{item.steps?.length || 0}</div>
                                </div>
                                {item.difficulty && (
                                    <div>
                                        <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Difficulty</span>
                                        <div className="text-sm font-bold text-white">{item.difficulty}</div>
                                    </div>
                                )}
                                {item.timeEstimate && (
                                    <div>
                                        <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Time</span>
                                        <div className="text-sm font-bold text-white">{item.timeEstimate}</div>
                                    </div>
                                )}
                            </div>

                            {item.participantCount && (
                                <p className="text-[10px] font-bold text-gray-500">
                                    {item.participantCount.toLocaleString()} participants
                                </p>
                            )}
                        </div>

                        <div className="space-y-3">
                            {completed ? (
                                <div className="w-full py-4 bg-green-500 text-white rounded-xl text-sm font-black text-center">
                                    ✅ Completed!
                                </div>
                            ) : farming ? (
                                <div className="w-full py-4 bg-gray-700 text-white rounded-xl text-sm font-black text-center animate-pulse">
                                    ⚡ Executing Step {currentStep + 1}/{item.steps?.length}...
                                </div>
                            ) : (
                                <button
                                    onClick={startFarming}
                                    className="w-full py-4 bg-gradient-to-r from-[#a3ff12] to-[#7dd30a] text-black rounded-xl text-sm font-black hover:brightness-105 transition-all active:scale-[0.98]"
                                >
                                    ⚡ Auto-Farm
                                </button>
                            )}
                            <p className="text-center text-[9px] font-bold text-gray-500 tracking-wide">
                                {item.estimatedGas === 'Free'
                                    ? 'No gas required (testnet)'
                                    : `Gas includes 15% platform fee`}
                            </p>
                        </div>
                    </div>

                    {/* Free Quota Indicator */}
                    <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Free Quota</span>
                            <span className="text-xs font-bold text-gray-600">
                                {item.type === 'quest' ? '3/20 used' : item.type === 'testnet' ? '1/5 used' : '$120/$500'}
                            </span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[#a3ff12] rounded-full transition-all"
                                style={{ width: item.type === 'quest' ? '15%' : item.type === 'testnet' ? '20%' : '24%' }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FarmDetail;
