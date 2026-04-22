import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { Agent, ProxyAgent, fetch as undiciFetch } from 'undici';
import prisma from '../db.js';

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string | null;
    role: string;
  };
}

const PRIVY_APP_ID = process.env.PRIVY_APP_ID || 'cmmn4pr2v05400cjmn7csjfoc';

const JWKS_URI = `https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`;

// If HTTPS_PROXY is set, route the JWKS fetch through it (needed when running
// from networks where Privy/Vercel is blocked or rate-limited without a proxy).
// Otherwise use a direct Agent. Either way, send a browser-like User-Agent so
// Vercel's bot-detection doesn't return a 403 checkpoint page.
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
const jwksDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : new Agent();

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchJwks(uri: string) {
  const res = await undiciFetch(uri, {
    dispatcher: jwksDispatcher,
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'application/json,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
}

const client = jwksClient({
  jwksUri: JWKS_URI,
  fetcher: fetchJwks,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid, function (err, key) {
    if (err) {
      callback(err, undefined);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

/** Pre-warm the JWKS cache at server startup so the first authenticated request
 *  never needs to wait for a cold JWKS fetch. Vercel's edge occasionally returns
 *  403 (bot-detection) for the Privy JWKS endpoint, so retry with backoff. */
export async function prewarmJwks(): Promise<void> {
  const attempts = 5;
  for (let i = 1; i <= attempts; i++) {
    try {
      const keys = await client.getSigningKeys();
      console.log(`[auth] JWKS prewarmed: ${keys.length} key(s) cached${i > 1 ? ` (attempt ${i})` : ''}`);
      return;
    } catch (err) {
      const msg = (err as Error).message;
      if (i === attempts) {
        console.warn(`[auth] JWKS prewarm failed after ${attempts} attempts (will retry on first request):`, msg);
        return;
      }
      const delay = Math.min(1000 * 2 ** (i - 1), 8000);
      console.warn(`[auth] JWKS prewarm attempt ${i}/${attempts} failed: ${msg} — retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

export function verifyToken(token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, { issuer: 'privy.io' }, (err, decoded) => {
      if (err) return reject(err);
      resolve(decoded);
    });
  });
}

export async function authRequired(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = await verifyToken(token);
    req.userId = payload.userId || payload.sub?.replace('did:privy:', '');
    next();
  } catch (err) {
    console.error('Token validation failed:', err);
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
}

export async function authWithUser(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = await verifyToken(token);
    const userId = payload.userId || payload.sub?.replace('did:privy:', '');
    
    // Privy might not have pushed the user to our DB yet if they literally just signed up.
    // If not found, we can optionally auto-create them, or let auth fail.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    
    if (!user) {
      res.status(401).json({ error: 'User not found in local database' });
      return;
    }
    
    req.userId = user.id;
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
}

/** Optional auth - sets userId if token present, but doesn't block */
export async function authOptional(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7);
    try {
      const payload = await verifyToken(token);
      req.userId = payload.userId || payload.sub?.replace('did:privy:', '');
    } catch {
      // Ignore invalid token for optional auth
    }
  }
  next();
}
