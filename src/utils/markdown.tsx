import React, { createContext, useContext } from 'react';

// ─── Source Context for inline citation tooltips ────────────────
export interface CitationSource {
  favicon: string;
  title: string;
  domain: string;
  url?: string;
  snippet?: string;
}

const SourcesContext = createContext<CitationSource[]>([]);

/** Wrap markdown rendering to provide sources for citation tooltips */
export function SourcesProvider({ sources, children }: { sources: CitationSource[]; children: React.ReactNode }) {
  return <SourcesContext.Provider value={sources}>{children}</SourcesContext.Provider>;
}

// ─── Quote Snapshot Card ────────────────────────────────────────

interface QuoteData {
  symbol: string;
  name?: string;
  market?: string;
  lang?: string;
  price?: string;
  change?: string;
  volume?: string;
  amount?: string;
  high?: string;
  low?: string;
  open?: string;
  prevClose?: string;
  marketCap?: string;
  pe?: string;
  pb?: string;
  turnover?: string;
  asOf?: string;
}

/**
 * Parse a "Quote Snapshot" / "标的信息" section from markdown content.
 * Returns the parsed data and the content with the section removed.
 */
export function extractQuoteSnapshot(content: string): { quote: QuoteData | null; body: string } {
  // Match heading (## or ### or **bold**) containing "Quote Snapshot" or "标的信息"
  // followed by bullet list items, up to the next heading or horizontal rule
  const pattern = /\n?(?:#{1,3}\s+|(?:\*\*))(?:[^\n]*?(?:Quote\s*Snapshot|标的信息)[^\n]*?)(?:\*\*)?\s*\n((?:\s*[-•*]\s+.+\n?)+)/i;
  const match = content.match(pattern);
  if (!match) return { quote: null, body: content };

  const lines = match[1].split('\n').filter(l => l.trim());
  const data: Record<string, string> = {};

  for (const line of lines) {
    const kv = line.replace(/^\s*[-•*]\s+/, '').trim();
    // Match **Key**: Value or **Key**：Value
    const m = kv.match(/\*\*(.+?)\*\*\s*[:：]\s*(.+)/);
    if (m) {
      data[m[1].trim().toLowerCase()] = m[2].trim();
    }
  }

  // Map known keys
  const symbol = data['symbol'] || data['证券代码'] || data['代码'] || '';
  if (!symbol) return { quote: null, body: content };

  const quote: QuoteData = {
    symbol,
    name: data['name'] || data['股票名称'] || data['名称'] || undefined,
    market: data['market'] || data['所属市场'] || data['市场'] || data['交易所'] || undefined,
    price: data['last price'] || data['last'] || data['最新价'] || data['现价'] || undefined,
    change: data['change (%)'] || data['change'] || data['chg%'] || data['涨跌幅'] || data['涨跌'] || undefined,
    volume: data['volume'] || data['成交量'] || data['成交额'] || undefined,
    asOf: data['as of'] || data['数据时点'] || data['报价时间'] || data['交易日'] || undefined,
  };

  // Extract name from symbol if it contains parentheses: "TSLA (Tesla, Inc.)"
  if (!quote.name) {
    const nameMatch = symbol.match(/\((.+?)\)/);
    if (nameMatch) quote.name = nameMatch[1];
  }

  // Clean symbol of parenthetical
  quote.symbol = symbol.replace(/\s*\(.+?\)/, '').trim();

  const body = content.slice(0, match.index! + (match.index! > 0 ? 0 : 0)) +
    content.slice(match.index! + match[0].length);

  return { quote, body: body.replace(/^\n{3,}/, '\n\n') };
}

/** Bilingual label map keyed by lang */
const LABELS: Record<string, Record<string, string>> = {
  zh: { open: '开盘', prevClose: '昨收', high: '最高', low: '最低', volume: '成交量', amount: '成交额', marketCap: '市值', pe: 'PE', pb: 'PB', turnover: '换手率' },
  en: { open: 'Open', prevClose: 'Prev Close', high: 'High', low: 'Low', volume: 'Volume', amount: 'Amount', marketCap: 'Mkt Cap', pe: 'PE', pb: 'PB', turnover: 'Turnover' },
};

/** Market badge style map (supports both zh & en market labels) */
const MKT_STYLE: Record<string, string> = {
  '美股': 'bg-blue-500/10 text-blue-600', '港股': 'bg-amber-500/10 text-amber-600', 'A股': 'bg-red-500/10 text-red-600',
  'US': 'bg-blue-500/10 text-blue-600', 'HK': 'bg-amber-500/10 text-amber-600', 'A-Share': 'bg-red-500/10 text-red-600',
};

/** Renders a stock quote snapshot as a styled card */
export function QuoteCard({ quote }: { quote: QuoteData }) {
  const lang = quote.lang || 'zh';
  const L = LABELS[lang] || LABELS.zh;

  const isPositive = quote.change ? /^\+|涨/.test(quote.change) : null;
  const isNegative = quote.change ? /^-|跌/.test(quote.change) : null;
  const changeColor = isPositive ? 'text-emerald-600' : isNegative ? 'text-red-500' : 'text-gray-500';
  const changeBg = isPositive
    ? 'bg-emerald-500/8 ring-1 ring-emerald-500/20'
    : isNegative
    ? 'bg-red-500/8 ring-1 ring-red-500/20'
    : 'bg-gray-100 ring-1 ring-gray-200/60';

  // Subtle background tint based on price movement
  const cardBg = isPositive
    ? 'bg-gradient-to-br from-emerald-50/40 via-white to-white'
    : isNegative
    ? 'bg-gradient-to-br from-red-50/40 via-white to-white'
    : 'bg-gradient-to-br from-gray-50/40 via-white to-white';

  const mktCls = quote.market ? (MKT_STYLE[quote.market] || 'bg-gray-100 text-gray-500') : '';

  // Helper: check if a value is meaningful (not N/A, empty, zero-ish)
  const ok = (v?: string) => v && !/^(n\/?a|--|—|0\.?0*|undefined|null)$/i.test(v.trim());

  // Build stats array with localized labels, skipping empty/N/A
  const stats: { label: string; value: string }[] = [];
  if (ok(quote.open)) stats.push({ label: L.open, value: quote.open! });
  if (ok(quote.prevClose)) stats.push({ label: L.prevClose, value: quote.prevClose! });
  if (ok(quote.high)) stats.push({ label: L.high, value: quote.high! });
  if (ok(quote.low)) stats.push({ label: L.low, value: quote.low! });
  if (ok(quote.volume)) stats.push({ label: L.volume, value: quote.volume! });
  if (ok(quote.amount)) stats.push({ label: L.amount, value: quote.amount! });
  if (ok(quote.marketCap)) stats.push({ label: L.marketCap, value: quote.marketCap! });
  if (ok(quote.pe)) stats.push({ label: L.pe, value: quote.pe! });
  if (ok(quote.pb)) stats.push({ label: L.pb, value: quote.pb! });
  if (ok(quote.turnover)) stats.push({ label: L.turnover, value: quote.turnover! });

  return (
    <div className={`mb-5 rounded-2xl overflow-hidden ring-1 ring-black/[0.04] shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] ${cardBg}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[20px] font-extrabold text-gray-900 tracking-tight leading-none">{quote.symbol}</span>
            {quote.market && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${mktCls} tracking-wide uppercase`}>{quote.market}</span>
            )}
          </div>
          {quote.name && <p className="text-[12px] text-gray-400 mt-1 font-light tracking-wide">{quote.name}</p>}
        </div>
        {ok(quote.price) && (
          <div className="text-right shrink-0 flex flex-col items-end">
            <p className="text-[28px] font-black text-gray-900 tabular-nums leading-none tracking-tight">{quote.price}</p>
            {ok(quote.change) && (
              <span className={`mt-1.5 inline-flex items-center text-[12px] font-bold px-2.5 py-1 rounded-lg ${changeBg} ${changeColor} tabular-nums`}>
                {isPositive && <span className="mr-0.5">▲</span>}
                {isNegative && <span className="mr-0.5">▼</span>}
                {quote.change}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      {stats.length > 0 && (
        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-gray-200/80 to-transparent" />
      )}

      {/* Stats grid */}
      {stats.length > 0 && (
        <div className="px-5 py-3.5">
          <div className="grid grid-cols-5 gap-x-4 gap-y-3">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.08em] text-gray-400 font-medium leading-none mb-1">{s.label}</p>
                <p className="text-[13px] font-semibold text-gray-800 tabular-nums truncate leading-none">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timestamp */}
      {quote.asOf && (
        <div className="px-5 pb-3 pt-0">
          <p className="text-[9px] text-gray-300 tracking-wide">{quote.asOf}</p>
        </div>
      )}
    </div>
  );
}

// ─── Markdown Rendering ─────────────────────────────────────────

/** Citation tag style — small inline badge with source name */
const CITE_TAG =
  'group/cite relative inline-flex items-center align-middle gap-1 mx-0.5 px-1.5 py-[1px] rounded-full text-[10.5px] font-medium leading-tight ' +
  'text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200/60 ' +
  'transition-all cursor-pointer no-underline hover:no-underline';

function safeHttpUrl(href: string): string | null {
  const t = href.trim();
  if (/^https:\/\//i.test(t)) return t;
  if (/^http:\/\//i.test(t)) return t;
  return null;
}

/** Short label for bare URLs: hostname or truncated path */
function urlChipLabel(href: string): string {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./i, '');
    if (host.length > 22) return host.slice(0, 20) + '…';
    return host;
  } catch {
    return 'link';
  }
}

/** Extract domain for tooltip */
function urlDomain(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function InlineCitation({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const sources = useContext(SourcesContext);
  const safe = safeHttpUrl(href);
  if (!safe) return <span className="text-gray-600">{label}</span>;
  const show = label.trim() && label !== href ? label : urlChipLabel(safe);
  const domain = urlDomain(safe);

  // Look up source from context for rich tooltip
  const matchedSource = sources.find(s => {
    if (s.url && s.url === safe) return true;
    if (s.url && domain && s.domain && domain.includes(s.domain)) return true;
    if (s.domain && domain && s.domain === domain) return true;
    const labelLower = label.toLowerCase().trim();
    if (s.title && s.title.toLowerCase() === labelLower) return true;
    if (s.domain && s.domain.toLowerCase().replace(/\.\w+$/, '') === labelLower.replace(/\s+/g, '')) return true;
    return false;
  });

  const snippetText = matchedSource?.snippet;
  const titleText = matchedSource?.title || show;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className={CITE_TAG}
    >
      <svg className="w-2.5 h-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
      <span className="truncate max-w-[8rem]">{show}</span>
      {/* Rich hover tooltip */}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[260px] px-3 py-2.5 rounded-xl bg-gray-900 text-white text-[11px] leading-snug whitespace-normal opacity-0 group-hover/cite:opacity-100 transition-opacity duration-150 shadow-xl z-50">
        {/* Row 1: favicon + domain */}
        <span className="flex items-center gap-1.5">
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
            alt=""
            className="w-3.5 h-3.5 rounded-sm shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="text-[10px] text-gray-400 truncate">{domain}</span>
        </span>
        {/* Row 2: title */}
        <span className="block font-semibold text-[11.5px] mt-1.5 line-clamp-2 leading-snug">
          {titleText}
        </span>
        {/* Row 3: snippet */}
        {snippetText && (
          <span className="block text-gray-400 text-[10.5px] mt-1 line-clamp-3 leading-relaxed">
            {snippetText}
          </span>
        )}
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900" />
      </span>
    </a>
  );
}

/**
 * Parses inline markdown-like syntax (bold, italic, code, links, bare URLs)
 */
export function parseLine(text: string): React.ReactNode {
  const nodes = parseFragments(text, 0);
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];
  return <>{nodes}</>;
}

function parseFragments(text: string, keyBase: number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let pos = 0;
  let k = keyBase;

  while (pos < text.length) {
    const rest = text.slice(pos);
    let m: RegExpExecArray | null;

    if (rest[0] === '`') {
      const end = rest.indexOf('`', 1);
      if (end > 0) {
        out.push(
          <code key={k++} className="text-[12px] bg-gray-100 text-indigo-600 px-1 py-0.5 rounded font-mono">
            {rest.slice(1, end)}
          </code>,
        );
        pos += end + 1;
        continue;
      }
    }

    m = /^\*\*(.+?)\*\*/.exec(rest);
    if (m) {
      out.push(
        <strong key={k++} className="font-semibold text-gray-900">
          {parseLine(m[1])}
        </strong>,
      );
      pos += m[0].length;
      continue;
    }

    m = /^\[([^\]]*)\]\(([^)]+)\)/.exec(rest);
    if (m) {
      const url = m[2].trim();
      if (safeHttpUrl(url)) {
        out.push(<InlineCitation key={k++} href={url} label={m[1]} />);
        pos += m[0].length;
        continue;
      }
    }

    m = /^\((https?:\/\/[^)]+)\)/.exec(rest);
    if (m) {
      const url = m[1];
      if (safeHttpUrl(url)) {
        out.push(<InlineCitation key={k++} href={url} label={url} />);
        pos += m[0].length;
        continue;
      }
    }

    m = /^(https?:\/\/[^\s<>\)]+)/.exec(rest);
    if (m) {
      let url = m[1];
      url = url.replace(/[.,;:!?]+$/g, '');
      if (safeHttpUrl(url)) {
        out.push(<InlineCitation key={k++} href={url} label={url} />);
        pos += m[0].length;
        continue;
      }
    }

    if (rest[0] === '*' && rest[1] !== '*') {
      m = /^\*([^*\n]+)\*/.exec(rest);
      if (m) {
        out.push(<em key={k++} className="italic">{parseLine(m[1])}</em>);
        pos += m[0].length;
        continue;
      }
    }

    const nextSpecial = findNextSpecial(rest);
    if (nextSpecial === -1) {
      out.push(rest);
      break;
    }
    if (nextSpecial > 0) {
      out.push(rest.slice(0, nextSpecial));
      pos += nextSpecial;
      continue;
    }
    // nextSpecial === 0: unmatched special at rest[0] — emit one char to avoid infinite loop
    out.push(rest[0]);
    pos += 1;
  }

  return out;
}

