/**
 * Service-auth token used by in-process adapters (e.g. the OpenAI compat
 * layer) to bypass the public socket auth (guest quota + mode gate).
 *
 * If SERVICE_AUTH_TOKEN is set in the env we honour it — that's the
 * deployment-controlled value. If not, we mint a random one at startup
 * so dev environments still work without configuration. Either way the
 * value is exposed via `getServiceAuthToken()` so both the socket auth
 * middleware and the adapter helper read it from a single source.
 */
import crypto from 'crypto';

let cached: string | null = null;

export function getServiceAuthToken(): string {
  if (cached) return cached;
  const fromEnv = (process.env.SERVICE_AUTH_TOKEN || '').trim();
  if (fromEnv) {
    cached = fromEnv;
    return cached;
  }
  // Auto-mint for dev / no-config startups. Persisted into process.env
  // so the socket middleware (which reads it lazily) sees the same value.
  cached = `svc_${crypto.randomBytes(24).toString('base64url')}`;
  process.env.SERVICE_AUTH_TOKEN = cached;
  console.log('[serviceToken] SERVICE_AUTH_TOKEN auto-generated for this process');
  return cached;
}
