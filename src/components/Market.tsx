import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Icons, COLORS } from '../constants';
import { MarketAsset, RepaymentSchedule } from '../types';
import { api } from '../services/api';

// Cover image SVG generator — gradient + icon composition (same approach as Chat.tsx)
const coverSvg = (c1: string, c2: string, icon: string, w = 800, h = 400) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#bg)"/><circle cx="160" cy="200" r="120" fill="rgba(255,255,255,0.06)"/><circle cx="640" cy="100" r="180" fill="rgba(255,255,255,0.04)"/><circle cx="500" cy="350" r="100" fill="rgba(255,255,255,0.05)"/><rect x="60" y="60" width="680" height="280" rx="24" fill="rgba(255,255,255,0.07)"/><text x="400" y="220" font-size="120" text-anchor="middle" dominant-baseline="middle">${icon}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

// Logo SVG generator
const logoSvg = (c1: string, c2: string, letter: string, w = 100, h = 100) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="${w}" height="${h}" rx="20" fill="url(#bg)"/><text x="50%" y="58%" font-family="system-ui" font-size="48" fill="#fff" text-anchor="middle" dominant-baseline="middle" font-weight="900">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

// Visual config per project
const PROJECT_VISUALS: Record<string, { c1: string; c2: string; icon: string; letter: string }> = {
  'Draftly - 3D Web Builder': { c1: '#7c3aed', c2: '#a855f7', icon: '🎨', letter: 'D' },
  'POST BRIDGE - Social Media': { c1: '#e11d48', c2: '#f43f5e', icon: '📱', letter: 'P' },
  'Deeptrue - AI Translation': { c1: '#0284c7', c2: '#0ea5e9', icon: '🌐', letter: 'D' },
  'PxlSafe - Video Editor Tools': { c1: '#0f172a', c2: '#334155', icon: '🎬', letter: 'P' },
  'Rezi - AI Resume Builder': { c1: '#4f46e5', c2: '#6366f1', icon: '📄', letter: 'R' },
  'Comp AI - Compliance Automation': { c1: '#047857', c2: '#0d9488', icon: '🛡️', letter: 'C' },
};
const getVisual = (title: string) => PROJECT_VISUALS[title] || { c1: '#64748b', c2: '#334155', icon: '💰', letter: '?' };

const MOCK_ASSETS: MarketAsset[] = [
  {
    id: '1',
    title: 'Rezi - AI Resume Builder',
    subtitle: 'AI-Powered Career Platform — Best AI resume builder with ~1M new users annually.',
    category: 'AI',
    issuer: 'Rezi Inc.',
    issuerLogo: '/logos/rezi.png',
    faceValue: 100,
    askPrice: 96,
    apy: 15.5,
    durationDays: 180,
    daysLeft: 0,
    creditScore: 820,
    status: 'Funded',
    targetAmount: 800000,
    raisedAmount: 780000,
    backersCount: 12,
    remainingCap: 20000,
    coverageRatio: 2.1,
    verifiedSource: 'Stripe API',
    description: 'The best AI resume builder in the world with ~1M new users annually. Rezi Enterprise supports 300+ organisations including Fortune 500 companies and universities. $271K/mo verified Stripe revenue. MRR $290,693. +8% MoM. 60% profit margin. Listed at $15M on TrustMRR.',
    useOfFunds: 'AI model training, enterprise sales expansion, job seeker marketplace.',
    monthlyRevenue: [
      { month: 'Aug', amount: 232000 },
      { month: 'Sep', amount: 246000 },
      { month: 'Oct', amount: 255000 },
      { month: 'Nov', amount: 262000 },
      { month: 'Dec', amount: 268000 },
      { month: 'Jan', amount: 271104 }
    ],
    coverImage: '/covers/rezi.png'
  },
  {
    id: '2',
    title: 'POST BRIDGE - Social Media',
    subtitle: 'Multi-Platform Content Publishing — Schedule and publish across all platforms.',
    category: 'AI',
    issuer: 'Post Bridge Inc.',
    issuerLogo: '/logos/postbridge.png',
    faceValue: 100,
    askPrice: 97,
    apy: 18.2,
    durationDays: 270,
    daysLeft: 14,
    creditScore: 800,
    status: 'Fundraising',
    targetAmount: 500000,
    raisedAmount: 325000,
    backersCount: 8,
    remainingCap: 175000,
    coverageRatio: 1.8,
    verifiedSource: 'Stripe API',
    description: 'POST BRIDGE lets you post to multiple social platforms simultaneously. $28,901 verified Stripe revenue in last 30 days. MRR $30,958. +65% MoM growth. 92% profit margin. 1,503 active subscriptions. Founded Sep 2024 by Jack Friks. Listed at $1.4M on TrustMRR.',
    useOfFunds: 'Platform scaling, new social network integrations, marketing.',
    monthlyRevenue: [
      { month: 'Sep', amount: 3200 },
      { month: 'Oct', amount: 7400 },
      { month: 'Nov', amount: 11200 },
      { month: 'Dec', amount: 17600 },
      { month: 'Jan', amount: 22400 },
      { month: 'Feb', amount: 28901 }
    ],
    coverImage: '/covers/postbridge.png'
  },
  {
    id: '3',
    title: 'Deeptrue - AI Translation',
    subtitle: 'Real-time Meeting Translation Copilot — Break language barriers in meetings.',
    category: 'AI',
    issuer: 'Deeptrue Corp.',
    issuerLogo: '/logos/deeptrue.png',
    faceValue: 100,
    askPrice: 95,
    apy: 20.5,
    durationDays: 120,
    daysLeft: 3,
    creditScore: 760,
    status: 'Fundraising',
    targetAmount: 250000,
    raisedAmount: 95000,
    backersCount: 4,
    remainingCap: 155000,
    coverageRatio: 1.5,
    verifiedSource: 'Stripe API',
    description: 'Real-time AI translation copilot for global meetings on Zoom, Meet, and Teams. $2,022 verified Stripe revenue in last 30 days. MRR $2,001. +19% MoM growth. 80% profit margin. 61 active subscriptions. 30+ languages. Founded 2025.',
    useOfFunds: 'AI model training, language expansion, enterprise features.',
    monthlyRevenue: [
      { month: 'Aug', amount: 982 },
      { month: 'Sep', amount: 1201 },
      { month: 'Oct', amount: 1430 },
      { month: 'Nov', amount: 1680 },
      { month: 'Dec', amount: 1820 },
      { month: 'Jan', amount: 2022 }
    ],
    coverImage: '/covers/deeptrue.png'
  },
  {
    id: '4',
    title: 'Draftly - 3D Web Builder',
    subtitle: 'No-Code 3D Website Platform — Build stunning 3D websites 10× faster.',
    category: 'AI',
    issuer: 'Draftly Space',
    issuerLogo: '/logos/draftly.png',
    faceValue: 100,
    askPrice: 96,
    apy: 16.0,
    durationDays: 240,
    daysLeft: 7,
    creditScore: 780,
    status: 'Fundraising',
    targetAmount: 350000,
    raisedAmount: 273000,
    backersCount: 6,
    remainingCap: 77000,
    coverageRatio: 1.6,
    verifiedSource: 'DodoPayment API',
    description: 'Build 3D websites 10× faster with no code. $6,172 verified revenue in last 30 days. MRR $3,165. 100 active subscriptions. 28K+ monthly visitors. 85% profit margin. Founded in India.',
    useOfFunds: 'Template marketplace, 3D engine optimisation, team growth.',
    monthlyRevenue: [
      { month: 'Aug', amount: 3800 },
      { month: 'Sep', amount: 4200 },
      { month: 'Oct', amount: 4600 },
      { month: 'Nov', amount: 5100 },
      { month: 'Dec', amount: 5600 },
      { month: 'Jan', amount: 6172 }
    ],
    coverImage: '/covers/draftly.png'
  },
  {
    id: '5',
    title: 'PxlSafe - Video Editor Tools',
    subtitle: 'AI-Powered Plugin Suite for Creators — Professional video editing made easy.',
    category: 'AI',
    issuer: 'PxlSafe Studio',
    issuerLogo: '/logos/pxlsafe.png',
    faceValue: 100,
    askPrice: 97,
    apy: 14.8,
    durationDays: 365,
    daysLeft: 21,
    creditScore: 740,
    status: 'Fundraising',
    targetAmount: 300000,
    raisedAmount: 48000,
    backersCount: 5,
    remainingCap: 252000,
    coverageRatio: 1.4,
    verifiedSource: 'LemonSqueezy API',
    description: 'AI-powered plugin suite for video editors. MVX AI (Premiere Pro) and AutoVFX (AI VFX generator). $6,300/mo total revenue. MRR $4,500 from 90+ subscribers. 1,600+ customers, 34K Instagram following. 90% profit margin.',
    useOfFunds: 'New plugin development, macOS app, marketing campaigns.',
    monthlyRevenue: [
      { month: 'Aug', amount: 3100 },
      { month: 'Sep', amount: 3800 },
      { month: 'Oct', amount: 4500 },
      { month: 'Nov', amount: 5200 },
      { month: 'Dec', amount: 5700 },
      { month: 'Jan', amount: 6300 }
    ],
    coverImage: '/covers/pxlsafe.png'
  },
  {
    id: '6',
    title: 'Comp AI - Compliance Automation',
    subtitle: 'AI Cybersecurity Compliance Engine — Get SOC 2 & ISO 27001 compliant fast.',
    category: 'AI',
    issuer: 'Comp AI Ltd.',
    issuerLogo: '/logos/compai.png',
    faceValue: 100,
    askPrice: 93,
    apy: 22.0,
    durationDays: 90,
    daysLeft: 0,
    creditScore: 680,
    status: 'Failed',
    targetAmount: 400000,
    raisedAmount: 0,
    backersCount: 0,
    remainingCap: 400000,
    coverageRatio: 0.9,
    verifiedSource: 'Stripe API',
    description: 'The fastest way to get compliant with SOC 2 and ISO 27001 using AI automation. $482K verified Stripe revenue in last 30 days. MRR $8,700 (subscription). $2M total revenue. Failed to reach fundraising target within deadline. Listed on TrustMRR.',
    useOfFunds: 'AI compliance engine, framework expansion, enterprise onboarding.',
    monthlyRevenue: [
      { month: 'Aug', amount: 8200 },
      { month: 'Sep', amount: 8400 },
      { month: 'Oct', amount: 8600 },
      { month: 'Nov', amount: 8600 },
      { month: 'Dec', amount: 8700 },
      { month: 'Jan', amount: 8700 }
    ],
    coverImage: '/covers/compai.png'
  }
];

// Project images (local covers + logos)
const PROJECT_IMAGES: Record<string, { cover: string; logo: string }> = {
  'Draftly - 3D Web Builder': { cover: '/covers/draftly.png', logo: '/logos/draftly.png' },
  'POST BRIDGE - Social Media': { cover: '/covers/postbridge.png', logo: '/logos/postbridge.png' },
  'Deeptrue - AI Translation': { cover: '/covers/deeptrue.png', logo: '/logos/deeptrue.png' },
  'PxlSafe - Video Editor Tools': { cover: '/covers/pxlsafe.png', logo: '/logos/pxlsafe.png' },
  'Rezi - AI Resume Builder': { cover: '/covers/rezi.png', logo: '/logos/rezi.png' },
  'Comp AI - Compliance Automation': { cover: '/covers/compai.png', logo: '/logos/compai.png' },
};

