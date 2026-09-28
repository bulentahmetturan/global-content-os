"""Hekimler coverage health — independent from transport health.

Transport / source_health:
  HEALTHY  — approved surface fetched and parsed successfully
  DEGRADED — transport, parsing, or allowlist failure

Coverage status (content eligibility, not transport):
  configured              — default / reset after accepts
  NO_ELIGIBLE_ITEMS       — successful fetch, no in-scope signal this run
  SPARSE_EXPECTED         — sparse_source_allowed; zero eligible is normal
  LOW_COVERAGE            — in-scope material likely present but missed, or
                            expected eligible-content window exceeded
  COVERAGE_WARNING        — single-run warning: in-scope signal discarded
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


COVERAGE_CONFIGURED = "configured"
COVERAGE_NO_ELIGIBLE = "NO_ELIGIBLE_ITEMS"
COVERAGE_SPARSE = "SPARSE_EXPECTED"
COVERAGE_LOW = "LOW_COVERAGE"
COVERAGE_WARNING = "COVERAGE_WARNING"

HEALTH_HEALTHY = "HEALTHY"
HEALTH_DEGRADED = "DEGRADED"

# Default only for dense sources that omit coverage_policy
_DEFAULT_WATCH_WINDOWS = 3


@dataclass(frozen=True)
class CoveragePolicy:
    sparse_source_allowed: bool = False
    expected_eligible_frequency: str = "per_run"  # per_run | daily | weekly | rare
    coverage_watch_window: int = _DEFAULT_WATCH_WINDOWS
    # Zero-accept runs that count toward LOW_COVERAGE only when in_scope was seen
    # or when sparse is false and window exceeded without any accept.
    require_in_scope_for_low_coverage: bool = True


@dataclass(frozen=True)
class CoverageUpdate:
    source_health: str
    coverage_status: str
    coverage_reason: str | None
    zero_accept_streak: int
    sparse_empty_streak: int = 0


def coverage_policy_for(profile: dict[str, Any] | None) -> CoveragePolicy:
    plan = (profile or {}).get("fetch_plan") or {}
    raw = dict(plan.get("coverage_policy") or (profile or {}).get("coverage_policy") or {})
    return CoveragePolicy(
        sparse_source_allowed=bool(raw.get("sparse_source_allowed", False)),
        expected_eligible_frequency=str(raw.get("expected_eligible_frequency") or "per_run"),
        coverage_watch_window=int(raw.get("coverage_watch_window") or _DEFAULT_WATCH_WINDOWS),
        require_in_scope_for_low_coverage=bool(raw.get("require_in_scope_for_low_coverage", True)),
    )


def detect_in_scope_signals(
    *,
    titles_and_urls: list[tuple[str, str]],
    include_keywords: list[str],
    scope_url_keywords: list[str] | None = None,
) -> list[str]:
    """Titles/URLs that look medically in-scope before the accept gate runs.

    Used only for coverage warnings — does not change accept/discard decisions.
    """
    scope_url_keywords = scope_url_keywords or []
    hits: list[str] = []

    def fold(s: str) -> str:
        return (
            (s or "")
            .casefold()
            .replace("ı", "i")
            .replace("ş", "s")
            .replace("ğ", "g")
            .replace("ü", "u")
            .replace("ö", "o")
            .replace("ç", "c")
        )

    for title, url in titles_and_urls:
        blob = fold(f"{title}\n{url}")
        matched = False
        for kw in include_keywords:
            k = fold(kw)
            if k and k in blob:
                matched = True
                break
        if not matched:
            for tok in scope_url_keywords:
                t = fold(tok)
                if t and t in fold(url):
                    matched = True
                    break
        if matched:
            hits.append(title[:120] or url[:120])
    return hits


def next_coverage_state(
    *,
    transport_ok: bool,
    accepted_count: int,
    previous_streak: int = 0,
    previous_coverage: str | None = None,
    previous_sparse_streak: int = 0,
    profile: dict[str, Any] | None = None,
    in_scope_signal_detected: bool = False,
    in_scope_discarded_count: int = 0,
) -> CoverageUpdate:
    """Compute coverage after one due run using source-profile coverage_policy.

    Never uses a single global \"three zero runs → LOW_COVERAGE\" rule for sparse sources.
    """
    policy = coverage_policy_for(profile)
    prev = previous_coverage or COVERAGE_CONFIGURED

    if not transport_ok:
        return CoverageUpdate(
            source_health=HEALTH_DEGRADED,
            coverage_status=prev,
            coverage_reason=None,
            zero_accept_streak=int(previous_streak or 0),
            sparse_empty_streak=int(previous_sparse_streak or 0),
        )

    if accepted_count > 0:
        return CoverageUpdate(
            source_health=HEALTH_HEALTHY,
            coverage_status=COVERAGE_CONFIGURED,
            coverage_reason=None,
            zero_accept_streak=0,
            sparse_empty_streak=0,
        )

    # Successful fetch, zero accepts
    zero_streak = int(previous_streak or 0) + 1
    sparse_streak = int(previous_sparse_streak or 0) + 1

    # Likely in-scope material present but discarded → warning (and may escalate)
    if in_scope_signal_detected or in_scope_discarded_count > 0:
        window = max(1, policy.coverage_watch_window)
        if zero_streak >= window and policy.require_in_scope_for_low_coverage:
            return CoverageUpdate(
                source_health=HEALTH_HEALTHY,
                coverage_status=COVERAGE_LOW,
                coverage_reason=(
                    f"in_scope_signal_detected but zero accepts over {zero_streak} runs "
                    f"(watch_window={window}) — refine source parser/scope mapping; "
                    "do not weaken global medical gate"
                ),
                zero_accept_streak=zero_streak,
                sparse_empty_streak=0,
            )
        return CoverageUpdate(
            source_health=HEALTH_HEALTHY,
            coverage_status=COVERAGE_WARNING,
            coverage_reason=(
                f"in_scope_items_discarded={in_scope_discarded_count or 1} "
                "on successful fetch — coverage warning"
            ),
            zero_accept_streak=zero_streak,
            sparse_empty_streak=0,
        )

    # No in-scope signal this run
    if policy.sparse_source_allowed:
        # Sparse sources (YÖKAK, Resmî Gazete): zero medical items is expected
        freq = policy.expected_eligible_frequency
        # Only escalate if configured watch window for *expected* content is exceeded
        # AND frequency is not rare — rare/sparse never auto LOW_COVERAGE without in-scope
        if freq in {"rare", "weekly"} or policy.sparse_source_allowed:
            return CoverageUpdate(
                source_health=HEALTH_HEALTHY,
                coverage_status=COVERAGE_SPARSE,
                coverage_reason=(
                    f"sparse_source_allowed; no_eligible_items "
                    f"(empty_streak={sparse_streak}, frequency={freq})"
                ),
                zero_accept_streak=0,  # do not accumulate toward LOW_COVERAGE
                sparse_empty_streak=sparse_streak,
            )

    # Dense sources: empty runs without in-scope signal
    window = max(1, policy.coverage_watch_window)
    if (
        not policy.require_in_scope_for_low_coverage
        and zero_streak >= window
        and policy.expected_eligible_frequency == "per_run"
    ):
        return CoverageUpdate(
            source_health=HEALTH_HEALTHY,
            coverage_status=COVERAGE_LOW,
            coverage_reason=(
                f"expected_eligible_frequency=per_run missed for {zero_streak} runs "
                f"(watch_window={window})"
            ),
            zero_accept_streak=zero_streak,
            sparse_empty_streak=0,
        )

    return CoverageUpdate(
        source_health=HEALTH_HEALTHY,
        coverage_status=COVERAGE_NO_ELIGIBLE,
        coverage_reason="successful_fetch_no_eligible_items",
        zero_accept_streak=zero_streak,
        sparse_empty_streak=0,
    )


def coverage_fields_for_telemetry(update: CoverageUpdate) -> dict[str, Any]:
    return {
        "source_health": update.source_health,
        "coverage_status": update.coverage_status,
        "coverage_reason": update.coverage_reason,
        "zero_accept_streak": update.zero_accept_streak,
        "sparse_empty_streak": update.sparse_empty_streak,
    }


# Back-compat alias used by older tests — prefer next_coverage_state with profile=
ZERO_ACCEPT_STREAK_THRESHOLD = _DEFAULT_WATCH_WINDOWS
