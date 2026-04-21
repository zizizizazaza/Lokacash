import React from 'react';
import { useNavigate } from 'react-router-dom';
import { I } from './Icons';
import { usePlan, type PlanTier } from '../hooks/usePlan';

type Size = 'sm' | 'md' | 'rail';

interface Props {
    /** Size variant — 'sm'=sidebar pill, 'md'=home/chat header, 'rail'=collapsed sidebar icon. */
    size?: Size;
    className?: string;
    /** Close handler (e.g. mobile drawer) invoked alongside navigation. */
    onNavigate?: () => void;
    /** If true, renders nothing when the user is already on Max. */
    hideIfMax?: boolean;
}

/**
 * Renders the Upgrade entry, tiered by the user's current plan:
 *   - free  → primary "Upgrade" CTA (shimmer outline, gradient text)
 *   - pro   → secondary "Go Max →" link (muted; no shimmer, no gradient)
 *   - max   → plan badge (gold crown + "Max"), no upsell copy
 */
export const PlanUpgradeEntry: React.FC<Props> = ({ size = 'md', className = '', onNavigate, hideIfMax = false }) => {
    const plan = usePlan();
    const navigate = useNavigate();

    if (hideIfMax && plan === 'max') return null;

    const go = () => {
        onNavigate?.();
        navigate('/settings');
    };

    const pad = size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-4 py-2 text-[13px]';
    const gap = size === 'sm' ? 'gap-1' : 'gap-2';

    // Guests see the same Upgrade CTA as Free users — they can browse the
    // Settings pricing page, and auth is enforced only at the payment step.
    const tier: 'free' | 'pro' | 'max' = plan === 'guest' ? 'free' : plan;

    // ── Rail variant: collapsed sidebar, icon-only button with hover tooltip ──
    if (size === 'rail') {
        const tip = tier === 'free' ? 'Upgrade Plan' : tier === 'pro' ? 'Go Max' : 'Max plan';
        const borderColor =
            tier === 'free' ? 'border-gray-300 hover:border-gray-900' :
            tier === 'pro' ? 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-900' :
            'text-[#b45309]';
        const style = tier === 'max'
            ? { borderColor: '#f5d58a', background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 55%, #fff7ed 100%)' }
            : undefined;
        const extra = tier === 'free' ? 'upgrade-shimmer-outline' : '';
        return (
            <button
                onClick={go}
                style={style}
                className={`rail-btn w-9 h-7 rounded-md flex items-center justify-center border text-[8px] font-semibold transition-all ${borderColor} ${extra} ${className}`}
            >
                <span className="rail-tip">{tip}</span>
                <I.Crown />
            </button>
        );
    }

    if (tier === 'free') {
        return (
            <button
                onClick={go}
                className={`flex items-center ${gap} ${pad} rounded-xl border border-gray-300 font-semibold hover:border-gray-900 transition-all upgrade-shimmer-outline ${className}`}
            >
                <I.Crown />
                <span>{size === 'sm' ? 'Upgrade' : 'Upgrade Plan'}</span>
                {size === 'md' && (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                )}
            </button>
        );
    }

    if (tier === 'pro') {
        return (
            <button
                onClick={go}
                className={`group flex items-center ${gap} ${pad} rounded-xl border border-gray-200 bg-white font-medium hover:border-[#e0a44a] transition-colors ${className}`}
                style={{ color: '#b45309' }}
                title="Go Max"
            >
                <span style={{ color: '#e67e22' }}><I.Crown /></span>
                <span>Go Max</span>
                <svg className="w-3 h-3 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
        );
    }

    // plan === 'max'
    return (
        <button
            onClick={go}
            className={`max-badge relative flex items-center ${gap} ${pad} rounded-xl border font-semibold overflow-hidden ${className}`}
            title="You're on Max"
        >
            <span aria-hidden className="max-badge-shimmer" />
            <span className="max-badge-icon relative z-[1]"><I.Crown /></span>
            <span className="relative z-[1]">Max</span>
        </button>
    );
};

export default PlanUpgradeEntry;

// Re-export for convenience
export type { PlanTier };