const mapApiProject = (p: any): MarketAsset => {
  const v = getVisual(p.title);
  const imgs = PROJECT_IMAGES[p.title];
  const firstLetter = (p.issuer || p.title || '?')[0].toUpperCase();

  // Calculate daysLeft from endDate
  let daysLeft: number | undefined;
  if (p.endDate) {
    const end = new Date(p.endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    daysLeft = Math.max(0, diff);
  }

  return {
    id: p.id,
    title: p.title,
    subtitle: p.subtitle || '',
    category: p.category as MarketAsset['category'],
    issuer: p.issuer,
    issuerLogo: p.issuerLogo || (imgs?.logo) || logoSvg(v.c1, v.c2, firstLetter),
    coverImage: p.coverImage || (imgs?.cover) || coverSvg(v.c1, v.c2, v.icon),
    faceValue: p.faceValue,
    askPrice: p.askPrice,
    apy: p.apy,
    durationDays: p.durationDays,
    daysLeft,
    creditScore: p.creditScore,
    status: p.status as MarketAsset['status'],
    targetAmount: p.targetAmount,
    raisedAmount: p.raisedAmount,
    backersCount: p.backersCount,
    remainingCap: p.remainingCap,
    coverageRatio: p.coverageRatio,
    verifiedSource: p.verifiedSource || '',
    description: p.description || '',
    useOfFunds: p.useOfFunds || '',
    monthlyRevenue: (p.monthlyRevenue || []).map((m: any) => ({ month: m.month, amount: m.amount })),
  };
};

/* ── Potential Project Detail (TrustMRR-style) ── */
interface PotProject {
  name: string; cat: string; mapped_cat: string; tagColor: string; views: string; saves: number;
  desc: string; rev: string; revGrow: string; waitlist: string; tags: string[];
  logo: string; color: string; cover: string; label: string;
  iconUrl?: string; founderAvatarUrl?: string; websiteUrl?: string; slug?: string;
  xFollowerCount?: number;
  allTimeRev?: string; mrr?: string; founder?: string; founderFollowers?: string;
  founded?: string; country?: string; profitMargin?: string;
  techStack?: string[]; targetAudience?: string; paymentProvider?: string; activeSubscriptions?: number;
  pricing?: string; valueProposition?: string; problemSolved?: string;
  monthlyData?: { month: string; amount: number }[];
  // Extra fields
  rank?: number; multiple?: number; askingPrice?: number;
  customers?: number; growthMRR30d?: number; revenuePerVisitor?: number;
}


const PotentialProjectDetail: React.FC<{ project: PotProject; onClose: () => void }> = ({ project: initialProject, onClose }) => {
  const [project, setProject] = useState<PotProject>(initialProject);
  const [activeTab, setActiveTab] = useState<'STORY' | 'FINANCIALS'>('STORY');
  const [chartMetric, setChartMetric] = useState<'revenue' | 'mrr'>('revenue');
  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [metricDropdownOpen, setMetricDropdownOpen] = useState(false);
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);

  useEffect(() => {
    setProject(initialProject);
    if (initialProject.slug) {
      fetch(`/api/trustmrr/startups/${initialProject.slug}`)
        .then(res => res.json())
        .then(res => {
          if (res.data) {
            setProject(prev => ({
              ...prev,
              xFollowerCount: res.data.xFollowerCount || prev.xFollowerCount,
              targetAudience: res.data.targetAudience || prev.targetAudience,
              paymentProvider: res.data.paymentProvider || prev.paymentProvider,
              techStack: (() => {
                const ts = res.data.techStack;
                if (!ts || !ts.length) return prev.techStack;
                // API may return {slug, category}[] or string[]
                if (typeof ts[0] === 'string') return ts as string[];
                return (ts as { slug: string; category: string }[]).map(t => t.slug);
              })(),
              activeSubscriptions: res.data.activeSubscriptions != null ? res.data.activeSubscriptions : prev.activeSubscriptions,
              valueProposition: res.data.valueProposition || prev.valueProposition,
              problemSolved: res.data.problemSolved || prev.problemSolved,
              pricing: res.data.pricing || prev.pricing,
            }));
          }
        })
        .catch(err => console.error('Failed to fetch project detail:', err));
    }
  }, [initialProject]);
  const maxAmount = Math.max(...(project.monthlyData || []).map(d => d.amount), 1);

  return (
    <div className="flex-1 flex flex-col animate-fadeIn min-h-screen bg-gray-50 md:bg-gray-100/80">
      {/* ── HEADER ── */}
      <div className="bg-transparent border-b-0 border-transparent">
        <div className="px-4 sm:px-8 md:px-12 pt-5 pb-6 max-w-[1100px] mx-auto">
          {/* Back Nav */}
          <button onClick={onClose} className="flex items-center gap-2 text-[12px] font-bold text-gray-400 hover:text-black transition-colors group mb-5">
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Market
          </button>

          {/* Title Row */}
          <div className="flex flex-col md:flex-row gap-5 md:items-start justify-between mb-6">
            <div className="flex gap-4 items-start">
              {project.iconUrl ? (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden shadow-md shrink-0 border border-gray-100 bg-white">
                  <img src={project.iconUrl} alt={project.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              ) : (
                <div className={`w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br ${project.color} rounded-2xl flex items-center justify-center font-black text-white text-3xl shadow-md shrink-0`}>{project.logo}</div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                  <h1 className="text-2xl sm:text-3xl font-black text-black tracking-tight">{project.name}</h1>
                  {project.rank != null && (
                    <span className="text-[10px] font-black text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full tracking-widest">#{project.rank}</span>
                  )}
                </div>
                <p className="text-[13px] text-gray-500 font-medium max-w-xl line-clamp-2">{project.desc}</p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => {
                const url = project.slug ? `${window.location.origin}/market/startup/${project.slug}` : window.location.href;
                navigator.clipboard.writeText(url).then(() => {
                  const btn = document.getElementById('share-toast');
                  if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Share'; }, 1500); }
                });
              }} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 text-black rounded-xl font-bold text-xs hover:bg-gray-50 hover:border-gray-300 transition-all">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                <span id="share-toast">Share</span>
              </button>
              <a href={project.websiteUrl || '#'} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 px-5 py-2 bg-black text-white rounded-xl font-bold text-xs hover:bg-gray-800 transition-all shadow-sm ${!project.websiteUrl ? 'opacity-50 pointer-events-none' : ''}`}>
                Visit
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            </div>
          </div>

          {/* ── 4-column KPI cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-gray-200 hover:shadow-md transition-all">
              <p className="text-[10px] font-bold text-gray-400 tracking-widest mb-1.5">ALL-TIME REVENUE</p>
              <p className="text-lg sm:text-xl font-black text-black truncate">{project.allTimeRev || '—'}</p>
              <p className="text-[10px] text-gray-400 font-medium mt-1">Profit margin: {project.profitMargin || '—'}</p>
            </div>
            <div className="p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-gray-200 hover:shadow-md transition-all">
              <div className="flex items-center gap-1 mb-1.5">
                <p className="text-[10px] font-bold text-gray-400 tracking-widest">MRR (VERIFIED)</p>
                <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p className="text-lg sm:text-xl font-black text-black truncate">{project.mrr && project.mrr !== '$0' ? project.mrr : '—'}</p>
              <p className="text-[10px] text-gray-400 font-medium mt-1">Stripe API</p>
            </div>
            <div className="p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-gray-200 hover:shadow-md transition-all">
              <p className="text-[10px] font-bold text-gray-400 tracking-widest mb-1.5">FOUNDER</p>
              <div className="flex items-center gap-2">
                {project.founderAvatarUrl ? (
                  <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-gray-200"><img src={project.founderAvatarUrl} alt={project.founder || ''} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>
                ) : (
                  <div className={`w-6 h-6 bg-gradient-to-br ${project.color} rounded-lg flex items-center justify-center text-[9px] font-bold text-white shrink-0`}>{(project.founder || '?')[0]}</div>
                )}
                <p className="text-sm font-black text-black truncate">{project.founder}</p>
                <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              </div>
              {project.xFollowerCount != null && project.xFollowerCount > 0 && (
                <p className="text-[10px] text-gray-400 font-medium mt-1">
                  <svg className="w-3 h-3 inline-block mr-0.5 -mt-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                  {project.xFollowerCount >= 1000 ? `${(project.xFollowerCount / 1000).toFixed(1)}k` : project.xFollowerCount} followers
                </p>
              )}
            </div>
            <div className="p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-gray-200 hover:shadow-md transition-all">
              <p className="text-[10px] font-bold text-gray-400 tracking-widest mb-1.5">GROWTH (30D)</p>
              <p className={`text-lg sm:text-xl font-black ${project.revGrow ? 'text-emerald-500' : 'text-gray-300'}`}>{project.revGrow || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CONTENT AREA ── same white background */}
      <div className="px-4 sm:px-8 md:px-12 pb-32 max-w-[1100px] mx-auto w-full">

        {/* Navigation Tabs */}
        <div className="flex items-center gap-6 mt-8 mb-6 overflow-x-auto">
          {[
            { id: 'STORY', label: 'Background' },
            { id: 'FINANCIALS', label: 'Financial Health' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-2.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap -mb-px ${activeTab === tab.id
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="py-4">
          {/* ── Background Tab ── */}
          {activeTab === 'STORY' && (
            <div className="bg-white rounded-3xl p-6 md:p-10 border border-gray-100 shadow-sm animate-fadeIn space-y-8">

              {/* ── Company Info Tags ── */}
              <div className="flex flex-wrap items-center gap-2">
                {project.country && project.country !== 'Unknown' && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    {project.country}
                  </span>
                )}
                {project.founded && project.founded !== 'Unknown' && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Founded {project.founded}
                  </span>
                )}
                {project.cat && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                    {project.cat.charAt(0).toUpperCase() + project.cat.slice(1).replace(/-/g, ' ')}
                  </span>
                )}
                {project.targetAudience && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    {project.targetAudience}
                  </span>
                )}
                {project.rank != null && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
                    Rank #{project.rank}
                  </span>
                )}
              </div>

              {/* ── Company Description ── */}
              {project.desc && (
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-3">About</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{project.desc}</p>
                </div>
              )}

              {/* ── AI-Generated Insights (Value Proposition & Problem Solved) ── */}
              {(project.valueProposition || project.problemSolved) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {project.valueProposition && (
                    <div className="bg-gray-50/50 border border-gray-100/50 rounded-2xl p-5 hover:bg-gray-50 transition-all">
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="w-7 h-7 bg-blue-100/50 border border-blue-100 rounded-xl flex items-center justify-center text-blue-500">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Value Proposition</p>
                      </div>
                      <p className="text-sm text-gray-700 font-medium leading-relaxed">{project.valueProposition}</p>
                    </div>
                  )}
                  {project.problemSolved && (
                    <div className="bg-gray-50/50 border border-gray-100/50 rounded-2xl p-5 hover:bg-gray-50 transition-all">
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="w-7 h-7 bg-purple-100/50 border border-purple-100 rounded-xl flex items-center justify-center text-purple-500">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Problem Solved</p>
                      </div>
                      <p className="text-sm text-gray-700 font-medium leading-relaxed">{project.problemSolved}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Founder Card ── */}
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-3">Founder</h3>
                <div className="bg-gray-50/50 rounded-2xl border border-gray-100/50 overflow-hidden">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 sm:p-6">
                    <div className="flex items-center gap-4 min-w-0">
                      {project.founderAvatarUrl ? (
                        <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 border-2 border-gray-100 shadow-sm">
                          <img src={project.founderAvatarUrl} alt={project.founder || ''} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                      ) : (
                        <div className={`w-14 h-14 bg-gradient-to-br ${project.color} rounded-full flex items-center justify-center font-black text-white text-xl shadow-sm`}>{(project.founder || '?')[0]}</div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <h4 className="text-lg font-black text-black tracking-tight">{project.founder}</h4>
                          <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-[8px] text-white shadow-sm">✓</div>
                          {project.xFollowerCount != null && project.xFollowerCount > 0 && (
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                              {project.xFollowerCount >= 1000 ? `${(project.xFollowerCount / 1000).toFixed(1)}k` : project.xFollowerCount} followers
                            </span>
                          )}
                        </div>
                        {/* Founder's Twitter handle shown as subtitle */}
                        {project.founderFollowers && (
                          <p className="text-[11px] font-medium text-gray-400">{project.founderFollowers}</p>
                        )}
                      </div>
                    </div>
                    {project.founderFollowers && (
                      <a href={`https://x.com/${project.founderFollowers.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-black hover:bg-gray-800 transition-colors rounded-xl text-[12px] font-bold flex items-center gap-2 text-white shadow-sm shrink-0">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                        {project.founderFollowers}
                        <svg className="w-3.5 h-3.5 text-[#00E676]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Startup Insights — Card Grid ── */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-gray-900">Startup Insights</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {([
                    {
                      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
                      label: 'Customers', value: project.customers != null && project.customers > 0 ? project.customers.toLocaleString() : null, accent: 'green'
                    },
                    {
                      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>,
                      label: 'Subscriptions', value: project.activeSubscriptions != null ? project.activeSubscriptions.toLocaleString() : null, accent: 'emerald'
                    },
                    {
                      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>,
                      label: 'Payment', value: project.paymentProvider ? project.paymentProvider.charAt(0).toUpperCase() + project.paymentProvider.slice(1) : null, accent: 'indigo'
                    },
                    {
                      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
                      label: 'Profit Margin', value: project.profitMargin && project.profitMargin !== '-' ? project.profitMargin : null, accent: 'green'
                    },
                    {
                      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
                      label: 'Revenue Multiple', value: project.multiple != null ? `${project.multiple.toFixed(1)}x` : null, accent: 'orange'
                    },
                    {
                      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>,
                      label: 'Pricing', value: project.pricing || null, accent: 'indigo'
                    },
                    {
                      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
                      label: 'Revenue / Visitor', value: project.revenuePerVisitor != null ? `$${project.revenuePerVisitor.toFixed(2)}` : null, accent: 'purple'
                    },
                    {
                      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
                      label: 'MRR Growth (30D)', value: project.growthMRR30d != null ? `$${project.growthMRR30d.toLocaleString()}` : null, accent: 'emerald'
                    },
                  ] as { icon: React.ReactNode; label: string; value: string | null; accent: string }[]).filter(item => item.value != null).map((item) => {
                    const accentMap: Record<string, { bg: string; text: string; border: string; iconColor: string }> = {
                      blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100', iconColor: 'text-blue-500' },
                      purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-100', iconColor: 'text-purple-500' },
                      green: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', iconColor: 'text-emerald-500' },
                      emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', iconColor: 'text-emerald-500' },
                      indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-100', iconColor: 'text-indigo-500' },
                      orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-100', iconColor: 'text-orange-500' },
                      yellow: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100', iconColor: 'text-amber-500' },
                      red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100', iconColor: 'text-red-500' },
                      gray: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-100', iconColor: 'text-gray-400' },
                    };
                    const ac = accentMap[item.accent] || accentMap.gray;
                    return (
                      <div key={item.label} className="bg-gray-50/50 border border-gray-100/50 rounded-2xl p-4 hover:bg-gray-50 transition-all">
                        <div className={`w-8 h-8 ${ac.bg} ${ac.border} border rounded-xl flex items-center justify-center mb-3 ${ac.iconColor}`}>{item.icon}</div>
                        <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mb-1">{item.label}</p>
                        <p className={`text-sm font-black ${ac.text} leading-tight`}>{item.value}</p>
                      </div>
                    );
                  })}
                  {/* Tech Stack — full-width row */}
                  {project.techStack && project.techStack.length > 0 && (
                    <div className="col-span-2 sm:col-span-3 lg:col-span-4 bg-gray-50/50 border border-gray-100/50 rounded-2xl p-4 hover:bg-gray-50 transition-all">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center text-gray-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Tech Stack</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {project.techStack.map(t => (
                          <span key={t} className="text-[11px] font-semibold text-gray-700 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg hover:border-gray-300 transition-colors">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>{/* end grid */}
              </div>{/* end space-y-4 */}

              {/* empty placeholder removed */}
            </div>
          )}

          {/* ── Financial Health Tab ── */}
          {activeTab === 'FINANCIALS' && (() => {
            const parseRev = (s: string) => { const n = parseFloat(s.replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n; };
            const currentRev = parseRev(project.rev || '0');
            const currentMrr = parseRev(project.mrr || '0');
            const periodDays = chartPeriod === '7d' ? 7 : chartPeriod === '30d' ? 30 : chartPeriod === '90d' ? 90 : 180;

            const generateDailyData = (baseVal: number, growthPct: number) => {
              if (baseVal <= 0) return [];
              const days = periodDays;
              const dailyBase = baseVal / 30;
              const dailyGrowth = growthPct / 100 / 30;
              return Array.from({ length: days }, (_, i) => {
                const factor = 1 + dailyGrowth * (i - days / 2);
                const jitter = 0.85 + Math.random() * 0.3;
                return {
                  day: i + 1,
                  value: Math.round(dailyBase * factor * jitter),
                  prevValue: Math.round(dailyBase * (factor - dailyGrowth * days) * (0.85 + Math.random() * 0.3)),
                };
              });
            };

            const growthPct = project.revGrow ? parseFloat(project.revGrow.replace(/[^0-9.-]/g, '')) : 5;
            const revData = generateDailyData(currentRev, growthPct);
            const mrrGrowthPct = project.growthMRR30d != null ? (project.growthMRR30d / (currentMrr || 1)) * 100 : growthPct;
            const mrrData = generateDailyData(currentMrr, mrrGrowthPct);

            const periodOptions = [
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
              { value: 'all', label: 'All time' },
            ];
            const xInterval = chartPeriod === '7d' ? 0 : chartPeriod === '30d' ? 4 : chartPeriod === '90d' ? 14 : 29;
            const paymentLabel = project.paymentProvider ? project.paymentProvider.charAt(0).toUpperCase() + project.paymentProvider.slice(1) : 'Stripe';

            const ChartPanel = ({
              title, value, growth, color, gradientId, data, label
            }: {
              title: string; value: string | undefined; growth?: string; color: string;
              gradientId: string; data: { day: number; value: number; prevValue: number }[]; label: string;
            }) => (
              <div className="bg-gray-50/50 border border-gray-100/50 rounded-2xl p-5 sm:p-6 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 tracking-widest mb-1">{title}</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl sm:text-3xl font-black text-black tracking-tight">{value || '—'}</span>
                      {growth && <span className="text-xs font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded">▲ {growth}</span>}
                    </div>
                  </div>
                  <div className="w-2.5 h-2.5 rounded-full mt-1.5" style={{ background: color }} />
                </div>
                {data.length > 0 ? (
                  <div className="h-52 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                        <defs>
                          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(d) => `D${d}`} interval={xInterval} />
                        <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={42} />
                        <Tooltip
                          contentStyle={{ background: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '11px', color: '#fff', fontWeight: 600 }}
                          labelFormatter={(d) => `Day ${d}`}
                          formatter={(value: number) => [`$${value.toLocaleString()}`, label]}
                        />
                        <Area type="monotone" dataKey="prevValue" stroke="#e5e7eb" strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={false} />
                        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 4, fill: color, stroke: '#fff', strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center">
                    <p className="text-xs text-gray-300 font-semibold">No data available</p>
                  </div>
                )}
              </div>
            );

            return (
              <div className="bg-white rounded-3xl p-6 md:p-10 border border-gray-100 shadow-sm animate-fadeIn space-y-6">
                {/* Summary row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'REVENUE (30D)', value: project.rev, sub: project.revGrow ? `▲ ${project.revGrow} MoM` : undefined, subColor: 'text-emerald-500' },
                    { label: 'MRR', value: project.mrr && project.mrr !== '$0' ? project.mrr : undefined, sub: `via ${paymentLabel}`, subColor: 'text-gray-400' },
                    { label: 'ALL-TIME', value: project.allTimeRev, sub: 'Total revenue', subColor: 'text-gray-400' },
                    { label: 'PROFIT MARGIN', value: project.profitMargin && project.profitMargin !== '-' ? project.profitMargin : undefined, sub: project.activeSubscriptions != null ? `${project.activeSubscriptions.toLocaleString()} subs` : undefined, subColor: 'text-gray-400' },
                  ].map(card => (
                    <div key={card.label} className="bg-gray-50/50 rounded-2xl border border-gray-100/50 p-4 hover:shadow-md transition-all">
                      <p className="text-[10px] font-bold text-gray-400 tracking-widest mb-1.5">{card.label}</p>
                      <p className="text-lg sm:text-xl font-black text-black tracking-tight truncate">{card.value || '—'}</p>
                      {card.sub && <p className={`text-[10px] font-bold mt-1 ${card.subColor}`}>{card.sub}</p>}
                    </div>
                  ))}
                </div>

                {/* Period selector */}
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-900">Revenue & MRR Charts</p>
                  <div className="relative">
                    <button
                      onClick={() => { setPeriodDropdownOpen(!periodDropdownOpen); }}
                      className="flex items-center gap-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-300 hover:shadow-sm transition-all"
                    >
                      {periodOptions.find(p => p.value === chartPeriod)?.label}
                      <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${periodDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {periodDropdownOpen && (
                      <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden animate-fadeIn">
                        {periodOptions.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => { setChartPeriod(opt.value as any); setPeriodDropdownOpen(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-left hover:bg-gray-50 transition-colors ${chartPeriod === opt.value ? 'bg-gray-50 text-gray-900' : 'text-gray-600'}`}
                          >
                            {opt.label}
                            {chartPeriod === opt.value && <svg className="w-3.5 h-3.5 ml-auto text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Two full-width stacked charts — only render if data exists */}
                <div className="space-y-4">
                  {revData.length > 0 && (
                    <ChartPanel
                      title="REVENUE"
                      value={project.rev}
                      growth={project.revGrow}
                      color="#3b82f6"
                      gradientId="gradRev"
                      data={revData}
                      label="Revenue"
                    />
                  )}
                  {mrrData.length > 0 && (
                    <ChartPanel
                      title="MRR"
                      value={project.mrr && project.mrr !== '$0' ? project.mrr : undefined}
                      color="#10b981"
                      gradientId="gradMrr"
                      data={mrrData}
                      label="MRR"
                    />
                  )}
                  {revData.length === 0 && mrrData.length === 0 && (
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-10 text-center">
                      <svg className="w-8 h-8 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                      <p className="text-sm font-bold text-gray-300">No chart data available</p>
                    </div>
                  )}
                </div>

                {/* Verified footer */}
                <div className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-100 rounded-xl w-fit">
                  <svg className="w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  <span className="text-[11px] font-semibold text-gray-500">Revenue verified via <strong className="text-gray-900">{paymentLabel} API</strong></span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

const Market: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedAsset, setSelectedAsset] = useState<MarketAsset | null>(null);
  const [activeTab, setActiveTab] = useState<'fundraising' | 'earlybird'>('earlybird');
  const [assets, setAssets] = useState<MarketAsset[]>(MOCK_ASSETS);

  // Fundraising filters
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterApyMin, setFilterApyMin] = useState<string>('');
  const [filterApyMax, setFilterApyMax] = useState<string>('');
  const [filterAmountMin, setFilterAmountMin] = useState<string>('');
  const [filterAmountMax, setFilterAmountMax] = useState<string>('');
  const [sortBy, setSortBy] = useState<'default' | 'apy_desc' | 'apy_asc' | 'progress_desc' | 'amount_asc'>('default');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Potential Projects / M&A filters
  const [potCat, setPotCat] = useState<string>('All');
  const [potRevMin, setPotRevMin] = useState<string>('');
  const [potRevMax, setPotRevMax] = useState<string>('');
  const [potMrrMin, setPotMrrMin] = useState<string>('');
  const [potMrrMax, setPotMrrMax] = useState<string>('');
  const [potGrowthMin, setPotGrowthMin] = useState<string>('');
  const [potGrowthMax, setPotGrowthMax] = useState<string>('');
  const [potMarginMin, setPotMarginMin] = useState<string>('');
  const [potMarginMax, setPotMarginMax] = useState<string>('');
  const [potAudience, setPotAudience] = useState<string>('Any');
  const [potSort, setPotSort] = useState<string>('default');
  const [potFoundedFrom, setPotFoundedFrom] = useState<string>('');
  const [potFoundedTo, setPotFoundedTo] = useState<string>('');
  const [potCatExpanded, setPotCatExpanded] = useState(false);

  // TrustMRR live data
  const [trustmrrStartups, setTrustmrrStartups] = useState<any[]>([]);
  const [trustmrrLoading, setTrustmrrLoading] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(100);

  // Reset infinite scroll on filter changes
  useEffect(() => {
    setDisplayLimit(100);
  }, [potCat, potRevMin, potRevMax, potMrrMin, potMrrMax, potGrowthMin, potGrowthMax, potMarginMin, potMarginMax, potAudience, potFoundedFrom, potFoundedTo, potSort]);

  const observerRef = React.useRef<IntersectionObserver | null>(null);
  const loadMoreRef = React.useCallback((node: HTMLDivElement | null) => {
    if (trustmrrLoading) return;
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setDisplayLimit(prev => prev + 100);
      }
    });
    if (node) observerRef.current.observe(node);
  }, [trustmrrLoading]);

  const refreshAssets = () => {
    api.getProjects().then(data => {
      if (Array.isArray(data) && data.length > 0) {
        setAssets(data.map(mapApiProject));
      }
    }).catch(() => { });
  };

  useEffect(() => {
    refreshAssets();
    // Fetch TrustMRR startups
    setTrustmrrLoading(true);
    api.getTrustMRRStartups().then(res => {
      setTrustmrrStartups(res.data || []);
    }).catch(() => { }).finally(() => setTrustmrrLoading(false));
  }, []);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filterStatus !== 'All') n++;
    if (filterApyMin || filterApyMax) n++;
    if (filterAmountMin || filterAmountMax) n++;
    return n;
  }, [filterStatus, filterApyMin, filterApyMax, filterAmountMin, filterAmountMax]);

  const filteredAssets = useMemo(() => {
    const statusPriority: Record<string, number> = {
      'Fundraising': 0, 'Ending Soon': 0,
      'Funded': 1, 'Sold Out': 1,
      'Failed': 2,
    };
    let list = [...assets];

    // status filter
    if (filterStatus !== 'All') list = list.filter(a => a.status === filterStatus || (filterStatus === 'Fundraising' && a.status === 'Ending Soon'));
    // APY filter
    if (filterApyMin) list = list.filter(a => a.apy >= Number(filterApyMin));
    if (filterApyMax) list = list.filter(a => a.apy <= Number(filterApyMax));
    // Amount filter (targetAmount in $)
    if (filterAmountMin) list = list.filter(a => a.targetAmount >= Number(filterAmountMin) * 1000);
    if (filterAmountMax) list = list.filter(a => a.targetAmount <= Number(filterAmountMax) * 1000);

    // sort
    if (sortBy === 'default') {
      list.sort((a, b) => {
        const pa = statusPriority[a.status] ?? 9;
        const pb = statusPriority[b.status] ?? 9;
        if (pa !== pb) return pa - pb;
        const progA = a.targetAmount > 0 ? a.raisedAmount / a.targetAmount : 0;
        const progB = b.targetAmount > 0 ? b.raisedAmount / b.targetAmount : 0;
        return progB - progA;
      });
    } else if (sortBy === 'apy_desc') list.sort((a, b) => b.apy - a.apy);
    else if (sortBy === 'apy_asc') list.sort((a, b) => a.apy - b.apy);
    else if (sortBy === 'progress_desc') list.sort((a, b) => (b.raisedAmount / b.targetAmount) - (a.raisedAmount / a.targetAmount));
    else if (sortBy === 'amount_asc') list.sort((a, b) => a.targetAmount - b.targetAmount);

    return list;
  }, [filterStatus, filterApyMin, filterApyMax, filterAmountMin, filterAmountMax, sortBy, assets]);

  const filteredStartups = useMemo(() => {
    return [...trustmrrStartups]
      .filter(s => {
        // Category filter — compare lowercase slugs
        if (potCat !== 'All') {
          if (potCat.toLowerCase() === 'loka') {
            // Special: filter by source
            if (s.source !== 'loka') return false;
          } else {
            const sCat = (s.category || '').toLowerCase().replace(/\s+/g, '-');
            if (sCat !== potCat.toLowerCase()) return false;
          }
        }
        // Revenue (30d) filter
        const rev30 = s.revenue?.last30Days ?? 0;
        if (potRevMin && rev30 < Number(potRevMin)) return false;
        if (potRevMax && rev30 > Number(potRevMax)) return false;
        // MRR filter
        const mrrVal = s.revenue?.mrr ?? 0;
        if (potMrrMin && mrrVal < Number(potMrrMin)) return false;
        if (potMrrMax && mrrVal > Number(potMrrMax)) return false;
        // Growth filter
        const growth = s.growth30d;
        if (potGrowthMin && (growth == null || growth < Number(potGrowthMin))) return false;
        if (potGrowthMax && (growth == null || growth > Number(potGrowthMax))) return false;
        // Profit Margin filter
        const margin = s.profitMarginLast30Days;
        if (potMarginMin && (margin == null || margin < Number(potMarginMin))) return false;
        if (potMarginMax && (margin == null || margin > Number(potMarginMax))) return false;
        // Audience filter
        if (potAudience !== 'Any' && (s.targetAudience || '').toUpperCase() !== potAudience.toUpperCase()) return false;
        // Founded filter
        if (potFoundedFrom || potFoundedTo) {
          const fd = s.foundedDate ? new Date(s.foundedDate).getFullYear() : null;
          if (potFoundedFrom && (fd == null || fd < Number(potFoundedFrom))) return false;
          if (potFoundedTo && (fd == null || fd > Number(potFoundedTo))) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (potSort === 'default') return (a.rank ?? 999999) - (b.rank ?? 999999);
        if (potSort === 'listed-desc') return new Date(b.createdAt || b.foundedDate || '1970').getTime() - new Date(a.createdAt || a.foundedDate || '1970').getTime();
        if (potSort === 'listed-asc') return new Date(a.createdAt || a.foundedDate || '2099').getTime() - new Date(b.createdAt || b.foundedDate || '2099').getTime();
        if (potSort === 'multiple-asc') return (a.multiple ?? 999999) - (b.multiple ?? 999999);
        if (potSort === 'multiple-desc') return (b.multiple ?? -999999) - (a.multiple ?? -999999);
        if (potSort === 'asking-asc') return (a.askingPrice ?? 999999999) - (b.askingPrice ?? 999999999);
        if (potSort === 'asking-desc') return (b.askingPrice ?? -999999999) - (a.askingPrice ?? -999999999);
        if (potSort === 'rev-desc') return (b.revenue?.last30Days ?? 0) - (a.revenue?.last30Days ?? 0);
        if (potSort === 'rev-asc') return (a.revenue?.last30Days ?? 0) - (b.revenue?.last30Days ?? 0);
        if (potSort === 'growth-desc') return (b.growth30d ?? -999) - (a.growth30d ?? -999);
        if (potSort === 'growth-asc') return (a.growth30d ?? 999) - (b.growth30d ?? 999);
        if (potSort === 'founded-desc') return new Date(b.foundedDate || '1970').getTime() - new Date(a.foundedDate || '1970').getTime();
        if (potSort === 'founded-asc') return new Date(a.foundedDate || '2099').getTime() - new Date(b.foundedDate || '2099').getTime();
        return 0;
      });
  }, [trustmrrStartups, potCat, potRevMin, potRevMax, potMrrMin, potMrrMax, potGrowthMin, potGrowthMax, potMarginMin, potMarginMax, potAudience, potFoundedFrom, potFoundedTo, potSort]);

  useEffect(() => {
    const handleOpenAsset = (e: Event) => {
      const customEvent = e as CustomEvent;
      const match = assets.find(a => a.title.includes(customEvent.detail));
      if (match) setSelectedAsset(match);
    };

    window.addEventListener('loka-open-asset', handleOpenAsset);
    return () => window.removeEventListener('loka-open-asset', handleOpenAsset);
  }, [assets]);

  // Handle URL-based detail view logic
  const isDeepLink = location.pathname.startsWith('/market/startup/');
  const deepLinkSlug = isDeepLink ? location.pathname.split('/market/startup/')[1] : null;
  const passedProject = location.state?.project as PotProject | undefined;

  // Helper for formatting numbers
  const formatUsd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
  const formatNum = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}k` : `${v}`;

  // Render detail view if the URL is active
  if (isDeepLink && deepLinkSlug) {
    if (passedProject) {
      return <PotentialProjectDetail project={passedProject} onClose={() => navigate('/market')} />;
    } else {
      // Find and map if deep linked directly without state
      const s = trustmrrStartups.find(x => x.slug === deepLinkSlug);
      if (s) {
        const cat = s.category || 'SaaS';
        const v = getVisual(cat); // Assuming getVisual can handle category strings
        const logo = s.icon ? '' : s.name.substring(0, 2).toUpperCase();
        const mappedProject: PotProject = {
          name: s.name, cat: cat, mapped_cat: cat, tagColor: 'text-gray-700 bg-gray-50 border-gray-100', views: s.visitorsLast30Days != null ? formatNum(s.visitorsLast30Days) : '0', saves: 0,
          desc: s.description || '', rev: formatUsd(s.revenue?.last30Days || 0), revGrow: s.growth30d != null ? (s.growth30d >= 0 ? `↑ ${Math.round(s.growth30d)}%` : `↓ ${Math.abs(Math.round(s.growth30d))}%`) : '', waitlist: String(s.customers || 0),
          tags: [], logo, color: 'from-gray-500 to-gray-700', cover: 'from-gray-900/10 to-transparent', label: '',
          iconUrl: s.icon || undefined, founderAvatarUrl: s.cofounders?.[0]?.avatarUrl || (s.xHandle ? `https://unavatar.io/x/${s.xHandle}` : undefined),
          allTimeRev: formatUsd(s.revenue?.total || 0), mrr: formatUsd(s.revenue?.mrr || 0), founder: s.cofounders?.[0]?.xName || s.xHandle || '—', founderFollowers: s.xHandle ? `@${s.xHandle}` : undefined,
          websiteUrl: s.website || undefined, founded: s.foundedDate ? new Date(s.foundedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Unknown', country: s.country || 'Unknown',
          slug: s.slug || undefined, xFollowerCount: s.xFollowerCount || undefined, profitMargin: s.profitMarginLast30Days != null ? `${Math.round(s.profitMarginLast30Days)}%` : '-',
          rank: s.rank || undefined, multiple: s.multiple || undefined,
          askingPrice: s.askingPrice || undefined,
          customers: s.customers || undefined, growthMRR30d: s.growthMRR30d || undefined,
          targetAudience: s.targetAudience || undefined, paymentProvider: s.paymentProvider || undefined,
          activeSubscriptions: s.activeSubscriptions || undefined,
        };
        return <PotentialProjectDetail project={mappedProject} onClose={() => navigate('/market')} />;
      } else if (trustmrrLoading) {
        return <div className="p-10 text-center text-gray-400">Loading details...</div>;
      }
    }
  }

  if (selectedAsset) {
    return (
      <AssetDetail
        asset={selectedAsset}
        onClose={() => setSelectedAsset(null)}
        onInvested={refreshAssets}
      />
    );
  }

  return (
    <div className="flex-1 space-y-6 animate-fadeIn pb-24 p-4 sm:p-8 md:p-10 lg:p-12 max-w-[1600px] mx-auto w-full bg-gray-100/80">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-[22px] font-semibold text-gray-900">Market</h1>
        <button
          onClick={() => navigate('/enterprise')}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-[#00E676] text-black rounded-xl text-xs font-bold hover:bg-[#00C853] transition-all active:scale-[0.97] whitespace-nowrap"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Apply
        </button>
      </div>

      {/* ── Projects ── */}
      <>
          {/* Top Filter Bar */}
          <div className="space-y-4 mb-8">
            {/* Top row: status chips + filter button + sort */}
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const primaryCats = ['All', 'Loka', 'SaaS', 'AI', 'Health', 'Marketing', 'Content', 'Education'];
                const moreCats = ['E-Commerce', 'Fintech', 'Dev Tools', 'Social Media', 'Sales', 'Security', 'Real Estate', 'Recruiting'];
                const catKeyMap: Record<string, string> = {
                  'All': 'All', 'Loka': 'loka', 'SaaS': 'saas', 'AI': 'artificial-intelligence', 'Health': 'health-fitness', 'Marketing': 'marketing',
                  'Content': 'content-creation', 'Education': 'education', 'E-Commerce': 'ecommerce', 'Fintech': 'fintech',
                  'Dev Tools': 'developer-tools', 'Social Media': 'social-media', 'Sales': 'sales',
                  'Security': 'security', 'Real Estate': 'real-estate', 'Recruiting': 'recruiting',
                };
                // Check if active category is from the "more" list
                const moreKeys = moreCats.map(c => catKeyMap[c]);
                const activeMoreLabel = moreCats.find(c => catKeyMap[c] === potCat);
                return (
                  <div className="flex bg-white p-1 rounded-full border border-gray-100 shadow-sm items-center gap-0.5">
                    {primaryCats.map(cat => {
                      const key = catKeyMap[cat] || cat;
                      const isActive = potCat === key;
                      return (
                        <button
                          key={cat}
                          onClick={() => { setPotCat(key); setPotCatExpanded(false); }}
                          className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all whitespace-nowrap flex items-center gap-1 ${
                            cat === 'Loka'
                              ? isActive
                                ? 'bg-[#00E676] text-black shadow-sm'
                                : 'text-[#00C853] hover:text-black hover:bg-[#00E676]/10'
                              : isActive ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                          }`}
                        >
                          {cat === 'Loka' && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
                          {cat}
                        </button>
                      );
                    })}
                    {/* Active "more" category chip */}
                    {activeMoreLabel && (
                      <button
                        onClick={() => setPotCat('All')}
                        className="px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all whitespace-nowrap bg-gray-900 text-white"
                      >
                        {activeMoreLabel}
                      </button>
                    )}
                    {/* More dropdown trigger — always visible */}
                    <div className="relative">
                      <button
                        onClick={() => setPotCatExpanded(v => !v)}
                        className="px-3 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-gray-900 hover:bg-gray-50 transition-all whitespace-nowrap"
                        title="More categories"
                      >
                        ···
                      </button>
                      {potCatExpanded && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setPotCatExpanded(false)} />
                          <div className="absolute top-full right-0 mt-2 z-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px]">
                            {moreCats.map(cat => {
                              const key = catKeyMap[cat];
                              const isActive = potCat === key;
                              return (
                                <button
                                  key={cat}
                                  onClick={() => { setPotCat(key); setPotCatExpanded(false); }}
                                  className={`w-full text-left px-4 py-2 text-xs font-semibold transition-colors ${isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                                >
                                  {cat}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Filters toggle */}
              <button
                onClick={() => setFiltersOpen(v => !v)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full border text-xs font-bold transition-all ${filtersOpen || (potRevMin || potRevMax || potMrrMin || potMrrMax || potGrowthMin || potGrowthMax || potMarginMin || potMarginMax || potAudience !== 'Any')
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                Filters
                {(potRevMin || potRevMax || potMrrMin || potMrrMax || potGrowthMin || potGrowthMax || potMarginMin || potMarginMax || potAudience !== 'Any') && (
                  <span className="bg-[#00E676] text-black rounded-full w-4 h-4 text-[9px] font-black flex items-center justify-center leading-none">!</span>
                )}
              </button>

              <div className="ml-auto flex items-center gap-2">
                <select value={potSort} onChange={e => setPotSort(e.target.value)} className="text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-1.5 outline-none hover:border-gray-300 transition-all cursor-pointer" style={{ WebkitAppearance: 'menulist', appearance: 'menulist' }}>
                  <option value="default">Best deals (default)</option>
                  <option value="listed-desc">Listed: Newest First</option>
                  <option value="listed-asc">Listed: Oldest First</option>
                  <option value="multiple-asc">Multiple: Low to High</option>
                  <option value="multiple-desc">Multiple: High to Low</option>
                  <option value="asking-asc">Asking Price: Low to High</option>
                  <option value="asking-desc">Asking Price: High to Low</option>
                  <option value="rev-asc">Revenue: Low to High</option>
                  <option value="rev-desc">Revenue: High to Low</option>
                  <option value="growth-asc">Growth: Low to High</option>
                  <option value="growth-desc">Growth: High to Low</option>
                  <option value="founded-asc">Founded: Oldest First</option>
                  <option value="founded-desc">Founded: Newest First</option>
                </select>
              </div>
            </div>

            {/* Expanded filter panel — TrustMRR style */}
            {filtersOpen && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {/* Revenue (30d) */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 tracking-wide mb-2 block">Revenue (last 30 days)</label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">$</span>
                        <input type="number" placeholder="Min" value={potRevMin} onChange={e => setPotRevMin(e.target.value)} className="w-full px-3 pl-6 py-2 text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-all" />
                      </div>
                      <span className="text-gray-300 text-xs font-bold">—</span>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">$</span>
                        <input type="number" placeholder="Max" value={potRevMax} onChange={e => setPotRevMax(e.target.value)} className="w-full px-3 pl-6 py-2 text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-all" />
                      </div>
                    </div>
                  </div>

                  {/* MRR */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 tracking-wide mb-2 block">MRR</label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">$</span>
                        <input type="number" placeholder="Min" value={potMrrMin} onChange={e => setPotMrrMin(e.target.value)} className="w-full px-3 pl-6 py-2 text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-all" />
                      </div>
                      <span className="text-gray-300 text-xs font-bold">—</span>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">$</span>
                        <input type="number" placeholder="Max" value={potMrrMax} onChange={e => setPotMrrMax(e.target.value)} className="w-full px-3 pl-6 py-2 text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-all" />
                      </div>
                    </div>
                  </div>

                  {/* Growth (30d) */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 tracking-wide mb-2 block">Growth (last 30 days)</label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input type="number" placeholder="Min %" value={potGrowthMin} onChange={e => setPotGrowthMin(e.target.value)} className="w-full px-3 py-2 text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-all" />
                      </div>
                      <span className="text-gray-300 text-xs font-bold">—</span>
                      <div className="relative flex-1">
                        <input type="number" placeholder="Max %" value={potGrowthMax} onChange={e => setPotGrowthMax(e.target.value)} className="w-full px-3 py-2 text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-all" />
                      </div>
                    </div>
                  </div>

                  {/* Profit Margin */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 tracking-wide mb-2 block">Profit Margin</label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input type="number" placeholder="Min %" value={potMarginMin} onChange={e => setPotMarginMin(e.target.value)} className="w-full px-3 py-2 text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-all" />
                      </div>
                      <span className="text-gray-300 text-xs font-bold">—</span>
                      <div className="relative flex-1">
                        <input type="number" placeholder="Max %" value={potMarginMax} onChange={e => setPotMarginMax(e.target.value)} className="w-full px-3 py-2 text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-all" />
                      </div>
                    </div>
                  </div>

                  {/* Audience */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 tracking-wide mb-2 block">Audience</label>
                    <select value={potAudience} onChange={e => setPotAudience(e.target.value)} className="w-full px-3 py-2 text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-all cursor-pointer">
                      <option value="Any">Any</option>
                      <option value="B2B">B2B</option>
                      <option value="B2C">B2C</option>
                      <option value="B2B2C">B2B2C</option>
                    </select>
                  </div>

                  {/* Founded */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 tracking-wide mb-2 block">Founded</label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input type="number" placeholder="From (year)" min="2000" max="2030" value={potFoundedFrom} onChange={e => setPotFoundedFrom(e.target.value)} className="w-full px-3 py-2 text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-all" />
                      </div>
                      <span className="text-gray-300 text-xs font-bold">—</span>
                      <div className="relative flex-1">
                        <input type="number" placeholder="To (year)" min="2000" max="2030" value={potFoundedTo} onChange={e => setPotFoundedTo(e.target.value)} className="w-full px-3 py-2 text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-all" />
                      </div>
                    </div>
                  </div>

                  {/* Actions — right-aligned */}
                  <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                    <button onClick={() => { setPotRevMin(''); setPotRevMax(''); setPotMrrMin(''); setPotMrrMax(''); setPotGrowthMin(''); setPotGrowthMax(''); setPotMarginMin(''); setPotMarginMax(''); setPotAudience('Any'); setPotFoundedFrom(''); setPotFoundedTo(''); }} className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors">Clear</button>
                    <button onClick={() => setFiltersOpen(false)} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold">Apply Filters</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Loading & Empty states */}
          {trustmrrLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 bg-gray-100 rounded-full w-3/5" />
                      <div className="h-2.5 bg-gray-100 rounded-full w-2/5" />
                    </div>
                    <div className="h-5 w-14 bg-gray-100 rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-2.5 bg-gray-100 rounded-full w-full" />
                    <div className="h-2.5 bg-gray-100 rounded-full w-4/5" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map(j => (
                      <div key={j} className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                        <div className="h-2 bg-gray-100 rounded-full w-3/4 mx-auto" />
                        <div className="h-3.5 bg-gray-100 rounded-full w-2/3 mx-auto" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!trustmrrLoading && trustmrrStartups.length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm text-gray-400 font-medium">No companies available right now.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStartups
              .slice(0, displayLimit)
              .map((s, i) => {
                // Derive display properties from API data
                const catColors: Record<string, string> = {
                  saas: 'text-violet-700 bg-violet-50 border-violet-100',
                  ai: 'text-blue-700 bg-blue-50 border-blue-100',
                  'health-fitness': 'text-emerald-700 bg-emerald-50 border-emerald-100',
                  marketing: 'text-pink-700 bg-pink-50 border-pink-100',
                  'content-creation': 'text-rose-700 bg-rose-50 border-rose-100',
                  education: 'text-amber-700 bg-amber-50 border-amber-100',
                  ecommerce: 'text-cyan-700 bg-cyan-50 border-cyan-100',
                  fintech: 'text-indigo-700 bg-indigo-50 border-indigo-100',
                  'developer-tools': 'text-sky-700 bg-sky-50 border-sky-100',
                  'social-media': 'text-teal-700 bg-teal-50 border-teal-100',
                };
                const gradients: Record<string, string> = {
                  saas: 'from-violet-400 to-violet-600',
                  ai: 'from-indigo-400 to-blue-600',
                  'health-fitness': 'from-emerald-400 to-emerald-600',
                  marketing: 'from-pink-400 to-pink-600',
                  'content-creation': 'from-rose-400 to-rose-600',
                  education: 'from-amber-400 to-amber-600',
                  ecommerce: 'from-cyan-400 to-blue-500',
                  fintech: 'from-indigo-500 to-purple-600',
                  'developer-tools': 'from-sky-400 to-blue-600',
                  'social-media': 'from-teal-400 to-teal-600',
                };
                const covers: Record<string, string> = {
                  saas: 'from-violet-900/10 to-transparent',
                  ai: 'from-indigo-900/10 to-transparent',
                  'health-fitness': 'from-emerald-900/10 to-transparent',
                  marketing: 'from-pink-900/10 to-transparent',
                  'content-creation': 'from-rose-900/10 to-transparent',
                  education: 'from-amber-900/10 to-transparent',
                };

                const cat = s.category || 'saas';
                const tagColor = catColors[cat] || 'text-gray-700 bg-gray-50 border-gray-100';
                const gradient = gradients[cat] || 'from-gray-400 to-gray-600';
                const cover = covers[cat] || 'from-gray-900/10 to-transparent';
                const logo = (s.name || '??').slice(0, 2);

                // Format revenue based on selected metric & period
                const rev30d = s.revenue?.last30Days ?? 0;
                const revTotal = s.revenue?.total ?? 0;
                const mrr = s.revenue?.mrr ?? 0;
                // API returns growth as percentage values already (e.g. 8.06 = 8%)
                const growthPct = s.growth30d;
                const growthStr = growthPct != null ? (growthPct >= 0 ? `↑ ${Math.round(growthPct)}%` : `↓ ${Math.abs(Math.round(growthPct))}%`) : '';


                // Build tags
                const tags: string[] = [];
                const isLoka = s.source === 'loka' || s.lokaVerified;
                if (isLoka) tags.push('Loka Verified');
                if (s.paymentProvider) tags.push(`Verified ${s.paymentProvider.charAt(0).toUpperCase() + s.paymentProvider.slice(1)}`);
                if (s.targetAudience) tags.push(s.targetAudience.charAt(0).toUpperCase() + s.targetAudience.slice(1));
                if (growthPct != null && growthPct > 50) tags.push('Fast Growing');

                // Label for top performers
                let label = '';
                if (isLoka) label = '✅ Loka';
                else if (s.rank === 1) label = '🏆 #1';
                else if (growthPct != null && growthPct > 100) label = 'Explosive Growth';
                else if (growthPct != null && growthPct > 30) label = 'Trending';

                // Cofounder info — Loka companies use founderName/founderAvatar instead of cofounders array
                const founder = isLoka
                  ? (s.founderName || s.name || '—')
                  : (s.cofounders?.[0]?.xName || s.xHandle || '—');
                const founderAvatar = isLoka
                  ? (s.founderAvatar || null)
                  : (s.cofounders?.[0]?.avatarUrl || (s.xHandle ? `https://unavatar.io/x/${s.xHandle}` : null));
                // MoM Growth = revenue growth (growth30d)
                // Filter extreme values (>200% or <-90%) as unreliable — matches TrustMRR behavior
                const momGrowth = (growthPct != null && growthPct > -90 && growthPct < 200) ? growthPct : null;

                return (
                  <div key={s.slug || i} onClick={() => {
                    // Map TrustMRR data to PotProject format for detail view
                    const mappedProject: PotProject = {
                      name: s.name, cat: cat, mapped_cat: cat, tagColor, views: s.visitorsLast30Days != null ? formatNum(s.visitorsLast30Days) : '0', saves: 0,
                      desc: s.description || '', rev: formatUsd(rev30d), revGrow: growthStr, waitlist: String(s.customers || 0),
                      tags: tags, logo: logo, color: gradient, cover, label,
                      iconUrl: s.icon || undefined,
                      founderAvatarUrl: founderAvatar || undefined,
                      allTimeRev: formatUsd(revTotal), mrr: formatUsd(mrr), founder: founder,
                      founderFollowers: s.xHandle ? `@${s.xHandle}` : undefined,
                      websiteUrl: s.website || undefined,
                      founded: s.foundedDate ? new Date(s.foundedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Unknown',
                      country: s.country || 'Unknown',
                      slug: s.slug || undefined,
                      xFollowerCount: s.xFollowerCount || undefined,
                      profitMargin: s.profitMarginLast30Days != null ? `${Math.round(s.profitMarginLast30Days)}%` : '-',
                      monthlyData: s.revenueHistory || undefined,
                      rank: s.rank || undefined, multiple: s.multiple || undefined,
                      askingPrice: s.askingPrice || undefined,
                      customers: s.customers || undefined, growthMRR30d: s.growthMRR30d || undefined,
                      targetAudience: s.targetAudience || undefined, paymentProvider: s.paymentProvider || undefined,
                      activeSubscriptions: s.activeSubscriptions || undefined,
                    };
                    navigate(`/market/startup/${s.slug}`, { state: { project: mappedProject } });
                  }} className={`bg-white rounded-2xl overflow-hidden border hover:shadow-xl transition-all flex flex-col group cursor-pointer ${isLoka ? 'border-[#00E676]/60 hover:border-[#00C853] ring-1 ring-[#00E676]/20' : 'border-gray-200 hover:border-gray-400'}`}>

                    {/* Card Body */}
                    <div className="p-5 pb-0 flex-1 flex flex-col">
                      {/* Header Row: Logo + Title + Views */}
                      <div className="flex items-start gap-3 mb-2">
                        <div className={`w-12 h-12 bg-gradient-to-br ${gradient} rounded-2xl flex items-center justify-center font-black text-white text-base shadow-md shrink-0 group-hover:scale-105 transition-transform overflow-hidden`}>
                          {s.icon ? (
                            <img src={s.icon} alt={s.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.textContent = logo; }} />
                          ) : logo}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <h4 className="text-[15px] font-bold text-gray-900 leading-snug truncate mb-1">{s.name}</h4>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border leading-none shrink-0 ${tagColor}`}>{cat.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
                            {label && (
                              <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded leading-none shrink-0 tracking-wide">
                                {label}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Views count */}
                        {s.visitorsLast30Days != null && s.visitorsLast30Days > 0 && (
                          <span title="Product Website Visitors (30d)" className="text-[10px] text-gray-400 font-medium flex items-center gap-1 shrink-0 mt-0.5 cursor-help">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            {formatNum(s.visitorsLast30Days)}
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-[12px] text-gray-500 leading-relaxed line-clamp-2 mb-3">
                        {s.description || 'No description available.'}
                      </p>

                      {/* Tags */}
                      {tags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                          {tags.slice(0, 3).map(t => (
                            <span key={t} className={`text-[9px] font-bold px-2 py-0.5 rounded ${t === 'Loka Verified' ? 'text-[#00C853] bg-[#00E676]/10 border border-[#00E676]/30' : 'text-gray-500 bg-gray-50 border border-gray-100'}`}>{t}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bottom Metrics — Revenue / MRR / Growth */}
                    <div className="mt-auto border-t border-gray-100 bg-gray-50/60 px-5 py-3.5 grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-[9px] font-bold text-gray-400 tracking-wide mb-0.5">Revenue (30d)</p>
                        <p className="text-[14px] font-black text-gray-900 leading-tight">{formatUsd(rev30d)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-gray-400 tracking-wide mb-0.5">MRR</p>
                        <p className="text-[14px] font-black text-gray-900 leading-tight">{mrr > 0 ? formatUsd(mrr) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-gray-400 tracking-wide mb-0.5">Growth</p>
                        {momGrowth != null ? (
                          <p className={`text-[14px] font-black leading-tight ${momGrowth >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                            {momGrowth >= 0 ? '↑' : '↓'}{Math.abs(Math.round(momGrowth))}%
                          </p>
                        ) : (
                          <p className="text-[14px] font-black text-gray-300 leading-tight">—</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
          {/* Intersection Observer target for infinite scrolling */}
          {!trustmrrLoading && filteredStartups.length > 0 && (
            <div ref={loadMoreRef} className="py-8 flex justify-center items-center w-full">
              {displayLimit < filteredStartups.length ? (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-500 rounded-full font-bold text-[11px] shadow-sm">
                  <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  Loading more...
                </div>
              ) : (
                <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase border-t border-gray-100 pt-6 mt-2 w-full text-center">End of results</p>
              )}
            </div>
          )}
        </>
    </div>
  );
};

const AssetCard: React.FC<{ asset: MarketAsset; onClick: () => void }> = ({ asset, onClick }) => {
  const progress = Math.min(100, (asset.raisedAmount / asset.targetAmount) * 100);
  // Generate gradient avatar from project name
  const gradients = [
    'from-violet-500 to-indigo-600', 'from-blue-500 to-cyan-500', 'from-emerald-500 to-teal-600',
    'from-rose-500 to-pink-600', 'from-amber-500 to-orange-500', 'from-sky-500 to-blue-600',
  ];
  const grad = gradients[asset.title.charCodeAt(0) % gradients.length];
  const initials = asset.title.split(/[\s-]+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl overflow-hidden border border-gray-200 hover:border-gray-400 hover:shadow-xl transition-all cursor-pointer group flex flex-col h-full"
    >
      {/* Card Body */}
      <div className="p-5 pb-0 flex-1 flex flex-col">
        {/* Header Row: Gradient Avatar + Title */}
        <div className="flex items-start gap-3 mb-2">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-[13px] font-black text-white shadow-sm shrink-0 group-hover:scale-105 transition-transform`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-start justify-between gap-2 mb-0.5">
              <h4 className="text-[15px] font-bold text-gray-900 leading-snug truncate">{asset.title}</h4>

              {/* Status Badge moved to top right */}
              {asset.status === 'Failed' ? (
                <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border leading-none shrink-0 text-gray-500 bg-gray-50 border-gray-200 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  Failed
                </span>
              ) : asset.status === 'Funded' || asset.status === 'Sold Out' ? (
                <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border leading-none shrink-0 text-gray-700 bg-gray-50 border-gray-200 shadow-sm">
                  <svg className="w-2.5 h-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  {asset.status}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full border leading-none shrink-0 text-emerald-700 bg-emerald-50 border-emerald-200 shadow-sm">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  Fundraising
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] font-medium text-gray-400">{asset.issuer}</span>
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-[12px] text-gray-500 leading-relaxed line-clamp-2 mb-3">
          {asset.subtitle}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded">Cash Flow</span>
          <span className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded">{asset.verifiedSource || 'Verified'}</span>
          {asset.durationDays && <span className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded">{asset.durationDays}d Term</span>}
        </div>
      </div>

      {/* Bottom Section — Metrics + Progress */}
      <div className="mt-auto border-t border-gray-100 bg-gray-50/60 px-5 py-3.5 space-y-3">
        {/* Metrics Row */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[9px] font-bold text-gray-400 tracking-wide mb-0.5">Target</p>
            <p className="text-[14px] font-black text-gray-900 leading-tight">${(asset.targetAmount / 1000).toFixed(0)}k</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-gray-400 tracking-wide mb-0.5 flex items-center gap-1"><svg fill="currentColor" viewBox="0 0 20 20" className="w-2.5 h-2.5 text-[#00E676]"><path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.381z" /></svg>APY</p>
            <p className="text-[14px] font-black text-[#00E676] leading-tight">{asset.apy}%</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-gray-400 tracking-wide mb-0.5">Backers</p>
            <p className="text-[14px] font-black text-gray-900 leading-tight">{asset.backersCount}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${asset.status === 'Failed' ? 'bg-red-400' : 'bg-[#00E676]'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px]">
            <p className="font-bold text-gray-700">${asset.raisedAmount.toLocaleString()} <span className="font-medium text-gray-400">pledged</span></p>
            <div className="flex items-center gap-2">
              {asset.status === 'Fundraising' && asset.daysLeft != null && (
                <span className="text-orange-500 font-bold bg-orange-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {asset.daysLeft}d left
                </span>
              )}
              <p className="font-bold text-gray-400">{progress.toFixed(0)}%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AssetDetail: React.FC<{ asset: MarketAsset; onClose: () => void; onInvested?: () => void }> = ({ asset, onClose, onInvested }) => {
  const [activeTab, setActiveTab] = useState<'STORY' | 'AGREEMENT' | 'FINANCIALS'>('STORY');
  const [pledgeAmount, setPledgeAmount] = useState<string>('');
  const [investing, setInvesting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [investError, setInvestError] = useState<string | null>(null);
  const [investSuccess, setInvestSuccess] = useState<string | null>(null);
  const [repaymentSchedule, setRepaymentSchedule] = useState<RepaymentSchedule[]>([]);
  const [repaymentLoading, setRepaymentLoading] = useState(false);
  const progress = Math.min(100, (asset.raisedAmount / asset.targetAmount) * 100);
  const allTimeRevenue = asset.monthlyRevenue.reduce((sum, m) => sum + m.amount, 0);
  const mrr = asset.monthlyRevenue[asset.monthlyRevenue.length - 1]?.amount || 0;

  const canInvest = ['Fundraising', 'Ending Soon'].includes(asset.status);
  const isFunded = ['Funded', 'Sold Out'].includes(asset.status);

  // Fetch repayment schedule for funded projects
  useEffect(() => {
    if (!isFunded) return;
    setRepaymentLoading(true);
    api.getRepaymentSchedule(asset.id).then(data => {
      if (Array.isArray(data)) setRepaymentSchedule(data);
    }).catch(() => { }).finally(() => setRepaymentLoading(false));
  }, [asset.id, isFunded]);

  const handleInvest = async () => {
    const amount = parseFloat(pledgeAmount);
    if (!amount || amount <= 0) { setInvestError('Please enter a valid amount'); return; }
    if (amount < 10) { setInvestError('Minimum investment is $10'); return; }
    if (amount > asset.remainingCap) { setInvestError(`Max available: $${asset.remainingCap.toLocaleString()}`); return; }

    setInvesting(true);
    setInvestError(null);
    setInvestSuccess(null);
    try {
      const result = await api.investInProject(asset.id, amount);
      setInvestSuccess(`Successfully invested $${amount.toLocaleString()}!`);
      setPledgeAmount('');
      // Update the asset in place so progress bar reflects changes
      asset.raisedAmount = result.project.raisedAmount;
      asset.remainingCap = result.project.remainingCap;
      asset.status = result.project.status;
      onInvested?.();
    } catch (err: any) {
      setInvestError(err.message || 'Investment failed');
    } finally {
      setInvesting(false);
    }
  };

  const handleRevoke = async () => {
    if (!confirm('Are you sure you want to revoke your investment?')) return;
    setRevoking(true);
    setInvestError(null);
    setInvestSuccess(null);
    try {
      const result = await api.revokeInvestment(asset.id);
      setInvestSuccess(`Refunded $${result.refundAmount.toLocaleString()}`);
      asset.raisedAmount = result.project.raisedAmount;
      asset.remainingCap = result.project.remainingCap;
      asset.status = result.project.status;
      onInvested?.();
    } catch (err: any) {
      setInvestError(err.message || 'Revocation failed');
    } finally {
      setRevoking(false);
    }
  };

  const handleAddToChat = () => {
    sessionStorage.setItem('pending_chat_agent', asset.title);
    window.dispatchEvent(new CustomEvent('loka-nav-chat'));
    window.dispatchEvent(new CustomEvent('loka-set-chat-agent', { detail: asset.title }));
  };

  return (
    <div className="animate-fadeIn pb-32 p-4 sm:p-6 md:p-10 lg:p-12 max-w-[1100px] mx-auto w-full min-h-full">
      {/* Back Navigation */}
      <button onClick={onClose} className="flex items-center gap-2 text-[12px] font-bold text-gray-400 hover:text-black transition-colors group mb-6 sm:mb-8">
        <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Market
      </button>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row gap-4 sm:gap-6 md:items-start justify-between mb-6">
        <div className="flex gap-3 sm:gap-6 items-start">
          <img src={asset.coverImage} className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-2xl object-cover border border-gray-100 shadow-sm shrink-0" alt={asset.title} />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl md:text-4xl font-black text-black tracking-tight mb-2 sm:mb-3 truncate sm:whitespace-normal" title={asset.title}>{asset.title}</h1>
            <p className="text-[12px] sm:text-[14px] text-gray-500 font-medium leading-relaxed max-w-2xl line-clamp-2 sm:line-clamp-none" title={asset.subtitle}>
              {asset.subtitle}
            </p>
          </div>
        </div>

        <div className="flex gap-2 sm:gap-3 shrink-0">
          <button className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-white border border-gray-200 text-black rounded-xl font-bold text-xs sm:text-sm hover:bg-gray-50 hover:border-black transition-all shadow-sm h-fit">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
            <span className="hidden sm:inline">Share</span>
          </button>
          <button onClick={handleAddToChat} className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-2.5 bg-black text-white rounded-xl font-bold text-xs sm:text-sm hover:bg-gray-800 transition-all shadow-md active:scale-[0.98] h-fit">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            <span className="hidden sm:inline">Add to</span> Chat
          </button>
        </div>
      </div>

      {/* Progress Bar / Funded Banner Section */}
      {isFunded ? (
        /* ── Fully Funded Banner ── */
        <div className="mb-6 sm:mb-10 rounded-xl overflow-hidden border border-emerald-100">
          {/* Top strip */}
          <div className="bg-emerald-500 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-white font-bold text-xs tracking-wide">Fully Funded</span>
            </div>
            <span className="text-emerald-100 text-[10px] font-bold tracking-widest uppercase">Awaiting Returns</span>
          </div>
          {/* Stats row */}
          <div className="bg-white px-6 py-5 grid grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">Total Raised</p>
              <p className="text-xl sm:text-2xl font-black text-black tracking-tight">${asset.raisedAmount.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400 font-medium">of ${(asset.targetAmount / 1000).toFixed(0)}k target</p>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">Funded</p>
              <p className="text-xl sm:text-2xl font-black text-emerald-500 tracking-tight">{progress.toFixed(1)}%</p>
              <p className="text-[10px] text-gray-400 font-medium">of goal reached</p>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">Backers</p>
              <p className="text-xl sm:text-2xl font-black text-black tracking-tight">{asset.backersCount}</p>
              <p className="text-[10px] text-gray-400 font-medium">investors backed</p>
            </div>
          </div>
        </div>
      ) : asset.status === 'Failed' ? (
        /* ── Failed Banner ── */
        <div className="mb-6 sm:mb-10 rounded-xl overflow-hidden border border-gray-100">
          <div className="bg-gray-100 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-gray-700 font-bold text-xs tracking-wide">Fundraising Failed</span>
            </div>
            <span className="text-gray-400 text-[10px] font-bold tracking-widest uppercase">Refunded</span>
          </div>
          <div className="bg-white px-6 py-5 grid grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">Total Raised</p>
              <p className="text-xl sm:text-2xl font-black text-gray-700 tracking-tight">${asset.raisedAmount.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400 font-medium">of ${(asset.targetAmount / 1000).toFixed(0)}k target</p>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">Shortfall</p>
              <p className="text-xl sm:text-2xl font-black text-gray-500 tracking-tight">${(asset.targetAmount - asset.raisedAmount).toLocaleString()}</p>
              <p className="text-[10px] text-gray-400 font-medium">below goal · {progress.toFixed(1)}% reached</p>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">Backers</p>
              <p className="text-xl sm:text-2xl font-black text-gray-700 tracking-tight">{asset.backersCount}</p>
              <p className="text-[10px] text-gray-400 font-medium">pledges refunded</p>
            </div>
          </div>
        </div>
      ) : (
        /* ── Progress Bar (Fundraising) ── */
        <div className="mb-6 sm:mb-10 flex flex-col md:flex-row items-stretch md:items-center gap-4 sm:gap-8 bg-white border border-gray-100 rounded-xl p-4 sm:p-6 hover:shadow-md transition-all">
          <div className="flex-1 w-full space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Campaign Progress</p>
              <p className="text-[12px] font-bold text-black">{progress.toFixed(1)}% <span className="text-gray-400 font-medium">Funded</span></p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#00E676] transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[10px] font-medium text-gray-400 whitespace-nowrap">12 Days Left</p>
            </div>
          </div>

          <div className="hidden md:block w-px h-10 bg-gray-100" />

          <div className="flex items-center gap-6 sm:gap-8 shrink-0 flex-wrap">
            <div className="space-y-0.5">
              <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">Pledged</p>
              <div className="flex items-baseline gap-1">
                <p className="text-xl sm:text-2xl font-black text-black tracking-tight">${asset.raisedAmount.toLocaleString()}</p>
                <p className="text-sm font-bold text-gray-400">/ ${(asset.targetAmount / 1000).toFixed(0)}k</p>
              </div>
            </div>
            <div className="space-y-0.5">
              <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">Backers</p>
              <p className="text-xl sm:text-2xl font-black text-black tracking-tight">{asset.backersCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* Primary Metrics Grid (4 Cards) — DS: rounded-xl */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <div className="p-3 sm:p-5 bg-white border border-gray-100 rounded-xl hover:shadow-md hover:border-gray-200 transition-all">
          <div className="flex items-center gap-1.5 mb-2 sm:mb-3">
            <p className="text-[10px] sm:text-[11px] font-bold text-gray-400">All-time Revenue</p>
          </div>
          <p className="text-lg sm:text-2xl font-black text-black mb-1 truncate" title={`$${allTimeRevenue.toLocaleString()}`}>${allTimeRevenue.toLocaleString()}</p>
          <p className="text-[9px] sm:text-[10px] text-gray-400 font-medium truncate">Coverage: {asset.coverageRatio}x</p>
        </div>

        <div className="p-3 sm:p-5 bg-white border border-gray-100 rounded-xl hover:shadow-md hover:border-gray-200 transition-all">
          <div className="flex items-center gap-1.5 mb-2 sm:mb-3">
            <p className="text-[10px] sm:text-[11px] font-bold text-gray-400">MRR (verified)</p>
            <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <p className="text-lg sm:text-2xl font-black text-black mb-1 truncate">${mrr.toLocaleString()}</p>
          <p className="text-[9px] sm:text-[10px] text-gray-400 font-medium truncate" title={asset.verifiedSource}>{asset.verifiedSource}</p>
        </div>

        <div className="p-3 sm:p-5 bg-white border border-gray-100 rounded-xl hover:shadow-md hover:border-gray-200 transition-all">
          <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 mb-2 sm:mb-3">Issuer</p>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden shrink-0 border border-gray-200">
              <img src={asset.issuerLogo} className="w-full h-full object-cover" />
            </div>
            <p className="text-xs sm:text-sm font-bold text-black truncate" title={asset.issuer}>{asset.issuer}</p>
            <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          </div>
        </div>

        <div className="p-3 sm:p-5 bg-white border border-gray-100 rounded-xl hover:shadow-md hover:border-gray-200 transition-all">
          <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 mb-2 sm:mb-3">Yield</p>
          <p className="text-lg sm:text-2xl font-black text-[#00E676]">{asset.apy}% APY</p>
          <p className="text-[9px] sm:text-[10px] text-gray-400 font-medium mt-1">{asset.durationDays}d lock-up term</p>
        </div>
      </div>

      {/* Navigation Tabs — DS Type B Underline */}
      <div className="flex items-center gap-6 border-b border-gray-100 mt-8 sm:mt-10 mb-6 overflow-x-auto">
        {[
          { id: 'STORY', label: 'Background' },
          { id: 'FINANCIALS', label: 'Financial Health' },
          { id: 'AGREEMENT', label: 'Rules' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap -mb-px ${activeTab === tab.id
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="py-6">
        {activeTab === 'STORY' && (
          <div className="space-y-12 animate-fadeIn">
            {/* 1. Issuer Profile */}
            <section className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 pb-6 border-b border-gray-100/50">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <img src={asset.issuerLogo} className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl object-cover border border-gray-100 shadow-sm shrink-0" />
                <div className="min-w-0">
                  <h4 className="text-base sm:text-xl font-black tracking-tight text-black flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <span className="truncate max-w-[150px] sm:max-w-none" title={asset.issuer}>{asset.issuer}</span>
                    <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-[8px] text-white italic shadow-sm">✓</div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 leading-none ml-1 flex items-center gap-1 text-gray-500">
                      {asset.issuer === 'ComputeDAO LLC' ? <><Icons.Crown className="w-2.5 h-2.5 text-amber-500" /> 1000+</> : asset.issuer === 'DropStream LLC' ? <><Icons.Diamond className="w-2.5 h-2.5 text-blue-500" /> 500+</> : <><Icons.Compass className="w-2.5 h-2.5 text-emerald-500" /> 200+</>}
                    </span>
                  </h4>
                  <p className="text-[11px] sm:text-[12px] text-gray-400 font-medium truncate" title="Singapore (ACRA ID: 20230812X) • Founded 2023">Singapore (ACRA ID: 20230812X) • Founded 2023</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                {[
                  { label: 'Twitter', icon: '🐦' },
                  { label: 'LinkedIn', icon: '🔗' },
                  { label: 'GitHub', icon: '💻' }
                ].map(social => (
                  <div key={social.label} className="px-2.5 py-1.5 sm:px-3 bg-white hover:bg-gray-50 transition-colors rounded-xl text-[10px] font-bold tracking-tight flex items-center gap-1 sm:gap-1.5 text-gray-600 border border-gray-100 shadow-sm cursor-pointer lg:px-4 lg:py-2">
                    <span>{social.icon}</span>
                    {social.label}
                    <span className="text-[#00E676] text-[10px] ml-1">✓</span>
                  </div>
                ))}
              </div>
            </section>

            {/* 2. Leadership & Backing */}
            <section className="space-y-6">
              <div className="flex items-center gap-4">
                <h3 className="text-base font-bold text-black">Leadership & Backing</h3>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { name: 'Alex Chen', role: 'Chief Executive Officer', extra: 'Ex-AWS Principal Architect', bio: '10+ years scaling global cloud infrastructure.' },
                  { name: 'Sarah Li', role: 'Chief Technology Officer', extra: 'Ex-Stripe Engineering', bio: 'Expert in secure protocol & automated auditing.' }
                ].map((member, i) => (
                  <div key={i} className="flex items-start gap-4 p-5 bg-white border border-gray-100 rounded-3xl shadow-sm hover:border-black/5 transition-all">
                    <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center font-serif italic text-xl text-gray-400">
                      {member.name[0]}
                    </div>
                    <div>
                      <p className="text-[12px] font-black text-black">{member.name}</p>
                      <p className="text-[10px] font-bold text-gray-400 tracking-tighter mb-1">{member.role}</p>
                      <p className="text-[9px] text-blue-500 font-bold tracking-widest mb-2">{member.extra}</p>
                      <p className="text-[11px] text-gray-500 font-light leading-relaxed">{member.bio}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 3. Business Narrative */}
            <section className="space-y-6">
              <h3 className="text-base font-bold text-black">Business Narrative</h3>
              <div className="space-y-6">
                <p className="text-sm text-gray-500 leading-relaxed font-medium">{asset.description}</p>
                <div className="p-6 bg-gray-50/50 rounded-2xl border border-gray-100">
                  <h4 className="text-[11px] font-bold text-gray-400 mb-2">Primary Funding Objective</h4>
                  <p className="text-sm text-black font-medium leading-relaxed">"{asset.useOfFunds || 'Purchasing 8 additional H100 GPUs and pre-paying data center rack fees in Tokyo to expand computing rental capacity.'}"</p>
                </div>
              </div>
            </section>

            {/* 4. Enterprise Insights */}
            <section className="space-y-6 pt-6">
              <div className="flex items-center gap-4">
                <h3 className="text-base font-bold text-black">Enterprise Insights</h3>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                {/* VALUE PROPOSITION */}
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-black tracking-widest text-[#00E676] uppercase">Value Proposition</p>
                    <p className="text-sm font-medium text-gray-700 leading-relaxed">Skip the prompt engineering. Get operator-tested AI configurations that actually ship — with playbooks, tool setups, and step-by-step guides.</p>
                  </div>
                </div>

                {/* TARGET AUDIENCE */}
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-black tracking-widest text-[#00E676] uppercase">Target Audience</p>
                    <p className="text-sm font-medium text-gray-700 leading-relaxed">Entrepreneurs, Content Marketers, Social Media Operators, Creative Directors</p>
                  </div>
                </div>

                {/* PROBLEM SOLVED */}
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-black tracking-widest text-[#00E676] uppercase">Problem Solved</p>
                    <p className="text-sm font-medium text-gray-700 leading-relaxed">Provides pre-built, battle-tested AI configurations to save time on prompt engineering.</p>
                  </div>
                </div>

                {/* BUSINESS DETAILS */}
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-black tracking-widest text-[#00E676] uppercase">Business Details</p>
                    <div className="px-3 py-1 bg-gray-100/80 rounded-lg w-fit text-xs font-black text-gray-600 border border-gray-200/60 shadow-sm">B2C</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5 pt-4">
                {['Artificial Intelligence', 'Marketplace', 'Productivity', 'Marketing', 'Ecommerce'].map(tag => (
                  <span key={tag} className="px-4 py-2 bg-gray-50 border border-gray-100 shadow-sm rounded-xl text-[11px] font-bold text-gray-500 hover:bg-gray-100 hover:text-black transition-colors cursor-pointer">{tag}</span>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'AGREEMENT' && (
          <div className="space-y-12 animate-fadeIn">
            {/* 1. Fundraising Mechanics */}
            <section className="space-y-6">
              <h3 className="text-base font-bold text-black">Campaign Rules & Mechanics</h3>
              <div className="p-4 sm:p-8 bg-white border border-gray-100 rounded-2xl sm:rounded-3xl shadow-sm space-y-6 sm:space-y-8">
                {/* Visual Timeline */}
                <div className="relative pt-6 pb-2">
                  {/* Background Bar */}
                  <div className="absolute top-8 left-[16%] right-[16%] h-1 bg-gray-100 rounded-full" />
                  {/* Progress Bar */}
                  <div className="absolute top-8 left-[16%] h-1 bg-[#00E676] transition-all duration-1000 rounded-full" style={{ width: `${progress * 0.68}%` }} />

                  <div className="relative flex justify-between z-10 w-full">
                    {/* Step 1 */}
                    <div className="flex flex-col items-center w-1/3 text-center space-y-3">
                      <div className="w-5 h-5 rounded-full bg-white border-4 border-gray-200 shadow-sm relative">
                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[9px] font-black  tracking-widest text-gray-400 whitespace-nowrap">Start</span>
                      </div>
                      <div>
                        <h4 className="text-[11px] font-black  tracking-widest text-black mb-1">Fundraising</h4>
                        <p className="text-[10px] text-gray-500 font-medium px-2 leading-relaxed">Freely deposit or withdraw USDC.</p>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex flex-col items-center w-1/3 text-center space-y-3">
                      <div className="w-5 h-5 rounded-full bg-white border-4 border-black shadow-sm relative">
                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[9px] font-black  tracking-widest text-black whitespace-nowrap">${((asset.targetAmount * 0.5) / 1000).toFixed(0)}k</span>
                      </div>
                      <div>
                        <h4 className="text-[11px] font-black  tracking-widest text-black mb-1">Success Point</h4>
                        <p className="text-[10px] text-gray-500 font-medium px-2 leading-relaxed">Goal met. Campaign secures funding.</p>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex flex-col items-center w-1/3 text-center space-y-3">
                      <div className="w-5 h-5 rounded-full bg-white border-4 border-gray-200 shadow-sm relative">
                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[9px] font-black  tracking-widest text-gray-400 whitespace-nowrap">${(asset.targetAmount / 1000).toFixed(0)}k</span>
                      </div>
                      <div>
                        <h4 className="text-[11px] font-black  tracking-widest text-black mb-1">Lock & Deploy</h4>
                        <p className="text-[10px] text-gray-500 font-medium px-2 leading-relaxed">Pool locked immediately. Yield begins.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Conditions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 border-t border-gray-100">
                  <div className="flex gap-4 p-5 bg-green-50/50 rounded-2xl border border-green-100/50">
                    <div className="text-xl" style={{ marginTop: '2px' }}>💸</div>
                    <div>
                      <h4 className="text-[11px] font-black  tracking-widest text-black mb-1">If Campaign Succeeds</h4>
                      <p className="text-[10px] text-gray-500 leading-relaxed font-medium">Funds are locked. Guaranteed payout rules execute to distribute principal and yield (e.g., monthly) direct to wallet.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-5 bg-red-50/40 rounded-2xl border border-red-100/50">
                    <div className="text-xl" style={{ marginTop: '2px' }}>↩️</div>
                    <div>
                      <h4 className="text-[11px] font-black  tracking-widest text-black mb-1">If Campaign Fails</h4>
                      <p className="text-[10px] text-gray-500 leading-relaxed font-medium">Should the soft cap be missed before deadline, automateds auto-refund 100% of participants' capital safety.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Asset Structure Flow */}
            <section className="space-y-8">
              <h3 className="text-base font-bold text-black">Fund Flow & Asset Structure</h3>
              <div className="p-4 sm:p-10 bg-gray-50 rounded-2xl sm:rounded-[32px] border border-gray-100 flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 gap-y-4 sm:gap-y-8 text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4">
                  <div className="px-2 py-0.5 bg-white/80 backdrop-blur rounded text-[9px] font-bold text-gray-400 border border-gray-100">Escrow Agreement</div>
                </div>
                {[
                  'Investors', 'Loka SPV', 'Borrower', 'Purchase H100', 'Revenue Gen', 'Stripe Escrow', 'Auto-Repay'
                ].map((step, i) => (
                  <React.Fragment key={i}>
                    <div className="relative group">
                      <div className={`px-4 py-3 rounded-2xl border shadow-sm transition-all duration-500 flex items-center justify-center min-w-[100px] ${i === 6 ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-100 group-hover:border-black'
                        }`}>
                        <p className="text-[9px] font-black  tracking-widest">{step}</p>
                      </div>
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-bold text-gray-300 italic">Step 0{i + 1}</div>
                    </div>
                    {i < 6 && (
                      <div className="text-gray-300 font-light text-xl animate-pulse">→</div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </section>

            {/* 3. Key Rights & Protections */}
            <section className="space-y-6">
              <h3 className="text-base font-bold text-black">Key Rights & Protections</h3>
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[
                  {
                    icon: '🥇',
                    title: 'Seniority',
                    badge: 'Senior Secured',
                    plainEnglish: 'In the event of liquidation, you are paid back first—before the company’s shareholders.'
                  },
                  {
                    icon: '🛡️',
                    title: 'Structure',
                    badge: 'Bankruptcy Remote',
                    plainEnglish: 'Assets are held in a secure, independent SPV. Even if the parent company fails, your investment remains out of reach for their creditors.'
                  },
                  {
                    icon: '🧱',
                    title: 'Collateral Ratio',
                    badge: '120%-150%',
                    plainEnglish: 'Every $100 lent is backed by up to $150 in expected revenue. Even if earnings drop by 30%, your principal remains secure.'
                  },
                  {
                    icon: '🤖',
                    title: 'Smart Escrow',
                    badge: 'Code Enforced',
                    plainEnglish: 'Revenue is intercepted by SDK and flows directly into secure escrow. It is tamper-proof and automatically distributed at maturity.'
                  }
                ].map((item, i) => (
                  <div key={i} className="group relative bg-white border border-gray-100 p-4 sm:p-6 rounded-2xl sm:rounded-[32px] hover:border-black transition-all duration-300 shadow-sm overflow-hidden h-40 sm:h-48 flex flex-col justify-between">
                    {/* Normal State */}
                    <div className="space-y-3">
                      <div className="text-2xl">{item.icon}</div>
                      <div>
                        <p className="text-[11px] font-bold text-gray-400  tracking-tight">{item.title}</p>
                        <p className="text-sm font-black text-black leading-tight mt-1">{item.badge}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 pt-2 border-t border-gray-50">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#00E676]" />
                      <span className="text-[9px] font-bold text-gray-400  tracking-widest">Active Protection</span>
                    </div>

                    {/* Hover State - Explanation */}
                    <div className="absolute inset-0 bg-black/95 p-3 sm:p-6 flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-4 group-hover:translate-y-0 cursor-default">
                      <p className="text-[13px] text-white font-medium leading-relaxed italic text-center">
                        "{item.plainEnglish}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 3. Documentation */}
            <section className="space-y-6">
              <h3 className="text-base font-bold text-black">Verifiable Documents</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { name: 'Loan_Agreement_v1.pdf', type: 'Framework' },
                  { name: 'UCC-1_Filing_Evidence.pdf', type: 'Collateral' },
                  { name: 'Legal_Compliance_Opinion.pdf', type: 'Audit' },
                  { name: 'SPV_Org_Document.pdf', type: 'Structure' }
                ].map((doc, i) => (
                  <div key={i} className="flex items-center justify-between p-5 bg-white border border-gray-100 rounded-3xl group cursor-pointer hover:border-black transition-all shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all">
                        <Icons.Shield />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold block">{doc.name}</span>
                        <span className="text-[9px] font-medium text-gray-400">{doc.type} Document • 2.4MB</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all text-gray-400">Preview</span>
                      <span className="text-xl">📄</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'FINANCIALS' && (
          <div className="space-y-8 animate-fadeIn">
            {/* Repayment Progress — only for funded projects with schedule data */}
            {isFunded && repaymentSchedule.length > 0 && (() => {
              const paidCount = repaymentSchedule.filter(s => s.status === 'paid').length;
              const overdueCount = repaymentSchedule.filter(s => s.status === 'overdue').length;
              const totalPeriods = repaymentSchedule.length;

              return (
                <section className="space-y-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-base font-bold text-black">Repayment Progress</h3>
                    <span className="text-[11px] font-bold text-gray-400">{paidCount}/{totalPeriods} periods</span>
                    <div className="h-px flex-1 bg-gray-100" />
                    {overdueCount > 0 ? (
                      <span className="px-3 py-1 bg-red-50 text-red-600 text-[10px] font-black rounded-full border border-red-200/50 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                        {overdueCount} Overdue
                      </span>
                    ) : paidCount === totalPeriods ? (
                      <span className="px-3 py-1 bg-green-50 text-green-600 text-[10px] font-black rounded-full border border-green-200/50">✓ Completed</span>
                    ) : (
                      <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black rounded-full border border-blue-200/50">On Track</span>
                    )}
                  </div>

                  {/* Period bars with hover tooltip */}
                  <div className="p-4 sm:p-5 bg-white border border-gray-100 rounded-2xl shadow-sm space-y-3">
                    <div className="flex gap-1">
                      {repaymentSchedule.map((s, i) => {
                        const dueDate = new Date(s.dueDate);
                        const monthLabel = dueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                        const dueDateStr = dueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                        const statusLabel = s.status === 'paid' ? 'Paid' : s.status === 'overdue' ? 'Overdue' : s.status === 'due' ? 'Due' : s.status === 'defaulted' ? 'Defaulted' : 'Upcoming';
                        return (
                          <div
                            key={i}
                            className={`relative h-3 flex-1 rounded-full cursor-pointer transition-all peer ${s.status === 'paid' ? 'bg-green-400 hover:bg-green-500' :
                              s.status === 'overdue' ? 'bg-red-400 animate-pulse hover:bg-red-500' :
                                s.status === 'defaulted' ? 'bg-gray-400 hover:bg-gray-500' :
                                  s.status === 'due' ? 'bg-amber-400 hover:bg-amber-500' :
                                    'bg-gray-200 hover:bg-gray-300'
                              }`}
                            style={{ zIndex: 1 }}
                            onMouseEnter={(e) => {
                              const tip = e.currentTarget.querySelector('[data-tip]') as HTMLElement;
                              if (tip) {
                                tip.style.opacity = '1';
                                // Reposition if overflowing
                                const rect = tip.getBoundingClientRect();
                                if (rect.left < 8) tip.style.transform = `translateX(${8 - rect.left}px)`;
                                else if (rect.right > window.innerWidth - 8) tip.style.transform = `translateX(${window.innerWidth - 8 - rect.right}px)`;
                              }
                            }}
                            onMouseLeave={(e) => {
                              const tip = e.currentTarget.querySelector('[data-tip]') as HTMLElement;
                              if (tip) { tip.style.opacity = '0'; tip.style.transform = ''; }
                            }}
                          >
                            <div data-tip className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 transition-opacity pointer-events-none" style={{ zIndex: 50 }}>
                              <div className="bg-gray-900 text-white rounded-xl px-3 py-2.5 text-[10px] font-medium whitespace-nowrap shadow-lg space-y-1">
                                <p className="font-bold text-[11px]">{monthLabel}</p>
                                <p>Due: {dueDateStr}</p>
                                <p>Amount: ${s.status === 'paid' ? s.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : s.totalDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <p>Status: <span className={
                                  s.status === 'paid' ? 'text-green-400' :
                                    s.status === 'overdue' ? 'text-red-400' :
                                      s.status === 'due' ? 'text-amber-400' :
                                        'text-gray-400'
                                }>{statusLabel}</span></p>
                              </div>
                              <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-4">
                      {[
                        { color: 'bg-green-400', label: 'Paid' },
                        { color: 'bg-amber-400', label: 'Due' },
                        { color: 'bg-red-400', label: 'Overdue' },
                        { color: 'bg-gray-200', label: 'Upcoming' },
                      ].map(l => (
                        <div key={l.label} className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${l.color}`} />
                          <span className="text-[9px] font-bold text-gray-400">{l.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              );
            })()}

            {isFunded && repaymentLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-black rounded-full animate-spin" />
              </div>
            )}

            {/* 1. Live Monitor */}
            <section className="space-y-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-bold text-black">Stripe Connect API Monitor</h3>
                  <div className="bg-blue-50 text-blue-600 text-[9px] font-bold px-3 py-1 rounded-full italic">Read-Only Access</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#00E676] animate-pulse" />
                  <span className="text-[10px] font-bold text-[#00E676]">Oracle Online</span>
                </div>
              </div>

              {/* High Level Metrics — real per-project data */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {[
                  {
                    label: '30d Gross Flow',
                    value: `$${(asset.monthlyRevenue[asset.monthlyRevenue.length - 1]?.amount || 0).toLocaleString()}`,
                    sub: `MoM Growth · ${asset.verifiedSource}`,
                    trend: 'up'
                  },
                  {
                    label: 'Coverage Ratio',
                    value: `${asset.coverageRatio}x`,
                    sub: 'Calculated at Maturity',
                    trend: 'safe'
                  },
                  {
                    label: 'MRR (Verified)',
                    value: `$${mrr.toLocaleString()}`,
                    sub: asset.verifiedSource,
                    trend: 'up'
                  }
                ].map((stat, i) => (
                  <div key={i} className="p-4 sm:p-6 bg-white glass rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                    <p className="text-[10px] font-bold text-gray-400  tracking-widest mb-2 sm:mb-3">{stat.label}</p>
                    <p className="text-xl sm:text-3xl font-black text-black mb-1 tracking-tight">{stat.value}</p>
                    <p className="text-[10px] font-bold text-[#00E676]  tracking-tighter flex items-center gap-1">
                      {stat.trend === 'up' && '▲'} {stat.sub}
                    </p>
                  </div>
                ))}
              </div>

              {/* Detailed Analysis Section */}
              <div className="space-y-6">
                {/* Revenue History Light Area Chart */}
                <div className="bg-white rounded-2xl sm:rounded-[24px] border border-gray-100 p-4 sm:p-8 space-y-6 sm:space-y-8 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-baseline gap-2 sm:gap-3">
                      <h4 className="text-xl sm:text-3xl font-black text-black">${mrr.toLocaleString()}</h4>
                      <p className="text-[#00E676] text-xs font-bold flex items-center gap-1">↑ MRR <span className="text-gray-400 font-medium">· {asset.verifiedSource}</span></p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="px-4 py-2 rounded-xl border border-gray-100 bg-gray-50 text-[11px] font-bold text-gray-600 flex items-center gap-2 cursor-pointer shadow-sm hover:bg-gray-100 transition-colors">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                        Revenue
                        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                      <div className="px-4 py-2 rounded-xl border border-gray-100 bg-gray-50 text-[11px] font-bold text-gray-600 flex items-center gap-2 cursor-pointer shadow-sm hover:bg-gray-100 transition-colors">
                        Last 30 days
                        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>
                  </div>

                  <div className="h-[200px] sm:h-[280px] w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={asset.monthlyRevenue}>
                        <defs>
                          <linearGradient id="colorAmountLight" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="1 6" vertical={false} stroke="#E5E7EB" />
                        <XAxis
                          dataKey="month"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fill: '#9CA3AF', fontWeight: 600 }}
                          dy={10}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fill: '#9CA3AF', fontWeight: 600 }}
                          tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                          width={45}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#ffffff', borderColor: '#E5E7EB', borderRadius: '12px', fontSize: '10px', fontWeight: 'bold', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                          itemStyle={{ color: '#000' }}
                          cursor={{ stroke: '#E5E7EB', strokeWidth: 1, strokeDasharray: '4 4' }}
                        />
                        <Area
                          type="monotone"
                          dataKey="amount"
                          stroke="#3b82f6"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#colorAmountLight)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Concentration Analysis */}
                <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100 space-y-6">
                  <p className="text-sm font-bold text-black border-b border-gray-100 pb-3">Customer Concentration Analysis</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                    {[
                      { label: 'Top 1 Customer', value: '15%', color: 'bg-black' },
                      { label: 'Top 5 Customers', value: '42%', color: 'bg-gray-400' },
                      { label: 'Long-Tail Borrowers', value: '43%', color: 'bg-gray-200' }
                    ].map((item, i) => (
                      <div key={i} className="space-y-3">
                        <div className="flex justify-between text-[11px] font-bold">
                          <span className="text-gray-400">{item.label}</span>
                          <span className="text-black">{item.value}</span>
                        </div>
                        <div className="w-full h-1.5 bg-white rounded-full overflow-hidden border border-gray-100/50">
                          <div className={`h-full ${item.color}`} style={{ width: item.value }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 italic leading-relaxed pt-2">Diversified customer base ensures that if a single client churns, the underlying asset revenue remains robust enough to cover interest payments.</p>
                </div>
              </div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
};

export { AssetDetail, mapApiProject };
export default Market;
