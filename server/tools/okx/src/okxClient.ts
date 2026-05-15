import { ProxyAgent, setGlobalDispatcher } from 'undici';
import type { OkxEnvelope } from './types.js';

const OKX_BASE = (process.env.OKX_API_BASE || 'https://www.okx.com').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = Math.max(2_000, Number(process.env.OKX_HTTP_TIMEOUT_MS || '5000'));
const RETRY_ATTEMPTS = Math.max(1, Number(process.env.OKX_HTTP_RETRY_ATTEMPTS || '2'));
const RETRY_BASE_DELAY_MS = Math.max(50, Number(process.env.OKX_HTTP_RETRY_BASE_DELAY_MS || '300'));

let proxyInitialized = false;

function initProxy(): void {
  if (proxyInitialized) return;
  const proxy = (
    process.env.OKX_HTTPS_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    ''
  ).trim();
  if (proxy) {
    try {
      setGlobalDispatcher(new ProxyAgent(proxy));
    } catch (err) {
      console.error('[okx-cli] proxy init failed', (err as Error)?.message);
    }
  }
  proxyInitialized = true;
}

function truncate(s: string, max = 180): string {
  const v = (s || '').replace(/\s+/g, ' ').trim();
  return v.length <= max ? v : `${v.slice(0, max)}…`;
}

export async function okxGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  initProxy();
  const query = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      query.set(k, String(v));
    }
  }
  const qs = query.toString();
  const url = `${OKX_BASE}${path}${qs ? `?${qs}` : ''}`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
      if (!res.ok) {
        const err = new Error(`OKX HTTP ${res.status} ${url}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      const body = (await res.json()) as OkxEnvelope<T>;
      if (body?.code && body.code !== '0') {
        throw new Error(`OKX code=${body.code} msg="${truncate(body.msg || '', 120)}"`);
      }
      return body.data;
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      const msg = (err as Error)?.message || '';
      const transient =
        (status != null && [408, 425, 429, 500, 502, 503, 504].includes(status)) ||
        /timeout|timed out|socket|econnreset|network|fetch failed/i.test(msg);
      if (attempt >= RETRY_ATTEMPTS || !transient) break;
      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.error(
        `[okx-cli] retry attempt=${attempt}/${RETRY_ATTEMPTS} delay_ms=${delay} reason="${truncate(msg)}" url="${truncate(url, 140)}"`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`OKX request failed: ${String(lastError)}`);
}
