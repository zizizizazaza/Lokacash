import React, { useState, useMemo } from 'react';
import { FarmItem, TaskItem } from '../types';

// ── Mock Farm Data ──────────────────────────────────────────

export const FARM_DATA: FarmItem[] = [
    // Quests
    {
        id: 'f1', type: 'quest', title: 'zkSync Fintech Explorer',
        description: 'Complete a full Fintech loop on zkSync Era: swap, provide liquidity, and bridge assets.',
        source: 'Galxe', chain: 'zkSync Era', reward: '500 XP + OAT', rewardType: 'fixed',
        estimatedGas: '$0.12', difficulty: 'Easy', timeEstimate: '~5min',
        tags: ['Fintech', 'zkSync'], isHot: true, participantCount: 2840, deadline: '2026-03-20',
        steps: [
            { action: 'Swap $10 USDC → ETH', protocol: 'SyncSwap', gas: '$0.03' },
            { action: 'Add LP (ETH/USDC)', protocol: 'Mute.io', gas: '$0.04' },
            { action: 'Bridge $5 to Ethereum', protocol: 'zkSync Bridge', gas: '$0.05' },
        ]
    },
    {
        id: 'f2', type: 'quest', title: 'Base Social Verification',
        description: 'Verify your social accounts and complete verified interactions on platform.',
        source: 'Layer3', chain: 'Base', reward: '1000 Points', rewardType: 'fixed',
        estimatedGas: '$0.08', difficulty: 'Easy', timeEstimate: '~3min',
        tags: ['Social', 'Base'], participantCount: 5120,
        steps: [
            { action: 'Mint Profile NFT', protocol: 'Base Names', gas: '$0.02' },
            { action: 'Swap on Aerodrome', protocol: 'Aerodrome', gas: '$0.03' },
            { action: 'Bridge via Official Bridge', protocol: 'Base Bridge', gas: '$0.03' },
        ]
    },
    {
        id: 'f3', type: 'quest', title: 'Scroll Origins NFT',
        description: 'Interact with Scroll mainnet protocols and claim your Origins NFT.',
        source: 'Galxe', chain: 'Scroll', reward: '300 XP + NFT', rewardType: 'fixed',
        estimatedGas: '$0.15', difficulty: 'Easy', timeEstimate: '~8min',
        tags: ['NFT', 'Scroll'], isNew: true, participantCount: 1560,
        steps: [
            { action: 'Bridge ETH to Scroll', protocol: 'Scroll Bridge', gas: '$0.05' },
            { action: 'Swap on SpaceFi', protocol: 'SpaceFi', gas: '$0.04' },
            { action: 'Provide LP', protocol: 'Ambient', gas: '$0.06' },
        ]
    },
    {
        id: 'f4', type: 'quest', title: 'Arbitrum Odyssey Week 3',
        description: 'Complete weekly quests on Arbitrum: GMX trading, Radiant lending, Camelot DEX.',
        source: 'Galxe', chain: 'Arbitrum', reward: '800 XP + OAT', rewardType: 'fixed',
        estimatedGas: '$0.20', difficulty: 'Medium', timeEstimate: '~15min',
        tags: ['Fintech', 'Arbitrum'], isHot: true, participantCount: 8900, deadline: '2026-03-18',
        steps: [
            { action: 'Open GMX position', protocol: 'GMX', gas: '$0.06' },
            { action: 'Lend USDC on Radiant', protocol: 'Radiant', gas: '$0.05' },
            { action: 'Swap on Camelot', protocol: 'Camelot', gas: '$0.04' },
            { action: 'Provide LP on Camelot', protocol: 'Camelot', gas: '$0.05' },
        ]
    },
    {
        id: 'f5', type: 'quest', title: 'Linea Fintech Voyage',
        description: 'Explore Linea ecosystem: swap, lend, and bridge across protocols.',
        source: 'Layer3', chain: 'Linea', reward: '600 LXP', rewardType: 'fixed',
        estimatedGas: '$0.10', difficulty: 'Easy', timeEstimate: '~6min',
        tags: ['Fintech', 'Linea'], participantCount: 3200,
        steps: [
            { action: 'Bridge to Linea', protocol: 'Linea Bridge', gas: '$0.04' },
            { action: 'Swap on SyncSwap', protocol: 'SyncSwap', gas: '$0.03' },
            { action: 'Lend on LineaBank', protocol: 'LineaBank', gas: '$0.03' },
        ]
    },
    // Testnet
    {
        id: 'f6', type: 'testnet', title: 'Monad Testnet',
        description: 'Interact with Monad testnet daily: faucet, swap, bridge, mint. Building tx history for potential airdrop.',
        source: 'Monad', chain: 'Monad Testnet', reward: '🎰 Potential Airdrop', rewardType: 'potential',
        estimatedGas: 'Free', timeEstimate: '~2min/day',
        tags: ['Testnet', 'L1'], isHot: true, participantCount: 45000,
        steps: [
            { action: 'Claim platform credits', protocol: 'Faucet', gas: 'Free' },
            { action: 'Swap platform credits', protocol: 'Currency Exchange', gas: 'Free' },
            { action: 'Mint test NFT', protocol: 'Monad NFT', gas: 'Free' },
        ]
    },
    {
        id: 'f7', type: 'testnet', title: 'MegaETH Testnet',
        description: 'Early testnet of ultra-high-throughput L2. Build interaction history before mainnet.',
        source: 'MegaETH', chain: 'MegaETH Testnet', reward: '🎰 Potential Airdrop', rewardType: 'potential',
        estimatedGas: 'Free', timeEstimate: '~3min/day',
        tags: ['Testnet', 'L2'], isNew: true, participantCount: 12000,
        steps: [
            { action: 'Claim faucet', protocol: 'Faucet', gas: 'Free' },
            { action: 'Deploy test contract', protocol: 'MegaETH', gas: 'Free' },
            { action: 'Swap on testnet DEX', protocol: 'MegaDEX', gas: 'Free' },
        ]
    },
    {
        id: 'f8', type: 'testnet', title: 'Berachain bArtio',
        description: 'Participate in Berachain proof-of-liquidity testnet. Swap, provide BGT, stake.',
        source: 'Berachain', chain: 'Berachain Testnet', reward: '🎰 BERA Airdrop', rewardType: 'potential',
        estimatedGas: 'Free', timeEstimate: '~5min/day',
        tags: ['Testnet', 'PoL'], participantCount: 28000,
        steps: [
            { action: 'Claim BERA faucet', protocol: 'Faucet', gas: 'Free' },
            { action: 'Swap on BEX', protocol: 'BEX', gas: 'Free' },
            { action: 'Provide liquidity', protocol: 'BEX', gas: 'Free' },
            { action: 'Delegate BGT', protocol: 'BGT Station', gas: 'Free' },
        ]
    },
    // Yield
    {
        id: 'f9', type: 'yield', title: 'Aave USDC Lending',
        description: 'Lend USDC on Aave v3 (Arbitrum). Auto-compound interest weekly.',
        source: 'Aave', chain: 'Arbitrum', reward: '8.2% APY', rewardType: 'apy',
        estimatedGas: '$0.15', tags: ['Lending', 'USDC', 'Stable'],
        steps: [
            { action: 'Approve USDC', protocol: 'Aave v3', gas: '$0.02' },
            { action: 'Supply USDC', protocol: 'Aave v3', gas: '$0.08' },
            { action: 'Enable as collateral', protocol: 'Aave v3', gas: '$0.05' },
        ]
    },
    {
        id: 'f10', type: 'yield', title: 'Pendle PT-stETH',
        description: 'Fixed yield strategy: buy PT-stETH on Pendle for guaranteed 6.5% APY until maturity.',
        source: 'Pendle', chain: 'Ethereum', reward: '6.5% APY (Fixed)', rewardType: 'apy',
        estimatedGas: '$2.50', tags: ['Fixed Yield', 'stETH'],
        steps: [
            { action: 'Swap ETH → stETH', protocol: 'Lido', gas: '$1.00' },
            { action: 'Buy PT-stETH', protocol: 'Pendle', gas: '$1.50' },
        ]
    },
    {
        id: 'f11', type: 'yield', title: 'Morpho USDC Vault',
        description: 'Optimized lending via Morpho vaults on Base. Higher yield than Aave direct.',
        source: 'Morpho', chain: 'Base', reward: '11.4% APY', rewardType: 'apy',
        estimatedGas: '$0.08', tags: ['Vault', 'USDC', 'High APY'], isHot: true,
        steps: [
            { action: 'Approve USDC', protocol: 'Morpho', gas: '$0.02' },
            { action: 'Deposit to vault', protocol: 'Morpho Vault', gas: '$0.06' },
        ]
    },
];

