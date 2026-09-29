"""Hekimler runtime activation state — registry-driven, not tier-inferred.

States:
  AUTOMATION_READY — due-check + HTTP fetch + Hub review emission allowed
  MANUAL_INTAKE    — valuable but no automated HTTP from the continuous runner
  BLOCKED          — out of scope / unsafe / intentionally deferred
"""
from __future__ import annotations

from typing import Any

from .hekimler_hub_bridge import PHASE1_LIVE_ELIGIBLE_SOURCE_IDS

ACTIVATION_AUTOMATION_READY = "AUTOMATION_READY"
ACTIVATION_MANUAL_INTAKE = "MANUAL_INTAKE"
ACTIVATION_BLOCKED = "BLOCKED"

ACTIVATION_STATES = frozenset(
    {ACTIVATION_AUTOMATION_READY, ACTIVATION_MANUAL_INTAKE, ACTIVATION_BLOCKED}
)

# Methods the continuous runner can execute today (generic HTML/list parsers).
VERIFIED_FETCH_METHODS = frozenset(
    {
        "list-page",
        "dedicated_exam_listing",
        "gated_announcement_index",
        "page-parser",
        "official_bulletin_discovery",
        "daily_toc",
        "eutilities_api",
    }
)

# Families that must never auto-join until their package is explicitly verified.
BLOCKED_SOURCE_ID_PREFIXES = ("congress_",)
# Cross-category duplicates retired to a single Hub heading (Bible §2.1).
# Same-institution burs_* + egitim_* pairs and pubmed_biomedical_evidence stay.
BLOCKED_SOURCE_IDS = frozenset(
    {
        "congress_registry",
        "congress_pack",
        "ema_news",
        "fierce_biotech",
        "medpage_today",
        "medical_xpress",
        "stat_news",
        "saglik_bakanligi_genel",
    }
)
BLOCKED_TIERS_WITHOUT_VERIFIED_SURFACE = frozenset()  # never tier-alone


def _plan(profile: dict[str, Any]) -> dict[str, Any]:
    return profile.get("fetch_plan") or {}


def _truthy_flag(profile: dict[str, Any], key: str) -> bool:
    plan = _plan(profile)
    if profile.get(key) is True:
        return True
    if plan.get(key) is True:
        return True
    return False


def _source_health(profile: dict[str, Any]) -> str:
    plan = _plan(profile)
    return str(plan.get("source_health") or profile.get("source_health") or "UNKNOWN")


def _primary_method(profile: dict[str, Any]) -> str:
    plan = _plan(profile)
    return str(
        plan.get("primary_method")
        or profile.get("fetch_mode")
        or ""
    ).strip()


def _has_tls_host_path_rules(profile: dict[str, Any]) -> bool:
    plan = _plan(profile)
    if plan.get("tls_verification_required") is not True:
        return False
    hosts = plan.get("allowed_hostnames") or []
    paths = plan.get("allowed_path_patterns") or []
    return bool(hosts) and bool(paths)


def _has_policy_gate(profile: dict[str, Any]) -> bool:
    # Keyword gate or explicit policy module support
    if profile.get("include_keywords") or profile.get("exclude_keywords"):
        return True
    if profile.get("policy_ref") or profile.get("source_policy_applied"):
        return True
    return False


def _explicit_activation(profile: dict[str, Any]) -> str | None:
    raw = (profile.get("runtime_activation") or "").strip().upper()
    if raw in ACTIVATION_STATES:
        return raw
    return None


def _is_blocked_identity(profile: dict[str, Any]) -> bool:
    sid = profile.get("source_id") or ""
    if sid in BLOCKED_SOURCE_IDS:
        return True
    if (profile.get("status") or "").strip().lower() == "retired":
        return True
    if any(sid.startswith(p) for p in BLOCKED_SOURCE_ID_PREFIXES):
        return True
    if (profile.get("content_family") or "").lower() == "congress":
        return True
    if profile.get("handoff_target") == "CONGRESS_REGISTRY" and not _truthy_flag(
        profile, "pipeline_wiring_enabled"
    ):
        # Opportunity pack congress handoff — disconnected
        if "congress" in sid.lower():
            return True
    return False


