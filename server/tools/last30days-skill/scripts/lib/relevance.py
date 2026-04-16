"""Shared token-overlap relevance scoring for search result ranking.

The score is intentionally query-centric:
- exact phrase matches should score very high
- partial matches should pay a meaningful penalty
- matches on generic words alone ("odds", "review") should not pass as relevant
- query-side noise like "price / 市值 / 热门 / 24h" should not make unrelated posts look relevant
"""

import re
from typing import List, Optional, Set

# Stopwords for relevance computation (common English words that dilute token overlap)
STOPWORDS = frozenset({
    'the', 'a', 'an', 'to', 'for', 'how', 'is', 'in', 'of', 'on',
    'and', 'with', 'from', 'by', 'at', 'this', 'that', 'it', 'my',
    'your', 'i', 'me', 'we', 'you', 'what', 'are', 'do', 'can',
    'its', 'be', 'or', 'not', 'no', 'so', 'if', 'but', 'about',
    'all', 'just', 'get', 'has', 'have', 'was', 'will',
    '现在', '目前', '请问', '帮我', '一下', '这个', '那个', '呢', '啊', '呀', '的',
})

# Synonym groups for relevance scoring (bidirectional expansion)
# Superset of all platform-specific synonym dicts
SYNONYMS = {
    'hip': {'rap', 'hiphop'},
    'hop': {'rap', 'hiphop'},
    'rap': {'hip', 'hop', 'hiphop'},
    'hiphop': {'rap', 'hip', 'hop'},
    'js': {'javascript'},
    'javascript': {'js'},
    'ts': {'typescript'},
    'typescript': {'ts'},
    'ai': {'artificial', 'intelligence'},
    'ml': {'machine', 'learning'},
    'react': {'reactjs'},
    'reactjs': {'react'},
    'svelte': {'sveltejs'},
    'sveltejs': {'svelte'},
    'vue': {'vuejs'},
    'vuejs': {'vue'},
    'btc': {'bitcoin', '比特币'},
    'bitcoin': {'btc', '比特币'},
    '比特币': {'btc', 'bitcoin'},
    'eth': {'ethereum', '以太坊'},
    'ethereum': {'eth', '以太坊'},
    '以太坊': {'eth', 'ethereum'},
    'sol': {'solana'},
    'solana': {'sol'},
    'bnb': {'binancecoin', '币安币'},
    'binancecoin': {'bnb', '币安币'},
    '币安币': {'bnb', 'binancecoin'},
    'xrp': {'ripple', '瑞波'},
    'ripple': {'xrp', '瑞波'},
    '瑞波': {'xrp', 'ripple'},
    'doge': {'dogecoin', '狗狗币'},
    'dogecoin': {'doge', '狗狗币'},
    '狗狗币': {'doge', 'dogecoin'},
    'shib': {'shiba', '柴犬币', '柴犬'},
    'shiba': {'shib', '柴犬币', '柴犬'},
    '柴犬币': {'shib', 'shiba', '柴犬'},
    '柴犬': {'shib', 'shiba', '柴犬币'},
}

# Generic query words that should not carry relevance on their own.
# They still help when paired with stronger entity/topic matches.
LOW_SIGNAL_QUERY_TOKENS = frozenset({
    'advice', 'animation', 'animations', 'best', 'chance', 'chances',
    'code', 'compare', 'comparison', 'differences', 'explain', 'guide',
    'guides', 'how', 'latest', 'news', 'odds', 'opinion', 'opinions',
    'prediction', 'predictions', 'probability', 'probabilities', 'prompt',
    'prompting', 'prompts', 'rate', 'review', 'reviews', 'thoughts',
    'tip', 'tips', 'tutorial', 'tutorials', 'update', 'updates', 'use',
    'using', 'versus', 'vs', 'worth',
    'price', 'pricing', 'market', 'markets', 'cap', 'volume', 'trend',
    'trending', 'hot', 'popular', 'filter', 'scan', 'search', 'find',
    'crypto', 'cryptocurrency', 'coin', 'coins', 'token', 'tokens',
    'gainer', 'gainers', 'loser', 'losers', 'today', 'hour', 'hours', '24h',
    '价格', '币价', '现价', '市值', '行情', '走势', '热门', '热度', '查找', '查询',
    '筛选', '多少', '是什么', '是多少', '涨幅', '涨跌', '涨跌幅', '过去', '小时',
    '至少', '达到', '超过', '高于', '低于', '比较', '对比', '新闻', '消息', '讨论', '舆情',
})

