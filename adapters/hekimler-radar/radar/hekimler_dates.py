"""D9 date policy for Hekimler candidates (fixed, user-approved 2026-09-20).

- General news/announcements: last 90 days.
- Exam sources (ÖSYM DUS/YDUS/TUS, USMLE, MCC...): future-dated + last 180 days.
- Clearly still-valid items (any date in the text is today or later) are kept regardless of publish date.
- Undated items are never dropped silently and never auto-published: verdict UNDATED -> NEEDS_REVIEW.
- Older than the window with no future date: STALE -> discard.
"""
from __future__ import annotations

import html
import re
from datetime import date, datetime, timedelta, timezone

GENERAL_WINDOW_DAYS = 90
EXAM_WINDOW_DAYS = 180
EXAM_SOURCE_IDS = frozenset(
    {
        "osym_medical_exams",
        "osym_dus_dental_exams",
        "osym_ydus_subspecialty_exams",
        "tuk_specialty_training",
        "abroad_us_usmle",
        "abroad_us_nrmp",
        "abroad_ca_carms",
        "abroad_ca_mcc_img_pathways",
    }
)

_TR_MONTHS = {
    "ocak": 1, "subat": 2, "şubat": 2, "mart": 3, "nisan": 4, "mayis": 5, "mayıs": 5, "haziran": 6,
    "temmuz": 7, "agustos": 8, "ağustos": 8, "eylul": 9, "eylül": 9, "ekim": 10, "kasim": 11, "kasım": 11, "aralik": 12, "aralık": 12,
}
_EN_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}
_TR_NAMES = "|".join(sorted({k for k in _TR_MONTHS}, key=len, reverse=True))
_EN_NAMES = "|".join(sorted(_EN_MONTHS, key=len, reverse=True))

_RE_TR = re.compile(rf"(?<!\d)(\d{{1,2}})\s+({_TR_NAMES})\s+(\d{{4}})", re.I)
_RE_EN_DMY = re.compile(rf"(?<!\d)(\d{{1,2}})(?:st|nd|rd|th)?\s+({_EN_NAMES})\.?,?\s+(\d{{4}})", re.I)
_RE_EN_MDY = re.compile(rf"\b({_EN_NAMES})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s+(\d{{4}})", re.I)
_RE_NUM = re.compile(r"(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)")
_RE_ISO = re.compile(r"(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)")
_RE_URLPATH = re.compile(r"/(20\d{2})/(\d{1,2})/(\d{1,2})(?:/|$)")
_RE_URLSTAMP = re.compile(r"(?<=[-/])(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[0-2]\d[0-5]\d(?=$|[/?#])")


def _mk(y: int, m: int, d: int) -> date | None:
    try:
        if 2000 <= y <= 2100:
            return date(y, m, d)
    except ValueError:
        return None
    return None