// ── Mock Task Data ──────────────────────────────────────────

export const TASK_DATA: TaskItem[] = [
    {
        id: 't1', title: 'Financial Security Audit',
        description: 'Audit a financial data API for vulnerabilities. Provide detailed report with fix recommendations.',
        platform: 'MOLTCASH', category: 'platform', reward: '$500 USDC', difficulty: 'Hard', timeEstimate: '3d',
        tags: ['Solidity', 'Security'], status: 'open', rating: 4.9, executionCount: 5, applicants: 3,
    },
    {
        id: 't2', title: 'Build Discord Alert Bot',
        description: 'Create a bot that monitors large institutional movements and sends Discord alerts. Node.js preferred.',
        platform: 'MOLTCASH', category: 'platform', reward: '$200 USDC', difficulty: 'Medium', timeEstimate: '2d',
        tags: ['Node.js', 'Discord', 'API'], status: 'open', rating: 4.7, executionCount: 9, applicants: 7,
    },
    {
        id: 't3', title: 'Translate Whitepaper EN→CN',
        description: 'Translate a 20-page Fintech protocol whitepaper. Must preserve technical accuracy and readability.',
        platform: 'MOLTCASH', category: 'platform', reward: '$80 USDC', difficulty: 'Easy', timeEstimate: '1d',
        tags: ['Translation', 'Fintech'], status: 'open', rating: 4.4, executionCount: 16, applicants: 12,
    },
    {
        id: 't4', title: 'Data Labeling for ML Model',
        description: 'Label 5,000 images for object detection. Categories: vehicles, pedestrians, traffic signs.',
        platform: 'MOLTCASH', category: 'platform', reward: '$120 USDC', difficulty: 'Easy', timeEstimate: '2d',
        tags: ['Data', 'ML', 'Labeling'], status: 'open', rating: 4.3, executionCount: 45, applicants: 20,
    },
    {
        id: 't5', title: 'Write Technical Blog Series',
        description: 'Create a 5-part series on ZK-rollup technology. Include diagrams and code examples.',
        platform: 'MOLTCASH', category: 'platform', reward: '$300 USDC', difficulty: 'Medium', timeEstimate: '5d',
        tags: ['Writing', 'ZK', 'Education'], status: 'open', rating: 4.6, executionCount: 3, applicants: 5,
    },
    {
        id: 't6', title: 'Frontend Bug Fix Sprint',
        description: 'Fix 10 reported UI bugs in a React DApp. Test coverage expected for each fix.',
        platform: 'MOLTCASH', category: 'platform', reward: '$150 USDC', difficulty: 'Medium', timeEstimate: '1d',
        tags: ['React', 'Bug Fix', 'Testing'], status: 'open', rating: 4.8, executionCount: 11, applicants: 8,
    },
    {
        id: 't7', title: 'Logo & Brand Kit Design',
        description: 'Design a modern logo, icon set, and basic brand guide for a new L2 protocol.',
        platform: 'MOLTCASH', category: 'platform', reward: '$250 USDC', difficulty: 'Medium', timeEstimate: '3d',
        tags: ['Design', 'Branding'], status: 'open', rating: 4.5, executionCount: 22, applicants: 15,
    },
    {
        id: 't8', title: 'API Integration Testing',
        description: 'Write comprehensive integration tests for a REST API. Postman collection + automated tests.',
        platform: 'MOLTCASH', category: 'platform', reward: '$100 USDC', difficulty: 'Easy', timeEstimate: '1d',
        tags: ['QA', 'API', 'Testing'], status: 'open', rating: 4.6, executionCount: 8, applicants: 4,
    },
];

