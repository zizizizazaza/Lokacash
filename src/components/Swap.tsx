
import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { api } from '../services/api';

// Mock data for Total Return (Up-only curve)
const chartData = [
  { day: '0', total: 10000 },
  { day: '10', total: 10014 },
  { day: '20', total: 10032 },
  { day: '30', total: 10051 },
  { day: '40', total: 10072 },
  { day: '50', total: 10098 },
  { day: '60', total: 10125 },
  { day: '70', total: 10158 },
  { day: '80', total: 10192 },
  { day: '90', total: 10231 },
];

const compositionData = [
  { name: 'US Treasury Bills', value: 80, color: '#3b82f6' }, // Blue
  { name: 'High-Yield Receivables', value: 20, color: '#a855f7' }, // Purple
];

const Swap: React.FC = () => {
  const [mode, setMode] = useState<'DEPOSIT' | 'REDEEM'>('DEPOSIT');
  const [amount, setAmount] = useState<string>('');
  const [countdown, setCountdown] = useState(1);
  const [isWalletConnected, setIsWalletConnected] = useState(false);

  // Simulated countdown for payout
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [swapLoading, setSwapLoading] = useState(false);
  const [swapMessage, setSwapMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSwap = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    setSwapLoading(true);
    setSwapMessage(null);
    try {
      if (mode === 'DEPOSIT') {
        await api.mintAIUSD(val);
        setSwapMessage({ type: 'success', text: `Minted ${val.toLocaleString()} AIUSD` });
      } else {
        await api.redeemAIUSD(val);
        setSwapMessage({ type: 'success', text: `Redeemed ${val.toLocaleString()} AIUSD` });
      }
      setAmount('');
    } catch (err: any) {
      setSwapMessage({ type: 'error', text: err.message || 'Transaction failed' });
    } finally {
      setSwapLoading(false);
    }
  };

  const projectedEarnings = useMemo(() => {
    const val = parseFloat(amount);
    if (isNaN(val)) return '0.00';
    return (val * 0.0524).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [amount]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 animate-fadeIn pb-24 px-4 sm:px-6 lg:px-0">

      {/* LEFT PANEL: Trust & Data (60-65%) */}
      <div className="lg:col-span-7 space-y-12">

        {/* 1. Header Information */}
        <section className="mb-12">
          <h2 className="font-serif text-3xl sm:text-5xl text-black italic">Mint & Redeem.</h2>
          <p className="text-gray-500 mt-2 font-medium">
            Convert stable liquidity into treasury-backed AIUSD seamlessly.
          </p>

          <div className="flex flex-col md:flex-row md:items-end gap-6 pt-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400  tracking-widest mb-1">Current APY</p>
              <h3 className="font-serif text-5xl sm:text-7xl text-green-500 italic leading-none">5.24%</h3>
            </div>
            <div className="flex gap-4 pb-1">
              <div className="px-4 py-2 bg-gray-50 border border-gray-100 rounded-2xl">
                <p className="text-[9px] font-bold text-gray-400  tracking-tighter">30-Day Avg</p>
                <p className="text-sm font-bold text-black">5.12%</p>
              </div>
              <div className="px-4 py-2 bg-gray-50 border border-gray-100 rounded-2xl">
                <p className="text-[9px] font-bold text-gray-400  tracking-tighter">TVL</p>
                <p className="text-sm font-bold text-black">$12.4M</p>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Total Return Chart */}
        <section className="glass rounded-3xl sm:rounded-[40px] p-4 sm:p-8 bg-white overflow-hidden relative">
          <div className="flex justify-between items-center mb-8">
            <h4 className="text-xs font-bold text-gray-400  tracking-widest">Total Return</h4>
            <div className="flex gap-2">
              {['1D', '1W', '1M', 'ALL'].map(t => (
                <button key={t} className={`px-3 py-1 text-[10px] font-bold rounded-full transition-colors ${t === 'ALL' ? 'bg-black text-white' : 'text-gray-400 hover:text-black'}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="h-[200px] sm:h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-black text-white p-3 rounded-2xl border border-white/10 text-xs shadow-xl">
                          <p className="opacity-50 text-[9px]  mb-1">Total Balance</p>
                          <p className="font-bold">${payload[0].value?.toLocaleString()}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#colorTotal)"
                  strokeWidth={3}
                  animationDuration={2000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-4 text-[10px] text-gray-400 text-center italic">Projected growth based on a $10,000 initial position</p>
        </section>

        {/* 3. Portfolio Composition */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <h4 className="text-xs font-bold text-gray-400  tracking-widest">Underlying Assets</h4>
            <div className="space-y-4">
              {compositionData.map(item => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm font-medium text-gray-600">{item.name}</span>
                  </div>
                  <span className="text-sm font-bold text-black">{item.value}%</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 leading-relaxed pt-2 border-t border-gray-100">
              Your funds are secured by a blend of US Treasuries held at <span className="text-black font-semibold">BNY Mellon</span> and high-yield audited receivables.
            </p>
          </div>
          <div className="h-[180px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={compositionData}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {compositionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-bold">100%</span>
              <span className="text-[9px] text-gray-400  font-bold tracking-tighter">Backed</span>
            </div>
          </div>
        </section>

        {/* 4. Stats Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SmallStat label="Payout frequency" value="Real-time / Per second" />
          <SmallStat label="Next payout" value={`00:00:0${countdown}`} />
          <SmallStat label="Instant access" value="T+0 window" />
          <SmallStat label="Main auditor" value="TechAudit" hasLogo />
        </section>

      </div>

      {/* RIGHT PANEL: Trading Module (35-40%) */}
      <div className="lg:col-span-5">
        <div className="sticky top-20 md:top-32 glass rounded-[40px] p-5 sm:p-8 bg-white border border-gray-100 shadow-2xl space-y-8">

          {/* Tabs */}
          <div className="flex bg-gray-50 p-1 rounded-full border border-gray-100">
            <button
              onClick={() => setMode('DEPOSIT')}
              className={`flex-1 py-3 rounded-full text-[11px] font-bold tracking-widest  transition-all ${mode === 'DEPOSIT' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-black'}`}
            >
              Deposit / Buy
            </button>
            <button
              onClick={() => setMode('REDEEM')}
              className={`flex-1 py-3 rounded-full text-[11px] font-bold tracking-widest  transition-all ${mode === 'REDEEM' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-black'}`}
            >
              Redeem / Sell
            </button>
          </div>

          {/* Inputs */}
          <div className="space-y-4">
            <div className="p-4 sm:p-6 bg-gray-50 rounded-3xl border border-gray-100">
              <div className="flex justify-between mb-3">
                <span className="text-[10px] font-bold text-gray-400  tracking-widest">Pay</span>
                <span className="text-[10px] font-bold text-gray-500 cursor-pointer hover:underline">Max balance</span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.0"
                  className="bg-transparent text-2xl sm:text-3xl font-serif italic text-black w-full outline-none placeholder:text-gray-200"
                />
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl border border-gray-200 shadow-sm shrink-0">
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-[10px] text-white font-bold">$</div>
                  <span className="text-xs font-bold ">{mode === 'DEPOSIT' ? 'USDC' : 'AIUSD'}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-center -my-3 relative z-10">
              <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white border-4 border-white shadow-lg">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              </div>
            </div>

            <div className="p-4 sm:p-6 bg-gray-50/50 rounded-3xl border border-gray-100">
              <div className="flex justify-between mb-3">
                <span className="text-[10px] font-bold text-gray-400  tracking-widest">Receive</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-2xl sm:text-3xl font-serif italic text-black/20 w-full">
                  {amount || '0.0'}
                </div>
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl border border-gray-200 shadow-sm shrink-0">
                  <div className="w-5 h-5 bg-black rounded-full flex items-center justify-center text-[10px] text-white font-bold">A</div>
                  <span className="text-xs font-bold ">{mode === 'DEPOSIT' ? 'AIUSD' : 'USDC'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-4 pt-2">
            <div className="flex justify-between text-[10px] text-gray-500 font-medium">
              <span>Exchange rate</span>
              <span className="text-black font-bold tracking-tight">1 USDC = 1 AIUSD</span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 font-medium">
              <span>Network cost</span>
              <span className="text-blue-600 font-bold tracking-tight bg-blue-50 px-2 py-0.5 rounded-md ">Platform Covered</span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 font-medium items-center p-3 bg-green-50 rounded-2xl border border-green-100">
              <span>Projected earnings</span>
              <span className="text-green-600 font-bold tracking-tight text-sm">+${projectedEarnings}/year</span>
            </div>
          </div>

          {/* CTA */}
          {swapMessage && (
            <div className={`px-4 py-2 rounded-xl text-xs font-bold ${swapMessage.type === 'success' ? 'bg-green-50 border border-green-100 text-green-700' : 'bg-red-50 border border-red-100 text-red-600'}`}>
              {swapMessage.text}
            </div>
          )}
          <button
            onClick={isWalletConnected ? handleSwap : () => setIsWalletConnected(true)}
            disabled={swapLoading}
            className="w-full py-5 bg-black text-white rounded-full font-bold  text-[11px] tracking-wider sm:tracking-[0.3em] hover:bg-gray-800 transition-all shadow-xl disabled:opacity-50"
          >
            {swapLoading ? 'Processing...' : !isWalletConnected ? 'Connect Wallet' : mode === 'DEPOSIT' ? 'Deposit & Start Earning' : 'Confirm Redemption'}
          </button>

          {/* Trust Badges */}
          <div className="flex flex-wrap justify-center gap-3 sm:gap-6 pt-4 grayscale opacity-40">
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              <span className="text-[9px] font-bold  tracking-tighter">Audited Contracts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12V12a1 1 0 001.59.8l1.3-1a1 1 0 01.88 0l1.3 1a1 1 0 001.59-.8v-1.88l1.69-.723a1 1 0 00.56-1.508L10.788 8.414a1 1 0 01-.788 0L3.31 9.397z" /></svg>
              <span className="text-[9px] font-bold  tracking-tighter">US Treasury Backed</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

const SmallStat: React.FC<{ label: string; value: string; hasLogo?: boolean }> = ({ label, value, hasLogo }) => (
  <div className="glass bg-white p-4 rounded-3xl border border-gray-100 flex flex-col justify-between h-24">
    <p className="text-[9px] font-bold text-gray-400  tracking-widest">{label}</p>
    <div className="flex items-center gap-2">
      {hasLogo && <div className="w-4 h-4 bg-gray-900 rounded-md" />}
      <span className="text-xs font-bold text-black">{value}</span>
    </div>
  </div>
);

export default Swap;
