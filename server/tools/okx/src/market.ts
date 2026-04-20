import { okxGet } from './okxClient.js';
import { resolveSpotInstId, resolveSwapInstId } from './instruments.js';
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
