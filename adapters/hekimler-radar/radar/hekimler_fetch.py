"""Hekimler fetch integrity — Phase 1 hardened plans + secondary AA radar.

TLS verification is always required for this registry path.
Never uses verify=False / CERT_NONE / insecure allowlists.

Congress terms in this module are a DISCARD gate only.
There is no active congress source, schedule, CONGRESS_CALENDAR route,
event ranking, or commercial placement. Feature remains unreachable from
any live pipeline (pipeline_wiring_enabled / congress_features_active = false).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from .hekimler_registry import (
    PHASE1_ROUTES,
    RegistryDecision,
    _fold,
    _keyword_hit,
    classify_item,
    get_source_profile,
    load_phase1_registry,
)

SOURCE_HEALTH = frozenset(
    {"HEALTHY", "NO_CHANGE", "DEGRADED", "MANUAL_REVIEW_REQUIRED", "DISABLED"}
)

CONGRESS_TERMS = (
    "kongre",
    "congress",
    "sempozyum",
    "symposium",
    "abstract",
    "bildiri özeti",
    "erken kayıt",
    "registration fee",
    "sponsorship",
    "sponsor",
    "exhibition",
    "fuar stand",
    "kongre program",
)


@dataclass
class FetchRunLog:
    source_id: str
    fetch_surface: str
    requested_url: str
    fetched_at: str
    http_status: int | None
    tls_verification_result: str
    parser_version: str
    parsed_item_count: int
    accepted_candidate_count: int
    discarded_candidate_count: int
    content_hash: str | None
    failure_reason: str | None
    source_health: str
    next_expected_check_at: str | None = None
    alert: str | None = None


@dataclass
class FetchOutcome:
    source_health: str
    reason: str
    log: FetchRunLog
    allow_queue: bool = False


def _utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def assert_tls_required(plan: dict[str, Any]) -> None:
    if plan.get("tls_verification_required") is not True:
        raise ValueError("tls_verification_required must be true for Hekimler fetch plans")


def url_allowed_by_plan(url: str, plan: dict[str, Any]) -> tuple[bool, str]:
    """Hostname + path gate. Rejects anything outside approved patterns."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    path = parsed.path or "/"
    allowed_hosts = {h.lower() for h in plan.get("allowed_hostnames") or []}
    if host not in allowed_hosts:
        return False, f"host not allowed: {host}"
    patterns = plan.get("allowed_path_patterns") or ["/"]
    if not any(path.startswith(p) or p == "/" for p in patterns):
        # also allow exact prefix match when pattern includes query-less roots
        ok = False
        for p in patterns:
            if p in path or path.startswith(p.rstrip("*")):
                ok = True
                break
        if not ok:
            return False, f"path not allowed: {path}"
    for banned in plan.get("forbidden_paths") or []:
        if banned == "/":
            continue
        if path == banned or path.startswith(banned):
            # health listing /tr/saglik must not be blocked by /tr/ prefix if we check carefully
            if banned.rstrip("/") == "/tr" and path.startswith("/tr/saglik"):
                continue
            if path.startswith(banned) and not path.startswith("/tr/saglik"):
                return False, f"path forbidden: {path}"
    return True, "ok"


def evaluate_tls_failure(source_id: str, requested_url: str, surface: str = "primary") -> FetchOutcome:
    """Fail closed: never disable TLS; mark DEGRADED + internal alert."""
    log = FetchRunLog(
        source_id=source_id,
        fetch_surface=surface,
        requested_url=requested_url,
        fetched_at=_utcnow(),
        http_status=None,
        tls_verification_result="FAILED",
        parser_version="hekimler_fetch/1.0",
        parsed_item_count=0,
        accepted_candidate_count=0,
        discarded_candidate_count=0,
        content_hash=None,
        failure_reason="TLS certificate validation failed — fail closed (insecure transport forbidden)",
        source_health="DEGRADED",
        alert="TLS_FAILURE",
    )
    return FetchOutcome(
        source_health="DEGRADED",
        reason=log.failure_reason or "tls_failed",
        log=log,
        allow_queue=False,
    )


