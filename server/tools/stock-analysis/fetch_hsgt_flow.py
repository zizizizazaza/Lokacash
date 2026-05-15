"""
fetch_hsgt_flow.py — Shanghai/Shenzhen-Hong Kong Stock Connect flow fetcher.

Wraps akshare's HSGT (沪深港通) endpoints:
  - 北向资金 (Northbound) = Mainland buying A-shares via Stock Connect
      sub-channels: 沪股通 (SH-HK) / 深股通 (SZ-HK)
  - 南向资金 (Southbound) = Mainland buying HK stocks via Stock Connect
      sub-channels: 港股通沪 (HK via SH) / 港股通深 (HK via SZ)
  - Today's summary across all 4 channels
  - Per-stock holdings change (when ticker given)

Used by the SuperAgent v2 `hsgt_flow` tool (hsgtFlowTool.ts).

Usage:
  python fetch_hsgt_flow.py --direction southbound --days 30
  python fetch_hsgt_flow.py --direction northbound --days 7
  python fetch_hsgt_flow.py --direction summary
  python fetch_hsgt_flow.py --ticker 600519 --days 30   # per-stock NB holdings
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

os.environ.setdefault("AKSHARE_DISABLE_DEPRECATION_WARNING", "1")


def _normalize_stock_code(raw: str) -> str:
    s = (raw or "").strip().upper()
    s = re.sub(r"\.(SH|SZ|SS|BJ|HK)$", "", s)
    s = re.sub(r"^(SH|SZ|BJ|HK)", "", s)
    return s


def _is_hk_ticker(raw: str, normalized: str) -> bool:
    """HK Stock Connect southbound tickers — 4-5 digit codes, often with .HK
    suffix. Distinguish from A-share (always 6 digits)."""
    if re.search(r"\.HK$", (raw or "").strip(), re.IGNORECASE):
        return True
    if re.match(r"^HK", (raw or "").strip(), re.IGNORECASE):
        return True
    # Bare 4 or 5 digit codes (0700, 00700, 9988) — A-share is always 6 digit
    if re.match(r"^\d{4,5}$", normalized):
        return True
    return False


def _pad_hk_code(code: str) -> str:
    """akshare's southbound endpoint expects 5-digit zero-padded HK codes."""
    digits = re.sub(r"\D", "", code)
    if not digits:
        return code
    return digits.zfill(5)


def _to_records(df, limit: int | None = None) -> list[dict]:
    if df is None or len(df) == 0:
        return []
    if limit is not None and len(df) > limit:
        df = df.tail(limit)  # most recent N rows
    rows = df.to_dict(orient="records")
    cleaned: list[dict] = []
    import math
    for r in rows:
        out: dict = {}
        for k, v in r.items():
            if v is None:
                out[k] = None
                continue
            try:
                if isinstance(v, float) and math.isnan(v):
                    out[k] = None
                    continue
            except Exception:
                pass
            t = type(v).__name__
            if t in ("int64", "int32"):
                out[k] = int(v)
            elif t in ("float64", "float32"):
                out[k] = float(v)
            elif t == "Timestamp":
                out[k] = str(v)
            else:
                out[k] = v
        cleaned.append(out)
    return cleaned


def fetch_history(symbol: str, days: int) -> tuple[list[dict] | None, str | None]:
    """akshare 沪深港通历史。symbol ∈ {沪股通, 深股通, 港股通沪, 港股通深}.

    Returns the most recent `days` rows (akshare returns full history).
    Each row typically has: 日期, 当日成交净买额, 当日资金流入, 历史累计净买额, etc.
    """
    try:
        import akshare as ak
        df = ak.stock_hsgt_hist_em(symbol=symbol)
        return _to_records(df, limit=days), None
    except Exception as e:
        return None, f"stock_hsgt_hist_em({symbol}) failed: {e}"


def fetch_summary() -> tuple[dict | None, str | None]:
    """Today's flow summary across all 4 channels."""
    try:
        import akshare as ak
        df = ak.stock_hsgt_fund_flow_summary_em()
        rows = _to_records(df)
        return {"rows": rows}, None
    except Exception as e:
        return None, f"stock_hsgt_fund_flow_summary_em failed: {e}"


def fetch_individual_holdings(ticker: str, days: int) -> tuple[list[dict] | None, str | None]:
    """Per-stock Stock Connect holdings change over time (A-share northbound).

    Useful for tracking 'is the mainland accumulating this A-share via 沪/深股通?'
    """
    try:
        import akshare as ak
        df = ak.stock_hsgt_individual_em(stock=ticker)
        return _to_records(df, limit=days), None
    except Exception as e:
        return None, f"stock_hsgt_individual_em({ticker}) failed: {e}"


