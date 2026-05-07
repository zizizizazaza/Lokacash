/**
 * Shared types for the webFetch subsystem. Kept in one place so socket
 * handlers, providers, and prompt assemblers all agree on the shape.
 */

export interface FetchedPage {
  /** Final URL after any 301/302 redirects (the URL whose content is in `content`). */
  url: string;
  /** The URL the user originally provided (before redirects / normalisation). */
  requestedUrl: string;
  /** Page title — sourced from <title>, og:title, or first h1 depending on provider. */
  title: string;
  /** Cleaned readable text content (Markdown when provider supports it). */
  content: string;
  /** Length of `content` in characters before any token-budget truncation. */
  contentLength: number;
  /** True when content was sliced down to fit the token budget. */
  truncated: boolean;
  /** Wall-clock fetch duration in milliseconds. */
  durationMs: number;
  /** Which provider produced this result. */
  provider: 'jina' | 'tavily' | 'cache';
  /** Best-effort domain (host of `url`). */
  domain: string;
  /** ISO timestamp of when the fetch completed. */
  fetchedAt: string;
}

export interface FetchedPageError {
  requestedUrl: string;
  domain: string;
  /** Stable error code so the LLM and UI can branch on it. */
  code:
    | 'INVALID_URL'
    | 'BLOCKED_HOST'
    | 'BLOCKED_SCHEME'
    | 'TIMEOUT'
    | 'TOO_LARGE'
    | 'NOT_FOUND'
    | 'UPSTREAM_ERROR'
    | 'NO_PROVIDER';
  message: string;
}

export type FetchOutcome =
  | { ok: true; page: FetchedPage }
  | { ok: false; error: FetchedPageError };
