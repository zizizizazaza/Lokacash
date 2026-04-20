import React, { memo, useState } from 'react';

interface SettingsProps {
    onBack?: () => void;
}

const plans = [
    {
        id: 'free' as const,
        name: 'Free',
        monthlyPrice: 0,
        yearlyPrice: 0,
        accent: 'gray' as const,
        searches: { fast: '10 / week', roundtable: '2 / week' },
        extras: ['Unlimited casual chat'],
        cta: null,
    },
    {
        id: 'pro' as const,
        name: 'Pro',
        monthlyPrice: 39,
        yearlyPrice: 389,
        accent: 'pro' as const,
        searches: { fast: '200 / mo', roundtable: '50 / mo' },
        extras: ['Unlimited casual chat', 'Priority response speed'],
        cta: 'Upgrade to Pro',
    },
    {
        id: 'max' as const,
        name: 'Max',
        monthlyPrice: 99,
        yearlyPrice: 987,
        accent: 'max' as const,
        searches: { fast: '500 / mo', roundtable: '150 / mo' },
        extras: ['Unlimited casual chat', 'Priority response speed', 'Early access to new features'],
        cta: 'Upgrade to Max',
    },
];

const ANNUAL_DISCOUNT = 17;

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

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
    const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
    const currentPlan = 'free';

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
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Current usage · Free plan</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Fast */}
                    <div className="flex items-center gap-4 px-5 py-4 bg-white rounded-2xl border border-gray-100">
                        <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center text-green-500 shrink-0">
                            <BoltIcon />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between mb-1.5">
                                <span className="text-[12px] font-semibold text-gray-700">Fast Analysis</span>
                                <span className="text-[12px] font-bold text-gray-900 tabular-nums">6 <span className="text-gray-300 font-normal">/</span> 10</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full" style={{ width: '60%' }} />
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
                                <span className="text-[12px] font-bold text-gray-900 tabular-nums">1 <span className="text-gray-300 font-normal">/</span> 2</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full" style={{ width: '50%' }} />
                            </div>
                        </div>
                    </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-2.5 pl-1">Resets every 7 days from sign-up</p>
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
                            -{ANNUAL_DISCOUNT}%
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
                            {plan.cta && !isCurrent ? (
                                <button
                                    onClick={() => window.dispatchEvent(new CustomEvent('loka-open-modal', { detail: 'deposit' }))}
                                    className={`w-full py-3 rounded-xl text-[13px] font-bold transition-colors active:scale-[0.98] ${style.cta}`}
                                >
                                    {plan.cta}
                                </button>
                            ) : (
                                <div className="w-full py-3 rounded-xl text-[13px] font-medium text-center text-gray-300 border border-dashed border-gray-200">
                                    {isCurrent ? 'Current plan' : 'Free forever'}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

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
