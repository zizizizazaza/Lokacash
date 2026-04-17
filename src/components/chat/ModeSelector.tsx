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
}

const ModeSelector: React.FC<ModeSelectorProps> = ({ mode, onModeChange, compact = false, roundtableQuota, fastQuota }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

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
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-gray-500 hover:bg-gray-100 transition-all"
      >
        {React.createElement(current.icon)}
        {compact ? <span className="hidden sm:inline">{current.label}</span> : current.label}
        {/* Show remaining count badge for fast/roundtable */}
        {currentRemaining !== null && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none ${currentExhausted ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-500'}`}>
            {currentRemaining}
          </span>
        )}
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M6 9l6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-1.5 w-64 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden z-30"
          style={{ animation: 'menu-pop 0.15s ease-out' }}
        >
          {MODES.map(m => {
            const MIcon = m.icon;
            const isActive = mode === m.id;
            const isRoundtable = m.id === 'roundtable';
            const isFast = m.id === 'fast';
            const itemRemaining = isRoundtable ? rtRemaining : isFast ? fastRemaining : null;
            const itemExhausted = isRoundtable ? rtExhausted : isFast ? fastExhausted : false;
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (itemExhausted) return;
                  onModeChange(m.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${itemExhausted ? 'opacity-50 cursor-not-allowed' : ''} ${isActive ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  <MIcon />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[12px] font-semibold ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>{m.label}</p>
                  <p className="text-[10px] text-gray-400 leading-tight">{m.desc}</p>
                </div>
                {/* Quota badge — far right */}
                {itemRemaining !== null && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none shrink-0 ${itemExhausted ? 'bg-red-100 text-red-500' : 'bg-green-50 text-green-600'}`}>
                    {itemExhausted ? 'Upgrade' : `${itemRemaining} left`}
                  </span>
                )}
                {isActive && itemRemaining === null && (
                  <svg className="w-3.5 h-3.5 text-gray-900 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ModeSelector;