// ── Component ──────────────────────────────────────────────

type ActiveTab = 'farm' | 'tasks';

interface OpportunitiesProps {
    onSelectFarm?: (id: string) => void;
    onSelectTask?: (id: string) => void;
    onPublishTask?: () => void;
    extraTasks?: TaskItem[];
}

const Opportunities: React.FC<OpportunitiesProps> = ({ onSelectFarm, onSelectTask, onPublishTask, extraTasks = [] }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('farm');
    const [search, setSearch] = useState('');
    const allTasks = [...TASK_DATA, ...extraTasks];
    const hotFarms = FARM_DATA.filter(f => f.isHot || f.isNew);

    return (
        <div className="container mx-auto px-6 py-10 animate-fadeIn max-w-[1400px]">
            {/* Header */}
            <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
                <div>
                    <h1 className="text-4xl font-black text-black tracking-tight mb-2">Earn</h1>
                    <p className="text-gray-500 font-medium tracking-wide">Let your Claw Agent earn for you. Auto-farm or pick tasks.</p>
                </div>
                <div className="flex items-center gap-3">
                    {activeTab === 'tasks' && onPublishTask && (
                        <button
                            onClick={onPublishTask}
                            className="px-5 py-3 bg-black text-white rounded-xl text-xs font-black hover:bg-gray-800 transition-all shadow-sm active:scale-95 flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                            Publish Task
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-8 bg-gray-50/80 p-1.5 rounded-2xl w-fit border border-gray-100/50">
                <button
                    onClick={() => setActiveTab('farm')}
                    className={`flex items-center gap-2.5 px-6 py-3 rounded-xl transition-all font-bold text-sm tracking-tight ${activeTab === 'farm' ? 'bg-white text-black shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]' : 'text-gray-400 hover:text-black hover:bg-gray-100/50'}`}
                >
                    <span>Auto-Farm</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black tracking-widest ${activeTab === 'farm' ? 'bg-black text-[#a3ff12]' : 'bg-transparent text-gray-400'}`}>{FARM_DATA.length}</span>
                </button>
                <button
                    onClick={() => setActiveTab('tasks')}
                    className={`flex items-center gap-2.5 px-6 py-3 rounded-xl transition-all font-bold text-sm tracking-tight ${activeTab === 'tasks' ? 'bg-white text-black shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]' : 'text-gray-400 hover:text-black hover:bg-gray-100/50'}`}
                >
                    <span>Tasks</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black tracking-widest ${activeTab === 'tasks' ? 'bg-black text-[#a3ff12]' : 'bg-transparent text-gray-400'}`}>{allTasks.length}</span>
                </button>
            </div>

            {/* Content */}
            {activeTab === 'farm' ? (
                <FarmGrid items={FARM_DATA} onSelect={onSelectFarm} search={search} />
            ) : (
                <TaskGrid items={allTasks} onSelect={onSelectTask} search={search} />
            )}
        </div>
    );
};

const QuotaBadge: React.FC<{ label: string; used: number | string; total: number | string }> = ({ label, used, total }) => (
    <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold text-gray-400">{label}</span>
        <span className="text-[10px] font-black text-white">{used}/{total}</span>
    </div>
);

// ── Farm Grid ──────────────────────────────────────────────

const FarmGrid: React.FC<{ items: FarmItem[]; onSelect?: (id: string) => void; search?: string }> = ({ items, onSelect, search = '' }) => {
    const [filter, setFilter] = useState<'all' | 'quest' | 'testnet' | 'yield'>('all');
    const filtered = useMemo(() => {
        let result = filter === 'all' ? items : items.filter(i => i.type === filter);
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(i => i.title.toLowerCase().includes(q) || i.tags.some(t => t.toLowerCase().includes(q)) || i.source.toLowerCase().includes(q) || i.chain.toLowerCase().includes(q));
        }
        return result;
    }, [items, filter, search]);

    return (
        <>
            <div className="flex flex-wrap gap-2 mb-6">
                {(['all', 'quest', 'testnet', 'yield'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filter === f ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-400 hover:text-black hover:bg-gray-100'}`}
                    >
                        {f === 'all' ? 'All' : f === 'quest' ? 'Quests' : f === 'testnet' ? 'Testnet' : 'Yield'}
                        <span className="ml-1.5 text-[10px] opacity-60">
                            {f === 'all' ? items.length : items.filter(i => i.type === f).length}
                        </span>
                    </button>
                ))}
            </div>
            {filtered.length === 0 ? (
                <div className="text-center py-20">
                    <p className="text-gray-300 text-sm font-bold">No opportunities found</p>
                    <p className="text-gray-300 text-xs mt-1">Try a different search or filter</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtered.map(item => (
                        <FarmCard key={item.id} item={item} onClick={() => onSelect?.(item.id)} />
                    ))}
                </div>
            )}
        </>
    );
};