def evaluate_fetch_result(
    *,
    source_id: str,
    surface: str,
    requested_url: str,
    http_status: int,
    tls_ok: bool,
    parsed_item_count: int,
    accepted_candidate_count: int,
    discarded_candidate_count: int,
    content_hash: str | None,
    previous_content_hash: str | None,
    parser_failed: bool,
    parser_version: str = "hekimler_fetch/1.0",
) -> FetchOutcome:
    if not tls_ok:
        return evaluate_tls_failure(source_id, requested_url, surface)

    if http_status >= 400:
        log = FetchRunLog(
            source_id=source_id,
            fetch_surface=surface,
            requested_url=requested_url,
            fetched_at=_utcnow(),
            http_status=http_status,
            tls_verification_result="OK",
            parser_version=parser_version,
            parsed_item_count=0,
            accepted_candidate_count=0,
            discarded_candidate_count=0,
            content_hash=content_hash,
            failure_reason=f"HTTP {http_status}",
            source_health="DEGRADED",
            alert="HTTP_FAILURE",
        )
        return FetchOutcome("DEGRADED", log.failure_reason or "http", log, False)

    if parser_failed:
        log = FetchRunLog(
            source_id=source_id,
            fetch_surface=surface,
            requested_url=requested_url,
            fetched_at=_utcnow(),
            http_status=http_status,
            tls_verification_result="OK",
            parser_version=parser_version,
            parsed_item_count=0,
            accepted_candidate_count=0,
            discarded_candidate_count=0,
            content_hash=content_hash,
            failure_reason="parser failure or changed page structure",
            source_health="DEGRADED",
            alert="PARSER_FAILURE",
        )
        return FetchOutcome("DEGRADED", log.failure_reason or "parser", log, False)

    # HTTP 200 with zero parsed items after successful parse → NO_CHANGE (not DEGRADED)
    if parsed_item_count == 0 and not parser_failed:
        health = "NO_CHANGE"
        reason = "successful fetch; zero new items"
        if previous_content_hash and content_hash and previous_content_hash == content_hash:
            reason = "content hash unchanged"
        log = FetchRunLog(
            source_id=source_id,
            fetch_surface=surface,
            requested_url=requested_url,
            fetched_at=_utcnow(),
            http_status=http_status,
            tls_verification_result="OK",
            parser_version=parser_version,
            parsed_item_count=0,
            accepted_candidate_count=0,
            discarded_candidate_count=discarded_candidate_count,
            content_hash=content_hash,
            failure_reason=None,
            source_health=health,
        )
        return FetchOutcome(health, reason, log, False)

    log = FetchRunLog(
        source_id=source_id,
        fetch_surface=surface,
        requested_url=requested_url,
        fetched_at=_utcnow(),
        http_status=http_status,
        tls_verification_result="OK",
        parser_version=parser_version,
        parsed_item_count=parsed_item_count,
        accepted_candidate_count=accepted_candidate_count,
        discarded_candidate_count=discarded_candidate_count,
        content_hash=content_hash,
        failure_reason=None,
        source_health="HEALTHY",
    )
    return FetchOutcome("HEALTHY", "ok", log, accepted_candidate_count > 0)


def is_congress_content(title: str, body: str = "") -> bool:
    blob = f"{title}\n{body}"
    return any(_keyword_hit(blob, t) for t in CONGRESS_TERMS)


def classify_with_congress_gate(
    profile: dict[str, Any],
    *,
    title: str,
    body: str = "",
    medical_impact_clear: bool | None = None,
) -> RegistryDecision:
    if not profile.get("allow_congress") and is_congress_content(title, body):
        return RegistryDecision(
            source_id=profile["source_id"],
            decision="DISCARD",
            route="DISCARD",
            evidence_status="insufficient",
            matched_include=[],
            matched_exclude=["congress"],
            reason="congress/symposium/registration content excluded from Phase 1 / v1.1 non-congress registry",
            primary_url=profile.get("primary_url") or "",
            source_url=profile.get("source_url") or "",
            virality_must_not_penalize=True,
        )
    return classify_item(
        profile,
        title=title,
        body=body,
        medical_impact_clear=medical_impact_clear,
    )


