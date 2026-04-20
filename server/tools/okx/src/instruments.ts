import { okxGet } from './okxClient.js';
import type { OkxInstrument } from './types.js';

const TTL_MS = Math.max(60_000, Number(process.env.OKX_INSTRUMENTS_TTL_MS || '86400000')); // 24h

type Cache = {
  spot: Map<string, OkxInstrument>; // key = instId
  swap: Map<string, OkxInstrument>;
  baseSet: Set<string>; // uppercase base currencies listed on SPOT
  loadedAt: number;
};

let cache: Cache | null = null;
let inflight: Promise<Cache> | null = null;

async function loadInstType(instType: 'SPOT' | 'SWAP'): Promise<OkxInstrument[]> {
  try {
    return (await okxGet<OkxInstrument[]>('/api/v5/public/instruments', { instType })) ?? [];
  } catch (err) {
    console.error(`[okx-cli] load instruments ${instType} failed:`, (err as Error)?.message);
    return [];
  }
}

async function rebuild(): Promise<Cache> {
  const [spotRows, swapRows] = await Promise.all([loadInstType('SPOT'), loadInstType('SWAP')]);
  const spot = new Map<string, OkxInstrument>();
  const swap = new Map<string, OkxInstrument>();
  const baseSet = new Set<string>();

  for (const row of spotRows) {
    if (!row?.instId) continue;
    if (row.state && row.state !== 'live') continue;
    spot.set(row.instId, row);
    if (row.baseCcy) baseSet.add(row.baseCcy.toUpperCase());
  }
  for (const row of swapRows) {
    if (!row?.instId) continue;
    if (row.state && row.state !== 'live') continue;
    swap.set(row.instId, row);
  }

  return { spot, swap, baseSet, loadedAt: Date.now() };
}

export async function getInstrumentsCache(): Promise<Cache> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = rebuild()
    .then((c) => {
      cache = c;
      return c;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function isListed(baseCcy: string): Promise<boolean> {
  if (!baseCcy) return false;
  try {
    const c = await getInstrumentsCache();
    return c.baseSet.has(baseCcy.toUpperCase());
  } catch {
    return false;
  }
}

export async function resolveSpotInstId(baseCcy: string, quotePreference = ['USDT', 'USDC', 'USD']): Promise<string | null> {
  const base = (baseCcy || '').toUpperCase();
  if (!base) return null;
  const c = await getInstrumentsCache();
  for (const quote of quotePreference) {
    const id = `${base}-${quote}`;
    if (c.spot.has(id)) return id;
  }
  // fallback: any SPOT pair for this base
  for (const inst of c.spot.values()) {
    if (inst.baseCcy && inst.baseCcy.toUpperCase() === base) return inst.instId;
  }
  return null;
}

export async function resolveSwapInstId(baseCcy: string, quotePreference = ['USDT', 'USDC', 'USD']): Promise<string | null> {
  const base = (baseCcy || '').toUpperCase();
  if (!base) return null;
  const c = await getInstrumentsCache();
  for (const quote of quotePreference) {
    const id = `${base}-${quote}-SWAP`;
    if (c.swap.has(id)) return id;
  }
  for (const inst of c.swap.values()) {
    const parts = inst.instId.split('-');
    if (parts[0] === base && parts[parts.length - 1] === 'SWAP') return inst.instId;
  }
  return null;
}
