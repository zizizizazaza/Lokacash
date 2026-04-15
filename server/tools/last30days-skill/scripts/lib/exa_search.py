"""Exa AI web search for last30days skill.

Uses the Exa Search API as a free web search backend.
Free tier: 1,000 searches/month, semantic search, no credit card required.

API docs: https://docs.exa.ai/reference/search
"""

import sys
import time
import os
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from . import http

ENDPOINT = "https://api.exa.ai/search"

# Domains to exclude (handled by Reddit/X search)
EXCLUDED_DOMAINS = {
    "reddit.com", "www.reddit.com", "old.reddit.com",
    "twitter.com", "www.twitter.com", "x.com", "www.x.com",
}


def _safe_topic_preview(topic: str, max_len: int = 80) -> str:
    text = (topic or "").strip().replace("\n", " ")
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def search_web(
    topic: str,
    from_date: str,
    to_date: str,
    api_key: str,
    depth: str = "default",
) -> List[Dict[str, Any]]:
    """Search the web via Exa AI Search API.

    Args:
        topic: Search topic
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        api_key: Exa API key
        depth: 'quick', 'default', or 'deep'

    Returns:
        List of result dicts with keys: url, title, snippet, source_domain, date, relevance
    """
    # quick 模式默认给更多网页结果，减少 "x=8, web=8" 的单一观感。
    base_num_results = {"quick": 12, "default": 15, "deep": 25}
    num_results = base_num_results.get(depth, 15)
    # 可选覆盖：
    #   EXA_NUM_RESULTS_QUICK / EXA_NUM_RESULTS_DEFAULT / EXA_NUM_RESULTS_DEEP
    #   LAST30DAYS_WEB_NUM_RESULTS_QUICK / ..._DEFAULT / ..._DEEP
    # 只接受 1~50 的整数，避免意外配置导致请求过重。
    depth_upper = str(depth or "default").upper()
    env_candidates = [
        os.getenv(f"EXA_NUM_RESULTS_{depth_upper}"),
        os.getenv(f"LAST30DAYS_WEB_NUM_RESULTS_{depth_upper}"),
    ]
    for raw in env_candidates:
        if raw is None:
            continue
        try:
            parsed = int(str(raw).strip())
        except Exception:
            continue
        if 1 <= parsed <= 50:
            num_results = parsed
            break

    max_chars = {"quick": 1000, "default": 2000, "deep": 3000}.get(depth, 2000)

    payload = {
        "query": f"{topic} (from {from_date} to {to_date})",
        "type": "auto",
        "numResults": num_results,
        "contents": {"text": {"maxCharacters": max_chars}},
    }

    # Add date filtering if dates are provided
    if from_date:
        payload["startPublishedDate"] = f"{from_date}T00:00:00.000Z"
    if to_date:
        payload["endPublishedDate"] = f"{to_date}T23:59:59.999Z"

    # Structured observability line for backend log parsing
    sys.stderr.write(
        "[Exa] request "
        f"depth={depth} num_results={num_results} max_chars={max_chars} "
        f"from={from_date or 'n/a'} to={to_date or 'n/a'} "
        f"topic=\"{_safe_topic_preview(topic)}\"\n"
    )
    sys.stderr.write(f"[Web] Searching Exa for: {topic}\n")
    sys.stderr.flush()

    started = time.perf_counter()
    try:
        response = http.post(
            ENDPOINT,
            json_data=payload,
            headers={
                "x-api-key": api_key,
            },
            timeout=20,
            retries=2,
        )
    except http.HTTPError as e:
        elapsed = time.perf_counter() - started
        status = e.status_code
        if status == 401:
            sys.stderr.write(f"[Exa] failed elapsed_s={elapsed:.3f} status=401 reason=invalid_api_key\n")
            sys.stderr.write("[Web] Exa: invalid API key (401)\n")
            sys.stderr.flush()
            return []
        if status == 429:
            sys.stderr.write(f"[Exa] failed elapsed_s={elapsed:.3f} status=429 reason=rate_limited\n")
            sys.stderr.write("[Web] Exa: rate limited (429)\n")
            sys.stderr.flush()
            return []
        sys.stderr.write(f"[Exa] failed elapsed_s={elapsed:.3f} status={status} reason=http_error\n")
        sys.stderr.write(f"[Web] Exa: HTTP error {status}: {e}\n")
        sys.stderr.flush()
        return []
    except Exception as e:
        elapsed = time.perf_counter() - started
        sys.stderr.write(f"[Exa] failed elapsed_s={elapsed:.3f} status=n/a reason=exception\n")
        sys.stderr.write(f"[Web] Exa: request failed: {e}\n")
        sys.stderr.flush()
        return []

    elapsed = time.perf_counter() - started
    normalized = _normalize_results(response)
    raw_count = len(response.get("results", [])) if isinstance(response, dict) else 0
    sys.stderr.write(
        f"[Exa] done elapsed_s={elapsed:.3f} raw_results={raw_count} normalized_results={len(normalized)}\n"
    )
    sys.stderr.flush()
    return normalized


def _normalize_results(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Convert Exa API response to websearch item schema.

    Exa results have: title, url, text, publishedDate, score, author.
    """
    items = []

    results = response.get("results", [])
    if not isinstance(results, list):
        return items

    for i, result in enumerate(results):
        if not isinstance(result, dict):
            continue

        url = result.get("url", "")
        if not url:
            continue

        # Skip excluded domains
        try:
            domain = urlparse(url).netloc.lower()
            if domain in EXCLUDED_DOMAINS:
                continue
            if domain.startswith("www."):
                domain = domain[4:]
        except Exception:
            domain = ""

        title = str(result.get("title", "")).strip()
        # Exa returns page content in "text" field
        snippet = str(result.get("text", "")).strip()

        if not title and not snippet:
            continue

        # Parse publishedDate (ISO format from Exa: "2026-03-15T00:00:00.000Z")
        date = _parse_exa_date(result.get("publishedDate"))
        date_confidence = "med" if date else "low"

        # Exa provides a relevance score
        relevance = result.get("score", 0.6)
        try:
            relevance = min(1.0, max(0.0, float(relevance)))
        except (TypeError, ValueError):
            relevance = 0.6

        items.append({
            "id": f"W{i+1}",
            "title": title[:200],
            "url": url,
            "source_domain": domain,
            "snippet": snippet[:500],
            "date": date,
            "date_confidence": date_confidence,
            "relevance": relevance,
            "why_relevant": "",
        })

    sys.stderr.write(f"[Web] Exa: {len(items)} results\n")
    sys.stderr.flush()

    return items


def _parse_exa_date(published_date: Optional[str]) -> Optional[str]:
    """Parse Exa's publishedDate to YYYY-MM-DD.

    Exa returns ISO format like "2026-03-15T00:00:00.000Z".
    """
    if not published_date:
        return None

    try:
        # Extract YYYY-MM-DD from ISO datetime
        if "T" in published_date:
            return published_date.split("T")[0]
        # Already YYYY-MM-DD
        if len(published_date) >= 10:
            return published_date[:10]
    except Exception:
        pass

    return None
