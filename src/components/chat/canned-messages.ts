// Canned thinking messages + tool→source-domain mapping. Used by the
// thinking-process side panel to keep the UI lively while the backend is
// running tools that don't emit per-step trace events. Extracted from
// SuperAgentChat.tsx during the Phase-1 refactor.

// ─── Tool → real data-source domain mapping ─────────────────────────
export const TOOL_SOURCE_DOMAINS: Record<string, string[]> = {
    get_realtime_quote:         ['eastmoney.com', 'sina.com.cn'],
    get_daily_history:          ['eastmoney.com', 'tushare.pro'],
    get_chip_distribution:      ['eastmoney.com'],
    get_stock_info:             ['eastmoney.com', 'finance.sina.com.cn'],
    search_stock_news:          ['google.com', 'bocha.cn', 'tavily.com'],
    search_comprehensive_intel: ['google.com', 'brave.com', 'bocha.cn'],
    get_market_indices:         ['eastmoney.com'],
    get_sector_rankings:        ['eastmoney.com'],
    analyze_trend:              ['eastmoney.com'],
    calculate_ma:               ['eastmoney.com'],
    get_volume_analysis:        ['eastmoney.com'],
    analyze_pattern:            ['eastmoney.com'],
    get_analysis_context:       ['loka-db'],
    get_skill_backtest_summary: ['loka-db'],
    get_strategy_backtest_summary: ['loka-db'],
    get_stock_backtest_summary: ['loka-db'],
};

// ─── Grok-style thinking messages (canned rotation for busy-looking UX) ──
// Used as fallback when backend emits no tool_trace events (e.g. crypto/web3 path).
// English only — keeps a single consistent voice across queries regardless of
// whether the user wrote in zh or en.
export const CANNED_THINKING_MESSAGES: Record<string, string[]> = {
    search: [
        'Scanning X posts',
        'Reading news digest',
        'Searching community threads',
        'Fetching latest prices',
        'Cross-referencing sources',
        'Deduplicating noise',
        'Parsing headlines',
        'Checking Reddit threads',
        'Scanning crypto Twitter',
        'Sampling sentiment on social',
        'Collecting analyst takes',
        'Verifying source credibility',
    ],
    web3: [
        'Querying CoinGecko market data',
        'Pulling perpetual funding rates',
        'Reading on-chain signals',
        'Aggregating sentiment indicators',
        'Verifying coin identity',
        'Merging dual-route data',
        'Fetching order book depth',
        'Computing 7D / 30D ranges',
        'Checking open interest',
        'Resolving contract address',
        'Matching base currency',
        'Summarizing derivatives snapshot',
    ],
    analysis: [
        'Analyzing fundamentals',
        'Computing technical indicators',
        'Comparing valuations',
        'Backtesting price action',
        'Checking risk factors',
        'Running RSI / MACD / Bollinger',
        'Evaluating DCF inputs',
        'Stress-testing assumptions',
        'Ranking peer comparables',
        'Assessing margin trends',
        'Inspecting insider activity',
    ],
    simulation: [
        'Building scenarios',
        'Modeling risk exposure',
        'Running Monte Carlo',
        'Generating bull / base / bear paths',
        'Computing confidence intervals',
        'Stress-testing tail risk',
    ],
    consensus: [
        'Gathering agent opinions',
        'Running debate rounds',
        'Tallying bull / bear views',
        'Converging on verdict',
        'Weighting agent confidence',
        'Cross-checking agent reasoning',
        'Distilling minority dissent',
        'Calibrating final confidence',
    ],
    synthesis: [
        'Synthesizing report',
        'Drafting response',
        'Composing the answer',
        'Tying findings together',
        'Final pass over key numbers',
        'Polishing the verdict',
    ],
    report: [
        'Synthesizing report',
        'Drafting response',
        'Composing the answer',
        'Tying findings together',
    ],
    default: [
        'Synthesizing',
        'Thinking through this',
        'Distilling key points',
        'Drafting response',
        'Connecting the dots',
        'Organizing findings',
        'Structuring the argument',
    ],
};
