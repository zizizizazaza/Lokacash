import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';

const router = Router();

router.get('/iflytek-token', (req: Request, res: Response) => {
  const appId = process.env.IFLYTEK_APPID;
  const apiKey = process.env.IFLYTEK_API_KEY;
  const apiSecret = process.env.IFLYTEK_API_SECRET;

  if (!appId || !apiKey || !apiSecret) {
    return res.status(500).json({ error: 'iFlytek credentials not configured' });
  }

  // Generate WSS URL for iFlytek IAT
  const host = 'iat-api.xfyun.cn';
  const path = '/v2/iat';
  
  // Create Date string exactly as GMT HTTP date
  const date = new Date().toUTCString();

  // Construct signature string according to iFlytek specs
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;

  // HMAC-SHA256 signature
  const signatureSha = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest('base64');

  // Authorization string
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`;

  // Base64 encode
  const authorizationBase64 = Buffer.from(authorizationOrigin).toString('base64');

  // Construct final URL
  const wssUrl = `wss://${host}${path}?authorization=${encodeURIComponent(authorizationBase64)}&date=${encodeURIComponent(date)}&host=${host}`;

  res.json({
    url: wssUrl,
    appId
  });
});

export default router;
