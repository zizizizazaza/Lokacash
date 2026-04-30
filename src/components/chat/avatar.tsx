// Avatar mapping + helpers for agent / persona / guru display.
// Extracted from SuperAgentChat.tsx during the Phase-1 refactor.
import React from 'react';

/* ── Avatar mapping: name/id → JPG path ── */
export const AVATAR_MAP: Record<string, string> = {
    // SUMMON_POOL system agents
    fundamental_specialist: '/avatars/fundamental_specialist.jpg',
    valuation_specialist: '/avatars/valuation_specialist.jpg',
    macro_specialist: '/avatars/macro_specialist.jpg',
    risk_specialist: '/avatars/risk_specialist.jpg',
    allocation_specialist: '/avatars/allocation_specialist.jpg',
    fund_specialist: '/avatars/fund_specialist.jpg',
    options_specialist: '/avatars/options_specialist.jpg',
    crypto_specialist: '/avatars/crypto_specialist.jpg',
    // SUMMON_POOL enhanced agents
    macro_enhanced: '/avatars/macro_enhanced.jpg',
    risk_enhanced: '/avatars/risk_enhanced.jpg',
    event_driven: '/avatars/event_driven.jpg',
    sentiment_focus: '/avatars/sentiment_focus.jpg',
    portfolio_view: '/avatars/portfolio_view.jpg',
    // SUMMON_POOL master style agents
    buffett_style: '/avatars/warren_buffett.jpg',
    munger_style: '/avatars/charlie_munger.jpg',
    dalio_style: '/avatars/default.jpg',
    soros_style: '/avatars/default.jpg',
    lynch_style: '/avatars/peter_lynch.jpg',
    // Legacy SUMMON_POOL ids (keep for backward compat)
    fundamental: '/avatars/fundamental_analyst.jpg',
    macro: '/avatars/default.jpg',
    sentiment: '/avatars/sentiment_analyst.jpg',
    quant: '/avatars/default.jpg',
    technical: '/avatars/technical_analyst.jpg',
    risk: '/avatars/default.jpg',
    sector: '/avatars/default.jpg',
    contrarian: '/avatars/default.jpg',
    // ROUNDTABLE_AGENTS initials
    FA: '/avatars/fundamental_analyst.jpg',
    MS: '/avatars/default.jpg',
    SE: '/avatars/sentiment_analyst.jpg',
    QT: '/avatars/default.jpg',
    TA: '/avatars/technical_analyst.jpg',
    RA: '/avatars/default.jpg',
    SS: '/avatars/default.jpg',
    DA: '/avatars/default.jpg',
    // Backend analyst snake_case keys (from hedge-fund agent)
    technical_analyst: '/avatars/technical_analyst.jpg',
    fundamentals_analyst: '/avatars/fundamental_analyst.jpg',
    sentiment_analyst: '/avatars/sentiment_analyst.jpg',
    news_sentiment_analyst: '/avatars/sentiment_analyst.jpg',
    valuation_analyst: '/avatars/default.jpg',
    growth_analyst: '/avatars/default.jpg',
    risk_management_analyst: '/avatars/default.jpg',
    // Guru snake_case keys (from hedge-fund agent)
    warren_buffett: '/avatars/warren_buffett.jpg',
    ben_graham: '/avatars/ben_graham.jpg',
    peter_lynch: '/avatars/peter_lynch.jpg',
    charlie_munger: '/avatars/charlie_munger.jpg',
    aswath_damodaran: '/avatars/aswath_damodaran.jpg',
    cathie_wood: '/avatars/cathie_wood.jpg',
    michael_burry: '/avatars/michael_burry.jpg',
    stanley_druckenmiller: '/avatars/stanley_druckenmiller.jpg',
    nassim_taleb: '/avatars/nassim_taleb.jpg',
    bill_ackman: '/avatars/bill_ackman.jpg',
    phil_fisher: '/avatars/phil_fisher.jpg',
    mohnish_pabrai: '/avatars/mohnish_pabrai.jpg',
    rakesh_jhunjhunwala: '/avatars/rakesh_jhunjhunwala.jpg',
    // Pretty display names (fallback)
    'Warren Buffett': '/avatars/warren_buffett.jpg',
    'Ben Graham': '/avatars/ben_graham.jpg',
    'Peter Lynch': '/avatars/peter_lynch.jpg',
    'Charlie Munger': '/avatars/charlie_munger.jpg',
    'Aswath Damodaran': '/avatars/aswath_damodaran.jpg',
    'Cathie Wood': '/avatars/cathie_wood.jpg',
    'Michael Burry': '/avatars/michael_burry.jpg',
    'Stanley Druckenmiller': '/avatars/stanley_druckenmiller.jpg',
    'Nassim Taleb': '/avatars/nassim_taleb.jpg',
    'Bill Ackman': '/avatars/bill_ackman.jpg',
    'Phil Fisher': '/avatars/phil_fisher.jpg',
    'Mohnish Pabrai': '/avatars/mohnish_pabrai.jpg',
    'Rakesh Jhunjhunwala': '/avatars/rakesh_jhunjhunwala.jpg',
    'Fundamental Analyst': '/avatars/fundamental_analyst.jpg',
    'Technical Analyst': '/avatars/technical_analyst.jpg',
    'Sentiment Engine': '/avatars/sentiment_analyst.jpg',
};

export const getAgentAvatar = (nameOrId: string) => AVATAR_MAP[nameOrId] || '/avatars/default.jpg';

/** Convert snake_case key to display name: "fundamentals_analyst" → "Fundamentals Analyst" */
export const prettyAgentName = (raw: string) =>
    AVATAR_MAP[raw] ? raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : raw;

export const AgentAvatarImg: React.FC<{ nameOrId: string; size?: number; className?: string }> = ({ nameOrId, size = 24, className = '' }) => {
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
    const renderSize = Math.round(size * dpr);
    return (
        <img src={getAgentAvatar(nameOrId)} alt={nameOrId} width={renderSize} height={renderSize}
            className={`rounded-full object-cover shrink-0 ${className}`}
            style={{ width: size, height: size, imageRendering: 'auto' }}
            loading="eager" decoding="async" />
    );
};
