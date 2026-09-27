"""Hekimler first-run / ongoing backfill control — source-profile driven.

Never uses one global date threshold for every source.
Never silently discards solely for age; historical retainers are marked backfill.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any


@dataclass(frozen=True)
class BackfillDecision:
    retain: bool
    is_backfill: bool
    priority: str  # current | backfill_low
    reason: str


_DATE_PATTERNS = [
    re.compile(r"(20\d{2})[-./](\d{1,2})[-./](\d{1,2})"),
    re.compile(r"(\d{1,2})[-./](\d{1,2})[-./](20\d{2})"),
]

_TR_MONTHS = {
    "ocak": 1,
    "şubat": 2,
    "subat": 2,
    "mart": 3,
    "nisan": 4,
    "mayıs": 5,
    "mayis": 5,
    "haziran": 6,
    "temmuz": 7,
    "ağustos": 8,
    "agustos": 8,
    "eylül": 9,
    "eylul": 9,
    "ekim": 10,
    "kasım": 11,
    "kasim": 11,
    "aralık": 12,
    "aralik": 12,
}
_TR_DATE = re.compile(
    r"(\d{1,2})\s+(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)\s+(20\d{2})",
    re.I,
)


def _parse_day(raw: str | None) -> datetime | None:
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    iso = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if iso:
        return datetime(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)), tzinfo=timezone.utc)
    tr = _TR_DATE.search(s)
    if tr:
        d, mon, y = int(tr.group(1)), tr.group(2).casefold(), int(tr.group(3))
        mo = _TR_MONTHS.get(mon) or _TR_MONTHS.get(mon.replace("ı", "i").replace("ş", "s"))
        if mo:
            try:
                return datetime(y, mo, d, tzinfo=timezone.utc)
            except ValueError:
                return None
    for pat in _DATE_PATTERNS:
        m = pat.search(s)
        if not m:
            continue
        g = m.groups()
        if len(g[0]) == 4:
            y, mo, d = int(g[0]), int(g[1]), int(g[2])
        else:
            d, mo, y = int(g[0]), int(g[1]), int(g[2])
        try:
            return datetime(y, mo, d, tzinfo=timezone.utc)
        except ValueError:
            return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    except ValueError:
        return None


def _has_future_or_active_signal(title: str, body: str, published: datetime | None, now: datetime) -> bool:
    blob = f"{title}\n{body}".casefold()
    active_markers = (
        "son başvuru",
        "başvuru tarih",
        "son gün",
        "yürürlük",
        "yururluk",
        "deadline",
        "geçerlilik",
        "gecerlilik",
        "hala açık",
        "devam ediyor",
        "aktif ilan",
    )
    if any(m in blob for m in active_markers):
        return True
    # Future-dated publication is treated as upcoming
    if published and published.date() > now.date():
        return True
    return False


def backfill_policy_for(profile: dict[str, Any]) -> dict[str, Any]:
    plan = profile.get("fetch_plan") or {}
    policy = dict(plan.get("initial_backfill") or profile.get("initial_backfill") or {})
    # Defaults are conservative and per-profile overridable
    policy.setdefault("lookback_days", 21)
    policy.setdefault("retain_active_or_future_deadline", True)
    policy.setdefault("historical_priority", "backfill_low")
    policy.setdefault("undated_as_current", True)
    return policy


def classify_backfill(
    profile: dict[str, Any],
    *,
    title: str,
    body: str = "",
    published_at: str | None = None,
    deadline: str | None = None,
    effective_date: str | None = None,
    now: datetime | None = None,
) -> BackfillDecision:
    """Decide whether an accepted medical item is current vs historical backfill."""
    now = now or datetime.now(timezone.utc)
    policy = backfill_policy_for(profile)
    lookback = int(policy.get("lookback_days") or 21)
    published = _parse_day(published_at) or _parse_day(title) or _parse_day(body)
    deadline_dt = _parse_day(deadline) or _parse_day(effective_date)

    # Still-active / future deadline always retained as current
    if deadline_dt and deadline_dt.date() >= now.date():
        return BackfillDecision(True, False, "current", "future_or_open_deadline")

    if policy.get("retain_active_or_future_deadline") and _has_future_or_active_signal(
        title, body, published, now
    ):
        # Historical publish date but still active → retain as backfill_low, not drop
        if published and published < now - timedelta(days=lookback):
            return BackfillDecision(
                True,
                True,
                str(policy.get("historical_priority") or "backfill_low"),
                "historical_but_still_active",
            )
        return BackfillDecision(True, False, "current", "active_signal")

    if not published:
        if policy.get("undated_as_current", True):
            return BackfillDecision(True, False, "current", "undated_treated_current")
        return BackfillDecision(True, True, "backfill_low", "undated_as_backfill")

    cutoff = now - timedelta(days=lookback)
    if published >= cutoff:
        return BackfillDecision(True, False, "current", "within_lookback")

    # Older than lookback: retain as backfill (never silent discard for age alone)
    return BackfillDecision(
        True,
        True,
        str(policy.get("historical_priority") or "backfill_low"),
        f"older_than_lookback_{lookback}d",
    )
