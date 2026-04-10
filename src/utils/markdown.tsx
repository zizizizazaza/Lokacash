import React from 'react';

// ─── Quote Snapshot Card ────────────────────────────────────────

interface QuoteData {
  symbol: string;
  name?: string;
  market?: string;
  price?: string;
  change?: string;
  volume?: string;
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

/** Renders a stock quote snapshot as a compact card */
export function QuoteCard({ quote }: { quote: QuoteData }) {
  const isPositive = quote.change ? /^\+|涨/.test(quote.change) : null;
  const isNegative = quote.change ? /^-|跌/.test(quote.change) : null;
  const changeColor = isPositive ? 'text-emerald-600' : isNegative ? 'text-red-500' : 'text-gray-500';
  const changeBg = isPositive ? 'bg-emerald-50' : isNegative ? 'bg-red-50' : 'bg-gray-50';

  return (
    <div className="flex items-center gap-4 px-4 py-3 mb-4 rounded-xl border border-gray-200 bg-gray-50/60 shadow-sm">
      {/* Symbol & Name */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold text-gray-900 tracking-tight">{quote.symbol}</span>
          {quote.market && (
            <span className="text-[10px] font-medium text-gray-400 uppercase">{quote.market}</span>
          )}
        </div>
        {quote.name && (
          <p className="text-[11px] text-gray-400 truncate mt-0.5">{quote.name}</p>
        )}
      </div>

      {/* Price */}
      {quote.price && (
        <div className="ml-auto text-right shrink-0">
          <p className="text-[17px] font-semibold text-gray-900 tabular-nums">{quote.price}</p>
          {quote.change && (
            <span className={`inline-block text-[11px] font-medium px-1.5 py-0.5 rounded ${changeBg} ${changeColor} tabular-nums`}>
              {quote.change}
            </span>
          )}
        </div>
      )}

      {/* Volume & Time */}
      <div className="shrink-0 text-right border-l border-gray-200 pl-4 hidden sm:block">
        {quote.volume && (
          <p className="text-[11px] text-gray-400">
            <span className="text-gray-500 font-medium">{quote.volume}</span> vol
          </p>
        )}
        {quote.asOf && (
          <p className="text-[10px] text-gray-300 mt-0.5">{quote.asOf}</p>
        )}
      </div>
    </div>
  );
}

// ─── Markdown Rendering ─────────────────────────────────────────

const LINK_CHIP =
  'inline-flex items-center align-middle gap-0.5 max-w-[min(100%,13rem)] mx-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium leading-tight ' +
  'text-indigo-700 bg-indigo-50/90 hover:bg-indigo-100 border border-indigo-200/70 shadow-sm ' +
  'transition-colors cursor-pointer no-underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50';

const LINK_MD =
  'text-indigo-700 hover:text-indigo-900 underline underline-offset-2 decoration-indigo-300/80 font-medium';

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

function ExternalGlyph() {
  return (
    <svg className="w-3 h-3 shrink-0 opacity-75" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function InlineCitation({
  href,
  label,
  variant,
}: {
  href: string;
  label: string;
  variant: 'chip' | 'markdown';
}) {
  const safe = safeHttpUrl(href);
  if (!safe) return <span className="text-gray-600">{label}</span>;
  const show = label.trim() && label !== href ? label : urlChipLabel(safe);
  if (variant === 'markdown') {
    return (
      <a
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        title={safe}
        className={LINK_MD}
      >
        {show}
      </a>
    );
  }
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" title={safe} className={LINK_CHIP}>
      <ExternalGlyph />
      <span className="truncate">{show}</span>
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
        out.push(<InlineCitation key={k++} href={url} label={m[1]} variant="markdown" />);
        pos += m[0].length;
        continue;
      }
    }

    m = /^\((https?:\/\/[^)]+)\)/.exec(rest);
    if (m) {
      const url = m[1];
      if (safeHttpUrl(url)) {
        out.push(<InlineCitation key={k++} href={url} label={url} variant="chip" />);
        pos += m[0].length;
        continue;
      }
    }

    m = /^(https?:\/\/[^\s<>\)]+)/.exec(rest);
    if (m) {
      let url = m[1];
      url = url.replace(/[.,;:!?]+$/g, '');
      if (safeHttpUrl(url)) {
        out.push(<InlineCitation key={k++} href={url} label={url} variant="chip" />);
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

export function extractHeadings(text: string): { level: number; text: string; id: string }[] {
  if (!text) return [];
  const headings: { level: number; text: string; id: string }[] = [];
  for (const line of text.split('\n')) {
    const m3 = line.match(/^###\s+(.+)/);
    if (m3) { headings.push({ level: 3, text: m3[1].replace(/\*\*/g, ''), id: headingSlug(m3[1].replace(/\*\*/g, '')) }); continue; }
    const m2 = line.match(/^##\s+(.+)/);
    if (m2) { headings.push({ level: 2, text: m2[1].replace(/\*\*/g, ''), id: headingSlug(m2[1].replace(/\*\*/g, '')) }); continue; }
    const m1 = line.match(/^#\s+(.+)/);
    if (m1 && !line.startsWith('##')) { headings.push({ level: 1, text: m1[1].replace(/\*\*/g, ''), id: headingSlug(m1[1].replace(/\*\*/g, '')) }); continue; }
  }
  return headings;
}

export function renderMarkdownContent(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split('\n');
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
        <h3 key={i} id={headingSlug(hText.replace(/\*\*/g, ''))} className="text-[15.5px] font-bold text-gray-900 mt-6 mb-2 tracking-tight">
          {parseLine(hText)}
        </h3>,
      );
      i++;
      continue;
    }
    if (/^#{2}\s/.test(line)) {
      const hText = line.replace(/^#{2}\s/, '');
      elements.push(
        <h2 key={i} id={headingSlug(hText.replace(/\*\*/g, ''))} className="text-[17px] font-bold text-gray-900 mt-7 mb-2.5 tracking-tight">
          {parseLine(hText)}
        </h2>,
      );
      i++;
      continue;
    }
    if (/^#\s/.test(line) && !line.startsWith('##')) {
      const hText = line.replace(/^#\s/, '');
      elements.push(
        <h1 key={i} id={headingSlug(hText.replace(/\*\*/g, ''))} className="text-[19px] font-bold text-gray-900 mt-8 mb-3 tracking-tight">
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
