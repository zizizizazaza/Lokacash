# Lokacash Investment Skill

Investment intelligence for AI coding agents — **multi-agent consensus on any investment question, deep cross-source research, crypto market data, and stock analysis**. One skill, nine endpoints across three domains.

## Install

```bash
npx skills add hetu-project/lokacash-skills --skill lokacash
```

(Internal testing: install via local path instead of GitHub.)

## What's Inside

### `/research/*` — works for any investment question
- **Multi-agent consensus** — 4+ AI analysts debate your question and return a verdict with confidence score
- **Deep research** — cross-source web + X/Twitter synthesis on any topic

### `/crypto/*` — crypto-specific data
- **Crypto deep-research** — token-aware pipeline combining market, sentiment, news
- **Sentiment engine** — per-coin bull/bear/neutral ratios + catalyst news
- **Market data** — spot price, 24h change, volume, 7D history
- **Derivatives** — perpetual funding rate, open interest, orderbook depth
- **Upcoming events** — listings, forks, releases, governance votes
- **Trending coins** — top-searched with live price

### `/stock/*` — equity analysis
- **Stock analysis** — full fundamentals + technical + valuation report (US / HK / A-shares)

## Quick Examples

```bash
# Multi-agent verdict on ANY asset
curl -X POST https://nftkashai.online/lokacash/api/skill/v1/research/consensus \
  -H "Content-Type: application/json" \
  -d '{"question":"Should I buy TSLA after the Q4 miss?"}'

# Deep research on ANY topic
curl -X POST https://nftkashai.online/lokacash/api/skill/v1/research/deep \
  -H "Content-Type: application/json" \
  -d '{"topic":"State of AI sector Q2 2026","days":14}'

# BTC sentiment snapshot
curl https://nftkashai.online/lokacash/api/skill/v1/crypto/sentiment/BTC

# Full AAPL analysis (runs ~30-60s)
curl https://nftkashai.online/lokacash/api/skill/v1/stock/analysis/AAPL

# Upcoming crypto events
curl https://nftkashai.online/lokacash/api/skill/v1/crypto/events?limit=5

# Trending now
curl https://nftkashai.online/lokacash/api/skill/v1/crypto/trending?limit=5
```

## Full API Reference

See [SKILL.md](./SKILL.md) for complete endpoint documentation — request/response schemas, latency hints, error codes, usage patterns.

## License

MIT
