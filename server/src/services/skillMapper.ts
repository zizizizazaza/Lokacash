/**
 * Skill response white-label mapper.
 *
 * The skill endpoints (/skill/v1/*) expose Lokacash as a first-party brand.
 * Underlying providers (OKX orbit, CoinGecko, CoinMarketCal, Exa, Bird,
 * Aegean consensus engine) are intentionally NOT surfaced in responses —
 * field names and wording all stay within the Lokacash vocabulary.
 *
 * This module owns the mapping from internal field shapes to the public
 * skill response shape.
 */

// ── OKX market snapshot → Lokacash derivatives snapshot ──
export type SkillDerivatives = {
  symbol: string;
  spot: {
    price: number;
    change24hPct: number;
    high24h: number;
    low24h: number;
    volume24hQuoteUsd: number;
  } | null;
  derivatives: {
    fundingRate8h: number | null;
    fundingApr: number | null;
    openInterestUsd: number | null;
    orderbookDepthUsd: number | null;
  } | null;
  priceHistory?: {
    interval: '1D';
    bars: Array<{ ts: number; open: number; high: number; low: number; close: number }>;
  };
  asOf: number;
};

export function mapOkxMarketSnapshotToSkill(raw: unknown): SkillDerivatives | null {
  if (!raw || typeof raw !== 'object') return null;
  const snap = raw as {
    baseCcy: string;
    spot: {
      last: number; open24h: number; high24h: number; low24h: number;
      change24hPct: number; volume24hQuote: number; ts: number;
    } | null;
    derivatives: {
      fundingRate: number | null;
      openInterest: number | null;
      openInterestUsd: number | null;
      ts: number | null;
    } | null;
    candles?: Array<[number, number, number, number, number]>;
    orderbookDepthUsd?: number | null;
  };

  const fr = snap.derivatives?.fundingRate;
  const fundingApr = fr != null ? fr * 3 * 365 : null;

  return {
    symbol: snap.baseCcy,
    spot: snap.spot ? {
      price: snap.spot.last,
      change24hPct: snap.spot.change24hPct,
      high24h: snap.spot.high24h,
      low24h: snap.spot.low24h,
      volume24hQuoteUsd: snap.spot.volume24hQuote,
    } : null,
    derivatives: (snap.derivatives || snap.orderbookDepthUsd != null) ? {
      fundingRate8h: fr ?? null,
      fundingApr,
      openInterestUsd: snap.derivatives?.openInterestUsd ?? null,
      orderbookDepthUsd: snap.orderbookDepthUsd ?? null,
    } : null,
    priceHistory: snap.candles && snap.candles.length > 0 ? {
      interval: '1D',
      bars: snap.candles.map((c) => ({
        ts: c[0], open: c[1], high: c[2], low: c[3], close: c[4],
      })),
    } : undefined,
    asOf: snap.spot?.ts || Date.now(),
  };
}

// ── OKX orbit news bundle → Lokacash sentiment + news ──
export type SkillSentiment = {
  symbol: string;
  sentiment: {
    label: 'bullish' | 'bearish' | 'neutral' | string;
    bullishRatio: number;      // 0..100
    bearishRatio: number;
    neutralRatio: number;
    mentions24h: number;
    newsMentions24h: number;
    socialMentions24h: number;
  } | null;
  news: Array<{
    id: string;
    title: string;
    summary: string;
    publishedAt: string;
    source: string;
    url: string;
    importance: 'high' | 'normal';
    coinSentiment: 'bullish' | 'bearish' | 'neutral' | null;
    relatedCoins: string[];
  }>;
  asOf: number;
};

