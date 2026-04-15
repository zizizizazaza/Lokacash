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

# Tool name → display name (aligned with api/v1/endpoints/agent.py TOOL_DISPLAY_NAMES)
TOOL_DISPLAY_NAMES_ZH = {
    "get_realtime_quote":         "获取实时行情",
    "get_daily_history":          "获取历史K线",
    "get_chip_distribution":      "分析筹码分布",
    "get_analysis_context":       "获取分析上下文",
    "get_stock_info":             "获取股票基本面",
    "search_stock_news":          "搜索股票新闻",
    "search_comprehensive_intel": "搜索综合情报",
    "analyze_trend":              "分析技术趋势",
    "calculate_ma":               "计算均线系统",
    "get_volume_analysis":        "分析量能变化",
    "analyze_pattern":            "识别K线形态",
    "get_market_indices":         "获取市场指数",
    "get_sector_rankings":        "分析行业板块",
    "get_skill_backtest_summary": "获取技能回测概览",
    "get_strategy_backtest_summary": "获取策略回测概览",
    "get_stock_backtest_summary": "获取个股回测数据",
}

TOOL_DISPLAY_NAMES_EN = {
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


def resolve_tool_display_lang(message: str, cli_override: str | None) -> str:
    """
    Pick locale for tool_start/tool_done displayName only (not the final report).

    - auto: follow user message (CJK → ZH labels, else EN) — historical default
    - en / zh: force TOOL_DISPLAY_NAMES_EN / TOOL_DISPLAY_NAMES_ZH

    Override order: CLI --tool-display-lang > env STOCK_ANALYSIS_TOOL_DISPLAY_LANG > auto
    """
    raw = (cli_override or os.environ.get("STOCK_ANALYSIS_TOOL_DISPLAY_LANG") or "auto").strip().lower()
    if raw in ("en", "english"):
        return "en"
    if raw in ("zh", "cn", "chinese"):
        return "zh"
    return detect_user_language(message)


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
    lang = getattr(progress_callback, "_lang", "zh") or "zh"
    names = TOOL_DISPLAY_NAMES_ZH if lang == "zh" else TOOL_DISPLAY_NAMES_EN
    display_name = names.get(tool_name, tool_name)

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

        # Intercept tool returns to build [UI_METADATA]
        result_str = event.get("result_str", "")
        if event.get("success", True) and result_str:
            try:
                import sys
                import json
                try:
                    parsed = json.loads(result_str)
                except Exception:
                    parsed = {}
                
                metadata = {}
                if tool_name == "get_realtime_quote":
                    metadata = {"fundamental": {
                        "PE": parsed.get("pe_ratio"),
                        "Turnover": parsed.get("turnover_rate"),
                        "PB": parsed.get("pb_ratio")
                    }, "source": parsed.get("source"),
                    "quote": {
                        "symbol": parsed.get("code"),
                        "name": parsed.get("name"),
                        "price": parsed.get("price"),
                        "change_pct": parsed.get("change_pct"),
                        "volume": parsed.get("volume"),
                        "amount": parsed.get("amount"),
                        "high": parsed.get("high"),
                        "low": parsed.get("low"),
                        "open": parsed.get("open"),
                        "prev_close": parsed.get("prev_close"),
                        "total_mv": parsed.get("total_mv"),
                        "circ_mv": parsed.get("circ_mv"),
                        "pe": parsed.get("pe_ratio"),
                        "pb": parsed.get("pb_ratio"),
                        "turnover": parsed.get("turnover_rate"),
                    }}
                elif tool_name == "get_daily_history":
                    metadata = {"source": parsed.get("source")}
                elif tool_name == "analyze_trend":
                    metadata = {"technical": {
                        "MA_Alignment": parsed.get("ma_alignment"),
                        "Trend": parsed.get("trend_status"),
                        "Signal": parsed.get("buy_signal")
                    }}
                elif tool_name == "get_stock_info":
                    val = parsed.get("fundamental_context", {}).get("valuation", {}).get("data", {})
                    metadata = {"fundamental": {
                        "PE": val.get("pe_ratio") or parsed.get("pe_ratio"),
                        "PB": val.get("pb_ratio") or parsed.get("pb_ratio"),
                    }, "source": parsed.get("fundamental_context", {}).get("valuation", {}).get("status")}
                elif tool_name == "search_stock_news":
                    provider = parsed.get("provider")
                    results = parsed.get("results", [])
                    metadata = {"social": {
                        "provider": provider,
                        "results": results[:5]
                    }}
                elif tool_name == "search_comprehensive_intel":
                    dims = parsed.get("dimensions", {})
                    
                    # Gather results from all dimensions
                    all_results = []
                    for dim_data in dims.values():
                        if "results" in dim_data:
                            all_results.extend(dim_data["results"])
                            
                    metadata = {"social": {
                        "provider": "SearXNG / Web Search",
                        "results": all_results[:5]
                    }}

                if metadata:
                    sys.stderr.write(f"[UI_METADATA] {json.dumps(metadata, ensure_ascii=False)}\n")
                    sys.stderr.flush()
            except Exception:
                pass

    elif event_type == "generating":
        ev: dict = {
            "type": "generating",
            "step": event.get("step", 0),
            "message": event.get("message") or "",
        }
        # 最终报告分块流式输出（与 runner 中 progress_callback 对齐）
        c = event.get("content")
        if c:
            ev["content"] = c
        elif not ev["message"]:
            ev["message"] = "正在生成最终分析..."
        emit_event(ev)
    elif event_type == "round_eval":
        continue_reason = str(event.get("continue_reason", "continue"))
        confidence_score = event.get("confidence_score", 0.0)
        new_evidence_gain = event.get("new_evidence_gain", 0.0)
        low_gain_streak = event.get("low_gain_streak", 0)
        path_mode = event.get("path_mode", "adaptive")
        emit_event({
            "type": "thinking",
            "step": event.get("step", 0),
            "message": (
                f"[{path_mode}] continue_reason={continue_reason} "
                f"confidence_score={confidence_score} "
                f"new_evidence_gain={new_evidence_gain} "
                f"low_gain_streak={low_gain_streak}"
            ),
            "continue_reason": continue_reason,
            "confidence_score": confidence_score,
            "new_evidence_gain": new_evidence_gain,
            "low_gain_streak": low_gain_streak,
            "path_mode": path_mode,
            "coverage": event.get("coverage", {}),
        })


def main():
    parser = argparse.ArgumentParser(description="Run agent with structured JSONL output")
    parser.add_argument("--message", type=str, required=True, help="User message / query")
    parser.add_argument("--session-id", type=str, default="stream_run", help="Session ID for conversation context")
    parser.add_argument("--skills", type=str, default=None, help="Comma-separated skill IDs to activate")
    parser.add_argument(
        "--tool-display-lang",
        type=str,
        default=None,
        choices=["auto", "en", "zh"],
        help="JSONL tool step displayName language: auto (from message), en, or zh. "
        "Overrides env STOCK_ANALYSIS_TOOL_DISPLAY_LANG when set.",
    )
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

        report_lang = detect_user_language(args.message)
        tool_label_lang = resolve_tool_display_lang(args.message, args.tool_display_lang)
        progress_callback._lang = tool_label_lang  # type: ignore[attr-defined]

        result = executor.chat(
            message=args.message,
            session_id=args.session_id,
            progress_callback=progress_callback,
            context={"report_language": report_lang},
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