def viral_signal_must_not_downgrade(route: str, viral_signal: int) -> bool:
    """Low viral_signal must never reduce priority for protected routes."""
    protected = {
        "OPPORTUNITY",
        "CAREER",
        "EDUCATION",
        "PROFESSIONAL_BRIEF",
        "PUBLIC_HEALTH",
        "DATA_INSIGHT",
    }
    if route in protected:
        return True  # never downgrade
    return viral_signal >= 3


# --- Anadolu Ajansı secondary radar ---

AA_ACCEPT_FAMILIES = (
    "TUS",
    "YDUS",
    "STS",
    "tıp fakültesi",
    "uzmanlık",
    "asistan",
    "hekim atama",
    "DHY",
    "kura",
    "aşı",
    "salgın",
    "tarama",
    "halk sağlığı",
    "YÖK",
    "TUK",
    "yönetmelik",
    "klinik araştırma",
    "tıbbi AI",
)

AA_DISCARD = (
    "mucize",
    "şifa",
    "iyileşti",
    "hastane açılış",
    "yatak kapasite",
    "medikal turizm",
    "diyet",
    "zayıflama",
    "ünlü",
    "magazin",
    "farkındalık günü",
    "kongre",
    "sempozyum",
    "sponsor",
)


@dataclass
class AACandidate:
    route: str
    evidence_status: str
    publication_eligible: bool
    decision: str
    reason: str
    discovery_url: str
    primary_url: str | None = None
    statement_treatment: str = "reported_news"
    auto_publish: bool = False


def aa_path_allowed(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if host not in {"www.aa.com.tr", "aa.com.tr"}:
        return False
    path = (parsed.path or "").rstrip("/")
    return path == "/tr/saglik" or path.startswith("/tr/saglik/")


def classify_anadolu_ajansi(
    *,
    title: str,
    url: str,
    body: str = "",
    primary_url: str | None = None,
    primary_supports_claim: bool | None = None,
    official_already_in_queue: bool = False,
) -> AACandidate:
    if not aa_path_allowed(url):
        return AACandidate(
            route="DISCARD",
            evidence_status="insufficient",
            publication_eligible=False,
            decision="DISCARD",
            reason="AA fetch outside /tr/saglik/ forbidden",
            discovery_url=url,
        )

    blob = f"{title}\n{body}"
    if any(_keyword_hit(blob, k) for k in AA_DISCARD):
        return AACandidate(
            route="DISCARD",
            evidence_status="insufficient",
            publication_eligible=False,
            decision="DISCARD",
            reason="AA discard gate (wellness/hospital PR/miracle/congress/etc.)",
            discovery_url=url,
        )

    if not any(_keyword_hit(blob, k) for k in AA_ACCEPT_FAMILIES):
        return AACandidate(
            route="DISCARD",
            evidence_status="insufficient",
            publication_eligible=False,
            decision="DISCARD",
            reason="AA topic not in medical accept families",
            discovery_url=url,
        )

    if official_already_in_queue and primary_url:
        return AACandidate(
            route="NEEDS_REVIEW",
            evidence_status="verified",
            publication_eligible=False,
            decision="MERGE",
            reason="official source wins; retain AA as discovery_url only",
            discovery_url=url,
            primary_url=primary_url,
        )

    # Always enter review first; never auto-publish
    if not primary_url or primary_supports_claim is not True:
        return AACandidate(
            route="NEEDS_REVIEW",
            evidence_status="needs_primary_check",
            publication_eligible=False,
            decision="NEEDS_REVIEW",
            reason="AA discovery only — primary source required before any publish route",
            discovery_url=url,
            primary_url=primary_url,
        )

    # Primary attached and supports claim — still review, still not auto-publish
    return AACandidate(
        route="NEEDS_REVIEW",
        evidence_status="needs_primary_check",
        publication_eligible=False,
        decision="NEEDS_REVIEW",
        reason="primary attached but editorial review mandatory; AA never auto-publishes",
        discovery_url=url,
        primary_url=primary_url,
    )


def load_secondary_sources(registry: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    reg = registry or load_phase1_registry()
    return list(reg.get("secondary_sources") or [])