QUERY_NOISE_PATTERNS = [
    re.compile(r'24\s*(?:hours?|hrs?|h|小时)', re.I),
    re.compile(r'\b(?:price|market\s*cap|market|volume|trending|popular|filter|scan|search|find|latest|news|hot|coins?|tokens?)\b', re.I),
    re.compile(r'(这个代币|这个币|代币|币种|币价|现价|价格|行情|走势|怎么样|如何|多少|是什么|是多少|请问|帮我|看一下|一下|目前|现在|呢|啊|呀|的|过去|小时|涨幅|涨跌|涨跌幅|热门|热度|市值|超过|高于|至少|达到|查找|查询|筛选|比较|对比|新闻|消息|讨论|舆情)'),
]

_TOKEN_RE = re.compile(r'[A-Za-z][A-Za-z0-9_./-]*|\d+(?:\.\d+)?|[\u4e00-\u9fff]+')


def _prepare_query_text(text: str) -> str:
    s = text.lower()
    for pattern in QUERY_NOISE_PATTERNS:
        s = pattern.sub(' ', s)
    return s


def tokenize(text: str, for_query: bool = False) -> Set[str]:
    """Lowercase, strip punctuation, remove stopwords, drop single-char tokens.

    Expands tokens with synonyms for better cross-domain matching.
    """
    base = _prepare_query_text(text) if for_query else text.lower()
    words = [w.strip('._/-') for w in _TOKEN_RE.findall(base)]
    tokens = {w for w in words if w and w not in STOPWORDS and (len(w) > 1 or w.isdigit())}
    expanded = set(tokens)
    for t in tokens:
        if t in SYNONYMS:
            expanded.update(SYNONYMS[t])
    return expanded


def _normalize_phrase(text: str) -> str:
    """Normalize text for phrase containment checks."""
    return ' '.join(re.sub(r'[^\w\s]', ' ', text.lower()).split())


def token_overlap_relevance(
    query: str,
    text: str,
    hashtags: Optional[List[str]] = None,
) -> float:
    """Compute a query-centric relevance score between 0.0 and 1.0.

    The score combines:
    - query coverage
    - informative-token coverage
    - a small precision term to penalize extra noise
    - an exact phrase bonus

    Generic tokens alone are capped below the post-retrieval 0.3 threshold.

    Args:
        query: Search query
        text: Content text to match against
        hashtags: Optional list of hashtags (TikTok/Instagram). Concatenated
            hashtags are split to match query tokens (e.g. "claudecode" matches "claude").

    Returns:
        Float between 0.0 and 1.0 (0.5 for empty queries)
    """
    q_tokens = tokenize(query, for_query=True)

    # Combine text and hashtags for matching
    combined = text
    if hashtags:
        combined = f"{text} {' '.join(hashtags)}"
    t_tokens = tokenize(combined)

    # Split concatenated hashtags (e.g., "claudecode" -> matches "claude", "code")
    if hashtags:
        for tag in hashtags:
            tag_lower = tag.lower()
            for qt in q_tokens:
                if qt in tag_lower and qt != tag_lower:
                    t_tokens.add(qt)

    if not q_tokens:
        return 0.5  # Neutral fallback for empty/stopword-only queries

    overlap_tokens = q_tokens & t_tokens
    overlap = len(overlap_tokens)
    if overlap == 0:
        return 0.0

    informative_q_tokens = {t for t in q_tokens if t not in LOW_SIGNAL_QUERY_TOKENS}
    if not informative_q_tokens:
        informative_q_tokens = q_tokens

    normalized_query = _normalize_phrase(query)
    normalized_text = _normalize_phrase(combined)

    # Require at least one strong entity/topic token to match when the query
    # clearly contains one (e.g. BTC / Ethereum / @handle / project name).
    explicit_handles = {h.lower() for h in re.findall(r'@([A-Za-z0-9_]{1,15})\b', query)}
    if explicit_handles and not any(handle in normalized_text for handle in explicit_handles):
        return 0.0

    entity_like_tokens = {
        t for t in informative_q_tokens
        if t not in LOW_SIGNAL_QUERY_TOKENS
        and not t.isdigit()
        and len(t) >= 2
    }
    if entity_like_tokens and not (entity_like_tokens & t_tokens):
        return 0.0

    coverage = overlap / len(q_tokens)
    informative_overlap = len(informative_q_tokens & t_tokens) / len(informative_q_tokens)
    precision_denominator = min(len(t_tokens), len(q_tokens) + 4) or 1
    precision = overlap / precision_denominator

    phrase_bonus = 0.0
    if normalized_query and normalized_query in normalized_text:
        phrase_bonus = 0.12 if len(normalized_query.split()) > 1 else 0.16

    base = (
        0.55 * (coverage ** 1.35) +
        0.25 * informative_overlap +
        0.20 * precision
    )

    # If we only matched generic query words, keep the score below the
    # normal relevance filter threshold so these do not survive by default.
    if informative_q_tokens and not (informative_q_tokens & t_tokens):
        return round(min(0.18, base), 2)

    return round(min(1.0, base + phrase_bonus), 2)
