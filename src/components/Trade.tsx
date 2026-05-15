
import React, { useState, useMemo, useEffect } from 'react';
import { TradeOrder } from '../types';
import { Icons, COLORS } from '../constants';
import { api } from '../services/api';

// ── Mock Data ──────────────────────────────────────────────────────
const MOCK_ORDERS: TradeOrder[] = [
    {
        id: 'T001',
        projectId: '1',
        projectTitle: 'ComputeDAO - GPU Expansion Batch #4',
        projectCoverImage: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=800',
        projectIssuer: 'ComputeDAO LLC',
        projectIssuerLogo: 'https://images.unsplash.com/photo-1599305096101-fe118399c63b?auto=format&fit=crop&q=80&w=100',
        projectApy: 15.5,
        projectDurationDays: 60,
        seller: '0x7a3f...e9c2',
        listPrice: 102.50,
        originalPrice: 97.00,
        shares: 50,
        totalValue: 5125,
        expectedReturn: 5425,
        expectedYield: 5.85,
        listedAt: '2026-03-04',
        status: 'Listed',
    },
    {
        id: 'T002',
        projectId: '1',
        projectTitle: 'ComputeDAO - GPU Expansion Batch #4',
        projectCoverImage: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=800',
        projectIssuer: 'ComputeDAO LLC',
        projectIssuerLogo: 'https://images.unsplash.com/photo-1599305096101-fe118399c63b?auto=format&fit=crop&q=80&w=100',
        projectApy: 15.5,
        projectDurationDays: 60,
        seller: '0x2b1c...4d8a',
        listPrice: 99.80,
        originalPrice: 97.00,
        shares: 20,
        totalValue: 1996,
        expectedReturn: 2155,
        expectedYield: 7.96,
        listedAt: '2026-03-05',
        status: 'Listed',
    },
    {
        id: 'T003',
        projectId: '1',
        projectTitle: 'ComputeDAO - GPU Expansion Batch #4',
        projectCoverImage: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=800',
        projectIssuer: 'ComputeDAO LLC',
        projectIssuerLogo: 'https://images.unsplash.com/photo-1599305096101-fe118399c63b?auto=format&fit=crop&q=80&w=100',
        projectApy: 15.5,
        projectDurationDays: 60,
        seller: '0x9e4f...1a7b',
        listPrice: 98.00,
        originalPrice: 97.00,
        shares: 100,
        totalValue: 9800,
        expectedReturn: 10500,
        expectedYield: 7.14,
        listedAt: '2026-03-01',
        status: 'Sold',
        buyer: '0xf3a5...82d1',
        soldAt: '2026-03-03',
    },
    {
        id: 'T004',
        projectId: '3',
        projectTitle: 'Vercel Enterprise Flow',
        projectCoverImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800',
        projectIssuer: 'CloudScale SaaS',
        projectIssuerLogo: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=100',
        projectApy: 10.2,
        projectDurationDays: 90,
        seller: '0xd4e7...3c9f',
        listPrice: 980.00,
        originalPrice: 968.00,
        shares: 5,
        totalValue: 4900,
        expectedReturn: 5250,
        expectedYield: 7.14,
        listedAt: '2026-03-06',
        status: 'Listed',
    },
    {
        id: 'T005',
        projectId: '2',
        projectTitle: 'Shopify Merchant Cluster X',
        projectCoverImage: 'https://images.unsplash.com/photo-1556742044-3c52d6e88c62?auto=format&fit=crop&q=80&w=800',
        projectIssuer: 'DropStream LLC',
        projectIssuerLogo: 'https://images.unsplash.com/photo-1541746972996-4e0b0f43e02a?auto=format&fit=crop&q=80&w=100',
        projectApy: 8.9,
        projectDurationDays: 30,
        seller: '0x1b8a...5e2d',
        listPrice: 492.00,
        originalPrice: 485.20,
        shares: 10,
        totalValue: 4920,
        expectedReturn: 5000,
        expectedYield: 1.63,
        listedAt: '2026-03-02',
        status: 'Sold',
        buyer: '0xa7c2...9f4e',
        soldAt: '2026-03-04',
    },
    {
        id: 'T006',
        projectId: '3',
        projectTitle: 'Vercel Enterprise Flow',
        projectCoverImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800',
        projectIssuer: 'CloudScale SaaS',
        projectIssuerLogo: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=100',
        projectApy: 10.2,
        projectDurationDays: 90,
        seller: '0x6f2e...b7a3',
        listPrice: 975.00,
        originalPrice: 968.00,
        shares: 15,
        totalValue: 14625,
        expectedReturn: 15750,
        expectedYield: 7.69,
        listedAt: '2026-03-05',
        status: 'Listed',
    },
];

