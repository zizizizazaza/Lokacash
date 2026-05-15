/**
 * ModeSelector — Unified mode picker used in both Home and Chat views.
 * Single source of truth, replacing duplicated mode selectors.
 */
import React, { useState, useEffect, useRef } from 'react';
import { MODES } from '../../constants/modes';
import type { ChatMode } from '../../types/chat';

export interface RoundtableQuota {
  used: number;
  limit: number;
}

export interface FastQuota {
  used: number;
  limit: number;
}

interface ModeSelectorProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  /** Compact style for input toolbar (no label on mobile) */
  compact?: boolean;
  /** Roundtable usage quota — show remaining count when provided */
  roundtableQuota?: RoundtableQuota | null;
  /** Fast analysis usage quota — show remaining count when provided */
  fastQuota?: FastQuota | null;
  /** Guest mode locks Fast and Roundtable; clicking them prompts sign-in. */
  isGuest?: boolean;
  /** Called when a guest clicks a locked mode. */
  onLockedClick?: (mode: ChatMode) => void;
}

const ModeSelector: React.FC<ModeSelectorProps> = ({ mode, onModeChange, compact = false, roundtableQuota, fastQuota, isGuest = false, onLockedClick }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // First-visit Roundtable hint: pulse until user opens the selector once
  const [hintOn, setHintOn] = useState(() => {
    try { return localStorage.getItem('loka.modeHintSeen') !== '1'; } catch { return false; }
  });

  useEffect(() => {
    if (!open) return;
    if (hintOn) {
      setHintOn(false);
      try { localStorage.setItem('loka.modeHintSeen', '1'); } catch {}
    }
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, hintOn]);

  const current = MODES.find(m => m.id === mode)!;
  const rtRemaining = roundtableQuota ? roundtableQuota.limit - roundtableQuota.used : null;
  const rtExhausted = rtRemaining !== null && rtRemaining <= 0;
  const fastRemaining = fastQuota ? fastQuota.limit - fastQuota.used : null;
  const fastExhausted = fastRemaining !== null && fastRemaining <= 0;

  // Get remaining count for the currently selected mode
  const currentRemaining = mode === 'roundtable' ? rtRemaining : mode === 'fast' ? fastRemaining : null;
  const currentExhausted = mode === 'roundtable' ? rtExhausted : mode === 'fast' ? fastExhausted : false;

  return (
    <div className="relative" ref={ref}>
      <style>{`
        @keyframes ms-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ms-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        @keyframes ms-shake { 0%,100% { transform: translateX(0) rotate(0); } 25% { transform: translateX(-1px) rotate(-6deg); } 75% { transform: translateX(1px) rotate(6deg); } }
        @keyframes ms-hint-ring { 0% { box-shadow: 0 0 0 0 rgba(37,99,235,0.45); } 70% { box-shadow: 0 0 0 8px rgba(37,99,235,0); } 100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); } }
        @keyframes ms-hint-bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
        .ms-icon { display: inline-flex; transition: transform .2s ease; transform-origin: center; }
        .ms-row-auto:hover .ms-icon { animation: ms-pulse 1.1s ease-in-out infinite; }
        .ms-row-fast:hover .ms-icon { animation: ms-shake .45s ease-in-out infinite; }
        .ms-row-roundtable:hover .ms-icon { animation: ms-spin 2.4s linear infinite; }
        .ms-hint { animation: ms-hint-ring 1.8s ease-out infinite; }
        .ms-hint .ms-icon { animation: ms-hint-bounce 1.8s ease-in-out infinite; color: #2563eb; }
      `}</style>
      <button
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[12.5px] transition-colors hover:bg-gray-100 ms-row-${mode} ${open ? 'bg-gray-100' : ''} ${mode === 'roundtable' ? 'text-blue-700' : 'text-gray-500 hover:text-gray-900'} ${hintOn && mode !== 'roundtable' ? 'ms-hint' : ''}`}
      >
        <span className={`ms-icon ${mode === 'roundtable' ? 'text-blue-600' : 'text-gray-400'}`}>{React.createElement(current.icon)}</span>
        <span className={`font-medium ${mode === 'roundtable' ? 'text-blue-700' : ''} ${compact ? 'hidden sm:inline' : ''}`}>{current.label}</span>
        <svg className="w-3 h-3 text-gray-400 transition-transform" style={{ transform: open ? 'rotate(180deg)' : undefined }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 w-72 bg-white border border-gray-200 rounded-xl shadow-[0_20px_50px_-10px_rgba(15,23,42,0.25)] overflow-hidden z-30"
          style={{ animation: 'menu-pop 0.15s ease-out' }}
        >
          <div className="px-3.5 pt-2.5 pb-1.5 text-[11px] font-medium text-gray-400">Chat Mode</div>
          {MODES.map(m => {
            const MIcon = m.icon;
            const isActive = mode === m.id;
            const isRoundtable = m.id === 'roundtable';
            const isFast = m.id === 'fast';
            const itemRemaining = isRoundtable ? rtRemaining : isFast ? fastRemaining : null;
            const itemExhausted = isRoundtable ? rtExhausted : isFast ? fastExhausted : false;
            // Guests can only use Auto. Fast / Roundtable are visible but locked.
            const lockedForGuest = isGuest && (isFast || isRoundtable);
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (lockedForGuest) {
                    onLockedClick?.(m.id);
                    setOpen(false);
                    return;
                  }
                  if (itemExhausted) return;
                  onModeChange(m.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ms-row-${m.id} ${itemExhausted && !lockedForGuest ? 'opacity-50 cursor-not-allowed' : ''} ${isActive ? 'bg-blue-50/70' : 'hover:bg-gray-50'}`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-100/70 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                  <span className="ms-icon"><MIcon /></span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] font-semibold ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>{m.label}</p>
                  <p className={`text-[11px] leading-tight ${isActive ? 'text-blue-600/70' : 'text-gray-500'}`}>{m.desc}</p>
                </div>
                {/* Lock badge (guest) > quota badge > active check */}
                {lockedForGuest ? (
                  <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none shrink-0 bg-amber-50 text-amber-700">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Sign in
                  </span>
                ) : itemRemaining !== null ? (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none shrink-0 ${itemExhausted ? 'bg-gray-100 text-gray-400' : isActive ? 'bg-blue-100/70 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                    {`${itemRemaining} left`}
                  </span>
                ) : isActive ? (
                  <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ModeSelector;
