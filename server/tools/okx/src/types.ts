export type OkxIntent =
  | 'ticker'
  | 'candles'
  | 'orderbook'
  | 'funding_rate'
  | 'open_interest'
  | 'open_interest_history'
  | 'instruments'
  | 'is_listed'
  | 'market_snapshot'
  | 'news_latest'
  | 'news_by_coin'
  | 'coin_sentiment'
  | 'news_bundle';

export type OkxRequest = {
  intent: OkxIntent;
  /** e.g. "BTC-USDT" (spot) or "BTC-USDT-SWAP" (perp). For is_listed / market_snapshot, pass the base currency like "BTC". */
  instId?: string;
  /** For instruments / open_interest: "SPOT" | "SWAP" | "FUTURES" | "OPTION" */
  instType?: 'SPOT' | 'SWAP' | 'FUTURES' | 'OPTION';
  /** Candles bar: "1m" "5m" "15m" "1H" "4H" "1D" "1W" */
  bar?: string;
  /** Max candles returned */
  limit?: number;
  /** Orderbook depth: 1-400 */
  sz?: number;
  /** Base currency symbol for is_listed / market_snapshot shortcuts (e.g. "BTC"). Uppercase. */
  baseCcy?: string;
};

export type OkxEnvelope<T> = {
  code: string; // "0" = success
  msg?: string;
  data: T;
};

export type OkxTicker = {
  instId: string;
  last: string;
  lastSz?: string;
  askPx?: string;
  bidPx?: string;
  open24h?: string;
  high24h?: string;
  low24h?: string;
  vol24h?: string; // base ccy volume
  volCcy24h?: string; // quote ccy volume
  ts: string;
};

/** Candles response rows: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm] */
export type OkxCandleRow = string[];

export type OkxOrderBook = {
  asks: string[][];
  bids: string[][];
  ts: string;
};

export type OkxFundingRate = {
  instId: string;
  fundingRate: string;
  nextFundingRate?: string;
  nextFundingTime?: string;
  fundingTime?: string;
};

export type OkxOpenInterest = {
  instId: string;
  instType: string;
  oi: string;
  oiCcy: string;
  oiUsd?: string;
  ts: string;
};

export type OkxInstrument = {
  instId: string;
  instType: string;
  baseCcy?: string;
  quoteCcy?: string;
  settleCcy?: string;
  state?: string;
  ctType?: string;
  listTime?: string;
  expTime?: string;
};

export type OkxSpotSnapshot = {
  instId: string;
  last: number;
  open24h: number;
  high24h: number;
  low24h: number;
  change24hPct: number;
  volume24hBase: number;
  volume24hQuote: number;
  ts: number;
};

export type OkxDerivativesSnapshot = {
  fundingRate: number | null;
  nextFundingTs: number | null;
  openInterest: number | null;
  openInterestUsd: number | null;
  ts: number | null;
};

export type OkxMarketSnapshot = {
  baseCcy: string;
  spotInstId: string | null;
  swapInstId: string | null;
  spot: OkxSpotSnapshot | null;
  derivatives: OkxDerivativesSnapshot | null;
  candles?: Array<[ts: number, o: number, h: number, l: number, c: number]>;
  orderbookDepthUsd?: number | null;
  logs: string[];
};

export type OkxNewsItem = {
  id?: string;
  title?: string;
  summary?: string;
  url?: string;
  publishedAt?: string;        // ISO or unix
  source?: string;             // publisher/domain
  importance?: string;         // 'high' | 'normal' | ...
  sentiment?: string;          // 'bullish' | 'bearish' | 'neutral'
  coins?: string[];
};

export type OkxCoinSentiment = {
  baseCcy: string;
  sentimentScore?: number | null;   // reserved; OKX returns label + ratios, not numeric score
  label?: string;                   // 'bullish' | 'bearish' | 'neutral'
  bullishRatio?: number | null;     // 0..100
  bearishRatio?: number | null;
  neutralRatio?: number | null;
  hotness?: number | null;          // total mention count across platforms
  newsMentionCnt?: number | null;
  xMentionCnt?: number | null;
  trend?: Array<{ ts: number; bullish: number; bearish: number; neutral: number }>;
  ts?: number;
};

export type OkxNewsBundle = {
  baseCcy: string;
  latestNews: OkxNewsItem[];
  sentiment: OkxCoinSentiment | null;
  logs: string[];
};

export type OkxCliResult = {
  ok: boolean;
  intent: OkxIntent;
  report: string;
  payload?: unknown;
  error?: string;
  logs: string[];
};
