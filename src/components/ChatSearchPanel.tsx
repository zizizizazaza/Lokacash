/**
 * Phase 2.2 — Sidebar search panel.
 *
 * Self-contained search UI that posts to /chat/search and renders matching
 * sessions in a small dropdown. Click a result to navigate to that session.
 * Per-user isolation guaranteed by the backend route (authRequired + user-id
 * scoped query).
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

interface SearchHit {
  sessionId: string;
  lastMatch: {
    id: string;
    role: string;
    snippet: string;
    createdAt: string;
    similarity: number;
  };
}

export const ChatSearchPanel: React.FC<{ isDark?: boolean; onCloseMobileDrawer?: () => void }> = ({
  isDark,
  onCloseMobileDrawer,
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setHits([]);
      setShowResults(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Match the same storage convention the rest of the app uses —
        // sessionStorage primary, localStorage fallback, key `loka_token`.
        const token =
          typeof window !== 'undefined'
            ? window.sessionStorage.getItem('loka_token') ||
              window.localStorage.getItem('loka_token')
            : null;
        const res = await fetch(
          `${API_BASE}/chat/search?q=${encodeURIComponent(query.trim())}&groupBySession=1&limit=20`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        if (!res.ok) {
          setHits([]);
          setShowResults(true);
          return;
        }
        const data = (await res.json()) as { sessions?: SearchHit[] };
        setHits(data.sessions || []);
        setShowResults(true);
      } catch {
        setHits([]);
        setShowResults(true);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const goToSession = (sid: string) => {
    setShowResults(false);
    setQuery('');
    navigate(`/?session=${sid}`);
    if (onCloseMobileDrawer) onCloseMobileDrawer();
  };

  const inputBase = isDark
    ? 'bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-500'
    : 'bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400';
  const ringFocus = 'focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
  const dropdownBg = isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200';
  const itemHoverBg = isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50';
  const titleText = isDark ? 'text-gray-200' : 'text-gray-700';
  const muted = isDark ? 'text-gray-500' : 'text-gray-400';

  return (
    <div className="relative px-2 mb-2">
      <div className="relative">
        <svg
          className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${muted} pointer-events-none`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (hits.length > 0) setShowResults(true);
          }}
          placeholder="Search past chats..."
          className={`w-full pl-7 pr-7 py-1.5 text-[12px] rounded-md border outline-none transition-all ${inputBase} ${ringFocus}`}
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setHits([]);
              setShowResults(false);
              inputRef.current?.focus();
            }}
            className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 ${muted} hover:opacity-70`}
            aria-label="Clear search"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {showResults && (
        <div
          className={`absolute left-2 right-2 top-full mt-1 z-30 rounded-md border shadow-lg max-h-72 overflow-y-auto ${dropdownBg}`}
        >
          {isSearching && (
            <div className={`px-3 py-2 text-[11px] ${muted}`}>Searching…</div>
          )}
          {!isSearching && hits.length === 0 && (
            <div className={`px-3 py-2 text-[11px] ${muted}`}>No matches in your history.</div>
          )}
          {!isSearching &&
            hits.map((h) => (
              <button
                key={h.sessionId}
                onClick={() => goToSession(h.sessionId)}
                className={`w-full text-left px-3 py-2 border-b last:border-b-0 ${itemHoverBg} ${
                  isDark ? 'border-gray-800' : 'border-gray-100'
                }`}
              >
                <div className={`text-[12px] ${titleText} line-clamp-2`}>{h.lastMatch.snippet}</div>
                <div className={`mt-0.5 text-[10px] ${muted}`}>
                  {new Date(h.lastMatch.createdAt).toLocaleDateString()} ·{' '}
                  {h.lastMatch.role === 'user' ? 'Your message' : 'Assistant reply'}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
};
