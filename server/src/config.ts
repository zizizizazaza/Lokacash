import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// Validate critical env vars in production
if (isProduction) {
  const required = ['JWT_SECRET', 'FRONTEND_URL', 'DATABASE_URL'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (process.env.JWT_SECRET === 'loka-dev-secret') {
    console.error('❌ JWT_SECRET must not use the default dev secret in production');
    process.exit(1);
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv,
  isProduction,
  jwt: {
    secret: process.env.JWT_SECRET || 'loka-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: '30d',
  },
  lokaAi: {
    apiKey: process.env.LOKA_AI_API_KEY?.trim() || '',
    baseUrl: process.env.LOKA_AI_BASE_URL?.trim() || '',
    model: process.env.LOKA_AI_MODEL?.trim() || 'deepseek-v3',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 min
    max: isProduction ? 100 : 1000,
    authMax: isProduction ? 20 : 200, // stricter for auth endpoints
  },
  trustmrr: {
    apiKey: process.env.TRUSTMRR_API_KEY || '',
    baseUrl: 'https://trustmrr.com/api/v1',
    refreshIntervalMs: 5 * 60 * 1000,   // 5 min list refresh
    detailTtlMs: 10 * 60 * 1000,        // 10 min detail cache
    maxRequestsPerMinute: 18,            // leave 2 for headroom
  },
  stripe: {
    encryptionKey: process.env.STRIPE_ENCRYPTION_KEY || '',
    syncIntervalMs: 60 * 60 * 1000, // 1 hour
  },
  consensus: {
    baseUrl: process.env.CONSENSUS_API_BASE || 'http://173.249.5.203:8000/api/v1',
  },
} as const;
