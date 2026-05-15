import { okxGet } from './okxClient.js';
import { getInstrumentsCache, resolveSpotInstId, resolveSwapInstId } from './instruments.js';
import type {
  OkxCandleRow,
  OkxDerivativesSnapshot,
  OkxFundingRate,
  OkxMarketSnapshot,
  OkxOpenInterest,
  OkxOrderBook,
  OkxSpotSnapshot,
  OkxTicker,
} from './types.js';

function toNum(v: string | number | undefined | null): number {
  if (v === undefined || v === null || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export async function fetchTicker(instId: string): Promise<OkxTicker | null> {
  const rows = await okxGet<OkxTicker[]>('/api/v5/market/ticker', { instId });
  return rows?.[0] || null;
}

export async function fetchCandles(instId: string, bar = '1D', limit = 100): Promise<OkxCandleRow[]> {
  return (await okxGet<OkxCandleRow[]>('/api/v5/market/candles', { instId, bar, limit })) ?? [];
}

export async function fetchOrderBook(instId: string, sz = 20): Promise<OkxOrderBook | null> {
  const rows = await okxGet<OkxOrderBook[]>('/api/v5/market/books', { instId, sz });
  return rows?.[0] || null;
}

export async function fetchFundingRate(instId: string): Promise<OkxFundingRate | null> {
  const rows = await okxGet<OkxFundingRate[]>('/api/v5/public/funding-rate', { instId });
  return rows?.[0] || null;
}

export async function fetchOpenInterest(
  instType: 'SWAP' | 'FUTURES' | 'OPTION',
  instId: string,
): Promise<OkxOpenInterest | null> {
  const rows = await okxGet<OkxOpenInterest[]>('/api/v5/public/open-interest', { instType, instId });
  return rows?.[0] || null;
}

/** OKX liquidation order row — V5 `/api/v5/public/liquidation-orders` returns
 *  nested `{details: [{side, posSide, sz, bkPx, bkLoss, ts}, ...]}` per
 *  instrument. The size (`sz`) is in CONTRACTS, NOT in coins — OKX SWAPs
 *  have variable contract values (BTC-USDT-SWAP=0.01 BTC, ETH=0.1, alt
 *  USDT-SWAPs typically =1, etc.). Without the per-instrument ctVal we
 *  cannot precisely compute USD notional, so we approximate using
 *  `sz * bkPx` and surface a hint to the LLM that "size is in contracts". */
export interface OkxLiquidationDetailRow {
  /** "buy" | "sell" — opposite-side fill that liquidated the position. */
  side?: string;
  /** "long" | "short" | "net" — actual position side that got wiped out.
   *  In one-way mode this is "net" and we derive from `side` (sell = long
   *  liquidation, buy = short liquidation). */
  posSide?: string;
  sz?: string;
  bkPx?: string;     // bankruptcy price (REAL field name)
  bkLoss?: string;   // bankruptcy loss
  ts?: string;
}

export interface OkxLiquidationGroup {
  instId: string;
  instType?: string;
  instFamily?: string;
  uly?: string;
  details?: OkxLiquidationDetailRow[];
}

/**
 * Aggregate liquidation orders for a given base currency. Walks both SWAP
 * (perp) and FUTURES instrument types and returns long/short notional totals,
 * event count, plus the most recent N events for the LLM to read.
 */
export async function fetchLiquidationsAggregate(
  baseCcy: string,
  limit = 50,
): Promise<{
  baseCcy: string;
  totalEvents: number;
  longNotionalUsd: number;
  shortNotionalUsd: number;
  longCount: number;
  shortCount: number;
  recentEvents: Array<{ side: string; instId: string; notionalUsd: number; price: number; ts: number }>;
  windowHours: number;
  logs: string[];
}> {
  const base = baseCcy.toUpperCase();
  const logs: string[] = [];
  const windowMs = 24 * 60 * 60 * 1000; // OKX returns ~24h of liquidations
  const aggregate = {
    long: { notionalUsd: 0, count: 0 },
    short: { notionalUsd: 0, count: 0 },
  };
  const events: Array<{ side: string; instId: string; notionalUsd: number; price: number; ts: number }> = [];

  // Pre-warm the instruments cache so we can look up ctVal per instId
  // without hitting OKX once per liquidation event.
  let instrumentsCache: Awaited<ReturnType<typeof getInstrumentsCache>> | null = null;
  try {
    instrumentsCache = await getInstrumentsCache();
  } catch (err) {
    logs.push(`instruments_err:${(err as Error)?.message || 'unknown'}`);
  }

  /**
   * Compute USD notional for one liquidation event.
   *
   *   • Linear (USDT/USDC-margined SWAP): ctValCcy === baseCcy.
   *     notional_usd = sz × ctVal × bkPx
   *     — sz is in contracts, ctVal is the base-ccy per contract
   *       (BTC-USDT-SWAP: 0.01 BTC, ETH: 0.1, XRP: 100, DOGE: 1000…).
   *
   *   • Inverse (USD-margined SWAP, e.g. BTC-USD-SWAP): ctValCcy === 'USD'.
   *     notional_usd = sz × ctVal
   *     — ctVal is already USD per contract (e.g. 100 USD), price not used.
   *
   *   • Unknown contract / cache miss: fall back to sz × bkPx (assumes
   *     ctVal=1 — accurate for SOL/XRP-style alts, off for BTC/ETH).
   */
  const computeNotional = (instId: string, sz: number, bkPx: number): number => {
    const inst = instrumentsCache?.swap.get(instId);
    const ctValStr = inst?.ctVal;
    const ctValCcy = (inst?.ctValCcy || '').toUpperCase();
    const ctVal = ctValStr != null ? Number(ctValStr) : NaN;
    if (Number.isFinite(ctVal) && ctVal > 0) {
      // Inverse contract: ctVal is denominated in the quote (USD).
      if (ctValCcy === 'USD' || ctValCcy === 'USDT' || ctValCcy === 'USDC') {
        return sz * ctVal;
      }
      // Linear contract (USDT/USDC-margined): ctVal in base ccy.
      return sz * ctVal * bkPx;
    }
    // Cache miss / unknown contract — best-effort fallback.
    return sz * bkPx;
  };

  // Pull both SWAP and FUTURES; OKX `liquidation-orders` requires uly OR
  // instFamily. Easiest path: filter client-side by instId prefix.
  const instTypes: Array<'SWAP' | 'FUTURES'> = ['SWAP', 'FUTURES'];
  await Promise.all(instTypes.map(async (instType) => {
    try {
      const groups = await okxGet<OkxLiquidationGroup[]>('/api/v5/public/liquidation-orders', {
        instType,
        state: 'filled',
        uly: `${base}-USDT`, // OKX liquidation-orders accepts uly (underlying) for filtering
        limit: 100,
      });
      for (const g of groups || []) {
        // Filter by instId prefix if uly filter didn't bite.
        if (!g.instId || !g.instId.toUpperCase().startsWith(base)) continue;
        for (const d of g.details || []) {
          // V5 fields: `sz` (contracts) and `bkPx` (bankruptcy price).
          // The fillPx/fillSz used here previously were a misread of the
          // OKX docs — they don't exist on this endpoint, so every event
          // got silently skipped (Number.isFinite(NaN) → false).
          const sz = toNum(d.sz);
          const px = toNum(d.bkPx);
          const ts = toNum(d.ts);
          if (!Number.isFinite(sz) || !Number.isFinite(px) || sz <= 0 || px <= 0) continue;
          // Position side that got liquidated. In hedge mode posSide is
          // already "long"/"short". In one-way mode it's "net", and we
          // derive from `side`: sell = long got liquidated (forced to sell
          // out), buy = short got liquidated (forced to buy back).
          let sideKey: 'long' | 'short' | null = null;
          if (d.posSide === 'long' || d.posSide === 'short') {
            sideKey = d.posSide;
          } else if (d.side === 'sell') {
            sideKey = 'long';
          } else if (d.side === 'buy') {
            sideKey = 'short';
          }
          if (!sideKey) continue;
          const notional = computeNotional(g.instId, sz, px);
          aggregate[sideKey].notionalUsd += notional;
          aggregate[sideKey].count += 1;
          events.push({ side: sideKey, instId: g.instId, notionalUsd: notional, price: px, ts });
        }
      }
    } catch (err) {
      logs.push(`liq_${instType.toLowerCase()}_err:${(err as Error)?.message || 'unknown'}`);
    }
  }));

  events.sort((a, b) => b.ts - a.ts);
  return {
    baseCcy: base,
    totalEvents: aggregate.long.count + aggregate.short.count,
    longNotionalUsd: aggregate.long.notionalUsd,
    shortNotionalUsd: aggregate.short.notionalUsd,
    longCount: aggregate.long.count,
    shortCount: aggregate.short.count,
    recentEvents: events.slice(0, limit),
    windowHours: windowMs / (60 * 60 * 1000),
    logs,
  };
}

export function tickerToSnapshot(t: OkxTicker): OkxSpotSnapshot {
  const last = toNum(t.last);
  const open24h = toNum(t.open24h);
  const change24hPct = Number.isFinite(last) && Number.isFinite(open24h) && open24h > 0
    ? ((last - open24h) / open24h) * 100
    : NaN;
  return {
    instId: t.instId,
    last,
    open24h,
    high24h: toNum(t.high24h),
    low24h: toNum(t.low24h),
    change24hPct: Number.isFinite(change24hPct) ? change24hPct : 0,
    volume24hBase: toNum(t.vol24h),
    volume24hQuote: toNum(t.volCcy24h),
    ts: toNum(t.ts),
  };
}

export function orderBookDepthUsd(book: OkxOrderBook, lastPx: number, levels = 10): number | null {
  if (!book || !Number.isFinite(lastPx)) return null;
  let sum = 0;
  const bids = book.bids.slice(0, levels);
  const asks = book.asks.slice(0, levels);
  for (const row of [...bids, ...asks]) {
    const px = toNum(row[0]);
    const sz = toNum(row[1]);
    if (Number.isFinite(px) && Number.isFinite(sz)) sum += px * sz;
  }
  return sum > 0 ? sum : null;
}

/** Aggregated snapshot for a base currency: spot + derivatives + orderbook + candles. */
export async function fetchMarketSnapshot(baseCcy: string, candleLimit = 30): Promise<OkxMarketSnapshot> {
  const logs: string[] = [];
  const base = baseCcy.toUpperCase();

  const [spotInstId, swapInstId] = await Promise.all([resolveSpotInstId(base), resolveSwapInstId(base)]);

  const spotTask = spotInstId
    ? fetchTicker(spotInstId).catch((err) => {
        logs.push(`ticker_err:${(err as Error)?.message || 'unknown'}`);
        return null;
      })
    : Promise.resolve(null);

  const candlesTask = spotInstId
    ? fetchCandles(spotInstId, '1D', candleLimit).catch((err) => {
        logs.push(`candles_err:${(err as Error)?.message || 'unknown'}`);
        return [] as OkxCandleRow[];
      })
    : Promise.resolve([] as OkxCandleRow[]);

  const bookTask = spotInstId
    ? fetchOrderBook(spotInstId, 20).catch((err) => {
        logs.push(`book_err:${(err as Error)?.message || 'unknown'}`);
        return null;
      })
    : Promise.resolve(null);

  const fundingTask = swapInstId
    ? fetchFundingRate(swapInstId).catch((err) => {
        logs.push(`funding_err:${(err as Error)?.message || 'unknown'}`);
        return null;
      })
    : Promise.resolve(null);

  const oiTask = swapInstId
    ? fetchOpenInterest('SWAP', swapInstId).catch((err) => {
        logs.push(`oi_err:${(err as Error)?.message || 'unknown'}`);
        return null;
      })
    : Promise.resolve(null);

  const [ticker, candlesRaw, book, funding, oi] = await Promise.all([
    spotTask,
    candlesTask,
    bookTask,
    fundingTask,
    oiTask,
  ]);

  const spot = ticker ? tickerToSnapshot(ticker) : null;

  const candles = (candlesRaw || []).map((row) => [
    toNum(row[0]),
    toNum(row[1]),
    toNum(row[2]),
    toNum(row[3]),
    toNum(row[4]),
  ]) as Array<[number, number, number, number, number]>;

  const derivatives: OkxDerivativesSnapshot | null = funding || oi ? {
    fundingRate: funding ? toNum(funding.fundingRate) : null,
    nextFundingTs: funding?.nextFundingTime ? toNum(funding.nextFundingTime) : null,
    openInterest: oi ? toNum(oi.oi) : null,
    openInterestUsd: oi?.oiUsd ? toNum(oi.oiUsd) : null,
    ts: oi ? toNum(oi.ts) : funding?.fundingTime ? toNum(funding.fundingTime) : null,
  } : null;

  const depthUsd = book && spot ? orderBookDepthUsd(book, spot.last, 10) : null;

  if (!spotInstId) logs.push(`not_listed_spot:${base}`);
  if (!swapInstId) logs.push(`not_listed_swap:${base}`);

  return {
    baseCcy: base,
    spotInstId,
    swapInstId,
    spot,
    derivatives,
    candles,
    orderbookDepthUsd: depthUsd,
    logs,
  };
}
