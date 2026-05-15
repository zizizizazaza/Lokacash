import { BaseTool, type ToolExecutionContext, type ToolResult, type SignalSearchSource } from './types.js';

/**
 * Fetches recent SEC EDGAR filings (10-K / 10-Q / 8-K / 13F / Form 4) for a
 * given US ticker. Pure-Node implementation — no Python subprocess. Hits
 * SEC's free public endpoints directly:
 *
 *   1. https://www.sec.gov/files/company_tickers.json     — ticker → CIK map
 *   2. https://data.sec.gov/submissions/CIK{cik10}.json   — recent filings list
 *
 * SEC requires a descriptive User-Agent header; we set one identifying
 * lokacash. SEC's stated rate limit is 10 req/s — we don't come close.
 *
 * Used by SuperAgent v2 to answer questions like:
 *   - "show me NVDA's latest 10-K risk factors"
 *   - "did AAPL file an 8-K recently?"
 *   - "what insider trading is happening at TSLA?"  (Form 4)
 *
 * For Chinese A-share use `financial_report` instead.
 */
const SEC_USER_AGENT =
  process.env.SEC_EDGAR_USER_AGENT ||
  'Lokacash Research research@lokacash.xyz';

const TICKER_MAP_URL = 'https://www.sec.gov/files/company_tickers.json';
const TICKER_MAP_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

interface SecTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

interface SubmissionsResponse {
  cik: string;
  name: string;
  sic: string;
  sicDescription?: string;
  tickers?: string[];
  exchanges?: string[];
  filings?: {
    recent?: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
      size: number[];
    };
  };
}

interface CachedTickerMap {
  fetchedAt: number;
  byTicker: Map<string, SecTickerEntry>;
}

let cachedTickerMap: CachedTickerMap | null = null;

