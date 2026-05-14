"""
fetch_financial_report.py — A-share financial report fetcher.

Wraps akshare's earnings forecast / preliminary results / official report /
financial summary endpoints into a single CLI that prints JSON to stdout.

Used by the SuperAgent v2 `financial_report` tool (financialReportTool.ts).

Usage:
  python fetch_financial_report.py --stock-code 600519
  python fetch_financial_report.py --stock-code 000333.SZ --kinds yjyg,yjkb,abstract
  python fetch_financial_report.py --stock-code 600519 --period 20260331

Output JSON shape:
  {
    "stock_code": "600519",
    "period": "20260331",
    "fetched_at": "2026-05-11T13:00:00Z",
    "abstract": [...],        # 同花顺财务摘要（年/季度时间序列）
    "yjyg": {...} | null,     # 业绩预告（latest period）
    "yjkb": {...} | null,     # 业绩快报
    "yjbb": {...} | null,     # 业绩报表
    "errors": [...]
  }
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

# Silence akshare's noisy "Provider List" / progress logs that confuse JSON parsing
os.environ.setdefault("AKSHARE_DISABLE_DEPRECATION_WARNING", "1")


def _normalize_stock_code(raw: str) -> str:
    """600519.SH / 000333.SZ / sh600519 → 600519, 000333."""
    s = (raw or "").strip().upper()
    s = re.sub(r"\.(SH|SZ|SS|BJ)$", "", s)
    s = re.sub(r"^(SH|SZ|BJ)", "", s)
    return s


def _latest_quarter_end(today: datetime | None = None) -> str:
    """Pick the most recent quarter-end date in YYYYMMDD format."""
    today = today or datetime.now(timezone.utc)
    y, m = today.year, today.month
    if m >= 10:
        return f"{y}0930"
    if m >= 7:
        return f"{y}0630"
    if m >= 4:
        return f"{y}0331"
    return f"{y - 1}1231"


def _to_dict_records(df, limit: int | None = None) -> list[dict]:
    """Convert a pandas DataFrame to list[dict], trimming to `limit` rows.

    Coerces numpy types to plain Python so json.dumps works without a
    custom encoder.
    """
    if df is None or len(df) == 0:
        return []
    if limit is not None and len(df) > limit:
        df = df.head(limit)
    rows = df.to_dict(orient="records")
    # Strip NaN / numpy types
    cleaned: list[dict] = []
    for r in rows:
        out: dict = {}
        for k, v in r.items():
            if v is None:
                out[k] = None
                continue
            # numpy float NaN → None
            try:
                import math
                if isinstance(v, float) and math.isnan(v):
                    out[k] = None
                    continue
            except Exception:
                pass
            # Coerce numpy scalars
            v_type = type(v).__name__
            if v_type in ("int64", "int32"):
                out[k] = int(v)
            elif v_type in ("float64", "float32"):
                out[k] = float(v)
            elif v_type == "Timestamp":
                out[k] = str(v)
            else:
                out[k] = v
        cleaned.append(out)
    return cleaned


def fetch_abstract(stock_code: str) -> tuple[list[dict] | None, str | None]:
    """同花顺财务摘要 — per-ticker, time-series, most useful for AI synthesis.

    CRITICAL: akshare returns this dataset in ASCENDING period order (oldest
    first — 1998 / 1999 / 2000 / ...). A naive ``df.head(12)`` would surface
    the 12 OLDEST quarters, which is useless for current analysis. We must
    sort by 报告期 descending FIRST, then take the head — so the synthesis
    model gets 2026Q1 / 2025Q4 / 2025Q3 / ... (the most recent 12 periods).
    """
    try:
        import akshare as ak
        df = ak.stock_financial_abstract_ths(symbol=stock_code, indicator="按报告期")
        if df is None or len(df) == 0:
            return [], None
        if "报告期" in df.columns:
            try:
                df = df.sort_values("报告期", ascending=False).reset_index(drop=True)
            except Exception:
                # If sort fails for any reason, fall back to original order
                # but still take the LAST N rows (likely the most recent
                # under akshare's default ordering).
                df = df.tail(12).iloc[::-1].reset_index(drop=True)
        return _to_dict_records(df, limit=12), None
    except Exception as e:
        return None, f"stock_financial_abstract_ths failed: {e}"


def _fetch_periodic_by_ticker(
    ak_fn,
    label: str,
    period: str,
    stock_code: str,
) -> tuple[dict | None, str | None]:
    """Shared logic for yjyg/yjkb/yjbb: call akshare, defensively guard against
    None / empty / missing-column returns, then filter by ticker.

    akshare endpoints occasionally return None (network issue or the period
    isn't published yet for that endpoint). Hitting `.columns` on None used
    to crash with `'NoneType' object is not subscriptable`.
    """
    try:
        df = ak_fn(date=period)
    except Exception as e:
        return None, f"{label}({period}) call failed: {e}"

    if df is None:
        return None, None
    try:
        if len(df) == 0:
            return None, None
    except Exception:
        return None, None
    if not hasattr(df, "columns"):
        return None, f"{label}: returned object has no columns"

    try:
        code_col = next((c for c in df.columns if "代码" in c), None)
        if code_col is None:
            return None, f"{label}: no 代码 column (columns: {list(df.columns)[:6]})"
        match = df[df[code_col].astype(str).str.contains(stock_code, na=False)]
        if len(match) == 0:
            return None, None
        row = _to_dict_records(match, limit=1)
        return {"period": period, "row": row[0] if row else None}, None
    except Exception as e:
        return None, f"{label}({period}) filter failed: {e}"


def fetch_yjyg(period: str, stock_code: str) -> tuple[dict | None, str | None]:
    """业绩预告（按期）— filter to this ticker."""
    import akshare as ak
    return _fetch_periodic_by_ticker(ak.stock_yjyg_em, "stock_yjyg_em", period, stock_code)


def fetch_yjkb(period: str, stock_code: str) -> tuple[dict | None, str | None]:
    """业绩快报（按期）."""
    import akshare as ak
    return _fetch_periodic_by_ticker(ak.stock_yjkb_em, "stock_yjkb_em", period, stock_code)


def fetch_yjbb(period: str, stock_code: str) -> tuple[dict | None, str | None]:
    """业绩报表（按期）— official quarterly/annual results."""
    import akshare as ak
    return _fetch_periodic_by_ticker(ak.stock_yjbb_em, "stock_yjbb_em", period, stock_code)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stock-code", required=True, help="A-share ticker, e.g. 600519 or 600519.SH")
    parser.add_argument("--kinds", default="abstract,yjyg,yjkb,yjbb", help="comma-separated subset of: abstract,yjyg,yjkb,yjbb")
    parser.add_argument("--period", default=None, help="Reporting period YYYYMMDD; default = latest quarter end")
    args = parser.parse_args()

    started = time.time()
    code = _normalize_stock_code(args.stock_code)
    period = args.period or _latest_quarter_end()
    kinds = {k.strip() for k in args.kinds.split(",") if k.strip()}

    out: dict = {
        "stock_code": code,
        "period": period,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "errors": [],
    }

    if "abstract" in kinds:
        data, err = fetch_abstract(code)
        out["abstract"] = data
        if err:
            out["errors"].append(err)

    # The period-based endpoints are slower; try the latest period first,
    # then fall back one quarter if no row matches (recent quarter may not
    # have aggregated data yet).
    candidate_periods = [period]
    fallback = {
        "0331": f"{period[:4]}0101",   # if Q1 missing, no useful fallback
        "0630": f"{period[:4]}0331",
        "0930": f"{period[:4]}0630",
        "1231": f"{period[:4]}0930",
    }
    fb = fallback.get(period[-4:])
    if fb and fb != period:
        candidate_periods.append(fb)

    for key, fetcher in [("yjyg", fetch_yjyg), ("yjkb", fetch_yjkb), ("yjbb", fetch_yjbb)]:
        if key not in kinds:
            continue
        result: dict | None = None
        last_err: str | None = None
        for p in candidate_periods:
            data, err = fetcher(p, code)
            if err:
                last_err = err
            if data is not None:
                result = data
                break
        out[key] = result
        if last_err:
            out["errors"].append(last_err)

    out["elapsed_s"] = round(time.time() - started, 2)

    # Print pure JSON on a single line so Node can parse it cleanly
    sys.stdout.write(json.dumps(out, ensure_ascii=False, default=str))
    sys.stdout.write("\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        sys.stderr.write(f"[fetch_financial_report] fatal: {e}\n")
        # Emit a structured failure so Node can surface it gracefully
        sys.stdout.write(json.dumps({"errors": [f"fatal: {e}"]}, ensure_ascii=False))
        sys.stdout.write("\n")
        sys.exit(1)
