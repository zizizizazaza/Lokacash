/**
 * pythonSemaphore.service.ts — global concurrency limit for Python subprocess
 * spawning across the SuperAgent toolchain.
 *
 * Why: every chat turn that touches stocks / financial reports / HSGT flow /
 * deep research / Aegean roundtable spawns a fresh Python process. Each one
 * loads pandas + akshare + numpy and consumes 200-400 MB resident memory for
 * 8-25 seconds. With no concurrency limit, 5-10 simultaneous heavy chats can
 * OOM the entire Node process (especially on a 16 GB box with swap=0).
 *
 * This semaphore caps the global concurrent Python subprocess count.
 * Requests past the cap wait in a FIFO queue. When a slot frees up the head
 * of the queue is auto-resolved.
 *
 * Tunable via env: MAX_CONCURRENT_PYTHON (default 8 for a 4C/16G box).
 *
 * Observability:
 *   - `getStats()` for the in-process counters (live)
 *   - emits the queue position to the caller via the `onQueued` callback so
 *     the chat layer can stream `agent:chat:queued` to the frontend for a
 *     "You're #N in queue" indicator (UI is English-only per product spec).
 */

const DEFAULT_MAX = 8;
const MAX_CAP_FROM_ENV = (() => {
  const raw = process.env.MAX_CONCURRENT_PYTHON;
  if (!raw) return DEFAULT_MAX;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX;
  // Hard ceiling at 32 so a misconfigured env can't bring the box to OOM.
  return Math.min(32, n);
})();

export interface SemaphoreStats {
  max: number;
  inUse: number;
  queued: number;
  peakInUse: number;
  peakQueued: number;
  totalAcquired: number;
  totalReleased: number;
  totalTimedOut: number;
  /** Average wait time (ms) for queued requests, rolling last 50. */
  avgWaitMs: number;
  /** Recent wait samples used for ETA estimation. */
  recentWaitsMs: number[];
}

export interface AcquireOptions {
  /** Fires once with the queue position (1-based) IF this caller had to wait.
   *  Position=1 means "next up". Skipped when slot was available immediately. */
  onQueued?: (position: number, etaMs: number) => void;
  /** Tag used in observability logs (e.g. tool name). */
  tag?: string;
}

export interface AcquireResult {
  /** Call this when the Python subprocess is fully torn down. Idempotent. */
  release: () => void;
  /** Whether this acquire had to wait for an open slot. */
  wasQueued: boolean;
  /** Time spent waiting in queue (0 if immediate). */
  waitedMs: number;
}

class PythonSemaphore {
  private readonly _max: number;
  private _available: number;
  private readonly _waiting: Array<{ resolve: () => void; queuedAt: number; tag?: string }> = [];

  private _peakInUse = 0;
  private _peakQueued = 0;
  private _totalAcquired = 0;
  private _totalReleased = 0;
  private _totalTimedOut = 0;
  private _recentWaitsMs: number[] = [];

  constructor(max: number) {
    this._max = max;
    this._available = max;
  }

  get max(): number {
    return this._max;
  }

  getStats(): SemaphoreStats {
    const sum = this._recentWaitsMs.reduce((a, b) => a + b, 0);
    const avg = this._recentWaitsMs.length > 0 ? Math.round(sum / this._recentWaitsMs.length) : 0;
    return {
      max: this._max,
      inUse: this._max - this._available,
      queued: this._waiting.length,
      peakInUse: this._peakInUse,
      peakQueued: this._peakQueued,
      totalAcquired: this._totalAcquired,
      totalReleased: this._totalReleased,
      totalTimedOut: this._totalTimedOut,
      avgWaitMs: avg,
      recentWaitsMs: [...this._recentWaitsMs],
    };
  }

  /** Estimate wait time (ms) for a hypothetical NEW request entering the queue.
   *  Uses recent avg wait + queue depth. Returns 0 if a slot is immediately
   *  available. */
  estimateWaitMs(): number {
    if (this._available > 0) return 0;
    // Roughly: each queued position adds avgPythonDurationMs / max.
    // We don't know "average Python duration" directly, but it's ~15-25s for
    // most tool spawns. Use 20s as a stable midpoint; observability counters
    // will let us tune this empirically.
    const avgPythonMs = 20_000;
    const positionAhead = this._waiting.length;
    return Math.max(1_000, Math.round((positionAhead + 1) * (avgPythonMs / this._max)));
  }

