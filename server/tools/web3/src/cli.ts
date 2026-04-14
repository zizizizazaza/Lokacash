/**
 * Loka Web3 tool — CoinGecko remote MCP (Streamable HTTP) + REST fallback.
 * Invoked by the Express server via child process; prints one JSON line to stdout.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PUBLIC_MCP = 'https://mcp.api.coingecko.com/mcp';
const PRO_MCP = 'https://mcp.pro-api.coingecko.com/mcp';

function getArgQuery(): string {
  const a = process.argv.slice(2).join(' ').trim();
  if (a) return a;
  return '';
}

type SpotSnapshot = {
  usd?: number;
  usd_24h_change?: number;
  usd_market_cap?: number;
};

const STOP_WORDS = new Set([
  'token',
  'coin',
  'price',
  'market',
  'cap',
  'recent',
  'trends',
  'trend',
  'current',
  'and',
  'the',
  'what',
  'about',
  'how',
  'is',
  'are',
  'of',
  'for',
  'with',
  'news',
  'sentiment',
]);

const ZH_NOISE_RE =
  /(这个代币|这个币|代币|币种|币价|现价|价格|行情|走势|怎么样|如何|多少|是什么|是多少|请问|帮我|看一下|一下|目前|现在|呢|啊|呀|的)$/g;

type SearchCoin = {
  id?: string;
  symbol?: string;
  name?: string;
  market_cap_rank?: number | null;
};

function inferGeckoId(query: string): string {
  const q = query.toLowerCase();
  if (/(btc|bitcoin|比特币)/i.test(q)) return 'bitcoin';
  if (/(eth|ethereum|以太坊)/i.test(q)) return 'ethereum';
  if (/(sol|solana)/i.test(q)) return 'solana';
  if (/(doge|dogecoin|狗狗币)/i.test(q)) return 'dogecoin';
  if (/(shib|shiba inu|shiba|柴犬币|柴犬)/i.test(q)) return 'shiba-inu';
  if (/(pepe|佩佩币|佩佩)/i.test(q)) return 'pepe';
  if (/(bnb|binance coin|币安币)/i.test(q)) return 'binancecoin';
  if (/(ada|cardano|艾达币|卡尔达诺)/i.test(q)) return 'cardano';
  if (/(xrp|ripple|瑞波币)/i.test(q)) return 'ripple';
  if (/(ltc|litecoin|莱特币)/i.test(q)) return 'litecoin';
  if (/aave/i.test(q)) return 'aave';
  if (/rave/i.test(q)) return 'rave-dao';
  return 'bitcoin';
}

function extractTokenHint(query: string): string | undefined {
  const words = (query.match(/[A-Za-z][A-Za-z0-9-]{1,20}/g) || [])
    .map((w) => w.toLowerCase())
    .filter((w) => !STOP_WORDS.has(w));
  return words[0];
}

function extractChineseHint(query: string): string | undefined {
  const segs = query.match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const seg of segs) {
    let cleaned = seg.trim();
    let prev = '';
    while (cleaned && cleaned !== prev) {
      prev = cleaned;
      cleaned = cleaned.replace(ZH_NOISE_RE, '').trim();
    }
    if (cleaned.length >= 2) return cleaned;
  }
  return undefined;
}

function buildSearchCandidates(query: string): string[] {
  const out: string[] = [];
  const push = (v?: string) => {
    const s = (v || '').trim();
    if (!s) return;
    if (!out.includes(s)) out.push(s);
  };
  const zh = extractChineseHint(query);
  push(zh);
  if (zh && zh.endsWith('币') && zh.length > 2) push(zh.slice(0, -1));
  push(extractTokenHint(query));
  push(query.replace(ZH_NOISE_RE, ' ').replace(/\s+/g, ' ').trim());
  return out.slice(0, 3);
}

function scoreCoinCandidate(coin: SearchCoin, term: string): number {
  const symbol = (coin.symbol || '').toLowerCase();
  const name = (coin.name || '').toLowerCase();
  const id = (coin.id || '').toLowerCase();
  const t = term.toLowerCase();
  let score = 0;

  if (symbol === t || name === t || id === t) score += 120;
  if (name.includes(t) || symbol.includes(t) || id.includes(t)) score += 70;
  if (name.startsWith(t) || symbol.startsWith(t) || id.startsWith(t)) score += 40;
  if (/[\u4e00-\u9fff]/.test(term) && coin.name?.includes(term)) score += 80;

  const rank = coin.market_cap_rank;
  if (typeof rank === 'number' && rank > 0) {
    if (rank <= 200) score += 30;
    else if (rank <= 1000) score += 20;
    else score += 8;
  }
  return score;
}

async function resolveGeckoId(query: string): Promise<{ id: string; hint?: string; source: string }> {
  const hints = buildSearchCandidates(query);
  const quick = inferGeckoId(query);
  if (!hints.length) return { id: quick, source: 'quick-map' };

  try {
    let bestCoin: SearchCoin | null = null;
    let bestHint: string | undefined;
    let bestScore = -1;
    for (const hint of hints) {
      const raw = (await fetchRestJson(
        `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(hint)}`,
      )) as { coins?: SearchCoin[] };
      const coins = raw.coins || [];
      for (const coin of coins.slice(0, 20)) {
        const s = scoreCoinCandidate(coin, hint);
        if (s > bestScore) {
          bestScore = s;
          bestCoin = coin;
          bestHint = hint;
        }
      }
    }
    if (!bestCoin?.id) {
      return { id: quick, hint: hints[0], source: 'quick-map-empty-search' };
    }
    return { id: bestCoin.id, hint: bestHint, source: 'coingecko-search' };
  } catch {
    return { id: quick, hint: hints[0], source: 'quick-map-search-failed' };
  }
}

async function getSpotSnapshot(geckoId: string): Promise<SpotSnapshot | null> {
  const data = (await fetchRestJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
      geckoId,
    )}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
  )) as Record<string, SpotSnapshot>;
  return data[geckoId] || Object.values(data)[0] || null;
}

async function fetchRestJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`REST ${res.status}`);
  return res.json();
}

async function restFallbackComplete(query: string, geckoId: string): Promise<string> {
  const label = geckoId;
  const row = await getSpotSnapshot(geckoId);
  if (!row?.usd) {
    return `## Web3 数据（CoinGecko REST 兜底）\n未解析到价格（id=${geckoId}）。`;
  }
  const mc = row.usd_market_cap != null ? `市值（约）: $${(row.usd_market_cap / 1e9).toFixed(2)}B USD\n` : '';
  const ch =
    row.usd_24h_change != null ? `24h 涨跌: ${row.usd_24h_change >= 0 ? '+' : ''}${row.usd_24h_change.toFixed(2)}%\n` : '';
  return (
    `## Web3 数据（CoinGecko REST 兜底）\n` +
    `标的: ${label}\n` +
    `现货价（USD）: $${row.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}\n` +
    ch +
    mc +
    `\n> 说明：官方 MCP 不可用或未匹配到工具时，使用 CoinGecko 公开 REST。生产环境建议配置 COINGECKO_PRO_API_KEY 并走 Pro MCP 或 Pro REST。`
  );
}

function scoreTool(name: string, desc: string): number {
  const t = `${name} ${desc || ''}`.toLowerCase();
  let s = 0;
  if (/price|simple|quote|spot/.test(t)) s += 5;
  if (/coin|token|asset/.test(t)) s += 3;
  if (/market|trend|search|lookup|id/.test(t)) s += 2;
  if (/gecko|terminal|pool|dex|nft|category|history|ohlc|chart/.test(t)) s += 1;
  return s;
}

function pickTool(
  tools: { name: string; description?: string; inputSchema?: { properties?: Record<string, object> } }[],
  query: string,
  geckoId: string,
): { name: string; args: Record<string, unknown> } | null {
  if (!tools.length) return null;
  const ranked = [...tools].sort(
    (a, b) => scoreTool(b.name, b.description ?? '') - scoreTool(a.name, a.description ?? ''),
  );
  const best = ranked[0];
  if (!best) return null;
  const props = best.inputSchema?.properties ?? {};
  const keys = Object.keys(props);
  const args: Record<string, unknown> = {};
  const q = query.trim();
  if (keys.includes('query')) args.query = q;
  else if (keys.includes('q')) args.q = q;
  else if (keys.includes('ids')) args.ids = geckoId;
  else if (keys.includes('id')) args.id = geckoId;
  else if (keys.includes('coin_id')) args.coin_id = geckoId;
  else if (keys.includes('vs_currency')) {
    args.vs_currency = 'usd';
    if (keys.includes('ids')) args.ids = geckoId;
  }
  if (Object.keys(args).length === 0 && keys.length) {
    const first = keys[0];
    args[first] = q;
  }
  return { name: best.name, args };
}

function formatToolResult(result: { content?: { type: string; text?: string }[]; isError?: boolean }): string {
  const parts: string[] = [];
  if (result.isError) parts.push('(tool returned isError)');
  for (const c of result.content ?? []) {
    if (c.type === 'text' && c.text) parts.push(c.text);
  }
  const body = parts.join('\n\n').trim();
  return body || JSON.stringify(result, null, 2);
}

async function runMcp(
  query: string,
): Promise<{ ok: boolean; report: string; via: 'mcp' | 'rest'; resolvedId: string; spotPriceUsd?: number; resolver?: string }> {
  const usePro = Boolean(process.env.COINGECKO_PRO_API_KEY);
  const base = (process.env.COINGECKO_MCP_URL || (usePro ? PRO_MCP : PUBLIC_MCP)).trim();
  const url = new URL(base);
  const resolved = await resolveGeckoId(query);
  const spot = await getSpotSnapshot(resolved.id).catch(() => null);
  console.error(
    `[web3-cli] token_resolve hint=${resolved.hint || '-'} id=${resolved.id} resolver=${resolved.source} spot_usd=${spot?.usd ?? 'n/a'}`,
  );

  const headers: Record<string, string> = { Accept: 'application/json, text/event-stream' };
  if (usePro && process.env.COINGECKO_PRO_API_KEY) {
    headers.Authorization = `Bearer ${process.env.COINGECKO_PRO_API_KEY}`;
  }

  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers },
  });

  const client = new Client({ name: 'loka-web3', version: '0.1.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const pick = pickTool(tools, query, resolved.id);
    if (!pick) {
      await transport.close();
      const r = await restFallbackComplete(query, resolved.id);
      return { ok: true, report: r, via: 'rest', resolvedId: resolved.id, spotPriceUsd: spot?.usd, resolver: resolved.source };
    }
    try {
      const out = await client.callTool({ name: pick.name, arguments: pick.args });
      let text = formatToolResult(out as { content?: { type: string; text?: string }[]; isError?: boolean });
      const maxChars = 14_000;
      if (text.length > maxChars) {
        text =
          text.slice(0, maxChars) +
          `\n\n…(truncated, ${text.length} chars → ${maxChars} for downstream LLM context)`;
      }
      await transport.close();
      return {
        ok: true,
        report:
          `## Web3 数据（CoinGecko MCP）\n` +
          `解析币种: \`${resolved.id}\`\n` +
          (spot?.usd != null ? `现货快照(USD): $${spot.usd}\n` : '') +
          `工具: \`${pick.name}\`\n参数: \`${JSON.stringify(pick.args)}\`\n\n${text}`,
        via: 'mcp',
        resolvedId: resolved.id,
        spotPriceUsd: spot?.usd,
        resolver: resolved.source,
      };
    } catch (toolErr) {
      await transport.close().catch(() => {});
      const r = await restFallbackComplete(query, resolved.id);
      return {
        ok: true,
        report:
          `## Web3 数据\nMCP 工具 \`${pick.name}\` 调用失败（${(toolErr as Error).message}）。已使用 REST 兜底：\n\n${r}`,
        via: 'rest',
        resolvedId: resolved.id,
        spotPriceUsd: spot?.usd,
        resolver: resolved.source,
      };
    }
  } catch (e) {
    try {
      await transport.close();
    } catch {
      /* ignore */
    }
    const r = await restFallbackComplete(query, resolved.id);
    return {
      ok: true,
      report: `## Web3 数据\nCoinGecko MCP 连接失败（${(e as Error).message}）。已使用 REST 兜底：\n\n${r}`,
      via: 'rest',
      resolvedId: resolved.id,
      spotPriceUsd: spot?.usd,
      resolver: resolved.source,
    };
  }
}

async function main() {
  const query = getArgQuery();
  if (!query) {
    console.log(JSON.stringify({ ok: false, error: 'missing_query', report: '' }));
    process.exit(1);
  }
  try {
    const { ok, report, via, resolvedId, spotPriceUsd, resolver } = await runMcp(query);
    console.log(JSON.stringify({ ok, report, via, resolvedId, spotPriceUsd, resolver }));
  } catch (e) {
    console.log(
      JSON.stringify({
        ok: false,
        error: (e as Error).message,
        report: '',
      }),
    );
    process.exit(1);
  }
}

main();
