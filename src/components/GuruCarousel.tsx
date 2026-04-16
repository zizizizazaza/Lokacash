import React, { useEffect, useRef, useState } from 'react';

/* ── Guru avatar helper — JPG photos in /public/avatars/ ── */
const guruAvatar = (key: string) => `/avatars/${key}.jpg`;

/* ── 13 legendary investment gurus ────────────────────────── */
export const GURUS = [
  { key: 'warren_buffett', name: 'Warren Buffett', title: 'The Oracle of Omaha', framework: ['Competitive Moat', 'Owner Earnings', 'Margin of Safety', 'Long-term Hold'] },
  { key: 'ben_graham', name: 'Ben Graham', title: 'Father of Value Investing', framework: ['Net-Net Valuation', 'Margin of Safety', 'Mr. Market Theory', 'Defensive Investing'] },
  { key: 'peter_lynch', name: 'Peter Lynch', title: 'The 10-Bagger Hunter', framework: ['PEG Ratio', 'Buy What You Know', 'Growth Classification', 'Earnings Line'] },
  { key: 'charlie_munger', name: 'Charlie Munger', title: 'The Rational Thinker', framework: ['Mental Models', 'Inversion Thinking', 'Quality at Fair Price', 'Circle of Competence'] },
  { key: 'aswath_damodaran', name: 'Aswath Damodaran', title: 'Dean of Valuation', framework: ['DCF Modeling', 'Intrinsic Value', 'Risk Premium', 'Narrative → Numbers'] },
  { key: 'cathie_wood', name: 'Cathie Wood', title: 'Queen of Disruption', framework: ['Disruptive Innovation', "Wright's Law", '5-Year Price Target', 'Convergence Thesis'] },
  { key: 'michael_burry', name: 'Michael Burry', title: 'The Big Short', framework: ['Deep Value Contrarian', 'Asset-Level Analysis', 'Macro Shorts', 'SEC Filings Deep Dive'] },
  { key: 'stanley_druckenmiller', name: 'Stanley Druckenmiller', title: 'The Macro Investor', framework: ['Macro Trends', 'Currency Flows', 'Liquidity Cycles', 'Asymmetric Bets'] },
  { key: 'nassim_taleb', name: 'Nassim Taleb', title: 'Black Swan Philosopher', framework: ['Tail Risk Hedging', 'Barbell Strategy', 'Antifragility', 'Convexity Bias'] },
  { key: 'bill_ackman', name: 'Bill Ackman', title: 'The Activist', framework: ['Activist Catalysts', 'Sum-of-Parts', 'Concentrated Bets', 'Corporate Governance'] },
  { key: 'phil_fisher', name: 'Phil Fisher', title: 'The Scuttlebutt Master', framework: ['Scuttlebutt Method', '15-Point Checklist', 'Management Quality', 'Long-term Growth'] },
  { key: 'mohnish_pabrai', name: 'Mohnish Pabrai', title: 'The Dhandho Investor', framework: ['Dhandho Framework', 'Heads I Win', 'Cloning Strategy', 'Few Bets, Big Bets'] },
  { key: 'rakesh_jhunjhunwala', name: 'Rakesh Jhunjhunwala', title: 'The Big Bull of India', framework: ['India Macro Thesis', 'Emerging Market Alpha', 'High Conviction', 'Growth + Value Blend'] },
] as const;

/* ── Auto-scrolling carousel ──────────────────────────────── */
export default function GuruCarousel({ onSelect }: { onSelect?: (guruName: string) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const offsetRef = useRef(0);
  const rafRef = useRef<number>(0);
  const SPEED = 0.35;

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const step = () => {
      if (!paused && track) {
        offsetRef.current += SPEED;
        const halfWidth = track.scrollWidth / 2;
        if (offsetRef.current >= halfWidth) offsetRef.current -= halfWidth;
        track.style.transform = `translate3d(-${offsetRef.current}px, 0, 0)`;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paused]);

  const cards = [...GURUS, ...GURUS];

  return (
    <div className="guru-carousel-wrap relative overflow-hidden py-1"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-14 z-10" style={{ background: 'linear-gradient(to right, white, transparent)' }} />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-14 z-10" style={{ background: 'linear-gradient(to left, white, transparent)' }} />

      <div ref={trackRef} className="flex gap-3 will-change-transform" style={{ width: 'max-content' }}>
        {cards.map((g, i) => (
          <button
            key={`${g.key}-${i}`}
            onClick={() => onSelect?.(g.name)}
            className="guru-card group shrink-0 w-[210px] text-left rounded-xl border border-gray-100 bg-white p-3.5 transition-all duration-200 hover:border-gray-300 hover:shadow-md cursor-pointer select-none"
          >
            <div className="flex items-center gap-2.5 mb-2.5">
              <img src={guruAvatar(g.key)} alt={g.name} className="w-11 h-11 rounded-full object-cover shrink-0 border border-gray-100" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-gray-900 leading-tight truncate">{g.name}</p>
                <p className="text-[10px] text-gray-400 leading-tight truncate">{g.title}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {g.framework.map(f => (
                <span key={f} className="inline-block px-1.5 py-0.5 rounded bg-gray-50 text-[9px] font-medium text-gray-500 leading-tight">
                  {f}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
