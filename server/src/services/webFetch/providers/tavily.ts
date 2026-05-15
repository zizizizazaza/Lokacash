/**
 * Tavily `/extract` provider — used as a fallback when Jina returns
 * empty/garbage (rare for SPAs Jina happens to fumble) or when Jina is
 * down. Tavily's extract endpoint takes a URL list and returns clean
 * text per URL. We only ever send one URL per call to keep blame
 * straightforward.
 *
 * Activated only when at least one of `TAVILY_API_KEY` / `TAVILY_API_KEYS`
 * is present in env. Without a key the function returns a `NO_PROVIDER`
 * error and the orchestrator decides what to do (typically: surface the
 * Jina error to the user).
 */
import type { FetchedPage, FetchedPageError } from '../types.js';

const TAVILY_ENDPOINT = 'https://api.tavily.com/extract';

interface TavilyOpts {
  signal?: AbortSignal;
  maxChars?: number;
}

function resolveTavilyKey(): string | null {
  const single = (process.env.TAVILY_API_KEY || '').trim();
  if (single) return single;
  // The aegean stack uses TAVILY_API_KEYS as a comma-separated rotation list.
  // For our occasional fallback we only need one of them — pick the first.
  const list = (process.env.TAVILY_API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list[0] || null;
}

export async function fetchViaTavily(
  rawUrl: string,
  opts: TavilyOpts = {},
): Promise<{ ok: true; page: FetchedPage } | { ok: false; error: FetchedPageError }> {
  const startedAt = Date.now();
  const apiKey = resolveTavilyKey();
  const domain = (() => {
    try { return new URL(rawUrl).hostname; } catch { return ''; }
  })();

  if (!apiKey) {
    return {
      ok: false,
      error: { requestedUrl: rawUrl, domain, code: 'NO_PROVIDER', message: 'Tavily API key not configured' },
    };
  }

  let res: Response;
  try {
    res = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        urls: [rawUrl],
        // Tavily defaults work well — keep request light.
        extract_depth: 'advanced',
      }),
    });
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      error: {
        requestedUrl: rawUrl,
        domain,
        code: aborted ? 'TIMEOUT' : 'UPSTREAM_ERROR',
        message: aborted ? 'Tavily timed out' : `Tavily fetch failed: ${err?.message || err}`,
      },
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: {
        requestedUrl: rawUrl,
        domain,
        code: 'UPSTREAM_ERROR',
        message: `Tavily returned HTTP ${res.status}`,
      },
    };
  }

  let body: any;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { requestedUrl: rawUrl, domain, code: 'UPSTREAM_ERROR', message: 'Tavily returned non-JSON body' },
    };
  }

  // Tavily shape: { results: [{ url, raw_content, ... }], failed_results: [...] }
  const result = (body?.results || [])[0];
  if (!result || typeof result.raw_content !== 'string' || !result.raw_content.trim()) {
    const failure = (body?.failed_results || [])[0];
    return {
      ok: false,
      error: {
        requestedUrl: rawUrl,
        domain,
        code: failure ? 'UPSTREAM_ERROR' : 'NOT_FOUND',
        message: failure?.error || 'Tavily returned no content',
      },
    };
  }

  const raw: string = result.raw_content;
  const SOFT_CAP = opts.maxChars ?? 30_000;
  const sliced = raw.length > SOFT_CAP ? raw.slice(0, SOFT_CAP) : raw;

  return {
    ok: true,
    page: {
      url: result.url || rawUrl,
      requestedUrl: rawUrl,
      title: result.title || domain,
      content: sliced,
      contentLength: raw.length,
      truncated: raw.length > sliced.length,
      durationMs: Date.now() - startedAt,
      provider: 'tavily',
      domain,
      fetchedAt: new Date().toISOString(),
    },
  };
}
