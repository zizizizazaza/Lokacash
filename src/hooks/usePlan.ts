import { useEffect, useState } from 'react';
import { api } from '../services/api';

export type PlanTier = 'free' | 'pro' | 'max';
// `guest` is a UI-only tier for unauthenticated users. The backend never
// returns 'guest'; we infer it from api.isAuthenticated being false.
export type UIPlanTier = PlanTier | 'guest';

function normalizePlan(raw: string | undefined | null): PlanTier {
    const v = (raw || '').toLowerCase();
    if (v === 'pro' || v === 'max') return v;
    return 'free';
}

let cached: UIPlanTier | null = null;
const listeners = new Set<(p: UIPlanTier) => void>();
let inFlight: Promise<UIPlanTier> | null = null;

function fetchPlan(): Promise<UIPlanTier> {
    if (inFlight) return inFlight;
    // No token → guest. Skip /subscription/quota which requires auth.
    if (!api.isAuthenticated) {
        cached = 'guest';
        listeners.forEach(l => l('guest'));
        return Promise.resolve('guest' as UIPlanTier);
    }
    inFlight = api.getQuota()
        .then(q => {
            const p = normalizePlan(q?.plan) as UIPlanTier;
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
 * Returns the current user's plan tier, or 'guest' when unauthenticated.
 * Cached across component mounts; refetches on mount if cache is empty.
 * Listen to `plan-changed` CustomEvent on window to invalidate from elsewhere.
 */
// DEV OVERRIDE: force a specific tier for previewing UI states.
// Set to null to use the real plan from the API.
const DEV_FORCE_PLAN: UIPlanTier | null = null;

export function usePlan(): UIPlanTier {
    const [plan, setPlan] = useState<UIPlanTier>(cached ?? (api.isAuthenticated ? 'free' : 'guest'));

    useEffect(() => {
        const onChange = (p: UIPlanTier) => setPlan(p);
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
