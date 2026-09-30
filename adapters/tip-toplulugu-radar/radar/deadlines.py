from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone

# Türkiye 2016'dan beri yaz saati uygulamıyor; yıl boyunca sabit UTC+3.
# zoneinfo + IANA tzdata Windows'ta ek bağımlılık gerektirdiği için (rule #9:
# stdlib yetersiz kaldığında ekle) burada sabit ofset kullanmak yeterli ve
# doğru; DST geçişi olmadığından hatalı sonuç riski yok.
ISTANBUL_TZ = timezone(timedelta(hours=3))

_DATE_PATTERNS = (
    re.compile(r"^(?P<d>\d{1,2})[./-](?P<m>\d{1,2})[./-](?P<y>\d{4})$"),
    re.compile(r"^(?P<d>\d{1,2})[./-](?P<m>\d{1,2})[./-](?P<y>\d{2})$"),
    re.compile(r"^(?P<y>\d{4})-(?P<m>\d{1,2})-(?P<d>\d{1,2})$"),
)


def parse_tr_date(value: str | None) -> date | None:
    if not value:
        return None
    text = value.strip()
    for pattern in _DATE_PATTERNS:
        match = pattern.match(text)
        if not match:
            continue
        year = int(match.group("y"))
        if year < 100:
            year += 2000
        try:
            return date(year, int(match.group("m")), int(match.group("d")))
        except ValueError:
            return None
    return None


def days_until(deadline_value: str | None, today: date | None = None) -> int | None:
    deadline = parse_tr_date(deadline_value)
    if deadline is None:
        return None
    reference = today or datetime.now(ISTANBUL_TZ).date()
    return (deadline - reference).days


def deadline_urgency_boost(days: int | None) -> int:
    if days is None:
        return 0
    if days < 0:
        return 0
    if days <= 3:
        return 40
    if days <= 7:
        return 25
    if days <= 14:
        return 10
    return 0


def deadline_risk_flag(days: int | None) -> str | None:
    if days is None:
        return None
    if days < 0:
        return "deadline_gecmis"
    if days <= 3:
        return "deadline_yakin"
    return None
