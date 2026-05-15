import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
type Tx = Omit<typeof prisma, '$transaction' | '$connect' | '$disconnect' | '$on' | '$extends'>;
import { authRequired, authOptional, type AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { financialLimiter } from '../middleware/rateLimiter.js';
import { getTierDetails } from '../services/credit.service.js';
import { getTokenPrice, getAllPrices, getPriceMeta } from '../services/price.service.js';

// Base rate: 1 USDC = 1 AIUSD, fee based on credit tier
const BASE_RATE = 1.0;
const BASE_APY = 5.24;

const router = Router();

// Get portfolio holdings — with real yield calculation
router.get('/holdings', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const holdings = await prisma.portfolioHolding.findMany({
      where: { userId: req.userId },
    });

    const now = new Date();
    const enriched = holdings.map(h => {
      // Calculate yield based on hold time × APY
      const holdDays = (now.getTime() - h.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const dailyRate = (h.currentApy / 100) / 365;
      const earnedYield = h.amount * dailyRate * holdDays;

      // Get current market price for non-AIUSD tokens
      const currentPrice = h.asset === 'AIUSD' ? 1.0 : (getTokenPrice(h.asset) ?? h.avgCost);
      const currentValue = h.amount * currentPrice;
      const costBasis = h.amount * h.avgCost;
      const unrealizedPnL = currentValue - costBasis;

      return {
        ...h,
        currentPrice,
        currentValue: parseFloat(currentValue.toFixed(2)),
        earnedYield: parseFloat(earnedYield.toFixed(4)),
        unrealizedPnL: parseFloat(unrealizedPnL.toFixed(2)),
        holdDays: Math.floor(holdDays),
      };
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// Get transaction history
router.get('/history', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(transactions);
  } catch (err) {
    next(err);
  }
});

// Get historical net worth balance (90 days)
router.get('/historical-balance', authRequired, async (req: AuthRequest, res, next) => {
  try {
    // 1. Get current holdings to determine current precise net worth
    const holdings = await prisma.portfolioHolding.findMany({
      where: { userId: req.userId },
    });
    
    let currentTotal = holdings.reduce((sum, h) => {
      const currentPrice = h.asset === 'AIUSD' ? 1.0 : (getTokenPrice(h.asset) ?? h.avgCost);
      return sum + (h.amount * currentPrice);
    }, 0);

    // 2. Synthesize 90-day history moving backwards from currentTotal
    const data = [];
    const now = new Date();
    
    // 2. Synthesize 90-day history moving backwards from currentTotal
    let movingTotal = currentTotal;
    
    // For a more realistic MVP: We will add small random daily market fluctuations to simulate yield / price action,
    // working BACKWARDS.
    for (let i = 0; i <= 90; i++) {
       const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
       data.unshift({
         date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
         timestamp: d.getTime(),
         total: parseFloat(movingTotal.toFixed(2))
       });
       
       // Working backwards: subtract a random "daily change" to arrive at yesterday's balance
       const randomDailyChange = (Math.random() * 0.005) - 0.002; // -0.2% to +0.3% daily fluctuation
       movingTotal = movingTotal * (1 - randomDailyChange);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Get investments — with real yield calculation
router.get('/investments', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const investments = await prisma.investment.findMany({
      where: { userId: req.userId },
      include: {
        project: {
          select: {
            id: true,
            title: true,
            apy: true,
            status: true,
            coverImage: true,
            durationDays: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const enriched = investments.map(inv => {
      const holdDays = (now.getTime() - inv.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const apy = inv.project.apy;
      const dailyRate = (apy / 100) / 365;
      const earnedYield = inv.amount * dailyRate * holdDays;
      const projectedTotal = inv.amount * dailyRate * inv.project.durationDays;

      return {
        ...inv,
        earnedYield: parseFloat(earnedYield.toFixed(2)),
        projectedTotalYield: parseFloat(projectedTotal.toFixed(2)),
        holdDays: Math.floor(holdDays),
        yieldProgress: Math.min(100, parseFloat(((holdDays / inv.project.durationDays) * 100).toFixed(1))),
      };
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// ============ Swap Quote (preview fee + net amounts) ============
const quoteSchema = z.object({
  amount: z.number().positive(),
  action: z.enum(['mint', 'redeem']),
});

router.post('/swap-quote', authOptional, async (req: AuthRequest, res, next) => {
  try {
    const { amount, action } = quoteSchema.parse(req.body);

    // Get user's credit tier for fee calculation
    let feeRate = 0.025; // default: 2.5% for unauthenticated
    let tierName = 'Unranked';
    if (req.userId) {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      if (user) {
        const tier = getTierDetails(user.creditScore);
        feeRate = tier.feeRate;
        tierName = tier.name;
      }
    }

    const fee = amount * feeRate;
    const netAmount = amount - fee;

    res.json({
      action,
      inputAmount: amount,
      rate: BASE_RATE,
      feeRate,
      fee: parseFloat(fee.toFixed(4)),
      netAmount: parseFloat(netAmount.toFixed(4)),
      tier: tierName,
      apy: BASE_APY,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// ============ Mint AIUSD (Deposit USDC → AIUSD) ============
const mintSchema = z.object({
  amount: z.number().positive(),
});

router.post('/mint', authRequired, financialLimiter, async (req: AuthRequest, res, next) => {
  try {
    const { amount } = mintSchema.parse(req.body);
    const userId = req.userId as string;

    // Calculate fee based on credit tier
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const tier = getTierDetails(user?.creditScore ?? 100);
    const fee = amount * tier.feeRate;
    const netAmount = amount - fee;

    const result = await prisma.$transaction(async (tx: Tx) => {
      // Upsert AIUSD holding (net of fees)
      const existing = await tx.portfolioHolding.findUnique({
        where: { userId_asset: { userId, asset: 'AIUSD' } },
      });

      if (existing) {
        await tx.portfolioHolding.update({
          where: { id: existing.id },
          data: { amount: existing.amount + netAmount, currentApy: BASE_APY },
        });
      } else {
        await tx.portfolioHolding.create({
          data: { userId, asset: 'AIUSD', amount: netAmount, avgCost: BASE_RATE, currentApy: BASE_APY },
        });
      }

      const transaction = await tx.transaction.create({
        data: { userId, type: 'MINT', amount: netAmount, asset: 'AIUSD', status: 'COMPLETED' },
      });

      return transaction;
    });

    res.status(201).json({
      ...result,
      inputAmount: amount,
      fee: parseFloat(fee.toFixed(4)),
      feeRate: tier.feeRate,
      netAmount: parseFloat(netAmount.toFixed(4)),
      tier: tier.name,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// ============ Token Swap (Buy/Sell Web3 tokens with USDC) ============
const swapSchema = z.object({
  token: z.string().min(1),
  tokenSymbol: z.string().min(1),
  action: z.enum(['buy', 'sell']),
  amount: z.number().positive(),
  amountType: z.enum(['token', 'usd']).default('token'),
  estimatedUSD: z.number().positive().optional(),
  chain: z.string().default('base'),
});

// Get supported tokens and live prices (from CoinGecko with fallback)
router.get('/supported-tokens', (_req, res) => {
  const allPrices = getAllPrices();
  const meta = getPriceMeta();
  const tokens = Object.entries(allPrices).map(([symbol, price]) => ({
    symbol,
    price,
    chain: 'base',
  }));
  res.json({ chain: 'base', count: tokens.length, ...meta, tokens });
});

router.post('/swap', authRequired, financialLimiter, async (req: AuthRequest, res, next) => {
  try {
    const data = swapSchema.parse(req.body);
    const userId = req.userId as string;
    const symbol = data.tokenSymbol.toUpperCase();
    const price = getTokenPrice(symbol);
    if (!price) throw new AppError(`Token ${symbol} is not supported`, 400);

    // Calculate amounts
    let tokenAmount: number;
    let usdAmount: number;
    if (data.amountType === 'usd') {
      usdAmount = data.amount;
      tokenAmount = usdAmount / price;
    } else {
      tokenAmount = data.amount;
      usdAmount = tokenAmount * price;
    }

    // Simulate ~0.5% slippage + $0.02 gas
    const slippage = usdAmount * 0.005;
    const gasFee = 0.02;
    const totalCostUSD = usdAmount + slippage + gasFee;

    const result = await prisma.$transaction(async (tx: Tx) => {
      if (data.action === 'buy') {
        // Upsert token holding
        const existing = await tx.portfolioHolding.findUnique({
          where: { userId_asset: { userId, asset: symbol } },
        });
        if (existing) {
          const newAmount = existing.amount + tokenAmount;
          const newAvgCost = ((existing.avgCost * existing.amount) + (price * tokenAmount)) / newAmount;
          await tx.portfolioHolding.update({
            where: { id: existing.id },
            data: { amount: newAmount, avgCost: newAvgCost },
          });
        } else {
          await tx.portfolioHolding.create({
            data: { userId, asset: symbol, amount: tokenAmount, avgCost: price },
          });
        }
      } else {
        // Sell — check balance
        const existing = await tx.portfolioHolding.findUnique({
          where: { userId_asset: { userId, asset: symbol } },
        });
        if (!existing || existing.amount < tokenAmount) {
          throw new AppError(`Insufficient ${symbol} balance`, 400);
        }
        if (existing.amount === tokenAmount) {
          await tx.portfolioHolding.delete({ where: { id: existing.id } });
        } else {
          await tx.portfolioHolding.update({
            where: { id: existing.id },
            data: { amount: existing.amount - tokenAmount },
          });
        }
      }

      // Record transaction
      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: 'SWAP',
          amount: tokenAmount,
          asset: symbol,
          status: 'COMPLETED',
          txHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
        },
      });

      return {
        transaction,
        action: data.action,
        token: symbol,
        tokenAmount: parseFloat(tokenAmount.toFixed(8)),
        pricePerToken: price,
        totalUSD: parseFloat(totalCostUSD.toFixed(2)),
        slippage: parseFloat(slippage.toFixed(2)),
        gasFee,
        chain: data.chain,
      };
    });

    res.status(201).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// ============ Redeem AIUSD (AIUSD → USDC) with Queue for Large Amounts ============
const INSTANT_REDEEM_LIMIT = 10000; // T+0 for ≤ $10,000
const QUEUE_DAYS = 7; // T+7 for large redemptions

router.post('/redeem', authRequired, financialLimiter, async (req: AuthRequest, res, next) => {
  try {
    const { amount } = mintSchema.parse(req.body);
    const userId = req.userId as string;

    // Calculate fee based on credit tier
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const tier = getTierDetails(user?.creditScore ?? 100);
    const fee = amount * tier.feeRate;
    const netAmount = amount - fee;

    // Check balance first
    const holding = await prisma.portfolioHolding.findUnique({
      where: { userId_asset: { userId, asset: 'AIUSD' } },
    });
    if (!holding || holding.amount < amount) {
      throw new AppError('Insufficient AIUSD balance', 400);
    }

    // Large redemption → queue T+7
    if (amount > INSTANT_REDEEM_LIMIT) {
      const processAfter = new Date();
      processAfter.setDate(processAfter.getDate() + QUEUE_DAYS);

      const result = await prisma.$transaction(async (tx: Tx) => {
        // Deduct from holding (lock amount)
        if (holding.amount === amount) {
          await tx.portfolioHolding.delete({ where: { id: holding.id } });
        } else {
          await tx.portfolioHolding.update({
            where: { id: holding.id },
            data: { amount: holding.amount - amount },
          });
        }

        // Create queue entry
        const queueEntry = await tx.redemptionQueue.create({
          data: {
            userId,
            amount,
            fee: parseFloat(fee.toFixed(4)),
            netAmount: parseFloat(netAmount.toFixed(4)),
            processAfter,
          },
        });

        // Record pending transaction
        await tx.transaction.create({
          data: { userId, type: 'REDEEM', amount: netAmount, asset: 'AIUSD', status: 'QUEUED' },
        });

        return queueEntry;
      });

      res.status(201).json({
        redemptionType: 'queued',
        message: `Large redemption queued. Processing after ${processAfter.toISOString().split('T')[0]} (T+${QUEUE_DAYS})`,
        queue: result,
        inputAmount: amount,
        fee: parseFloat(fee.toFixed(4)),
        netAmount: parseFloat(netAmount.toFixed(4)),
        tier: tier.name,
      });
      return;
    }

    // Small redemption → instant T+0
    const result = await prisma.$transaction(async (tx: Tx) => {
      if (holding.amount === amount) {
        await tx.portfolioHolding.delete({ where: { id: holding.id } });
      } else {
        await tx.portfolioHolding.update({
          where: { id: holding.id },
          data: { amount: holding.amount - amount },
        });
      }

      const transaction = await tx.transaction.create({
        data: { userId, type: 'REDEEM', amount: netAmount, asset: 'AIUSD', status: 'COMPLETED' },
      });

      return transaction;
    });

    res.status(201).json({
      ...result,
      redemptionType: 'instant',
      inputAmount: amount,
      fee: parseFloat(fee.toFixed(4)),
      feeRate: tier.feeRate,
      netAmount: parseFloat(netAmount.toFixed(4)),
      tier: tier.name,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// Get redemption queue for current user
router.get('/redemption-queue', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const queue = await prisma.redemptionQueue.findMany({
      where: { userId: req.userId as string },
      orderBy: { queuedAt: 'desc' },
    });
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

// Cancel a queued redemption (only if still queued)
router.post('/redemption-queue/:id/cancel', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId as string;
    const entry = await prisma.redemptionQueue.findUnique({
      where: { id: req.params.id as string },
    });

    if (!entry) throw new AppError('Queue entry not found', 404);
    if (entry.userId !== userId) throw new AppError('Unauthorized', 403);
    if (entry.status !== 'queued') throw new AppError('Can only cancel queued redemptions', 400);

    await prisma.$transaction(async (tx: Tx) => {
      // Return AIUSD to holding
      const existing = await tx.portfolioHolding.findUnique({
        where: { userId_asset: { userId, asset: 'AIUSD' } },
      });
      if (existing) {
        await tx.portfolioHolding.update({
          where: { id: existing.id },
          data: { amount: existing.amount + entry.amount },
        });
      } else {
        await tx.portfolioHolding.create({
          data: { userId, asset: 'AIUSD', amount: entry.amount, avgCost: 1.0, currentApy: BASE_APY },
        });
      }

      // Mark queue entry as cancelled
      await tx.redemptionQueue.update({
        where: { id: entry.id },
        data: { status: 'cancelled' },
      });
    });

    res.json({ message: 'Redemption cancelled, AIUSD returned to your balance' });
  } catch (err) {
    next(err);
  }
});

export default router;