const FarmCard: React.FC<{ item: FarmItem; onClick: () => void }> = ({ item, onClick }) => {
    const typeStyles = {
        quest: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Quest' },
        testnet: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Testnet' },
        yield: { bg: 'bg-green-50', text: 'text-green-600', label: 'Yield' },
    };
    const style = typeStyles[item.type];

    return (
        <div
            onClick={onClick}
            className="bg-white rounded-[24px] p-7 border border-gray-200/60 hover:border-gray-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-300 group flex flex-col h-full cursor-pointer active:scale-[0.98]"
        >
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-widest ${style.bg} ${style.text}`}>
                        {style.label.toUpperCase()}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-[9px] font-bold text-gray-500">
                        {item.chain}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    {item.isHot && <span className="text-[9px] font-black text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">HOT</span>}
                    {item.isNew && <span className="text-[9px] font-black text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded">NEW</span>}
                </div>
            </div>

            {/* Source */}
            <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 bg-black rounded-md flex items-center justify-center text-[8px] font-black text-white">
                    {item.source[0]}
                </div>
                <span className="text-[10px] font-bold text-gray-400">{item.source}</span>
            </div>

            {/* Title & Description */}
            <h3 className="text-[19px] font-black text-black leading-tight mb-2 tracking-tight group-hover:text-blue-600 transition-colors">{item.title}</h3>
            <p className="text-gray-500 text-[13px] font-medium mb-6 leading-relaxed line-clamp-2">{item.description}</p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 mb-5">
                {item.tags.map(tag => (
                    <span key={tag} className="text-[8px] font-black text-gray-300 border border-gray-100 px-1.5 py-0.5 rounded uppercase tracking-widest">
                        #{tag}
                    </span>
                ))}
            </div>

            {/* Reward & Gas */}
            <div className="mt-auto space-y-4">
                <div className="flex items-end justify-between border-t border-gray-50 pt-4">
                    <div>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Reward</p>
                        <p className={`text-xl font-black tracking-tighter ${item.rewardType === 'potential' ? 'text-amber-500' : item.rewardType === 'apy' ? 'text-green-500' : 'text-blue-500'}`}>
                            {item.reward}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Est. Gas</p>
                        <p className={`text-sm font-black ${item.estimatedGas === 'Free' ? 'text-green-500' : 'text-gray-600'}`}>
                            {item.estimatedGas}
                        </p>
                    </div>
                </div>

                {/* Meta */}
                {(item.participantCount || item.deadline) && (
                    <div className="flex items-center gap-3 text-[9px] font-bold text-gray-400">
                        {item.participantCount && <span>{item.participantCount.toLocaleString()} joined</span>}
                        {item.deadline && (
                            <>
                                <span className="text-gray-200">|</span>
                                <span>Ends {new Date(item.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            </>
                        )}
                    </div>
                )}

                <button className="w-full py-3 bg-gradient-to-r from-[#a3ff12] to-[#7dd30a] text-black rounded-xl text-xs font-black hover:brightness-105 transition-all shadow-sm active:scale-95">
                    Auto-Farm
                </button>
            </div>
        </div>
    );
};

// ── Task Grid ──────────────────────────────────────────────

const TaskGrid: React.FC<{ items: TaskItem[]; onSelect?: (id: string) => void; search?: string }> = ({ items, onSelect, search = '' }) => {
    const filtered = useMemo(() => {
        if (!search) return items;
        const q = search.toLowerCase();
        return items.filter(t => t.title.toLowerCase().includes(q) || t.tags.some(tag => tag.toLowerCase().includes(q)));
    }, [items, search]);

    return filtered.length === 0 ? (
        <div className="text-center py-20">
            <p className="text-gray-300 text-sm font-bold">No tasks found</p>
            <p className="text-gray-300 text-xs mt-1">Try a different search term</p>
        </div>
    ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(task => (
                <TaskCard key={task.id} task={task} onClick={() => onSelect?.(task.id)} />
            ))}
        </div>
    );
};

const TaskCard: React.FC<{ task: TaskItem; onClick: () => void }> = ({ task, onClick }) => (
    <div
        onClick={onClick}
        className="bg-white rounded-[24px] p-7 border border-gray-200/60 hover:border-gray-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-300 group flex flex-col h-full cursor-pointer active:scale-[0.98]"
    >
        <div className="flex justify-between items-start mb-4">
            <span className="px-2 py-0.5 rounded bg-purple-900 text-white text-[9px] font-black tracking-widest">
                COMMUNITY
            </span>
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                {task.difficulty} | {task.timeEstimate}
            </span>
        </div>

        <h3 className="text-[19px] font-black text-black leading-tight mb-2 tracking-tight group-hover:text-purple-600 transition-colors">{task.title}</h3>
        <p className="text-gray-500 text-[13px] font-medium mb-6 leading-relaxed line-clamp-2">{task.description}</p>

        <div className="flex flex-wrap gap-1.5 mb-5">
            {task.tags.map(tag => (
                <span key={tag} className="text-[8px] font-black text-gray-300 border border-gray-100 px-1.5 py-0.5 rounded uppercase tracking-widest">
                    #{tag}
                </span>
            ))}
        </div>

        <div className="mt-auto space-y-4">
            <div className="flex items-end justify-between border-t border-gray-50 pt-4">
                <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Bounty</p>
                    <p className="text-xl font-black text-green-500 tracking-tighter">{task.reward}</p>
                </div>
                {task.applicants !== undefined && (
                    <div className="text-right">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Applicants</p>
                        <p className="text-sm font-black text-gray-600">{task.applicants}</p>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 text-[9px] font-bold text-gray-400">
                {task.rating && <span className="text-black">★ {task.rating}</span>}
                {task.executionCount && <span>({task.executionCount} completed)</span>}
            </div>

            <button className="w-full py-3 bg-black text-white rounded-xl text-xs font-black hover:bg-gray-800 transition-all shadow-sm active:scale-95">
                Apply
            </button>
        </div>
    </div>
);

export default Opportunities;
