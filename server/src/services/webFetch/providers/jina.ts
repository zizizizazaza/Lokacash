/**
 * Jina Reader (https://r.jina.ai/<url>) provider.
 *
 * Primary path: prepends `https://r.jina.ai/` and GETs the original URL.
 * Jina returns a clean Markdown document with title metadata in headers.
 * Free tier is generous (~500K req/month) and handles SPA/JS rendering,
 * encoding detection, robots.txt compliance, and SSRF — all the boring
 * stuff we'd otherwise have to write ourselves.
 *
 * If `JINA_API_KEY` is set we send it as a Bearer token, which raises
 * the per-key rate limits and unlocks "X-With-Generated-Alt: true" style
 * headers. Anonymous mode also works for low traffic.
 */
import type { FetchedPage, FetchedPageError } from '../types.js';

const JINA_BASE = 'https://r.jina.ai/';

interface JinaOptions {
  /** AbortSignal so the caller can cap total fetch time. */
  signal?: AbortSignal;
  /** Approximate output cap in characters (we trim post-fetch, see service). */
  maxChars?: number;
}

export async function fetchViaJina(
  rawUrl: string,
  opts: JinaOptions = {},
): Promise<{ ok: true; page: FetchedPage } | { ok: false; error: FetchedPageError }> {
  const startedAt = Date.now();
  const apiKey = (process.env.JINA_API_KEY || '').trim();
  const target = `${JINA_BASE}${rawUrl}`;
  const domain = (() => {
    try { return new URL(rawUrl).hostname; } catch { return ''; }
  })();

  const headers: Record<string, string> = {
    Accept: 'text/plain, text/markdown, */*',
    'User-Agent': 'LokaCash-WebFetch/1.0 (+https://lokacash.app)',
    // Ask Jina to keep the response lean and predictable.
    'X-Return-Format': 'markdown',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let res: Response;
  try {
    res = await fetch(target, { method: 'GET', headers, signal: opts.signal });
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      error: {
        requestedUrl: rawUrl,
        domain,
        code: aborted ? 'TIMEOUT' : 'UPSTREAM_ERROR',
        message: aborted ? 'Jina timed out' : `Jina fetch failed: ${err?.message || err}`,
      },
    };
  }

  if (res.status === 404) {
    return { ok: false, error: { requestedUrl: rawUrl, domain, code: 'NOT_FOUND', message: 'Page not found' } };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        requestedUrl: rawUrl,
        domain,
        code: 'UPSTREAM_ERROR',
        message: `Jina returned HTTP ${res.status}`,
      },
    };
  }

  // Jina puts the page title in the first markdown line. We don't try to
  // parse it precisely here — `service.ts` will do post-processing — we
  // just hand back the raw text and metadata.
  const raw = await res.text();
  const titleLine = raw.split('\n', 1)[0]?.replace(/^#+\s*/, '').trim() || domain;

  // Soft cap to keep the prompt sane. Service may trim further to fit a
  // model-specific token budget, but we cut at the provider boundary too
  // so we don't move 5MB of HTML through hot paths.
  const SOFT_CAP = opts.maxChars ?? 30_000;
  const sliced = raw.length > SOFT_CAP ? raw.slice(0, SOFT_CAP) : raw;

  return {
    ok: true,
    page: {
      url: rawUrl,
      requestedUrl: rawUrl,
      title: titleLine,
      content: sliced,
      contentLength: raw.length,
      truncated: raw.length > sliced.length,
      durationMs: Date.now() - startedAt,
      provider: 'jina',
      domain,
      fetchedAt: new Date().toISOString(),
    },
  };
}
