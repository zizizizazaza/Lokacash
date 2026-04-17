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
        accent: 'gray',
        limits: [
            { label: 'Fast Analysis', value: '10 / week', detail: '≈ 40 per month' },
            { label: 'Multi-Agent', value: '2 / week', detail: '≈ 8 per month' },
        ],
        features: [
            'Unlimited casual chat',
            '10 Fast Analyses per week',
            '2 Multi-Agent Analyses per week',
        ],
        cta: null,
    },
    {
        id: 'pro' as const,
        name: 'Pro',
        monthlyPrice: 29,
        yearlyPrice: 289,
        accent: 'pro',
        limits: [
            { label: 'Fast Analysis', value: '200 / mo', detail: '≈ 50 per week' },
            { label: 'Multi-Agent', value: '50 / mo', detail: '≈ 12 per week' },
        ],
        features: [
            'Unlimited casual chat',
            '200 Fast Analyses per month',
            '50 Multi-Agent Analyses per month',
        ],
        cta: 'Upgrade to Pro',
    },
    {
        id: 'max' as const,
        name: 'Max',
        monthlyPrice: 79,
        yearlyPrice: 787,
        accent: 'max',
        limits: [
            { label: 'Fast Analysis', value: '500 / mo', detail: '≈ 125 per week' },
            { label: 'Multi-Agent', value: '150 / mo', detail: '≈ 37 per week' },
        ],
        features: [
            'Unlimited casual chat',
            '500 Fast Analyses per month',
            '150 Multi-Agent Analyses per month',
        ],
        cta: 'Upgrade to Max',
    },
];

const ANNUAL_DISCOUNT = 17;

