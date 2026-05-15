/**
 * Surf API test-rig proxy.
 *
 *   Browser ──/api/surf/*──► this server ──Bearer $SURF_API_KEY──► api.asksurf.ai
 *
 * The key NEVER leaves this process — the browser sees only the relative
 * /api/surf/ path. Kill the process = key gone from memory. Useful for
 * exploratory testing without leaking the key into page source, devtools,
 * or CORS-exposed headers.
 */
import express from 'express';
import 'dotenv/config';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(new URL('.', import.meta.url).pathname.replace(/^\//, '')));

const SURF_BASE = (process.env.SURF_BASE || 'https://api.asksurf.ai/gateway/v1').replace(/\/+$/, '');
const PORT = Number(process.env.PORT || 3999);

// Tiny, safe redaction for logs — preserves first 6 + last 4 chars of the key
// so you can tell at a glance *which* key was used without leaking the body.
const maskKey = (k) => (k && k.length > 12 ? `${k.slice(0, 6)}…${k.slice(-4)}` : '(not set)');
const keyPreview = maskKey(process.env.SURF_API_KEY);

/**
 * Proxy any /api/surf/<path> to https://api.asksurf.ai/gateway/v1/<path>.
 * Passes query string through, keeps method + JSON body, injects the
 * Authorization header. Responds with Surf's status + body verbatim and
 * attaches x-proxy-* headers for observability on the frontend.
 */
app.all(/^\/api\/surf(\/.*)?$/, async (req, res) => {
  if (!process.env.SURF_API_KEY) {
    return res.status(500).json({
      error: 'SURF_API_KEY_MISSING',
      message: 'Set SURF_API_KEY in server/tools/surf-test/.env and restart.',
    });
  }

  const subpath = req.params[0] || '/';
  // Reassemble query string without triggering URLSearchParams' key encoding
  // quirks for comma-separated values that some Surf endpoints use.
  const qsEntries = Object.entries(req.query).flatMap(([k, v]) =>
    Array.isArray(v) ? v.map((vi) => [k, String(vi)]) : [[k, String(v)]],
  );
  const qs = new URLSearchParams(qsEntries).toString();
  // Allow the frontend to probe alternate base URLs during API discovery —
  // useful when docs don't exactly match runtime paths. Only accept hosts
  // under asksurf.ai to keep the proxy from being turned into an open SSRF.
  const override = req.get('X-Surf-Base-Override');
  const activeBase = override && /^https:\/\/[a-z0-9.-]+\.asksurf\.ai\//i.test(override + '/')
    ? override.replace(/\/+$/, '')
    : SURF_BASE;
  const target = `${activeBase}${subpath}${qs ? `?${qs}` : ''}`;

  const started = Date.now();
  let upstreamStatus = 0;
  let bodyText = '';
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${process.env.SURF_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body ?? {}) : undefined,
    });
    upstreamStatus = upstream.status;
    bodyText = await upstream.text();

    const elapsed = Date.now() - started;
    console.log(
      `[surf-proxy] ${req.method} ${subpath}${qs ? `?${qs}` : ''} → ${upstream.status} in ${elapsed}ms (key=${keyPreview})`,
    );

    res.set('X-Proxy-Latency-Ms', String(elapsed));
    res.set('X-Surf-Status', String(upstream.status));
    res.set('X-Surf-URL', target);
    res.status(upstream.status);

    // Preserve JSON if possible so the browser can pretty-print; fall back to raw.
    try {
      const parsed = JSON.parse(bodyText);
      res.json(parsed);
    } catch {
      res.type('text/plain').send(bodyText);
    }
  } catch (err) {
    const elapsed = Date.now() - started;
    console.error(`[surf-proxy] ${req.method} ${subpath} FAILED in ${elapsed}ms: ${err.message}`);
    res.status(502).json({
      error: 'PROXY_FETCH_FAILED',
      message: err.message,
      target,
      upstreamStatus,
    });
  }
});

// Basic health check — also confirms key is loaded without printing it.
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasKey: Boolean(process.env.SURF_API_KEY),
    keyPreview,
    surfBase: SURF_BASE,
  });
});

app.listen(PORT, () => {
  console.log('──────────────────────────────────────────────');
  console.log(`  Surf test rig running on http://localhost:${PORT}`);
  console.log(`  Using Surf base: ${SURF_BASE}`);
  console.log(`  Key loaded:      ${keyPreview}`);
  console.log('──────────────────────────────────────────────');
});
