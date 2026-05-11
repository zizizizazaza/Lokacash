/**
 * Phase 2.3 — Structured trace recording.
 *
 * Every agent turn writes a chronological JSON-lines log to disk. Each line
 * is one event (user_message / first_pass_start / narration / tool_call /
 * tool_result / synthesis_start / answer / end / error). The whole sequence
 * is replayable and grep-able, which makes:
 *   - bug debugging        — read the file, see exactly what fired
 *   - quality auditing     — grep across many traces for failure patterns
 *   - training data prep   — convert to (prompt, completion) pairs for fine-tuning
 *   - server restart proof — running turns can be detected on startup
 *
 * File layout: <runsRoot>/<sessionId>/<turnId>.jsonl
 *   - sessionId folder per chat session
 *   - one file per turn (assistant attempt)
 *   - turnId = millisecond timestamp + short random suffix (sortable)
 *
 * Bounded write: a single TraceWriter instance batches up to 10 events
 * before flushing to disk to avoid hammering the filesystem on per-token
 * narration streams. Writes are append-only so partial files survive crashes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const RUNS_ROOT = process.env.AGENT_RUNS_ROOT?.trim() || path.join(process.cwd(), 'runs');

const FLUSH_THRESHOLD = 10;
const FLUSH_IDLE_MS = 200;

export interface TraceEvent {
  type: string;
  ts?: string;
  [key: string]: unknown;
}

function safeId(input: string): string {
  return (input || 'anon').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'anon';
}

function shortRand(): string {
  return Math.random().toString(36).slice(2, 8);
}

export class TraceWriter {
  private filePath: string;
  private queue: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private closed = false;
  private dirEnsured = false;

  constructor(public readonly sessionId: string, public readonly turnId: string) {
    const dir = path.join(RUNS_ROOT, safeId(sessionId));
    this.filePath = path.join(dir, `${safeId(turnId)}.jsonl`);
  }

  static newTurn(sessionId: string): TraceWriter {
    const turnId = `${Date.now().toString(36)}-${shortRand()}`;
    return new TraceWriter(sessionId, turnId);
  }

  private ensureDir(): void {
    if (this.dirEnsured) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      this.dirEnsured = true;
    } catch (err) {
      console.warn('[trace] mkdir failed:', (err as Error).message);
    }
  }

  write(event: TraceEvent): void {
    if (this.closed) return;
    const enriched = { ts: event.ts || new Date().toISOString(), ...event };
    this.queue.push(JSON.stringify(enriched));
    if (this.queue.length >= FLUSH_THRESHOLD) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_IDLE_MS);
  }

  private flush(): void {
    if (this.queue.length === 0) return;
    this.ensureDir();
    const payload = this.queue.join('\n') + '\n';
    this.queue = [];
    try {
      fs.appendFileSync(this.filePath, payload, 'utf8');
    } catch (err) {
      console.warn(`[trace] write failed for ${this.filePath}:`, (err as Error).message);
    }
  }

  close(finalEvent?: TraceEvent): void {
    if (this.closed) return;
    if (finalEvent) {
      this.write(finalEvent);
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
    this.closed = true;
  }

  get path(): string {
    return this.filePath;
  }
}
