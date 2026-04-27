import { useEffect, useState } from 'react';
import { api } from '../services/api';

export type PlanConfigEntry = {
  fast: number;
  roundtable: number;
  windowDays: number;
  monthlyUsd: number;
  yearlyUsd: number;
};

export type PublicConfig = {
  plans: {
    free: PlanConfigEntry;
    pro: PlanConfigEntry;
    max: PlanConfigEntry;
  };
  guest: {
    enabled: boolean;
    autoLimit: number;
    autoWindowHours: number;
  };
};

// Hardcoded fallbacks so the UI renders sensible numbers *before* the
// fetch resolves. Values should mirror server/.env defaults — if they
// drift, users see stale numbers for a split second on first paint
// but no longer. The backend remains the source of truth.
const FALLBACK: PublicConfig = {
  plans: {
    free: { fast: 10, roundtable: 2, windowDays: 7, monthlyUsd: 0, yearlyUsd: 0 },
    pro: { fast: 200, roundtable: 50, windowDays: 30, monthlyUsd: 39, yearlyUsd: 389 },
    max: { fast: 500, roundtable: 150, windowDays: 30, monthlyUsd: 99, yearlyUsd: 987 },
  },
  guest: { enabled: true, autoLimit: 5, autoWindowHours: 24 },
};

const CACHE_KEY = 'loka_public_config_v1';
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

let memoryCache: PublicConfig | null = null;
let inFlight: Promise<PublicConfig> | null = null;
const listeners = new Set<(c: PublicConfig) => void>();

function readSessionCache(): PublicConfig | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { config: PublicConfig; savedAt: number };
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed.config;
  } catch {
    return null;
  }
}

function writeSessionCache(config: PublicConfig) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ config, savedAt: Date.now() }));
  } catch {
    /* quota exceeded or disabled — fine, we still have memoryCache */
  }
}

async function fetchConfig(): Promise<PublicConfig> {
  if (inFlight) return inFlight;
  inFlight = api.getPublicConfig()
    .then((raw) => {
      // Defensive shape-check; missing fields fall back silently.
      const config: PublicConfig = {
        plans: {
          free: { ...FALLBACK.plans.free, ...(raw.plans?.free || {}) },
          pro: { ...FALLBACK.plans.pro, ...(raw.plans?.pro || {}) },
          max: { ...FALLBACK.plans.max, ...(raw.plans?.max || {}) },
        },
        guest: { ...FALLBACK.guest, ...(raw.guest || {}) },
      };
      memoryCache = config;
      writeSessionCache(config);
      listeners.forEach((l) => l(config));
      return config;
    })
    .catch(() => {
      // Network failure → stay on fallback. Not fatal.
      const c = memoryCache || readSessionCache() || FALLBACK;
      return c;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Returns the live public config (plan quotas, USD pricing, guest settings).
 * Values are cached in memory + sessionStorage for 5 minutes so tab-switching
 * and route changes don't re-hit the network.
 *
 * First render returns hardcoded defaults, then re-renders with live data
 * when the fetch resolves. Call sites can treat it as always-present.
 */
export function usePublicConfig(): PublicConfig {
  const [config, setConfig] = useState<PublicConfig>(() => memoryCache || readSessionCache() || FALLBACK);

  useEffect(() => {
    const onChange = (c: PublicConfig) => setConfig(c);
    listeners.add(onChange);
    if (!memoryCache) fetchConfig();
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return config;
}

/** Force a refetch — call after admin-driven changes or on explicit refresh. */
export function invalidatePublicConfig() {
  memoryCache = null;
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  fetchConfig();
}
