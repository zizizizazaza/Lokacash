import { useEffect, useState } from 'react';
import { api } from '../services/api';

export type PlanTier = 'free' | 'pro' | 'max';

function normalizePlan(raw: string | undefined | null): PlanTier {
    const v = (raw || '').toLowerCase();
    if (v === 'pro' || v === 'max') return v;
    return 'free';
}

let cached: PlanTier | null = null;
const listeners = new Set<(p: PlanTier) => void>();
let inFlight: Promise<PlanTier> | null = null;

function fetchPlan(): Promise<PlanTier> {
    if (inFlight) return inFlight;
    inFlight = api.getQuota()
        .then(q => {
            const p = normalizePlan(q?.plan);
            cached = p;
            listeners.forEach(l => l(p));
            return p;
        })
        .catch(() => {
            // On failure, default to free (conservative for upsell UI)
            cached = cached ?? 'free';
            return cached;
        })
        .finally(() => { inFlight = null; });
    return inFlight;
}

/**
 * Returns the current user's subscription tier.
 * Cached across component mounts; refetches on mount if cache is empty.
 * Listen to `plan-changed` CustomEvent on window to invalidate from elsewhere.
 */
// DEV OVERRIDE: force a specific tier for previewing UI states.
// Set to null to use the real plan from the API.
const DEV_FORCE_PLAN: PlanTier | null = null;

export function usePlan(): PlanTier {
    const [plan, setPlan] = useState<PlanTier>(cached ?? 'free');

    useEffect(() => {
        const onChange = (p: PlanTier) => setPlan(p);
        listeners.add(onChange);
        if (cached == null) {
            fetchPlan();
        } else {
            setPlan(cached);
        }
        const onInvalidate = () => { cached = null; fetchPlan(); };
        window.addEventListener('plan-changed', onInvalidate);
        return () => {
            listeners.delete(onChange);
            window.removeEventListener('plan-changed', onInvalidate);
        };
    }, []);

    return DEV_FORCE_PLAN ?? plan;
}
