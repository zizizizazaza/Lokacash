/**
 * SSRF (Server-Side Request Forgery) guard for the webFetch pipeline.
 *
 * Even though Jina Reader fronts most of our outbound traffic — and Jina
 * itself rejects internal addresses — we never want a buggy fallback path
 * or future provider switch to expose the cluster's internal network. So
 * the guard runs *before* any HTTP call, regardless of which provider
 * downstream code chose.
 *
 * Two-stage check:
 *   1. Static parse — reject obviously bad schemes / hostnames.
 *   2. DNS resolve — look up the host's A record and reject any private,
 *      loopback, link-local, multicast, reserved, or unspecified IP.
 *
 * Stage 2 catches the "evil.com → 192.168.1.1" case where a public
 * hostname resolves to an internal IP. It is NOT a defence against DNS
 * rebinding (where the IP changes between check and connect); that
 * would need a custom HTTP agent that pins the IP after resolution.
 * The Jina-primary path makes rebinding low-risk for now.
 */
import { promises as dns } from 'dns';
import net from 'net';

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  'metadata',
]);

const BLOCKED_PORTS = new Set([22, 23, 25, 110, 143, 3306, 5432, 6379, 9200, 11211, 27017]);

export interface SsrfCheckResult {
  ok: boolean;
  reason?: string;
  /** Resolved IP after DNS — handy for downstream connection pinning. */
  resolvedIp?: string;
}

/** True for IPv4 addresses inside the canonical RFC1918 private ranges. */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 127) return true; // loopback
  if (a === 0) return true; // unspecified
  if (a >= 224) return true; // multicast / reserved
  return false;
}

/** True for IPv6 addresses we never want to talk to. */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('ff')) return true; // multicast
  return false;
}

export async function checkUrlSafety(rawUrl: string): Promise<SsrfCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  // Scheme allow-list (not a deny-list — never use file:, data:, gopher:, etc.)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: `Scheme '${parsed.protocol}' not allowed` };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) return { ok: false, reason: 'Missing hostname' };
  if (BLOCKED_HOSTS.has(host)) return { ok: false, reason: 'Blocked hostname' };

  // Port deny-list (well-known internal services).
  const port = parsed.port ? Number(parsed.port) : null;
  if (port != null && BLOCKED_PORTS.has(port)) {
    return { ok: false, reason: `Port ${port} blocked` };
  }

  // If the host is already an IP literal, validate it directly.
  const ipKind = net.isIP(host);
  if (ipKind === 4 && isPrivateIPv4(host)) return { ok: false, reason: 'Private IPv4' };
  if (ipKind === 6 && isPrivateIPv6(host)) return { ok: false, reason: 'Private IPv6' };
  if (ipKind !== 0) return { ok: true, resolvedIp: host };

  // DNS resolve the hostname and check every record.
  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    return { ok: false, reason: 'DNS resolution failed' };
  }
  if (!records.length) return { ok: false, reason: 'DNS resolution empty' };

  for (const r of records) {
    if (r.family === 4 && isPrivateIPv4(r.address)) {
      return { ok: false, reason: `Resolved to private IPv4 (${r.address})` };
    }
    if (r.family === 6 && isPrivateIPv6(r.address)) {
      return { ok: false, reason: `Resolved to private IPv6 (${r.address})` };
    }
  }

  return { ok: true, resolvedIp: records[0]?.address };
}
