"""Bible v4 Source Pass/Fail & Pipeline Loop (Kitap II / source-pass-fail-v1).

Editorial decision, ingestion mode, and lifecycle are independent.
Technical fetch problems are not SOURCE FAIL. Soft score never produces FAIL.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

BIBLE_VERSION = "4.0"
RULESET_VERSION = "source-pass-fail-v1"
SCHEMA_VERSION = "spf-1.0.0"

PRIMARY_CATEGORIES = ("haber", "research", "duyuru", "burs", "egitim")
ENGAGEMENT_CATEGORIES = frozenset({"haber", "research"})
UTILITY_CATEGORIES = frozenset({"duyuru", "burs", "egitim"})

EDITORIAL_DECISIONS = ("PASS", "CONDITIONAL", "WATCH", "FAIL")
ITEM_DECISIONS = ("PASS", "HOLD", "HUMAN_REVIEW", "REJECT")
SOURCE_ROLES = ("discovery", "verification", "both")
INGESTION_MODES = (
    "AUTO_API",
    "AUTO_RSS",
    "AUTO_ATOM",
    "AUTO_SITEMAP",
    "AUTO_HTML",
    "MANUAL_ONLY",
    "BLOCKED",
)
LIFECYCLE_STATUSES = (
    "candidate",
    "verified",
    "active",
    "degraded",
    "manual_only",
    "paused",
    "retired",
    "denylisted",
)
HEALTH_STATUSES = ("healthy", "warning", "unhealthy", "unknown")

HARD_FAIL_CODES = (
    "PUBLISHER_UNVERIFIABLE",
    "SPAM_LINK_FARM",
    "TOPIC_IRRELEVANT",
    "SYSTEMATIC_CONTENT_THEFT",
    "UNSAFE_OR_UNETHICAL_ACCESS",
    "MALICIOUS_PII",
    "CANONICAL_DOMAIN_UNRESOLVABLE",
    "ILLEGAL_ACCESS_REQUIRED",
)

# Technical / access issues — never SOURCE FAIL by themselves (SPF-6).
TECHNICAL_NOT_HARD_FAIL = frozenset(
    {
        "403",
        "429",
        "timeout",
        "5xx",
        "500",
        "502",
        "503",
        "504",
        "captcha",
        "no_rss",
        "no_api",
        "javascript_required",
        "high_latency",
        "parse_error",
        "cadence_drop",
        "html_scrape_failed",
        "empty_content",
        "robots_disallow",
        "tos_restrict",
        "login_required",
        "etag_miss",
    }
)

SCORE_A = {
    "authority": 20,
    "topic_audience_relevance": 20,
    "technical_health": 15,
    "freshness_cadence": 10,
    "engagement_potential": 25,
    "data_quality_provenance": 10,
}
SCORE_B = {
    "authority_official": 20,
    "turkey_audience_fit": 25,
    "actionability": 20,
    "freshness_deadline": 15,
    "technical_health": 10,
    "data_quality_verifiability": 10,
}

_ROOT = Path(__file__).resolve().parents[1]
_CONFIG_PATH = _ROOT / "content" / "config" / "bible-config.json"

_DEFAULT_BANDS = (
    (85, 100, "PASS", "HIGH_PRIORITY"),
    (70, 84, "PASS", None),
    (55, 69, "CONDITIONAL", None),
    (0, 54, "WATCH", None),
)


def load_bible_config(path: Path | None = None) -> dict[str, Any]:
    p = path or _CONFIG_PATH
    return json.loads(p.read_text(encoding="utf-8"))


def evaluation_track(category: str) -> str:
    cat = str(category or "").strip().lower()
    if cat in ENGAGEMENT_CATEGORIES:
        return "ENGAGEMENT"
    if cat in UTILITY_CATEGORIES:
        return "PRAGMATIC_UTILITY"
    raise ValueError(f"unknown_category:{category}")


def turkey_eligibility_applicable(category: str) -> bool:
    """Haber/Research: N/A. Duyuru/Burs/Eğitim: applicable."""
    return evaluation_track(category) == "PRAGMATIC_UTILITY"


def turkey_engagement_applicable(category: str) -> bool:
    return evaluation_track(category) == "ENGAGEMENT"


def score_weights(category: str) -> dict[str, int]:
    return dict(SCORE_A if turkey_engagement_applicable(category) else SCORE_B)


def is_technical_issue(code: str | None) -> bool:
    token = str(code or "").strip().lower()
    if not token:
        return False
    if token in TECHNICAL_NOT_HARD_FAIL:
        return True
    if token.isdigit() and token.startswith("5"):
        return True
    return False


def is_hard_fail_code(code: str | None) -> bool:
    token = str(code or "").strip().upper()
    return token in HARD_FAIL_CODES


def normalize_score(earned: float, maximum_applicable: float) -> float:
    if maximum_applicable <= 0:
        return 0.0
    return round((earned / maximum_applicable) * 100.0, 2)


def editorial_from_normalized_score(
    normalized: float,
    *,
    hard_fail: bool,
    bands: tuple[tuple[int, int, str, str | None], ...] | None = None,
) -> str:
    if hard_fail:
        return "FAIL"
    table = bands or _DEFAULT_BANDS
    score = float(normalized)
    for low, high, decision, _priority in table:
        if low <= score <= high:
            return decision
    return "WATCH"


def ingestion_mode_from_capabilities(
    *,
    api: bool = False,
    rss: bool = False,
    atom: bool = False,
    sitemap: bool = False,
    json_ld: bool = False,
    stable_html: bool = False,
    robots_allow: bool = True,
    tos_allow: bool = True,
    login_required: bool = False,
    captcha: bool = False,
    javascript_required: bool = False,
    http_status: int | None = None,
) -> str:
    blocked_status = http_status in {401, 403} or captcha or login_required
    if not robots_allow or not tos_allow or blocked_status:
        return "MANUAL_ONLY"
    if api:
        return "AUTO_API"
    if rss:
        return "AUTO_RSS"
    if atom:
        return "AUTO_ATOM"
    if sitemap:
        return "AUTO_SITEMAP"
    if json_ld or (stable_html and not javascript_required):
        return "AUTO_HTML"
    if stable_html:
        return "MANUAL_ONLY"
    return "MANUAL_ONLY"


def health_status_from_rates(
    *,
    success_rate: float | None = None,
    error_rate: float | None = None,
    parse_error_rate: float | None = None,
    empty_content_rate: float | None = None,
    http_status: int | None = None,
) -> str:
    if success_rate is None and error_rate is None and http_status is None:
        return "unknown"
    if http_status in {401, 403, 429} or (error_rate is not None and error_rate >= 0.4):
        return "unhealthy"
    if http_status is not None and 500 <= http_status <= 599:
        return "unhealthy"
    if (
        (error_rate is not None and error_rate >= 0.15)
        or (parse_error_rate is not None and parse_error_rate >= 0.15)
        or (empty_content_rate is not None and empty_content_rate >= 0.3)
        or (success_rate is not None and success_rate < 0.85)
    ):
        return "warning"
    return "healthy"


def lifecycle_from_health(
    health: str,
    *,
    editorial: str,
    ingestion_mode: str,
    hard_fail: bool,
) -> str:
    if hard_fail or editorial == "FAIL":
        return "denylisted"
    if ingestion_mode == "BLOCKED":
        return "paused"
    if ingestion_mode == "MANUAL_ONLY":
        return "manual_only"
    if health == "unhealthy":
        return "degraded"
    if health == "warning":
        return "degraded"
    if editorial == "WATCH":
        return "paused"
    if editorial == "CONDITIONAL":
        return "verified"
    if editorial == "PASS":
        return "active"
    return "candidate"


def backoff_strategy(health: str, http_status: int | None = None) -> str:
    if http_status == 429 or http_status == 403:
        return "reduce_rate_honor_retry_after"
    if http_status is not None and 500 <= http_status <= 599:
        return "exponential_backoff"
    if health == "unhealthy":
        return "exponential_backoff_then_manual_only"
    if health == "warning":
        return "reduce_frequency"
    return "none"


def _score_confidence(observation_count: int, data_completeness: float) -> str:
    if observation_count >= 8 and data_completeness >= 0.8:
        return "high"
    if observation_count >= 3 and data_completeness >= 0.5:
        return "medium"
    return "low"


def evaluate_source(
    *,
    source_id: str,
    category: str,
    url: str = "",
    publisher: str = "",
    topic: str = "",
    source_role: str = "discovery",
    hard_fail_reasons: list[str] | None = None,
    soft_breakdown: Mapping[str, float] | None = None,
    technical_codes: list[str] | None = None,
    http_status: int | None = None,
    success_rate: float | None = None,
    error_rate: float | None = None,
    parse_error_rate: float | None = None,
    empty_content_rate: float | None = None,
    api: bool = False,
    rss: bool = False,
    atom: bool = False,
    sitemap: bool = False,
    json_ld: bool = False,
    stable_html: bool = False,
    robots_allow: bool = True,
    tos_allow: bool = True,
    login_required: bool = False,
    captcha: bool = False,
    javascript_required: bool = False,
    observation_count: int = 0,
    observation_window: str = "",
    data_completeness: float = 0.0,
    previous_decision: str | None = None,
    item_reject_count: int = 0,
    review_trigger: list[str] | None = None,
    notes: str = "",
) -> dict[str, Any]:
    cat = str(category).strip().lower()
    track = evaluation_track(cat)
    role = source_role if source_role in SOURCE_ROLES else "discovery"
    reasons = [r for r in (hard_fail_reasons or []) if is_hard_fail_code(r)]
    tech = [c for c in (technical_codes or []) if is_technical_issue(c)]
    if http_status is not None:
        token = str(http_status)
        if is_technical_issue(token) and token not in tech:
            tech.append(token)

    hard_fail = bool(reasons)
    weights = score_weights(cat)
    breakdown = dict(soft_breakdown or {})
    earned = 0.0
    maximum = 0.0
    applied: dict[str, float] = {}
    for key, cap in weights.items():
        if key not in breakdown:
            continue
        raw = breakdown[key]
        if raw is None:
            continue
        value = max(0.0, min(float(raw), float(cap)))
        applied[key] = value
        earned += value
        maximum += float(cap)

    normalized = normalize_score(earned, maximum) if maximum else 0.0
    editorial = editorial_from_normalized_score(normalized, hard_fail=hard_fail)
    if hard_fail:
        editorial = "FAIL"

    ingest = ingestion_mode_from_capabilities(
        api=api,
        rss=rss,
        atom=atom,
        sitemap=sitemap,
        json_ld=json_ld,
        stable_html=stable_html,
        robots_allow=robots_allow,
        tos_allow=tos_allow,
        login_required=login_required,
        captcha=captcha or "captcha" in {c.lower() for c in tech},
        javascript_required=javascript_required,
        http_status=http_status,
    )
    if hard_fail:
        ingest = "BLOCKED"

    health = health_status_from_rates(
        success_rate=success_rate,
        error_rate=error_rate,
        parse_error_rate=parse_error_rate,
        empty_content_rate=empty_content_rate,
        http_status=http_status,
    )
    life = lifecycle_from_health(health, editorial=editorial, ingestion_mode=ingest, hard_fail=hard_fail)

    warnings: list[str] = []
    if tech:
        warnings.append("technical_issue_not_source_fail:" + ",".join(tech))
    if item_reject_count:
        warnings.append(f"item_rejects_do_not_source_fail:{item_reject_count}")
    if previous_decision and previous_decision != editorial:
        warnings.append(f"decision_changed:{previous_decision}->{editorial}")
    if editorial == "PASS" and ingest == "MANUAL_ONLY":
        warnings.append("editorial_pass_ingestion_manual_only")

    reason_codes: list[str] = []
    if hard_fail:
        reason_codes.extend(reasons)
    else:
        reason_codes.append(f"EDITORIAL_{editorial}")
        if tech:
            reason_codes.append("TECHNICAL_NOT_HARD_FAIL")
        if item_reject_count:
            reason_codes.append("ITEM_REJECT_ISOLATED")

    engagement_applicable = turkey_engagement_applicable(cat)
    utility_applicable = turkey_eligibility_applicable(cat)

    envelope = {
        "source_id": source_id,
        "decision_scope": "source_category",
        "category": cat,
        "evaluation_track": track,
        "url": url,
        "canonical_url": url,
        "publisher": publisher,
        "topic": topic,
        "target_audience": [],
        "source_role": role,
        "hard_fail": hard_fail,
        "hard_fail_reasons": reasons,
        "soft_breakdown": applied,
        "maximum_applicable_score": maximum,
        "earned_score": earned,
        "normalized_score": normalized,
        "score_confidence": _score_confidence(observation_count, data_completeness),
        "data_completeness": data_completeness,
        "observation_count": observation_count,
        "observation_window": observation_window,
        "editorial_decision": editorial,
        "item_decision": None,
        "ingestion_mode": ingest,
        "lifecycle_status": life,
        "turkey_engagement": {
            "applicable": engagement_applicable,
            "level": None,
            "reasons": [] if engagement_applicable else ["N/A_for_pragmatic_utility_track"],
        },
        "pragmatic_utility": {
            "applicable": utility_applicable,
            "target_user_can_benefit": None,
            "actionable": None,
            "deadline_valid": None,
            "official_application": None,
            "reasons": [] if utility_applicable else ["N/A_for_engagement_track"],
        },
        "application_eligibility": None if not utility_applicable else "UNKNOWN",
        "credential_recognition": None if not utility_applicable else "UNKNOWN",
        "practice_rights": None if not utility_applicable else "UNKNOWN",
        "decision_reason": (
            "hard_fail" if hard_fail else f"soft_score_{editorial.lower()}_track_{track.lower()}"
        ),
        "reason_codes": reason_codes,
        "recommended_fetch_interval": "",
        "backoff_strategy": backoff_strategy(health, http_status),
        "health_status": health,
        "next_action": _next_action(editorial, ingest, health, hard_fail),
        "review_after": "",
        "review_trigger": list(review_trigger or []),
        "bible_version": BIBLE_VERSION,
        "ruleset_version": RULESET_VERSION,
        "schema_version": SCHEMA_VERSION,
        "human_review_required": editorial in {"CONDITIONAL", "WATCH"} or ingest == "MANUAL_ONLY",
        "human_override": None,
        "evidence": [],
        "warnings": warnings,
        "notes": notes,
        "previous_decision": previous_decision,
        "processed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    return envelope


def evaluate_item(
    *,
    source_id: str,
    category: str,
    item_id: str = "",
    url: str = "",
    turkey_citizen_allowed: str | None = None,
    turkey_based_applicant_allowed: str | None = None,
    deadline_valid: bool | None = None,
    expired: bool = False,
    can_participate_from_turkey: bool | None = None,
    evidence_gate_failed: bool = False,
    canonical_missing: bool = False,
    source_editorial: str = "PASS",
) -> dict[str, Any]:
    cat = str(category).strip().lower()
    track = evaluation_track(cat)
    item_decision = "PASS"
    reasons: list[str] = []
    warnings: list[str] = []

    if canonical_missing:
        item_decision = "HOLD"
        reasons.append("CANONICAL_URL_MISSING")
    if evidence_gate_failed and cat == "research":
        item_decision = "REJECT"
        reasons.append("EVIDENCE_GATE_FAIL")

    if track == "PRAGMATIC_UTILITY":
        if cat == "burs":
            if turkey_citizen_allowed == "NO" and turkey_based_applicant_allowed == "NO":
                item_decision = "REJECT"
                reasons.append("TURKISH_APPLICANT_INELIGIBLE")
            elif turkey_citizen_allowed in {None, "UNKNOWN"} or turkey_based_applicant_allowed in {None, "UNKNOWN"}:
                item_decision = "HOLD" if item_decision == "PASS" else item_decision
                reasons.append("ELIGIBILITY_UNKNOWN_FAIL_CLOSED")
                warnings.append("UNKNOWN_is_not_NO")
        if cat == "egitim" and can_participate_from_turkey is False:
            item_decision = "REJECT"
            reasons.append("CANNOT_PARTICIPATE_FROM_TURKEY")
        if cat == "duyuru" and (expired or deadline_valid is False):
            item_decision = "REJECT"
            reasons.append("DEADLINE_EXPIRED_OR_UNACTIONABLE")

    return {
        "source_id": source_id,
        "item_id": item_id,
        "decision_scope": "item",
        "category": cat,
        "evaluation_track": track,
        "url": url,
        "item_decision": item_decision,
        "editorial_decision": source_editorial if source_editorial != "FAIL" else "FAIL",
        "source_fail_implied": False,
        "reason_codes": reasons,
        "warnings": warnings,
        "bible_version": BIBLE_VERSION,
        "ruleset_version": RULESET_VERSION,
        "schema_version": SCHEMA_VERSION,
        "notes": "ITEM REJECT does not SOURCE FAIL",
    }


def _next_action(editorial: str, ingest: str, health: str, hard_fail: bool) -> str:
    if hard_fail:
        return "denylist_and_stop"
    if health == "unhealthy":
        return "backoff_then_degraded_or_manual_only"
    if ingest == "MANUAL_ONLY" and editorial in {"PASS", "CONDITIONAL"}:
        return "keep_editorial_use_manual_intake"
    if editorial == "WATCH":
        return "observe_do_not_auto_ingest"
    if editorial == "CONDITIONAL":
        return "controlled_ingest_with_verification"
    return "schedule_fetch"


def revalidation_triggers() -> tuple[str, ...]:
    return (
        "domain_change",
        "publisher_change",
        "ownership_change",
        "rss_api_loss",
        "robots_change",
        "tos_change",
        "parser_break",
        "health_drop",
        "redirect_change",
        "canonical_change",
        "cadence_change",
        "retraction_correction",
        "security_issue",
    )