const mapApiOrder = (o: any): TradeOrder => ({
  id: o.id,
  projectId: o.projectId,
  projectTitle: o.project?.title || '',
  projectCoverImage: o.project?.coverImage || '',
  projectIssuer: o.project?.issuer || '',
  projectIssuerLogo: o.project?.issuerLogo || '',
  projectApy: o.project?.apy || 0,
  projectDurationDays: o.project?.durationDays || 0,
  seller: o.sellerId ? `${o.sellerId.slice(0, 6)}...${o.sellerId.slice(-4)}` : '',
  listPrice: o.listPrice,
  originalPrice: o.originalPrice,
  shares: o.shares,
  totalValue: o.totalValue,
  expectedReturn: o.expectedReturn,
  expectedYield: o.expectedYield,
  listedAt: o.listedAt ? new Date(o.listedAt).toISOString().split('T')[0] : '',
  status: o.status as 'Listed' | 'Sold',
  buyer: o.buyerId ? `${o.buyerId.slice(0, 6)}...${o.buyerId.slice(-4)}` : undefined,
  soldAt: o.soldAt ? new Date(o.soldAt).toISOString().split('T')[0] : undefined,
});

// ── Main Component ─────────────────────────────────────────────────
const Trade: React.FC = () => {
    const [orders, setOrders] = useState<TradeOrder[]>(MOCK_ORDERS);
    const [statusFilter, setStatusFilter] = useState<'Listed' | 'Sold'>('Listed');
    const [projectFilter, setProjectFilter] = useState<string>('All');
    const [buyingOrder, setBuyingOrder] = useState<TradeOrder | null>(null);
    const [showProjectDropdown, setShowProjectDropdown] = useState(false);

    useEffect(() => {
        api.getTradeOrders().then(data => {
            if (Array.isArray(data) && data.length > 0) {
                setOrders(data.map(mapApiOrder));
            }
        }).catch(() => {});
    }, []);

    const uniqueProjects = useMemo(() =>
        Array.from(new Map(orders.map(o => [o.projectId, { id: o.projectId, title: o.projectTitle }])).values()),
        [orders]
    );

    const filteredOrders = useMemo(() => {
        let filtered = orders.filter(o => o.status === statusFilter);
        if (projectFilter !== 'All') {
            filtered = filtered.filter(o => o.projectId === projectFilter);
        }
        return filtered;
    }, [statusFilter, projectFilter, orders]);

    const listedCount = orders.filter(o => o.status === 'Listed').length;
    const soldCount = orders.filter(o => o.status === 'Sold').length;
    const totalVolume = orders.filter(o => o.status === 'Sold').reduce((sum, o) => sum + o.totalValue, 0);

    return (
        <>
            <div className="space-y-12 animate-fadeIn pb-24 p-4 sm:p-8 md:p-12 lg:p-16 max-w-[1600px] mx-auto w-full bg-white min-h-full">
                {/* ── Header ── */}
                <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black text-black tracking-tight">Marketplace</h2>
                        <p className="text-gray-400 mt-2 font-medium">Trade shares of funded projects on the open market.</p>
                    </div>
                </section>

                {/* ── Filters Row ── */}
                <section className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    {/* Status Tabs */}
                    <div className="flex bg-white p-1 rounded-full border border-gray-100 shadow-sm">
                        <button
                            onClick={() => setStatusFilter('Listed')}
                            className={`px-6 py-2 rounded-full text-xs font-bold tracking-wide transition-all whitespace-nowrap ${statusFilter === 'Listed' ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:text-black hover:bg-gray-50'
                                }`}
                        >
                            Listed ({listedCount})
                        </button>
                        <button
                            onClick={() => setStatusFilter('Sold')}
                            className={`px-6 py-2 rounded-full text-xs font-bold tracking-wide transition-all whitespace-nowrap ${statusFilter === 'Sold' ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:text-black hover:bg-gray-50'
                                }`}
                        >
                            Sold ({soldCount})
                        </button>
                    </div>

                    {/* Project Filter Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-gray-200 text-xs font-bold tracking-wide hover:border-black transition-all bg-white shadow-sm"
                        >
                            <span className="text-gray-400">Project:</span>
                            <span className="text-black">
                                {projectFilter === 'All' ? 'All Projects' : uniqueProjects.find(p => p.id === projectFilter)?.title || 'All'}
                            </span>
                            <svg className={`w-3 h-3 text-gray-400 transition-transform ${showProjectDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>

                        {showProjectDropdown && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowProjectDropdown(false)} />
                                <div className="absolute left-0 sm:left-auto sm:right-0 top-12 z-50 bg-white border border-gray-100 rounded-2xl shadow-2xl py-2 min-w-[220px] sm:min-w-[280px] max-w-[calc(100vw-2rem)] animate-fadeIn">
                                    <button
                                        onClick={() => { setProjectFilter('All'); setShowProjectDropdown(false); }}
                                        className={`w-full text-left px-5 py-3 text-xs font-bold transition-all ${projectFilter === 'All' ? 'text-black bg-gray-50' : 'text-gray-500 hover:bg-gray-50 hover:text-black'}`}
                                    >
                                        All Projects
                                    </button>
                                    {uniqueProjects.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => { setProjectFilter(p.id); setShowProjectDropdown(false); }}
                                            className={`w-full text-left px-5 py-3 text-xs font-bold transition-all ${projectFilter === p.id ? 'text-black bg-gray-50' : 'text-gray-500 hover:bg-gray-50 hover:text-black'}`}
                                        >
                                            {p.title}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </section>

                {/* ── Order Grid ── */}
                {filteredOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-center">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gray-100 flex items-center justify-center"><svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div>
                        <h3 className="text-xl font-bold text-black mb-2">No orders found</h3>
                        <p className="text-sm text-gray-400 font-medium">
                            {statusFilter === 'Listed' ? 'No active listings for this project yet.' : 'No completed trades for this project yet.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredOrders.map(order => (
                            <OrderCard
                                key={order.id}
                                order={order}
                                onBuy={() => setBuyingOrder(order)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Buy Modal ── */}
            {buyingOrder && (
                <BuyModal order={buyingOrder} onClose={() => setBuyingOrder(null)} onBought={() => {
                    api.getTradeOrders().then(data => {
                        if (Array.isArray(data) && data.length > 0) setOrders(data.map(mapApiOrder));
                    }).catch(() => {});
                }} />
            )}
        </>
    );
};

// ── Order Card ─────────────────────────────────────────────────────
const OrderCard: React.FC<{ order: TradeOrder; onBuy: () => void }> = ({ order, onBuy }) => {
    const premium = ((order.listPrice - order.originalPrice) / order.originalPrice * 100).toFixed(1);
    const isPremium = order.listPrice >= order.originalPrice;
    const isSold = order.status === 'Sold';

    return (
        <div
            onClick={() => { if (!isSold) onBuy(); }}
            className={`bg-white rounded-3xl overflow-hidden border transition-all group shadow-sm flex flex-col h-full ${isSold ? 'border-gray-100 opacity-75' : 'border-gray-100 hover:border-black/10 hover:shadow-lg cursor-pointer'
                }`}>
            {/* Cover Image */}
            <div className="relative h-28 sm:h-36 overflow-hidden">
                <img
                    src={order.projectCoverImage}
                    alt={order.projectTitle}
                    className={`w-full h-full object-cover transition-transform duration-1000 ${isSold ? 'grayscale' : 'group-hover:scale-110'}`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                {/* Status Badge */}
                <div className="absolute top-4 left-4 z-10">
                    <div className={`backdrop-blur-lg px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-wide shadow-xl border flex items-center gap-1.5 ${isSold
                        ? 'bg-gray-100/95 text-gray-600 border-gray-200/40'
                        : 'bg-white/95 text-black border-white/40'
                        }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isSold ? 'bg-gray-400' : 'bg-[#00E676]'}`} />
                        {isSold ? 'Sold' : 'Listed'}
                    </div>
                </div>



                {/* Credit Badge */}
                <div className="absolute top-4 right-4 z-10">
                    <div className="bg-violet-600/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl text-[10px] font-black tracking-wider shadow-xl border border-white/20 text-white flex items-center gap-1.5">
                        <Icons.Coins className="w-3.5 h-3.5 text-violet-200" />
                        <span className="opacity-80 leading-none">CREDIT:</span>
                        <span className="leading-none">+{order.projectIssuer === 'ComputeDAO LLC' ? '25' : order.projectIssuer === 'DropStream LLC' ? '15' : '10'}</span>
                    </div>
                </div>
                <div className="absolute bottom-3 left-4 z-10 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 border border-white/30 shadow-lg" />
                    <span className="text-[10px] font-bold text-white/90 tracking-wide">{order.seller}</span>
                </div>
            </div>

            {/* Body */}
            <div className="p-5 flex-1 flex flex-col">
                {/* Project Info */}
                <div className="flex items-center gap-2 mb-3">
                    <img
                        src={order.projectIssuerLogo}
                        alt={order.projectIssuer}
                        className="w-5 h-5 rounded-full object-cover border border-gray-100"
                    />
                    <span className="text-[9px] font-bold text-gray-400 tracking-widest truncate">{order.projectIssuer}</span>
                </div>

                <div className="mb-4">
                    <h4 className="text-sm font-bold text-black group-hover:text-gray-600 transition-colors line-clamp-1">{order.projectTitle}</h4>
                    <p className="text-[10px] text-gray-400 font-medium mt-1">
                        {order.shares} shares · {order.projectDurationDays}d term · {order.projectApy}% APY
                    </p>
                </div>

                {/* Price & Stats Grid */}
                <div className="grid grid-cols-3 gap-2 mb-5">
                    <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100/50">
                        <p className="text-[8px] font-bold text-gray-400 tracking-wide sm:tracking-widest mb-1">LIST PRICE</p>
                        <p className="text-[11px] font-bold text-black">${order.listPrice.toFixed(2)}</p>
                    </div>
                    <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100/50">
                        <p className="text-[8px] font-bold text-gray-400 tracking-wide sm:tracking-widest mb-1">TOTAL</p>
                        <p className="text-[11px] font-bold text-black">${order.totalValue.toLocaleString()}</p>
                    </div>
                    <div className="p-2.5 bg-green-50/50 rounded-xl border border-green-100/50">
                        <p className="text-[8px] font-bold text-gray-400 tracking-wide sm:tracking-widest mb-1">EST. RETURN</p>
                        <p className="text-[11px] font-bold text-[#00E676]">+{order.expectedYield.toFixed(1)}%</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-auto">
                    {isSold ? (
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 border border-white/30" />
                                <span className="text-[10px] font-bold text-gray-500">{order.buyer}</span>
                            </div>
                            <span className="text-[9px] font-bold text-gray-400 tracking-widest">{order.soldAt}</span>
                        </div>
                    ) : (
                        <div
                            className="w-full py-3 bg-[#00E676] text-black rounded-2xl text-xs font-bold tracking-widest text-center hover:brightness-95 active:scale-[0.98] transition-all shadow-lg hover:shadow-xl"
                        >
                            BUY NOW · ${order.totalValue.toLocaleString()}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Buy Modal ──────────────────────────────────────────────────────
const BuyModal: React.FC<{ order: TradeOrder; onClose: () => void; onBought?: () => void }> = ({ order, onClose, onBought }) => {
    const [confirmed, setConfirmed] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConfirm = async () => {
        setProcessing(true);
        setError(null);
        try {
            await api.buyTradeOrder(order.id);
            setDone(true);
            onBought?.();
        } catch (err: any) {
            setError(err.message || 'Purchase failed');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="relative bg-white rounded-[32px] shadow-2xl border border-gray-100 w-full max-w-md mx-4 overflow-hidden animate-fadeIn">
                {/* Header */}
                <div className="flex items-center justify-between p-6 pb-0">
                    <p className="text-[9px] font-bold text-gray-400 tracking-widest">PURCHASE ORDER</p>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-black transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-6 pt-4 space-y-6">
                    {done ? (
                        /* ── Success State ── */
                        <div className="text-center space-y-4 py-6">
                            <div className="w-16 h-16 mx-auto rounded-full bg-[#00E676]/10 flex items-center justify-center">
                                <svg className="w-8 h-8 text-[#00E676]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <h3 className="text-2xl font-serif italic text-black">Purchase Complete!</h3>
                            <p className="text-sm text-gray-500 font-medium">
                                You now own {order.shares} shares of {order.projectTitle}
                            </p>
                            <div className="p-4 bg-green-50 rounded-2xl border border-green-100">
                                <p className="text-[10px] font-bold text-gray-400 tracking-widest mb-1">EXPECTED RETURN</p>
                                <p className="text-xl font-black text-[#00E676]">${order.expectedReturn.toLocaleString()}</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-full py-3 bg-[#00E676] text-black rounded-2xl text-xs font-bold tracking-widest hover:brightness-95 transition-all mt-4"
                            >
                                DONE
                            </button>
                        </div>
                    ) : (
                        /* ── Confirm State ── */
                        <>
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <img src={order.projectIssuerLogo} className="w-5 h-5 rounded-full object-cover border border-gray-100" />
                                    <span className="text-[9px] font-bold text-gray-400 tracking-widest">{order.projectIssuer}</span>
                                </div>
                                <h3 className="text-lg font-bold text-black">{order.projectTitle}</h3>
                                <p className="text-[10px] text-gray-400 font-medium mt-1">Seller: {order.seller}</p>
                            </div>

                            {/* Order Summary */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                    <span className="text-xs text-gray-500 font-medium">Shares</span>
                                    <span className="text-xs font-bold text-black">{order.shares}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                    <span className="text-xs text-gray-500 font-medium">Price per share</span>
                                    <span className="text-xs font-bold text-black">${order.listPrice.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                    <span className="text-xs text-gray-500 font-medium">Original price</span>
                                    <span className="text-xs font-bold text-gray-400">${order.originalPrice.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                    <span className="text-xs text-gray-500 font-medium">Remaining term</span>
                                    <span className="text-xs font-bold text-black">{order.projectDurationDays} days</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                    <span className="text-xs text-gray-500 font-medium">Expected return on maturity</span>
                                    <span className="text-xs font-bold text-[#00E676]">${order.expectedReturn.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center py-3 bg-gray-50 rounded-2xl px-4 -mx-1">
                                    <span className="text-sm font-bold text-black">Total cost</span>
                                    <span className="text-lg font-black text-black">${order.totalValue.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Confirm Checkbox */}
                            <label className="flex items-start gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={confirmed}
                                    onChange={(e) => setConfirmed(e.target.checked)}
                                    className="mt-0.5 w-5 h-5 rounded accent-black"
                                />
                                <span className="text-[11px] text-gray-500 font-medium leading-relaxed group-hover:text-gray-700 transition-colors">
                                    I understand this is a secondary market purchase. The shares will be transferred to my wallet upon transaction confirmation.
                                </span>
                            </label>

                            {error && (
                                <div className="px-4 py-2 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-600">{error}</div>
                            )}

                            {/* Action */}
                            <button
                                onClick={handleConfirm}
                                disabled={!confirmed || processing}
                                className={`w-full py-3.5 rounded-2xl text-xs font-bold tracking-widest transition-all shadow-lg ${!confirmed || processing
                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                                    : 'bg-[#00E676] text-black hover:brightness-95 hover:shadow-xl active:scale-[0.98]'
                                    }`}
                            >
                                {processing ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                        PROCESSING...
                                    </span>
                                ) : (
                                    `CONFIRM PURCHASE · $${order.totalValue.toLocaleString()}`
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Trade;