def automation_ready_gates(profile: dict[str, Any]) -> tuple[bool, list[str]]:
    """All gates required for AUTOMATION_READY. Never infer from tier alone."""
    failures: list[str] = []
    if not _truthy_flag(profile, "fetch_enabled"):
        failures.append("fetch_enabled=false")
    if not _truthy_flag(profile, "scheduled_fetch_enabled"):
        failures.append("scheduled_fetch_enabled=false")
    if not _truthy_flag(profile, "candidate_emission_enabled"):
        failures.append("candidate_emission_enabled=false")
    if not _truthy_flag(profile, "pipeline_wiring_enabled"):
        failures.append("pipeline_wiring_enabled=false")
    method = _primary_method(profile)
    if method not in VERIFIED_FETCH_METHODS:
        failures.append(f"unverified_fetch_method:{method or 'missing'}")
    if not _has_tls_host_path_rules(profile):
        failures.append("missing_tls_host_path_rules")
    if _source_health(profile) == "MANUAL_REVIEW_REQUIRED":
        failures.append("MANUAL_REVIEW_REQUIRED")
    if not _has_policy_gate(profile):
        failures.append("missing_policy_gate")
    if profile.get("publication_eligible") is True:
        # Safety: continuous runner never publishes; flag must stay false
        failures.append("publication_eligible_must_be_false")
    if method == "eutilities_api":
        pack = profile.get("approved_query_pack") or []
        if not isinstance(pack, list) or not pack:
            failures.append("approved_query_pack_required")
        else:
            for q in pack:
                term = str((q or {}).get("term") or "").strip()
                qid = str((q or {}).get("id") or "").strip()
                if not qid or not term or term == "*" or len(term) < 12:
                    failures.append("approved_query_pack_invalid_or_unrestricted")
                    break
        if profile.get("reject_unrestricted_search") is not True:
            failures.append("reject_unrestricted_search_required")
    return (len(failures) == 0, failures)


def compute_activation_state(profile: dict[str, Any]) -> str:
    """Compute activation for one effective registry profile."""
    if _is_blocked_identity(profile):
        return ACTIVATION_BLOCKED

    explicit = _explicit_activation(profile)
    ok, _failures = automation_ready_gates(profile)

    if explicit == ACTIVATION_BLOCKED:
        return ACTIVATION_BLOCKED

    if explicit == ACTIVATION_AUTOMATION_READY:
        # Never honour forced AUTOMATION_READY if gates fail
        return ACTIVATION_AUTOMATION_READY if ok else ACTIVATION_MANUAL_INTAKE

    if ok:
        return ACTIVATION_AUTOMATION_READY

    if explicit == ACTIVATION_MANUAL_INTAKE:
        return ACTIVATION_MANUAL_INTAKE

    # Default: valuable but not automation-ready
    return ACTIVATION_MANUAL_INTAKE


def check_interval_minutes(profile: dict[str, Any]) -> int:
    """Cadence (minutes) a source is expected to be re-checked at; default daily."""
    return int(_plan(profile).get("expected_check_interval_minutes") or 1440)


def is_due_for_fetch(
    profile: dict[str, Any],
    *,
    last_success_at: str | None,
    now_iso: str | None = None,
) -> bool:
    """Respect per-source expected_check_interval_minutes."""
    from datetime import datetime, timedelta, timezone

    plan = _plan(profile)
    interval = int(plan.get("expected_check_interval_minutes") or 1440)
    if not last_success_at:
        return True
    now = datetime.now(timezone.utc)
    if now_iso:
        now = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
    try:
        last = datetime.fromisoformat(last_success_at.replace("Z", "+00:00"))
    except ValueError:
        return True
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return now >= last + timedelta(minutes=interval)


def all_sources(effective: dict[str, Any]) -> list[dict[str, Any]]:
    """Primary registry sources plus secondary (newswire) sources."""
    return list(effective.get("sources") or []) + list(effective.get("secondary_sources") or [])


def select_automation_ready_due(
    effective: dict[str, Any],
    *,
    last_success_by_source: dict[str, str | None] | None = None,
    now_iso: str | None = None,
    force_due: bool = False,
) -> list[dict[str, Any]]:
    """Profiles that are AUTOMATION_READY and due (interval-aware)."""
    last_success_by_source = last_success_by_source or {}
    out: list[dict[str, Any]] = []
    for src in all_sources(effective):
        if compute_activation_state(src) != ACTIVATION_AUTOMATION_READY:
            continue
        sid = src["source_id"]
        if force_due or is_due_for_fetch(
            src, last_success_at=last_success_by_source.get(sid), now_iso=now_iso
        ):
            out.append(src)
    return out


def activation_report(effective: dict[str, Any]) -> dict[str, Any]:
    """Group every registered source by activation state (incl. secondaries)."""
    groups: dict[str, list[dict[str, Any]]] = {
        ACTIVATION_AUTOMATION_READY: [],
        ACTIVATION_MANUAL_INTAKE: [],
        ACTIVATION_BLOCKED: [],
    }
    for src in list(effective.get("sources") or []) + list(
        effective.get("secondary_sources") or []
    ):
        state = compute_activation_state(src)
        ok, failures = automation_ready_gates(src)
        groups[state].append(
            {
                "source_id": src.get("source_id"),
                "source_tier": src.get("source_tier"),
                "runtime_activation": src.get("runtime_activation"),
                "computed": state,
                "gates_ok": ok,
                "gate_failures": failures,
                "interval_minutes": (_plan(src).get("expected_check_interval_minutes")),
                "source_health": _source_health(src),
            }
        )
    return {
        "counts": {k: len(v) for k, v in groups.items()},
        "groups": groups,
        "live_eligible_phase1": sorted(PHASE1_LIVE_ELIGIBLE_SOURCE_IDS),
    }
