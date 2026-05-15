"""
Headless runner for ai-hedge-fund.
Called by the Node.js backend service via child_process.spawn.
Bypasses all interactive prompts (questionary) and prints JSON to stdout.

Usage:
  python run_headless.py --tickers AAPL,MSFT --model deepseek-chat --provider DeepSeek
"""

import sys
import os
import json
import argparse
from datetime import datetime
from dateutil.relativedelta import relativedelta

# Ensure the repo root is on the path so `src.*` imports work
REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, REPO_ROOT)

from dotenv import load_dotenv
# Load from server/.env instead of local directory
load_dotenv(os.path.join(REPO_ROOT, '../../.env'))

from src.main import run_hedge_fund

# A curated default set of analysts for web usage (keeps execution time reasonable)
DEFAULT_ANALYSTS = [
    "warren_buffett",
    "technical_analyst",
    "fundamentals_analyst",
    "sentiment_analyst",
    "cathie_wood",
    "michael_burry",
    "bill_ackman",
    "charlie_munger",
    "peter_lynch",
    "valuation_analyst",
]


def main():
    parser = argparse.ArgumentParser(description="AI Hedge Fund headless runner")
    parser.add_argument("--tickers", type=str, required=True, help="Comma-separated tickers")
    parser.add_argument("--model", type=str, default="deepseek-chat", help="LLM model name")
    parser.add_argument("--provider", type=str, default="DeepSeek", help="LLM model provider")
    parser.add_argument("--analysts", type=str, default=",".join(DEFAULT_ANALYSTS), help="Comma-separated analyst keys")
    parser.add_argument("--start-date", type=str, default=None, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", type=str, default=None, help="End date (YYYY-MM-DD)")
    parser.add_argument("--initial-cash", type=float, default=100000.0, help="Initial cash")
    parser.add_argument("--show-reasoning", action="store_true", help="Include agent reasoning")

    args = parser.parse_args()

    tickers = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
    analysts = [a.strip() for a in args.analysts.split(",") if a.strip()]

    end_date = args.end_date or datetime.now().strftime("%Y-%m-%d")
    start_date = args.start_date or (datetime.strptime(end_date, "%Y-%m-%d") - relativedelta(months=3)).strftime("%Y-%m-%d")

    portfolio = {
        "cash": args.initial_cash,
        "margin_requirement": 0.0,
        "margin_used": 0.0,
        "positions": {
            ticker: {
                "long": 0,
                "short": 0,
                "long_cost_basis": 0.0,
                "short_cost_basis": 0.0,
                "short_margin_used": 0.0,
            }
            for ticker in tickers
        },
        "realized_gains": {
            ticker: {"long": 0.0, "short": 0.0}
            for ticker in tickers
        },
    }

    # Print progress to stderr so Node.js can stream it
    print(f"🚀 Starting AI Hedge Fund analysis for {', '.join(tickers)}...", file=sys.stderr, flush=True)
    print(f"📊 Analysts: {', '.join(analysts)}", file=sys.stderr, flush=True)
    print(f"📅 Period: {start_date} → {end_date}", file=sys.stderr, flush=True)
    print(f"🤖 Model: {args.provider}/{args.model}", file=sys.stderr, flush=True)

    try:
        # Redirect stdout to stderr for all internal plugin prints 
        # so they stream as progress logs instead of breaking JSON parsing
        original_stdout = sys.stdout
        sys.stdout = sys.stderr
        
        result = run_hedge_fund(
            tickers=tickers,
            start_date=start_date,
            end_date=end_date,
            portfolio=portfolio,
            show_reasoning=args.show_reasoning,
            selected_analysts=analysts,
            model_name=args.model,
            model_provider=args.provider,
        )

        # Restore pure stdout
        sys.stdout = original_stdout

        # Build a clean JSON output
        output = {
            "tickers": tickers,
            "start_date": start_date,
            "end_date": end_date,
            "analysts": analysts,
            "model": f"{args.provider}/{args.model}",
            "decisions": result.get("decisions", {}),
            "analyst_signals": {},
        }

        # Flatten analyst_signals for JSON serialization
        for agent_key, signals in result.get("analyst_signals", {}).items():
            agent_name = agent_key.replace("_agent", "").replace("_", " ").title()
            output["analyst_signals"][agent_name] = {}
            for ticker, signal_data in signals.items():
                output["analyst_signals"][agent_name][ticker] = {
                    "signal": signal_data.get("signal", ""),
                    "confidence": signal_data.get("confidence", 0),
                    "reasoning": str(signal_data.get("reasoning", "")) if signal_data.get("reasoning") else "",
                }

        # Output the final JSON to stdout
        print(json.dumps(output, indent=2, ensure_ascii=False), flush=True)
        print("✅ Analysis complete!", file=sys.stderr, flush=True)
        os._exit(0)

    except Exception as e:
        error_output = {"error": str(e), "tickers": tickers}
        print(json.dumps(error_output), flush=True)
        print(f"❌ Error: {e}", file=sys.stderr, flush=True)
        os._exit(1)

if __name__ == "__main__":
    main()
