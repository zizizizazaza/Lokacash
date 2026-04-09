import sys
import os
import json
import argparse
import logging
from dotenv import load_dotenv

# Load env variables (LOKA_AI_API_KEY maps to what the stock analyzer needs)
# We will inject OPENAI_API_KEY and OPENAI_BASE_URL mapped to our deepseek-v3 from node layer.

# Redirect standard output to stderr to keep stdout clean for final JSON
original_stdout = sys.stdout
sys.stdout = sys.stderr

from src.config import get_config
from src.core.pipeline import StockAnalysisPipeline
from src.enums import ReportType
from data_provider.base import canonical_stock_code
from src.services.name_to_code_resolver import resolve_name_to_code
from src.services.stock_code_utils import is_code_like
from src.data.stock_mapping import STOCK_NAME_MAP


def _substring_resolve(name: str) -> str | None:
    """Fallback: resolve short name by substring match against STOCK_NAME_MAP.
    
    Handles common abbreviations like "腾讯" -> "腾讯控股" -> 00700,
    "茅台" -> "贵州茅台" -> 600519, etc.
    Only returns a result if exactly one stock name contains the input.
    """
    if not name or len(name) < 2:
        return None
    matches = []
    for code, full_name in STOCK_NAME_MAP.items():
        if name in full_name:
            matches.append(code)
    if matches:
        return matches[-1]  # Return the last match (preferring HK/US over earlier A-shares, or just picking one)
    return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tickers', type=str, required=True, help="Comma separated list of tickers")
    args = parser.parse_args()

    # Disable annoying warnings or logging to stdout
    logging.getLogger().setLevel(logging.INFO)

    config = get_config()
    # Force single stock notify off, we are doing headless polling
    config.single_stock_notify = False
    
    # Force agent mode if deep research is needed, else use direct 
    config.agent_mode = False 

    raw_inputs = [c.strip() for c in args.tickers.split(',') if c.strip()]
    stock_codes = []
    for raw in raw_inputs:
        if is_code_like(raw):
            stock_codes.append(canonical_stock_code(raw))
        else:
            # Resolve Chinese name / fuzzy name to actual stock code
            resolved = resolve_name_to_code(raw)
            if not resolved:
                # Fallback: try substring match for short Chinese abbreviations
                resolved = _substring_resolve(raw)
            if resolved:
                sys.stderr.write(f"[NameResolver] Resolved '{raw}' -> '{resolved}'\n")
                stock_codes.append(canonical_stock_code(resolved))
            else:
                sys.stderr.write(f"[NameResolver] Could not resolve '{raw}', using as-is\n")
                stock_codes.append(canonical_stock_code(raw))
    
    pipeline = StockAnalysisPipeline(
        config=config,
        max_workers=1,
        query_id="headless_run",
        query_source="cli"
    )

    final_results = {}

    for code in stock_codes:
        sys.stderr.write(f"\\x1b[34m========== Analyzing {code} ==========\\x1b[0m\\n")
        
        # Manually run the pipeline analysis bypasssing notifications
        sys.stderr.write(f"Fetching data for {code}...\\n")
        pipeline.fetch_and_save_stock_data(code)
        
        sys.stderr.write(f"Running LLM analysis for {code}...\\n")
        result = pipeline.analyze_stock(code, report_type=ReportType.SIMPLE, query_id="headless_run")
        
        if result:
            # We want to format the result nicely as Markdown
            # The AnalysisResult object has properties we can build a decent MD string from
            # For simplicity, we just use the raw properties or whatever the model output context 
            # Or use notifier.generate_aggregate_report
            content = pipeline.notifier.generate_aggregate_report([result], 'simple')
            final_results[code] = {
                "decision": result.operation_advice,
                "score": result.sentiment_score,
                "markdown": content
            }
        else:
            final_results[code] = {"error": "Analysis failed or returned empty"}

    # output final JSON to real stdout
    sys.stdout = original_stdout
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        
    sys.stderr.write("\n[StockAnalysis Runner] Execution complete.\n")
    sys.stdout.write(json.dumps(final_results, ensure_ascii=False, indent=2) + "\n")
    sys.stdout.flush()
    os._exit(0)

if __name__ == "__main__":
    main()