export function mapOkxNewsBundleToSkill(raw: unknown): SkillSentiment | null {
  if (!raw || typeof raw !== 'object') return null;
  const bundle = raw as {
    baseCcy: string;
    sentiment: {
      label?: string;
      bullishRatio?: number | null;
      bearishRatio?: number | null;
      neutralRatio?: number | null;
      mentionCnt?: number | null;
      newsMentionCnt?: number | null;
      xMentionCnt?: number | null;
      ts?: number;
    } | null;
    latestNews: Array<{
      id?: string;
      title?: string;
      summary?: string;
      publishedAt?: string;
      source?: string;
      url?: string;
      importance?: string;
      sentiment?: string;
      coins?: string[];
    }>;
  };

  const s = bundle.sentiment;
  return {
    symbol: bundle.baseCcy,
    sentiment: s ? {
      label: s.label || 'neutral',
      bullishRatio: Number(s.bullishRatio) || 0,
      bearishRatio: Number(s.bearishRatio) || 0,
      neutralRatio: Number(s.neutralRatio) || 0,
      mentions24h: Number(s.mentionCnt) || 0,
      newsMentions24h: Number(s.newsMentionCnt) || 0,
      socialMentions24h: Number(s.xMentionCnt) || 0,
    } : null,
    news: (bundle.latestNews || []).map((n) => ({
      id: n.id || '',
      title: n.title || '',
      summary: n.summary || '',
      publishedAt: n.publishedAt || '',
      source: n.source || '',
      url: n.url || '',
      importance: (n.importance === 'high' ? 'high' : 'normal') as 'high' | 'normal',
      coinSentiment: n.sentiment === 'bullish' || n.sentiment === 'bearish' || n.sentiment === 'neutral'
        ? n.sentiment as 'bullish' | 'bearish' | 'neutral'
        : null,
      relatedCoins: n.coins || [],
    })),
    asOf: s?.ts || Date.now(),
  };
}

// ── Web3 research result → Lokacash deep research report ──
export type SkillDeepResearch = {
  query: string;
  intent: string;
  assets: Array<{ symbol: string; name: string; id: string }>;
  report: string;              // Full synthesized markdown report
  derivatives?: SkillDerivatives[];
  sentiment?: SkillSentiment[];
  asOf: number;
};

export function mapWeb3ResultToSkill(raw: unknown): SkillDeepResearch | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as {
    report: string;
    raw: {
      intent?: string;
      assets?: Array<{ id?: string; symbol?: string; name?: string }>;
      okx?: unknown[];
      okxNews?: unknown[];
    };
  };

  const query = (r as unknown as { query?: string }).query || '';
  return {
    query,
    intent: r.raw.intent || 'research',
    assets: (r.raw.assets || []).map((a) => ({
      id: a.id || '',
      symbol: (a.symbol || '').toUpperCase(),
      name: a.name || '',
    })),
    report: r.report,
    derivatives: (r.raw.okx || [])
      .map(mapOkxMarketSnapshotToSkill)
      .filter((x): x is SkillDerivatives => !!x),
    sentiment: (r.raw.okxNews || [])
      .map(mapOkxNewsBundleToSkill)
      .filter((x): x is SkillSentiment => !!x),
    asOf: Date.now(),
  };
}

// ── Deep research result → Lokacash research report ──
export type SkillResearchReport = {
  topic: string;
  summary: string;
  sources: Array<{
    title: string;
    url: string;
    domain: string;
    snippet?: string;
  }>;
  xProfiles: Array<{
    handle: string;
    profileUrl: string;
    followers?: number;
    following?: number;
    joinedDisplay?: string;
    avatarUrl?: string;
  }>;
  asOf: number;
};

export function mapResearchResultToSkill(topic: string, raw: unknown): SkillResearchReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as {
    summary?: string;
    extractedSources?: Array<{ title?: string; url?: string; domain?: string; snippet?: string }>;
    xProfiles?: Array<{
      handle?: string;
      profileUrl?: string;
      followers?: number;
      following?: number;
      joinedDisplay?: string;
      avatarUrl?: string;
    }>;
  };
  return {
    topic,
    summary: r.summary || '',
    sources: (r.extractedSources || []).map((s) => ({
      title: s.title || '',
      url: s.url || '',
      domain: s.domain || '',
      snippet: s.snippet,
    })),
    xProfiles: (r.xProfiles || []).map((p) => ({
      handle: p.handle || '',
      profileUrl: p.profileUrl || '',
      followers: p.followers,
      following: p.following,
      joinedDisplay: p.joinedDisplay,
      avatarUrl: p.avatarUrl,
    })),
    asOf: Date.now(),
  };
}

// ── Stock analysis result → Lokacash stock report ──
export type SkillStockReport = {
  ticker: string;
  report: string;   // Full markdown report
  asOf: number;
};

export function mapStockReportToSkill(ticker: string, report: string): SkillStockReport {
  return {
    ticker: ticker.toUpperCase(),
    report: report || '',
    asOf: Date.now(),
  };
}

