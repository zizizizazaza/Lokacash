import React, { memo, useEffect, useMemo, useState } from 'react';
import { usePlan } from '../hooks/usePlan';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { api } from '../services/api';

interface SettingsProps {
    onBack?: () => void;
}

const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, max: 2 };

const CheckIcon = memo(({ className = '' }: { className?: string }) => (
    <svg className={`w-3 h-3 shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
));

/* ── Tiny bolt & circles icons for search-type labels ── */
const BoltIcon = () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
);
const RoundtableIcon = () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" />
        <path d="M12 7.5v4M7 16.5l3-5M17 16.5l-3-5" />
    </svg>
);

const accentStyles = {
    gray: {
        card: 'border-gray-200',
        badge: 'bg-gray-100 text-gray-500',
        check: 'text-gray-300',
        cta: 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300',
        searchBg: 'bg-gray-50',
        searchIcon: 'text-gray-400',
        searchValue: 'text-gray-900',
    },
    pro: {
        card: 'border-gray-200 hover:border-green-200 hover:shadow-lg hover:shadow-green-50',
        badge: 'bg-green-50 text-green-700',
        check: 'text-green-500',
        cta: 'bg-green-500 text-white hover:bg-green-600 shadow-sm shadow-green-200',
        searchBg: 'bg-green-50/50',
        searchIcon: 'text-green-500',
        searchValue: 'text-gray-900',
    },
    max: {
        card: 'border-gray-200 hover:border-gray-400 hover:shadow-lg hover:shadow-gray-100',
        badge: 'bg-gray-900 text-white',
        check: 'text-green-500',
        cta: 'bg-gray-900 text-white hover:bg-gray-800 shadow-sm',
        searchBg: 'bg-gray-50',
        searchIcon: 'text-gray-600',
        searchValue: 'text-gray-900',
    },
};

type UsageSnapshot = {
    kind: 'authed';
    fast: { used: number; limit: number };
    roundtable: { used: number; limit: number };
    resetLabel: string;
} | {
    kind: 'guest';
    autoUsed: number;
    autoLimit: number;
    resetLabel: string;
} | null;

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
    const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
    const [checkoutBusy, setCheckoutBusy] = useState<'pro' | 'max' | null>(null);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const currentPlan = usePlan();
    const config = usePublicConfig();
    const [usage, setUsage] = useState<UsageSnapshot>(null);

    // Fetch the real usage snapshot. Uses /subscription/quota for logged-in
    // users, /guest/quota for guests — both auto-selected by api.isAuthenticated.
    useEffect(() => {
        let cancelled = false;
        const fmtReset = (iso: string | null | undefined): string => {
            if (!iso) return 'auto-renews';
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return 'auto-renews';
            const diffMs = d.getTime() - Date.now();
            if (diffMs <= 0) return 'resetting...';
            const days = Math.floor(diffMs / 86400_000);
            const hours = Math.floor((diffMs % 86400_000) / 3_600_000);
            if (days > 0) return `resets in ${days}d ${hours}h`;
            if (hours > 0) return `resets in ${hours}h`;
            const mins = Math.max(1, Math.floor((diffMs % 3_600_000) / 60_000));
            return `resets in ${mins}m`;
        };
        const load = async () => {
            try {
                if (api.isAuthenticated) {
                    const q = await api.getQuota();
                    if (cancelled) return;
                    setUsage({
                        kind: 'authed',
                        fast: { used: q.fast?.used ?? 0, limit: q.fast?.limit ?? 0 },
                        roundtable: { used: q.roundtable.used, limit: q.roundtable.limit },
                        resetLabel: fmtReset(q.fast?.period?.replace('resets ', '') || q.roundtable?.period?.replace('resets ', '')),
                    });
                } else {
                    const g = await api.getGuestQuota();
                    if (cancelled) return;
                    setUsage({
                        kind: 'guest',
                        autoUsed: g.autoUsed,
                        autoLimit: g.autoLimit,
                        resetLabel: fmtReset(g.resetAt),
                    });
                }
            } catch {
                if (!cancelled) setUsage(null);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    // Derive plan cards + yearly discount from the backend config on every
    // render. Fallbacks inside usePublicConfig ensure sensible numbers even
    // before the first fetch resolves.
    const { plans, annualDiscount } = useMemo(() => {
        const { free, pro, max } = config.plans;
        const computedPlans = [
            {
                id: 'free' as const,
                name: 'Free',
                monthlyPrice: 0,
                yearlyPrice: 0,
                accent: 'gray' as const,
                searches: {
                    fast: `${free.fast} / ${free.windowDays}d`,
                    roundtable: `${free.roundtable} / ${free.windowDays}d`,
                },
                extras: ['Unlimited casual chat'],
                cta: null,
            },
            {
                id: 'pro' as const,
                name: 'Pro',
                monthlyPrice: pro.monthlyUsd,
                yearlyPrice: pro.yearlyUsd,
                accent: 'pro' as const,
                searches: {
                    fast: `${pro.fast} / mo`,
                    roundtable: `${pro.roundtable} / mo`,
                },
                extras: ['Unlimited casual chat', 'Priority response speed'],
                cta: 'Upgrade to Pro',
            },
            {
                id: 'max' as const,
                name: 'Max',
                monthlyPrice: max.monthlyUsd,
                yearlyPrice: max.yearlyUsd,
                accent: 'max' as const,
                searches: {
                    fast: `${max.fast} / mo`,
                    roundtable: `${max.roundtable} / mo`,
                },
                extras: ['Unlimited casual chat', 'Priority response speed', 'Early access to new features'],
                cta: 'Upgrade to Max',
            },
        ];
        const monthlyTotal = pro.monthlyUsd * 12;
        const discount = monthlyTotal > 0
            ? Math.max(0, Math.round((1 - pro.yearlyUsd / monthlyTotal) * 100))
            : 0;
        return { plans: computedPlans, annualDiscount: discount };
    }, [config]);

    const handleUpgrade = async (planId: 'pro' | 'max') => {
        if (checkoutBusy) return;
        // Guest must sign in before Stripe can create a customer for them.
        // Show pricing freely, gate only at the pay step (user's explicit UX choice).
        if (!api.isAuthenticated) {
            window.dispatchEvent(new Event('show-auth-modal'));
            return;
        }
        setCheckoutError(null);
        setCheckoutBusy(planId);
        try {
            const { url } = await api.startCheckout({ plan: planId, billingCycle: billing });
            if (!url) throw new Error('No checkout URL returned');
            window.location.href = url;
        } catch (err) {
            const msg = (err as Error)?.message || 'Checkout failed. Please try again.';
            setCheckoutError(msg);
            setCheckoutBusy(null);
        }
    };

    return (
        <div className="relative w-full min-h-full overflow-auto">
            {/* ── Background: topographic contour pattern ── */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.07]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='600' height='600' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.015' numOctaves='3' seed='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3C/defs%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
                    backgroundSize: '600px 600px',
                }}
            />
            {/* Fade overlay — content area stays clean */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/60 via-transparent to-white/80" />

            {/* ── Content ── */}
            <div className="relative w-full max-w-5xl mx-auto px-4 sm:px-8 py-6 animate-fadeIn">

            {/* ── Section 1: Header ── */}
            <div className="flex items-start gap-4">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="mt-1 w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-900 hover:border-gray-400 transition-colors shrink-0"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                )}
                <div>
                    <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Plan</h1>
                    <p className="text-[13px] text-gray-400 mt-1">Scale your research with the right analysis power.</p>
                </div>
            </div>

            {/* ── Section 2: Current usage ── */}
            <div className="mt-6 mb-8">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">
                    Current usage · {currentPlan === 'guest' ? 'Guest' : currentPlan === 'free' ? 'Free' : currentPlan === 'pro' ? 'Pro' : 'Max'} {currentPlan === 'guest' ? 'mode' : 'plan'}
                </p>
                {usage?.kind === 'guest' ? (
                    <div className="grid grid-cols-1 gap-3">
                        <div className="flex items-center gap-4 px-5 py-4 bg-white rounded-2xl border border-gray-100">
                            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center text-green-500 shrink-0">
                                <BoltIcon />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between mb-1.5">
                                    <span className="text-[12px] font-semibold text-gray-700">Auto turns</span>
                                    <span className="text-[12px] font-bold text-gray-900 tabular-nums">
                                        {usage.autoUsed} <span className="text-gray-300 font-normal">/</span> {usage.autoLimit}
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-green-500 rounded-full"
                                        style={{ width: `${usage.autoLimit > 0 ? Math.min(100, (usage.autoUsed / usage.autoLimit) * 100) : 0}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1 pl-1">
                            Sign in to unlock Fast and Roundtable modes, plus a much higher Auto limit.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Fast */}
                        <div className="flex items-center gap-4 px-5 py-4 bg-white rounded-2xl border border-gray-100">
                            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center text-green-500 shrink-0">
                                <BoltIcon />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between mb-1.5">
                                    <span className="text-[12px] font-semibold text-gray-700">Fast Analysis</span>
                                    <span className="text-[12px] font-bold text-gray-900 tabular-nums">
                                        {usage?.kind === 'authed' ? usage.fast.used : '—'} <span className="text-gray-300 font-normal">/</span> {usage?.kind === 'authed' ? usage.fast.limit : '—'}
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-green-500 rounded-full transition-[width] duration-500"
                                        style={{
                                            width: usage?.kind === 'authed' && usage.fast.limit > 0
                                                ? `${Math.min(100, (usage.fast.used / usage.fast.limit) * 100)}%`
                                                : '0%',
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        {/* Roundtable */}
                        <div className="flex items-center gap-4 px-5 py-4 bg-white rounded-2xl border border-gray-100">
                            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center text-green-500 shrink-0">
                                <RoundtableIcon />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between mb-1.5">
                                    <span className="text-[12px] font-semibold text-gray-700">Multi-Agent Roundtable</span>
                                    <span className="text-[12px] font-bold text-gray-900 tabular-nums">
                                        {usage?.kind === 'authed' ? usage.roundtable.used : '—'} <span className="text-gray-300 font-normal">/</span> {usage?.kind === 'authed' ? usage.roundtable.limit : '—'}
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-green-500 rounded-full transition-[width] duration-500"
                                        style={{
                                            width: usage?.kind === 'authed' && usage.roundtable.limit > 0
                                                ? `${Math.min(100, (usage.roundtable.used / usage.roundtable.limit) * 100)}%`
                                                : '0%',
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <p className="text-[10px] text-gray-400 mt-2.5 pl-1">
                    {usage?.resetLabel || (currentPlan === 'guest' ? 'Resets every 24h' : currentPlan === 'free' ? 'Resets every 7 days from sign-up' : 'Resets every 30 days')}
                </p>
            </div>

            {/* ── Section 3: Billing toggle ── */}
            <div className="flex items-center justify-center mb-6">
                <div className="inline-flex items-center bg-gray-100 rounded-full p-1">
                    <button
                        onClick={() => setBilling('monthly')}
                        className={`text-[13px] font-semibold px-5 py-2 rounded-full transition-all ${billing === 'monthly'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        Monthly
                    </button>
                    <button
                        onClick={() => setBilling('yearly')}
                        className={`text-[13px] font-semibold px-5 py-2 rounded-full transition-all flex items-center gap-2 ${billing === 'yearly'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        Yearly
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            -{annualDiscount}%
                        </span>
                    </button>
                </div>
            </div>

            {/* ── Section 4: Plan cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-stretch">
                {plans.map((plan) => {
                    const isCurrent = plan.id === currentPlan;
                    const price = billing === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
                    const monthlyEquiv = billing === 'yearly' && plan.yearlyPrice > 0
                        ? Math.round((plan.yearlyPrice / 12) * 100) / 100
                        : null;
                    const style = accentStyles[plan.accent];

                    return (
                        <div
                            key={plan.id}
                            className={`relative rounded-2xl border bg-white p-6 transition-all duration-200 flex flex-col ${style.card}`}
                        >
                            {/* Plan name + badge */}
                            <div className="flex items-center gap-2.5 mb-5">
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${style.badge}`}>
                                    {plan.name}
                                </span>
                                {isCurrent && (
                                    <span className="text-[10px] text-gray-400 font-medium">· current</span>
                                )}
                            </div>

                            {/* Price — the visual anchor */}
                            <div className="mb-0.5">
                                {price === 0 ? (
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-[40px] font-black text-gray-900 leading-none tracking-tight">$0</span>
                                    </div>
                                ) : (
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-[40px] font-black text-gray-900 leading-none tracking-tight">${billing === 'monthly' ? price : monthlyEquiv?.toFixed(0)}</span>
                                        <span className="text-sm text-gray-400 font-medium">/ mo</span>
                                    </div>
                                )}
                            </div>
                            <p className="text-[11px] text-gray-400 mb-4">
                                {price === 0
                                    ? 'No credit card needed'
                                    : billing === 'yearly'
                                        ? `$${price} billed annually`
                                        : 'Billed monthly'}
                            </p>

                            {/* Search limits — the key differentiator */}
                            <div className="space-y-2 mb-4">
                                <div className={`flex items-center gap-3 px-3.5 py-3 rounded-xl ${style.searchBg}`}>
                                    <span className={`${style.searchIcon}`}><BoltIcon /></span>
                                    <span className="text-[11px] text-gray-500 flex-1">Fast searches</span>
                                    <span className={`text-[13px] font-bold tabular-nums ${style.searchValue}`}>{plan.searches.fast}</span>
                                </div>
                                <div className={`flex items-center gap-3 px-3.5 py-3 rounded-xl ${style.searchBg}`}>
                                    <span className={`${style.searchIcon}`}><RoundtableIcon /></span>
                                    <span className="text-[11px] text-gray-500 flex-1">Roundtable searches</span>
                                    <span className={`text-[13px] font-bold tabular-nums ${style.searchValue}`}>{plan.searches.roundtable}</span>
                                </div>
                            </div>

                            {/* Extras */}
                            <ul className="space-y-1.5 mb-5">
                                {plan.extras.map((feat, i) => (
                                    <li key={i} className="flex items-center gap-2 text-[11px] text-gray-500">
                                        <CheckIcon className={style.check} />
                                        {feat}
                                    </li>
                                ))}
                            </ul>

                            {/* CTA */}
                            <div className="mt-auto" />
                            {(() => {
                                // Guests are treated like Free users for display purposes — they
                                // can see the real Upgrade buttons. handleUpgrade() intercepts
                                // the click and pops the auth modal before touching Stripe.
                                const effectivePlan: 'free' | 'pro' | 'max' = currentPlan === 'guest' ? 'free' : currentPlan;
                                const rank = PLAN_RANK[plan.id] ?? 0;
                                const curRank = PLAN_RANK[effectivePlan] ?? 0;
                                if (rank === curRank) {
                                    return (
                                        <div className="w-full py-3 rounded-xl text-[13px] font-medium text-center text-gray-500 bg-gray-50 border border-gray-200">
                                            {currentPlan === 'guest' ? 'Sign in to activate' : 'Current plan'}
                                        </div>
                                    );
                                }
                                if (rank < curRank) {
                                    return (
                                        <div className="w-full py-3 rounded-xl text-[13px] font-medium text-center text-gray-300 border border-dashed border-gray-200">
                                            Included in your plan
                                        </div>
                                    );
                                }
                                // rank > curRank — upgrade path (guest falls through too)
                                const isBusy = checkoutBusy === plan.id;
                                const anyBusy = checkoutBusy !== null;
                                return (
                                    <button
                                        onClick={() => handleUpgrade(plan.id as 'pro' | 'max')}
                                        disabled={anyBusy}
                                        className={`w-full py-3 rounded-xl text-[13px] font-bold transition-colors active:scale-[0.98] ${style.cta} ${anyBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    >
                                        {isBusy ? 'Redirecting…' : (plan.cta || `Upgrade to ${plan.name}`)}
                                    </button>
                                );
                            })()}
                        </div>
                    );
                })}
            </div>

            {checkoutError && (
                <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-[12px] text-red-700 text-center">
                    {checkoutError}
                </div>
            )}

            {/* ── Supported payment methods ── */}
            <div className="flex items-center justify-center gap-1.5 mt-8 mb-2">
                <div className="h-6 px-1.5 rounded bg-[#1A1F71] flex items-center justify-center" title="Visa">
                    <img src="/logos/visa.svg" alt="Visa" className="h-2.5" style={{ filter: 'brightness(0) invert(1)' }} />
                </div>
                <div className="h-6 px-0.5 rounded bg-white border border-gray-200 flex items-center justify-center" title="Mastercard">
                    <img src="/logos/mastercard-color.svg" alt="Mastercard" className="h-4" />
                </div>
                <div className="h-6 px-1.5 rounded bg-[#003087] flex items-center justify-center" title="PayPal">
                    <img src="/logos/paypal.svg" alt="PayPal" className="h-2.5" style={{ filter: 'brightness(0) invert(1)' }} />
                </div>
                <div className="h-6 px-0.5 rounded flex items-center justify-center" title="USDC">
                    <img src="/logos/usdc.svg" alt="USDC" className="h-5" />
                </div>
            </div>

            {/* ── Footer ── */}
            <p className="text-center text-[11px] text-gray-400 mt-10">
                All plans include unlimited casual chat. Limits reset every 7 days (Free) or every 30 days (Pro & Max) from activation. Cancel anytime.
            </p>
            </div>
        </div>
    );
};

export default Settings;
