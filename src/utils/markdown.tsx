import React from 'react';

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
  if (s.startsWith('**')) candidates.push(0);
  else if (s.startsWith('*') && s[1] !== '*') candidates.push(0);
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
      elements.push(
        <h3 key={i} className="text-[14px] font-bold text-gray-900 mt-6 mb-2 tracking-tight">
          {parseLine(line.replace(/^#{3}\s/, ''))}
        </h3>,
      );
      i++;
      continue;
    }
    if (/^#{2}\s/.test(line)) {
      elements.push(
        <h2 key={i} className="text-[16px] font-bold text-gray-900 mt-7 mb-2.5 tracking-tight">
          {parseLine(line.replace(/^#{2}\s/, ''))}
        </h2>,
      );
      i++;
      continue;
    }
    if (/^#\s/.test(line) && !line.startsWith('##')) {
      elements.push(
        <h1 key={i} className="text-[17px] font-bold text-gray-900 mt-8 mb-3 tracking-tight">
          {parseLine(line.replace(/^#\s/, ''))}
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
          className="border-l-[3px] border-indigo-300 pl-3.5 my-3 py-1 text-[13px] text-gray-600 italic bg-indigo-50/30 rounded-r-lg"
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
          className="list-decimal list-outside ml-5 my-3 space-y-2"
        >
          {items.map((t, li) => (
            <li key={li} className="text-[13px] text-gray-700 leading-relaxed pl-1 [&_strong]:text-gray-900">
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
        <ul key={`ul-${i}`} className="list-disc list-outside ml-5 my-3 space-y-2 marker:text-gray-400">
          {items.map((t, li) => (
            <li key={li} className="text-[13px] text-gray-700 leading-relaxed pl-1 [&_strong]:font-semibold [&_strong]:text-gray-900">
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
    elements.push(
      <p key={i} className="text-[13px] text-gray-700 leading-[1.75] break-words [&_strong]:font-semibold [&_strong]:text-gray-900">
        {parseLine(line)}
      </p>,
    );
    i++;
  }
  return elements;
}
