/**
 * Lokacash Advanced API — proxy facade for the aegean-consensus FastAPI
 * service. Power-user surface that exposes the raw consensus / investment
 * / risk primitives (custom groups, custom weights, raw SSE event streams)
 * for clients who outgrew the simpler /api/skill/v1/* facade.
 *
 * Design:
 *   - Public, unauthenticated (matches the Skill API stance).
 *   - One wildcard route per HTTP verb that forwards method/body/query
 *     verbatim to aegean. Only the path is rewritten:
 *       /api/advanced/v1/<rest>  →  <CONSENSUS_BASE>/<rest>
 *   - Streaming endpoints (text/event-stream) are piped chunk-by-chunk so
 *     SSE consumers see the upstream events live, exactly as the Node
 *     consensus.service.ts already does internally.
 *   - The upstream aegean URL never reaches the client (no Location
 *     leakage, no 173.249.* IP exposure).
 *
 * What this is NOT:
 *   - It does not transform the response shape. The advanced API returns
 *     aegean's native schema. Clients who want the white-labeled
 *     "skill-mapper" shape should use /api/skill/v1/* instead.
 */
import { Router, type Request, type Response as ExpressResponse } from 'express';
import { config } from '../config.js';

const router = Router();

const AEGEAN_BASE = config.consensus.baseUrl.replace(/\/$/, '');
// 5 minutes — long enough for the slowest /analyze run, short enough that a
// hung connection eventually frees the socket.
const FORWARD_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Cross-tenant leak guard.
 *
 * aegean has no per-tenant isolation: anyone who hits `GET /api/v1/groups/`
 * sees every group every other client has ever created — and from there
 * can pull message history, member roster, consensus results. The Advanced
 * API is intentionally unauthenticated (matches the Skill API stance), so
 * we keep that posture but BLOCK the enumeration endpoints. Clients can
 * still read their own resources by hitting `/{id}` paths with the UUID
 * they received on creation, GitHub-Gist style: the UUID itself is the
 * capability.
 *
 * Each entry is { method, regex }. Matched on the path AFTER `/v1/`.
 * The regex MUST anchor (^...$) so a deny rule for `groups/` doesn't
 * accidentally swallow `groups/<id>/...`.
 */
const DENY_RULES: Array<{ method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; pattern: RegExp; reason: string }> = [
  { method: 'GET', pattern: /^groups\/?$/, reason: 'Listing all groups would expose other tenants. Use GET /v1/groups/{group_id} with the id you received on creation.' },
  { method: 'GET', pattern: /^risk\/sessions\/?$/, reason: 'Listing all risk sessions would expose other tenants. Use GET /v1/risk/sessions/{session_id}.' },
];

function findDenyRule(method: string, tail: string): { reason: string } | null {
  const m = method.toUpperCase();
  // Strip query string before matching — `?created_by=foo` shouldn't
  // unlock the enumeration endpoint.
  const path = tail.split('?', 1)[0];
  for (const r of DENY_RULES) {
    if (r.method === m && r.pattern.test(path)) return { reason: r.reason };
  }
  return null;
}

/**
 * Headers we strip before forwarding upstream. Either they're hop-by-hop
 * (RFC 7230 §6.1) and meaningless to a different connection, or they
 * reveal client/proxy identity that aegean doesn't need.
 */
const REQUEST_HEADER_BLOCKLIST = new Set([
  'host',
  'connection',
  'content-length', // recomputed by fetch from the actual body
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'cookie', // we don't pass session cookies through to aegean
]);

const RESPONSE_HEADER_BLOCKLIST = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'transfer-encoding',
  'upgrade',
  // CORS is handled by the parent express app — let it own that decision
  // instead of letting aegean's `allow_origins=["*"]` leak through.
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-expose-headers',
]);

function buildUpstreamUrl(req: Request): string {
  // `req.params.splat` is the wildcard tail — everything after /v1/. Express
  // 5 / path-to-regexp v6+ require a named splat (`*splat`) instead of the
  // bare `*` that worked in Express 4. The captured value can be a string
  // or a string[] depending on path-to-regexp's run; normalise both.
  const raw = (req.params as { splat?: string | string[] }).splat;
  const tail = Array.isArray(raw) ? raw.join('/') : (raw || '');
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return `${AEGEAN_BASE}/${tail}${query}`;
}

function pickRequestHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v !== 'string') continue;
    if (REQUEST_HEADER_BLOCKLIST.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  // Identify ourselves so aegean ops can see what's hitting it.
  out['x-forwarded-by'] = 'lokacash-advanced-proxy';
  return out;
}

