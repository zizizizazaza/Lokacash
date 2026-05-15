---
name: lokacash
model: standard
category: investment
description: Investment intelligence for AI agents — multi-agent consensus on any investment question, deep cross-source research, crypto market data, and stock analysis. Nine endpoints across three domains.
version: 1.1.0
keywords: [investment, crypto, cryptocurrency, stocks, equity, bitcoin, ethereum, trading, sentiment, consensus, research, derivatives, funding rate, fundamentals, technical analysis, events, trending]
---

# Lokacash Investment Intelligence Skill

> Give your AI agent direct access to institutional-grade investment research — multi-agent consensus on any question, cross-source research, crypto market intelligence, and stock analysis.

## What This Skill Does

Lokacash is an investment research platform spanning both **crypto** and **stocks**. This skill exposes 9 HTTP endpoints covering three capability domains:

- **`/research/*`** — generic capabilities that work for any investment question (crypto, stocks, macro). Multi-agent debate and deep web + social research.
- **`/crypto/*`** — crypto-specific data: price, derivatives, sentiment, catalyst events.
- **`/stock/*`** — equity analysis: fundamentals, technical, valuation.

**When to use this skill:**

- User asks **"should I buy/sell X?"** for any asset → `/research/consensus`
- User asks **"what's happening with X?"** (broad topic) → `/research/deep`
- User asks about crypto token specifics (price, funding, sentiment) → `/crypto/*`
- User asks about a stock (AAPL, TSLA, 700.HK) → `/stock/analysis`
- User wants market overview (trending coins, upcoming listings) → `/crypto/trending` / `/crypto/events`

## Base URL

**Production:**
```
https://nftkashai.online/lokacash/api/skill/v1
```

**Local development (if running Lokacash server locally):**
```
http://localhost:3002/api/skill/v1
```

All endpoints are unauthenticated during internal testing.

## /research/* — Generic Capabilities

These work for **any investment question or topic** — not tied to crypto.

### `POST /research/consensus`

Runs a multi-agent roundtable. Specialized analysts (fundamental / macro / sentiment / quant) debate your question and return a majority verdict with confidence score. Use this whenever the user wants a **decision** on any asset or scenario.

```
Request body:
{
  "question": "Should I buy TSLA after the Q4 earnings miss?",
  "mode": "roundtable"    // optional: "roundtable" (default, more thorough) | "collaborate" (faster)
}

Response (200):
{
  "ok": true,
  "data": {
    "question": "...",
    "finalVerdict": "Bearish",      // Bullish | Bearish | Neutral
    "finalConfidence": 68,          // 0..100
    "summary": "...full markdown final answer...",
    "agents": [
      { "name": "Fundamental Analyst", "role": "...", "verdict": "Bearish", "confidence": 72, "reasoning": "..." }
    ],
    "roundsRun": 2,
    "asOf": 1745000000000
  }
}
```

Typical latency: 60-90 seconds.

### `POST /research/deep`

Runs deep research across web articles + X/Twitter feeds on **any topic**. Returns synthesized summary + source citations + relevant X profile snapshots. Good for narrative questions ("Why is AI underperforming this quarter?", "What's the state of DePIN?").

```
Request body:
{
  "topic": "Latest catalysts for AAPL stock this week",
  "days": 30        // optional: lookback window, default 30, max 90
}

Response (200):
{
  "ok": true,
  "data": {
    "topic": "...",
    "summary": "...markdown synthesized report...",
    "sources": [
      { "title": "...", "url": "...", "domain": "bloomberg.com", "snippet": "..." }
    ],
    "xProfiles": [
      { "handle": "cz_binance", "profileUrl": "...", "followers": 9234567, "avatarUrl": "..." }
    ],
    "asOf": 1745000000000
  }
}
```

Typical latency: 8-15 seconds.

## /crypto/* — Crypto-Specific Data

### `POST /crypto/deep-research`

Crypto-focused pipeline (specific token resolution + derivatives + sentiment). Use this when the user's question is clearly about a crypto token and you need structured market data attached. For non-crypto topics, use `/research/deep` instead.

```
Request body:
{ "query": "Why is ETH underperforming this week?" }

Response: same shape as /research/deep but with additional
`derivatives` and `sentiment` arrays for resolved tokens.
```

### `GET /crypto/sentiment/:symbol`

Per-coin sentiment snapshot (24h window) + top catalyst news.

```
GET /crypto/sentiment/BTC

Response:
{
  "ok": true,
  "data": {
    "symbol": "BTC",
    "sentiment": {
      "label": "neutral",
      "bullishRatio": 43, "bearishRatio": 13, "neutralRatio": 44,
      "mentions24h": 1317,
      "newsMentions24h": 60,
      "socialMentions24h": 1257
    },
    "news": [
      {
        "title": "...", "url": "...", "publishedAt": "2026-04-20T...",
        "source": "techflowpost", "importance": "high",
        "coinSentiment": "bearish", "relatedCoins": ["BTC", "ETH"]
      }
    ],
    "asOf": 1745000000000
  }
}
```

### `GET /crypto/market/:symbol`

