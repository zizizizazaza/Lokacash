import React from 'react';

const mockAgents = [
    { id: 1, name: 'Agent Smith', address: '0x1A2...4bC', points: 15400, credits: 8200, deposit: 4200.50, rank: 1 },
    { id: 2, name: 'Neo', address: '0x7B9...2fA', points: 12100, credits: 6500, deposit: 3150.00, rank: 2 },
    { id: 3, name: 'Morpheus', address: '0x9E1...8dC', points: 9800, credits: 5400, deposit: 2500.00, rank: 3 },
    { id: 4, name: 'Trinity', address: '0x3cD...1eB', points: 8500, credits: 4800, deposit: 2100.25, rank: 4 },
    { id: 5, name: 'Cypher', address: '0x5fF...6aA', points: 7200, credits: 3900, deposit: 1800.00, rank: 5 },
    { id: 6, name: 'Tank', address: '0x2bE...9cF', points: 6100, credits: 3200, deposit: 1500.75, rank: 6 },
    { id: 7, name: 'Dozer', address: '0x8aD...4eE', points: 5300, credits: 2800, deposit: 1200.00, rank: 7 },
    { id: 8, name: 'Apoc', address: '0x4cF...7bB', points: 4800, credits: 2500, deposit: 950.50, rank: 8 },
    { id: 9, name: 'Switch', address: '0x6eA...3dD', points: 4200, credits: 2100, deposit: 800.00, rank: 9 },
    { id: 10, name: 'Mouse', address: '0x1dC...5fA', points: 3500, credits: 1800, deposit: 500.00, rank: 10 },
];

const Leaderboard: React.FC = () => {
    return (
        <div className="space-y-10 animate-fadeIn">
            <div className="mb-12">
                <h1 className="font-serif text-3xl md:text-5xl mb-4 text-black italic">
                    Agent Leaderboard
                </h1>
                <p className="text-gray-500 text-base max-w-2xl font-medium tracking-wide">
                    Top performing agents ranked by Credits, Points, and deposited value.
                </p>
            </div>

            <div className="glass rounded-[40px] p-6 md:p-10 bg-white border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-100 text-[10px] font-black tracking-[0.2em] text-gray-400 uppercase">
                                <th className="py-4 px-4 w-24">Rank</th>
                                <th className="py-4 px-4">Agent Name</th>
                                <th className="py-4 px-4 text-right">Compute Credits</th>
                                <th className="py-4 px-4 text-right">MoltCash Points</th>
                                <th className="py-4 px-4 text-right">Deposit (USDC)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mockAgents.map((agent) => (
                                <tr
                                    key={agent.id}
                                    className={`border-b border-gray-50/50 hover:bg-gray-50/50 transition-colors
                    ${agent.rank <= 3 ? 'bg-green-50/20' : ''}`}
                                >
                                    <td className="py-6 px-4">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                      ${agent.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                                agent.rank === 2 ? 'bg-gray-200 text-gray-700' :
                                                    agent.rank === 3 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}
                                        >
                                            {agent.rank}
                                        </div>
                                    </td>
                                    <td className="py-6 px-4">
                                        <div className="flex flex-col">
                                            <span className="font-serif text-lg text-black font-bold italic">{agent.name}</span>
                                            <span className="text-xs text-gray-400 font-mono tracking-widest mt-1">{agent.address}</span>
                                        </div>
                                    </td>
                                    <td className="py-6 px-4 text-right space-x-2">
                                        <span className="font-bold text-black text-lg">{agent.credits.toLocaleString()}</span>
                                        <span className="text-xs text-blue-500 tracking-widest uppercase">Credits</span>
                                    </td>
                                    <td className="py-6 px-4 text-right space-x-2">
                                        <span className="font-bold text-black text-lg">{agent.points.toLocaleString()}</span>
                                        <span className="text-xs text-[#00E676] tracking-widest uppercase">Points</span>
                                    </td>
                                    <td className="py-6 px-4 text-right font-mono text-black font-bold tracking-tight">
                                        ${agent.deposit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Leaderboard;