async function pipeResponse(upstream: Response, res: ExpressResponse): Promise<void> {
  // Mirror the upstream status + headers (minus the deny-list). Express's
  // res.writeHead would let us batch this, but we use setHeader so any
  // CORS middleware up the chain can still amend headers.
  upstream.headers.forEach((value, key) => {
    if (RESPONSE_HEADER_BLOCKLIST.has(key.toLowerCase())) return;
    res.setHeader(key, value);
  });
  res.status(upstream.status);

  if (!upstream.body) {
    res.end();
    return;
  }

  // Stream chunks straight through. This is what makes SSE endpoints
  // (/groups/{id}/consensus/stream, /investment/analyze/stream, …) work:
  // the client gets each event as soon as aegean emits it, without us
  // buffering the whole response.
  const reader = upstream.body.getReader();
  let aborted = false;
  const onClose = () => {
    aborted = true;
    reader.cancel().catch(() => { /* ignore */ });
  };
  res.on('close', onClose);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        // Backpressure — wait for drain before pulling more bytes.
        await new Promise<void>((resolve) => res.once('drain', () => resolve()));
      }
      if (aborted) break;
      // Flush ASAP for SSE — Node's HTTP layer often holds chunks until
      // a write threshold is hit, which would defeat live streaming.
      (res as any).flush?.();
    }
    res.end();
  } catch (err) {
    if (!aborted && !res.writableEnded) {
      console.error('[advanced-proxy] stream error', err);
      try { res.end(); } catch { /* ignore */ }
    }
  } finally {
    res.off('close', onClose);
  }
}

async function forward(req: Request, res: ExpressResponse, hasBody: boolean): Promise<void> {
  // Compute the tail path (everything after `/v1/`) once so the deny
  // guard and the upstream URL builder agree on what we're forwarding.
  const rawSplat = (req.params as { splat?: string | string[] }).splat;
  const tail = Array.isArray(rawSplat) ? rawSplat.join('/') : (rawSplat || '');

  const denied = findDenyRule(req.method, tail);
  if (denied) {
    res.status(403).json({
      ok: false,
      error: 'endpoint_disabled',
      message: denied.reason,
    });
    return;
  }

  const upstreamUrl = buildUpstreamUrl(req);
  const headers = pickRequestHeaders(req);

  // We let the global timeout abort if aegean hangs — the client gets a
  // 504 and nothing dangles.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  res.on('close', () => controller.abort());

  let body: string | undefined;
  if (hasBody) {
    // Express has already parsed JSON bodies via app-level middleware.
    // Re-serialize so we don't depend on the raw stream — this also
    // handles `application/json; charset=utf-8` cleanly.
    body = JSON.stringify(req.body ?? {});
    headers['content-type'] = headers['content-type'] || 'application/json';
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
    });
    await pipeResponse(upstream, res);
  } catch (err: any) {
    if (res.headersSent || res.writableEnded) {
      // Already streaming — best we can do is end the connection.
      try { res.end(); } catch { /* ignore */ }
      return;
    }
    const aborted = err?.name === 'AbortError';
    res.status(aborted ? 504 : 502).json({
      ok: false,
      error: aborted ? 'upstream_timeout' : 'upstream_unreachable',
      message: aborted ? 'Aegean did not respond in time.' : 'Failed to reach the consensus engine.',
    });
  } finally {
    clearTimeout(timer);
  }
}

// One handler per verb so each gets its own express trace + Sentry span if
// instrumentation is added later. The named `*splat` captures the rest of
// the path including slashes (Express 5 / path-to-regexp v6+ syntax — the
// bare `*` from Express 4 throws "Missing parameter name").
router.get('/v1/*splat', (req, res) => { void forward(req, res, false); });
router.delete('/v1/*splat', (req, res) => { void forward(req, res, false); });
router.post('/v1/*splat', (req, res) => { void forward(req, res, true); });
router.put('/v1/*splat', (req, res) => { void forward(req, res, true); });
router.patch('/v1/*splat', (req, res) => { void forward(req, res, true); });

/**
 * Lightweight discovery endpoint mirroring /api/skill/v1/info. Lists the
 * advanced surface clients can hit so SDK auto-generators (and humans) can
 * orient themselves without scraping aegean's swagger.
 */
router.get('/info', (_req: Request, res: ExpressResponse) => {
  res.json({
    ok: true,
    data: {
      name: 'lokacash-advanced',
      version: '1.0.0',
      description:
        'Power-user multi-agent consensus + investment analysis primitives. Returns raw aegean schema; use /api/skill/v1/* if you prefer the white-labeled facade.',
      streamingEndpoints: [
        'POST /api/advanced/v1/groups/{group_id}/consensus/stream',
        'POST /api/advanced/v1/investment/analyze/stream',
        'GET  /api/advanced/v1/investment/analyses/{request_id}/stream',
      ],
      groups: 'Manage agent groups, members, weights, and run consensus.',
      investment: 'Submit investment analysis requests and inspect timeline / discussion / risk-gate.',
      risk: 'VAN-pipeline risk evaluation and challenge sessions.',
    },
  });
});

export default router;