async function loadTickerMap(): Promise<Map<string, SecTickerEntry>> {
  if (cachedTickerMap && Date.now() - cachedTickerMap.fetchedAt < TICKER_MAP_TTL_MS) {
    return cachedTickerMap.byTicker;
  }
  const res = await fetch(TICKER_MAP_URL, {
    headers: { 'User-Agent': SEC_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`SEC ticker map fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as Record<string, SecTickerEntry>;
  const byTicker = new Map<string, SecTickerEntry>();
  for (const entry of Object.values(data)) {
    byTicker.set(entry.ticker.toUpperCase(), entry);
  }
  cachedTickerMap = { fetchedAt: Date.now(), byTicker };
  return byTicker;
}

function padCik(cikInt: number): string {
  return cikInt.toString().padStart(10, '0');
}

function fmtAccessionForUrl(accession: string): string {
  // "0000320193-26-000010" → "000032019326000010"
  return accession.replace(/-/g, '');
}

interface FilingSummary {
  form: string;
  filingDate: string;
  reportDate: string;
  accessionNumber: string;
  primaryDocument: string;
  primaryDocDescription: string;
  primaryDocUrl: string;
  filingIndexUrl: string;
  sizeBytes: number;
}

async function fetchFilings(cikInt: number): Promise<{ company: SubmissionsResponse; filings: FilingSummary[] }> {
  const cik10 = padCik(cikInt);
  const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const res = await fetch(url, { headers: { 'User-Agent': SEC_USER_AGENT } });
  if (!res.ok) {
    throw new Error(`SEC submissions fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as SubmissionsResponse;
  const r = data.filings?.recent;
  if (!r) return { company: data, filings: [] };
  const filings: FilingSummary[] = [];
  const n = r.accessionNumber.length;
  for (let i = 0; i < n; i++) {
    const accession = r.accessionNumber[i];
    const accessionNoDash = fmtAccessionForUrl(accession);
    const primaryDoc = r.primaryDocument[i] || '';
    filings.push({
      form: r.form[i] || '',
      filingDate: r.filingDate[i] || '',
      reportDate: r.reportDate[i] || '',
      accessionNumber: accession,
      primaryDocument: primaryDoc,
      primaryDocDescription: r.primaryDocDescription?.[i] || '',
      primaryDocUrl: `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accessionNoDash}/${primaryDoc}`,
      filingIndexUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik10}&type=${r.form[i]}&dateb=&owner=include&count=40`,
      sizeBytes: r.size?.[i] || 0,
    });
  }
  return { company: data, filings };
}

export class SecFilingsTool extends BaseTool {
  readonly name = 'sec_filings';
  readonly description =
    'List recent SEC EDGAR filings (10-K, 10-Q, 8-K, 13F, Form 4, etc.) for a US ticker — provides links to the official filings and metadata. ' +
    'Use when the user asks about US public-company official disclosures: "show me NVDA latest 10-K", "did AAPL file an 8-K", "TSLA insider trading", "AMZN risk factors", "GOOG MD&A", "13F holdings of X". ' +
    'ONLY for US-listed companies. For Chinese A-share use `financial_report`. Returns filing metadata + direct URLs (full-document fetching is NOT automatic — quote the URL for the user to open).';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      ticker: {
        type: 'string',
        description: 'US ticker symbol, e.g. "NVDA", "AAPL", "TSLA", "GOOGL", "BRK.B".',
      },
      form_types: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional filter on filing form types. Examples: ["10-K"] for annual reports, ["10-Q"] for quarterlies, ["8-K"] for material events, ["10-K","10-Q","8-K"] for the common trio, ["4"] for insider trades (Form 4), ["13F-HR"] for institutional holdings. Default: ["10-K","10-Q","8-K"].',
      },
      limit: {
        type: 'integer',
        description: 'Max filings to return (default 10, max 30). Per-form type, so limit=5 + form_types=[10-K,10-Q,8-K] returns up to 15 total.',
      },
    },
    required: ['ticker'],
    additionalProperties: false,
  };

  async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const tickerRaw = String(args.ticker || '').trim();
    if (!tickerRaw) {
      return { ok: false, content: '', error: 'sec_filings: ticker is required' };
    }
    const ticker = tickerRaw.toUpperCase().replace(/\./g, '-'); // BRK.B → BRK-B
    const formTypes = Array.isArray(args.form_types) && args.form_types.length > 0
      ? (args.form_types as unknown[]).map((f) => String(f).toUpperCase())
      : ['10-K', '10-Q', '8-K'];
    const limitPerForm = Math.min(30, Math.max(1, typeof args.limit === 'number' ? args.limit : 10));

    const startTs = Date.now();
    type ToolStage = {
      stage: string;
      title_en: string;
      title_zh: string;
      state: 'active' | 'completed' | 'failed';
      durationMs?: number;
      argsData?: unknown;
      rawData?: unknown;
    };
    const stage: ToolStage = {
      stage: 'sec_filings',
      title_en: 'SEC EDGAR filings',
      title_zh: 'SEC 文件检索',
      state: 'active',
      argsData: { ticker, form_types: formTypes, limit: limitPerForm },
    };
    ctx.emitter.emitModule('analysis', 'active', {
      tickers: [ticker],
      toolStages: [stage],
    });

    try {
      const tickerMap = await loadTickerMap();
      const entry = tickerMap.get(ticker);
      if (!entry) {
        stage.state = 'failed';
        stage.durationMs = Date.now() - startTs;
        stage.rawData = { error: 'ticker_not_found', ticker };
        ctx.emitter.emitModule('analysis', 'completed', {
          tickers: [ticker],
          toolStages: [stage],
          error: 'ticker_not_found',
        });
        return {
          ok: false,
          content: '',
          error: `sec_filings: ticker "${ticker}" not found in SEC company database. Is it a US-listed company?`,
        };
      }

      const { company, filings } = await fetchFilings(entry.cik_str);
      if (filings.length === 0) {
        return {
          ok: true,
          content: `# SEC filings — ${entry.ticker} (${company.name})\n\n_No filings returned by EDGAR for CIK ${padCik(entry.cik_str)}._`,
        };
      }

      // Group by requested form types, keeping the most recent N of each
      const grouped: Record<string, FilingSummary[]> = {};
      for (const f of filings) {
        const formUpper = (f.form || '').toUpperCase();
        if (!formTypes.includes(formUpper)) continue;
        if (!grouped[formUpper]) grouped[formUpper] = [];
        if (grouped[formUpper].length < limitPerForm) {
          grouped[formUpper].push(f);
        }
      }

      const totalMatched = Object.values(grouped).reduce((s, arr) => s + arr.length, 0);

      // Build a clean markdown payload for the synthesis LLM.
      const lines: string[] = [];
      lines.push(`# SEC EDGAR — ${entry.ticker} (${company.name})`);
      const meta: string[] = [`CIK: ${padCik(entry.cik_str)}`];
      if (company.sicDescription) meta.push(`Industry: ${company.sicDescription}`);
      if (company.exchanges && company.exchanges.length) meta.push(`Exchanges: ${company.exchanges.join(', ')}`);
      lines.push(`_${meta.join(' · ')}_`);
      lines.push('');
      lines.push(`Matched ${totalMatched} filing(s) across form types: ${formTypes.join(', ')}.`);

      for (const formType of formTypes) {
        const arr = grouped[formType] || [];
        if (arr.length === 0) {
          lines.push(`\n## ${formType}\n\n_No recent ${formType} filings found._`);
          continue;
        }
        lines.push(`\n## ${formType}`);
        for (const f of arr) {
          const ageDays = daysAgo(f.filingDate);
          lines.push('');
          lines.push(`- **${f.filingDate}** (${ageDays} days ago) — ${f.primaryDocDescription || f.form}`);
          lines.push(`  - Accession: \`${f.accessionNumber}\``);
          lines.push(`  - Report period: ${f.reportDate || 'n/a'}`);
          lines.push(`  - Document: [${f.primaryDocument}](${f.primaryDocUrl})`);
          lines.push(`  - Filing index: [browse on EDGAR](${f.filingIndexUrl})`);
        }
      }

      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push(
        '**For the synthesis model**: cite filings with their filing date + form type (e.g. "per the 10-Q filed 2026-04-25"). When the user wants the actual content (e.g. "what does the Risk Factors say"), include the document URL as a markdown link so they can open the official filing. Do NOT pretend to have read the full document — only the metadata + URL is available from this tool. If the user wants deep section-by-section parsing, tell them to paste the 10-K excerpt back into the chat or request a follow-up that extracts a specific section.',
      );

      // Build SignalSearchSource list so the UI footer shows clickable
      // citations the same way web_research does.
      const sources: SignalSearchSource[] = [];
      const seenUrls = new Set<string>();
      for (const formType of formTypes) {
        for (const f of (grouped[formType] || []).slice(0, 5)) {
          if (seenUrls.has(f.primaryDocUrl)) continue;
          seenUrls.add(f.primaryDocUrl);
          sources.push({
            favicon: 'web',
            title: `${entry.ticker} ${formType} (${f.filingDate})`,
            domain: 'sec.gov',
            url: f.primaryDocUrl,
            snippet: f.primaryDocDescription || `Official ${formType} filing on SEC EDGAR.`,
          });
        }
      }

      // Trim each filing for the rawData card payload — front end only
      // needs form / date / description / URL per row; sizeBytes etc. are
      // noise. Cap at 5 rows per form type to keep payload small.
      const cardFilings: Record<string, Array<Record<string, unknown>>> = {};
      for (const formType of formTypes) {
        const arr = (grouped[formType] || []).slice(0, 5);
        if (arr.length > 0) {
          cardFilings[formType] = arr.map((f) => ({
            form: f.form,
            filingDate: f.filingDate,
            reportDate: f.reportDate,
            primaryDocDescription: f.primaryDocDescription,
            primaryDocUrl: f.primaryDocUrl,
            filingIndexUrl: f.filingIndexUrl,
          }));
        }
      }
      stage.state = 'completed';
      stage.durationMs = Date.now() - startTs;
      stage.rawData = {
        ticker: entry.ticker,
        cik: padCik(entry.cik_str),
        companyName: company.name,
        sicDescription: company.sicDescription,
        exchanges: company.exchanges,
        formTypes,
        totalMatched,
        filings: cardFilings,
      };
      ctx.emitter.emitModule('analysis', 'completed', {
        tickers: [ticker],
        toolStages: [stage],
        count: totalMatched,
      });

      return {
        ok: true,
        content: lines.join('\n').slice(0, 14000),
        sources,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stage.state = 'failed';
      stage.durationMs = Date.now() - startTs;
      stage.rawData = { error: message };
      ctx.emitter.emitModule('analysis', 'completed', {
        tickers: [ticker],
        toolStages: [stage],
        error: message,
      });
      return { ok: false, content: '', error: `sec_filings: ${message}` };
    }
  }
}

function daysAgo(isoDate: string): number {
  if (!isoDate) return -1;
  const t = new Date(isoDate).getTime();
  if (!Number.isFinite(t)) return -1;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}
