import React from 'react';

/** Per-URL state captured from the `agent:chat:webfetch` socket events. */
export interface WebFetchEntry {
  url: string;
  domain: string;
  state: 'fetching' | 'ok' | 'error';
  title?: string;
  provider?: 'jina' | 'tavily' | 'cache';
  durationMs?: number;
  truncated?: boolean;
  /** Stable error code from the backend (TIMEOUT / BLOCKED_HOST / …). */
  code?: string;
  message?: string;
}

interface Props {
  entries: WebFetchEntry[];
}

const ICON = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const SPINNER = (
  <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
);

const CHECK = (
  <svg className="w-3 h-3 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const X_ICON = (
  <svg className="w-3 h-3 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

/** Compact strip of pills — one per fetched URL. Shown above the assistant's
 *  reply during a turn that referenced web URLs. Hover reveals the full
 *  source URL and any error reason; clicking opens the page in a new tab. */
const WebFetchPills: React.FC<Props> = ({ entries }) => {
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {entries.map((e) => {
        const label = e.state === 'fetching'
          ? `Reading ${e.domain}…`
          : e.state === 'error'
            ? `Couldn't read ${e.domain}`
            : `Read ${e.domain}`;
        const tone = e.state === 'fetching'
          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/60'
          : e.state === 'error'
            ? 'bg-red-50 text-red-700 ring-1 ring-red-200/60'
            : 'bg-gray-50 text-gray-700 ring-1 ring-gray-200/70 hover:bg-gray-100';
        const icon = e.state === 'fetching' ? SPINNER : e.state === 'error' ? X_ICON : CHECK;
        const tooltip = e.state === 'error'
          ? `${e.url}\n${e.code || ''}: ${e.message || ''}`.trim()
          : `${e.title ? e.title + '\n' : ''}${e.url}${e.provider ? `\n· via ${e.provider}` : ''}${e.durationMs ? ` · ${(e.durationMs / 1000).toFixed(1)}s` : ''}${e.truncated ? '\n· truncated' : ''}`;
        return (
          <a
            key={e.url}
            href={e.url}
            target="_blank"
            rel="noopener noreferrer"
            title={tooltip}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${tone}`}
            onClick={(ev) => { if (e.state !== 'ok') ev.preventDefault(); }}
          >
            {icon}
            <span className="text-gray-400">{ICON}</span>
            <span className="truncate max-w-[14rem]">{label}</span>
          </a>
        );
      })}
    </div>
  );
};

export default WebFetchPills;
