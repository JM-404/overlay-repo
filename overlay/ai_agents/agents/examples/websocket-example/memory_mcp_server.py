"""
Memory MCP SSE server — per-user conversational memory for 小灵.

Exposes two tools to the LLM (keyed by a user ID the LLM sees in its prompt):

  - recall(uid)            — return what's known about this user
  - remember(uid, content) — persist a fact/preference/event

Runs inside the Docker container on 127.0.0.1:7779.
Storage: SQLite at ./memory/memory.db relative to this script (inside the
bind-mounted /app dir, so it survives container restarts).

Start:  python3 memory_mcp_server.py
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path

from mcp.server.fastmcp import FastMCP

# ---------------------------------------------------------------------------
# Storage.
# ---------------------------------------------------------------------------
_DB_DIR = Path(__file__).resolve().parent / ".memory"
_DB_DIR.mkdir(parents=True, exist_ok=True)
_DB_PATH = _DB_DIR / "memory.db"

_RECALL_LIMIT = 50  # max memory entries returned per recall call


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH, timeout=5.0, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _init_schema() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS memories (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                uid        TEXT NOT NULL,
                content    TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_memories_uid_time "
            "ON memories (uid, created_at DESC)"
        )


_init_schema()


def _normalize_uid(uid: str | None) -> str:
    """Treat empty / 'None' / 'unknown' uids as a default bucket so we never
    silently drop a memory."""
    if not uid:
        return "_unknown"
    uid = uid.strip()
    if not uid or uid.lower() in ("none", "null", "unknown", "undefined"):
        return "_unknown"
    return uid


# ---------------------------------------------------------------------------
# MCP server.
# ---------------------------------------------------------------------------
mcp = FastMCP("memory-tool", host="127.0.0.1", port=7779)


@mcp.tool()
async def recall(uid: str) -> str:
    """Retrieve what you've previously remembered about this user.

    CALL THIS AT THE START OF EVERY CONVERSATION (after get_current_time /
    get_lunar_date) so you know who you're talking to — their name, job,
    preferences, recent states, plans, things they asked you to remember.

    `uid` must be the CURRENT_USER_ID string embedded in your system prompt.
    Never invent or modify it.

    Returns a multi-line string of past memories, newest first, or a short
    "no memories yet" note if this is a new user.
    """
    uid = _normalize_uid(uid)
    with _connect() as conn:
        rows = conn.execute(
            "SELECT content, created_at FROM memories "
            "WHERE uid = ? ORDER BY created_at DESC LIMIT ?",
            (uid, _RECALL_LIMIT),
        ).fetchall()

    if not rows:
        return f"(还没记过关于这个用户[{uid[:8]}…]的事,这是一段新关系)"

    lines = [f"关于这个用户[{uid[:8]}…],你之前记下的事(新→旧):"]
    for content, created_at in rows:
        # Render created_at as "4/24 晚上" rough bucket to keep tokens low.
        try:
            dt = datetime.fromisoformat(str(created_at).replace(" ", "T"))
            stamp = f"{dt.month}/{dt.day}"
        except Exception:
            stamp = "?"
        lines.append(f"  [{stamp}] {content}")
    return "\n".join(lines)


@mcp.tool()
async def remember(uid: str, content: str) -> str:
    """Save a durable memory about this user (name, preference, state, plan,
    promise, anything worth bringing up later).

    CALL THIS whenever the user shares something meaningful — not for every
    utterance, only what you'd naturally remember about a friend. Good:
    "她叫 Alice", "她最近在备战考研", "她讨厌香菜", "她让我周五提醒她交方案".
    Skip: greetings, idle chat, questions you answered.

    Write `content` in THIRD person, as a short fact ("他/她...", 1 sentence).
    `uid` must be the CURRENT_USER_ID string from your system prompt.
    """
    uid = _normalize_uid(uid)
    content = (content or "").strip()
    if not content:
        return "Error: content is empty, nothing saved."
    if len(content) > 500:
        content = content[:500] + "…"

    with _connect() as conn:
        conn.execute(
            "INSERT INTO memories (uid, content) VALUES (?, ?)",
            (uid, content),
        )
    return f"已记下 (uid={uid[:8]}…): {content}"


if __name__ == "__main__":
    mcp.run(transport="sse")