Spot price + 24h stats + 7D history.

```
GET /crypto/market/BTC

Response:
{
  "ok": true,
  "data": {
    "symbol": "BTC",
    "spot": {
      "price": 75561.20, "change24hPct": -2.24,
      "high24h": 78134.56, "low24h": 74921.10,
      "volume24hQuoteUsd": 469598891.06
    },
    "priceHistory": { "interval": "1D", "bars": [{ "ts": ..., "open": ..., "high": ..., "low": ..., "close": ... }] },
    "asOf": 1745000000000
  }
}
```

### `GET /crypto/derivatives/:symbol`

Perpetual futures: funding rate, open interest, orderbook depth. Not all coins have derivatives markets.

```
GET /crypto/derivatives/BTC

Response:
{
  "ok": true,
  "data": {
    "symbol": "BTC",
    "derivatives": {
      "fundingRate8h": 0.0001,         // decimal fraction
      "fundingApr": 0.1095,            // fundingRate8h × 3 × 365
      "openInterestUsd": 2663120129.16,
      "orderbookDepthUsd": 228624.48   // ±10 levels cumulative
    },
    "priceHistory": { ... },
    "asOf": 1745000000000
  }
}
```

### `GET /crypto/events?limit=10`

Upcoming crypto catalysts: listings, forks, releases, governance votes.

```
Response:
{
  "ok": true,
  "data": {
    "events": [
      {
        "id": 324691, "title": "BloFin Listing",
        "dateEvent": "2026-04-20T00:00:00Z", "category": "Exchange",
        "coins": ["WMTX"], "coinNames": ["World Mobile Token"],
        "detailsUrl": "https://..."
      }
    ],
    "asOf": 1745000000000
  }
}
```

### `GET /crypto/trending?limit=10`

Top-searched coins with live price + 24h change.

```
Response:
{
  "ok": true,
  "data": {
    "trending": [
      { "id": "ravedao", "symbol": "RAVE", "name": "RaveDAO",
        "marketCapRank": 232, "priceUsd": 0.5359,
        "change24hPct": -60.52, "iconUrl": "..." }
    ],
    "asOf": 1745000000000
  }
}
```

## /stock/* — Stock / Equity Analysis

### `GET /stock/analysis/:ticker`

Full stock analysis: fundamentals, technical indicators, valuation context. Supports US tickers (AAPL, TSLA), HK (700.HK, 9988.HK), and A-shares (600519.SH).

```
GET /stock/analysis/AAPL

Response:
{
  "ok": true,
  "data": {
    "ticker": "AAPL",
    "report": "...full markdown analysis with fundamentals, technicals, valuation...",
    "asOf": 1745000000000
  }
}
```

Typical latency: 30-60 seconds (runs a full analysis pipeline).

## Error Format

All endpoints return a consistent error shape:

```json
{
  "ok": false,
  "error": "missing_topic",
  "hint": "POST body requires `topic` (string)."
}
```

Common error codes:
- `missing_question` / `missing_topic` / `missing_query` — required body field absent
- `invalid_symbol` / `invalid_ticker` — path param malformed
- `not_found` — symbol/ticker valid but no data available
- `upstream_failed` / `upstream_empty` — upstream source returned nothing
- `consensus_failed` / `research_failed` / `stock_analysis_failed` — internal pipeline failure

## Usage Patterns

### Decision-making (any asset)
```
User: "Is now a good time to buy AAPL?"
Agent: POST /research/consensus { question: "Is now a good time to buy AAPL?" }
Agent: quotes verdict + confidence + top analyst reasoning
```

### Narrative research (any topic)
```
User: "What's going on with the AI sector lately?"
Agent: POST /research/deep { topic: "AI sector performance and catalysts", days: 14 }
Agent: reads the synthesized summary, cites top sources
```

### Crypto price check
```
User: "What's ETH doing today?"
Agent: GET /crypto/market/ETH
Agent: quotes price + 24h change
```

### Crypto derivatives-aware check
```
User: "Is there a squeeze risk on BTC perps?"
Agent: GET /crypto/derivatives/BTC
Agent: reports funding rate (flags if very +/-) and OI level
```

### Crypto sentiment scan
```
User: "What's the vibe on SOL this week?"
Agent: GET /crypto/sentiment/SOL
Agent: reports bull/bear/neutral ratios + top 2 catalyst news
```

### Stock deep analysis
```
User: "Do a full analysis on TSLA"
Agent: GET /stock/analysis/TSLA
Agent: summarizes the returned markdown report
```

### Market overview
```
User: "What's hot in crypto right now?"
Agent: GET /crypto/trending?limit=5
Agent: lists the top 5 with price + change
```

### Upcoming catalysts
```
User: "Any big crypto events coming up?"
Agent: GET /crypto/events?limit=8
Agent: lists upcoming listings/forks/governance votes
```

## When NOT to use this skill

- **Order placement / custody / wallet signing** — this is read-only research
- **Real-time trade execution** — not a trading terminal
- **Non-financial topics** — general search / chat should use a different skill

## Rate Limits

None during internal testing. All endpoints are publicly reachable without authentication. This will change before public release.
