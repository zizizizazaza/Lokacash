# -*- coding: utf-8 -*-
"""
===================================
FmpFetcher - Financial Modeling Prep 美股主源 (Priority 3)
===================================

数据来源：Financial Modeling Prep (https://financialmodelingprep.com)
覆盖范围：美股个股（日线/5min/实时报价）
不覆盖：A股、港股、美股指数（Starter 档次被限制，路由层会跳过）

定位：
- 替代不稳定的 YFinance 作为美股日线/实时报价主源
- Starter 档次支持日线 + 5min + 实时报价；1min、HK/A股需 Premium

环境变量：
- FMP_API_KEY: 必需，来自 FMP Dashboard
- FMP_PRIORITY: 可选，默认 3（比 YFinance 的 4 高一级）
- FMP_MIN_INTERVAL_MS: 可选，调用间隔（毫秒），默认 250，防止配额耗尽
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Dict, List, Optional

import pandas as pd
import requests
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)

from .base import BaseFetcher, DataFetchError, RateLimitError, STANDARD_COLUMNS
from .realtime_types import UnifiedRealtimeQuote, RealtimeSource
from .us_index_mapping import is_us_stock_code

logger = logging.getLogger(__name__)


class _FmpRestrictedError(DataFetchError):
    """FMP 返回 402（订阅不足）或 403。该代码在当前档次不可用，不应重试。"""


class FmpFetcher(BaseFetcher):
    """
    Financial Modeling Prep 数据源。

    优先级：3（高于 YFinance=4，低于 Akshare=1、Efinance=0）
    仅处理美股股票；A股/港股/美股指数在 _fetch_raw_data / get_realtime_quote
    会立即 raise/return None，让路由层切下一个 fetcher。
    """

    name = "FmpFetcher"
    priority = int(os.getenv("FMP_PRIORITY", "3"))

    BASE_URL = "https://financialmodelingprep.com/stable"

    def __init__(self) -> None:
        self._api_key = (os.getenv("FMP_API_KEY") or "").strip()
        self._session = requests.Session()
        self._session.headers.update(
            {
                "User-Agent": "lokacash-stock-analysis/1.0",
                "Accept": "application/json",
            }
        )
        # 最小调用间隔，保护 Starter 档次配额（默认 300 calls/min ≈ 200ms/call，给余量）
        self._min_interval_s = max(0.0, int(os.getenv("FMP_MIN_INTERVAL_MS", "250"))) / 1000.0
        self._rate_lock = threading.Lock()
        self._last_request_ts: float = 0.0

        if not self._api_key:
            logger.warning("[FMP] FMP_API_KEY 未配置，FmpFetcher 将对所有请求快速失败")

    def is_configured(self) -> bool:
        return bool(self._api_key)

    def _throttle(self) -> None:
        """串行化请求之间的最小间隔，避免突发打爆 Starter 档的限速。"""
        if self._min_interval_s <= 0:
            return
        with self._rate_lock:
            now = time.monotonic()
            wait = self._min_interval_s - (now - self._last_request_ts)
            if wait > 0:
                time.sleep(wait)
            self._last_request_ts = time.monotonic()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((requests.ConnectionError, requests.Timeout, RateLimitError)),
        before_sleep=before_sleep_log(logger, logging.WARNING),
    )
    def _http_get(self, path: str, params: Dict[str, Any]) -> Any:
        """
        封装 FMP HTTP 调用。

        - 402/403（订阅不足 / 该 symbol 不在当前档次）→ _FmpRestrictedError（不重试，路由层会切源）
        - 429 → RateLimitError（触发退避重试）
        - 5xx / 网络抖动 → ConnectionError/Timeout（重试）
        - 空列表 → 返回 []，由调用方决定是否视为无数据
        """
        if not self._api_key:
            raise DataFetchError("[FMP] FMP_API_KEY 未配置")

        self._throttle()
        url = f"{self.BASE_URL}{path}"
        query = {**params, "apikey": self._api_key}
        try:
            resp = self._session.get(url, params=query, timeout=20)
        except requests.Timeout as e:
            raise e
        except requests.ConnectionError as e:
            raise e

        if resp.status_code in (402, 403):
            snippet = (resp.text or "").strip()[:200]
            raise _FmpRestrictedError(f"[FMP] {resp.status_code} restricted: {snippet}")

        if resp.status_code == 429:
            raise RateLimitError(f"[FMP] 429 rate limited: {(resp.text or '').strip()[:200]}")

        if resp.status_code >= 500:
            # 服务端错误当作网络抖动处理，让 tenacity 重试
            raise requests.ConnectionError(f"[FMP] server error {resp.status_code}")

        if resp.status_code != 200:
            raise DataFetchError(
                f"[FMP] HTTP {resp.status_code}: {(resp.text or '').strip()[:200]}"
            )

        try:
            data = resp.json()
        except ValueError as e:
            raise DataFetchError(f"[FMP] 响应非合法 JSON: {e}") from e

        if isinstance(data, dict) and "Error Message" in data:
            raise DataFetchError(f"[FMP] API 错误: {data['Error Message']}")
        return data

    # ---------------------------------------------------------------- K 线

    def _fetch_raw_data(self, stock_code: str, start_date: str, end_date: str) -> pd.DataFrame:
        """
        拉取美股日线数据。非美股股票直接抛异常让路由切下一个源。
        返回 DatetimeIndex + [Open, High, Low, Close, Volume] 的 DataFrame，
        对齐 yfinance 风格，便于 _normalize_data 处理。
        """
        symbol = (stock_code or "").strip().upper()
        if not is_us_stock_code(symbol):
            raise DataFetchError(f"[FMP] 仅支持美股，跳过 {stock_code}")

        if not self._api_key:
            raise DataFetchError("[FMP] FMP_API_KEY 未配置，跳过")

        logger.debug(f"[FMP] 拉取日线 symbol={symbol} from={start_date} to={end_date}")
        try:
            data = self._http_get(
                "/historical-price-eod/full",
                {"symbol": symbol, "from": start_date, "to": end_date},
            )
        except _FmpRestrictedError as e:
            # 该 symbol 在当前档次不可用 —— 让路由切下一个源
            raise DataFetchError(str(e)) from e

        if not isinstance(data, list) or not data:
            raise DataFetchError(f"[FMP] {symbol} 在 {start_date}~{end_date} 无日线数据")

        df = pd.DataFrame(data)
        required = {"date", "open", "high", "low", "close", "volume"}
        missing = required - set(df.columns)
        if missing:
            raise DataFetchError(f"[FMP] {symbol} 响应缺少字段: {missing}")

        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        df = df.dropna(subset=["date"]).sort_values("date")

        # 用 .values 脱成 ndarray，否则 Series 会按原 index 对齐，新 DatetimeIndex 下全部变 NaN
        out = pd.DataFrame(
            {
                "Open": pd.to_numeric(df["open"], errors="coerce").values,
                "High": pd.to_numeric(df["high"], errors="coerce").values,
                "Low": pd.to_numeric(df["low"], errors="coerce").values,
                "Close": pd.to_numeric(df["close"], errors="coerce").values,
                "Volume": pd.to_numeric(df["volume"], errors="coerce").fillna(0).values,
            },
            index=pd.DatetimeIndex(df["date"].values, name="Date"),
        )
        out = out.dropna(how="any", subset=["Open", "High", "Low", "Close"])
        if out.empty:
            raise DataFetchError(f"[FMP] {symbol} 清洗后无有效 K 线")
        return out

    def _normalize_data(self, df: pd.DataFrame, stock_code: str) -> pd.DataFrame:
        """
        将 _fetch_raw_data 的 DataFrame 转成标准列：
        ['code', 'date', 'open', 'high', 'low', 'close', 'volume', 'amount', 'pct_chg']
        """
        out = df.copy().reset_index()
        out = out.rename(
            columns={
                "Date": "date",
                "Open": "open",
                "High": "high",
                "Low": "low",
                "Close": "close",
                "Volume": "volume",
            }
        )

        if "close" in out.columns:
            out["pct_chg"] = (out["close"].pct_change() * 100).fillna(0).round(2)
        else:
            out["pct_chg"] = 0.0

        if "volume" in out.columns and "close" in out.columns:
            out["amount"] = out["volume"] * out["close"]
        else:
            out["amount"] = 0.0

        out["code"] = (stock_code or "").strip().upper()

        keep = ["code"] + STANDARD_COLUMNS
        existing = [c for c in keep if c in out.columns]
        return out[existing]

    # -------------------------------------------------------------- 实时行情

    def get_realtime_quote(self, stock_code: str) -> Optional[UnifiedRealtimeQuote]:
        """
        获取美股实时报价。非美股或未配置 key 返回 None。
        """
        symbol = (stock_code or "").strip().upper()
        if not is_us_stock_code(symbol):
            return None
        if not self._api_key:
            return None

        try:
            data = self._http_get("/quote", {"symbol": symbol})
        except _FmpRestrictedError as e:
            logger.info(f"[FMP] {symbol} 实时报价在当前档次不可用: {e}")
            return None
        except Exception as e:
            logger.warning(f"[FMP] {symbol} 实时报价获取失败: {e}")
            return None

        if not isinstance(data, list) or not data:
            logger.info(f"[FMP] {symbol} 实时报价返回空")
            return None

        row = data[0] or {}

        def _f(key: str) -> Optional[float]:
            val = row.get(key)
            try:
                return float(val) if val is not None else None
            except (TypeError, ValueError):
                return None

        def _i(key: str) -> Optional[int]:
            val = row.get(key)
            try:
                return int(val) if val is not None else None
            except (TypeError, ValueError):
                return None

        price = _f("price")
        prev_close = _f("previousClose")
        high = _f("dayHigh")
        low = _f("dayLow")

        change_amount = _f("change")
        change_pct = _f("changePercentage")
        if change_pct is None and price is not None and prev_close and prev_close > 0:
            change_pct = (price - prev_close) / prev_close * 100

        amplitude = None
        if high is not None and low is not None and prev_close and prev_close > 0:
            amplitude = (high - low) / prev_close * 100

        quote = UnifiedRealtimeQuote(
            code=symbol,
            name=row.get("name", "") or "",
            source=RealtimeSource.FMP,
            price=price,
            change_pct=round(change_pct, 2) if change_pct is not None else None,
            change_amount=round(change_amount, 4) if change_amount is not None else None,
            volume=_i("volume"),
            amount=None,  # FMP quote 不直接给成交额
            volume_ratio=None,
            turnover_rate=None,
            amplitude=round(amplitude, 2) if amplitude is not None else None,
            open_price=_f("open"),
            high=high,
            low=low,
            pre_close=prev_close,
            pe_ratio=None,
            pb_ratio=None,
            total_mv=_f("marketCap"),
            circ_mv=None,
            high_52w=_f("yearHigh"),
            low_52w=_f("yearLow"),
        )

        if not quote.has_basic_data():
            logger.info(f"[FMP] {symbol} 报价缺少价格数据")
            return None

        logger.info(f"[FMP] 获取美股 {symbol} 实时行情成功: price={price}")
        return quote


if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)
    f = FmpFetcher()
    print("configured:", f.is_configured())
    try:
        df = f.get_daily_data("AAPL", days=10)
        print(df.tail())
    except Exception as e:
        print("daily failed:", e)
    try:
        q = f.get_realtime_quote("AAPL")
        print("quote:", q)
    except Exception as e:
        print("quote failed:", e)
