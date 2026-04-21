/**
 * ThinkingFlowTemplates — Centralized thinking flow UI templates for different agents
 */
import React, { useRef, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════════════
   Platform Favicon (small colored icon)
   ═══════════════════════════════════════════════════════════════ */
const PlatformFavicon: React.FC<{ platform: string; size?: number }> = ({ platform, size = 16 }) => {
  const s = size;
  switch (platform) {
    case 'reddit':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="#FF4500">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 6.627 5.373 12 12 12s12-5.373 12-12C24 5.373 18.627 0 12 0zm6.064 14.6c.066.332.098.672.098 1.016 0 3.53-4.097 6.384-9.162 6.384-5.064 0-9.162-2.854-9.162-6.384 0-.344.032-.684.098-1.016A1.87 1.87 0 011 12.934a1.87 1.87 0 013.195-1.322c1.533-1.072 3.58-1.734 5.876-1.81l1.128-5.064a.38.38 0 01.457-.293l3.6.791a1.338 1.338 0 012.375.596 1.338 1.338 0 01-1.337 1.337 1.338 1.338 0 01-1.325-1.187l-3.17-.695-.993 4.463c2.236.1 4.222.762 5.71 1.812A1.87 1.87 0 0123 12.934a1.87 1.87 0 01-.936 1.666zM8.5 14a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0zm7.5 0a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zm-1.174 3.164c-.94.94-2.472 1.023-2.826 1.023-.354 0-1.886-.083-2.826-1.023a.35.35 0 01.495-.495c.592.592 1.85.803 2.33.803.482 0 1.74-.211 2.332-.803a.35.35 0 01.495.495z"/>
        </svg>
      );
    case 'x':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="#000">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      );
    case 'youtube':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="#FF0000">
          <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      );
    case 'hn':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="#FF6600">
          <rect width="24" height="24" rx="4"/>
          <text x="12" y="17" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="sans-serif">Y</text>
        </svg>
      );
    case 'web':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
        </svg>
      );
    case 'ai':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z"/>
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
        </svg>
      );
  }
};

/* ═══════════════════════════════════════════════════════════════
   Signal Radar — Log Parser
   ═══════════════════════════════════════════════════════════════ */
export interface SourceItem {
  favicon: string; // platform id for PlatformFavicon
  title: string;
  domain: string;
  url?: string;
}

export interface SignalRadarParsed {
  isSearching: boolean;
  isDone: boolean;
  searchDescription?: string;
  sources: SourceItem[];
  elapsed?: string;
  summary?: string;
}

export function parseSignalRadarLogs(logs: string[]): SignalRadarParsed {
  const sources: SourceItem[] = [];
  let elapsed: string | undefined;
  let isDone = false;
  let isSearching = false;
  let searchDescription: string | undefined;
  let summary: string | undefined;

  for (const log of logs) {
    const c = log.replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (!c) continue;

    // Mark as searching when we see any search activity
    if (/⏳|Searching|Diving|Reading between|Discovering/i.test(c)) {
      isSearching = true;
    }

    // Extract Reddit results as sources
    const redditDone = c.match(/✓\s*Reddit Found (\d+)/i);
    if (redditDone) {
      sources.push({ favicon: 'reddit', title: `Found ${redditDone[1]} relevant threads`, domain: 'reddit.com' });
    }
    // Extract X results
    const xDone = c.match(/✓\s*X Found (\d+)/i);
    if (xDone && parseInt(xDone[1]) > 0) {
      sources.push({ favicon: 'x', title: `Found ${xDone[1]} relevant posts`, domain: 'x.com' });
    }
    // Extract YouTube results
    const ytDone = c.match(/✓\s*YouTube Found (\d+)/i);
    if (ytDone && parseInt(ytDone[1]) > 0) {
      sources.push({ favicon: 'youtube', title: `Found ${ytDone[1]} relevant videos`, domain: 'youtube.com' });
    }
    // Extract HN results
    const hnDone = c.match(/✓\s*HN Found (\d+)/i);
    if (hnDone && parseInt(hnDone[1]) > 0) {
      sources.push({ favicon: 'hn', title: `Found ${hnDone[1]} relevant stories`, domain: 'news.ycombinator.com' });
    }
    // Extract web results
    const webResults = c.match(/\[web\]\s*(\d+)\s*results/i);
    if (webResults) {
      sources.push({ favicon: 'web', title: `Found ${webResults[1]} web results`, domain: 'web search' });
    }
    const exaResults = c.match(/Exa:\s*(\d+)\s*results/i);
    if (exaResults) {
      sources.push({ favicon: 'web', title: `Found ${exaResults[1]} web results via Exa`, domain: 'exa.ai' });
    }

    // Subreddit discovery
    const subMatch = c.match(/Discovered subreddits.*?(\[.+?\])/i);
    if (subMatch) {
      searchDescription = `Discovered relevant communities`;
    }

    // AI Synthesis
    if (/✓\s*AI Synthesis Report generated/i.test(c)) {
      sources.push({ favicon: 'ai', title: 'AI Synthesis report generated', domain: 'analysis' });
    }

    // Research complete
    const rc = c.match(/✓\s*Research complete \(([^)]+)\)/);
    if (rc) {
      elapsed = rc[1].replace(/\.\d+/, ''); // remove decimals
      isDone = true;
      isSearching = false;
      const sumMatch = c.match(/- (.+)$/);
      if (sumMatch) summary = sumMatch[1];
    }
  }

  if (isDone) isSearching = false;

  // Generate search description from logs context
  if (!searchDescription && isSearching) {
    searchDescription = 'Searching across multiple platforms';
  }

  return { isSearching: isSearching && !isDone, isDone, searchDescription, sources, elapsed, summary };
}