  /**
   * Acquire a slot. Resolves once a slot is granted (immediately if available,
   * else after queueing). Returns release() — MUST be called when the Python
   * subprocess fully exits, or the slot leaks.
   */
  async acquire(opts: AcquireOptions = {}): Promise<AcquireResult> {
    this._totalAcquired += 1;

    if (this._available > 0) {
      this._available -= 1;
      this._updatePeaks();
      return this.buildAcquireResult(false, 0);
    }

    // No slot: queue + invoke onQueued callback with 1-based position
    const enteredAt = Date.now();
    const positionInLine = this._waiting.length + 1;
    if (opts.onQueued) {
      try {
        const etaMs = this.estimateWaitMs();
        opts.onQueued(positionInLine, etaMs);
      } catch (err) {
        console.warn('[pythonSemaphore] onQueued callback threw:', (err as Error).message);
      }
    }

    if (process.env.PYTHON_SEMAPHORE_VERBOSE === '1') {
      console.log(
        `[pythonSemaphore] QUEUED tag=${opts.tag || '?'} position=${positionInLine} (active=${this._max - this._available}/${this._max}, queued=${this._waiting.length + 1})`,
      );
    }

    await new Promise<void>((resolve) => {
      this._waiting.push({ resolve, queuedAt: enteredAt, tag: opts.tag });
      if (this._waiting.length > this._peakQueued) {
        this._peakQueued = this._waiting.length;
      }
    });

    const waitedMs = Date.now() - enteredAt;
    // Push to rolling window of recent waits (cap 50)
    this._recentWaitsMs.push(waitedMs);
    if (this._recentWaitsMs.length > 50) this._recentWaitsMs.shift();

    // We've been resolved by a release() — slot already decremented by the
    // releaser to prevent double-decrement races.
    this._updatePeaks();
    return this.buildAcquireResult(true, waitedMs);
  }

  private buildAcquireResult(wasQueued: boolean, waitedMs: number): AcquireResult {
    let released = false;
    return {
      wasQueued,
      waitedMs,
      release: () => {
        if (released) return;
        released = true;
        this._totalReleased += 1;
        this._release();
      },
    };
  }

  private _release(): void {
    const next = this._waiting.shift();
    if (next) {
      // Hand the slot directly to the next waiter — DO NOT increment
      // _available, since the slot transfers to the next caller without
      // ever being "free".
      next.resolve();
    } else {
      this._available += 1;
    }
  }

  private _updatePeaks(): void {
    const inUse = this._max - this._available;
    if (inUse > this._peakInUse) this._peakInUse = inUse;
  }

  /** Marks a slot as never returning (Python killed by timeout). Force-releases
   *  to keep throughput moving. */
  forceReleaseForTimeout(): void {
    this._totalTimedOut += 1;
    this._release();
  }
}

export const pythonSemaphore = new PythonSemaphore(MAX_CAP_FROM_ENV);

console.log(
  `[pythonSemaphore] initialized max=${MAX_CAP_FROM_ENV} (env MAX_CONCURRENT_PYTHON=${process.env.MAX_CONCURRENT_PYTHON || 'unset, using default 8'})`,
);

// Periodic observability log — every 60s, if any slot was used in the last
// window, print a one-line status. Helps capacity planning without polling.
setInterval(() => {
  const stats = pythonSemaphore.getStats();
  if (stats.peakInUse === 0 && stats.totalAcquired === 0) return;
  console.log(
    `[pythonSemaphore] status: active=${stats.inUse}/${stats.max} queued=${stats.queued} ` +
    `peakActive=${stats.peakInUse} peakQueued=${stats.peakQueued} ` +
    `totalAcq=${stats.totalAcquired} totalRel=${stats.totalReleased} ` +
    `timedOut=${stats.totalTimedOut} avgWait=${stats.avgWaitMs}ms`,
  );
}, 60_000).unref();

/**
 * Convenience wrapper for the common pattern: acquire, run a function,
 * always release. Adds a hard timeout so a stuck Python subprocess can't
 * hold the slot forever (max 90s default — most legitimate Python tools
 * finish in 25s; anything beyond 90s is treated as dead).
 */
export async function withPythonSlot<T>(
  fn: () => Promise<T>,
  opts: AcquireOptions & { timeoutMs?: number } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const { release, wasQueued, waitedMs } = await pythonSemaphore.acquire(opts);

  if (wasQueued && process.env.PYTHON_SEMAPHORE_VERBOSE === '1') {
    console.log(`[pythonSemaphore] dequeued tag=${opts.tag || '?'} after ${waitedMs}ms wait`);
  }

  let timedOut = false;
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(`pythonSemaphore: hard timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref();
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    if (timedOut) {
      console.error(`[pythonSemaphore] HARD TIMEOUT tag=${opts.tag || '?'} after ${timeoutMs}ms — slot force-released`);
      pythonSemaphore.forceReleaseForTimeout();
    } else {
      release();
    }
  }
}