// ── AI Hedge Fund result → Lokacash multi-analyst portfolio decision ──
export type SkillPortfolioAnalysis = {
  tickers: string[];
  period: { start: string; end: string };
  model: string;
  analysts: string[];
  decisions: Record<string, {
    action: string;             // BUY | SELL | SHORT | HOLD | COVER
    quantity: number;
    confidence: number;         // 0..100
    reasoning: string;
  }>;
  analystSignals: Record<string, Record<string, {
    signal: string;             // BULLISH | BEARISH | NEUTRAL
    confidence: number;
    reasoning: string;
  }>>;
  report: string;               // Full markdown report (formatted via formatReport)
  asOf: number;
};

export function mapHedgeFundToSkill(
  raw: unknown,
  formattedReport: string,
): SkillPortfolioAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as {
    tickers?: string[];
    start_date?: string;
    end_date?: string;
    model?: string;
    analysts?: string[];
    decisions?: Record<string, { action?: string; quantity?: number; confidence?: number; reasoning?: string }>;
    analyst_signals?: Record<string, Record<string, { signal?: string; confidence?: number; reasoning?: string }>>;
  };

  const decisions: SkillPortfolioAnalysis['decisions'] = {};
  for (const [t, d] of Object.entries(r.decisions || {})) {
    decisions[t.toUpperCase()] = {
      action: (d.action || 'HOLD').toUpperCase(),
      quantity: typeof d.quantity === 'number' ? d.quantity : 0,
      confidence: typeof d.confidence === 'number' ? d.confidence : 0,
      reasoning: d.reasoning || '',
    };
  }

  const analystSignals: SkillPortfolioAnalysis['analystSignals'] = {};
  for (const [analyst, perTicker] of Object.entries(r.analyst_signals || {})) {
    analystSignals[analyst] = {};
    for (const [t, sig] of Object.entries(perTicker)) {
      analystSignals[analyst][t.toUpperCase()] = {
        signal: (sig.signal || 'NEUTRAL').toUpperCase(),
        confidence: typeof sig.confidence === 'number' ? sig.confidence : 0,
        reasoning: sig.reasoning || '',
      };
    }
  }

  return {
    tickers: (r.tickers || []).map((t) => t.toUpperCase()),
    period: {
      start: r.start_date || '',
      end: r.end_date || '',
    },
    model: r.model || '',
    analysts: r.analysts || [],
    decisions,
    analystSignals,
    report: formattedReport || '',
    asOf: Date.now(),
  };
}

// ── Consensus engine result → Lokacash multi-agent verdict ──
export type SkillConsensus = {
  question: string;
  finalVerdict: string;           // bullish | bearish | neutral | (free text)
  finalConfidence: number;        // 0..100
  summary: string;                // Final answer prose
  agents: Array<{
    name: string;
    role: string;
    verdict: string;
    confidence: number;
    reasoning: string;
  }>;
  roundsRun: number;
  asOf: number;
};

export function mapConsensusToSkill(question: string, raw: unknown): SkillConsensus | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as {
    final_answer?: string;
    final_verdict?: string;
    final_confidence?: number;
    agents?: Array<{
      agent_id?: string;
      agent_name?: string;
      role?: string;
      verdict?: string;
      confidence?: number;
      reasoning?: string;
    }>;
    rounds?: unknown[];
  };

  const summaryText = r.final_answer || '';
  // Derive verdict from agents if not explicitly set
  let finalVerdict = r.final_verdict || '';
  if (!finalVerdict) {
    const match = summaryText.match(/\*\*Verdict:\*\*\s*(\w+)/i);
    finalVerdict = match?.[1] || 'Neutral';
  }

  return {
    question,
    finalVerdict,
    finalConfidence: typeof r.final_confidence === 'number' ? r.final_confidence : 0,
    summary: summaryText,
    agents: (r.agents || []).map((a) => ({
      name: a.agent_name || a.agent_id || 'Agent',
      role: a.role || '',
      verdict: a.verdict || 'Neutral',
      confidence: typeof a.confidence === 'number' ? a.confidence : 0,
      reasoning: a.reasoning || '',
    })),
    roundsRun: Array.isArray(r.rounds) ? r.rounds.length : 1,
    asOf: Date.now(),
  };
}
