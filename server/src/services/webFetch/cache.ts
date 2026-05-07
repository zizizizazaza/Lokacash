/**
 * Tiny in-memory TTL cache for fetched pages. Process-local — cluster
 * deployments will dedupe per-instance, which is plenty for de-risking
 * "user re-asks the same question 30s later". Swap to Redis if we ever
 * need cross-instance dedup.
 */
import type { FetchedPage } from './types.js';

interface Entry {
  value: FetchedPage;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes — long enough to survive a quick retry, short enough to stay fresh
const MAX_ENTRIES = 256;

const store = new Map<string, Entry>();

function evictExpired(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
}

function evictIfFull(): void {
  if (store.size < MAX_ENTRIES) return;
  // Crude FIFO — drop the oldest insertion. Map preserves insertion order.
  const firstKey = store.keys().next().value;
  if (firstKey !== undefined) store.delete(firstKey);
}

export function getCached(url: string): FetchedPage | null {
  const hit = store.get(url);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(url);
    return null;
  }
  return hit.value;
}

export function setCached(url: string, value: FetchedPage): void {
  evictExpired();
  evictIfFull();
  store.set(url, { value, expiresAt: Date.now() + TTL_MS });
}

/** Test-only — wipe the cache between unit tests. */
export function _resetCacheForTests(): void {
  store.clear();
}