function findNextSpecial(s: string): number {
  const candidates: number[] = [];
  const idx = (c: string) => {
    const i = s.indexOf(c);
    if (i >= 0) candidates.push(i);
  };
  idx('`');
  idx('**');
  // Detect single * for italic (not preceded by another *)
  const singleStar = s.search(/(?<!\*)\*(?!\*)/);
  if (singleStar >= 0) candidates.push(singleStar);
  idx('[');
  const parenHttp = s.indexOf('(http');
  if (parenHttp >= 0) candidates.push(parenHttp);
  const bareHttp = s.search(/https?:\/\//);
  if (bareHttp >= 0) candidates.push(bareHttp);
  const valid = candidates.filter((n) => n >= 0);
  if (valid.length === 0) return -1;
  return Math.min(...valid);
}

/**
 * Renders multiple lines of text with structural markdown-like syntax (headers, lists, blockquotes)
 */
function headingSlug(text: string): string {
  return text.replace(/[^\w\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'h';
}

export function extractHeadings(text: string, msgIdx?: number): { level: number; text: string; id: string }[] {
  if (!text) return [];
  const prefix = msgIdx != null ? `m${msgIdx}-` : '';
  const headings: { level: number; text: string; id: string }[] = [];
  for (const line of text.split('\n')) {
    const m3 = line.match(/^###\s+(.+)/);
    if (m3) { headings.push({ level: 3, text: m3[1].replace(/\*\*/g, ''), id: prefix + headingSlug(m3[1].replace(/\*\*/g, '')) }); continue; }
    const m2 = line.match(/^##\s+(.+)/);
    if (m2) { headings.push({ level: 2, text: m2[1].replace(/\*\*/g, ''), id: prefix + headingSlug(m2[1].replace(/\*\*/g, '')) }); continue; }
    const m1 = line.match(/^#\s+(.+)/);
    if (m1 && !line.startsWith('##')) { headings.push({ level: 1, text: m1[1].replace(/\*\*/g, ''), id: prefix + headingSlug(m1[1].replace(/\*\*/g, '')) }); continue; }
  }
  return headings;
}

/** Split inline numbered lists into separate lines.
 *  e.g. "1. aaa 2. bbb 3. ccc" → "1. aaa\n2. bbb\n3. ccc"
 *  Only triggers when 3+ sequential numbered items appear on one line. */
function splitInlineNumberedLists(text: string): string {
  return text.replace(/^(.*?)(\d+\.\s.+)$/gm, (_match, prefix, listPart) => {
    // Split on " N. " boundaries where N is sequential
    const items = listPart.split(/\s+(?=\d+\.\s)/);
    if (items.length < 3) return _match; // Need at least 3 items to be confident it's a list
    // Verify they're roughly sequential (1,2,3 or 2,3,4 etc.)
    const nums = items.map((it: string) => parseInt(it.match(/^(\d+)\./)?.[1] || '0', 10));
    let sequential = true;
    for (let j = 1; j < nums.length; j++) {
      if (nums[j] !== nums[j - 1] + 1) { sequential = false; break; }
    }
    if (!sequential) return _match;
    const joined = items.join('\n');
    return prefix ? prefix.trimEnd() + '\n' + joined : joined;
  });
}

export function renderMarkdownContent(text: string, msgIdx?: number): React.ReactNode {
  if (!text) return null;
  const prefix = msgIdx != null ? `m${msgIdx}-` : '';

  const lines = splitInlineNumberedLists(text).split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="my-5 border-gray-100" />);
      i++;
      continue;
    }
    if (/^#{3}\s/.test(line)) {
      const hText = line.replace(/^#{3}\s/, '');
      elements.push(
        <h3 key={i} id={prefix + headingSlug(hText.replace(/\*\*/g, ''))} className="text-[15.5px] font-bold text-gray-900 mt-6 mb-2 tracking-tight">
          {parseLine(hText)}
        </h3>,
      );
      i++;
      continue;
    }
    if (/^#{2}\s/.test(line)) {
      const hText = line.replace(/^#{2}\s/, '');
      elements.push(
        <h2 key={i} id={prefix + headingSlug(hText.replace(/\*\*/g, ''))} className="text-[17px] font-bold text-gray-900 mt-7 mb-2.5 tracking-tight">
          {parseLine(hText)}
        </h2>,
      );
      i++;
      continue;
    }
    if (/^#\s/.test(line) && !line.startsWith('##')) {
      const hText = line.replace(/^#\s/, '');
      elements.push(
        <h1 key={i} id={prefix + headingSlug(hText.replace(/\*\*/g, ''))} className="text-[19px] font-bold text-gray-900 mt-8 mb-3 tracking-tight">
          {parseLine(hText)}
        </h1>,
      );
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <blockquote
          key={`bq-${i}`}
          className="border-l-[3px] border-indigo-300 pl-3.5 my-3 py-1 text-[14px] text-gray-600 italic bg-indigo-50/30 rounded-r-lg"
        >
          {quoteLines.map((ql, qi) => (
            <p key={qi} className="leading-relaxed">
              {parseLine(ql)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      const match = line.match(/^\s*(\d+)\.\s/);
      const startNum = match ? parseInt(match[1], 10) : 1;

      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol
          key={`ol-${i}`}
          start={startNum}
          className="list-decimal list-outside ml-5 my-3.5 space-y-2.5"
        >
          {items.map((t, li) => (
            <li key={li} className="text-[14.5px] text-gray-700 leading-[1.7] pl-1.5 marker:text-gray-400 marker:font-medium [&_strong]:text-gray-900">
              {parseLine(t)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^\s*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-outside ml-5 my-3.5 space-y-2.5 marker:text-indigo-300">
          {items.map((t, li) => (
            <li key={li} className="text-[14.5px] text-gray-700 leading-[1.7] pl-1.5 [&_strong]:font-semibold [&_strong]:text-gray-900">
              {parseLine(t)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    // ── Table: | col | col | ──
    if (/^\|.+\|/.test(line.trim())) {
      const tableRows: string[] = [];
      while (i < lines.length && /^\|.+\|/.test(lines[i].trim())) {
        tableRows.push(lines[i]);
        i++;
      }
      // Parse: first row = header, second row might be separator (|---|---|), rest = body
      const parseRow = (row: string) =>
        row.split('|').slice(1, -1).map(cell => cell.trim());

      const headerCells = parseRow(tableRows[0]);
      let bodyStart = 1;
      // Skip separator row like |---|---|
      if (tableRows[1] && /^\|[\s\-:]+\|/.test(tableRows[1].replace(/[^|:\-\s]/g, ''))) {
        bodyStart = 2;
      }
      const bodyRows = tableRows.slice(bodyStart).map(parseRow);

      elements.push(
        <div key={`tbl-${i}`} className="my-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-[13.5px] text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {headerCells.map((cell, ci) => (
                  <th key={ci} className="px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">
                    {parseLine(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((cells, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  {cells.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-gray-600 border-t border-gray-100">
                      {parseLine(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    elements.push(
      <p key={i} className="text-[14.5px] text-gray-700 leading-[1.75] break-words [&_strong]:font-semibold [&_strong]:text-gray-900">
        {parseLine(line)}
      </p>,
    );
    i++;
  }
  return elements;
}
