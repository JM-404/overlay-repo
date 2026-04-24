"""
Context MCP SSE server — provides current time, lunar (Chinese) date/solar term,
and real-time weather. Exposes three tools to the LLM:

  - get_current_time()        — date, weekday, time-of-day bucket
  - get_lunar_date()          — 农历 date, 节气, 传统/现代节日
  - get_weather(city="北京") — QWeather live weather

Runs inside the Docker container on 127.0.0.1:7778.
Start:  python3 context_mcp_server.py

Secrets: QWeather credentials are loaded from environment variables. The
overlay repo is public, so we never commit real keys here. On the server,
populate QWEATHER_HOST and QWEATHER_KEY before starting this process, e.g.
via a gitignored /app/.env sourced by the start wrapper.
"""

from __future__ import annotations

import os
from datetime import datetime

import httpx
from mcp.server.fastmcp import FastMCP

# ---------------------------------------------------------------------------
# QWeather configuration.
# ---------------------------------------------------------------------------
QWEATHER_HOST = os.environ.get("QWEATHER_HOST", "")
QWEATHER_KEY = os.environ.get("QWEATHER_KEY", "")

# Common Chinese cities → QWeather location IDs.
# Full list: https://dev.qweather.com/docs/resource/location/
_CITY_ID_MAP = {
    "北京": "101010100", "beijing": "101010100",
    "上海": "101020100", "shanghai": "101020100",
    "广州": "101280101", "guangzhou": "101280101",
    "深圳": "101280601", "shenzhen": "101280601",
    "杭州": "101210101", "hangzhou": "101210101",
    "成都": "101270101", "chengdu": "101270101",
    "武汉": "101200101", "wuhan": "101200101",
    "南京": "101190101", "nanjing": "101190101",
    "西安": "101110101", "xian": "101110101",
    "重庆": "101040100", "chongqing": "101040100",
    "天津": "101030100", "tianjin": "101030100",
    "苏州": "101190401", "suzhou": "101190401",
}
_DEFAULT_LOCATION_ID = "101010100"  # 北京

# ---------------------------------------------------------------------------
# Time helpers.
# ---------------------------------------------------------------------------
_WEEKDAY_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


def _time_period(hour: int) -> str:
    if 0 <= hour < 5:
        return "深夜"
    if 5 <= hour < 9:
        return "早上"
    if 9 <= hour < 12:
        return "上午"
    if 12 <= hour < 14:
        return "中午"
    if 14 <= hour < 18:
        return "下午"
    if 18 <= hour < 20:
        return "傍晚"
    if 20 <= hour < 23:
        return "晚上"
    return "深夜"


# ---------------------------------------------------------------------------
# MCP server.
# ---------------------------------------------------------------------------
mcp = FastMCP("context-tool", host="127.0.0.1", port=7778)


@mcp.tool()
async def get_current_time() -> str:
    """Return current local time (Beijing) with natural-language context.

    CALL THIS AT THE START OF EVERY CONVERSATION before your first greeting —
    otherwise you might say "good morning" at midnight. Also call it whenever
    the user mentions anything time-related ("today", "weekend", "tonight",
    "how late is it").

    Returns: "现在是 2026年4月24日 周五 22:15(晚上)"
    """
    now = datetime.now()
    weekday = _WEEKDAY_ZH[now.weekday()]
    period = _time_period(now.hour)
    return (
        f"现在是 {now.year}年{now.month}月{now.day}日 {weekday} "
        f"{now.hour:02d}:{now.minute:02d}({period})"
    )


