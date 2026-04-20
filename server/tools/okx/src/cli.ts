/**
 * Loka OKX tool — public-endpoint market + derivatives data.
 * Invoked by the Express server via child process.
 *
 * Input (stdin OR CLI arg):
 *   JSON: {"intent":"market_snapshot","baseCcy":"BTC"}
 *   CLI short form: `node dist/cli.js market_snapshot BTC` (fallback)
 *
 * Output: one JSON line on stdout, shape `OkxCliResult`.
 */
import { getInstrumentsCache, isListed, resolveSpotInstId, resolveSwapInstId } from './instruments.js';
import {
  fetchCandles,
  fetchFundingRate,
  fetchMarketSnapshot,
  fetchOpenInterest,
  fetchOrderBook,
  fetchTicker,
} from './market.js';
import {
  fetchCoinSentiment,
  fetchLatestNews,
  fetchNewsBundle,
} from './news.js';
import { hasOkxCredentials } from './sign.js';
import type { OkxCliResult, OkxIntent, OkxRequest } from './types.js';

function fmtNum(v: number | null | undefined, digits = 4): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return v.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 2 : 6 })}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  return new Promise<string>((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buf += chunk;
    });
    process.stdin.on('end', () => resolve(buf.trim()));
    process.stdin.on('error', () => resolve(buf.trim()));
  });
}

function parseCliArgs(): OkxRequest | null {
  const args = process.argv.slice(2);
  if (!args.length) return null;
  // Try JSON-as-single-arg first
  const joined = args.join(' ').trim();
  if (joined.startsWith('{')) {
    try {
      return JSON.parse(joined) as OkxRequest;
    } catch {
      /* fallthrough */
    }
  }
  // Short form: <intent> <instId-or-baseCcy>
  const [intent, a1, a2] = args;
  if (!intent) return null;
  const req: OkxRequest = { intent: intent as OkxIntent };
  if (a1) {
    if (['ticker', 'candles', 'orderbook', 'funding_rate', 'open_interest'].includes(intent)) {
      req.instId = a1;
    } else {
      req.baseCcy = a1.toUpperCase();
    }
  }
  if (a2 && intent === 'candles') req.bar = a2;
  return req;
}

function emit(result: OkxCliResult): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function buildSnapshotReport(snap: Awaited<ReturnType<typeof fetchMarketSnapshot>>): string {
  const lines: string[] = [];
  lines.push(`## OKX 行情快照（${snap.baseCcy}）`);
  if (snap.spot) {
    lines.push(`现货 ${snap.spotInstId}: 最新 ${fmtUsd(snap.spot.last)} | 24h ${fmtPct(snap.spot.change24hPct)} | 区间 ${fmtUsd(snap.spot.low24h)} — ${fmtUsd(snap.spot.high24h)}`);
    lines.push(`24h 成交: base ${fmtNum(snap.spot.volume24hBase, 2)} / quote ${fmtUsd(snap.spot.volume24hQuote)}`);
  } else {
    lines.push('现货: 未在 OKX SPOT 上架');
  }
  if (snap.derivatives) {
    const fr = snap.derivatives.fundingRate;
    const frStr = fr == null ? 'n/a' : `${(fr * 100).toFixed(4)}%`;
    lines.push(`永续 ${snap.swapInstId}: funding ${frStr} | OI ${fmtNum(snap.derivatives.openInterest, 2)} (${fmtUsd(snap.derivatives.openInterestUsd)})`);
  } else if (!snap.swapInstId) {
    lines.push('永续: 未上架');
  }
  if (snap.orderbookDepthUsd != null) {
    lines.push(`Orderbook 深度（±10 档）: ${fmtUsd(snap.orderbookDepthUsd)}`);
  }
  if (snap.candles && snap.candles.length) {
    lines.push(`K 线样本: ${snap.candles.length} 根 1D（最新 close=${fmtUsd(snap.candles[0][4])}）`);
  }
  if (snap.logs.length) lines.push(`logs: ${snap.logs.join(' | ')}`);
  return lines.join('\n');
}

