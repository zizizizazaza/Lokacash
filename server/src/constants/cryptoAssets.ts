/**
 * Authoritative list of known crypto assets for backend routing defense.
 * Keep in sync with server/tools/web3/src/cryptoAssets.ts when adding new tokens.
 *
 * Used by:
 *  - socket/index.ts  → Layer 1 (filter) + Layer 3 (ambiguity detection)
 *  - ai.service.ts    → Layer 2 (router prompt injection)
 */

export interface CryptoAssetEntry {
  id: string;
  symbol: string;
  name: string;
  /** True if this symbol also exists as an active stock ticker and could cause routing confusion */
  ambiguous?: boolean;
}

export const CRYPTO_ASSETS_LIST: CryptoAssetEntry[] = [
  { id: 'bitcoin',       symbol: 'BTC',  name: 'Bitcoin' },
  { id: 'ethereum',      symbol: 'ETH',  name: 'Ethereum' },
  { id: 'solana',        symbol: 'SOL',  name: 'Solana' },
  { id: 'binancecoin',   symbol: 'BNB',  name: 'BNB' },
  { id: 'ripple',        symbol: 'XRP',  name: 'XRP' },
  { id: 'cardano',       symbol: 'ADA',  name: 'Cardano' },
  { id: 'dogecoin',      symbol: 'DOGE', name: 'Dogecoin' },
  { id: 'shiba-inu',     symbol: 'SHIB', name: 'Shiba Inu' },
  { id: 'pepe',          symbol: 'PEPE', name: 'Pepe' },
  { id: 'aave',          symbol: 'AAVE', name: 'Aave' },
  { id: 'ravedao',       symbol: 'RAVE', name: 'RAVE DAO' },
  { id: 'polkadot',      symbol: 'DOT',  name: 'Polkadot' },
  { id: 'chainlink',     symbol: 'LINK', name: 'Chainlink' },
  { id: 'avalanche-2',   symbol: 'AVAX', name: 'Avalanche' },
  { id: 'matic-network', symbol: 'MATIC',name: 'Polygon' },
  { id: 'uniswap',       symbol: 'UNI',  name: 'Uniswap' },
  { id: 'tron',          symbol: 'TRX',  name: 'TRON' },
  { id: 'litecoin',      symbol: 'LTC',  name: 'Litecoin' },
  { id: 'cosmos',        symbol: 'ATOM', name: 'Cosmos' },
  { id: 'stellar',       symbol: 'XLM',  name: 'Stellar' },
  { id: 'hyperliquid',   symbol: 'HYPE', name: 'Hyperliquid' },
  { id: 'sui',           symbol: 'SUI',  name: 'Sui' },
  { id: 'aptos',         symbol: 'APT',  name: 'Aptos' },
  { id: 'near',          symbol: 'NEAR', name: 'NEAR Protocol' },
  { id: 'injective',     symbol: 'INJ',  name: 'Injective' },
  { id: 'arbitrum',      symbol: 'ARB',  name: 'Arbitrum' },
  { id: 'optimism',      symbol: 'OP',   name: 'Optimism' },
  { id: 'ton',           symbol: 'TON',  name: 'TON' },
  { id: 'filecoin',      symbol: 'FIL',  name: 'Filecoin' },
  { id: 'internet-computer', symbol: 'ICP', name: 'Internet Computer' },
  { id: 'algorand',      symbol: 'ALGO', name: 'Algorand' },
  { id: 'vechain',       symbol: 'VET',  name: 'VeChain' },
  { id: 'fantom',        symbol: 'FTM',  name: 'Fantom' },
  { id: 'hedera',        symbol: 'HBAR', name: 'Hedera' },
  { id: 'theta',         symbol: 'THETA',name: 'Theta Network' },
  { id: 'monero',        symbol: 'XMR',  name: 'Monero' },
  { id: 'tether',        symbol: 'USDT', name: 'Tether' },
  { id: 'usd-coin',      symbol: 'USDC', name: 'USDC' },
  { id: 'dai',           symbol: 'DAI',  name: 'Dai' },
  // Ambiguous: exist as both crypto and an active stock ticker
  { id: 'coinbase-coin', symbol: 'COIN', name: 'Coinbase Token', ambiguous: true },
];

/** Fast lookup set of known crypto symbols (uppercase) */
export const CRYPTO_SYMBOL_SET = new Set(CRYPTO_ASSETS_LIST.map(a => a.symbol.toUpperCase()));

/** Symbols that also exist as active stock tickers — require user clarification */
export const AMBIGUOUS_SYMBOL_SET = new Set(
  CRYPTO_ASSETS_LIST.filter(a => a.ambiguous).map(a => a.symbol.toUpperCase()),
);

/** Check if a ticker is a known crypto symbol */
export function isCryptoSymbol(ticker: string): boolean {
  return CRYPTO_SYMBOL_SET.has(ticker.toUpperCase());
}

/** Check if a ticker is ambiguous (could be crypto or stock) */
export function isAmbiguousSymbol(ticker: string): boolean {
  return AMBIGUOUS_SYMBOL_SET.has(ticker.toUpperCase());
}

/** Remove known crypto symbols from a stock ticker list */
export function filterOutCryptoTickers(tickers: string[]): string[] {
  return tickers.filter(t => !isCryptoSymbol(t));
}

/** Comma-separated symbol list for injecting into the router prompt */
export const CRYPTO_SYMBOLS_FOR_PROMPT = CRYPTO_ASSETS_LIST.map(a => a.symbol).join(', ');
