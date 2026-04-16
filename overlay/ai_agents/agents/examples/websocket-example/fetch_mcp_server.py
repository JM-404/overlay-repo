"""
Tiny FastMCP SSE server exposing a single `fetch_url` tool.

Runs locally inside the Docker container on port 7777.
Used by mcp_client_python extension via SSE transport.

Start:
    python3 fetch_mcp_server.py
"""

from __future__ import annotations

import html
import re
from urllib.parse import urlparse

import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("fetch-tool", host="127.0.0.1", port=7777)

_MAX_CHARS = 8000  # cap returned content so the LLM context doesn't explode
_TIMEOUT_SECONDS = 25.0
_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36 FetchMCP/0.1"
)


def _strip_html(content: str) -> str:
    # Drop script/style blocks entirely, then strip all tags, then collapse ws.
    content = re.sub(
        r"<(script|style)[^>]*>.*?</\1>", "", content, flags=re.DOTALL | re.IGNORECASE
    )
    content = re.sub(r"<[^>]+>", " ", content)
    content = html.unescape(content)
    content = re.sub(r"\s+", " ", content).strip()
    return content


@mcp.tool()
async def fetch_url(url: str) -> str:
    """Fetch a URL and return its text content.

    Use this whenever the user asks about anything that needs current / live info
    (news, prices, definitions, a specific web page, etc.).

    Reliable hosts (use these for general queries when user didn't specify a URL):
      - https://news.ycombinator.com        (tech news, always works)
      - https://techcrunch.com              (tech news)
      - https://en.wikipedia.org/wiki/...   (general knowledge)
      - https://www.zhihu.com               (Chinese Q&A)

    Avoid (blocked or rate-limited from this host):
      - bbc.com, reuters.com, nytimes.com, wsj.com (unreachable / 401)
      - Any URL that requires login / JS rendering

    Returns plain text (HTML stripped) up to ~8000 characters. Supports http/https only.
    If a fetch times out or returns an error, the caller should try a different URL
    from the reliable list above rather than telling the user it failed.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return f"Error: only http/https URLs are supported (got scheme={parsed.scheme!r})."
    if not parsed.netloc:
        return "Error: URL is missing a host."

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=_TIMEOUT_SECONDS,
            headers={"User-Agent": _UA, "Accept": "text/html,application/xhtml+xml,*/*"},
        ) as client:
            resp = await client.get(url)
    except httpx.HTTPError as exc:
        return f"Error fetching {url}: {type(exc).__name__}: {exc}"

    if resp.status_code >= 400:
        return f"HTTP {resp.status_code} from {url}"

    ctype = resp.headers.get("content-type", "").lower()
    text = resp.text
    if "html" in ctype or "<html" in text[:1000].lower():
        text = _strip_html(text)

    if len(text) > _MAX_CHARS:
        text = text[:_MAX_CHARS] + f"\n\n[…truncated, original was {len(resp.text)} chars]"

    return f"URL: {resp.url}\nStatus: {resp.status_code}\nContent-Type: {ctype}\n\n{text}"


if __name__ == "__main__":
    # SSE transport: exposes GET /sse for connections
    mcp.run(transport="sse")