@mcp.tool()
async def get_lunar_date() -> str:
    """Return today's 农历 (Chinese lunar) date, 节气 (solar term), and festivals.

    Call this at the start of a conversation (along with get_current_time) so
    you can casually mention "诶今天清明呢" or "明天立夏了" naturally. Also
    call when the user mentions traditional culture, festivals, or seasons.

    Solar terms (节气) like 立春, 清明, 冬至 are culturally salient — if today
    is one, mention it; if one is coming up in the next few days, you can too.

    Returns something like:
      "农历 甲辰(龙)年 三月初五;今日节气:清明"
      "农历 甲辰(龙)年 四月廿八;再过 3 天是立夏"
    """
    try:
        from lunar_python import Lunar
    except ImportError:
        return "Error: lunar_python library not installed on server."

    now = datetime.now()
    lunar = Lunar.fromDate(now)
    solar = lunar.getSolar()

    year_gz = lunar.getYearInGanZhi()
    month_zh = lunar.getMonthInChinese()
    day_zh = lunar.getDayInChinese()
    zodiac = lunar.getYearShengXiao()

    parts = [f"农历 {year_gz}({zodiac})年 {month_zh}月{day_zh}"]

    jieqi = lunar.getJieQi()  # '' if today isn't a solar term
    if jieqi:
        parts.append(f"今日节气:{jieqi}")

    # Combine festival lists (traditional + modern). APIs differ across
    # lunar_python versions, so we best-effort both sources.
    festivals: list[str] = []
    try:
        festivals.extend(lunar.getFestivals() or [])
    except Exception:
        pass
    try:
        festivals.extend(solar.getFestivals() or [])
    except Exception:
        pass
    # Dedupe while preserving order.
    seen: set[str] = set()
    festivals = [f for f in festivals if not (f in seen or seen.add(f))]
    if festivals:
        parts.append(f"节日:{'、'.join(festivals)}")

    # Upcoming solar term (within 7 days) for "再过 N 天是立夏" flavor.
    if not jieqi:
        try:
            next_jq = lunar.getNextJieQi()
            if next_jq:
                jq_solar = next_jq.getSolar()
                jq_dt = datetime(jq_solar.getYear(), jq_solar.getMonth(), jq_solar.getDay())
                delta_days = (jq_dt.date() - now.date()).days
                if 0 < delta_days <= 7:
                    parts.append(f"再过 {delta_days} 天是{next_jq.getName()}")
        except Exception:
            pass

    return ";".join(parts)


@mcp.tool()
async def get_weather(city: str = "北京") -> str:
    """Return current live weather for a Chinese city (default 北京).

    Call this whenever the user asks about weather directly, OR when it's
    natural to make a contextual remark (temperature, rain, etc). Don't
    volunteer weather unprompted at the very start — it's weird unless the
    user opens with "外面冷吗" or similar.

    `city` accepts Chinese or pinyin. Supported: 北京, 上海, 广州, 深圳,
    杭州, 成都, 武汉, 南京, 西安, 重庆, 天津, 苏州. Unknown cities fall
    back to 北京.

    Returns: "北京现在 19°C(体感 19°C),雾,东风1级,湿度 71%"
    """
    city_stripped = city.strip()
    loc_id = (
        _CITY_ID_MAP.get(city_stripped)
        or _CITY_ID_MAP.get(city_stripped.lower())
        or _DEFAULT_LOCATION_ID
    )
    display_city = city_stripped if loc_id != _DEFAULT_LOCATION_ID else "北京"

    url = f"https://{QWEATHER_HOST}/v7/weather/now"
    params = {"location": loc_id, "key": QWEATHER_KEY}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                url,
                params=params,
                headers={"Accept-Encoding": "gzip"},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        return f"Error fetching weather: {type(exc).__name__}: {exc}"

    if data.get("code") != "200":
        return f"QWeather API error: code={data.get('code')}"

    now = data.get("now") or {}
    return (
        f"{display_city}现在 {now.get('temp')}°C"
        f"(体感 {now.get('feelsLike')}°C),"
        f"{now.get('text')},"
        f"{now.get('windDir')}{now.get('windScale')}级,"
        f"湿度 {now.get('humidity')}%"
    )


if __name__ == "__main__":
    mcp.run(transport="sse")
