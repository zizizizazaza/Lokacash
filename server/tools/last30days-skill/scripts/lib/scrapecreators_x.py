"""X/Twitter data via ScrapeCreators API for /last30days.

ScrapeCreators **does not** expose a global X keyword search endpoint in current OpenAPI
(only Profile, User Tweets, Tweet, Transcript, Community, Community Tweets — see
https://docs.scrapecreators.com/openapi.json paths under ``/v1/twitter``).

This module therefore fetches tweets via **GET /v1/twitter/user-tweets** when the topic
contains one or more ``@handles``. Legacy ``/search/tweets`` returns 404 and is not used.

Same API key as Reddit, TikTok, and Instagram - one key covers all social sources.

Requires SCRAPECREATORS_API_KEY in config.
API docs: https://docs.scrapecreators.com/
"""

import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    import requests as _requests
except ImportError:
    _requests = None

SCRAPECREATORS_BASE = "https://api.scrapecreators.com/v1/twitter"

DEPTH_CONFIG = {
    "quick":   {"results_per_page": 10},
    "default": {"results_per_page": 20},
    "deep":    {"results_per_page": 40},
}

from .relevance import token_overlap_relevance as _compute_relevance

_HANDLE_RE = re.compile(r"@([A-Za-z0-9_]{1,15})\b")


def _extract_handles(topic: str) -> list[str]:
    """Return unique Twitter handles from topic (lowercase, without @)."""
    seen: set[str] = set()
    out: list[str] = []
    for m in _HANDLE_RE.finditer(topic or ""):
        h = m.group(1).lower()
        if h not in seen:
            seen.add(h)
            out.append(h)
    return out


def _parse_handle_from_tweet_url(url: str) -> str:
    if not url or "x.com/" not in url and "twitter.com/" not in url:
        return ""
    try:
        # https://x.com/Handle/status/123
        part = url.split("x.com/", 1)[-1].split("twitter.com/", 1)[-1]
        seg = part.strip("/").split("/")
        if seg and seg[0] and seg[0] not in ("i", "intent", "home", "search"):
            return seg[0].lstrip("@")
    except Exception:
        pass
    return ""


def _normalize_tweet_dict(
    raw: Dict[str, Any],
    core_topic: str,
    default_handle: str,
    idx: int,
) -> Dict[str, Any]:
    """Normalize either legacy flat tweet dict or user-tweets API shape (legacy nested)."""
    legacy = raw.get("legacy") if isinstance(raw.get("legacy"), dict) else None
    flat = raw if legacy is None else {**raw, **legacy}

    tweet_id = str(
        raw.get("rest_id")
        or raw.get("id")
        or raw.get("tweet_id")
        or raw.get("id_str")
        or (legacy or {}).get("id_str")
        or f"sc-x-{idx}",
    )
    text = (
        (legacy or {}).get("full_text")
        or flat.get("full_text")
        or flat.get("text")
        or ""
    )
    user = flat.get("user") or flat.get("author") or {}
    author_handle = (
        user.get("screen_name")
        or user.get("username")
        or _parse_handle_from_tweet_url(str(raw.get("url") or ""))
        or default_handle
    )

    likes = flat.get("favorite_count") or flat.get("likes") or 0
    retweets = flat.get("retweet_count") or flat.get("retweets") or 0
    replies = flat.get("reply_count") or flat.get("replies") or 0
    quotes = flat.get("quote_count") or flat.get("quotes") or 0

    date_str = _parse_date(flat if legacy is None else {**flat, **legacy})
    relevance = _compute_relevance(core_topic, text)

    url = str(raw.get("url") or "").strip()
    if not url and author_handle and tweet_id and not str(tweet_id).startswith("sc-x-"):
        url = f"https://x.com/{author_handle}/status/{tweet_id}"

    return {
        "id": tweet_id,
        "text": text,
        "url": url,
        "author_handle": author_handle,
        "date": date_str,
        "engagement": {
            "likes": likes,
            "reposts": retweets,
            "replies": replies,
            "quotes": quotes,
        },
        "relevance": relevance,
        "why_relevant": f"X: @{author_handle}: {text[:60]}" if text else f"X: {core_topic}",
    }


def _extract_core_subject(topic: str) -> str:
    """Extract core subject from verbose query for Twitter search."""
    from .query import extract_core_subject
    _SC_X_NOISE = frozenset({
        'best', 'top', 'good', 'great', 'awesome',
        'latest', 'new', 'news', 'update', 'updates',
        'trending', 'hottest', 'popular', 'viral',
        'practices', 'features', 'recommendations', 'advice',
    })
    return extract_core_subject(topic, noise=_SC_X_NOISE)


def _log(msg: str):
    sys.stderr.write(f"[X/SC] {msg}\n")
    sys.stderr.flush()


def _sc_headers(token: str) -> Dict[str, str]:
    return {
        "x-api-key": token,
        "Content-Type": "application/json",
    }