def fetch_hk_individual_holdings(ticker: str, days: int) -> tuple[list[dict] | None, str | None]:
    """Per-HK-stock Southbound holdings change over time.

    For questions like '港股通持仓了多少腾讯 / 美团?'.

    NOTE on data availability: akshare's free endpoints do NOT have a clean
    per-HK-stock Southbound holdings time-series. We try several candidate
    functions in order of likelihood; if none work, return a structured
    explanation so the synthesis model can pivot to alternative sources
    (port-level aggregates + news context + manual reference to HKEX CCASS).
    """
    padded = _pad_hk_code(ticker)
    bare = re.sub(r"^0+", "", padded)
    candidate_fns = [
        # Most likely candidates (function name + kwargs):
        ("stock_hsgt_hk_stock_statistics_em", {"symbol": "股票", "indicator": "今日排行"}),
        ("stock_hsgt_hk_stock_statistics_em", {}),
        ("stock_hsgt_hold_stock_em", {"symbol": "南向持股"}),
        ("stock_hsgt_hold_stock_em", {}),
        ("stock_hk_ggt_components_em", {}),
    ]

    last_err: str | None = None
    try:
        import akshare as ak
    except Exception as e:
        return None, f"akshare import failed: {e}"

    for fn_name, kwargs in candidate_fns:
        fn = getattr(ak, fn_name, None)
        if fn is None:
            last_err = f"{fn_name}: not present in akshare"
            continue
        try:
            df = fn(**kwargs)
        except Exception as e:
            last_err = f"{fn_name}({kwargs}): {e}"
            continue
        if df is None:
            last_err = f"{fn_name}: returned None"
            continue
        try:
            if len(df) == 0:
                last_err = f"{fn_name}: returned empty"
                continue
        except Exception:
            last_err = f"{fn_name}: object has no len()"
            continue
        if not hasattr(df, "columns"):
            last_err = f"{fn_name}: returned object without columns"
            continue
        # Locate a "代码" column to filter by
        code_col = next((c for c in df.columns if "代码" in c), None)
        if code_col is None:
            last_err = f"{fn_name}: no 代码 column (columns: {list(df.columns)[:6]})"
            continue
        try:
            match = df[
                df[code_col].astype(str).apply(
                    lambda s: padded in s or (bare and bare == re.sub(r"^0+", "", s))
                )
            ]
        except Exception as e:
            last_err = f"{fn_name}: filter error: {e}"
            continue
        if len(match) == 0:
            last_err = f"{fn_name}: HK ticker {padded} not found in table"
            continue
        return _to_records(match, limit=days), None

    # All candidates exhausted — return structured error explaining the
    # current data-availability gap so the synthesis model doesn't pretend
    # this endpoint is temporarily down (it's a structural akshare limit).
    return None, (
        f"per-HK-stock SB holdings unavailable via akshare free endpoints; "
        f"last attempt: {last_err}. Alternative sources: HKEX CCASS daily disclosure "
        f"(per-broker holdings of {padded}), HKEX monthly top-N southbound holdings snapshot, "
        f"or paid terminals (Wind / Bloomberg)."
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--direction",
        default="summary",
        choices=["northbound", "southbound", "summary", "all"],
        help="northbound = 北向 (mainland → A-share), southbound = 南向 (mainland → HK), summary = today's snapshot, all = both north + south histories",
    )
    parser.add_argument("--days", type=int, default=30, help="Days of history (default 30)")
    parser.add_argument("--ticker", default=None, help="Optional A-share ticker for per-stock NB holdings (e.g. 600519)")
    args = parser.parse_args()

    started = time.time()
    out: dict = {
        "direction": args.direction,
        "days": args.days,
        "ticker": args.ticker,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "errors": [],
    }

    # Per-stock holdings: takes precedence when ticker is given. Route to
    # the right akshare endpoint based on whether the ticker is A-share
    # (6-digit, northbound holdings) or HK (4-5 digit, southbound holdings).
    if args.ticker:
        code = _normalize_stock_code(args.ticker)
        is_hk = _is_hk_ticker(args.ticker, code)
        out["stock_code"] = _pad_hk_code(code) if is_hk else code
        out["ticker_type"] = "HK_southbound" if is_hk else "A_northbound"
        if is_hk:
            data, err = fetch_hk_individual_holdings(code, args.days)
        else:
            data, err = fetch_individual_holdings(code, args.days)
        out["per_stock_holdings"] = data
        if err:
            out["errors"].append(err)

    if args.direction in ("northbound", "all"):
        for channel in ("沪股通", "深股通"):
            key = f"history_{channel}"
            data, err = fetch_history(channel, args.days)
            out[key] = data
            if err:
                out["errors"].append(err)

    if args.direction in ("southbound", "all"):
        for channel in ("港股通沪", "港股通深"):
            key = f"history_{channel}"
            data, err = fetch_history(channel, args.days)
            out[key] = data
            if err:
                out["errors"].append(err)

    if args.direction == "summary":
        data, err = fetch_summary()
        out["summary"] = data
        if err:
            out["errors"].append(err)

    out["elapsed_s"] = round(time.time() - started, 2)

    sys.stdout.write(json.dumps(out, ensure_ascii=False, default=str))
    sys.stdout.write("\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        sys.stderr.write(f"[fetch_hsgt_flow] fatal: {e}\n")
        sys.stdout.write(json.dumps({"errors": [f"fatal: {e}"]}, ensure_ascii=False))
        sys.stdout.write("\n")
        sys.exit(1)
