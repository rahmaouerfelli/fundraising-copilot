"""
Tavily search service — used to discover new grant pages across the web,
instead of relying only on a fixed list of known sites.

Tavily also returns the page content, which avoids scraping sites that block bots (403).
"""

import logging
import time

import httpx
from config import settings

logger = logging.getLogger(__name__)

TAVILY_SEARCH_URL = "https://api.tavily.com/search"
TAVILY_EXTRACT_URL = "https://api.tavily.com/extract"
_PLACEHOLDER_KEYS = {"", "your_tavily_api_key_here"}
_EXTRACT_BATCH = 20  # max URLs per extract call


def is_configured() -> bool:
    return settings.tavily_api_key.strip() not in _PLACEHOLDER_KEYS


def _post(url: str, payload: dict, timeout: int) -> dict:
    """POST to Tavily, retrying on transient network errors."""
    headers = {"Authorization": f"Bearer {settings.tavily_api_key}"}
    for attempt in range(3):
        try:
            # Fresh connection per attempt: transient TLS errors ("bad record mac") poison keep-alive sockets.
            with httpx.Client(timeout=timeout) as client:
                response = client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()
        except (httpx.TransportError, httpx.TimeoutException):
            if attempt == 2:
                raise
            time.sleep(1 + attempt)
    return {}


def search(query: str, max_results: int = 5, include_content: bool = False) -> list[dict]:
    """
    Run a web search via Tavily.
    Returns a list of {"url", "title", "content", "score", "raw_content"} dicts
    ("raw_content" is the full page text when include_content=True).
    Returns [] if Tavily is not configured or the request fails.
    """
    if not is_configured():
        return []

    payload = {"query": query, "search_depth": "basic", "max_results": max_results}
    if include_content:
        payload["include_raw_content"] = "text"
    try:
        data = _post(TAVILY_SEARCH_URL, payload, timeout=60)
    except Exception as exc:
        logger.warning("Tavily search failed for %r: %s", query, exc)
        return []
    return [
        {
            "url": r.get("url", ""),
            "title": r.get("title", ""),
            "content": r.get("content", ""),
            "score": float(r.get("score") or 0),
            "raw_content": r.get("raw_content") or "",
        }
        for r in data.get("results", [])
        if r.get("url")
    ]


def extract(urls: list[str]) -> dict[str, str]:
    """Fetch page text for URLs through Tavily (works on many sites that block direct scraping)."""
    if not is_configured() or not urls:
        return {}
    pages: dict[str, str] = {}
    for i in range(0, len(urls), _EXTRACT_BATCH):
        batch = urls[i:i + _EXTRACT_BATCH]
        try:
            data = _post(TAVILY_EXTRACT_URL, {"urls": batch}, timeout=90)
        except Exception as exc:
            logger.warning("Tavily extract failed for %d URLs: %s", len(batch), exc)
            continue
        for r in data.get("results", []):
            if r.get("url") and r.get("raw_content"):
                pages[r["url"]] = r["raw_content"]
    return pages
