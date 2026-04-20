import crypto from 'crypto';

/**
 * Build OKX private-endpoint signature headers per OKX v5 auth spec.
 * Signature = base64(hmac_sha256(secret, timestamp + method + requestPath + body))
 */
export function buildSignedHeaders(opts: {
  method: 'GET' | 'POST';
  requestPath: string; // e.g. "/api/v5/orbit/news-search?coins=BTC"
  body?: string;       // JSON body for POST, empty for GET
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
  language?: 'zh-CN' | 'en-US';
}): Record<string, string> {
  const timestamp = new Date().toISOString();
  const prehash = timestamp + opts.method + opts.requestPath + (opts.body || '');
  const sign = crypto
    .createHmac('sha256', opts.apiSecret)
    .update(prehash)
    .digest('base64');

  const headers: Record<string, string> = {
    'OK-ACCESS-KEY': opts.apiKey,
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': opts.apiPassphrase,
    Accept: 'application/json',
    'Accept-Language': opts.language || 'en-US',
  };
  if (opts.method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

export function hasOkxCredentials(): boolean {
  return !!(
    (process.env.OKX_API_KEY || '').trim() &&
    (process.env.OKX_API_SECRET || '').trim() &&
    (process.env.OKX_API_PASSPHRASE || '').trim()
  );
}

export function getOkxCredentials(): { apiKey: string; apiSecret: string; apiPassphrase: string } | null {
  const apiKey = (process.env.OKX_API_KEY || '').trim();
  const apiSecret = (process.env.OKX_API_SECRET || '').trim();
  const apiPassphrase = (process.env.OKX_API_PASSPHRASE || '').trim();
  if (!apiKey || !apiSecret || !apiPassphrase) return null;
  return { apiKey, apiSecret, apiPassphrase };
}
