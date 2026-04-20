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
}

/**
 * Renders the Upgrade entry, tiered by the user's current plan:
 *   - free  → primary "Upgrade" CTA (shimmer outline, gradient text)
 *   - pro   → secondary "Go Max →" link (muted; no shimmer, no gradient)
 *   - max   → plan badge (gold crown + "Max"), no upsell copy
 */
export const PlanUpgradeEntry: React.FC<Props> = ({ size = 'md', className = '', onNavigate }) => {
    const plan = usePlan();
    const navigate = useNavigate();

    const go = () => {
        onNavigate?.();
        navigate('/settings');
    };

    const pad = size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-4 py-2 text-[13px]';
    const gap = size === 'sm' ? 'gap-1' : 'gap-2';

    // ── Rail variant: collapsed sidebar, icon-only button with hover tooltip ──
    if (size === 'rail') {
        const tip = plan === 'free' ? 'Upgrade Plan' : plan === 'pro' ? 'Go Max' : 'Max plan';
        const borderColor =
            plan === 'free' ? 'border-gray-300 hover:border-gray-900' :
            plan === 'pro' ? 'border-indigo-200 text-indigo-500 hover:border-indigo-400' :
            'text-[#b45309]';
        const style = plan === 'max'
            ? { borderColor: '#f5d58a', background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 55%, #fff7ed 100%)' }
            : undefined;
        const extra = plan === 'free' ? 'upgrade-shimmer-outline' : '';
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

    if (plan === 'free') {
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

    if (plan === 'pro') {
        return (
            <button
                onClick={go}
                className={`group flex items-center ${gap} ${pad} rounded-xl border border-gray-200 bg-white text-gray-600 font-medium hover:border-gray-400 hover:text-gray-900 transition-colors ${className}`}
                title="You're on Pro — see Max"
            >
                <span className="inline-flex items-center gap-1">
                    <span className="relative flex items-center justify-center w-4 h-4 text-indigo-500"><I.Crown /></span>
                    <span className="text-gray-500 font-semibold tracking-wide text-[10px] uppercase">Pro</span>
                </span>
                <span className="w-px h-3 bg-gray-200" />
                <span className="text-gray-600 group-hover:text-gray-900">Go Max</span>
                <svg className="w-3 h-3 text-gray-400 group-hover:text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
        );
    }

    // plan === 'max'
    return (
        <button
            onClick={go}
            className={`flex items-center ${gap} ${pad} rounded-xl border font-semibold transition-colors ${className}`}
            style={{
                borderColor: '#f5d58a',
                background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 55%, #fff7ed 100%)',
                color: '#b45309',
            }}
            title="You're on Max"
        >
            <span style={{ color: '#e67e22' }}><I.Crown /></span>
            <span>Max</span>
        </button>
    );
};

export default PlanUpgradeEntry;

// Re-export for convenience
export type { PlanTier };
