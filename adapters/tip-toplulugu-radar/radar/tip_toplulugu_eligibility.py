"""Bible v4 eligibility — three axes, fail-closed, unknown beats guess.

Axes (Bible §8 / §22):
  application_eligibility
  credential_recognition
  practice_rights

Statuses: YES | PARTIAL | NO | UNKNOWN | NOT_APPLICABLE

Catalog listing is never a TUK specialty, GETAT licence, or clinical practice right.
"""
from __future__ import annotations

ELIGIBILITY_STATUSES = ("YES", "PARTIAL", "NO", "UNKNOWN", "NOT_APPLICABLE")
ELIGIBILITY_AXES = (
    "application_eligibility",
    "credential_recognition",
    "practice_rights",
)
PRIMARY_CATEGORIES = ("haber", "burs", "egitim", "duyuru", "research")

_APPLICATION_SURFACABLE = frozenset({"YES", "PARTIAL"})
_STATUS_ALIASES = {
    "EVET": "YES",
    "KISMI": "PARTIAL",
    "KISMİ": "PARTIAL",
    "HAYIR": "NO",
    "BILINMIYOR": "UNKNOWN",
    "BİLİNMİYOR": "UNKNOWN",
    "UYGULANAMAZ": "NOT_APPLICABLE",
    "NA": "NOT_APPLICABLE",
    "N/A": "NOT_APPLICABLE",
}
_KNOWN_TOKENS = set(ELIGIBILITY_STATUSES) | set(_STATUS_ALIASES)


def _token(value: object) -> str:
    return str(value or "").strip().upper().replace(" ", "_")


def is_known_eligibility_token(value: object) -> bool:
    return _token(value) in _KNOWN_TOKENS


def normalize_eligibility_status(value: object) -> str:
    raw = _token(value)
    raw = _STATUS_ALIASES.get(raw, raw)
    if raw not in ELIGIBILITY_STATUSES:
        return "UNKNOWN"
    return raw


def application_may_surface(status: object) -> bool:
    """Fail-closed: only YES/PARTIAL may be shown as an apply-now opportunity."""
    if not is_known_eligibility_token(status):
        return False
    return normalize_eligibility_status(status) in _APPLICATION_SURFACABLE


def opportunity_window_label(*, state: str, deadline_known: bool) -> str:
    """Do not present an unknown deadline as an open call (Bible fail-closed)."""
    st = str(state or "").strip().lower()
    if st == "open" and not deadline_known:
        return "unknown"
    if st in {"upcoming", "open", "rolling", "closed", "suspended", "cancelled", "unknown", "archived"}:
        return st
    return "unknown"


def catalog_is_not_license() -> bool:
    """Named course/observership/certification catalogue ≠ TUK/GETAT/clinical licence."""
    return True


def validate_eligibility_record(rec: dict[str, object] | None) -> tuple[bool, str]:
    if not rec:
        return False, "missing_eligibility"
    for axis in ELIGIBILITY_AXES:
        if axis not in rec:
            return False, f"missing_axis:{axis}"
        if not is_known_eligibility_token(rec[axis]):
            return False, f"bad_status:{axis}"
    return True, "ok"
