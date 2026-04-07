#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_agent_stream.py — Structured JSONL agent stream for Node.js integration.

Unlike run_headless.py (which uses StockAnalysisPipeline and outputs raw JSON),
this script uses AgentExecutor.chat() with a progress_callback, outputting
structured JSONL events to stdout that Node.js can parse line-by-line:

  {"type":"thinking","step":1,"message":"正在制定分析路径...","ts":1712500000}
  {"type":"tool_start","step":1,"tool":"get_realtime_quote","displayName":"获取实时行情","ts":1712500001}
  {"type":"tool_done","step":1,"tool":"get_realtime_quote","displayName":"获取实时行情","success":true,"duration":2.1,"ts":1712500003}
  {"type":"generating","step":3,"message":"正在生成最终分析...","ts":1712500010}
  {"type":"done","success":true,"content":"...final report...","totalSteps":3,"ts":1712500015}
  {"type":"error","message":"...error message...","ts":1712500015}

Usage:
  python run_agent_stream.py --message "你能帮我分析一下腾讯不"
  python run_agent_stream.py --message "Analyze AAPL" --session-id "abc-123"
"""

import sys
import os
import json
import argparse
import logging
import time

# Redirect print() to stderr to keep stdout clean for JSONL events
original_stdout = sys.stdout
sys.stdout = sys.stderr

from src.config import get_config
from src.agent.factory import build_agent_executor

# Tool name → English display name
TOOL_DISPLAY_NAMES = {
    "get_realtime_quote":         "Fetching real-time quote",
    "get_daily_history":          "Retrieving historical K-line",
    "get_chip_distribution":      "Analyzing chip distribution",
    "get_analysis_context":       "Loading analysis context",
    "get_stock_info":             "Fetching fundamentals",
    "search_stock_news":          "Searching stock news",
    "search_comprehensive_intel": "Gathering comprehensive intelligence",
    "analyze_trend":              "Analyzing technical trend",
    "calculate_ma":               "Calculating moving averages",
    "get_volume_analysis":        "Analyzing volume patterns",
    "analyze_pattern":            "Identifying candlestick patterns",
    "get_market_indices":         "Fetching market indices",
    "get_sector_rankings":        "Analyzing sector rankings",
    "get_skill_backtest_summary": "Loading skill backtest data",
    "get_strategy_backtest_summary": "Loading strategy backtest data",
    "get_stock_backtest_summary": "Loading stock backtest data",
}

def detect_user_language(text: str) -> str:
    """Detects whether the input text is primarily Chinese or English."""
    has_cjk = any('\u4e00' <= char <= '\u9fff' for char in text)
    return "zh" if has_cjk else "en"


def emit_event(event: dict):
    """Write a single JSON event line to real stdout (the JSONL stream)."""
    event["ts"] = int(time.time() * 1000)
    line = json.dumps(event, ensure_ascii=False)
    original_stdout.write(line + "\n")
    original_stdout.flush()


def progress_callback(event: dict):
    """Translate runner progress events into JSONL output."""
    event_type = event.get("type", "")
    tool_name = event.get("tool", "")
    display_name = TOOL_DISPLAY_NAMES.get(tool_name, tool_name)

    if event_type == "thinking":
        emit_event({
            "type": "thinking",
            "step": event.get("step", 0),
            "message": event.get("message", ""),
        })
    elif event_type == "tool_start":
        emit_event({
            "type": "tool_start",
            "step": event.get("step", 0),
            "tool": tool_name,
            "displayName": display_name,
        })
    elif event_type == "tool_done":
        emit_event({
            "type": "tool_done",
            "step": event.get("step", 0),
            "tool": tool_name,
            "displayName": display_name,
            "success": event.get("success", True),
            "duration": event.get("duration", 0),
        })
    elif event_type == "generating":
        emit_event({
            "type": "generating",
            "step": event.get("step", 0),
            "message": event.get("message", "正在生成最终分析..."),
        })


def main():
    parser = argparse.ArgumentParser(description="Run agent with structured JSONL output")
    parser.add_argument("--message", type=str, required=True, help="User message / query")
    parser.add_argument("--session-id", type=str, default="stream_run", help="Session ID for conversation context")
    parser.add_argument("--skills", type=str, default=None, help="Comma-separated skill IDs to activate")
    args = parser.parse_args()

    logging.getLogger().setLevel(logging.INFO)

    config = get_config()

    # Map env vars from Node layer
    if os.environ.get("LOKA_AI_API_KEY"):
        os.environ["AIHUBMIX_KEY"] = os.environ["LOKA_AI_API_KEY"]
        os.environ["OPENAI_API_KEY"] = os.environ["LOKA_AI_API_KEY"]
    if os.environ.get("LOKA_AI_MODEL"):
        os.environ["OPENAI_MODEL"] = os.environ["LOKA_AI_MODEL"]
        os.environ["LITELLM_MODEL"] = f"openai/{os.environ['LOKA_AI_MODEL']}"
    if os.environ.get("LOKA_AI_BASE_URL"):
        base_url = os.environ["LOKA_AI_BASE_URL"].replace("/chat/completions", "")
        os.environ["OPENAI_API_BASE"] = base_url
        os.environ["OPENAI_BASE_URL"] = base_url

    # Reload config after env mutation
    config = get_config()

    skills = None
    if args.skills:
        skills = [s.strip() for s in args.skills.split(",") if s.strip()]

    try:
        executor = build_agent_executor(config, skills=skills)

        result = executor.chat(
            message=args.message,
            session_id=args.session_id,
            progress_callback=progress_callback,
            context={"report_language": detect_user_language(args.message)},
        )

        emit_event({
            "type": "done",
            "success": result.success,
            "content": result.content,
            "totalSteps": result.total_steps,
            "error": result.error,
        })

    except Exception as e:
        sys.stderr.write(f"[AgentStream] Fatal error: {e}\n")
        emit_event({
            "type": "error",
            "message": str(e),
        })

    os._exit(0)


if __name__ == "__main__":
    main()