def _parse_date(item: Dict[str, Any]) -> Optional[str]:
    """Parse date from ScrapeCreators Twitter item to YYYY-MM-DD."""
    # Try created_at string (e.g. "Wed Oct 10 20:19:24 +0000 2018")
    created_at = item.get("created_at")
    if created_at and isinstance(created_at, str):
        try:
            dt = datetime.strptime(created_at, "%a %b %d %H:%M:%S %z %Y")
            return dt.strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            pass

    # Try unix timestamp
    ts = item.get("timestamp") or item.get("created_at_timestamp")
    if ts:
        try:
            dt = datetime.fromtimestamp(int(ts), tz=timezone.utc)
            return dt.strftime("%Y-%m-%d")
        except (ValueError, TypeError, OSError):
            pass

    # Try ISO format
    for key in ("created_at", "date"):
        val = item.get(key)
        if val and isinstance(val, str):
            try:
                dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
                return dt.strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                pass

    return None


def search_x(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    token: str = None,
) -> Dict[str, Any]:
    """Fetch X/Twitter posts via ScrapeCreators **user-tweets** (handles in topic).

    Returns:
        Dict with 'items' list (in normalize_x_items format) and optional 'error'.
    """
    if not token:
        return {"items": [], "error": "No SCRAPECREATORS_API_KEY configured"}

    if not _requests:
        return {"items": [], "error": "requests library not installed"}

    config = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])
    core_topic = _extract_core_subject(topic)
    handles = _extract_handles(topic)

    max_handles = 1 if depth == "quick" else (2 if depth == "default" else 3)
    handles = handles[:max_handles]

    if not handles:
        msg = (
            "ScrapeCreators has no global X keyword search in current API "
            "(see /v1/twitter/* in https://docs.scrapecreators.com/openapi.json). "
            "Include at least one @handle in the research topic, e.g. @SurfAI asksurf, "
            "or use Bird / xAI for full-text X search."
        )
        _log(msg)
        return {
            "items": [],
            "error": msg,
            "sc_debug": {
                "status_code": None,
                "mode": "no_handles",
                "core_topic": core_topic,
                "depth": depth,
                "from_date": from_date,
                "to_date": to_date,
                "raw_count": 0,
                "after_limit_count": 0,
                "kept_count": 0,
                "handles": [],
            },
        }

    _log(
        f"Fetching user-tweets for handles={handles} "
        f"(depth={depth}, cap={config['results_per_page']}, from={from_date}, to={to_date})"
    )

    paired: List[tuple[str, Dict[str, Any]]] = []
    last_status: Optional[int] = None
    for handle in handles:
        try:
            resp = _requests.get(
                f"{SCRAPECREATORS_BASE}/user-tweets",
                params={"handle": handle, "trim": "false"},
                headers=_sc_headers(token),
                timeout=30,
            )
            last_status = resp.status_code
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            _log(f"user-tweets @{handle} error: {e}")
            return {
                "items": [],
                "error": f"{type(e).__name__}: {e}",
                "sc_debug": {
                    "status_code": last_status,
                    "mode": "user_tweets",
                    "core_topic": core_topic,
                    "depth": depth,
                    "from_date": from_date,
                    "to_date": to_date,
                    "raw_count": len(paired),
                    "after_limit_count": 0,
                    "kept_count": 0,
                    "handles": handles,
                    "failed_handle": handle,
                },
            }

        batch = data.get("tweets") or data.get("data") or []
        _log(f"user-tweets @{handle} OK status={last_status} batch_len={len(batch)}")
        for tw in batch:
            if isinstance(tw, dict):
                paired.append((handle, tw))
        if len(paired) >= config["results_per_page"] * 3:
            break

    raw_count = len(paired)
    paired = paired[: config["results_per_page"] * 2]

    items: List[Dict[str, Any]] = []
    for i, (hint_handle, raw) in enumerate(paired):
        row = _normalize_tweet_dict(raw, core_topic, hint_handle, i)
        if row:
            items.append(row)

    # Date filter
    in_range = [i for i in items if i["date"] and from_date <= i["date"] <= to_date]
    out_of_range = len(items) - len(in_range)
    if in_range:
        items = in_range
        if out_of_range:
            _log(f"Filtered {out_of_range} tweets outside date range")
    else:
        _log(f"No tweets within date range, keeping all {len(items)}")

    items.sort(key=lambda x: (x["engagement"]["likes"] + x["engagement"]["reposts"]), reverse=True)
    items = items[: config["results_per_page"]]

    _log(f"Found {len(items)} tweets (raw={raw_count}, after_trim={len(paired)})")
    return {
        "items": items,
        "sc_debug": {
            "status_code": last_status,
            "mode": "user_tweets",
            "core_topic": core_topic,
            "depth": depth,
            "from_date": from_date,
            "to_date": to_date,
            "raw_count": raw_count,
            "after_limit_count": len(paired),
            "kept_count": len(items),
            "handles": handles,
        },
    }


def parse_x_response(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Parse search response to normalized format."""
    return response.get("items", [])