const CheckIcon = memo(({ className = '' }: { className?: string }) => (
    <svg className={`w-3.5 h-3.5 shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
));

const accentStyles = {
    gray: {
        card: 'border-gray-200 bg-white',
        limitBg: 'bg-gray-50 border-gray-100',
        check: 'text-gray-300',
        cta: 'bg-white text-gray-700 border border-gray-200 hover:border-gray-400 hover:bg-gray-50',
    },
    pro: {
        card: 'border-gray-200 bg-white hover:border-green-300 hover:shadow-md',
        limitBg: 'bg-gray-50 border-gray-100',
        check: 'text-green-500',
        cta: 'bg-green-500 text-white hover:bg-green-600 shadow-sm',
    },
    max: {
        card: 'border-gray-200 bg-white hover:border-green-300 hover:shadow-md',
        limitBg: 'bg-gray-50 border-gray-100',
        check: 'text-green-500',
        cta: 'bg-gray-900 text-white hover:bg-gray-700 shadow-sm',
    },
};

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
    const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
    const currentPlan = 'free';

    return (
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-8 py-8 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center gap-4 mb-1">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors"
                        title="Back"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                )}
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Choose your plan</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Scale your research with the right analysis power.</p>
                </div>
            </div>

            {/* Usage bars */}
            <div className="mt-8 mb-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-gray-700">Fast Analysis</span>
                        <span className="text-xs font-bold text-gray-900">6 / 10 <span className="font-normal text-gray-400">this week</span></span>
                    </div>
                    <div className="w-full h-2 bg-green-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: '60%' }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">Resets Monday · <span className="text-green-600 font-semibold">4 remaining</span></p>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-gray-700">Multi-Agent Analysis</span>
                        <span className="text-xs font-bold text-gray-900">1 / 2 <span className="font-normal text-gray-400">this week</span></span>
                    </div>
                    <div className="w-full h-2 bg-green-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: '50%' }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">Resets Monday · <span className="text-green-600 font-semibold">1 remaining</span></p>
                </div>
            </div>

            {/* Billing toggle */}
            <div className="flex items-center justify-center mb-8">
                <div className="inline-flex items-center bg-gray-100 rounded-full p-1">
                    <button
                        onClick={() => setBilling('monthly')}
                        className={`text-sm font-semibold px-5 py-2 rounded-full transition-all ${billing === 'monthly'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Monthly
                    </button>
                    <button
                        onClick={() => setBilling('yearly')}
                        className={`text-sm font-semibold px-5 py-2 rounded-full transition-all flex items-center gap-2 ${billing === 'yearly'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Yearly
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            Save {ANNUAL_DISCOUNT}%
                        </span>
                    </button>
                </div>
            </div>

            {/* Plan cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-start">
                {plans.map((plan) => {
                    const isCurrent = plan.id === currentPlan;
                    const price = billing === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
                    const monthlyEquiv = billing === 'yearly' && plan.yearlyPrice > 0
                        ? Math.round((plan.yearlyPrice / 12) * 100) / 100
                        : null;
                    const style = accentStyles[plan.accent as keyof typeof accentStyles];

                    return (
                        <div
                            key={plan.id}
                            className={`relative p-6 rounded-2xl border-2 transition-[border-color,box-shadow] ${style.card}`}
                        >
                            {/* Badge */}
                            {isCurrent && (
                                <div className="absolute -top-3 left-5">
                                    <span className="text-[10px] font-bold px-3 py-1 rounded-full shadow-sm bg-gray-100 text-gray-500">
                                        Current plan
                                    </span>
                                </div>
                            )}

                            {/* Plan name */}
                            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mt-2">{plan.name}</p>

                            {/* Price */}
                            <div className="mt-3 mb-1">
                                {price === 0 ? (
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-4xl font-black text-gray-900">$0</span>
                                        <span className="text-sm text-gray-400 font-medium">forever</span>
                                    </div>
                                ) : billing === 'monthly' ? (
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-4xl font-black text-gray-900">${price}</span>
                                        <span className="text-sm text-gray-400 font-medium">/ mo</span>
                                    </div>
                                ) : (
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-4xl font-black text-gray-900">${price}</span>
                                        <span className="text-sm text-gray-400 font-medium">/ year</span>
                                    </div>
                                )}
                            </div>

                            {/* Monthly equiv for yearly */}
                            {monthlyEquiv ? (
                                <p className="text-xs text-gray-400 mb-5">
                                    <span className="line-through text-gray-300">${plan.monthlyPrice}/mo</span>
                                    {' → '}
                                    <span className="text-green-600 font-semibold">${monthlyEquiv.toFixed(2)}/mo</span>
                                </p>
                            ) : (
                                <p className="text-xs text-gray-400 mb-5">
                                    {price === 0 ? 'No credit card needed' : 'Billed monthly'}
                                </p>
                            )}

                            {/* Limits */}
                            <div className={`rounded-xl mb-5 divide-y divide-gray-100 border ${style.limitBg}`}>
                                {plan.limits.map((limit, i) => (
                                    <div key={i} className="px-4 py-3">
                                        <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5 text-gray-400">{limit.label}</p>
                                        <p className="text-lg font-black text-gray-900">{limit.value}</p>
                                        <p className="text-[10px] text-gray-400">{limit.detail}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Features */}
                            <ul className="space-y-2.5 mb-6">
                                {plan.features.map((feat, i) => (
                                    <li key={i} className="flex items-start gap-2 text-[12px] text-gray-600 leading-tight">
                                        <CheckIcon className={style.check} />
                                        {feat}
                                    </li>
                                ))}
                            </ul>

                            {/* CTA */}
                            {plan.cta && !isCurrent && (
                                <button className={`w-full py-3 rounded-xl text-sm font-bold transition-colors active:scale-[0.98] ${style.cta}`}>
                                    {plan.cta}
                                </button>
                            )}
                            {isCurrent && (
                                <div className="w-full py-3 rounded-xl text-sm font-medium text-center text-gray-400 border border-gray-100 bg-gray-50">
                                    Current plan
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-gray-400 mt-8">
                All plans include unlimited casual chat. Analysis limits reset monthly (Pro & Max) or weekly (Free).
                <br />
                Annual billing saves {ANNUAL_DISCOUNT}%. Cancel anytime.
            </p>
        </div>
    );
};

export default Settings;