def extract_dates(*texts: str) -> list[date]:
    out: list[date] = []
    for text in texts:
        if not text:
            continue
        t = html.unescape(text)
        for m in _RE_TR.finditer(t):
            k = m.group(2).lower()
            mo = _TR_MONTHS.get(k)
            d = _mk(int(m.group(3)), mo, int(m.group(1))) if mo else None
            if d: out.append(d)
        for m in _RE_EN_DMY.finditer(t):
            d = _mk(int(m.group(3)), _EN_MONTHS[m.group(2).lower()], int(m.group(1)))
            if d: out.append(d)
        for m in _RE_EN_MDY.finditer(t):
            d = _mk(int(m.group(3)), _EN_MONTHS[m.group(1).lower()], int(m.group(2)))
            if d: out.append(d)
        for m in _RE_NUM.finditer(t):
            d = _mk(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            if d: out.append(d)
        for m in _RE_ISO.finditer(t):
            d = _mk(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            if d: out.append(d)
        for m in _RE_URLPATH.finditer(t):
            d = _mk(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            if d: out.append(d)
        for m in _RE_URLSTAMP.finditer(t):
            d = _mk(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            if d: out.append(d)
    return out


def window_days_for(source_id: str) -> int:
    return EXAM_WINDOW_DAYS if source_id in EXAM_SOURCE_IDS else GENERAL_WINDOW_DAYS


def date_verdict(
    source_id: str,
    *,
    published_at: str | None,
    title: str = "",
    excerpt: str = "",
    url: str = "",
    today: date | None = None,
) -> tuple[str, date | None]:
    """Return (verdict, item_date). verdict: FRESH | ACTIVE | UNDATED | STALE."""
    today = today or datetime.now(timezone.utc).date()
    dates: list[date] = []
    if published_at:
        dates += extract_dates(published_at)
    dates += extract_dates(title, excerpt, url)
    if not dates:
        return "UNDATED", None
    if any(d >= today for d in dates):
        return "ACTIVE", max(dates)
    newest = max(dates)
    if newest >= today - timedelta(days=window_days_for(source_id)):
        return "FRESH", newest
    return "STALE", newest


_META_KEYS = (
    "article:published_time", "og:published_time", "datepublished", "pubdate", "publishdate",
    "dc.date", "dcterms.created", "date", "article:modified_time", "og:updated_time",
)
_RE_META = re.compile(r"<meta\b[^>]*>", re.I)
_RE_TIME = re.compile(r"<time\b[^>]*datetime=[\"']([^\"']+)[\"']", re.I)
_RE_JSONLD = re.compile(r"\"(?:datePublished|dateCreated|dateModified)\"\s*:\s*\"([^\"]+)\"", re.I)
_RE_ATTR = re.compile(r"(\w[\w:.-]*)\s*=\s*[\"']([^\"']*)[\"']")


def extract_page_date(body: str) -> tuple[date | None, str]:
    """Publication date from a detail page. Returns (date, method); method '' when none found.

    Order: meta tags -> <time datetime> -> JSON-LD -> first visible date near the top of the text.
    """
    if not body:
        return None, ""
    head = body[:200_000]
    for tag in _RE_META.findall(head):
        attrs = {k.lower(): v for k, v in _RE_ATTR.findall(tag)}
        key = (attrs.get("property") or attrs.get("name") or attrs.get("itemprop") or "").lower()
        if key in _META_KEYS and attrs.get("content"):
            ds = extract_dates(attrs["content"])
            if ds:
                return ds[0], f"meta:{key}"
    for m in _RE_TIME.finditer(head):
        ds = extract_dates(m.group(1))
        if ds:
            return ds[0], "time"
    for m in _RE_JSONLD.finditer(head):
        ds = extract_dates(m.group(1))
        if ds:
            return ds[0], "jsonld"
    text = re.sub(r"<(script|style)\b.*?</\1>", " ", head, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    # Plain-text dates are low confidence: side-bar/event dates in the future must not make an item "active".
    today = datetime.now(timezone.utc).date()
    ds = [d for d in extract_dates(text[:30000]) if d <= today]
    if ds:
        return ds[0], "text_top"
    return None, ""


_ES_EN_MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}
_RE_URL_MONTH = re.compile(r"/(20\d{2})/(" + "|".join(sorted(_ES_EN_MONTHS, key=len, reverse=True)) + r")(?:/|$)", re.I)


def extract_url_month(url: str) -> tuple[date, str] | None:
    """Month-precision date from URLs like /Noticias/2026/septiembre/... -> (last day of month, 'YYYY-MM').

    The day is unknown: callers must keep the precision flag and never present it as an exact publication day.
    """
    m = _RE_URL_MONTH.search(url or "")
    if not m:
        return None
    y, mo = int(m.group(1)), _ES_EN_MONTHS[m.group(2).lower()]
    import calendar

    return date(y, mo, calendar.monthrange(y, mo)[1]), f"{y}-{mo:02d}"