async function dispatch(req: OkxRequest): Promise<OkxCliResult> {
  const logs: string[] = [];
  const intent = req.intent;
  try {
    switch (intent) {
      case 'ticker': {
        if (!req.instId) throw new Error('missing instId');
        const data = await fetchTicker(req.instId);
        return {
          ok: !!data,
          intent,
          report: data ? `OKX ticker ${data.instId}: ${data.last}` : 'no data',
          payload: data,
          logs,
        };
      }
      case 'candles': {
        if (!req.instId) throw new Error('missing instId');
        const data = await fetchCandles(req.instId, req.bar || '1D', req.limit ?? 100);
        return { ok: true, intent, report: `OKX candles ${req.instId} ${req.bar || '1D'} rows=${data.length}`, payload: data, logs };
      }
      case 'orderbook': {
        if (!req.instId) throw new Error('missing instId');
        const data = await fetchOrderBook(req.instId, req.sz ?? 20);
        return { ok: !!data, intent, report: `OKX orderbook ${req.instId}`, payload: data, logs };
      }
      case 'funding_rate': {
        if (!req.instId) throw new Error('missing instId');
        const data = await fetchFundingRate(req.instId);
        return { ok: !!data, intent, report: data ? `OKX funding ${data.instId}: ${data.fundingRate}` : 'no data', payload: data, logs };
      }
      case 'open_interest': {
        if (!req.instId) throw new Error('missing instId');
        const data = await fetchOpenInterest((req.instType as 'SWAP') || 'SWAP', req.instId);
        return { ok: !!data, intent, report: data ? `OKX OI ${data.instId}: ${data.oi}` : 'no data', payload: data, logs };
      }
      case 'instruments': {
        const c = await getInstrumentsCache();
        return {
          ok: true,
          intent,
          report: `OKX instruments spot=${c.spot.size} swap=${c.swap.size} uniqueBase=${c.baseSet.size}`,
          payload: { spotCount: c.spot.size, swapCount: c.swap.size, baseCount: c.baseSet.size, loadedAt: c.loadedAt },
          logs,
        };
      }
      case 'is_listed': {
        if (!req.baseCcy) throw new Error('missing baseCcy');
        const listed = await isListed(req.baseCcy);
        const spotInstId = listed ? await resolveSpotInstId(req.baseCcy) : null;
        const swapInstId = listed ? await resolveSwapInstId(req.baseCcy) : null;
        return { ok: true, intent, report: `OKX listed(${req.baseCcy})=${listed}`, payload: { listed, spotInstId, swapInstId }, logs };
      }
      case 'market_snapshot': {
        if (!req.baseCcy) throw new Error('missing baseCcy');
        const snap = await fetchMarketSnapshot(req.baseCcy, req.limit ?? 30);
        return { ok: true, intent, report: buildSnapshotReport(snap), payload: snap, logs: [...logs, ...snap.logs] };
      }
      case 'news_latest': {
        if (!hasOkxCredentials()) {
          return { ok: false, intent, report: '', error: 'okx_creds_missing', logs };
        }
        const data = await fetchLatestNews({ coins: req.baseCcy, limit: req.limit ?? 10 });
        return { ok: true, intent, report: `OKX news latest: ${data.length} items`, payload: data, logs };
      }
      case 'news_by_coin': {
        if (!hasOkxCredentials()) {
          return { ok: false, intent, report: '', error: 'okx_creds_missing', logs };
        }
        if (!req.baseCcy) throw new Error('missing baseCcy');
        const data = await fetchLatestNews({ coins: req.baseCcy, limit: req.limit ?? 10 });
        return { ok: true, intent, report: `OKX news ${req.baseCcy}: ${data.length} items`, payload: data, logs };
      }
      case 'coin_sentiment': {
        if (!hasOkxCredentials()) {
          return { ok: false, intent, report: '', error: 'okx_creds_missing', logs };
        }
        if (!req.baseCcy) throw new Error('missing baseCcy');
        const data = await fetchCoinSentiment(req.baseCcy, { period: '24h' });
        return { ok: !!data, intent, report: data ? `OKX sentiment ${req.baseCcy}` : 'no sentiment data', payload: data, logs };
      }
      case 'news_bundle': {
        if (!hasOkxCredentials()) {
          return { ok: false, intent, report: '', error: 'okx_creds_missing', logs };
        }
        if (!req.baseCcy) throw new Error('missing baseCcy');
        const bundle = await fetchNewsBundle(req.baseCcy, req.limit ?? 8);
        return {
          ok: true,
          intent,
          report: `OKX news bundle ${bundle.baseCcy}: news=${bundle.latestNews.length} sentiment=${bundle.sentiment ? 'ok' : 'n/a'}`,
          payload: bundle,
          logs: [...logs, ...bundle.logs],
        };
      }
      default:
        return { ok: false, intent, report: '', error: `unknown intent: ${intent}`, logs };
    }
  } catch (err) {
    const msg = (err as Error)?.message || String(err);
    return { ok: false, intent, report: '', error: msg, logs };
  }
}

async function main(): Promise<void> {
  let req: OkxRequest | null = parseCliArgs();
  if (!req) {
    const stdinRaw = await readStdin();
    if (stdinRaw) {
      try {
        req = JSON.parse(stdinRaw) as OkxRequest;
      } catch (err) {
        emit({ ok: false, intent: 'ticker', report: '', error: `invalid stdin json: ${(err as Error).message}`, logs: [] });
        return;
      }
    }
  }
  if (!req || !req.intent) {
    emit({ ok: false, intent: 'ticker', report: '', error: 'missing_request', logs: [] });
    return;
  }
  const result = await dispatch(req);
  emit(result);
}

main().catch((err) => {
  emit({ ok: false, intent: 'ticker', report: '', error: (err as Error)?.message || String(err), logs: [] });
});
