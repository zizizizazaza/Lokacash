/**
 * Known crypto assets for web3 query resolution.
 * Keep in sync with server/src/constants/cryptoAssets.ts when adding new tokens.
 */
export const CRYPTO_ASSETS: Array<{ id: string; symbol: string; name: string; patterns: RegExp[] }> = [
  { id: 'bitcoin',       symbol: 'btc',  name: 'Bitcoin',    patterns: [/\bbtc\b/i, /\bbitcoin\b/i, /比特币/] },
  { id: 'ethereum',      symbol: 'eth',  name: 'Ethereum',   patterns: [/\beth\b/i, /\bethereum\b/i, /以太坊/] },
  { id: 'solana',        symbol: 'sol',  name: 'Solana',     patterns: [/\bsol\b/i, /\bsolana\b/i, /索拉纳|sol链/] },
  { id: 'binancecoin',   symbol: 'bnb',  name: 'BNB',        patterns: [/\bbnb\b/i, /binance coin/i, /币安币/] },
  { id: 'ripple',        symbol: 'xrp',  name: 'XRP',        patterns: [/\bxrp\b/i, /\bripple\b/i, /瑞波/] },
  { id: 'cardano',       symbol: 'ada',  name: 'Cardano',    patterns: [/\bada\b/i, /\bcardano\b/i, /艾达|卡尔达诺/] },
  { id: 'dogecoin',      symbol: 'doge', name: 'Dogecoin',   patterns: [/\bdoge\b/i, /\bdogecoin\b/i, /狗狗币/] },
  { id: 'shiba-inu',     symbol: 'shib', name: 'Shiba Inu',  patterns: [/\bshib\b/i, /\bshiba\b/i, /柴犬币|柴犬/] },
  { id: 'pepe',          symbol: 'pepe', name: 'Pepe',       patterns: [/\bpepe\b/i, /佩佩/] },
  { id: 'aave',          symbol: 'aave', name: 'Aave',       patterns: [/\baave\b/i] },
  { id: 'ravedao',       symbol: 'rave', name: 'RAVE DAO',   patterns: [/\brave\b/i, /\brave-dao\b/i, /\bravedao\b/i] },
  { id: 'polkadot',      symbol: 'dot',  name: 'Polkadot',   patterns: [/\bdot\b/i, /\bpolkadot\b/i, /波卡/] },
  { id: 'chainlink',     symbol: 'link', name: 'Chainlink',  patterns: [/\blink\b/i, /\bchainlink\b/i] },
  { id: 'avalanche-2',   symbol: 'avax', name: 'Avalanche',  patterns: [/\bavax\b/i, /\bavalanche\b/i] },
  { id: 'matic-network', symbol: 'matic',name: 'Polygon',    patterns: [/\bmatic\b/i, /\bpolygon\b/i] },
  { id: 'uniswap',       symbol: 'uni',  name: 'Uniswap',    patterns: [/\buni\b/i, /\buniswap\b/i] },
  { id: 'tron',          symbol: 'trx',  name: 'TRON',       patterns: [/\btrx\b/i, /\btron\b/i] },
  { id: 'litecoin',      symbol: 'ltc',  name: 'Litecoin',   patterns: [/\bltc\b/i, /\blitecoin\b/i] },
  { id: 'cosmos',        symbol: 'atom', name: 'Cosmos',     patterns: [/\batom\b/i, /\bcosmos\b/i] },
  { id: 'stellar',       symbol: 'xlm',  name: 'Stellar',    patterns: [/\bxlm\b/i, /\bstellar\b/i] },
  { id: 'hyperliquid',   symbol: 'hype', name: 'Hyperliquid',patterns: [/\bhype\b/i, /\bhyperliquid\b/i] },
  { id: 'sui',           symbol: 'sui',  name: 'Sui',        patterns: [/\bsui\b/i] },
  { id: 'aptos',         symbol: 'apt',  name: 'Aptos',      patterns: [/\bapt\b/i, /\baptos\b/i] },
  { id: 'near',          symbol: 'near', name: 'NEAR Protocol', patterns: [/\bnear\b/i] },
  { id: 'injective',     symbol: 'inj',  name: 'Injective',  patterns: [/\binj\b/i, /\binjective\b/i] },
  { id: 'arbitrum',      symbol: 'arb',  name: 'Arbitrum',   patterns: [/\barb\b/i, /\barbitrum\b/i] },
  { id: 'optimism',      symbol: 'op',   name: 'Optimism',   patterns: [/\boptimism\b/i] },
  { id: 'ton',           symbol: 'ton',  name: 'TON',        patterns: [/\bton\b/i, /\btoncoin\b/i] },
];
