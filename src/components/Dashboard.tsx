
import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Icons, COLORS } from '../constants';
import { TreasuryStats } from '../types';
import { api } from '../services/api';

const REVENUE_DATA = [
  { name: 'Jan', revenue: 42000, baseline: 1200 },
  { name: 'Feb', revenue: 58000, baseline: 1250 },
  { name: 'Mar', revenue: 75000, baseline: 1300 },
  { name: 'Apr', revenue: 92000, baseline: 1350 },
  { name: 'May', revenue: 110000, baseline: 1400 },
  { name: 'Jun', revenue: 145000, baseline: 1450 },
];

const defaultStats: TreasuryStats = {
  tvl: 128450000,
  collateralRatio: 104.2,
  treasuryRevenue: 2450000,
  lastPoR: new Date().toLocaleTimeString(),
  reserveAllocation: {
    tBills: 90,
    liquidity: 10,
    operations: 0 // Simplified for dumbbell strategy
  }
};

const COLORS_PIE = ['#000000', '#00E676']; // Black for T-Bills, Green for AI Yield



const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<TreasuryStats>(defaultStats);

  useEffect(() => {
    api.getTreasuryStats().then((data: any) => {
      if (data) {
        setStats({
          tvl: data.tvl,
          collateralRatio: data.collateralRatio,
          treasuryRevenue: data.treasuryRevenue,
          lastPoR: data.lastPoR ? new Date(data.lastPoR).toLocaleTimeString() : new Date().toLocaleTimeString(),
          reserveAllocation: data.reserveAllocation || defaultStats.reserveAllocation,
        });
      }
    }).catch(() => {});
  }, []);

  const pieData = [
    { name: 'Anchor: US Treasury Bills', value: 90 },
    { name: 'Boost: AI Receivables', value: 10 },
  ];

  return (
    <div className="space-y-10 animate-fadeIn min-h-screen px-4 sm:px-6 lg:px-8">


      {/* 2. Command Center Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Value Locked" value={`$${(stats.tvl / 1000000).toFixed(1)}M`} trend="+12.5% MoM" />
        <StatCard title="Collateral Ratio" value={`${stats.collateralRatio}%`} trend="Safe Margin" isVerified />
        <StatCard title="Protocol Revenue" value={`$${(stats.treasuryRevenue / 1000000).toFixed(2)}M`} trend="Realized Cash" />
        <div className="glass rounded-3xl p-6 sm:p-8 bg-white border border-gray-100 relative overflow-hidden group">
          <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-gray-50 rounded-full group-hover:scale-150 transition-transform duration-700 opacity-50" />
          <p className="text-[10px] font-bold tracking-[0.1em] text-gray-400 mb-6  relative z-10">Active Agents</p>
          <h3 className="font-serif text-4xl text-black mb-2 italic relative z-10">12,482</h3>
          <div className="flex items-center gap-2 relative z-10">
            <div className="w-1 h-1 rounded-full bg-[#00E676]" />
            <p className="text-[9px] font-medium text-[#00E676]  tracking-widest">Global Grid Active</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* 3. Revenue Heartbeat (Chart) */}
        <div className="lg:col-span-2 glass rounded-3xl sm:rounded-[40px] p-5 sm:p-10 bg-white border border-gray-100 shadow-sm relative group overflow-hidden">
          <div className="absolute top-0 right-0 p-8">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-black" />
                <span className="text-[9px] font-bold text-gray-400  tracking-widest">Loka Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-200" />
                <span className="text-[9px] font-bold text-gray-400  tracking-widest">Bank Baseline</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col mb-10">
            <h3 className="text-xs font-black  tracking-[0.2em] text-[#004D40] mb-2 italic">Cumulative Revenue</h3>
            <p className="text-3xl font-serif text-black italic">Network Productivity</p>
          </div>
          <div className="h-[250px] sm:h-[350px] lg:h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={REVENUE_DATA} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00E676" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="1 6" stroke="#00000010" vertical={false} />
                <XAxis dataKey="name" stroke="#999" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#999" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val / 1000}k`} />
                <Tooltip
                  cursor={{ stroke: '#00E676', strokeWidth: 1, strokeDasharray: '4 4' }}
                  contentStyle={{ backgroundColor: '#000', border: 'none', borderRadius: '16px', fontSize: '12px', color: '#fff' }}
                  itemStyle={{ color: '#00E676', fontWeight: 900 }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#00E676" fillOpacity={1} fill="url(#colorRev)" strokeWidth={3} animationDuration={2000} />
                <Area type="monotone" dataKey="baseline" stroke="#ccc" fill="transparent" strokeWidth={1} strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4. Dumbbell Reserve Allocation */}
        <div className="glass rounded-[40px] p-6 sm:p-10 bg-white border border-gray-100 shadow-sm">
          <h3 className="text-xs font-black  tracking-[0.2em] text-[#004D40] mb-10 italic">Reserve Architecture</h3>
          <div className="h-[200px] sm:h-[280px] relative mb-12">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={12}
                  dataKey="value"
                  stroke="none"
                  animationBegin={500}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS_PIE[index]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-4xl font-serif italic font-bold text-black italic">90:10</span>
              <span className="text-[9px] text-[#00E676] font-black  tracking-[0.3em] mt-2">Dumbbell Ratio</span>
            </div>
          </div>
          <div className="space-y-6">
            {pieData.map((item, idx) => (
              <div key={item.name} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 transition-all hover:border-black/10 group">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS_PIE[idx] }} />
                    <span className="text-[11px] font-black text-black  tracking-widest">{item.name.split(':')[0]}</span>
                  </div>
                  <span className="text-sm font-serif italic font-bold text-black">{item.value}%</span>
                </div>
                <p className="text-[10px] text-gray-400 font-bold  tracking-tight ml-5">{item.name.split(':')[1]}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. Trust Infrastructure (Oracle & Audit) */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <TrustTag label="Oracle" provider="Chainlink" status="Active" time="2s ago" />
        <TrustTag label="Custody" provider="Ondo/Maker" status="Audited" time="Daily" />
        <TrustTag label="Cash Flow" provider="Stripe API" status="Connected" time="Real-time" />
        <div className="glass rounded-[32px] p-6 bg-black text-white flex items-center justify-between col-span-1 shadow-xl border border-white/5">
          <div>
            <p className="text-[8px] font-black  tracking-[0.3em] text-gray-500 mb-1">Security Audit</p>
            <p className="text-[11px] font-bold">Smart Contracts</p>
          </div>
          <div className="bg-[#00E676] text-black text-[9px] font-black px-3 py-1 rounded-full tracking-widest">Passed</div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string; trend: string; isVerified?: boolean }> = ({ title, value, trend, isVerified }) => (
  <div className="glass rounded-3xl p-6 sm:p-8 bg-white border border-gray-100 hover:border-black/10 transition-all duration-500 group">
    <p className="text-[10px] font-bold tracking-[0.2em] text-gray-400 mb-6 ">{title}</p>
    <h3 className="font-serif text-4xl text-black mb-2 italic tracking-tighter group-hover:px-2 transition-all">{value}</h3>
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full ${isVerified ? 'bg-blue-600' : 'bg-[#00E676]'}`} />
      <p className={`text-[9px] font-black  tracking-widest ${isVerified ? 'text-blue-600' : 'text-[#00E676]'}`}>
        {isVerified && 'Verified • '}{trend}
      </p>
    </div>
  </div>
);

const TrustTag: React.FC<{ label: string; provider: string; status: string; time: string }> = ({ label, provider, status, time }) => (
  <div className="glass rounded-[32px] p-6 bg-white border border-gray-100 flex items-center justify-between hover:shadow-md transition-all shadow-sm">
    <div className="space-y-1">
      <p className="text-[8px] font-black  tracking-[0.3em] text-gray-400">{label}</p>
      <p className="text-[11px] font-bold text-black">{provider}</p>
    </div>
    <div className="text-right">
      <div className="flex items-center gap-1.5 justify-end">
        <div className="w-1 h-1 rounded-full bg-[#00E676]" />
        <p className="text-[9px] font-black text-[#00E676]  tracking-widest">{status}</p>
      </div>
      <p className="text-[8px] text-gray-300 font-bold  tracking-tighter">{time}</p>
    </div>
  </div>
);

export default Dashboard;