/* ═══════════════════════════════════════════════════════════════
   Signal Radar — Side Panel (Surf-style: simple & clean)
   ═══════════════════════════════════════════════════════════════ */
export const SignalRadarSidePanel: React.FC<{
  parsed: SignalRadarParsed;
  isRunning: boolean;
  elapsedLive: number;
  onClose: () => void;
}> = ({ parsed, isRunning, elapsedLive, onClose }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [parsed.sources.length, parsed.isDone]);

  return (
    <div className="w-[380px] shrink-0 bg-white flex flex-col overflow-hidden border-l border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-[15px] font-bold text-gray-900 tracking-tight">Thinking Process</h3>
        <button onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* ── Step 1: Searching ── */}
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            {parsed.isDone || (!isRunning && parsed.sources.length > 0) ? (
              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
            )}
            <span className="text-[14px] font-bold text-gray-900">Searching Web</span>
          </div>

          {/* Search description */}
          {parsed.searchDescription && (
            <p className="text-[12px] text-gray-500 mb-3 ml-[30px]">{parsed.searchDescription}</p>
          )}

          {/* Source results list */}
          {parsed.sources.length > 0 && (
            <div className="ml-[30px] rounded-xl border border-gray-100 overflow-hidden">
              {parsed.sources.map((src, idx) => (
                <div key={idx} className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors">
                  <PlatformFavicon platform={src.favicon} size={16} />
                  <span className="text-[12px] text-gray-700 flex-1 truncate">{src.title}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{src.domain}</span>
                </div>
              ))}
            </div>
          )}

          {/* Still searching, no sources yet */}
          {parsed.sources.length === 0 && isRunning && (
            <div className="ml-[30px] text-[12px] text-blue-500 animate-pulse">Scanning platforms...</div>
          )}
        </div>

        {/* ── Step 2: Done ── */}
        {(parsed.isDone || !isRunning) && parsed.sources.length > 0 && (
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-[14px] font-bold text-gray-900">Done</span>
            {parsed.elapsed && <span className="text-[11px] text-gray-400 font-mono ml-auto">{parsed.elapsed}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   Signal Radar — Inline Progress Bar (Surf-style)
   ═══════════════════════════════════════════════════════════════ */
export const SignalRadarProgressBar: React.FC<{
  parsed: SignalRadarParsed;
  isRunning: boolean;
  elapsedLive: number;
  onClick: () => void;
}> = ({ parsed, isRunning, elapsedLive, onClick }) => {
  if (parsed.isDone && !isRunning) {
    return (
      <button onClick={onClick} className="mb-4 w-full text-left group">
        <div className="flex items-center gap-2 py-1.5">
          <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-[12px] text-gray-500">
            Loka completed in {parsed.elapsed || `${elapsedLive}s`}
          </span>
          <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>
    );
  }

  // Active searching state
  const activePlatform = parsed.isSearching ? (parsed.sources.length > 0 ? parsed.sources[parsed.sources.length - 1] : null) : null;
  const timeLabel = elapsedLive > 0 ? `${elapsedLive}s` : '';

  return (
    <button onClick={onClick} className="mb-4 w-full text-left group">
      <div className="py-1.5">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-[12px] text-gray-600 font-medium">Loka is researching...</span>
          {timeLabel && <span className="text-[12px] text-gray-400 font-mono">{timeLabel}</span>}
          <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
        {activePlatform && (
          <div className="flex items-center gap-2 mt-1.5 ml-6 overflow-hidden" style={{ animation: 'fadeSlideUp 0.3s ease-out' }}>
            <PlatformFavicon platform={activePlatform.favicon} size={14} />
            <span className="text-[11px] text-gray-500 truncate">
              {activePlatform.title}
            </span>
          </div>
        )}
      </div>
      <style>{`@keyframes fadeSlideUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </button>
  );
};
