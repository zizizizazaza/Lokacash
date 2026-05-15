#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_data_only.py — Data-only extraction for Aegean Consensus pipeline.

This script calls the stock-analysis data tools (Longbridge, Yahoo, AkShare, etc.)
WITHOUT invoking any LLM. It prints a single JSON object to stdout containing:

  - realtime_quote: current price, PE, PB, volume, etc.
  - daily_history: last N days OHLCV + MA indicators
  - stock_info: fundamental context (valuation, growth, earnings)
  - news: recent stock news from SearXNG / SerpApi
  - trend: technical trend analysis (MA alignment, signal)

Usage:
  python fetch_data_only.py --stock-code AAPL
  python fetch_data_only.py --stock-code 600519 --days 30
"""

import sys
import os
import json
import argparse
import logging
import time

# Redirect print() to stderr to keep stdout clean for JSON output
original_stdout = sys.stdout
sys.stdout = sys.stderr

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger(__name__)


def emit_json(data: dict):
    """Write the final JSON result to real stdout."""
    line = json.dumps(data, ensure_ascii=False, default=str)
    original_stdout.write(line + "\n")
    original_stdout.flush()


def main():
    parser = argparse.ArgumentParser(description="Fetch raw market data (no LLM)")
    parser.add_argument("--stock-code", type=str, required=True, help="Stock code, e.g. AAPL, 600519, hk00700")
    parser.add_argument("--days", type=int, default=60, help="Number of historical trading days (default: 60)")
    args = parser.parse_args()

    stock_code = args.stock_code.strip()
    days = args.days

    # Map env vars from Node layer (same as run_agent_stream.py)
    if os.environ.get("LOKA_AI_API_KEY"):
        os.environ["OPENAI_API_KEY"] = os.environ["LOKA_AI_API_KEY"]
    if os.environ.get("LOKA_AI_BASE_URL"):
        base_url = os.environ["LOKA_AI_BASE_URL"].replace("/chat/completions", "")
        os.environ["OPENAI_API_BASE"] = base_url
        os.environ["OPENAI_BASE_URL"] = base_url

    result = {
        "stock_code": stock_code,
        "fetch_timestamp": int(time.time() * 1000),
        "realtime_quote": None,
        "daily_history": None,
        "stock_info": None,
        "trend_analysis": None,
        "news": None,
        "errors": [],
    }

    # ── 1. Real-time quote ──
    try:
        from src.agent.tools.data_tools import _handle_get_realtime_quote
        quote = _handle_get_realtime_quote(stock_code)
        if "error" not in quote:
            result["realtime_quote"] = quote
        else:
            result["errors"].append(f"realtime_quote: {quote.get('error')}")
    except Exception as e:
        logger.warning(f"realtime_quote failed: {e}")
        result["errors"].append(f"realtime_quote: {e}")

    # ── 2. Daily history (OHLCV + MA) ──
    try:
        from src.agent.tools.data_tools import _handle_get_daily_history
        history = _handle_get_daily_history(stock_code, days=days)
        if "error" not in history:
            result["daily_history"] = history
        else:
            result["errors"].append(f"daily_history: {history.get('error')}")
    except Exception as e:
        logger.warning(f"daily_history failed: {e}")
        result["errors"].append(f"daily_history: {e}")

    # ── 3. Stock fundamental info ──
    try:
        from src.agent.tools.data_tools import _handle_get_stock_info
        info = _handle_get_stock_info(stock_code)
        if "error" not in info:
            result["stock_info"] = info
        else:
            result["errors"].append(f"stock_info: {info.get('error')}")
    except Exception as e:
        logger.warning(f"stock_info failed: {e}")
        result["errors"].append(f"stock_info: {e}")

    # ── 4. Technical trend analysis ──
    try:
        from src.agent.tools.analysis_tools import _handle_analyze_trend
        trend = _handle_analyze_trend(stock_code)
        if "error" not in trend:
            result["trend_analysis"] = trend
        else:
            result["errors"].append(f"trend_analysis: {trend.get('error')}")
    except Exception as e:
        logger.warning(f"trend_analysis failed: {e}")
        result["errors"].append(f"trend_analysis: {e}")

    # Derive stock_name for news search (from stock_info or quote)
    stock_name = stock_code
    if result["stock_info"] and result["stock_info"].get("name"):
        stock_name = result["stock_info"]["name"]
    elif result["realtime_quote"] and result["realtime_quote"].get("name"):
        stock_name = result["realtime_quote"]["name"]

    # ── 5. News search ──
    try:
        from src.agent.tools.search_tools import _handle_search_stock_news
        news = _handle_search_stock_news(stock_code, stock_name)
        if "error" not in news:
            result["news"] = news
        else:
            result["errors"].append(f"news: {news.get('error')}")
    except Exception as e:
        logger.warning(f"news search failed: {e}")
        result["errors"].append(f"news: {e}")

    emit_json(result)
    os._exit(0)


if __name__ == "__main__":
    main()
