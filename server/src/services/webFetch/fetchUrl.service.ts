/**
 * webFetch orchestrator — the public entry point used by the socket handler.
 *
 * Flow:
 *   1. SSRF guard — reject anything pointing at internal infrastructure.
 *   2. Cache hit — short-circuit if we fetched the same URL recently.
 *   3. Jina Reader — primary path, handles 90% of public web.
 *   4. Tavily extract — fallback for the small set Jina fumbles.
 *   5. Cache the success and return.
 *
 * The orchestrator never throws — every failure mode returns a
 * `FetchedPageError`. Callers use the discriminator on `.ok` to branch.
 */
import { checkUrlSafety } from './ssrf.js';
import { getCached, setCached } from './cache.js';
import { fetchViaJina } from './providers/jina.js';
import { fetchViaTavily } from './providers/tavily.js';
import type { FetchOutcome, FetchedPage } from './types.js';

export interface FetchUrlOptions {
  /** Hard deadline for the whole orchestrator (SSRF + Jina + Tavily fallback). */
  timeoutMs?: number;
  /** Per-page character cap (post-provider). Service may trim further. */
  maxChars?: number;
  /** When true, skip the cache and force a fresh fetch. */
  bypassCache?: boolean;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CHARS = 30_000;

function makeAbort(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(id),
  };
}

export async function fetchUrl(rawUrl: string, opts: FetchUrlOptions = {}): Promise<FetchOutcome> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const domain = (() => {
    try { return new URL(rawUrl).hostname; } catch { return ''; }
  })();

  // 1. SSRF guard.
  const safety = await checkUrlSafety(rawUrl);
  if (!safety.ok) {
    return {
      ok: false,
      error: {
        requestedUrl: rawUrl,
        domain,
        code: rawUrl.startsWith('http') ? 'BLOCKED_HOST' : 'BLOCKED_SCHEME',
        message: safety.reason || 'URL rejected by safety check',
      },
    };
  }

  // 2. Cache lookup.
  if (!opts.bypassCache) {
    const cached = getCached(rawUrl);
    if (cached) {
      // Return the cached value but mark it so the UI can decide whether
      // to flag "served from cache" — useful in dev to verify dedup.
      const replay: FetchedPage = { ...cached, provider: 'cache' };
      return { ok: true, page: replay };
    }
  }

  // 3+4. Provider chain with a single deadline shared between attempts.
  const { signal, cancel } = makeAbort(timeoutMs);
  try {
    const jina = await fetchViaJina(rawUrl, { signal, maxChars });
    if (jina.ok && jina.page.content.trim().length >= 32) {
      setCached(rawUrl, jina.page);
      return jina;
    }

    // Jina failed OR returned an effectively empty page — try Tavily.
    const tavily = await fetchViaTavily(rawUrl, { signal, maxChars });
    if (tavily.ok) {
      setCached(rawUrl, tavily.page);
      return tavily;
    }

    // Both failed — surface the *more specific* error. Tavily's
    // NO_PROVIDER (key missing) is less useful than Jina's real reason.
    if (jina.ok) return tavily; // shouldn't happen given the early return, but type-narrows
    if (jina.error.code !== 'UPSTREAM_ERROR') return jina;
    if (!tavily.ok && tavily.error.code === 'NO_PROVIDER') return jina;
    return tavily;
  } finally {
    cancel();
  }
}

/**
 * Format a fetched page as a markdown block suitable for prepending to a
 * user message. The LLM is told this is auto-fetched context and given
 * the URL + title so it can cite naturally.
 */
export function pageToPromptBlock(page: FetchedPage): string {
  const header = `[Auto-fetched: ${page.title} — ${page.url}]`;
  const note = page.truncated ? '\n[Note: content truncated to fit the prompt budget.]' : '';
  return `${header}\n${page.content}${note}`;
}
