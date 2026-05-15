import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Strict limiter for auth endpoints (login, register)
export const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' },
});

// Strict limiter for financial operations (invest, mint, redeem, trade)
export const financialLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.isProduction ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many financial operations, please slow down' },
});
