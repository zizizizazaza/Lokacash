import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { buildSignedHeaders, getOkxCredentials } from './sign.js';
import type { OkxCoinSentiment, OkxEnvelope, OkxNewsBundle, OkxNewsItem } from './types.js';

const OKX_BASE = (process.env.OKX_API_BASE || 'https://www.okx.com').replace(/\/$/, '');
const TIMEOUT_MS = Math.max(2_000, Number(process.env.OKX_NEWS_TIMEOUT_MS || '6000'));

let proxyInitialized = false;
function initProxy(): void {
  if (proxyInitialized) return;
  const proxy = (
    process.env.OKX_HTTPS_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    ''
  ).trim();
  if (proxy) {
    try {
      setGlobalDispatcher(new ProxyAgent(proxy));
    } catch (err) {
      console.error('[okx-news] proxy init failed', (err as Error)?.message);
    }
  }
  proxyInitialized = true;
}

function clip(s: string, max = 180): string {
  const v = (s || '').replace(/\s+/g, ' ').trim();
  return v.length <= max ? v : `${v.slice(0, max)}…`;
}

async function orbitGet<T>(endpoint: string, params: Record<string, string | number | undefined>): Promise<T> {
  initProxy();
  const creds = getOkxCredentials();
  if (!creds) throw new Error('okx_creds_missing');

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    query.set(k, String(v));
  }
  const qs = query.toString();
  const requestPath = `${endpoint}${qs ? `?${qs}` : ''}`;
  const url = `${OKX_BASE}${requestPath}`;

  const headers = buildSignedHeaders({
    method: 'GET',
    requestPath,
    apiKey: creds.apiKey,
    apiSecret: creds.apiSecret,
    apiPassphrase: creds.apiPassphrase,
    language: 'zh-CN',
  });

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OKX news HTTP ${res.status}: ${clip(text, 160)}`);
  }
  const body = (await res.json()) as OkxEnvelope<T>;
  if (body?.code && body.code !== '0') {
    throw new Error(`OKX news code=${body.code} msg="${clip(body.msg || '', 120)}"`);
  }
  return body.data;
}

function normalizeNewsItem(raw: any, matchCoin?: string): OkxNewsItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const coins: string[] = Array.isArray(raw.ccyList)
    ? raw.ccyList.map((c: any) => String(c).toUpperCase()).filter(Boolean)
    : [];

  let sentiment: string | undefined;
  if (Array.isArray(raw.ccySentiments)) {
    const match = matchCoin
      ? raw.ccySentiments.find((c: any) => String(c?.ccy || '').toUpperCase() === matchCoin.toUpperCase())
      : raw.ccySentiments[0];
    if (match?.sentiment) sentiment = String(match.sentiment);
  }

  let publishedAt: string | undefined;
  const ctime = raw.cTime ?? raw.publishedAt ?? raw.publishTime;
  if (ctime != null) {
    const n = Number(ctime);
    if (Number.isFinite(n) && n > 1e9) {
      publishedAt = new Date(n < 1e12 ? n * 1000 : n).toISOString();
    } else if (typeof ctime === 'string') {
      publishedAt = ctime;
    }
  }

  const platformList: string[] = Array.isArray(raw.platformList)
    ? raw.platformList.map((p: any) => String(p)).filter(Boolean)
    : [];

  return {
    id: raw.id ?? raw.newsId ?? undefined,
    title: raw.title ?? raw.headline ?? undefined,
    summary: raw.summary ?? raw.description ?? raw.content ?? undefined,
    url: raw.sourceUrl ?? raw.url ?? raw.link ?? undefined,
    publishedAt,
    source: platformList[0] || raw.source || raw.platform || undefined,
    importance: raw.importance ?? raw.level ?? undefined,
    sentiment,
    coins: coins.length ? coins : undefined,
  };
}

/** OKX orbit wraps responses as data[0].details[] (for list endpoints). */
function extractDetails(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data) && data.length && Array.isArray((data[0] as any).details)) {
    return (data[0] as any).details || [];
  }
  if (Array.isArray(data) && data.length && Array.isArray((data[0] as any).dataList)) {
    return (data[0] as any).dataList || [];
  }
  if (Array.isArray(data)) return data;
  return [];
}

export async function fetchLatestNews(opts: {
  coins?: string;
  limit?: number;
  importance?: 'high' | 'normal';
} = {}): Promise<OkxNewsItem[]> {
  // NOTE: OKX orbit uses `ccyList` (not `coins` or `ccy`) to actually filter news by coin.
  // Other param names are silently accepted and ignored, returning unfiltered global news.
  const data = await orbitGet<any>('/api/v5/orbit/news-search', {
    ccyList: opts.coins,
    limit: opts.limit ?? 10,
    importance: opts.importance,
  });
  const matchCoin = opts.coins?.split(',')[0]?.trim()?.toUpperCase();
  return extractDetails(data)
    .map((raw) => normalizeNewsItem(raw, matchCoin))
    .filter((x): x is OkxNewsItem => !!x && !!x.title);
}

export async function fetchCoinSentiment(
  baseCcy: string,
  opts: { period?: '1h' | '24h'; trendPoints?: number; inclTrend?: boolean } = {},
): Promise<OkxCoinSentiment | null> {
  const base = baseCcy.toUpperCase();
  const params: Record<string, string | number | undefined> = {
    ccy: base, // NOTE: OKX orbit uses singular `ccy`, not `ccyList`
    period: opts.period ?? '24h',
  };
  if (opts.trendPoints) {
    params.trendPoints = opts.trendPoints;
    params.period = '1h';
    params.inclTrend = 'true';
  } else if (opts.inclTrend) {
    params.inclTrend = 'true';
  }
  const data = await orbitGet<any>('/api/v5/orbit/currency-sentiment-query', params);
  const details = extractDetails(data);
  const row = details.find((r: any) => String(r?.ccy || '').toUpperCase() === base) || details[0];
  if (!row) return null;

  const toNum = (v: any): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const s = row.sentiment || {};
  const trendRaw = row.trend || [];
  const trend = Array.isArray(trendRaw)
    ? trendRaw.map((p: any) => ({
        ts: Number(p.ts ?? p.timestamp ?? 0),
        bullish: Number(p.bullishRatio ?? p.bullish ?? 0),
        bearish: Number(p.bearishRatio ?? p.bearish ?? 0),
        neutral: Number(p.neutralRatio ?? p.neutral ?? 0),
      }))
    : [];

  // Envelope-level ts is at data[0].ts
  const envTs = Array.isArray(data) && data.length ? Number(data[0].ts) : Date.now();

  return {
    baseCcy: base,
    sentimentScore: null, // OKX returns a label + ratios, not a numeric score
    bullishRatio: toNum(s.bullishRatio != null ? Number(s.bullishRatio) * 100 : null),
    bearishRatio: toNum(s.bearishRatio != null ? Number(s.bearishRatio) * 100 : null),
    neutralRatio: (() => {
      const bullish = toNum(s.bullishRatio);
      const bearish = toNum(s.bearishRatio);
      const neutralCnt = toNum(s.neutralCnt);
      const totalCnt = toNum(row.mentionCnt);
      if (neutralCnt != null && totalCnt && totalCnt > 0) return +(neutralCnt / totalCnt * 100).toFixed(2);
      if (bullish != null && bearish != null) return +((1 - bullish - bearish) * 100).toFixed(2);
      return null;
    })(),
    hotness: toNum(row.mentionCnt),
    trend: trend.length ? trend : undefined,
    ts: envTs,
    label: s.label || undefined,
    newsMentionCnt: toNum(row.newsMentionCnt),
    xMentionCnt: toNum(row.xMentionCnt),
  } as OkxCoinSentiment;
}

/** Convenience: fetch news + sentiment for a single base currency. */
export async function fetchNewsBundle(baseCcy: string, newsLimit = 8): Promise<OkxNewsBundle> {
  const logs: string[] = [];
  const [newsSettled, sentSettled] = await Promise.allSettled([
    fetchLatestNews({ coins: baseCcy, limit: newsLimit }),
    fetchCoinSentiment(baseCcy, { period: '24h' }),
  ]);
  const latestNews = newsSettled.status === 'fulfilled' ? newsSettled.value : [];
  const sentiment = sentSettled.status === 'fulfilled' ? sentSettled.value : null;
  if (newsSettled.status === 'rejected') {
    logs.push(`news_err:${clip((newsSettled.reason as Error)?.message || '', 120)}`);
  }
  if (sentSettled.status === 'rejected') {
    logs.push(`sent_err:${clip((sentSettled.reason as Error)?.message || '', 120)}`);
  }
  return { baseCcy: baseCcy.toUpperCase(), latestNews, sentiment, logs };
}
