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

// Persist paid plan in localStorage so it survives page refresh without API round-trip.
// Only 'pro' and 'max' are stored — 'free' is the safe default anyway.
function getStoredPlan(): UIPlanTier | null {
    try {
        const v = localStorage.getItem('loka_cached_plan');
        if (v === 'pro' || v === 'max') return v;
        return null;
    } catch { return null; }
}

function saveStoredPlan(p: UIPlanTier) {
    try {
        if (p === 'pro' || p === 'max') {
            localStorage.setItem('loka_cached_plan', p);
        } else {
            localStorage.removeItem('loka_cached_plan');
        }
    } catch { /* ignore */ }
}

let cached: UIPlanTier | null = null;
const listeners = new Set<(p: UIPlanTier) => void>();
let inFlight: Promise<UIPlanTier> | null = null;

function fetchPlan(): Promise<UIPlanTier> {
    if (inFlight) return inFlight;
    if (!api.isAuthenticated) {
        cached = 'guest';
        saveStoredPlan('guest');
        listeners.forEach(l => l('guest'));
        return Promise.resolve('guest' as UIPlanTier);
    }
    inFlight = api.getQuota()
        .then(q => {
            const p = normalizePlan(q?.plan) as UIPlanTier;
            cached = p;
            saveStoredPlan(p);
            listeners.forEach(l => l(p));
            return p;
        })
        .catch(() => {
            cached = cached ?? 'free';
            return cached;
        })
        .finally(() => { inFlight = null; });
    return inFlight;
}

// DEV OVERRIDE: force a specific tier for previewing UI states.
// Set to null to use the real plan from the API.
const DEV_FORCE_PLAN: UIPlanTier | null = null;

export function usePlan(): UIPlanTier {
    const [plan, setPlan] = useState<UIPlanTier>(() => {
        if (DEV_FORCE_PLAN) return DEV_FORCE_PLAN;
        // 1. In-memory cache (same session, already fetched)
        if (cached) return cached;
        // 2. localStorage optimistic value (persists across refreshes, no API wait)
        const stored = getStoredPlan();
        if (stored) return stored;
        // 3. Default: free if token exists, guest if not
        return api.isAuthenticated ? 'free' : 'guest';
    });

    useEffect(() => {
        const onChange = (p: UIPlanTier) => setPlan(p);
        listeners.add(onChange);

        if (cached == null) {
            fetchPlan();
        } else {
            setPlan(cached);
        }

        // Invalidate when subscription changes (e.g. after checkout)
        const onInvalidate = () => { cached = null; inFlight = null; fetchPlan(); };
        window.addEventListener('plan-changed', onInvalidate);

        // Re-fetch when Privy auth becomes available (api.isAuthenticated was false on mount)
        const onAuthReady = () => {
            if (api.isAuthenticated && (!cached || cached === 'guest')) {
                cached = null;
                inFlight = null;
                fetchPlan();
            }
        };
        window.addEventListener('loka-profile-updated', onAuthReady);

        return () => {
            listeners.delete(onChange);
            window.removeEventListener('plan-changed', onInvalidate);
            window.removeEventListener('loka-profile-updated', onAuthReady);
        };
    }, []);

    return DEV_FORCE_PLAN ?? plan;
}
